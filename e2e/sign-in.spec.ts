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

/** A new account on the server, with the three identities its onboarding
 * proposes. */
async function createAccount(page: Page) {
  await page.goto(`${SERVER}/signup/`);
  await expect(async () => {
    await page
      .getByRole("button", { name: "Create my account" })
      .click({ timeout: 2000 });
    await expect(page).toHaveURL(/\/welcome\//, { timeout: 4000 });
  }).toPass({ timeout: 30_000 });
  // The page creates the recovery code by itself, which takes a moment.
  // Refused for going too fast, it says so and offers a button: a person
  // would press it, or load the page again a little later. Loaded again once
  // the code exists, the page no longer shows it, and offers a new one.
  const kept = page.getByLabel("I kept my recovery code");
  const button = (name: string) => page.getByRole("button", { name });
  await expect(async () => {
    try {
      await expect(kept).toBeVisible({ timeout: 5000 });
      return;
    } catch {
      // Not there yet: do what the page offers.
    }
    if (await button("Create a recovery code").isVisible()) {
      await button("Create a recovery code").click({ timeout: 2000 });
    } else if (await button("Create a new code").isVisible()) {
      await button("Create a new code").click({ timeout: 2000 });
      await button("Replace it").click({ timeout: 2000 });
    } else {
      await page.reload();
    }
    await expect(kept).toBeVisible({ timeout: 4000 });
  }).toPass({ timeout: 60_000 });
  await kept.check();
  // Continuing creates the identities the onboarding proposes. The server
  // limits how fast an account's pages may write: refused, the page says so
  // and stays, and a person would press again.
  await expect(async () => {
    await page
      .getByRole("button", { name: "Continue to my identities" })
      .click({ timeout: 2000 });
    await expect(page).toHaveURL(/\/identities\/$/, { timeout: 4000 });
  }).toPass({ timeout: 40_000 });
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
    page.getByRole("heading", { name: /Continue to Shared Gardens/ }),
  ).toBeVisible();
  await page.getByRole("radio", { name: identity }).check();
  // Refused for going too fast ("Too many attempts"), the server's page says
  // so and stays: a person would press again.
  await expect(async () => {
    await page
      .getByRole("button", { name: "Continue", exact: true })
      .click({ timeout: 2000 });
    await expect(page).toHaveURL(new RegExp(`^${DEMO}/`), { timeout: 3000 });
  }).toPass({ timeout: 40_000 });
}

const identifier = (page: Page) => page.locator(".claims .main td > .mono");

test("the site meets an identity: one identifier per identity, stable, and nothing else", async ({
  page,
  context,
}) => {
  await virtualAuthenticator(context, page);
  await createAccount(page);

  // -- signed in on the server, sent there by the page for developers ----------
  // It asks for the identifier alone: nothing is ticked.
  await page.goto("/");
  await page.getByRole("link", { name: "For developers" }).click();
  await expect(page).toHaveURL(`${DEMO}/developers/`);
  await page.getByRole("button", { name: "Sign in with brig·id" }).click();
  // Several identities, none remembered for this site: nothing is chosen
  // for the person.
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
  await chooseIdentity(page, "Personal");

  await expect(page).toHaveURL(`${DEMO}/developers/`);
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
    .getByRole("button", { name: "Sign in with another identity" })
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
    .getByRole("button", { name: "Sign in with another identity" })
    .click();
  await chooseIdentity(page, "Personal");
  await expect(identifier(page)).toHaveText(personal);

  // -- going back without signing in --------------------------------------------
  await page
    .getByRole("button", { name: "Sign in with another identity" })
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

  await page.goto("/developers/");
  await page.getByRole("button", { name: "Sign in with brig·id" }).click();
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
  await expect(page).toHaveURL(`${DEMO}/developers/`);
  await expect(
    page.getByRole("button", { name: "Sign in with brig·id" }),
  ).toBeVisible();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Seeds, tips and tools/ }),
  ).toBeVisible();

  // An answer replayed in another browser is worth nothing there.
  const other = await browser.newContext();
  const stranger = await other.newPage();
  await stranger.goto(`${DEMO}/callback?code=anything&state=anything`);
  await expect(stranger.getByRole("alert")).toContainText("matches no request");
  await other.close();
});

