/**
 * The pages, as HTML text. Every value that is not written here goes through
 * `esc`: the name of a server, a claim, a post, an error.
 *
 * Two kinds of page. The forum (`/`) is what a visitor meets: an ordinary
 * website, in plain words. The pages for developers (`/developers/`,
 * `/browser/`) show the same sign-in with its workings visible.
 */
import { ATTRIBUTES, NAME } from "./client.ts";
import type { Claims, Scope } from "./oidc.ts";

export function esc(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const SOURCE = "https://github.com/brig-id/demo";

/** A post written on the forum by the person signed in. */
export interface Post {
  text: string;
  /** Unix seconds. */
  at: number;
}

/** The longest post, in characters. */
export const POST_MAX = 280;

/** Where a sign-in started, and where the person comes back to. */
export type From = "forum" | "developers";

/** The forum's mark: a sprout. */
const MARK = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle class="mark-ground" cx="16" cy="16" r="16"/><path class="mark-stem" d="M16 25V15"/><path class="mark-leaf" d="M16 18C9.5 18 6.5 13.5 6.5 9.5 12.5 9.5 16 12.5 16 18Z"/><path class="mark-leaf" d="M16 15c.5-5.5 4-9 9.5-9 0 6-3.5 9-9.5 9Z"/></svg>`;

/** A sprout planted at `x` on a bed whose top is at `y`. */
const sprout = (x: number, y: number, size = 1) =>
  `<g transform="translate(${x} ${y}) scale(${size})"><path class="stem" d="M0 0V-24"/><path class="leaf" d="M0-14C-13-14-19-23-19-31-7-31 0-24 0-14Z"/><path class="leaf other" d="M0-20C1-31 8-38 19-38 19-26 12-20 0-20Z"/></g>`;

/** A flower at `x`, on a bed whose top is at `y`. */
const flower = (x: number, y: number) =>
  `<g transform="translate(${x} ${y})"><path class="stem" d="M0 0V-34"/><path class="leaf" d="M0-12C-10-12-14-18-14-24-5-24 0-19 0-12Z"/><circle class="petal" cx="0" cy="-44" r="7"/><circle class="petal" cx="-9" cy="-36" r="7"/><circle class="petal" cx="9" cy="-36" r="7"/><circle class="petal" cx="-5" cy="-26" r="7"/><circle class="petal" cx="5" cy="-26" r="7"/><circle class="heart" cx="0" cy="-35" r="6"/></g>`;

/** The picture of the home page: two beds of a shared garden. */
const GARDEN = `<svg class="garden" viewBox="0 0 320 190" aria-hidden="true" focusable="false">
<circle class="sun" cx="252" cy="50" r="26"/>
<path class="hill" d="M0 132C52 108 112 106 170 122S274 120 320 104V190H0Z"/>
<rect class="bed" x="18" y="150" width="128" height="22" rx="7"/>
<rect class="bed" x="168" y="146" width="136" height="22" rx="7"/>
${sprout(46, 150, 0.9)}${sprout(82, 150, 1.1)}${sprout(118, 150, 0.8)}
${flower(196, 146)}${sprout(236, 146, 1)}${flower(276, 146)}
</svg>`;

function document(options: {
  title: string;
  kind: "forum" | "developers";
  header: string;
  body: string;
  footer: string;
  /** A script of this site to load (the page that signs in in the browser). */
  script?: string;
  /** Read by that script. */
  data?: Record<string, string>;
}): string {
  const data = Object.entries(options.data ?? {})
    .map(([name, value]) => ` data-${name}="${esc(value)}"`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(options.title)} · ${NAME}</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="/style.css">
${options.script ? `<script type="module" src="${options.script}"></script>` : ""}
</head>
<body class="${options.kind}"${data}>
<header class="top">
${options.header}
</header>
<main>
${options.body}
</main>
<footer>
${options.footer}
</footer>
</body>
</html>`;
}

// -- the forum ----------------------------------------------------------------

