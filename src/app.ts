/**
 * The site itself: a handful of routes over the Fetch API, so that the same
 * code runs on Cloudflare Workers (`worker.ts`) and on Node (`node.ts`).
 *
 * It keeps no database. Between the moment a person leaves for the brig·id
 * server and their return, and afterwards to show what was received, it
 * writes signed cookies in their browser.
 */
import {
  BROWSER_DOCUMENT,
  browserDocument,
  loadClientKey,
  SERVER_DOCUMENT,
  serverDocument,
} from "./client.ts";
import {
  begin,
  type Claims,
  finish,
  issuerFrom,
  type Scope,
  SCOPES,
  SignInError,
  type Transaction,
} from "./oidc.ts";
import * as pages from "./pages.ts";
import { seal, unseal } from "./seal.ts";

export interface Env {
  /** The brig·id server offered first; a visitor can name another. */
  ISSUER?: string;
  /** The site's private key (a P-256 JWK): it signs to prove who the site
   * is; its public half is in the document the site publishes. */
  CLIENT_KEY?: string;
  /** Signs this site's own cookies. */
  SESSION_SECRET?: string;
  /**
   * Only for a server on this machine, during development: a server reads
   * documents over https only, so there the site is registered by its
   * operator (`seedling client add`), twice. These replace the documents.
   */
  CLIENT_ID?: string;
  CLIENT_SECRET?: string;
  PUBLIC_CLIENT_ID?: string;
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
  /** What the last request asked for, beyond the identifier. */
  asked?: Scope[];
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
  // A visitor may sign in with any server: the browser page calls it, and
  // the sign-in form ends up there. Plain http only for a local server.
  const servers = `https:${issuer?.startsWith("http:") ? ` ${issuer}` : ""}`;
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
      `connect-src ${servers}`,
      // The sign-in form is sent to this site, which sends the browser on to
      // the server: a browser applies this rule to where a form ends up.
      `form-action 'self' ${servers}`,
      "frame-ancestors 'none'",
      "base-uri 'none'",
    ].join("; "),
  );
  return new Response(body, { status, headers });
}

/** A document servers read: public, cacheable for an hour. */
function document(body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
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

  // The server offered first. A visitor names another in the form.
  const issuer = env.ISSUER ? issuerFrom(env.ISSUER) : null;
  const server = issuer ? new URL(issuer).host : "no server yet";
  // Described by its own document; or registered, for a local server.
  const clientId = env.CLIENT_ID ?? `${url.origin}${SERVER_DOCUMENT}`;
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
    // The documents every server reads: this site's registration, published.
    case SERVER_DOCUMENT: {
      const key = await loadClientKey(env.CLIENT_KEY);
      if (!key) return new Response("Not configured\n", { status: 503 });
      return document(serverDocument(url.origin, key));
    }
    case BROWSER_DOCUMENT:
      return document(browserDocument(url.origin));

    case "/": {
      const session = await unseal<Session>(
        jar.get(names.session),
        secret,
        now,
      );
      return html(
        session
          ? pages.signedIn(
              new URL(session.claims.iss).host,
              session.claims,
              session.seen,
              session.asked ?? [],
            )
          : pages.home(server),
        issuer,
      );
    }

    case "/login": {
      const key = await loadClientKey(env.CLIENT_KEY);
      const proof = env.CLIENT_ID ? env.CLIENT_SECRET : key;
      if (!proof || !secret) {
        return html(
          pages.failed(
            server,
            "This demonstration is not set up yet.",
            "The site is online; its key or its cookie secret is missing.",
          ),
          issuer,
          503,
        );
      }
      // The server the visitor named, or the one offered.
      const named = url.searchParams.get("server");
      const chosen = named ? issuerFrom(named) : issuer;
      if (!chosen) {
        return html(
          pages.failed(
            server,
            named
              ? `“${named}” is not the address of a server.`
              : "This demonstration offers no server.",
            "A server is named by its domain, like helm.brig.id.",
          ),
          issuer,
          400,
        );
      }
      try {
        const { url: to, transaction } = await begin(
          {
            issuer: chosen,
            clientId,
            redirectUri: `${url.origin}/callback`,
            fetch: deps.fetch,
          },
          {
            chooseIdentity: url.searchParams.has("choose"),
            // `?ask=email&ask=profile`: what the visitor ticked.
            scopes: SCOPES.filter((scope) =>
              url.searchParams.getAll("ask").includes(scope),
            ),
          },
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
      const key = await loadClientKey(env.CLIENT_KEY);
      const proof = env.CLIENT_ID ? env.CLIENT_SECRET : key;
      if (!proof || !transaction) {
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
        // The answer must come from the server this request went to.
        const claims = await finish(
          {
            issuer: transaction.issuer,
            clientId,
            ...(env.CLIENT_ID
              ? { clientSecret: env.CLIENT_SECRET }
              : key && { clientKey: { key: key.key, kid: key.kid } }),
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
          `${names.session}=${await seal({ claims, seen, asked: transaction.scopes ?? [] } satisfies Session, secret, now + SESSION_SECONDS)}; ${names.attributes}; Max-Age=${SESSION_SECONDS}`,
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
          "client-id":
            env.PUBLIC_CLIENT_ID ?? `${url.origin}${BROWSER_DOCUMENT}`,
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
