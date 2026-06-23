import { describe, expect, it } from "bun:test";
import {
	ENCRYPTED_BUNDLE_MAGIC,
	ENCRYPTED_BUNDLE_NONCE_LENGTH,
	createEncryptedBundlePayload,
	deriveBundleKey,
	parseEncryptedBundlePayload,
} from "./bundle-crypto";

describe("bundle crypto format", () => {
	it("derives distinct per-bundle keys from the same master key", () => {
		const masterKey = Buffer.alloc(32, 7);
		const mainKey = deriveBundleKey(masterKey, "enc-main.bin");
		const workerKey = deriveBundleKey(masterKey, "enc-sync-worker.bin");

		expect(mainKey.equals(workerKey)).toBe(false);
		expect(mainKey.length).toBe(32);
		expect(workerKey.length).toBe(32);
	});

	it("encodes a self-describing payload header", () => {
		const masterKey = Buffer.alloc(32, 9);
		const payload = createEncryptedBundlePayload(masterKey, "enc-main.bin", Buffer.from("console.log('x')"));
		const parsed = parseEncryptedBundlePayload(payload);

		expect(payload.subarray(0, ENCRYPTED_BUNDLE_MAGIC.length).equals(ENCRYPTED_BUNDLE_MAGIC)).toBe(true);
		expect(parsed.bundleId).toBe("enc-main.bin");
		expect(parsed.nonce.length).toBe(ENCRYPTED_BUNDLE_NONCE_LENGTH);
		expect(parsed.ciphertextWithTag.length).toBeGreaterThan(16);
	});
});
