/**
 * @fileoverview Storage implementations for OAuth client session persistence
 * @module
 */

import type { OAuthStorage } from "./types.ts";
export type { OAuthStorage as Storage } from "./types.ts";

/**
 * Simple in-memory storage implementation for OAuth sessions.
 *
 * Stores data in memory with optional TTL support. Data is lost when the
 * process restarts. Good for development, testing, and temporary sessions.
 *
 * @example
 * ```ts
 * const storage = new MemoryStorage();
 *
 * // Store with TTL
 * await storage.set("session-123", sessionData, { ttl: 3600 }); // 1 hour
 *
 * // Retrieve
 * const session = await storage.get("session-123");
 *
 * // Clean up
 * await storage.delete("session-123");
 * ```
 */
export class MemoryStorage implements OAuthStorage {
  private data = new Map<string, { value: unknown; expiresAt?: number }>();

  async get<T = unknown>(key: string): Promise<T | null> {
    await Promise.resolve(); // Satisfy require-await linting rule
    const item = this.data.get(key);
    if (!item) return null;

    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.data.delete(key);
      return null;
    }

    return item.value as T;
  }

  async set<T = unknown>(key: string, value: T, options?: { ttl?: number }): Promise<void> {
    await Promise.resolve(); // Satisfy require-await linting rule
    const expiresAt = options?.ttl ? Date.now() + (options.ttl * 1000) : undefined;
    this.data.set(key, { value, ...(expiresAt ? { expiresAt } : {}) });
  }

  async delete(key: string): Promise<void> {
    await Promise.resolve(); // Satisfy require-await linting rule
    this.data.delete(key);
  }

  // Utility method for cleanup in tests
  clear(): void {
    this.data.clear();
  }
}

/**
 * Example SQLite storage implementation (for reference)
 * Users can implement similar patterns for their storage backend
 */
export class SQLiteStorage implements OAuthStorage {
  constructor(private sqlite: { execute: (query: { sql: string; args: unknown[] }) => Promise<{ columns: string[]; rows: unknown[][] }> }) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    const result = await this.sqlite.execute({
      sql: "SELECT value, expires_at FROM oauth_storage WHERE key = ?",
      args: [key],
    });

    if (result.rows.length === 0) return null;

    const [value, expiresAt] = result.rows[0];
    if (expiresAt && typeof expiresAt === "number" && Date.now() > expiresAt) {
      await this.delete(key);
      return null;
    }

    return JSON.parse(value as string) as T;
  }

  async set<T = unknown>(key: string, value: T, options?: { ttl?: number }): Promise<void> {
    const expiresAt = options?.ttl ? Date.now() + (options.ttl * 1000) : null;

    // Ensure table exists
    await this.sqlite.execute({
      sql: `CREATE TABLE IF NOT EXISTS oauth_storage (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER,
        created_at INTEGER DEFAULT (unixepoch() * 1000)
      )`,
      args: [],
    });

    await this.sqlite.execute({
      sql: "INSERT OR REPLACE INTO oauth_storage (key, value, expires_at) VALUES (?, ?, ?)",
      args: [key, JSON.stringify(value), expiresAt],
    });
  }

  async delete(key: string): Promise<void> {
    await this.sqlite.execute({
      sql: "DELETE FROM oauth_storage WHERE key = ?",
      args: [key],
    });
  }
}

/**
 * Example localStorage-compatible storage (for browser/Deno environments with localStorage)
 */
export class LocalStorage implements OAuthStorage {
  async get<T = unknown>(key: string): Promise<T | null> {
    await Promise.resolve(); // Satisfy require-await linting rule
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;

      const parsed = JSON.parse(item);
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        localStorage.removeItem(key);
        return null;
      }

      return parsed.value as T;
    } catch {
      return null;
    }
  }

  async set<T = unknown>(key: string, value: T, options?: { ttl?: number }): Promise<void> {
    await Promise.resolve(); // Satisfy require-await linting rule
    const expiresAt = options?.ttl ? Date.now() + (options.ttl * 1000) : undefined;
    const item = { value, expiresAt };
    localStorage.setItem(key, JSON.stringify(item));
  }

  async delete(key: string): Promise<void> {
    await Promise.resolve(); // Satisfy require-await linting rule
    localStorage.removeItem(key);
  }
}
