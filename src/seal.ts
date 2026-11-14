/**
 * Small values kept in a cookie between two requests, signed so that the
 * site only reads back what it wrote itself (HMAC-SHA-256). Signed, not
 * encrypted: nothing in them is secret from the person whose browser holds
 * them.
 */
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** `value` as `<payload>.<signature>`, valid until `expires` (Unix seconds). */
export async function seal(
  value: unknown,
  secret: string,
  expires: number,
): Promise<string> {
  const payload = toBase64Url(
    encoder.encode(JSON.stringify({ v: value, e: expires })),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await key(secret),
    encoder.encode(payload),
  );
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/** The value, or null when the text was not written by `seal` with this
 * secret, was altered, or has expired. */
export async function unseal<T>(
  sealed: string | undefined,
  secret: string,
  now: number,
): Promise<T | null> {
  if (!sealed) return null;
  const [payload, signature, ...rest] = sealed.split(".");
  if (!payload || !signature || rest.length > 0) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await key(secret),
      fromBase64Url(signature),
      encoder.encode(payload),
    );
    if (!valid) return null;
    const { v, e } = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payload)),
    ) as { v: T; e: number };
    return typeof e === "number" && e > now ? v : null;
  } catch {
    return null;
  }
}
