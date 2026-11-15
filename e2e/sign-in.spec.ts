import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { DEMO, SERVER } from "../playwright.config.ts";

/** A passkey without hardware: Chrome's virtual authenticator. */
async function virtualAuthenticator(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable", { enableUI: false });
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

/** A new account on the server, with its three starting identities. */
async function createAccount(page: Page) {
  await page.goto(`${SERVER}/signup/`);
  await expect(async () => {
    await page
      .getByRole("button", { name: "Create my account" })
      .click({ timeout: 2000 });
    await expect(page).toHaveURL(/\/welcome\//, { timeout: 4000 });
  }).toPass({ timeout: 30_000 });
  await page.getByLabel("I kept my recovery code").check();
  await page.getByRole("button", { name: "Continue to my identities" }).click();
  await expect(page.locator(".identity-name")).toHaveText([
    "Public",
    "Personal",
    "Work",
  ]);
}

/** On the server's page: choose `identity` and go back to the site. */
async function chooseIdentity(page: Page, identity: string) {
  await expect(page).toHaveURL(new RegExp(`^${SERVER}/continue/`));
  await expect(
    page.getByRole("heading", { name: /Continue to brig·id demo/ }),
  ).toBeVisible();
  await page.getByRole("radio", { name: identity }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

const identifier = (page: Page) => page.locator(".claims .main td > .mono");

test("the site meets an identity: one identifier per identity, stable, and nothing else", async ({
  page,
  context,
}) => {
  await virtualAuthenticator(context, page);
  await createAccount(page);

  // -- signed in on the server, sent there by the site -------------------------
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in with brig·id" }).click();
  // Several identities, none remembered for this site: nothing is chosen
  // for the person.
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
  await chooseIdentity(page, "Personal");

  await expect(page).toHaveURL(`${DEMO}/`);
  await expect(
    page.getByRole("heading", { name: "You are signed in" }),
  ).toBeVisible();
  const personal = (await identifier(page).textContent())!;
  expect(personal.length).toBeGreaterThan(20);

  // Everything received is on the page, and it describes nobody.
  const claims = page.locator(".claims th");
  await expect(claims).toHaveText([
    "sub",
    "iss",
    "aud",
    "auth_time",
    "iat",
    "exp",
    "nonce",
    "jti",
  ]);
  await expect(page.locator(".claims")).toContainText(SERVER);
  await expect(page.locator(".claims")).not.toContainText("Personal");

  // -- another identity is a stranger -------------------------------------------
  await page
    .getByRole("link", { name: "Sign in with another identity" })
    .click();
  // The identity this site last met is offered first.
  await expect(page.getByRole("radio", { name: "Personal" })).toBeChecked();
  await chooseIdentity(page, "Work");
  await expect(
    page.getByRole("heading", { name: "You are signed in" }),
  ).toBeVisible();
  const work = (await identifier(page).textContent())!;
  expect(work).not.toBe(personal);
  await expect(page.getByText("2 identifiers")).toBeVisible();

  // -- the same identity is the same person, every time --------------------------
  await page
    .getByRole("link", { name: "Sign in with another identity" })
    .click();
  await chooseIdentity(page, "Personal");
  await expect(identifier(page)).toHaveText(personal);

  // -- going back without signing in --------------------------------------------
  await page
    .getByRole("link", { name: "Sign in with another identity" })
    .click();
  await page.getByRole("button", { name: /Cancel and go back to/ }).click();
  await expect(page.getByRole("alert")).toContainText(
    "went back without signing in",
  );

  // -- the page that does it all in the browser is another application ----------
  await page.goto("/browser/");
  await page.getByRole("button", { name: "Sign in with brig·id" }).click();
  await chooseIdentity(page, "Personal");
  await expect(page).toHaveURL(`${DEMO}/browser/`);
  await expect(page.getByRole("status")).toContainText("To this page, you are");
  // The cards of the result keep the page's spacing: none touches the next.
  const cards = await page
    .locator("main .card")
    .evaluateAll((all) =>
      all
        .map((card) => card.getBoundingClientRect())
        .map((box) => [box.top, box.bottom]),
    );
  expect(cards.length).toBeGreaterThan(3);
  for (let i = 1; i < cards.length; i++) {
    expect(cards[i]![0]! - cards[i - 1]![1]!).toBeGreaterThanOrEqual(16);
  }
  const inBrowser = (await identifier(page).textContent())!;
  // Same person, same identity, another application: another identifier.
  expect(inBrowser).not.toBe(personal);
  expect(inBrowser).not.toBe(work);
});

test("someone not signed in on the server uses their passkey there, then comes back", async ({
  page,
  context,
  browser,
}) => {
  await virtualAuthenticator(context, page);
  await createAccount(page);
  // Signed out of the server; the passkey stays in the authenticator.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(`${SERVER}/`);

  await page.goto("/");
  await page.getByRole("link", { name: "Sign in with brig·id" }).click();
  await expect(page.getByText("Sign in to choose the identity")).toBeVisible();
  await expect(async () => {
    await page
      .getByRole("button", { name: "Use my passkey" })
      .click({ timeout: 2000 });
    await expect(page.getByRole("radio", { name: "Personal" })).toBeVisible({
      timeout: 4000,
    });
  }).toPass({ timeout: 30_000 });
  await chooseIdentity(page, "Personal");
  await expect(
    page.getByRole("heading", { name: "You are signed in" }),
  ).toBeVisible();

  // Forgetting is this site's own business: the server is not asked.
  await page.getByRole("button", { name: "Forget me" }).click();
  await expect(
    page.getByRole("link", { name: "Sign in with brig·id" }),
  ).toBeVisible();

  // An answer replayed in another browser is worth nothing there.
  const other = await browser.newContext();
  const stranger = await other.newPage();
  await stranger.goto(`${DEMO}/callback?code=anything&state=anything`);
  await expect(stranger.getByRole("alert")).toContainText("matches no request");
  await other.close();
});
