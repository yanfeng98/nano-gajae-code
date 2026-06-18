import type { Settings } from "../config/settings";
import { localBackend } from "./local-backend";
import { offBackend } from "./off-backend";
import type { MemoryBackend } from "./types";

/**
 * Pick the active memory backend for a Settings instance.
 *
 *   - `memory.backend === "local"`      → local pipeline
 *   - everything else                   → no-op
 */
export function resolveMemoryBackend(settings: Settings): MemoryBackend {
	const id = settings.get("memory.backend");
	if (id === "local") return localBackend;
	return offBackend;
}
