# brig·id — demo

A small website that signs in with a [brig·id](https://brig.id) server, and shows exactly
what it receives: an identifier made for it and for the identity the person chose, and
nothing else.

It is online at [demo.brig.id](https://demo.brig.id). It has two uses:

- **the example an integrator reads.** It is an ordinary OpenID Connect client
  (Authorization Code flow with PKCE), written with a standard library
  ([`oauth4webapi`](https://github.com/panva/oauth4webapi)). Nothing in it is specific to
  brig·id: any OpenID Connect library does the same;
- **the end-to-end test of the sign-in of applications**: its suite runs a real server, a
  real passkey ceremony and this site.

## Where to read

| File                                   | What it holds                                                                                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/oidc.ts`](src/oidc.ts)           | The whole protocol: where to send the person (`begin`), what to check when they come back (`finish`). About a hundred lines, shared by the two ways below |
| [`src/app.ts`](src/app.ts)             | A site with a server, which keeps a secret (a _confidential client_): `/login`, `/callback`, signed cookies                                               |
| [`src/browser.ts`](src/browser.ts)     | The same entirely in the browser, with no secret (a _public client_), at `/browser/`                                                                      |
| [`test/app.test.ts`](test/app.test.ts) | What the site refuses: an answer to another request, another server's, a token signed with another key, expired, made for someone else                    |

By default the site asks for `openid` and nothing more, and receives an identifier: the
ID token's `sub` is different for each identity of a person and for each application; the
site cannot connect two of them, and the suite checks it.

A visitor can make it ask for more: an e-mail address (the `email` scope), a first name, a
username and a language (the `profile` scope). The server shows each value to the person,
who accepts or declines them one by one. Whether an attribute is required or optional is
not in the request: it is in the site's registration on the server. The site then shows
what it asked for next to what came back. It cannot tell an attribute that was declined
from one the identity does not have, and that is on purpose.

## Run it

It needs a brig·id server ([`server-seedling`](https://github.com/brig-id/server-seedling))
on which it is registered, twice:

```shell
seedling client add --name "brig·id demo" --redirect-uri http://localhost:8788/callback \
  --required email --optional given_name --optional preferred_username --optional locale
seedling client add --name "brig·id demo (browser)" --redirect-uri http://localhost:8788/browser/ --public \
  --required email --optional given_name --optional preferred_username --optional locale
```

The `--required` and `--optional` options say what the site may ask people to share; the
pages describe exactly these (`ASKABLE` in [`src/pages.ts`](src/pages.ts)). For a site
already registered, `seedling client attributes <client_id>` takes the same options.
Registered without them, the site still signs people in, and is refused when a visitor
makes it ask for more.

Each prints a `client_id`; the first also prints a `client_secret`, once. Put them in a
`.env` file (ignored by git):

```shell
ISSUER=http://localhost:8080
CLIENT_ID=…
CLIENT_SECRET=…
PUBLIC_CLIENT_ID=…
SESSION_SECRET=…        # any long random text: signs this site's own cookies
```

```shell
pnpm install
pnpm dev                # http://localhost:8788
```

Plain `http` is accepted for `localhost` only, by the server (for the addresses a site
registers) and by this site (for the server it talks to).

## Checks

```shell
pnpm typecheck
pnpm lint
pnpm test               # the site against a server played by the test
pnpm test.e2e           # the site against a real server, with a passkey
```

`pnpm test.e2e` needs the two sibling repositories: `../server-seedling` (or
`BRIGID_SERVER_DIR`), and the interface already built in `../app/dist` (or
`BRIGID_APP_DIST`).

## Online

The site is a Cloudflare Worker (`wrangler.jsonc`), deployed by
`.github/workflows/deploy.yml` when `main` changes. Its registration on the project's
server and the key of its cookies are Worker secrets, set once and kept across deploys:

```shell
pnpm exec wrangler secret put CLIENT_ID
pnpm exec wrangler secret put CLIENT_SECRET
pnpm exec wrangler secret put PUBLIC_CLIENT_ID
pnpm exec wrangler secret put SESSION_SECRET
```

Until they are set, the site says that it is not connected to a server yet.

The site keeps no database and no log of who signs in. What it shows after a sign-in
comes from a signed cookie in the person's own browser, which expires after an hour.

## Licence

[MIT](LICENSE): this is example code, meant to be copied. The fonts in `public/fonts/`
are Geist and Geist Mono, under the SIL Open Font License 1.1
([`public/fonts/OFL-Geist.txt`](public/fonts/OFL-Geist.txt)).
