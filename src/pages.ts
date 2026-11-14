/**
 * The pages, as HTML text. Every value that is not written here goes through
 * `esc`: the name of a server, a claim, an error.
 */
import type { Claims } from "./oidc.ts";

export function esc(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const SOURCE = "https://github.com/brig-id/demo";

function layout(options: {
  title: string;
  current: "server" | "browser";
  server: string;
  body: string;
  /** A script of this site to load (the browser-side demonstration). */
  script?: string;
  /** Read by that script. */
  data?: Record<string, string>;
}): string {
  const data = Object.entries(options.data ?? {})
    .map(([name, value]) => ` data-${name}="${esc(value)}"`)
    .join("");
  const tab = (key: "server" | "browser", href: string, label: string) =>
    `<a href="${href}"${options.current === key ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${esc(options.title)} · brig·id demo</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="/style.css">
${options.script ? `<script type="module" src="${options.script}"></script>` : ""}
</head>
<body${data}>
<header class="top">
  <a class="brand" href="/">brig·id <span>demo</span></a>
  <nav aria-label="Two ways to sign in">
    ${tab("server", "/", "On the server")}
    ${tab("browser", "/browser/", "In the browser")}
  </nav>
</header>
<main>
${options.body}
</main>
<footer>
  <p>A demonstration. It keeps nothing: what it shows comes from a cookie in your browser, gone in an hour.</p>
  <p>Signs in with <span class="mono">${esc(options.server)}</span> · <a href="${SOURCE}">Source code</a> · <a href="https://brig.id">brig.id</a></p>
</footer>
</body>
</html>`;
}

const EXPLAINED: Record<string, string> = {
  sub: "The identifier. Made for this site and the identity you chose: another site, or another of your identities here, gets a different one, and nothing connects them.",
  iss: "Who says so: the server you signed in with.",
  aud: "Who it is said to: this site, and no other.",
  auth_time: "When you last used your passkey with that server.",
  iat: "When this statement was written.",
  exp: "When it stops being valid.",
  nonce:
    "A random value this site sent with its request, returned to prove the answer belongs to it.",
  jti: "The serial number of this statement.",
};

const TIMES = new Set(["auth_time", "iat", "exp"]);

function claimValue(name: string, value: unknown): string {
  if (TIMES.has(name) && typeof value === "number") {
    const date = new Date(value * 1000).toISOString().replace(".000Z", "Z");
    return `<span class="mono">${esc(value)}</span> <span class="quiet">(${esc(date)})</span>`;
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `<span class="mono">${esc(text)}</span>`;
}

/** The table of everything the site received. Also built in the browser,
 * from the same data, by `browser.ts`. */
export function claimsTable(claims: Claims): string {
  const order = [
    "sub",
    "iss",
    "aud",
    "auth_time",
    "iat",
    "exp",
    "nonce",
    "jti",
  ];
  const names = [
    ...order.filter((name) => name in claims),
    ...Object.keys(claims).filter((name) => !order.includes(name)),
  ];
  return `<table class="claims">
<caption>Everything this site received</caption>
<tbody>
${names
  .map(
    (name) => `<tr${name === "sub" ? ' class="main"' : ""}>
<th scope="row"><code>${esc(name)}</code></th>
<td>${claimValue(name, claims[name])}<p>${esc(EXPLAINED[name] ?? "")}</p></td>
</tr>`,
  )
  .join("\n")}
</tbody>
</table>`;
}

/** The identifiers seen in this browser, to compare them. */
export function seenList(seen: string[], current: string): string {
  if (seen.length < 2) {
    return `<p class="quiet">Sign in again with <strong>another identity</strong>: this site will get another identifier, and no way to tell that it is you again.</p>`;
  }
  return `<p>This browser has now presented <strong>${seen.length} identifiers</strong> to this site. To the site, they are ${seen.length} different people:</p>
<ol class="seen">
${seen
  .map(
    (sub) =>
      `<li><span class="mono">${esc(sub)}</span>${sub === current ? ' <span class="tag">now</span>' : ""}</li>`,
  )
  .join("\n")}
</ol>`;
}

const NOT_RECEIVED = `<section class="card">
<h2>What it did not receive</h2>
<ul class="plain">
<li>Your name, an e-mail address, a picture: nothing about you.</li>
<li>The name and the icon of the identity you chose: they are yours, they stay on the server.</li>
<li>Anything about your account, your passkeys or your other identities.</li>
</ul>
</section>`;

export function home(server: string): string {
  return layout({
    title: "Sign in",
    current: "server",
    server,
    body: `<section class="hero">
<h1>A site that signs in with brig·id</h1>
<p class="lead">This site knows nothing about you. Sign in, choose the identity it will meet, and see exactly what it receives.</p>
<p><a class="button primary" href="/login">Sign in with brig·id</a></p>
<p class="quiet small">You will be sent to <span class="mono">${esc(server)}</span>, and back.</p>
</section>
<section class="card">
<h2>For developers</h2>
<p>This is an ordinary OpenID Connect client: the Authorization Code flow with PKCE, done with a standard library. Nothing in it is specific to brig·id, and <a href="${SOURCE}">its source</a> is short enough to read.</p>
<p>This page is the classic case: a site with a server, which keeps a secret. <a href="/browser/">The other page</a> does the same entirely in the browser, with no secret.</p>
</section>`,
  });
}

export function signedIn(
  server: string,
  claims: Claims,
  seen: string[],
): string {
  return layout({
    title: "Signed in",
    current: "server",
    server,
    body: `<section class="hero">
<h1>You are signed in</h1>
<p class="lead">To this site, you are <span class="mono sub">${esc(claims.sub)}</span>. That is all it knows.</p>
<p class="actions">
<a class="button primary" href="/login?choose">Sign in with another identity</a>
</p>
<form method="post" action="/logout"><button class="link" type="submit">Forget me</button></form>
</section>
<section class="card">
${claimsTable(claims)}
</section>
<section class="card">
<h2>Two identities, two strangers</h2>
${seenList(seen, claims.sub)}
</section>
${NOT_RECEIVED}`,
  });
}

export function failed(
  server: string,
  message: string,
  status: string,
): string {
  return layout({
    title: "Not signed in",
    current: "server",
    server,
    body: `<section class="hero">
<h1>Not signed in</h1>
<p class="lead" role="alert">${esc(message)}</p>
<p class="quiet small">${esc(status)}</p>
<p><a class="button primary" href="/login">Try again</a> <a class="button" href="/">Back</a></p>
</section>`,
  });
}

export function browser(
  server: string,
  data: { issuer: string; "client-id": string },
): string {
  return layout({
    title: "In the browser",
    current: "browser",
    server,
    script: "/browser.js",
    data,
    body: `<section class="hero">
<h1>The same, entirely in the browser</h1>
<p class="lead">No server of this site takes part: this page asks, receives the answer and checks it by itself. It holds no secret, because a page cannot keep one.</p>
<p class="actions" id="actions">
<button class="button primary" id="sign-in" type="button" disabled>Sign in with brig·id</button>
</p>
<p id="status" class="quiet small" role="status">This page needs its script.</p>
</section>
<div id="result" hidden>
<section class="card" id="claims"></section>
<section class="card">
<h2>Two identities, two strangers</h2>
<div id="seen"></div>
</section>
${NOT_RECEIVED}
</div>
<section class="card">
<h2>For developers</h2>
<p>A <em>public client</em>: registered on the server without a secret. What protects the exchange is PKCE: the page that asked is the only one that can redeem the answer. The server's token endpoint and keys can be read from any origin; they depend on no cookie.</p>
</section>`,
  });
}

export function notFound(server: string): string {
  return layout({
    title: "Not found",
    current: "server",
    server,
    body: `<section class="hero"><h1>Nothing here</h1><p><a class="button" href="/">Back</a></p></section>`,
  });
}
