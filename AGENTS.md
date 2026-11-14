# AGENTS.md — brig·id `demo`

A demonstration website that signs in with a brig·id server: the reference
relying party. It is read by integrators as an example, and its end-to-end
suite is the test of the sign-in of applications across `core`,
`server-seedling` and `app`.

## Language

**All content must be in English** — code, comments, commit messages, issues,
pull requests, and the pages of the site.

## Rules

- **It stays an ordinary OpenID Connect client.** The protocol is done by a
  standard library (`oauth4webapi`), in `src/oidc.ts`. No shortcut that only
  works with brig·id, no hand-written check that the library already does.
- **It stays small enough to read in one sitting.** No framework: a request
  handler over the Fetch API (`src/app.ts`), pages as text (`src/pages.ts`).
  Every value shown goes through `esc`.
- **It keeps nothing about anyone.** No database, no log of sign-ins. State
  lives in signed cookies in the person's browser.
- **A secret never reaches the browser.** `/browser/` uses the public
  registration only.
- The pages load nothing from another origin, and carry a strict Content
  Security Policy (`default-src 'none'`).

## Commands

```bash
pnpm dev          # the site on Node, http://localhost:8788 (needs a .env, see README)
pnpm build        # bundles src/browser.ts into public/browser.js
pnpm typecheck
pnpm lint
pnpm test         # node --test, against a server played by the test
pnpm test.e2e     # playwright, against a real server (see README)
```

## Commit conventions

Format: `type(scope): <emoji> description`. Full type→emoji mapping:
`/workspaces/roots/commit-convention.json`.

| Scope  | Maps to                             |
| ------ | ----------------------------------- |
| `demo` | `src/`, `public/`, `test/`, scripts |
| `e2e`  | `e2e/`, `playwright.config.ts`      |
| `ci`   | `.github/workflows/`                |
| `deps` | Dependency bumps                    |
| `ai`   | Instructions for coding agents      |
| `docs` | README                              |

**Do not use a scope outside this list.** Update this table and `scopes.json`
together if a new scope is needed.

## Roadmap

Tracked as cards in [brig-id Project 1](https://github.com/orgs/brig-id/projects/1),
not in local files.
