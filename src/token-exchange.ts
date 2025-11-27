/**
 * @fileoverview Token exchange and refresh operations with DPoP support
 * @module
 */

import { generateDPoPProof, importPrivateKeyFromJWK } from "./dpop.ts";
import { TokenExchangeError } from "./errors.ts";
import type { Logger } from "./logger.ts";

/**
 * Token response from OAuth server.
 * @internal
 */
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

/**
 * Fetch tokens with DPoP authentication and automatic nonce retry.
 *
 * Handles DPoP nonce challenges by automatically retrying the request
 * with the nonce when the server returns a 400 status with DPoP-Nonce header.
 *
 * @param tokenUrl - Token endpoint URL
 * @param body - Request body as URLSearchParams
 * @param privateKey - DPoP private key for signing
 * @param publicKeyJWK - DPoP public key JWK
 * @param accessToken - Optional access token for ath claim
 * @param logger - Logger instance for debugging
 * @returns Promise resolving to token response
 * @throws {TokenExchangeError} When token request fails
 * @internal
 */
async function fetchWithDPoPRetry(
  tokenUrl: string,
  body: URLSearchParams,
  privateKey: CryptoKey,
  publicKeyJWK: JsonWebKey,
  accessToken: string | undefined,
  logger: Logger,
): Promise<Response> {
  // Create initial DPoP proof
  let dpopProof = await generateDPoPProof(
    "POST",
    tokenUrl,
    privateKey,
    publicKeyJWK,
    accessToken,
  );

  logger.debug("Making token request with DPoP proof", { tokenUrl });

  let response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "DPoP": dpopProof,
    },
    body,
  });

  // Handle DPoP nonce requirement - AT Protocol uses 400 status
  if (!response.ok && response.status === 400) {
    const nonce = response.headers.get("DPoP-Nonce");
    if (nonce) {
      logger.debug("Retrying token request with DPoP nonce", { nonce });

      // Retry with nonce
      dpopProof = await generateDPoPProof(
        "POST",
        tokenUrl,
        privateKey,
        publicKeyJWK,
        accessToken,
        nonce,
      );

      response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "DPoP": dpopProof,
        },
        body,
      });
    }
  }

  return response;
}

/**
 * Exchange authorization code for access and refresh tokens.
 *
 * Performs the OAuth 2.0 authorization code exchange with PKCE verification
 * and DPoP token binding. Automatically handles DPoP nonce challenges.
 *
 * @param authServer - Authorization server base URL
 * @param code - Authorization code from callback
 * @param codeVerifier - PKCE code verifier
 * @param clientId - OAuth client ID
 * @param redirectUri - Redirect URI used in authorization
 * @param dpopKeys - DPoP key pair for token binding
 * @param logger - Logger instance
 * @returns Promise resolving to token response
 * @throws {TokenExchangeError} When token exchange fails
 *
 * @example
 * ```ts
 * const tokens = await exchangeCodeForTokens(
 *   "https://bsky.social",
 *   "auth_code_123",
 *   "code_verifier_xyz",
 *   "https://myapp.com/client-metadata.json",
 *   "https://myapp.com/oauth/callback",
 *   dpopKeys,
 *   logger
 * );
 * console.log("Access token:", tokens.access_token);
 * ```
 */
export async function exchangeCodeForTokens(
  authServer: string,
  code: string,
  codeVerifier: string,
  clientId: string,
  redirectUri: string,
  dpopKeys: { privateKey: CryptoKey; publicKeyJWK: JsonWebKey },
  logger: Logger,
): Promise<TokenResponse> {
  const tokenUrl = `${authServer}/oauth/token`;

  logger.info("Exchanging authorization code for tokens", { authServer });

  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
    code_verifier: codeVerifier,
  });

  const response = await fetchWithDPoPRetry(
    tokenUrl,
    tokenBody,
    dpopKeys.privateKey,
    dpopKeys.publicKeyJWK,
    undefined,
    logger,
  );

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("Token exchange failed", { status: response.status, error: errorText });

    // Try to parse OAuth error response (JSON format)
    try {
      const errorJson = JSON.parse(errorText);
      throw new TokenExchangeError(
        errorJson.error_description || errorJson.error || errorText,
        errorJson.error, // e.g., "invalid_client", "invalid_grant"
        undefined, // cause
        errorJson.error_description, // errorDescription
      );
    } catch (parseError) {
      if (parseError instanceof TokenExchangeError) throw parseError;
      throw new TokenExchangeError(errorText);
    }
  }

  logger.info("Token exchange successful");
  return await response.json();
}

/**
 * Refresh access token using refresh token.
 *
 * Exchanges a refresh token for new access and optionally refresh tokens
 * using the OAuth 2.0 refresh_token grant with DPoP authentication.
 *
 * @param tokenEndpoint - Token endpoint URL
 * @param refreshToken - Current refresh token
 * @param clientId - OAuth client ID
 * @param privateKeyJWK - DPoP private key as JWK
 * @param publicKeyJWK - DPoP public key as JWK
 * @param logger - Logger instance
 * @returns Promise resolving to refreshed tokens
 * @throws {TokenExchangeError} When token refresh fails
 *
 * @example
 * ```ts
 * const tokens = await refreshTokens(
 *   "https://bsky.social/oauth/token",
 *   "refresh_token_123",
 *   "https://myapp.com/client-metadata.json",
 *   privateKeyJWK,
 *   publicKeyJWK,
 *   logger
 * );
 * console.log("New access token:", tokens.accessToken);
 * ```
 */
export async function refreshTokens(
  tokenEndpoint: string,
  refreshToken: string,
  clientId: string,
  privateKeyJWK: JsonWebKey,
  publicKeyJWK: JsonWebKey,
  logger: Logger,
): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
  try {
    logger.info("Refreshing access token", { tokenEndpoint });

    // Import private key for DPoP signing
    const privateKey = await importPrivateKeyFromJWK(privateKeyJWK);

    const tokenBody = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
    });

    const response = await fetchWithDPoPRetry(
      tokenEndpoint,
      tokenBody,
      privateKey,
      publicKeyJWK,
      undefined,
      logger,
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Token refresh failed", { status: response.status, error: errorText });

      // Try to parse OAuth error response (JSON format)
      try {
        const errorJson = JSON.parse(errorText);
        throw new TokenExchangeError(
          `Token refresh failed: ${errorJson.error_description || errorJson.error || errorText}`,
          errorJson.error, // e.g., "invalid_grant"
          undefined, // cause
          errorJson.error_description, // errorDescription
        );
      } catch (parseError) {
        // If it's already our error, re-throw it
        if (parseError instanceof TokenExchangeError) throw parseError;
        // Otherwise, throw with raw text
        throw new TokenExchangeError(`Token refresh failed: ${errorText}`);
      }
    }

    const tokens = await response.json();

    logger.info("Token refresh successful");

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token, // May be undefined if server doesn't rotate refresh tokens
      expiresIn: tokens.expires_in,
    };
  } catch (error) {
    if (error instanceof TokenExchangeError) {
      throw error;
    }
    logger.error("Token refresh error", { error });
    throw new TokenExchangeError("Token refresh failed", undefined, error as Error);
  }
}
