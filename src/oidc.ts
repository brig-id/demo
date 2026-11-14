/**
 * Signing in with a brig·id server, as any website would: the OpenID Connect
 * Authorization Code flow with PKCE, done with an ordinary library
 * (oauth4webapi). Nothing here is specific to brig·id.
 *
 * The same code runs on the server (a client that keeps a secret) and in the
 * browser (a public client, protected by PKCE alone).
 */
import * as oauth from "oauth4webapi";

export interface ClientConfig {
  /** The brig·id server, e.g. `https://id.example.org`. */
  issuer: string;
  /** Given by the server's administrator when the site was registered. */
  clientId: string;
  /** Where the server sends the person back; registered with the site. */
  redirectUri: string;
  /** Only for a site that can keep one: never sent to a browser. */
  clientSecret?: string;
  /** For tests. */
  fetch?: typeof fetch;
}

/** What is remembered between sending the person away and their return. */
export interface Transaction {
  state: string;
  nonce: string;
  verifier: string;
}

/** What the site learns about the person. All of it. */
export interface Claims {
  /** The identifier: one per identity and per site. */
  sub: string;
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
  auth_time?: number;
  nonce?: string;
  jti?: string;
  [claim: string]: unknown;
}

/** The server said no, or the answer could not be trusted. */
export class SignInError extends Error {
  /** The protocol's error code when the server gave one (`access_denied`…). */
  code: string | null;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "SignInError";
    this.code = code;
  }
}

function requestOptions(config: ClientConfig) {
  return {
    // Plain http is for a server on this machine, during development.
    [oauth.allowInsecureRequests]: new URL(config.issuer).protocol === "http:",
    ...(config.fetch ? { [oauth.customFetch]: config.fetch } : {}),
  };
}

/** Reads what the server publishes about itself. */
export async function discover(
  config: ClientConfig,
): Promise<oauth.AuthorizationServer> {
  const issuer = new URL(config.issuer);
  try {
    const response = await oauth.discoveryRequest(issuer, {
      algorithm: "oidc",
      ...requestOptions(config),
    });
    return await oauth.processDiscoveryResponse(issuer, response);
  } catch (cause) {
    throw new SignInError(
      `The server at ${issuer.host} did not describe itself: it may be down, or not serve sign-in for sites yet.`,
      cause instanceof Error && "code" in cause ? String(cause.code) : null,
    );
  }
}

/**
 * Where to send the person, and what to remember until they come back.
 * `chooseIdentity` asks the server to show its choice of identities even if
 * one is remembered for this site.
 */
export async function begin(
  config: ClientConfig,
  options: { chooseIdentity?: boolean } = {},
): Promise<{ url: URL; transaction: Transaction }> {
  const as = await discover(config);
  if (!as.authorization_endpoint) {
    throw new SignInError("The server names no authorization endpoint.");
  }
  const transaction: Transaction = {
    state: oauth.generateRandomState(),
    nonce: oauth.generateRandomNonce(),
    verifier: oauth.generateRandomCodeVerifier(),
  };
  const url = new URL(as.authorization_endpoint);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  // `openid` is all there is to ask for: the identifier.
  url.searchParams.set("scope", "openid");
  url.searchParams.set("state", transaction.state);
  url.searchParams.set("nonce", transaction.nonce);
  url.searchParams.set(
    "code_challenge",
    await oauth.calculatePKCECodeChallenge(transaction.verifier),
  );
  url.searchParams.set("code_challenge_method", "S256");
  if (options.chooseIdentity) url.searchParams.set("prompt", "select_account");
  return { url, transaction };
}

/**
 * The person is back: checks the answer, exchanges the code, verifies the
 * ID token (signature, issuer, audience, nonce, expiry) and returns its
 * claims. `returnedTo` is the address they came back to.
 */
export async function finish(
  config: ClientConfig,
  returnedTo: URL,
  transaction: Transaction,
): Promise<Claims> {
  const as = await discover(config);
  const client: oauth.Client = { client_id: config.clientId };
  const authentication = config.clientSecret
    ? oauth.ClientSecretBasic(config.clientSecret)
    : oauth.None();
  try {
    const params = oauth.validateAuthResponse(
      as,
      client,
      returnedTo,
      transaction.state,
    );
    const response = await oauth.authorizationCodeGrantRequest(
      as,
      client,
      authentication,
      params,
      config.redirectUri,
      transaction.verifier,
      requestOptions(config),
    );
    const result = await oauth.processAuthorizationCodeResponse(
      as,
      client,
      response,
      { expectedNonce: transaction.nonce, requireIdToken: true },
    );
    // The library trusts an ID token received straight from the token
    // endpoint over TLS; its signature is checked all the same, against
    // the keys the server publishes.
    await oauth.validateApplicationLevelSignature(
      as,
      response,
      requestOptions(config),
    );
    const claims = oauth.getValidatedIdTokenClaims(result);
    if (!claims) throw new SignInError("The server sent no ID token.");
    return claims as Claims;
  } catch (cause) {
    if (cause instanceof SignInError) throw cause;
    if (cause instanceof oauth.AuthorizationResponseError) {
      throw new SignInError(
        cause.error === "access_denied"
          ? "You went back without signing in."
          : `The server refused the request (${cause.error}).`,
        cause.error,
      );
    }
    if (cause instanceof oauth.ResponseBodyError) {
      throw new SignInError(
        `The server refused the code (${cause.error}).`,
        cause.error,
      );
    }
    throw new SignInError(
      "The server's answer could not be verified, so it was not used.",
      cause instanceof Error && "code" in cause ? String(cause.code) : null,
    );
  }
}
