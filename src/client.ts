/**
 * How this site describes itself to every brig·id server: two documents it
 * publishes, whose addresses are its `client_id`s. A server reads them when
 * someone signs in; nobody registers the site anywhere.
 *
 * - `/oauth-client-metadata.json`: the site with a server. It proves who it
 *   is with a signature (`private_key_jwt`): the document publishes the public
 *   key, the private one stays here. No secret is shared with any server.
 * - `/browser/oauth-client-metadata.json`: the page that signs in in the
 *   browser. A page cannot keep a key: PKCE alone protects it.
 *
 * The addresses are permanent: the identifier a server gives a person is
 * made from them, so changing them changes everyone's identifier.
 */

/**
 * What the site asks people to share, and whether it needs each one: the
 * forum shows a username on every post, so it cannot work without one; a
 * first name and an e-mail address (to be told of replies) are extras.
 */
export const ATTRIBUTES = {
  preferred_username: "required",
  given_name: "optional",
  email: "optional",
} as const;

/** The site's name, as a server shows it to the person signing in. */
export const NAME = "Shared Gardens";

export const SERVER_DOCUMENT = "/oauth-client-metadata.json";
export const BROWSER_DOCUMENT = "/browser/oauth-client-metadata.json";

/** The signing key of the site with a server, from its private JWK (P-256,
 * ES256), and the public half the document publishes. */
export interface ClientKey {
  key: CryptoKey;
  kid: string;
  publicJwk: JsonWebKey & { kid: string; use: "sig"; alg: "ES256" };
}

/** Reads `CLIENT_KEY`: a private JWK of curve P-256 (README: how to make
 * one). `null` when it is absent or not such a key. */
export async function loadClientKey(
  text: string | undefined,
): Promise<ClientKey | null> {
  if (!text) return null;
  let jwk: JsonWebKey & { kid?: string };
  try {
    jwk = JSON.parse(text) as JsonWebKey & { kid?: string };
  } catch {
    return null;
  }
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d || !jwk.x || !jwk.y)
    return null;
  const kid = jwk.kid ?? "demo";
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, d: jwk.d },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    return {
      key,
      kid,
      publicJwk: {
        kty: "EC",
        crv: "P-256",
        x: jwk.x,
        y: jwk.y,
        kid,
        use: "sig",
        alg: "ES256",
      },
    };
  } catch {
    return null;
  }
}

/** The document at `SERVER_DOCUMENT`, for a site served at `origin`. */
export function serverDocument(origin: string, key: ClientKey) {
  return {
    client_id: `${origin}${SERVER_DOCUMENT}`,
    client_name: NAME,
    client_uri: origin,
    logo_uri: `${origin}/favicon.svg`,
    application_type: "web",
    redirect_uris: [`${origin}/callback`],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    scope: "openid profile email",
    token_endpoint_auth_method: "private_key_jwt",
    jwks: { keys: [key.publicJwk] },
    brigid_attributes: ATTRIBUTES,
  };
}

/** The document at `BROWSER_DOCUMENT`. */
export function browserDocument(origin: string) {
  return {
    client_id: `${origin}${BROWSER_DOCUMENT}`,
    client_name: `${NAME} (in the browser)`,
    client_uri: `${origin}/browser/`,
    logo_uri: `${origin}/favicon.svg`,
    application_type: "web",
    redirect_uris: [`${origin}/browser/`],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    scope: "openid profile email",
    token_endpoint_auth_method: "none",
    brigid_attributes: ATTRIBUTES,
  };
}
