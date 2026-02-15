import { assert, assertEquals, assertInstanceOf } from "@std/assert";
import {
  AuthorizationError,
  DPoPError,
  HandleResolutionError,
  InvalidHandleError,
  InvalidStateError,
  IssuerMismatchError,
  MetadataValidationError,
  OAuthError,
  PDSDiscoveryError,
  SessionError,
  TokenExchangeError,
  TokenValidationError,
} from "../src/errors.ts";

Deno.test("OAuthError", async (t) => {
  await t.step("should create basic error with message", () => {
    const error = new OAuthError("Test message");
    assertEquals(error.message, "Test message");
    assertEquals(error.name, "OAuthError");
    assertEquals(error.cause, undefined);
  });

  await t.step("should create error with cause", () => {
    const cause = new Error("Original error");
    const error = new OAuthError("Test message", cause);
    assertEquals(error.message, "Test message");
    assertEquals(error.name, "OAuthError");
    assertEquals(error.cause, cause);
  });

  await t.step("should be instance of Error", () => {
    const error = new OAuthError("Test message");
    assertInstanceOf(error, Error);
    assertInstanceOf(error, OAuthError);
  });
});

Deno.test("InvalidHandleError", async (t) => {
  await t.step("should create error with handle in message", () => {
    const error = new InvalidHandleError("invalid.handle");
    assertEquals(error.message, "Invalid AT Protocol handle: invalid.handle");
    assertEquals(error.name, "InvalidHandleError");
  });

  await t.step("should be instance of OAuthError", () => {
    const error = new InvalidHandleError("invalid.handle");
    assertInstanceOf(error, OAuthError);
    assertInstanceOf(error, InvalidHandleError);
  });
});

Deno.test("HandleResolutionError", async (t) => {
  await t.step("should create error with handle in message", () => {
    const error = new HandleResolutionError("test.handle");
    assertEquals(error.message, "Failed to resolve handle test.handle to DID and PDS");
    assertEquals(error.name, "HandleResolutionError");
    assertEquals(error.cause, undefined);
  });

  await t.step("should create error with cause", () => {
    const cause = new Error("Network error");
    const error = new HandleResolutionError("test.handle", cause);
    assertEquals(error.message, "Failed to resolve handle test.handle to DID and PDS");
    assertEquals(error.name, "HandleResolutionError");
    assertEquals(error.cause, cause);
  });

  await t.step("should be instance of OAuthError", () => {
    const error = new HandleResolutionError("test.handle");
    assertInstanceOf(error, OAuthError);
    assertInstanceOf(error, HandleResolutionError);
  });
});

Deno.test("PDSDiscoveryError", async (t) => {
  await t.step("should create error with PDS URL in message", () => {
    const error = new PDSDiscoveryError("https://example.com");
    assertEquals(error.message, "Failed to discover OAuth endpoints for PDS: https://example.com");
    assertEquals(error.name, "PDSDiscoveryError");
    assertEquals(error.cause, undefined);
  });

  await t.step("should create error with cause", () => {
    const cause = new Error("Discovery failed");
    const error = new PDSDiscoveryError("https://example.com", cause);
    assertEquals(error.message, "Failed to discover OAuth endpoints for PDS: https://example.com");
    assertEquals(error.name, "PDSDiscoveryError");
    assertEquals(error.cause, cause);
  });

  await t.step("should be instance of OAuthError", () => {
    const error = new PDSDiscoveryError("https://example.com");
    assertInstanceOf(error, OAuthError);
    assertInstanceOf(error, PDSDiscoveryError);
  });
});

Deno.test("TokenExchangeError", async (t) => {
  await t.step("should create error with message", () => {
    const error = new TokenExchangeError("Invalid grant");
    assertEquals(error.message, "Token exchange failed: Invalid grant");
    assertEquals(error.name, "TokenExchangeError");
    assertEquals(error.errorCode, undefined);
    assertEquals(error.cause, undefined);
  });

  await t.step("should create error with error code", () => {
    const error = new TokenExchangeError("Invalid grant", "invalid_grant");
    assertEquals(error.message, "Token exchange failed: Invalid grant");
    assertEquals(error.name, "TokenExchangeError");
    assertEquals(error.errorCode, "invalid_grant");
    assertEquals(error.cause, undefined);
  });

  await t.step("should create error with error code and cause", () => {
    const cause = new Error("HTTP 400");
    const error = new TokenExchangeError("Invalid grant", "invalid_grant", cause);
    assertEquals(error.message, "Token exchange failed: Invalid grant");
    assertEquals(error.name, "TokenExchangeError");
    assertEquals(error.errorCode, "invalid_grant");
    assertEquals(error.cause, cause);
  });

  await t.step("should be instance of OAuthError", () => {
    const error = new TokenExchangeError("Invalid grant");
    assertInstanceOf(error, OAuthError);
    assertInstanceOf(error, TokenExchangeError);
  });
});

