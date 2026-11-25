/**
 * Once the server runs: opens it to new accounts (a new server takes them by
 * invitation, and the suite creates its own), registers this site on it,
 * twice (with a secret for the server-side flow, without for the page that
 * runs in the browser), the way its operator does on the machine, then starts
 * the site with what was printed.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { DEMO, MASTER_KEY, SERVER, SERVER_DIR } from "../playwright.config.ts";
import { serve } from "../src/node.ts";

/** `seedling …` on the database of the running server. */
function seedling(...args: string[]): string {
  return execFileSync(
    "cargo",
    [
      "run",
      "--quiet",
      "--manifest-path",
      path.join(SERVER_DIR, "Cargo.toml"),
      "--",
      ...args,
    ],
    {
      encoding: "utf8",
      // What the command says on error is read below, not printed.
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        BRIGID_MASTER_KEY: MASTER_KEY,
        BRIGID_DATABASE__PATH: process.env.E2E_DATABASE,
      },
    },
  );
}

/**
 * The suite creates many accounts from one address (127.0.0.1), more than a
 * server allows a day by default. A server too old to have the setting has
 * no such limit: its command is unknown, and nothing is changed.
 */
function allowManySignUps() {
  try {
    seedling("limits", "set", "sign_ups_per_ip_per_day", "1000");
  } catch (err) {
    const stderr = String((err as { stderr?: unknown }).stderr ?? "");
    if (!/unrecognized subcommand 'limits'/.test(stderr)) {
      throw new Error(`seedling limits set failed: ${stderr}`, { cause: err });
    }
    console.log(
      "The server has no `limits` command: sign-ups are not limited per address.",
    );
  }
}

function register(...args: string[]): Record<string, string> {
  const out = seedling("client", "add", ...args);
  // `client_id=…` and, once, `client_secret=…`.
  return Object.fromEntries(
    out
      .split("\n")
      .filter((line) => /^[a-z_]+=/.test(line))
      .map((line) => line.split(/=(.*)/s).slice(0, 2) as [string, string]),
  );
}

/** What both registrations may ask for: the same as the site's document
 * (`ATTRIBUTES` in `src/client.ts`) and the commands of `README.md`. */
const MAY_ASK = [
  "--required",
  "preferred_username",
  "--optional",
  "given_name",
  "--optional",
  "email",
];

export default async function setup() {
  seedling("signup", "open");
  allowManySignUps();
  const site = register(
    "--name",
    "Shared Gardens",
    "--redirect-uri",
    `${DEMO}/callback`,
    ...MAY_ASK,
  );
  const page = register(
    "--name",
    "Shared Gardens (in the browser)",
    "--redirect-uri",
    `${DEMO}/browser/`,
    "--public",
    ...MAY_ASK,
  );
  if (!site.client_id || !site.client_secret || !page.client_id) {
    throw new Error("the server did not print the registrations");
  }
  const server = await serve(
    {
      ISSUER: SERVER,
      CLIENT_ID: site.client_id,
      CLIENT_SECRET: site.client_secret,
      PUBLIC_CLIENT_ID: page.client_id,
      SESSION_SECRET: "a-secret-for-the-cookies-of-the-tests",
    },
    Number(new URL(DEMO).port),
    DEMO,
  );
  return () => new Promise<void>((resolve) => server.close(() => resolve()));
}
