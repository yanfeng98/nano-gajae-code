import * as crypto from "node:crypto";

export const ENCRYPTED_BUNDLE_MAGIC = Buffer.from("GJCE", "ascii");
export const ENCRYPTED_BUNDLE_VERSION = 2;
export const ENCRYPTED_BUNDLE_NONCE_LENGTH = 12;
export const ENCRYPTED_BUNDLE_TAG_LENGTH = 16;
const HEADER_PREFIX_LENGTH = ENCRYPTED_BUNDLE_MAGIC.length + 4;
const DERIVE_PREFIX = Buffer.from("gjc-bundle:v2\0", "utf8");

export interface ParsedEncryptedBundlePayload {
	header: Buffer;
	bundleId: string;
	nonce: Buffer;
	ciphertextWithTag: Buffer;
}

export function deriveBundleKey(masterKey: Uint8Array, bundleId: string): Buffer {
	if (masterKey.byteLength !== 32) {
		throw new Error(`Master key must be 32 bytes, got ${masterKey.byteLength}`);
	}
	const bundleIdBytes = Buffer.from(bundleId, "utf8");
	if (bundleIdBytes.length === 0 || bundleIdBytes.length > 255) {
		throw new Error(`Bundle ID must be 1..255 UTF-8 bytes, got ${bundleIdBytes.length}`);
	}
	return crypto.createHmac("sha256", Buffer.from(masterKey)).update(DERIVE_PREFIX).update(bundleIdBytes).digest();
}

export function encodeEncryptedBundleHeader(bundleId: string, nonce: Uint8Array): Buffer {
	const bundleIdBytes = Buffer.from(bundleId, "utf8");
	if (bundleIdBytes.length === 0 || bundleIdBytes.length > 255) {
		throw new Error(`Bundle ID must be 1..255 UTF-8 bytes, got ${bundleIdBytes.length}`);
	}
	if (nonce.byteLength !== ENCRYPTED_BUNDLE_NONCE_LENGTH) {
		throw new Error(`Nonce must be ${ENCRYPTED_BUNDLE_NONCE_LENGTH} bytes, got ${nonce.byteLength}`);
	}
	return Buffer.concat([
		ENCRYPTED_BUNDLE_MAGIC,
		Buffer.from([
			ENCRYPTED_BUNDLE_VERSION,
			bundleIdBytes.length,
			ENCRYPTED_BUNDLE_NONCE_LENGTH,
			0,
		]),
		bundleIdBytes,
		Buffer.from(nonce),
	]);
}

export function createEncryptedBundlePayload(masterKey: Uint8Array, bundleId: string, plaintext: Uint8Array): Buffer {
	if (plaintext.byteLength === 0) {
		throw new Error("Plaintext must not be empty");
	}
	const nonce = crypto.getRandomValues(new Uint8Array(ENCRYPTED_BUNDLE_NONCE_LENGTH));
	const header = encodeEncryptedBundleHeader(bundleId, nonce);
	const bundleKey = deriveBundleKey(masterKey, bundleId);
	try {
		const cipher = crypto.createCipheriv("aes-256-gcm", bundleKey, nonce);
		cipher.setAAD(header);
		const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
		const tag = cipher.getAuthTag();
		return Buffer.concat([header, encrypted, tag]);
	} finally {
		bundleKey.fill(0);
	}
}

export function parseEncryptedBundlePayload(payload: Uint8Array): ParsedEncryptedBundlePayload {
	if (payload.byteLength < HEADER_PREFIX_LENGTH + ENCRYPTED_BUNDLE_NONCE_LENGTH + ENCRYPTED_BUNDLE_TAG_LENGTH) {
		throw new Error("Encrypted payload is too short to be valid");
	}
	const bytes = Buffer.from(payload);
	if (!bytes.subarray(0, ENCRYPTED_BUNDLE_MAGIC.length).equals(ENCRYPTED_BUNDLE_MAGIC)) {
		throw new Error("Encrypted payload magic mismatch");
	}
	if (bytes[4] !== ENCRYPTED_BUNDLE_VERSION) {
		throw new Error(`Unsupported encrypted payload version: ${bytes[4]}`);
	}
	const bundleIdLength = bytes[5] ?? 0;
	const nonceLength = bytes[6] ?? 0;
	const flags = bytes[7] ?? 0;
	if (bundleIdLength === 0) {
		throw new Error("Encrypted payload bundle ID is empty");
	}
	if (nonceLength !== ENCRYPTED_BUNDLE_NONCE_LENGTH) {
		throw new Error(`Unsupported encrypted payload nonce length: ${nonceLength}`);
	}
	if (flags !== 0) {
		throw new Error(`Unsupported encrypted payload flags: ${flags}`);
	}
	const headerLength = HEADER_PREFIX_LENGTH + bundleIdLength + nonceLength;
	if (bytes.length < headerLength + ENCRYPTED_BUNDLE_TAG_LENGTH) {
		throw new Error("Encrypted payload truncated");
	}
	const bundleIdBytes = bytes.subarray(HEADER_PREFIX_LENGTH, HEADER_PREFIX_LENGTH + bundleIdLength);
	const bundleId = bundleIdBytes.toString("utf8");
	if (Buffer.from(bundleId, "utf8").length !== bundleIdLength) {
		throw new Error("Encrypted payload bundle ID is not valid UTF-8");
	}
	return {
		header: bytes.subarray(0, headerLength),
		bundleId,
		nonce: bytes.subarray(HEADER_PREFIX_LENGTH + bundleIdLength, headerLength),
		ciphertextWithTag: bytes.subarray(headerLength),
	};
}
