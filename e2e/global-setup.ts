/**
 * Once the server runs: registers this site on it, twice (with a secret for
 * the server-side flow, without for the page that runs in the browser), the
 * way an administrator does, then starts the site with what was printed.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { DEMO, MASTER_KEY, SERVER, SERVER_DIR } from "../playwright.config.ts";
import { serve } from "../src/node.ts";

function register(...args: string[]): Record<string, string> {
  const out = execFileSync(
    "cargo",
    [
      "run",
      "--quiet",
      "--manifest-path",
      path.join(SERVER_DIR, "Cargo.toml"),
      "--",
      "client",
      "add",
      ...args,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        BRIGID_MASTER_KEY: MASTER_KEY,
        BRIGID_DATABASE__PATH: process.env.E2E_DATABASE,
      },
    },
  );
  // `client_id=…` and, once, `client_secret=…`.
  return Object.fromEntries(
    out
      .split("\n")
      .filter((line) => /^[a-z_]+=/.test(line))
      .map((line) => line.split(/=(.*)/s).slice(0, 2) as [string, string]),
  );
}

export default async function setup() {
  const site = register(
    "--name",
    "brig·id demo",
    "--redirect-uri",
    `${DEMO}/callback`,
  );
  const page = register(
    "--name",
    "brig·id demo (browser)",
    "--redirect-uri",
    `${DEMO}/browser/`,
    "--public",
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
