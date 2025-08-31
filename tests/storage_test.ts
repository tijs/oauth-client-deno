/**
 * @fileoverview Tests for storage implementations
 */

import { assertEquals } from "jsr:@std/assert";
import { LocalStorage, MemoryStorage } from "../src/storage.ts";

// Mock localStorage for testing
class MockLocalStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// Setup mock for LocalStorage tests
const mockLocalStorage = new MockLocalStorage();
// @ts-ignore: Mock global for testing
globalThis.localStorage = mockLocalStorage;

Deno.test("MemoryStorage - Basic Operations", async (t) => {
  const storage = new MemoryStorage();

  await t.step("should store and retrieve values", async () => {
    await storage.set("test-key", { data: "test-value" });
    const result = await storage.get<{ data: string }>("test-key");
    assertEquals(result, { data: "test-value" });
  });

  await t.step("should return null for non-existent keys", async () => {
    const result = await storage.get("non-existent");
    assertEquals(result, null);
  });

  await t.step("should delete values", async () => {
    await storage.set("delete-me", "test");
    await storage.delete("delete-me");
    const result = await storage.get("delete-me");
    assertEquals(result, null);
  });

  await t.step("should clear all values", async () => {
    await storage.set("key1", "value1");
    await storage.set("key2", "value2");
    storage.clear();
    assertEquals(await storage.get("key1"), null);
    assertEquals(await storage.get("key2"), null);
  });
});

Deno.test("MemoryStorage - TTL Functionality", async (t) => {
  const storage = new MemoryStorage();

  await t.step("should store values with TTL", async () => {
    await storage.set("ttl-key", "ttl-value", { ttl: 1 }); // 1 second TTL
    const result = await storage.get("ttl-key");
    assertEquals(result, "ttl-value");
  });

  await t.step("should expire values after TTL", async () => {
    await storage.set("expire-key", "expire-value", { ttl: 0.1 }); // 100ms TTL

    // Should exist immediately
    const beforeExpiry = await storage.get("expire-key");
    assertEquals(beforeExpiry, "expire-value");

    // Wait for expiry and check
    await new Promise((resolve) => setTimeout(resolve, 150));
    const afterExpiry = await storage.get("expire-key");
    assertEquals(afterExpiry, null);
  });

  await t.step("should store values without TTL indefinitely", async () => {
    await storage.set("no-ttl", "persistent");

    // Wait a bit and verify it's still there
    await new Promise((resolve) => setTimeout(resolve, 50));
    const result = await storage.get("no-ttl");
    assertEquals(result, "persistent");
  });
});

Deno.test("MemoryStorage - Data Types", async (t) => {
  const storage = new MemoryStorage();

  await t.step("should handle strings", async () => {
    await storage.set("string", "test-string");
    assertEquals(await storage.get("string"), "test-string");
  });

  await t.step("should handle numbers", async () => {
    await storage.set("number", 42);
    assertEquals(await storage.get("number"), 42);
  });

  await t.step("should handle objects", async () => {
    const obj = { key: "value", nested: { data: 123 } };
    await storage.set("object", obj);
    assertEquals(await storage.get("object"), obj);
  });

  await t.step("should handle arrays", async () => {
    const arr = [1, "two", { three: 3 }];
    await storage.set("array", arr);
    assertEquals(await storage.get("array"), arr);
  });

  await t.step("should handle booleans", async () => {
    await storage.set("bool-true", true);
    await storage.set("bool-false", false);
    assertEquals(await storage.get("bool-true"), true);
    assertEquals(await storage.get("bool-false"), false);
  });
});

Deno.test("LocalStorage - Basic Operations", async (t) => {
  const storage = new LocalStorage();

  // Clear mock storage before each test
  mockLocalStorage.clear();

  await t.step("should store and retrieve values", async () => {
    await storage.set("local-key", { data: "local-value" });
    const result = await storage.get<{ data: string }>("local-key");
    assertEquals(result, { data: "local-value" });
  });

  await t.step("should return null for non-existent keys", async () => {
    const result = await storage.get("non-existent");
    assertEquals(result, null);
  });

  await t.step("should delete values", async () => {
    await storage.set("delete-local", "test");
    await storage.delete("delete-local");
    const result = await storage.get("delete-local");
    assertEquals(result, null);
  });
});

Deno.test("LocalStorage - TTL Functionality", async (t) => {
  const storage = new LocalStorage();
  mockLocalStorage.clear();

  await t.step("should store values with TTL", async () => {
    await storage.set("ttl-local", "ttl-value", { ttl: 1 });
    const result = await storage.get("ttl-local");
    assertEquals(result, "ttl-value");
  });

  await t.step("should expire values after TTL", async () => {
    await storage.set("expire-local", "expire-value", { ttl: 0.1 }); // 100ms TTL

    // Should exist immediately
    const beforeExpiry = await storage.get("expire-local");
    assertEquals(beforeExpiry, "expire-value");

    // Wait for expiry and check
    await new Promise((resolve) => setTimeout(resolve, 150));
    const afterExpiry = await storage.get("expire-local");
    assertEquals(afterExpiry, null);
  });
});

Deno.test("LocalStorage - Error Handling", async (t) => {
  const storage = new LocalStorage();
  mockLocalStorage.clear();

  await t.step("should handle JSON parse errors gracefully", async () => {
    // Manually set invalid JSON in mock storage
    mockLocalStorage.setItem("invalid-json", "invalid-json-data");

    const result = await storage.get("invalid-json");
    assertEquals(result, null);
  });
});
