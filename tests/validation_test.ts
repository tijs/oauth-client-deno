import { assertEquals, assertThrows } from "@std/assert";
import {
  requireHttpsUrl,
  validateAuthServerMetadata,
  validateTokenResponse,
} from "../src/validation.ts";
import { MetadataValidationError, TokenValidationError } from "../src/errors.ts";

// --- requireHttpsUrl ---

Deno.test("requireHttpsUrl", async (t) => {
  await t.step("accepts HTTPS URLs", () => {
    requireHttpsUrl("https://example.com", "test");
    requireHttpsUrl("https://auth.example.com/path", "test");
  });

  await t.step("rejects HTTP URLs", () => {
    assertThrows(
      () => requireHttpsUrl("http://example.com", "test"),
      MetadataValidationError,
      "must use HTTPS",
    );
  });

  await t.step("rejects invalid URLs", () => {
    assertThrows(
      () => requireHttpsUrl("not-a-url", "test"),
      MetadataValidationError,
      "not a valid URL",
    );
  });
});

// --- validateAuthServerMetadata ---

Deno.test("validateAuthServerMetadata", async (t) => {
  const validMetadata = {
    issuer: "https://bsky.social",
    authorization_endpoint: "https://bsky.social/oauth/authorize",
    token_endpoint: "https://bsky.social/oauth/token",
    pushed_authorization_request_endpoint: "https://bsky.social/oauth/par",
    revocation_endpoint: "https://bsky.social/oauth/revoke",
    dpop_signing_alg_values_supported: ["ES256"],
  };

  await t.step("accepts valid metadata", () => {
    const result = validateAuthServerMetadata(validMetadata, "https://bsky.social");
    assertEquals(result.issuer, "https://bsky.social");
    assertEquals(result.authorization_endpoint, "https://bsky.social/oauth/authorize");
    assertEquals(result.token_endpoint, "https://bsky.social/oauth/token");
  });

  await t.step("rejects non-object metadata", () => {
    assertThrows(
      () => validateAuthServerMetadata(null, "https://bsky.social"),
      MetadataValidationError,
      "not an object",
    );
    assertThrows(
      () => validateAuthServerMetadata("string", "https://bsky.social"),
      MetadataValidationError,
      "not an object",
    );
  });

  await t.step("rejects missing issuer", () => {
    assertThrows(
      () =>
        validateAuthServerMetadata(
          { ...validMetadata, issuer: undefined },
          "https://bsky.social",
        ),
      MetadataValidationError,
      "issuer",
    );
  });

  await t.step("rejects issuer origin mismatch", () => {
    assertThrows(
      () =>
        validateAuthServerMetadata(
          { ...validMetadata, issuer: "https://evil.com" },
          "https://bsky.social",
        ),
      MetadataValidationError,
      "does not match",
    );
  });

  await t.step("accepts issuer with same origin but different path", () => {
    const md = {
      ...validMetadata,
      issuer: "https://bsky.social/some/path",
    };
    const result = validateAuthServerMetadata(md, "https://bsky.social");
    assertEquals(result.issuer, "https://bsky.social/some/path");
  });

  await t.step("rejects missing authorization_endpoint", () => {
    assertThrows(
      () =>
        validateAuthServerMetadata(
          { ...validMetadata, authorization_endpoint: "" },
          "https://bsky.social",
        ),
      MetadataValidationError,
      "authorization_endpoint",
    );
  });

  await t.step("rejects missing token_endpoint", () => {
    assertThrows(
      () =>
        validateAuthServerMetadata(
          { ...validMetadata, token_endpoint: "" },
          "https://bsky.social",
        ),
      MetadataValidationError,
      "token_endpoint",
    );
  });

  await t.step("rejects HTTP endpoints", () => {
    assertThrows(
      () =>
        validateAuthServerMetadata(
          { ...validMetadata, authorization_endpoint: "http://bsky.social/oauth/authorize" },
          "https://bsky.social",
        ),
      MetadataValidationError,
      "must use HTTPS",
    );
  });

  await t.step("rejects DPoP algs without ES256", () => {
    assertThrows(
      () =>
        validateAuthServerMetadata(
          { ...validMetadata, dpop_signing_alg_values_supported: ["RS256"] },
          "https://bsky.social",
        ),
      MetadataValidationError,
      "ES256",
    );
  });

  await t.step("accepts metadata without dpop_signing_alg_values_supported", () => {
    const md = { ...validMetadata };
    delete (md as Record<string, unknown>).dpop_signing_alg_values_supported;
    const result = validateAuthServerMetadata(md, "https://bsky.social");
    assertEquals(result.dpop_signing_alg_values_supported, undefined);
  });

  await t.step("accepts metadata without optional endpoints", () => {
    const md = {
      issuer: "https://bsky.social",
      authorization_endpoint: "https://bsky.social/oauth/authorize",
      token_endpoint: "https://bsky.social/oauth/token",
    };
    const result = validateAuthServerMetadata(md, "https://bsky.social");
    assertEquals(result.pushed_authorization_request_endpoint, undefined);
    assertEquals(result.revocation_endpoint, undefined);
  });
});