function forum(options: {
  title: string;
  body: string;
  /** The username of the person signed in, if any. */
  username?: string;
}): string {
  return document({
    title: options.title,
    kind: "forum",
    header: `<a class="brand" href="/">${MARK}<span>${NAME}</span></a>
${options.username ? `<p class="who">Signed in as <strong>${esc(options.username)}</strong></p>` : ""}`,
    body: options.body,
    footer: `<p>${NAME} is a demonstration of <a href="https://brig.id">brig·id</a>: the gardeners and their posts are made up, and the site keeps nothing about you.</p>
<p><a href="/developers/">For developers</a></p>`,
  });
}

/** The posts every visitor sees. Made up. */
const POSTS: readonly {
  author: string;
  topic: string;
  when: string;
  title: string;
  text: string;
  replies: number;
  /** The colour of their initial, one of four. */
  hue: 1 | 2 | 3 | 4;
}[] = [
  {
    author: "marguerite_v",
    topic: "Swaps",
    when: "2 hours ago",
    title: "Twelve tomato seedlings looking for a plot",
    text: "I sowed far too many ‘Black Krim’ this spring. They are sturdy and ready to plant out: come and take some from the shed, by plot 14.",
    replies: 4,
    hue: 1,
  },
  {
    author: "tom_k",
    topic: "Plot life",
    when: "Yesterday",
    title: "Who has the key of the rain barrel?",
    text: "The barrel by the north gate is full again, but its tap is locked. If you borrowed the key, could you hang it back in the shed?",
    replies: 2,
    hue: 2,
  },
  {
    author: "lou.jardin",
    topic: "Tips",
    when: "3 days ago",
    title: "Slugs and lettuces: what works for you?",
    text: "Beer traps work for a week, then nothing. This time I am trying a ring of crushed shells around each row. Other ideas welcome.",
    replies: 9,
    hue: 3,
  },
  {
    author: "garden_committee",
    topic: "Events",
    when: "Last week",
    title: "Work day on Saturday: compost and paths",
    text: "From ten o’clock. We turn the big compost bin and spread wood chips on the paths. Bring gloves; the soup is on us.",
    replies: 6,
    hue: 4,
  },
];

function avatar(author: string, colour: string): string {
  const initial = [...author][0]?.toUpperCase() ?? "?";
  return `<span class="avatar ${colour}" aria-hidden="true">${esc(initial)}</span>`;
}

function ago(seconds: number): string {
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  return minutes === 1 ? "A minute ago" : `${minutes} minutes ago`;
}

interface Author {
  username: string;
  firstName?: string;
}

/** The posts: the person's own first, then everyone's. */
function postList(own: readonly Post[], author: Author | null, now: number) {
  const mine = author
    ? own.map(
        (post) => `<li class="post own">
${avatar(author.username, "own")}
<div class="post-body">
<p class="post-meta"><span class="author">${esc(author.username)}</span>${author.firstName ? ` <span class="quiet">(${esc(author.firstName)})</span>` : ""} · <span class="quiet">${ago(Math.max(0, now - post.at))}</span> <span class="topic">Only you see it</span></p>
<p class="post-text">${esc(post.text)}</p>
</div>
</li>`,
      )
    : [];
  const everyone = POSTS.map(
    (post) => `<li class="post">
${avatar(post.author, `h${post.hue}`)}
<div class="post-body">
<p class="post-meta"><span class="author">${esc(post.author)}</span> · <span class="quiet">${post.when}</span> <span class="topic">${post.topic}</span></p>
<h3>${esc(post.title)}</h3>
<p class="post-text">${esc(post.text)}</p>
<p class="quiet small">${post.replies} replies</p>
</div>
</li>`,
  );
  return `<section class="posts" aria-labelledby="latest">
<h2 id="latest">Latest posts</h2>
<ol class="post-list">
${[...mine, ...everyone].join("\n")}
</ol>
</section>`;
}

/** What the forum asks for, once a person signs in from it. */
export const FORUM_SCOPES: readonly Scope[] = ["profile", "email"];

const hiddenAsks = FORUM_SCOPES.map(
  (scope) => `<input type="hidden" name="ask" value="${scope}">`,
).join("");

function signInButton(label: string, chooseIdentity = false): string {
  return `<form method="get" action="/login">${hiddenAsks}${chooseIdentity ? '<input type="hidden" name="choose" value="">' : ""}<button class="button primary" type="submit">${label}</button></form>`;
}