Deno.test("DPoPError", async (t) => {
  await t.step("should create error with message", () => {
    const error = new DPoPError("Key generation failed");
    assertEquals(error.message, "DPoP operation failed: Key generation failed");
    assertEquals(error.name, "DPoPError");
    assertEquals(error.cause, undefined);
  });

  await t.step("should create error with cause", () => {
    const cause = new Error("Crypto error");
    const error = new DPoPError("Key generation failed", cause);
    assertEquals(error.message, "DPoP operation failed: Key generation failed");
    assertEquals(error.name, "DPoPError");
    assertEquals(error.cause, cause);
  });

  await t.step("should be instance of OAuthError", () => {
    const error = new DPoPError("Key generation failed");
    assertInstanceOf(error, OAuthError);
    assertInstanceOf(error, DPoPError);
  });
});

Deno.test("SessionError", async (t) => {
  await t.step("should create error with message", () => {
    const error = new SessionError("Invalid session data");
    assertEquals(error.message, "Session error: Invalid session data");
    assertEquals(error.name, "SessionError");
    assertEquals(error.cause, undefined);
  });

  await t.step("should create error with cause", () => {
    const cause = new Error("Serialization failed");
    const error = new SessionError("Invalid session data", cause);
    assertEquals(error.message, "Session error: Invalid session data");
    assertEquals(error.name, "SessionError");
    assertEquals(error.cause, cause);
  });

  await t.step("should be instance of OAuthError", () => {
    const error = new SessionError("Invalid session data");
    assertInstanceOf(error, OAuthError);
    assertInstanceOf(error, SessionError);
  });
});

Deno.test("InvalidStateError", async (t) => {
  await t.step("should create error with fixed message", () => {
    const error = new InvalidStateError();
    assertEquals(error.message, "Invalid or expired OAuth state parameter");
    assertEquals(error.name, "InvalidStateError");
    assertEquals(error.cause, undefined);
  });

  await t.step("should be instance of OAuthError", () => {
    const error = new InvalidStateError();
    assertInstanceOf(error, OAuthError);
    assertInstanceOf(error, InvalidStateError);
  });
});

Deno.test("AuthorizationError", async (t) => {
  await t.step("should create error with error code only", () => {
    const error = new AuthorizationError("access_denied");
    assertEquals(error.message, "Authorization failed: access_denied");
    assertEquals(error.name, "AuthorizationError");
  });

  await t.step("should create error with error code and description", () => {
    const error = new AuthorizationError("access_denied", "User denied the request");
    assertEquals(error.message, "Authorization failed: access_denied - User denied the request");
    assertEquals(error.name, "AuthorizationError");
  });

  await t.step("should be instance of OAuthError", () => {
    const error = new AuthorizationError("access_denied");
    assertInstanceOf(error, OAuthError);
    assertInstanceOf(error, AuthorizationError);
  });
});

// New error types

Deno.test("MetadataValidationError", async (t) => {
  await t.step("should create error with message", () => {
    const error = new MetadataValidationError("missing issuer field");
    assertEquals(error.name, "MetadataValidationError");
    assert(error.message.includes("missing issuer field"));
    assertInstanceOf(error, OAuthError);
  });

  await t.step("should chain cause", () => {
    const cause = new Error("parse error");
    const error = new MetadataValidationError("invalid metadata", cause);
    assertEquals(error.cause, cause);
  });
});

Deno.test("IssuerMismatchError", async (t) => {
  await t.step("should include expected and actual issuers", () => {
    const error = new IssuerMismatchError("https://expected.com", "https://actual.com");
    assertEquals(error.name, "IssuerMismatchError");
    assertEquals(error.expected, "https://expected.com");
    assertEquals(error.actual, "https://actual.com");
    assert(error.message.includes("https://expected.com"));
    assert(error.message.includes("https://actual.com"));
    assertInstanceOf(error, OAuthError);
  });
});

Deno.test("TokenValidationError", async (t) => {
  await t.step("should create error with message", () => {
    const error = new TokenValidationError("missing sub claim");
    assertEquals(error.name, "TokenValidationError");
    assert(error.message.includes("missing sub claim"));
    assertInstanceOf(error, TokenExchangeError);
    assertInstanceOf(error, OAuthError);
  });
});