// --- validateTokenResponse ---

Deno.test("validateTokenResponse", async (t) => {
  const validResponse = {
    access_token: "at_token_123",
    token_type: "DPoP",
    scope: "atproto transition:generic",
    sub: "did:plc:abc123",
    expires_in: 3600,
    refresh_token: "rt_token_456",
  };

  await t.step("accepts valid token response", () => {
    const result = validateTokenResponse(validResponse);
    assertEquals(result.access_token, "at_token_123");
    assertEquals(result.token_type, "DPoP");
    assertEquals(result.scope, "atproto transition:generic");
    assertEquals(result.sub, "did:plc:abc123");
    assertEquals(result.expires_in, 3600);
    assertEquals(result.refresh_token, "rt_token_456");
  });

  await t.step("accepts DPoP case-insensitive", () => {
    const result = validateTokenResponse({ ...validResponse, token_type: "dpop" });
    assertEquals(result.token_type, "dpop");
  });

  await t.step("rejects non-object response", () => {
    assertThrows(
      () => validateTokenResponse(null),
      TokenValidationError,
      "not an object",
    );
  });

  await t.step("rejects missing access_token", () => {
    assertThrows(
      () => validateTokenResponse({ ...validResponse, access_token: "" }),
      TokenValidationError,
      "access_token",
    );
  });

  await t.step("rejects wrong token_type", () => {
    assertThrows(
      () => validateTokenResponse({ ...validResponse, token_type: "Bearer" }),
      TokenValidationError,
      "DPoP",
    );
  });

  await t.step("rejects missing sub", () => {
    assertThrows(
      () => validateTokenResponse({ ...validResponse, sub: "" }),
      TokenValidationError,
      "sub",
    );
  });

  await t.step("rejects sub not starting with did:", () => {
    assertThrows(
      () => validateTokenResponse({ ...validResponse, sub: "user:abc" }),
      TokenValidationError,
      "did:",
    );
  });

  await t.step("rejects missing scope", () => {
    assertThrows(
      () => validateTokenResponse({ ...validResponse, scope: "" }),
      TokenValidationError,
      "scope",
    );
  });

  await t.step("rejects scope without atproto", () => {
    assertThrows(
      () => validateTokenResponse({ ...validResponse, scope: "openid profile" }),
      TokenValidationError,
      "atproto",
    );
  });

  await t.step("rejects zero expires_in", () => {
    assertThrows(
      () => validateTokenResponse({ ...validResponse, expires_in: 0 }),
      TokenValidationError,
      "expires_in",
    );
  });

  await t.step("rejects negative expires_in", () => {
    assertThrows(
      () => validateTokenResponse({ ...validResponse, expires_in: -1 }),
      TokenValidationError,
      "expires_in",
    );
  });

  await t.step("accepts response without refresh_token", () => {
    const { refresh_token: _, ...noRefresh } = validResponse;
    const result = validateTokenResponse(noRefresh);
    assertEquals(result.refresh_token, undefined);
  });

  await t.step("rejects non-string refresh_token", () => {
    assertThrows(
      () => validateTokenResponse({ ...validResponse, refresh_token: 123 }),
      TokenValidationError,
      "refresh_token",
    );
  });
});