export function home(): string {
  return forum({
    title: "Welcome",
    body: `<section class="welcome">
<div class="welcome-text">
<p class="eyebrow">A forum for shared gardens</p>
<h1>Seeds, tips and tools, swapped between neighbours</h1>
<p class="lead">The gardeners of the shared plots talk here: what to sow, who has spare seedlings, when the next work day is.</p>
</div>
${GARDEN}
</section>
<section class="card join" aria-labelledby="join">
<h2 id="join">Join the conversation</h2>
<p>Anyone can read. To post, sign in with brig·id. The forum will ask you for:</p>
<ul class="asks-list">
<li><strong>A username</strong>, shown on your posts. The forum needs it.</li>
<li><strong>An e-mail address</strong>, if you would like to be told of replies.</li>
<li><strong>A first name</strong>, if you would like it next to your username.</li>
</ul>
<p class="quiet">You decide on brig·id what you share, and which of your identities the forum meets. Nothing else reaches it.</p>
<div class="actions">${signInButton("Sign in with brig·id")}</div>
</section>
${postList([], null, 0)}`,
  });
}

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : undefined;

/** One line of what the forum knows. */
function fact(
  name: string,
  value: string | undefined,
  shared: string,
  missing: string,
): string {
  return `<li class="fact ${value === undefined ? "missing" : "shared"}">
<span class="fact-mark" aria-hidden="true"></span>
<span class="fact-text"><span class="fact-name">${name}</span> ${
    value === undefined
      ? `<span class="fact-value">Not shared</span>`
      : `<strong class="fact-value">${esc(value)}</strong>`
  }<br><span class="fact-why">${value === undefined ? missing : shared}</span></span>
</li>`;
}

/** The forum, for a person signed in. */
export function signedIn(claims: Claims, posts: readonly Post[], now: number) {
  const username = text(claims.preferred_username);
  const firstName = text(claims.given_name);
  const email = text(claims.email);
  const leave = `<form method="post" action="/logout"><button class="button" type="submit">Sign out</button></form>`;
  if (!username) {
    return forum({
      title: "Hello",
      body: `<section class="hello">
<h1>Hello</h1>
<p class="lead">You are signed in, but without a username.</p>
</section>
<section class="card" aria-labelledby="needs">
<h2 id="needs">The forum needs a username to show on your posts</h2>
<p>You can read the forum. To post, sign in again and share a username: it is the one thing the forum cannot do without.</p>
<div class="actions">${signInButton("Sign in again", true)}${leave}</div>
</section>
${postList([], null, now)}`,
    });
  }
  const author: Author = { username, ...(firstName ? { firstName } : {}) };
  return forum({
    title: `Hello ${username}`,
    username,
    body: `<section class="hello">
<h1>Hello, ${esc(username)}</h1>
<p class="lead">You are signed in to ${NAME} with brig·id. Here is everything the forum learned about you.</p>
</section>
<section class="card knows" aria-labelledby="knows">
<h2 id="knows">What the forum knows about you</h2>
<ul class="facts">
${fact("Username", username, "Shown on your posts.", "")}
${fact("First name", firstName, "Shown next to your username.", "You did not share a first name: your posts show your username only.")}
${fact("E-mail address", email, "The forum writes to you there when someone replies to you.", "You did not share an e-mail address: you will not be told of replies.")}
</ul>
<p>That is all. The forum does not know who you are elsewhere: not your name, not the other sites you use, not your other identities. If it were ever hacked, or sold its list, this is all anyone would learn.</p>
<p class="quiet">Sign in with another of your identities, and the forum meets a new gardener, with no way to tell it is you.</p>
<div class="actions">${signInButton("Sign in with another identity", true)}${leave}</div>
</section>
<section class="card compose" aria-labelledby="write">
<h2 id="write">Write a post</h2>
<form method="post" action="/post">
<p class="field"><label for="text">Your post</label>
<textarea id="text" name="text" rows="3" maxlength="${POST_MAX}" required placeholder="Ask a question, offer seedlings, share a tip…"></textarea></p>
<div class="compose-foot"><button class="button primary" type="submit">Post as ${esc(username)}</button>
<p class="quiet small">A demonstration: only you will see your post, and it is gone within the hour.</p></div>
</form>
</section>
${postList(posts, author, now)}`,
  });
}

