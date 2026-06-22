// "which" helper with flexible cache control.
//
// - Supports four cache modes (`none`, `fresh`, `ro`, `cached`) for control over discovery cost and determinism.
// - Computes a stable cache key from command + options to avoid redundant lookups within a process.
// - Returns path to resolved binary or null if not found.

import * as path from "node:path";

type CacheKey = string | bigint | number;

// Map: cache key -> resolved binary path or null (not found)
const toolCache = new Map<CacheKey, string | null>();

/**
 * Cache policy for which lookups.
 */
export const enum WhichCachePolicy {
	/**
	 * Use cached result if available.
	 */
	Cached = 0,
	/**
	 * Bypass cache and perform a new lookup.
	 */
	Bypass,
	/**
	 * Always update cache.
	 */
	Fresh,
	/**
	 * Read-only, serves from cache if present, but doesn't write.
	 */
	ReadOnly,
}

// Extension: additional cache policy for tool path lookup
export interface WhichOptions extends Bun.WhichOptions {
	/**
	 * Cache policy for the lookup.
	 * Defaults to `WhichCachePolicy.Fresh`.
	 */
	cache?: WhichCachePolicy;
}

// Derive stable cache key from command and lookup options
function cacheKey(command: string, options?: Bun.WhichOptions): CacheKey {
	if (!options) return command;
	if (!options.cwd && !options.PATH) return command;
	let h = Bun.hash(command);
	if (options.cwd) h = Bun.hash(options.cwd, h);
	if (options.PATH) h = Bun.hash(options.PATH, h);
	return h;
}

/**
 * Locate binary on PATH (with flexible caching).
 *
 * @param command - Binary name to resolve
 * @param options - Bun.WhichOptions plus `cache` control
 * @returns Filesystem path if found, else null
 */
export function $which(command: string, options?: WhichOptions): string | null {
	const cachePolicy = options?.cache ?? WhichCachePolicy.Cached;
	let key: CacheKey | undefined;

	if (cachePolicy !== WhichCachePolicy.Bypass) {
		key = cacheKey(command, options);
		if (cachePolicy !== WhichCachePolicy.Fresh) {
			const cached = toolCache.get(key);
			if (cached !== undefined) return cached;
		}
	}

	const result = Bun.which(command, options);
	if (key != null && cachePolicy !== WhichCachePolicy.ReadOnly) {
		toolCache.set(key, result);
	}
	return result;
}
