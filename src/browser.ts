/**
 * The page that signs in entirely in the browser: a public client. It uses
 * the same module as the server (`oidc.ts`), without a secret.
 *
 * What it remembers lives in `sessionStorage`: gone with the tab.
 */
import {
  begin,
  type Claims,
  finish,
  type Scope,
  SCOPES,
  type Transaction,
} from "./oidc.ts";
import { askedTable, claimsTable, notReceived, seenList } from "./pages.ts";

const TRANSACTION = "demo.transaction";
const SEEN = "demo.seen";

const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const button = element<HTMLButtonElement>("sign-in");
const status = element<HTMLParagraphElement>("status");

const { issuer = "", clientId = "" } = document.body.dataset;
const config = {
  issuer,
  clientId,
  redirectUri: `${location.origin}/browser/`,
};

function read<T>(key: string): T | null {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

const boxes = () =>
  [
    ...document.querySelectorAll<HTMLInputElement>('#asks input[name="ask"]'),
  ] as HTMLInputElement[];

/** What the visitor ticked on this page. */
function ticked(): Scope[] {
  const values = new Set(
    boxes()
      .filter((box) => box.checked)
      .map((box) => box.value),
  );
  return SCOPES.filter((scope) => values.has(scope));
}

function show(claims: Claims, asked: Scope[]) {
  const seen = [
    ...(read<string[]>(SEEN) ?? []).filter((s) => s !== claims.sub),
    claims.sub,
  ].slice(-6);
  sessionStorage.setItem(SEEN, JSON.stringify(seen));
  // These functions escape every value they are given.
  element("asked").innerHTML = askedTable(asked, claims);
  element("claims").innerHTML = claimsTable(claims);
  element("seen").innerHTML = seenList(seen, claims.sub);
  element("not-received").innerHTML = notReceived(asked);
  // The next request starts from the same choices.
  for (const box of boxes()) box.checked = asked.includes(box.value as Scope);
  element("result").hidden = false;
  button.textContent = "Sign in with another identity";
  status.textContent =
    asked.length === 0
      ? `To this page, you are ${claims.sub}. That is all it knows.`
      : `To this page, you are ${claims.sub}. It knows that, and what you accepted to share.`;
}

async function comeBack() {
  const transaction = read<Transaction>(TRANSACTION);
  sessionStorage.removeItem(TRANSACTION);
  const returnedTo = new URL(location.href);
  // The address with the code is left at once.
  history.replaceState(null, "", location.pathname);
  if (!transaction) {
    status.textContent = "This answer matches no request made from this tab.";
    return;
  }
  status.textContent = "Checking the answer…";
  try {
    show(
      await finish(config, returnedTo, transaction),
      transaction.scopes ?? [],
    );
  } catch (err) {
    status.textContent =
      err instanceof Error ? err.message : "Unexpected error.";
  }
}

button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = "Asking the server…";
  try {
    const { url, transaction } = await begin(config, {
      chooseIdentity: (read<string[]>(SEEN) ?? []).length > 0,
      scopes: ticked(),
    });
    sessionStorage.setItem(TRANSACTION, JSON.stringify(transaction));
    location.assign(url);
  } catch (err) {
    status.textContent =
      err instanceof Error ? err.message : "Unexpected error.";
    button.disabled = false;
  }
});

if (!issuer || !clientId) {
  status.textContent =
    "This demonstration is not connected to a brig·id server yet.";
} else {
  button.disabled = false;
  status.textContent = `You will be sent to ${new URL(issuer).host}, and back.`;
  const params = new URLSearchParams(location.search);
  if (params.has("code") || params.has("error")) void comeBack();
}