/** A sign-in that started from the forum and did not end well. */
export function forumFailed(message: string, code: string | null): string {
  const back =
    code === "access_denied"
      ? "You can still read the forum. To post, sign in and share a username: the forum shows it on your posts, and cannot work without it."
      : "You can still read the forum. Try again in a moment.";
  return forum({
    title: "Not signed in",
    body: `<section class="hello">
<h1>You are not signed in</h1>
<p class="lead" role="alert">${esc(message)}</p>
<p>${back}</p>
<div class="actions">${signInButton("Try again", true)}<a class="button" href="/">Back to the forum</a></div>
</section>`,
  });
}

export function notFound(): string {
  return forum({
    title: "Not found",
    body: `<section class="hello"><h1>Nothing grows here</h1><p class="lead">This page does not exist.</p><div class="actions"><a class="button" href="/">Back to the forum</a></div></section>`,
  });
}

// -- the pages for developers -----------------------------------------------------

/** The field where the visitor names their server. */
function serverField(server: string): string {
  return `<p class="server-field"><label for="server">Your brig·id server</label>
<input id="server" name="server" value="${esc(server)}" required autocomplete="url" inputmode="url" spellcheck="false" autocapitalize="off"></p>`;
}

function developers(options: {
  title: string;
  current: "server" | "browser";
  server: string;
  body: string;
  script?: string;
  data?: Record<string, string>;
}): string {
  const tab = (key: "server" | "browser", href: string, label: string) =>
    `<a href="${href}"${options.current === key ? ' aria-current="page"' : ""}>${label}</a>`;
  return document({
    title: options.title,
    kind: "developers",
    ...(options.script ? { script: options.script } : {}),
    ...(options.data ? { data: options.data } : {}),
    header: `<a class="brand" href="/">${MARK}<span>${NAME}</span></a>
<span class="pill">For developers</span>
<nav aria-label="Two ways to sign in">
${tab("server", "/developers/", "With a server")}
${tab("browser", "/browser/", "In the browser")}
</nav>`,
    body: options.body,
    footer: `<p>The forum is a demonstration. It keeps nothing: what it shows comes from a cookie in your browser, gone within the hour.</p>
<p>Signs in with <span class="mono">${esc(options.server)}</span> · <a href="/">The forum</a> · <a href="${SOURCE}">Source code</a> · <a href="https://brig.id">brig.id</a></p>`,
  });
}

const EXPLAINED: Record<string, string> = {
  sub: "The identifier. Made for this site and the identity you chose: another site, or another of your identities here, gets a different one, and nothing connects them.",
  iss: "Who says so: the server you signed in with. A site knows you by this and the identifier together, never by the identifier alone: another server cannot speak for you.",
  aud: "Who it is said to: this site, and no other.",
  auth_time: "When you last used your passkey with that server.",
  iat: "When this statement was written.",
  exp: "When it stops being valid.",
  nonce:
    "A random value this site sent with its request, returned to prove the answer belongs to it.",
  jti: "The serial number of this statement.",
  email:
    "The address on the identity you chose. You accepted to share it with this site.",
  email_verified:
    "Whether the server checked that the address is yours. It did not, and says so.",
  given_name:
    "The first name on the identity you chose. You accepted to share it with this site.",
  preferred_username:
    "The username on the identity you chose. You accepted to share it with this site.",
};

type Attribute = keyof typeof ATTRIBUTES;

const LABELS: Record<Attribute, string> = {
  preferred_username: "Username",
  given_name: "First name",
  email: "E-mail address",
};

/**
 * What this site may ask for, as its document declares it (`ATTRIBUTES` in
 * `client.ts`): what is required is fixed there, not in the request. A person
 * can decline an optional attribute and still sign in; declining a required
 * one ends there.
 */
export const ASKABLE: readonly {
  scope: Scope;
  claim: Attribute;
  label: string;
  required: boolean;
}[] = (Object.keys(ATTRIBUTES) as Attribute[]).map((claim) => ({
  scope: claim === "email" ? "email" : "profile",
  claim,
  label: LABELS[claim],
  required: ATTRIBUTES[claim] === "required",
}));

const need = (required: boolean) =>
  `<span class="tag${required ? " strong" : ""}">${required ? "required" : "optional"}</span>`;

