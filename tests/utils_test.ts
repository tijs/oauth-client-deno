import { assertEquals, assertMatch } from "jsr:@std/assert";

// Helper functions that replicate the private PKCE methods for testing
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/[+/]/g, (match) => match === "+" ? "-" : "_")
    .replace(/=/g, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/[+/]/g, (match) => match === "+" ? "-" : "_")
    .replace(/=/g, "");
}

Deno.test("PKCE utilities", async (t) => {
  await t.step("generateCodeVerifier should create valid code verifier", () => {
    const verifier = generateCodeVerifier();
    
    // Should be base64url encoded (no +, /, or = characters)
    assertMatch(verifier, /^[A-Za-z0-9_-]+$/);
    
    // Should be reasonably long (43-128 characters for PKCE)
    assertEquals(verifier.length, 43); // 32 bytes base64url encoded = 43 chars
  });

  await t.step("generateCodeVerifier should create unique values", () => {
    const verifier1 = generateCodeVerifier();
    const verifier2 = generateCodeVerifier();
    
    // Should generate different values each time
    assertEquals(verifier1 === verifier2, false);
  });

  await t.step("generateCodeChallenge should create valid code challenge", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = await generateCodeChallenge(verifier);
    
    // Should be base64url encoded
    assertMatch(challenge, /^[A-Za-z0-9_-]+$/);
    
    // Should be exactly 43 characters (SHA-256 hash base64url encoded)
    assertEquals(challenge.length, 43);
    
    // Should be deterministic for same input
    const challenge2 = await generateCodeChallenge(verifier);
    assertEquals(challenge, challenge2);
  });

  await t.step("generateCodeChallenge should match RFC 7636 test vector", async () => {
    // Test vector from RFC 7636, Section 4.2
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const expectedChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    
    const challenge = await generateCodeChallenge(verifier);
    assertEquals(challenge, expectedChallenge);
  });

  await t.step("code verifier and challenge should work together", async () => {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    
    // Should produce consistent challenge for the same verifier
    const challenge2 = await generateCodeChallenge(verifier);
    assertEquals(challenge, challenge2);
    
    // Different verifiers should produce different challenges
    const verifier2 = generateCodeVerifier();
    const challenge3 = await generateCodeChallenge(verifier2);
    assertEquals(challenge === challenge3, false);
  });
});

Deno.test("URL parsing utilities", async (t) => {
  await t.step("should parse callback URL with code and state", () => {
    const url = new URL("https://example.com/callback?code=auth_code&state=csrf_state");
    const params = Object.fromEntries(url.searchParams.entries());
    
    assertEquals(params.code, "auth_code");
    assertEquals(params.state, "csrf_state");
    assertEquals(params.error, undefined);
  });

  await t.step("should parse callback URL with error", () => {
    const url = new URL("https://example.com/callback?error=access_denied&error_description=User+denied+request");
    const params = Object.fromEntries(url.searchParams.entries());
    
    assertEquals(params.error, "access_denied");
    assertEquals(params.error_description, "User denied request");
    assertEquals(params.code, undefined);
  });

  await t.step("should handle URL with fragment parameters", () => {
    // Some OAuth flows use fragment parameters
    const urlWithFragment = "https://example.com/callback#code=auth_code&state=csrf_state";
    const url = new URL(urlWithFragment);
    
    // Fragment parameters need special handling
    const fragment = url.hash.substring(1);
    const fragmentParams = Object.fromEntries(new URLSearchParams(fragment).entries());
    
    assertEquals(fragmentParams.code, "auth_code");
    assertEquals(fragmentParams.state, "csrf_state");
  });

  await t.step("should construct authorization URL correctly", () => {
    const baseUrl = "https://auth.example.com/oauth/authorize";
    const params = {
      response_type: "code",
      client_id: "https://client.example.com/metadata.json",
      redirect_uri: "https://client.example.com/callback",
      scope: "atproto transition:generic",
      state: "csrf_token",
      code_challenge: "challenge_string",
      code_challenge_method: "S256",
    };
    
    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    
    assertEquals(url.searchParams.get("response_type"), "code");
    assertEquals(url.searchParams.get("client_id"), "https://client.example.com/metadata.json");
    assertEquals(url.searchParams.get("redirect_uri"), "https://client.example.com/callback");
    assertEquals(url.searchParams.get("scope"), "atproto transition:generic");
    assertEquals(url.searchParams.get("state"), "csrf_token");
    assertEquals(url.searchParams.get("code_challenge"), "challenge_string");
    assertEquals(url.searchParams.get("code_challenge_method"), "S256");
  });
});

Deno.test("Base64URL encoding utilities", async (t) => {
  await t.step("should convert regular base64 to base64url", () => {
    const regularBase64 = "SGVsbG8gV29ybGQ+Pz8/";  // "Hello World>???" with padding and special chars
    const base64url = regularBase64
      .replace(/[+]/g, "-")
      .replace(/[/]/g, "_")
      .replace(/=/g, "");
    
    assertEquals(base64url, "SGVsbG8gV29ybGQ-Pz8_");
  });

  await t.step("should handle empty string", () => {
    const empty = "";
    const encoded = btoa(empty);
    const base64url = encoded
      .replace(/[+]/g, "-")
      .replace(/[/]/g, "_")
      .replace(/=/g, "");
    
    assertEquals(base64url, "");
  });

  await t.step("should encode random bytes correctly", () => {
    const bytes = new Uint8Array([255, 254, 253, 252, 251, 250]);
    const base64 = btoa(String.fromCharCode(...bytes));
    const base64url = base64
      .replace(/[+]/g, "-")
      .replace(/[/]/g, "_")
      .replace(/=/g, "");
    
    // Should not contain +, /, or = characters
    assertMatch(base64url, /^[A-Za-z0-9_-]*$/);
  });
});

Deno.test("Crypto utilities", async (t) => {
  await t.step("should generate random values correctly", () => {
    const array1 = new Uint8Array(32);
    const array2 = new Uint8Array(32);
    
    crypto.getRandomValues(array1);
    crypto.getRandomValues(array2);
    
    // Should fill the arrays
    assertEquals(array1.length, 32);
    assertEquals(array2.length, 32);
    
    // Should generate different values
    const same = array1.every((value, index) => value === array2[index]);
    assertEquals(same, false);
  });

  await t.step("should hash data with SHA-256", async () => {
    const data = new TextEncoder().encode("test data");
    const hash1 = await crypto.subtle.digest("SHA-256", data);
    const hash2 = await crypto.subtle.digest("SHA-256", data);
    
    // Should produce consistent results
    assertEquals(
      new Uint8Array(hash1).toString(),
      new Uint8Array(hash2).toString()
    );
    
    // Should be 32 bytes (256 bits)
    assertEquals(hash1.byteLength, 32);
  });

  await t.step("should generate unique UUIDs", () => {
    const uuid1 = crypto.randomUUID();
    const uuid2 = crypto.randomUUID();
    
    // Should match UUID format
    assertMatch(uuid1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assertMatch(uuid2, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    
    // Should be unique
    assertEquals(uuid1 === uuid2, false);
  });
});