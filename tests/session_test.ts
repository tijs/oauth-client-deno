/**
 * @fileoverview Tests for Session class
 */

import { assertEquals } from "jsr:@std/assert";
import { Session, type SessionData } from "../src/session.ts";

// Helper to create test session data
function createTestSessionData(overrides: Partial<SessionData> = {}): SessionData {
  return {
    did: "did:plc:test123",
    handle: "test.bsky.social",
    pdsUrl: "https://test.bsky.social",
    accessToken: "test_access_token",
    refreshToken: "test_refresh_token",
    dpopPrivateKeyJWK: {
      kty: "EC",
      crv: "P-256",
      x: "test_x_value",
      y: "test_y_value",
      d: "test_d_value",
    },
    dpopPublicKeyJWK: {
      kty: "EC",
      crv: "P-256",
      x: "test_x_value",
      y: "test_y_value",
    },
    tokenExpiresAt: Date.now() + (60 * 60 * 1000), // 1 hour from now
    ...overrides,
  };
}

Deno.test("Session - Constructor and Basic Properties", async (t) => {
  const sessionData = createTestSessionData();
  const session = new Session(sessionData);

  await t.step("should expose basic properties", () => {
    assertEquals(session.did, "did:plc:test123");
    assertEquals(session.handle, "test.bsky.social");
    assertEquals(session.pdsUrl, "https://test.bsky.social");
    assertEquals(session.accessToken, "test_access_token");
    assertEquals(session.refreshToken, "test_refresh_token");
  });
});

Deno.test("Session - Expiration Logic", async (t) => {
  await t.step("should not be expired for future tokens", () => {
    const futureTime = Date.now() + (60 * 60 * 1000); // 1 hour from now
    const sessionData = createTestSessionData({ tokenExpiresAt: futureTime });
    const session = new Session(sessionData);

    assertEquals(session.isExpired, false);
  });

  await t.step("should be expired for past tokens", () => {
    const pastTime = Date.now() - (60 * 60 * 1000); // 1 hour ago
    const sessionData = createTestSessionData({ tokenExpiresAt: pastTime });
    const session = new Session(sessionData);

    assertEquals(session.isExpired, true);
  });

  await t.step("should be expired for tokens expiring within 5 minutes", () => {
    const soonTime = Date.now() + (2 * 60 * 1000); // 2 minutes from now (within 5min buffer)
    const sessionData = createTestSessionData({ tokenExpiresAt: soonTime });
    const session = new Session(sessionData);

    assertEquals(session.isExpired, true);
  });

  await t.step("should not be expired for tokens expiring after 5 minutes", () => {
    const laterTime = Date.now() + (10 * 60 * 1000); // 10 minutes from now (after 5min buffer)
    const sessionData = createTestSessionData({ tokenExpiresAt: laterTime });
    const session = new Session(sessionData);

    assertEquals(session.isExpired, false);
  });
});

Deno.test("Session - Time Until Expiry", async (t) => {
  await t.step("should calculate correct time until expiry", () => {
    const futureTime = Date.now() + (30 * 60 * 1000); // 30 minutes from now
    const sessionData = createTestSessionData({ tokenExpiresAt: futureTime });
    const session = new Session(sessionData);

    const timeUntilExpiry = session.timeUntilExpiry;
    // Allow small variance for test execution time
    assertEquals(timeUntilExpiry > (29 * 60 * 1000), true);
    assertEquals(timeUntilExpiry <= (30 * 60 * 1000), true);
  });

  await t.step("should return 0 for expired tokens", () => {
    const pastTime = Date.now() - (60 * 60 * 1000); // 1 hour ago
    const sessionData = createTestSessionData({ tokenExpiresAt: pastTime });
    const session = new Session(sessionData);

    assertEquals(session.timeUntilExpiry, 0);
  });
});