/** The choices of what to ask for: the same on the server-side page (a form
 * sent to `/login`) and on the page that runs in the browser (read by its
 * script). */
export function askChoices(asked: readonly Scope[]): string {
  const choice = (scope: Scope, title: string, about: string) => {
    const tags = ASKABLE.filter((a) => a.scope === scope)
      .map(
        (a) =>
          `<span class="tag-group">${esc(a.label)} ${need(a.required)}</span>`,
      )
      .join(" ");
    return `<label class="ask">
<input type="checkbox" name="ask" value="${scope}"${asked.includes(scope) ? " checked" : ""}>
<span><strong>${title}</strong> <span class="quiet small">(the <code>${scope}</code> scope)</span><br>
<span class="tags">${tags}</span><br>
<span class="quiet small">${about}</span></span>
</label>`;
  };
  return `<fieldset class="asks">
<legend>Ask for more than an identifier</legend>
${choice("profile", "A username and a first name", "The forum shows the username on every post, and declares that it needs it: decline it on the server&#39;s page, and you are not signed in. Decline the first name, and you are signed in all the same.")}
${choice("email", "An e-mail address", "The forum would write there when someone replies. Decline it, and you are signed in all the same.")}
<p class="quiet small">Ticking nothing asks for the identifier alone. Whatever is asked, you decide on the server&#39;s page, value by value. The forum itself always asks for both.</p>
</fieldset>`;
}

/** What was asked for, next to what came back. A site cannot tell a refusal
 * from an identity that has no such attribute, and that is on purpose. */
export function askedTable(asked: readonly Scope[], claims: Claims): string {
  const rows = ASKABLE.filter((a) => asked.includes(a.scope));
  if (rows.length === 0) {
    return `<h2>What this site asked for</h2>
<p>The identifier, and nothing else.</p>`;
  }
  return `<h2>What this site asked for</h2>
<table class="asked">
<caption class="sr-only">Each attribute asked for, and what came back</caption>
<tbody>
${rows
  .map((row) => {
    const value = claims[row.claim];
    return `<tr class="${value === undefined ? "absent" : "received"}">
<th scope="row">${esc(row.label)} ${need(row.required)}</th>
<td>${
      value === undefined
        ? `<strong>Not received.</strong> <span class="quiet">You declined it, or the identity you chose has none.</span>`
        : `<strong>Received:</strong> <span class="mono">${esc(typeof value === "string" ? value : JSON.stringify(value))}</span>`
    }</td>
</tr>`;
  })
  .join("\n")}
</tbody>
</table>
<p class="quiet small">A site cannot tell an attribute you declined from one your identity does not have: the server sends nothing in both cases.</p>`;
}

const TIMES = new Set(["auth_time", "iat", "exp"]);

