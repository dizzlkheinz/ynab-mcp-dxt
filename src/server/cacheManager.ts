/**
 * Cache Manager for YNAB API responses
 * Provides in-memory caching with TTL to reduce API calls and improve performance
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class CacheManager {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes in milliseconds

  /**
   * Get cached data if valid, null if expired or not found
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cache entry with optional TTL
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    };

    this.cache.set(key, entry);
  }

  /**
   * Clear specific cache entry
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  getEntriesForSizeEstimation(): Array<[string, CacheEntry<unknown>]> {
    return Array.from(this.cache.entries());
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Generate cache key from parameters
   */
  static generateKey(prefix: string, ...params: (string | number | boolean | undefined)[]): string {
    const cleanParams = params
      .filter((p) => p !== undefined)
      .map((p) => String(p))
      .join(':');

    return `${prefix}:${cleanParams}`;
  }
}

// Cache TTL configurations for different data types
export const CACHE_TTLS = {
  BUDGETS: 10 * 60 * 1000, // 10 minutes - budgets don't change often
  ACCOUNTS: 5 * 60 * 1000, // 5 minutes - account info is fairly static
  CATEGORIES: 5 * 60 * 1000, // 5 minutes - categories change infrequently
  PAYEES: 10 * 60 * 1000, // 10 minutes - payees are relatively stable
  TRANSACTIONS: 2 * 60 * 1000, // 2 minutes - transactions change more frequently
  USER_INFO: 30 * 60 * 1000, // 30 minutes - user info rarely changes
  MONTHS: 5 * 60 * 1000, // 5 minutes - month data changes with new transactions
} as const;

// Singleton cache manager instance
export const cacheManager = new CacheManager();
