/**
 * DPoP (Demonstrating Proof of Possession) implementation for AT Protocol
 * Uses Web Crypto API for Deno compatibility
 */

import { exportJWK, SignJWT } from "jsr:@panva/jose@^6.1.0";
import { DPoPError } from "./errors.ts";

export interface DPoPKeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  privateKeyJWK: JsonWebKey;
  publicKeyJWK: JsonWebKey;
}

/**
 * Generate ES256 key pair for DPoP operations
 */
export async function generateDPoPKeyPair(): Promise<DPoPKeyPair> {
  try {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      true, // extractable
      ["sign", "verify"],
    );

    // Export keys as JWK
    const publicKeyJWK = await exportJWK(keyPair.publicKey);
    const privateKeyJWK = await exportJWK(keyPair.privateKey);

    return {
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      privateKeyJWK,
      publicKeyJWK,
    };
  } catch (error) {
    throw new DPoPError("Failed to generate DPoP key pair", error as Error);
  }
}

/**
 * Generate DPoP proof JWT
 */
export async function generateDPoPProof(
  method: string,
  url: string,
  privateKey: CryptoKey,
  publicKeyJWK: JsonWebKey,
  accessToken?: string,
  nonce?: string,
): Promise<string> {
  try {
    // Create DPoP JWT payload
    const payload: Record<string, unknown> = {
      jti: crypto.randomUUID(),
      htm: method,
      htu: url,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (5 * 60), // Expires in 5 minutes
    };

    if (accessToken) {
      // Hash access token for ath claim
      const encoder = new TextEncoder();
      const data = encoder.encode(accessToken);
      const digest = await crypto.subtle.digest("SHA-256", data);
      payload.ath = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/[+/]/g, (match) => match === "+" ? "-" : "_")
        .replace(/=/g, "");
    }

    if (nonce) {
      payload.nonce = nonce;
    }

    // Sign JWT using Web Crypto
    const dpopProof = await new SignJWT(payload)
      .setProtectedHeader({
        typ: "dpop+jwt",
        alg: "ES256",
        jwk: publicKeyJWK,
      })
      .sign(privateKey);

    return dpopProof;
  } catch (error) {
    throw new DPoPError("Failed to generate DPoP proof", error as Error);
  }
}

/**
 * Import private key from JWK for DPoP operations
 */
export async function importPrivateKeyFromJWK(
  privateKeyJWK: JsonWebKey,
): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey(
      "jwk",
      privateKeyJWK,
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      false, // not extractable
      ["sign", "verify"],
    );
  } catch (error) {
    throw new DPoPError("Failed to import private key from JWK", error as Error);
  }
}

/**
 * Make authenticated DPoP request with automatic nonce handling
 */
export async function makeDPoPRequest(
  method: string,
  url: string,
  accessToken: string,
  privateKey: CryptoKey,
  publicKeyJWK: JsonWebKey,
  body?: string,
  headers: HeadersInit = {},
): Promise<Response> {
  try {
    // Generate initial DPoP proof
    let dpopProof = await generateDPoPProof(
      method,
      url,
      privateKey,
      publicKeyJWK,
      accessToken,
    );

    const requestHeaders: HeadersInit = {
      "Authorization": `DPoP ${accessToken}`,
      "DPoP": dpopProof,
      "Content-Type": "application/json",
      ...headers,
    };

    const fetchOptions: RequestInit = {
      method,
      headers: requestHeaders,
    };
    if (body) {
      fetchOptions.body = body;
    }

    let response = await fetch(url, fetchOptions);

    // Handle DPoP nonce challenge
    if (response.status === 401) {
      const dpopNonce = response.headers.get("DPoP-Nonce");
      if (dpopNonce) {
        // Generate new proof with nonce
        dpopProof = await generateDPoPProof(
          method,
          url,
          privateKey,
          publicKeyJWK,
          accessToken,
          dpopNonce,
        );

        (requestHeaders as Record<string, string>)["DPoP"] = dpopProof;

        const retryOptions: RequestInit = {
          method,
          headers: requestHeaders,
        };
        if (body) {
          retryOptions.body = body;
        }

        response = await fetch(url, retryOptions);
      }
    }

    return response;
  } catch (error) {
    throw new DPoPError("Failed to make DPoP request", error as Error);
  }
}