test("the forum asks for a username and an e-mail address: the person decides, and the forum says what it learned", async ({
  page,
  context,
}) => {
  await virtualAuthenticator(context, page);
  await createAccount(page);

  const asked = page.getByRole("group", { name: "Shared Gardens asks for" });
  const next = page.getByRole("button", { name: "Continue", exact: true });
  const username = asked.getByRole("checkbox", { name: /Username/ });
  const email = asked.getByRole("checkbox", { name: /E-mail address/ });
  const firstName = asked.getByRole("checkbox", { name: /First name/ });
  /** One line of what the forum says it knows. */
  const knows = (name: string) =>
    page.locator(".fact").filter({
      has: page.locator(".fact-name", { hasText: name }),
    });
  const again = page.getByRole("button", {
    name: "Sign in with another identity",
  });
  /** Continues to the site. Refused for going too fast, the server's page
   * says so and stays: a person would press again. */
  const proceed = () =>
    expect(async () => {
      await next.click({ timeout: 2000 });
      await expect(page).toHaveURL(new RegExp(`^${DEMO}/`), { timeout: 3000 });
    }).toPass({ timeout: 40_000 });
  /** Puts a value on the identity from the server's page. The server limits
   * how fast an account's pages may write; refused, the page says so and
   * keeps the field, and a person would press again. */
  const addToIdentity = (label: string, value: string) =>
    expect(async () => {
      await asked.getByLabel(`${label} of this identity`).fill(value);
      await asked
        .locator(".asked-row", { hasText: label })
        .getByRole("button", { name: "Add to this identity" })
        .click({ timeout: 2000 });
      await expect(
        asked.getByRole("checkbox", { name: new RegExp(label) }),
      ).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 40_000 });

  // -- the forum, as anyone finds it ------------------------------------------------
  await page.goto("/");
  await expect(page.getByText("A username", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign in with brig·id" }).click();

  // The server's page lists what the forum asks, marked as its document says.
  // The identity has none of it yet: the required username stops everything.
  await expect(page).toHaveURL(new RegExp(`^${SERVER}/continue/`));
  await page.getByRole("radio", { name: "Work" }).check();
  await expect(asked.locator(".asked-row")).toHaveCount(3);
  await expect(asked.getByText("Required", { exact: true })).toHaveCount(1);
  await expect(next).toBeDisabled();
  await addToIdentity("Username", "ada_l");
  await expect(username).not.toBeChecked();
  await addToIdentity("E-mail address", "ada@work.example");
  await addToIdentity("First name", "Ada");

  // -- everything accepted ---------------------------------------------------------
  await username.check();
  await email.check();
  await firstName.check();
  await proceed();
  await expect(page).toHaveURL(`${DEMO}/`);
  await expect(
    page.getByRole("heading", { name: "Hello, ada_l" }),
  ).toBeVisible();
  await expect(knows("Username")).toContainText("ada_l");
  await expect(knows("First name")).toContainText("Ada");
  await expect(knows("E-mail address")).toContainText("ada@work.example");
  await expect(knows("E-mail address")).toContainText(
    "writes to you there when someone replies",
  );

  // A post, shown with the username.
  await page.getByLabel("Your post").fill("Spare rhubarb by plot 3, anyone?");
  await page.getByRole("button", { name: "Post as ada_l" }).click();
  const mine = page.locator(".post.own");
  await expect(mine).toContainText("Spare rhubarb by plot 3, anyone?");
  await expect(mine).toContainText("ada_l");

  // The page for developers shows the same sign-in, in its own words.
  await page.goto("/developers/");
  const came = (label: string) =>
    page.locator(".asked tr").filter({ hasText: label });
  await expect(came("Username")).toContainText("ada_l");
  await expect(came("E-mail address")).toContainText("ada@work.example");
  await Promise.all(
    ["preferred_username", "email", "email_verified", "given_name"].map(
      (claim) =>
        expect(
          page
            .locator(".claims th")
            .filter({ hasText: new RegExp(`^${claim}$`) }),
        ).toHaveCount(1),
    ),
  );
  const withEverything = (await identifier(page).textContent())!;

  // -- the required attribute refused: no sign-in ------------------------------------
  await page.goto("/");
  await again.click();
  await username.uncheck();
  await expect(next).toBeDisabled();
  // Refused for going too fast, the server's page says so and stays.
  await expect(async () => {
    await page
      .getByRole("button", { name: /Cancel and go back to/ })
      .click({ timeout: 2000 });
    await expect(page).toHaveURL(new RegExp(`^${DEMO}/`), { timeout: 3000 });
  }).toPass({ timeout: 40_000 });
  await expect(
    page.getByRole("heading", { name: "You are not signed in" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "went back without signing in",
  );
  await expect(page.locator("main")).toContainText(
    "To post, sign in and share a username",
  );

  // -- a value changes on the identity: the server asks again ------------------------
  await page.goto(`${SERVER}/identities/`);
  await page.getByRole("link", { name: "Open (Work)" }).click();
  await page.getByRole("tab", { name: "My information" }).click();
  await page.getByRole("button", { name: "Edit My information" }).click();
  await page.getByLabel("E-mail address").fill("ada@new.example");
  await expect(async () => {
    await page
      .getByRole("button", { name: "Save", exact: true })
      .click({ timeout: 2000 });
    await expect(page.getByRole("status")).toContainText("asking you again", {
      timeout: 3000,
    });
  }).toPass({ timeout: 40_000 });

  await page.goto("/");
  await again.click();
  await expect(asked.getByText("ada@new.example")).toBeVisible();
  // The acceptance was for the old address: it is not ticked. The username
  // did not change, and stays accepted.
  await expect(email).not.toBeChecked();
  await expect(username).toBeChecked();
  await email.check();
  await proceed();
  await expect(knows("E-mail address")).toContainText("ada@new.example");

  // -- an optional attribute refused: signed in all the same -----------------------
  await page.goto("/");
  await again.click();
  await expect(page.getByRole("radio", { name: "Work" })).toBeChecked();
  // What was accepted is remembered, with its values.
  await expect(username).toBeChecked();
  await expect(email).toBeChecked();
  await email.uncheck();
  await proceed();
  await expect(page).toHaveURL(`${DEMO}/`);
  await expect(
    page.getByRole("heading", { name: "Hello, ada_l" }),
  ).toBeVisible();
  await expect(knows("E-mail address")).toContainText(
    "You did not share an e-mail address: you will not be told of replies.",
  );
  await expect(page.getByText("ada@new.example")).toHaveCount(0);
  // The same identity keeps its post, and is the same person to the site.
  await expect(mine).toContainText("Spare rhubarb");
  await page.goto("/developers/");
  await expect(identifier(page)).toHaveText(withEverything);

  // -- the page in the browser is another application: it starts from nothing --------
  await page.goto("/browser/");
  await page.getByLabel(/A username and a first name/).check();
  await page.getByLabel(/An e-mail address/).check();
  await page.getByRole("button", { name: "Sign in with brig·id" }).click();
  await page.getByRole("radio", { name: "Work" }).check();
  const inBrowser = page.getByRole("group", {
    name: "Shared Gardens (in the browser) asks for",
  });
  await expect(
    inBrowser.getByRole("checkbox", { name: /Username/ }),
  ).not.toBeChecked();
  await inBrowser.getByRole("checkbox", { name: /Username/ }).check();
  await inBrowser.getByRole("checkbox", { name: /E-mail address/ }).check();
  await proceed();
  await expect(page).toHaveURL(`${DEMO}/browser/`);
  await expect(came("Username")).toContainText("ada_l");
  await expect(came("E-mail address")).toContainText("ada@new.example");
  await expect(came("First name")).toContainText("Not received");
  await expect(page.getByLabel(/An e-mail address/)).toBeChecked();
});
