/**
 * The site against a brig·id server played by the test: its discovery
 * document, its keys, its token endpoint. What a real server does is in
 * `e2e/`; here are the cases a real server never produces on purpose.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Env, handle } from "../src/app.ts";
import { issuerFrom } from "../src/oidc.ts";

const ISSUER = "https://id.example.org";
const SITE = "https://demo.example.org";
const NOW = 1_800_000_000;

const CLIENT_ID = `${SITE}/oauth-client-metadata.json`;

/** The site's key, as `CLIENT_KEY` holds it: a private P-256 JWK. */
const siteKeys = (await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
)) as CryptoKeyPair;
const privateJwk = {
  ...(await crypto.subtle.exportKey("jwk", siteKeys.privateKey)),
  kid: "demo-1",
};

const env: Env = {
  ISSUER,
  CLIENT_KEY: JSON.stringify(privateJwk),
  SESSION_SECRET: "a-secret-for-the-cookies-of-the-tests",
};

const b64 = (data: Uint8Array | string) =>
  Buffer.from(data).toString("base64url");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** A brig·id server reduced to what a site talks to. */
async function server(
  change: {
    claims?: Record<string, unknown>;
    signWith?: CryptoKey;
    /** `scopes_supported`, for a server that publishes it. */
    scopes?: string[];
  } = {},
) {
  const keys = (await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const seen: {
    verifier?: string;
    authorization?: string;
    assertion?: string;
    assertionType?: string;
    nonce?: string;
  } = {};

  const idToken = async (nonce: string) => {
    const header = b64(JSON.stringify({ alg: "EdDSA", kid: "k1", typ: "JWT" }));
    const payload = b64(
      JSON.stringify({
        iss: ISSUER,
        aud: CLIENT_ID,
        sub: "vsid-of-this-identity-for-this-site",
        iat: NOW,
        exp: NOW + 300,
        auth_time: NOW - 10,
        nonce,
        jti: "t1",
        ...change.claims,
      }),
    );
    const signature = await crypto.subtle.sign(
      "Ed25519",
      change.signWith ?? keys.privateKey,
      new TextEncoder().encode(`${header}.${payload}`),
    );
    return `${header}.${payload}.${b64(new Uint8Array(signature))}`;
  };

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    switch (url.pathname) {
      case "/.well-known/openid-configuration":
        return json({
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/authorize`,
          token_endpoint: `${ISSUER}/token`,
          jwks_uri: `${ISSUER}/.well-known/jwks.json`,
          response_types_supported: ["code"],
          subject_types_supported: ["pairwise"],
          id_token_signing_alg_values_supported: ["EdDSA"],
          token_endpoint_auth_methods_supported: ["private_key_jwt", "none"],
          client_id_metadata_document_supported: true,
          code_challenge_methods_supported: ["S256"],
          authorization_response_iss_parameter_supported: true,
          ...(change.scopes ? { scopes_supported: change.scopes } : {}),
        });
      case "/.well-known/jwks.json":
        return json({
          keys: [{ ...jwk, kid: "k1", alg: "EdDSA", use: "sig" }],
        });
      case "/token": {
        const form = new URLSearchParams(await request.text());
        seen.verifier = form.get("code_verifier") ?? undefined;
        seen.authorization = request.headers.get("authorization") ?? undefined;
        seen.assertion = form.get("client_assertion") ?? undefined;
        seen.assertionType = form.get("client_assertion_type") ?? undefined;
        if (form.get("code") !== "good-code")
          return json({ error: "invalid_grant" }, 400);
        return json({
          access_token: "unused",
          token_type: "Bearer",
          expires_in: 300,
          id_token: await idToken(seen.nonce ?? ""),
        });
      }
      default:
        return json({ error: "not_found" }, 404);
    }
  };
  return { fetch, seen, keys };
}

const deps = (fetch: typeof globalThis.fetch) => ({ fetch, now: () => NOW });
const get = (path: string, cookie = "") =>
  new Request(`${SITE}${path}`, { headers: cookie ? { cookie } : {} });
/** The cookies a response sets, as a request would send them back. */
const cookieOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .filter((c) => !c.endsWith("="))
    .join("; ");

/** Goes to /login and returns what the browser would carry to the server. */
async function leave(op: Awaited<ReturnType<typeof server>>, path = "/login") {
  const response = await handle(get(path), env, deps(op.fetch));
  assert.equal(response.status, 302);
  const to = new URL(response.headers.get("location")!);
  op.seen.nonce = to.searchParams.get("nonce") ?? undefined;
  return { to, cookie: cookieOf(response), response };
}

test("the request asks for a code, with PKCE, a state and a nonce, and nothing but openid", async () => {
  const op = await server();
  const { to, response } = await leave(op);
  assert.equal(to.origin + to.pathname, `${ISSUER}/authorize`);
  assert.equal(to.searchParams.get("response_type"), "code");
  assert.equal(to.searchParams.get("scope"), "openid");
  assert.equal(to.searchParams.get("client_id"), CLIENT_ID);
  assert.equal(to.searchParams.get("redirect_uri"), `${SITE}/callback`);
  assert.equal(to.searchParams.get("code_challenge_method"), "S256");
  assert.match(to.searchParams.get("code_challenge")!, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(to.searchParams.get("state"));
  assert.ok(to.searchParams.get("nonce"));
  assert.equal(to.searchParams.has("prompt"), false);
  // The secret never travels through the browser.
  assert.equal(to.href.includes("s3cret"), false);
  const cookie = response.headers.getSetCookie()[0]!;
  assert.match(cookie, /^__Host-demo_tx=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
});

test("signing in with another identity asks the server to show its choice", async () => {
  const op = await server();
  const { to } = await leave(op, "/login?choose");
  assert.equal(to.searchParams.get("prompt"), "select_account");
});

test("what the visitor ticked is what the request asks for, and nothing they did not", async () => {
  const op = await server({ scopes: ["openid", "profile", "email"] });
  const { to } = await leave(op, "/login?ask=email");
  assert.equal(to.searchParams.get("scope"), "openid email");
  const both = await leave(op, "/login?ask=email&ask=profile&choose=");
  assert.equal(both.to.searchParams.get("scope"), "openid profile email");
  assert.equal(both.to.searchParams.get("prompt"), "select_account");
  // A value this site does not know asks for nothing.
  const odd = await leave(op, "/login?ask=address&ask=openid");
  assert.equal(odd.to.searchParams.get("scope"), "openid");
});

test("a server that gives an identifier only is not asked for more", async () => {
  const op = await server({ scopes: ["openid"] });
  const response = await handle(get("/login?ask=email"), env, deps(op.fetch));
  assert.equal(response.status, 502);
  assert.match(await response.text(), /does not know the email scope/);
  // Asked for nothing more, it is used as before.
  await leave(op, "/login");
});

test("the page sets what was asked next to what came back", async () => {
  const op = await server({
    scopes: ["openid", "profile", "email"],
    claims: {
      email: "ada@example.org",
      email_verified: false,
      given_name: "<Ada>",
    },
  });
  const { to, cookie } = await leave(op, "/login?ask=email&ask=profile");
  const back = await handle(
    get(
      `/callback?code=good-code&state=${to.searchParams.get("state")}&iss=${encodeURIComponent(ISSUER)}`,
      cookie,
    ),
    env,
    deps(op.fetch),
  );
  assert.equal(back.status, 303);
  const html = await (
    await handle(get("/", cookieOf(back)), env, deps(op.fetch))
  ).text();
  const row = (label: string) =>
    new RegExp(`<th scope="row">${label}[^]*?</tr>`).exec(html)?.[0] ?? "";
  assert.match(row("E-mail address"), /required/);
  assert.match(row("E-mail address"), /Received:[^]*ada@example\.org/);
  assert.match(row("First name"), /optional/);
  // A value from the server is text, never markup.
  assert.match(row("First name"), /Received:[^]*&lt;Ada&gt;/);
  assert.match(row("Username"), /Not received/);
  assert.match(row("Language"), /Not received/);
  // The choices of the next request start from these.
  assert.match(html, /name="ask" value="email" checked/);
  assert.match(html, /name="ask" value="profile" checked/);
});

test("asked for nothing, the page says so, and offers to ask", async () => {
  const op = await server();
  const { to, cookie } = await leave(op);
  const back = await handle(
    get(
      `/callback?code=good-code&state=${to.searchParams.get("state")}&iss=${encodeURIComponent(ISSUER)}`,
      cookie,
    ),
    env,
    deps(op.fetch),
  );
  const html = await (
    await handle(get("/", cookieOf(back)), env, deps(op.fetch))
  ).text();
  assert.match(html, /The identifier, and nothing else\./);
  assert.match(html, /name="ask" value="email">/);
  assert.doesNotMatch(html, /Not received/);
});

test("a server that refuses the scope is explained", async () => {
  const op = await server();
  const { to, cookie } = await leave(op, "/login?ask=email");
  const back = await handle(
    get(
      `/callback?error=invalid_scope&state=${to.searchParams.get("state")}&iss=${encodeURIComponent(ISSUER)}`,
      cookie,
    ),
    env,
    deps(op.fetch),
  );
  assert.equal(back.status, 400);
  assert.match(await back.text(), /may not ask it for that/);
});

test("a good answer signs in: the page shows the identifier, and the address keeps no code", async () => {
  const op = await server();
  const { to, cookie } = await leave(op);
  const state = to.searchParams.get("state");
  const back = await handle(
    get(
      `/callback?code=good-code&state=${state}&iss=${encodeURIComponent(ISSUER)}`,
      cookie,
    ),
    env,
    deps(op.fetch),
  );
  assert.equal(back.status, 303);
  assert.equal(back.headers.get("location"), "/");
  // The site proved who it is with a signature of its key, and proved it
  // made the request (PKCE). No secret, no Basic header.
  assert.equal(op.seen.authorization, undefined);
  assert.equal(
    op.seen.assertionType,
    "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
  );
  const [h, p, sig] = op.seen.assertion!.split(".");
  const header = JSON.parse(Buffer.from(h!, "base64url").toString());
  const claims = JSON.parse(Buffer.from(p!, "base64url").toString());
  assert.equal(header.alg, "ES256");
  assert.equal(header.kid, "demo-1");
  assert.equal(claims.iss, CLIENT_ID);
  assert.equal(claims.sub, CLIENT_ID);
  assert.equal(claims.aud, ISSUER);
  assert.ok(claims.jti);
  assert.ok(
    await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      siteKeys.publicKey,
      Buffer.from(sig!, "base64url"),
      new TextEncoder().encode(`${h}.${p}`),
    ),
    "signed by the key the document publishes",
  );
  assert.match(op.seen.verifier!, /^[A-Za-z0-9_-]{43,}$/);

  const page = await handle(get("/", cookieOf(back)), env, deps(op.fetch));
  const html = await page.text();
  assert.match(html, /You are signed in/);
  assert.match(html, /vsid-of-this-identity-for-this-site/);
  assert.match(
    page.headers.get("content-security-policy")!,
    /default-src 'none'/,
  );
});

test("an answer to another request is refused", async () => {
  const op = await server();
  const { cookie } = await leave(op);
  const back = await handle(
    get(
      `/callback?code=good-code&state=someone-elses&iss=${encodeURIComponent(ISSUER)}`,
      cookie,
    ),
    env,
    deps(op.fetch),
  );
  assert.equal(back.status, 400);
  assert.equal(cookieOf(back), "");
  assert.equal(op.seen.verifier, undefined, "the code was not even presented");
});

test("an answer that names another server is refused", async () => {
  const op = await server();
  const { to, cookie } = await leave(op);
  const back = await handle(
    get(
      `/callback?code=good-code&state=${to.searchParams.get("state")}&iss=https%3A%2F%2Fevil.example`,
      cookie,
    ),
    env,
    deps(op.fetch),
  );
  assert.equal(back.status, 400);
  assert.equal(op.seen.verifier, undefined);
});

test("an answer without the cookie of its request is refused", async () => {
  const op = await server();
  const { to } = await leave(op);
  const back = await handle(
    get(
      `/callback?code=good-code&state=${to.searchParams.get("state")}&iss=${encodeURIComponent(ISSUER)}`,
    ),
    env,
    deps(op.fetch),
  );
  assert.equal(back.status, 400);
  assert.match(await back.text(), /matches no request/);
});

test("a transaction cookie that was altered is refused", async () => {
  const op = await server();
  const { to, cookie } = await leave(op);
  const forged = cookie.replace(/\.[A-Za-z0-9_-]+$/, ".AAAA");
  const back = await handle(
    get(
      `/callback?code=good-code&state=${to.searchParams.get("state")}&iss=${encodeURIComponent(ISSUER)}`,
      forged,
    ),
    env,
    deps(op.fetch),
  );
  assert.equal(back.status, 400);
});

test("an ID token signed with another key is not used", async () => {
  const other = (await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const op = await server({ signWith: other.privateKey });
  const { to, cookie } = await leave(op);
  const back = await handle(
    get(
      `/callback?code=good-code&state=${to.searchParams.get("state")}&iss=${encodeURIComponent(ISSUER)}`,
      cookie,
    ),
    env,
    deps(op.fetch),
  );
  assert.equal(back.status, 400);
  assert.match(await back.text(), /could not be verified/);
  assert.equal(cookieOf(back), "");
});

for (const [what, claims] of [
  ["made for another site", { aud: "another-site" }],
  ["from another server", { iss: "https://evil.example" }],
  ["that has expired", { exp: 1_000_000_000 }],
  ["with another nonce", { nonce: "not-ours" }],
] as const) {
  test(`an ID token ${what} is not used`, async () => {
    const op = await server({ claims });
    const { to, cookie } = await leave(op);
    const back = await handle(
      get(
        `/callback?code=good-code&state=${to.searchParams.get("state")}&iss=${encodeURIComponent(ISSUER)}`,
        cookie,
      ),
      env,
      deps(op.fetch),
    );
    assert.equal(back.status, 400);
    assert.equal(cookieOf(back), "");
  });
}

test("going back without signing in is said plainly", async () => {
  const op = await server();
  const { to, cookie } = await leave(op);
  const back = await handle(
    get(
      `/callback?error=access_denied&state=${to.searchParams.get("state")}&iss=${encodeURIComponent(ISSUER)}`,
      cookie,
    ),
    env,
    deps(op.fetch),
  );
  assert.equal(back.status, 400);
  assert.match(await back.text(), /went back without signing in/);
});

/** Signs in as `sub`, in a browser that already holds `session`. */
async function signInAs(sub: string, session: string): Promise<string> {
  const op = await server({ claims: { sub } });
  const { to, cookie } = await leave(op);
  const back = await handle(
    get(
      `/callback?code=good-code&state=${to.searchParams.get("state")}&iss=${encodeURIComponent(ISSUER)}`,
      [cookie, session].filter(Boolean).join("; "),
    ),
    env,
    deps(op.fetch),
  );
  return cookieOf(back);
}

test("two identities are two identifiers, kept side by side", async () => {
  const first = await signInAs("first-identifier", "");
  const second = await signInAs("second-identifier", first);
  const html = await (await handle(get("/", second), env)).text();
  assert.match(html, /2 identifiers/);
  assert.match(html, /first-identifier/);
  assert.match(html, /second-identifier/);
});

test("forgetting clears the cookie", async () => {
  const response = await handle(
    new Request(`${SITE}/logout`, { method: "POST" }),
    env,
  );
  assert.equal(response.status, 303);
  assert.match(
    response.headers.getSetCookie()[0]!,
    /^__Host-demo=; .*Max-Age=0/,
  );
});

test("a site without its key says so instead of failing", async () => {
  const response = await handle(get("/login"), { ISSUER }, {});
  assert.equal(response.status, 503);
  assert.match(await response.text(), /not set up yet/);
});

test("the page for the browser carries its own document, never the key", async () => {
  const html = await (await handle(get("/browser/"), env)).text();
  assert.match(
    html,
    /data-client-id="https:\/\/demo.example.org\/browser\/oauth-client-metadata.json"/,
  );
  assert.match(html, /data-issuer="https:\/\/id.example.org"/);
  assert.equal(html.includes(privateJwk.d!), false);
});

test("the site describes itself: its public key, never the private one", async () => {
  const response = await handle(get("/oauth-client-metadata.json"), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /application\/json/);
  const text = await response.text();
  assert.equal(text.includes(privateJwk.d!), false);
  const document = JSON.parse(text);
  assert.equal(document.client_id, CLIENT_ID);
  assert.deepEqual(document.redirect_uris, [`${SITE}/callback`]);
  assert.equal(document.token_endpoint_auth_method, "private_key_jwt");
  assert.equal(document.jwks.keys.length, 1);
  assert.equal(document.jwks.keys[0].kid, "demo-1");
  assert.equal(document.jwks.keys[0].x, privateJwk.x);
  assert.equal(document.brigid_attributes.email, "required");

  const page = JSON.parse(
    await (
      await handle(get("/browser/oauth-client-metadata.json"), env)
    ).text(),
  );
  assert.equal(page.client_id, `${SITE}/browser/oauth-client-metadata.json`);
  assert.deepEqual(page.redirect_uris, [`${SITE}/browser/`]);
  assert.equal(page.token_endpoint_auth_method, "none");
  assert.equal(page.jwks, undefined);

  const missing = await handle(get("/oauth-client-metadata.json"), { ISSUER });
  assert.equal(missing.status, 503);
});

test("the visitor names their server", async () => {
  const op = await server();
  const { to } = await leave(op, "/login?server=id.example.org");
  assert.equal(to.origin, ISSUER);
  const refused = await handle(
    get("/login?server=not%20a%20server"),
    env,
    deps(op.fetch),
  );
  assert.equal(refused.status, 400);
  assert.match(await refused.text(), /not the address of a server/);
});

test("registered on a local server, the site uses its secret instead", async () => {
  const op = await server({ claims: { aud: "site" } });
  const registered: Env = {
    ISSUER,
    CLIENT_ID: "site",
    CLIENT_SECRET: "s3cret",
    PUBLIC_CLIENT_ID: "page",
    SESSION_SECRET: env.SESSION_SECRET,
  };
  const response = await handle(get("/login"), registered, deps(op.fetch));
  assert.equal(response.status, 302);
  const to = new URL(response.headers.get("location")!);
  op.seen.nonce = to.searchParams.get("nonce") ?? undefined;
  assert.equal(to.searchParams.get("client_id"), "site");
  const back = await handle(
    get(
      `/callback?code=good-code&state=${to.searchParams.get("state")}&iss=${encodeURIComponent(ISSUER)}`,
      cookieOf(response),
    ),
    registered,
    deps(op.fetch),
  );
  assert.equal(back.status, 303);
  assert.match(op.seen.authorization!, /^Basic /);
  assert.equal(op.seen.assertion, undefined);
  const page = await (await handle(get("/browser/"), registered)).text();
  assert.match(page, /data-client-id="page"/);
  assert.equal(page.includes("s3cret"), false);
});

test("a server is named by its domain", () => {
  assert.equal(issuerFrom("helm.brig.id"), "https://helm.brig.id");
  assert.equal(issuerFrom(" https://helm.brig.id/ "), "https://helm.brig.id");
  assert.equal(issuerFrom("http://localhost:8080"), "http://localhost:8080");
  for (const bad of [
    "",
    "http://helm.brig.id",
    "helm",
    "https://helm.brig.id/path",
    "https://u:p@helm.brig.id",
    "https://helm.brig.id?x=1",
    "javascript:alert(1)",
    "helm brig.id",
  ]) {
    assert.equal(issuerFrom(bad), null, bad);
  }
});

test("values are escaped wherever they are shown", async () => {
  const op = await server({
    claims: { sub: '<img src=x onerror="alert(1)">' },
  });
  const { to, cookie } = await leave(op);
  const back = await handle(
    get(
      `/callback?code=good-code&state=${to.searchParams.get("state")}&iss=${encodeURIComponent(ISSUER)}`,
      cookie,
    ),
    env,
    deps(op.fetch),
  );
  const html = await (await handle(get("/", cookieOf(back)), env)).text();
  assert.equal(html.includes("<img"), false);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});
