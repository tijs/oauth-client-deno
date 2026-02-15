import { assertEquals, assertNotEquals } from "@std/assert";
import { generateDPoPKeyPair, generateDPoPProof } from "../src/dpop.ts";
import { decodeJwt } from "@panva/jose";

Deno.test("DPoP proof - htu normalization", async (t) => {
  const keyPair = await generateDPoPKeyPair();

  await t.step("strips query parameters from htu", async () => {
    const proof = await generateDPoPProof(
      "GET",
      "https://example.com/api?foo=bar&baz=qux",
      keyPair.privateKey,
      keyPair.publicKeyJWK,
    );
    const payload = decodeJwt(proof);
    assertEquals(payload.htu, "https://example.com/api");
  });

  await t.step("strips fragment from htu", async () => {
    const proof = await generateDPoPProof(
      "POST",
      "https://example.com/api#section",
      keyPair.privateKey,
      keyPair.publicKeyJWK,
    );
    const payload = decodeJwt(proof);
    assertEquals(payload.htu, "https://example.com/api");
  });

  await t.step("preserves path in htu", async () => {
    const proof = await generateDPoPProof(
      "GET",
      "https://example.com/oauth/token",
      keyPair.privateKey,
      keyPair.publicKeyJWK,
    );
    const payload = decodeJwt(proof);
    assertEquals(payload.htu, "https://example.com/oauth/token");
  });

  await t.step("includes nonce when provided", async () => {
    const proof = await generateDPoPProof(
      "POST",
      "https://example.com/oauth/token",
      keyPair.privateKey,
      keyPair.publicKeyJWK,
      undefined,
      "server-nonce-123",
    );
    const payload = decodeJwt(proof);
    assertEquals(payload.nonce, "server-nonce-123");
  });

  await t.step("generates unique jti for each proof", async () => {
    const proof1 = await generateDPoPProof(
      "GET",
      "https://example.com/api",
      keyPair.privateKey,
      keyPair.publicKeyJWK,
    );
    const proof2 = await generateDPoPProof(
      "GET",
      "https://example.com/api",
      keyPair.privateKey,
      keyPair.publicKeyJWK,
    );
    const payload1 = decodeJwt(proof1);
    const payload2 = decodeJwt(proof2);
    assertNotEquals(payload1.jti, payload2.jti);
  });
});

Deno.test("DPoP nonce cache", async (t) => {
  // Import cache functions
  const { getCachedNonce, updateNonceCache } = await import("../src/dpop.ts");

  await t.step("returns undefined for unknown origins", () => {
    const nonce = getCachedNonce("https://unknown-origin.example.com/path");
    assertEquals(nonce, undefined);
  });

  await t.step("stores and retrieves nonce per origin", () => {
    const mockResponse = new Response(null, {
      headers: { "DPoP-Nonce": "nonce-abc" },
    });
    updateNonceCache("https://cache-test.example.com/oauth/token", mockResponse);

    assertEquals(getCachedNonce("https://cache-test.example.com/other"), "nonce-abc");
  });

  await t.step("updates nonce from new response", () => {
    const response1 = new Response(null, {
      headers: { "DPoP-Nonce": "nonce-1" },
    });
    updateNonceCache("https://update-test.example.com/a", response1);
    assertEquals(getCachedNonce("https://update-test.example.com/b"), "nonce-1");

    const response2 = new Response(null, {
      headers: { "DPoP-Nonce": "nonce-2" },
    });
    updateNonceCache("https://update-test.example.com/c", response2);
    assertEquals(getCachedNonce("https://update-test.example.com/d"), "nonce-2");
  });

  await t.step("ignores responses without DPoP-Nonce header", () => {
    const response = new Response(null);
    updateNonceCache("https://no-nonce.example.com/path", response);
    assertEquals(getCachedNonce("https://no-nonce.example.com/path"), undefined);
  });
});
