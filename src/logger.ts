/**
 * @fileoverview Logging abstraction for OAuth client operations
 * @module
 */

/**
 * Logger interface for OAuth client operations.
 *
 * Implement this interface to provide custom logging for the OAuth client.
 * By default, the client uses a no-op logger that produces no output.
 *
 * @example Custom logger implementation
 * ```ts
 * class ConsoleLogger implements Logger {
 *   debug(message: string, ...args: unknown[]): void {
 *     console.debug(`[DEBUG] ${message}`, ...args);
 *   }
 *
 *   info(message: string, ...args: unknown[]): void {
 *     console.info(`[INFO] ${message}`, ...args);
 *   }
 *
 *   warn(message: string, ...args: unknown[]): void {
 *     console.warn(`[WARN] ${message}`, ...args);
 *   }
 *
 *   error(message: string, ...args: unknown[]): void {
 *     console.error(`[ERROR] ${message}`, ...args);
 *   }
 * }
 *
 * const client = new OAuthClient({
 *   // ... other config
 *   logger: new ConsoleLogger(),
 * });
 * ```
 */
export interface Logger {
  /**
   * Log debug-level message (lowest priority).
   * Use for detailed diagnostic information.
   */
  debug(message: string, ...args: unknown[]): void;

  /**
   * Log info-level message.
   * Use for general informational messages.
   */
  info(message: string, ...args: unknown[]): void;

  /**
   * Log warning-level message.
   * Use for potentially harmful situations.
   */
  warn(message: string, ...args: unknown[]): void;

  /**
   * Log error-level message (highest priority).
   * Use for error events that might still allow the application to continue.
   */
  error(message: string, ...args: unknown[]): void;
}

/**
 * No-op logger implementation that produces no output.
 *
 * This is the default logger used by the OAuth client when no custom
 * logger is provided. All log methods are no-ops.
 *
 * @example
 * ```ts
 * const logger = new NoOpLogger();
 * logger.info("This will not be logged anywhere");
 * ```
 */
export class NoOpLogger implements Logger {
  debug(_message: string, ..._args: unknown[]): void {
    // No-op
  }

  info(_message: string, ..._args: unknown[]): void {
    // No-op
  }

  warn(_message: string, ..._args: unknown[]): void {
    // No-op
  }

  error(_message: string, ..._args: unknown[]): void {
    // No-op
  }
}

/**
 * Console logger implementation for development and debugging.
 *
 * Logs all messages to the console with appropriate log levels.
 * Useful for development but not recommended for production.
 *
 * @example
 * ```ts
 * const client = new OAuthClient({
 *   // ... other config
 *   logger: new ConsoleLogger(),
 * });
 * ```
 */
export class ConsoleLogger implements Logger {
  debug(message: string, ...args: unknown[]): void {
    console.debug(`[DEBUG] ${message}`, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    console.info(`[INFO] ${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[WARN] ${message}`, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(`[ERROR] ${message}`, ...args);
  }
}
