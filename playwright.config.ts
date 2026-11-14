import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// The suite signs in for real: a brig·id server (`server-seedling`) serving
// its own interface (`app`, built), a passkey from a virtual authenticator,
// and this site. The two repositories are siblings by default:
//
//   BRIGID_SERVER_DIR   the server's checkout          (../server-seedling)
//   BRIGID_APP_DIST     the interface, already built   (../app/dist)
export const SERVER_DIR =
  process.env.BRIGID_SERVER_DIR ?? path.resolve(here, "../server-seedling");
export const APP_DIST =
  process.env.BRIGID_APP_DIST ?? path.resolve(here, "../app/dist");

// Two sites in the browser's sense (a name and an address): the server's
// session cookie (`SameSite=Strict`) is not sent when this site sends
// someone there. Both are reachable from Node too, which the server side of
// this site needs: `*.localhost` names resolve in browsers only.
export const SERVER = "http://localhost:8080";
export const DEMO = "http://127.0.0.1:8788";

export const MASTER_KEY =
  "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0";
// One database per run, shared with e2e/global-setup.ts, which registers
// this site on it.
process.env.E2E_DATABASE ??= path.join(
  os.tmpdir(),
  `brigid-demo-e2e-${Date.now()}.db`,
);

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: DEMO, trace: "on-first-retry" },
  // A passkey needs a virtual authenticator, which Playwright only has for
  // Chromium.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `cargo run --manifest-path ${path.join(SERVER_DIR, "Cargo.toml")}`,
      port: 8080,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        BRIGID_MASTER_KEY: MASTER_KEY,
        BRIGID_SERVER__DOMAIN: "localhost",
        BRIGID_SERVER__HOST: "127.0.0.1",
        BRIGID_SERVER__PORT: "8080",
        BRIGID_SERVER__PUBLIC_URL: SERVER,
        BRIGID_SERVER__UI_DIST_DIR: APP_DIST,
        BRIGID_DATABASE__PATH: process.env.E2E_DATABASE,
      },
    },
  ],
});