Deno.test("Session - Serialization", async (t) => {
  const originalData = createTestSessionData();
  const session = new Session(originalData);

  await t.step("toJSON should return session data", () => {
    const jsonData = session.toJSON();
    assertEquals(jsonData, originalData);
  });

  await t.step("fromJSON should create identical session", () => {
    const jsonData = session.toJSON();
    const restoredSession = Session.fromJSON(jsonData);

    assertEquals(restoredSession.did, session.did);
    assertEquals(restoredSession.handle, session.handle);
    assertEquals(restoredSession.pdsUrl, session.pdsUrl);
    assertEquals(restoredSession.accessToken, session.accessToken);
    assertEquals(restoredSession.refreshToken, session.refreshToken);
    assertEquals(restoredSession.isExpired, session.isExpired);
  });

  await t.step("round-trip serialization should preserve all data", () => {
    const restoredSession = Session.fromJSON(session.toJSON());
    assertEquals(restoredSession.toJSON(), originalData);
  });
});

Deno.test("Session - Token Updates", async (t) => {
  const sessionData = createTestSessionData();
  const session = new Session(sessionData);
  const originalRefreshToken = session.refreshToken;
  const originalExpiry = session.timeUntilExpiry;

  await t.step("updateTokens should update access token and expiry", () => {
    const newTokens = {
      accessToken: "new_access_token",
      expiresIn: 7200, // 2 hours (longer than original 1 hour)
    };

    session.updateTokens(newTokens);

    assertEquals(session.accessToken, "new_access_token");
    assertEquals(session.refreshToken, originalRefreshToken); // Should remain unchanged

    // New expiry should be roughly 2 hours from now (longer than original)
    const newExpiry = session.timeUntilExpiry;
    assertEquals(newExpiry > originalExpiry, true);
    assertEquals(newExpiry > (110 * 60 * 1000), true); // At least 110 minutes
    assertEquals(newExpiry <= (120 * 60 * 1000), true); // At most 120 minutes
  });

  await t.step("updateTokens should update refresh token when provided", () => {
    const newTokens = {
      accessToken: "newer_access_token",
      refreshToken: "new_refresh_token",
      expiresIn: 1800, // 30 minutes
    };

    session.updateTokens(newTokens);

    assertEquals(session.accessToken, "newer_access_token");
    assertEquals(session.refreshToken, "new_refresh_token");

    // Expiry should be roughly 30 minutes from now
    const newExpiry = session.timeUntilExpiry;
    assertEquals(newExpiry > (25 * 60 * 1000), true); // At least 25 minutes
    assertEquals(newExpiry <= (30 * 60 * 1000), true); // At most 30 minutes
  });
});

Deno.test("Session - Edge Cases", async (t) => {
  await t.step("should handle zero expiry time", () => {
    const sessionData = createTestSessionData({ tokenExpiresAt: 0 });
    const session = new Session(sessionData);

    assertEquals(session.isExpired, true);
    assertEquals(session.timeUntilExpiry, 0);
  });

  await t.step("should handle very large expiry time", () => {
    const farFuture = Date.now() + (365 * 24 * 60 * 60 * 1000); // 1 year from now
    const sessionData = createTestSessionData({ tokenExpiresAt: farFuture });
    const session = new Session(sessionData);

    assertEquals(session.isExpired, false);
    assertEquals(session.timeUntilExpiry > (364 * 24 * 60 * 60 * 1000), true);
  });

  await t.step("should handle minimal session data", () => {
    const minimalData = createTestSessionData({
      did: "did:minimal",
      handle: "minimal.test",
      pdsUrl: "https://minimal.test",
      accessToken: "min_access",
      refreshToken: "min_refresh",
    });
    const session = new Session(minimalData);

    assertEquals(session.did, "did:minimal");
    assertEquals(session.handle, "minimal.test");
    assertEquals(session.pdsUrl, "https://minimal.test");
    assertEquals(session.accessToken, "min_access");
    assertEquals(session.refreshToken, "min_refresh");
  });
});
