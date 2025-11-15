/**
 * @fileoverview PKCE (Proof Key for Code Exchange) utilities for OAuth 2.0
 * @module
 */

/**
 * Generate a cryptographically random code verifier for PKCE.
 *
 * Creates a URL-safe base64-encoded string from 32 random bytes, which is
 * used to protect the authorization code exchange in OAuth 2.0 flows.
 *
 * @returns Code verifier string (43-128 characters, URL-safe base64)
 * @see https://datatracker.ietf.org/doc/html/rfc7636#section-4.1
 *
 * @example
 * ```ts
 * const verifier = generateCodeVerifier();
 * console.log(verifier); // "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
 * ```
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Generate a code challenge from a code verifier for PKCE.
 *
 * Creates a URL-safe base64-encoded SHA-256 hash of the code verifier,
 * which is sent to the authorization server during the initial request.
 *
 * @param verifier - Code verifier string
 * @returns Promise resolving to code challenge string (URL-safe base64)
 * @see https://datatracker.ietf.org/doc/html/rfc7636#section-4.2
 *
 * @example
 * ```ts
 * const verifier = generateCodeVerifier();
 * const challenge = await generateCodeChallenge(verifier);
 * console.log(challenge); // "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
 * ```
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Convert a byte array to URL-safe base64 encoding.
 *
 * Encodes the input bytes as base64 and makes it URL-safe by replacing
 * `+` with `-`, `/` with `_`, and removing `=` padding.
 *
 * @param data - Byte array to encode
 * @returns URL-safe base64 encoded string
 * @internal
 *
 * @example
 * ```ts
 * const bytes = new Uint8Array([72, 101, 108, 108, 111]);
 * const encoded = base64UrlEncode(bytes);
 * console.log(encoded); // "SGVsbG8"
 * ```
 */
export function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}
