/**
 * The site itself: a handful of routes over the Fetch API, so that the same
 * code runs on Cloudflare Workers (`worker.ts`) and on Node (`node.ts`).
 *
 * It keeps no database. Between the moment a person leaves for the brig·id
 * server and their return, and afterwards to show what was received, it
 * writes signed cookies in their browser.
 */
import {
  begin,
  type Claims,
  finish,
  SignInError,
  type Transaction,
} from "./oidc.ts";
import * as pages from "./pages.ts";
import { seal, unseal } from "./seal.ts";

export interface Env {
  /** The brig·id server this site signs in with. */
  ISSUER?: string;
  /** This site as registered there, with a secret… */
  CLIENT_ID?: string;
  CLIENT_SECRET?: string;
  /** …and a second registration without one, for the page that runs in the
   * browser. */
  PUBLIC_CLIENT_ID?: string;
  /** Signs this site's own cookies. */
  SESSION_SECRET?: string;
}

export interface Deps {
  fetch?: typeof fetch;
  /** Unix seconds. */
  now?: () => number;
}

interface Session {
  claims: Claims;
  /** The identifiers this browser presented, oldest first. */
  seen: string[];
}

const TRANSACTION_SECONDS = 10 * 60;
const SESSION_SECONDS = 60 * 60;
const SEEN_AT_MOST = 6;

function cookies(request: Request): Map<string, string> {
  const jar = new Map<string, string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0) jar.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
  }
  return jar;
}

/** Cookie names and attributes. Over https the `__Host-` prefix makes the
 * browser refuse a cookie of that name set by anything but this host. */
function cookieNames(url: URL) {
  const secure = url.protocol === "https:";
  const prefix = secure ? "__Host-" : "";
  return {
    session: `${prefix}demo`,
    transaction: `${prefix}demo_tx`,
    // Lax: the return from the brig·id server is a navigation from another
    // site, and must carry the transaction cookie.
    attributes: `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`,
  };
}

function html(
  body: string,
  issuer: string | null,
  status = 200,
  headers = new Headers(),
) {
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  headers.set(
    "content-security-policy",
    [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "font-src 'self'",
      "img-src 'self'",
      // The page that signs in from the browser calls the server directly.
      `connect-src ${issuer ?? "'none'"}`,
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
    ].join("; "),
  );
  return new Response(body, { status, headers });
}

function redirect(to: string, status: 302 | 303, headers = new Headers()) {
  headers.set("location", to);
  headers.set("cache-control", "no-store");
  return new Response(null, { status, headers });
}

export async function handle(
  request: Request,
  env: Env,
  deps: Deps = {},
): Promise<Response> {
  const url = new URL(request.url);
  const now = deps.now?.() ?? Math.floor(Date.now() / 1000);
  const names = cookieNames(url);
  const jar = cookies(request);

  const issuer = env.ISSUER ? new URL(env.ISSUER).origin : null;
  const server = issuer ? new URL(issuer).host : "no server yet";
  const secret = env.SESSION_SECRET ?? "";
  const expire = (name: string) => `${name}=; ${names.attributes}; Max-Age=0`;

  if (request.method === "POST" && url.pathname === "/logout") {
    const headers = new Headers();
    headers.append("set-cookie", expire(names.session));
    return redirect("/", 303, headers);
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "GET, HEAD" },
    });
  }

  switch (url.pathname) {
    case "/": {
      const session = await unseal<Session>(
        jar.get(names.session),
        secret,
        now,
      );
      return html(
        session
          ? pages.signedIn(server, session.claims, session.seen)
          : pages.home(server),
        issuer,
      );
    }

    case "/login": {
      if (!issuer || !env.CLIENT_ID || !env.CLIENT_SECRET || !secret) {
        return html(
          pages.failed(
            server,
            "This demonstration is not connected to a brig·id server yet.",
            "The site is online, its registration on the server is not done.",
          ),
          issuer,
          503,
        );
      }
      try {
        const { url: to, transaction } = await begin(
          {
            issuer,
            clientId: env.CLIENT_ID,
            redirectUri: `${url.origin}/callback`,
            fetch: deps.fetch,
          },
          { chooseIdentity: url.searchParams.has("choose") },
        );
        const headers = new Headers();
        headers.append(
          "set-cookie",
          `${names.transaction}=${await seal(transaction, secret, now + TRANSACTION_SECONDS)}; ${names.attributes}; Max-Age=${TRANSACTION_SECONDS}`,
        );
        return redirect(to.href, 302, headers);
      } catch (err) {
        return html(
          pages.failed(
            server,
            err instanceof Error ? err.message : "Unexpected error.",
            "",
          ),
          issuer,
          502,
        );
      }
    }

    case "/callback": {
      const headers = new Headers();
      // One answer per request: the transaction is spent whatever happens.
      headers.append("set-cookie", expire(names.transaction));
      const transaction = await unseal<Transaction>(
        jar.get(names.transaction),
        secret,
        now,
      );
      if (!issuer || !env.CLIENT_ID || !env.CLIENT_SECRET || !transaction) {
        return html(
          pages.failed(
            server,
            "This answer matches no request made from this browser.",
            "The request may have expired (ten minutes), or the page was opened twice.",
          ),
          issuer,
          400,
          headers,
        );
      }
      try {
        const claims = await finish(
          {
            issuer,
            clientId: env.CLIENT_ID,
            clientSecret: env.CLIENT_SECRET,
            redirectUri: `${url.origin}/callback`,
            fetch: deps.fetch,
          },
          url,
          transaction,
        );
        const before = await unseal<Session>(
          jar.get(names.session),
          secret,
          now,
        );
        const seen = [
          ...(before?.seen ?? []).filter((sub) => sub !== claims.sub),
          claims.sub,
        ].slice(-SEEN_AT_MOST);
        headers.append(
          "set-cookie",
          `${names.session}=${await seal({ claims, seen } satisfies Session, secret, now + SESSION_SECONDS)}; ${names.attributes}; Max-Age=${SESSION_SECONDS}`,
        );
        // The address with the code is left at once.
        return redirect("/", 303, headers);
      } catch (err) {
        const code =
          err instanceof SignInError && err.code ? `Code: ${err.code}` : "";
        return html(
          pages.failed(
            server,
            err instanceof Error ? err.message : "Unexpected error.",
            code,
          ),
          issuer,
          400,
          headers,
        );
      }
    }

    case "/browser/":
      return html(
        pages.browser(server, {
          issuer: issuer ?? "",
          "client-id": env.PUBLIC_CLIENT_ID ?? "",
        }),
        issuer,
      );

    case "/browser":
      return redirect("/browser/", 302);

    case "/healthz":
      return new Response("ok\n", {
        headers: { "content-type": "text/plain" },
      });

    default:
      return html(pages.notFound(server), issuer, 404);
  }
}