function claimValue(name: string, value: unknown): string {
  if (TIMES.has(name) && typeof value === "number") {
    const date = new Date(value * 1000).toISOString().replace(".000Z", "Z");
    return `<span class="mono">${esc(value)}</span> <span class="quiet">(${esc(date)})</span>`;
  }
  const shown = typeof value === "string" ? value : JSON.stringify(value);
  return `<span class="mono">${esc(shown)}</span>`;
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

/** What a site never gets, whatever it asks for. Also built in the browser. */
export function notReceived(asked: readonly Scope[]): string {
  return `<h2>What it did not receive</h2>
<ul class="plain">
<li>${
    asked.length === 0
      ? "Your name, an e-mail address, a picture: nothing about you."
      : "Anything you did not tick on the server&#39;s page, and anything this site did not ask for."
  }</li>
<li>The name and the icon of the identity you chose: they are yours, they stay on the server.</li>
<li>Anything about your account, your passkeys or your other identities.</li>
</ul>`;
}

const fromDevelopers = `<input type="hidden" name="from" value="developers">`;

/** How the site works, for whoever builds one: the document it publishes,
 * the library it uses. */
const HOW_IT_WORKS = `<section class="card">
<h2>How it works</h2>
<p>The forum is an ordinary OpenID Connect client: the Authorization Code flow with PKCE, done with a standard library. Nothing in it is specific to brig·id, and <a href="${SOURCE}">its source</a> is short enough to read.</p>
<p>It is registered on no server. It publishes <a href="/oauth-client-metadata.json">a document that describes it</a>, and the address of that document is its <code>client_id</code>: any brig·id server reads it there. It proves who it is by signing with a key whose public half the document carries; no secret is shared with any server.</p>
<p>The document also says what the forum may ask for, and what it needs: the username is required, the first name and the e-mail address are optional. A request only names scopes: <code>openid profile email</code> from the forum.</p>
<p>This page is the classic case: a site with a server. <a href="/browser/">The other page</a> does the same entirely in the browser, with no key.</p>
</section>`;

export function developersHome(server: string): string {
  return developers({
    title: "For developers",
    current: "server",
    server,
    body: `<section class="hero">
<h1>How ${NAME} signs in</h1>
<p class="lead">The forum knows nothing about you until you sign in. Here, the same sign-in shows its workings: choose what the site asks for, choose the identity it will meet, and see exactly what it receives.</p>
<form method="get" action="/login" class="sign-in">
${fromDevelopers}
${serverField(server)}
${askChoices([])}
<p><button class="button primary" type="submit">Sign in with brig·id</button></p>
</form>
<p class="quiet small">You will be sent to your server, and back.</p>
</section>
${HOW_IT_WORKS}`,
  });
}

export function developersSignedIn(
  server: string,
  claims: Claims,
  seen: string[],
  asked: readonly Scope[] = [],
): string {
  return developers({
    title: "Signed in",
    current: "server",
    server,
    body: `<section class="hero">
<h1>You are signed in</h1>
<p class="lead">To this site, you are <span class="mono sub">${esc(claims.sub)}</span>. ${asked.length === 0 ? "That is all it knows." : "It knows that, and what you accepted to share."}</p>
<form method="post" action="/logout">${fromDevelopers}<button class="link" type="submit">Forget me</button></form>
</section>
<section class="card">
${askedTable(asked, claims)}
</section>
<section class="card">
${claimsTable(claims)}
</section>
<section class="card">
<h2>Try again</h2>
<form method="get" action="/login" class="sign-in">
${fromDevelopers}
<input type="hidden" name="choose" value="">
${serverField(server)}
${askChoices(asked)}
<p><button class="button primary" type="submit">Sign in with another identity</button></p>
</form>
</section>
<section class="card">
<h2>Two identities, two strangers</h2>
${seenList(seen, claims.sub)}
</section>
<section class="card">
${notReceived(asked)}
</section>`,
  });
}

export function developersFailed(
  server: string,
  message: string,
  status: string,
): string {
  return developers({
    title: "Not signed in",
    current: "server",
    server,
    body: `<section class="hero">
<h1>Not signed in</h1>
<p class="lead" role="alert">${esc(message)}</p>
<p class="quiet small">${esc(status)}</p>
<p class="actions"><a class="button primary" href="/developers/">Try again</a> <a class="button" href="/">Back to the forum</a></p>
</section>`,
  });
}

export function browser(
  server: string,
  data: { issuer: string; "client-id": string },
): string {
  return developers({
    title: "In the browser",
    current: "browser",
    server,
    script: "/browser.js",
    data,
    body: `<section class="hero">
<h1>The same, entirely in the browser</h1>
<p class="lead">No server of this site takes part: this page asks, receives the answer and checks it by itself. It holds no secret, because a page cannot keep one.</p>
<div class="sign-in" id="asks">
${serverField(server)}
${askChoices([])}
</div>
<p class="actions" id="actions">
<button class="button primary" id="sign-in" type="button" disabled>Sign in with brig·id</button>
</p>
<p id="status" class="quiet small" role="status">This page needs its script.</p>
</section>
<div id="result" class="group" hidden>
<section class="card" id="asked"></section>
<section class="card" id="claims"></section>
<section class="card">
<h2>Two identities, two strangers</h2>
<div id="seen"></div>
</section>
<section class="card" id="not-received"></section>
</div>
<section class="card">
<h2>A public client</h2>
<p><a href="/browser/oauth-client-metadata.json">Its document</a> declares no key, because a page cannot keep one. What protects the exchange is PKCE: the page that asked is the only one that can redeem the answer. The server's token endpoint and keys can be read from any origin; they depend on no cookie.</p>
</section>`,
  });
}
