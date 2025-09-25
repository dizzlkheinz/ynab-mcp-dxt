/**
 * Cache Manager for YNAB API responses
 * Provides in-memory caching with TTL to reduce API calls and improve performance
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  staleWhileRevalidate?: number;
}

interface CacheSetOptions {
  ttl?: number;
  staleWhileRevalidate?: number;
}

export class CacheManager {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTTL: number;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private lastCleanup: number | null = null;
  private maxEntries: number;
  private defaultStaleWindow: number;
  private pendingFetches = new Map<string, Promise<unknown>>();
  private pendingRefresh = new Set<string>();

  constructor() {
    this.maxEntries = this.parseEnvInt('YNAB_MCP_CACHE_MAX_ENTRIES', 1000);
    this.defaultStaleWindow = this.parseEnvInt('YNAB_MCP_CACHE_STALE_MS', 2 * 60 * 1000);
    this.defaultTTL = this.parseEnvInt('YNAB_MCP_CACHE_DEFAULT_TTL_MS', 300000);
  }

  /**
   * Get cached data if valid, null if expired or not found
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;

    // Check if entry is expired
    if (age > entry.ttl) {
      // Check if we're within stale-while-revalidate window
      const staleWindow = entry.staleWhileRevalidate || 0;
      if (staleWindow > 0 && age <= entry.ttl + staleWindow) {
        this.hits++;
        // Update access order for LRU
        this.cache.delete(key);
        this.cache.set(key, entry);
        // Mark for background refresh
        this.pendingRefresh.add(key);
        return entry.data as T;
      }

      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    // Update access order for LRU
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data as T;
  }

  /**
   * Set cache entry with optional TTL or options
   */
  set<T>(key: string, data: T, ttlOrOptions?: number | CacheSetOptions): void {
    // Don't cache anything if maxEntries is 0
    if (this.maxEntries <= 0) {
      return;
    }

    this.evictIfNeeded();

    let ttl: number;
    let staleWhileRevalidate: number | undefined;

    if (typeof ttlOrOptions === 'number') {
      ttl = Number.isFinite(ttlOrOptions) ? ttlOrOptions : this.defaultTTL;
      // When using simple number interface, don't apply default stale window
      staleWhileRevalidate = undefined;
    } else {
      const providedTtl = ttlOrOptions?.ttl;
      ttl = providedTtl !== undefined ? providedTtl : this.defaultTTL;
      // Only use default stale window when staleWhileRevalidate property exists but is undefined
      if (ttlOrOptions && 'staleWhileRevalidate' in ttlOrOptions) {
        staleWhileRevalidate = ttlOrOptions.staleWhileRevalidate ?? this.defaultStaleWindow;
      } else {
        staleWhileRevalidate = ttlOrOptions?.staleWhileRevalidate;
      }
    }
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
      staleWhileRevalidate,
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
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.lastCleanup = null;
    this.pendingFetches.clear();
    this.pendingRefresh.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    keys: string[];
    hits: number;
    misses: number;
    evictions: number;
    lastCleanup: number | null;
    maxEntries: number;
    hitRate: number;
  } {
    const totalRequests = this.hits + this.misses;
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      lastCleanup: this.lastCleanup,
      maxEntries: this.maxEntries,
      hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
    };
  }

  /**
   * Provide a filtered snapshot for cache size estimation without exposing expired entries.
   */
  getEntriesForSizeEstimation(): [string, CacheEntry<unknown>][] {
    const now = Date.now();
    return Array.from(this.cache.entries()).filter(
      ([, entry]) => now - entry.timestamp <= entry.ttl,
    );
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const result = this.cleanupDetailed();
    return result.cleaned;
  }

  /**
   * Clean up expired entries with detailed information
   */
  cleanupDetailed(): { cleaned: number; evictions: number } {
    const now = Date.now();
    let cleaned = 0;
    const initialEvictions = this.evictions;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
        this.evictions++;
      }
    }

    this.lastCleanup = now;
    return { cleaned, evictions: this.evictions - initialEvictions };
  }

  /**
   * Wrap a loader function with caching and concurrent deduplication
   */
  async wrap<T>(key: string, options: CacheSetOptions & { loader: () => Promise<T> }): Promise<T> {
    // Check cache first and preserve existing entry for background refresh
    const existingEntry = this.cache.get(key);
    const cached = this.get<T>(key);
    if (cached !== null) {
      // Check if this key was marked for background refresh (stale-while-revalidate)
      if (this.pendingRefresh.has(key) && !this.pendingFetches.has(key)) {
        // Start background refresh
        const refreshPromise = options.loader().then(
          (result) => {
            // Preserve existing TTL/SWR if not specified in options
            const refreshOptions: CacheSetOptions = {
              ttl: options.ttl ?? existingEntry?.ttl,
              staleWhileRevalidate:
                options.staleWhileRevalidate ?? existingEntry?.staleWhileRevalidate,
            };
            // Cache the successful result
            this.set(key, result, refreshOptions);
            // Clean up
            this.pendingFetches.delete(key);
            this.pendingRefresh.delete(key);
            return result;
          },
          (error) => {
            // Clean up on error
            this.pendingFetches.delete(key);
            this.pendingRefresh.delete(key);
            throw error;
          },
        );
        this.pendingFetches.set(key, refreshPromise);
      }
      return cached;
    }

    // Check if there's already a pending fetch for this key
    const existingFetch = this.pendingFetches.get(key) as Promise<T> | undefined;
    if (existingFetch) {
      return existingFetch;
    }

    // Execute the loader
    const fetchPromise = options.loader().then(
      (result) => {
        // Cache the successful result using provided options (no existing entry to preserve)
        this.set(key, result, options);
        // Clean up pending fetch
        this.pendingFetches.delete(key);
        this.pendingRefresh.delete(key);
        return result;
      },
      (error) => {
        // Clean up on error, don't cache failures
        this.pendingFetches.delete(key);
        this.pendingRefresh.delete(key);
        throw error;
      },
    );

    // Store the pending fetch
    this.pendingFetches.set(key, fetchPromise);
    return fetchPromise;
  }

  /**
   * Evict least recently used entries if cache is at capacity
   */
  private evictIfNeeded(): void {
    if (this.maxEntries <= 0) return;

    while (this.cache.size >= this.maxEntries) {
      // Get the first (oldest) entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        this.evictions++;
      } else {
        break;
      }
    }
  }

  /**
   * Parse environment variable as integer with fallback
   */
  private parseEnvInt(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (!value) return defaultValue;

    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
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
