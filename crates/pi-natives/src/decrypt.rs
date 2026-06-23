//! Encrypted bundle decryption for compiled-binary code protection.
//!
//! At build time the JS mega-bundle is encrypted with per-bundle AES-256-GCM
//! keys derived from a build-scoped master key. The master key is passed to the
//! compiler via `DECRYPT_MASTER_KEY_HEX` (set by `build.rs` from `key.tmp`).
//! This module reconstructs the master key at runtime, derives the expected
//! bundle key, decrypts the payload, and returns the original JS source — all
//! inside native machine code.
//!
//! # Anti-debug
//! On Linux, `detect_debugger()` reads `/proc/self/status` and checks
//! `TracerPid`. If a tracer is attached the decrypt function refuses to
//! produce plaintext, forcing an attacker to also bypass the ptrace check.

use aes_gcm::aead::{Aead, Payload, generic_array::GenericArray};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use hmac::{Hmac, Mac};
use napi::bindgen_prelude::Buffer;
use napi_derive::napi;
use sha2::Sha256;

// ── Compile-time key material ──────────────────────────────────────────────

/// AES-256 master key (64 hex chars → 32 bytes), injected by `build.rs` at
/// compile time. Bundle-specific keys are derived from this master key with
/// HMAC-SHA256 so each encrypted payload gets an independent AES key.
const MASTER_KEY_HEX: &str = env!("DECRYPT_MASTER_KEY_HEX");
const ENCRYPTED_BUNDLE_MAGIC: &[u8; 4] = b"GJCE";
const ENCRYPTED_BUNDLE_VERSION: u8 = 2;
const ENCRYPTED_BUNDLE_NONCE_LENGTH: usize = 12;
const ENCRYPTED_BUNDLE_TAG_LENGTH: usize = 16;
const ENCRYPTED_BUNDLE_HEADER_PREFIX_LENGTH: usize = ENCRYPTED_BUNDLE_MAGIC.len() + 4;
const KEY_DERIVE_PREFIX: &[u8] = b"gjc-bundle:v2\0";

type HmacSha256 = Hmac<Sha256>;

/// Parse 64-char hex string to `[u8; 32]` at runtime. The compiler will
/// typically constant-fold this, but we keep it as a function so the key
/// material can be zeroed after use.
fn decode_master_key() -> [u8; 32] {
	let mut key = [0u8; 32];
	for i in 0..32 {
		let hi = hex_nibble(MASTER_KEY_HEX.as_bytes()[i * 2]);
		let lo = hex_nibble(MASTER_KEY_HEX.as_bytes()[i * 2 + 1]);
		key[i] = (hi << 4) | lo;
	}
	key
}

const fn hex_nibble(b: u8) -> u8 {
	match b {
		b'0'..=b'9' => b - b'0',
		b'a'..=b'f' => b - b'a' + 10,
		b'A'..=b'F' => b - b'A' + 10,
		_ => 0, // unreachable — key.tmp is validated at generation time
	}
}

// ── Anti-debug ─────────────────────────────────────────────────────────────

/// Check whether a debugger (ptrace) is attached to this process.
#[cfg(target_os = "linux")]
fn detect_debugger() -> bool {
	let content = match std::fs::read_to_string("/proc/self/status") {
		Ok(c) => c,
		Err(_) => return false,
	};
	for line in content.lines() {
		if let Some(pid_str) = line.strip_prefix("TracerPid:") {
			let pid: i32 = pid_str.trim().parse().unwrap_or(0);
			return pid != 0;
		}
	}
	false
}

/// No-op on non-Linux targets (the encrypted build only targets Linux).
#[cfg(not(target_os = "linux"))]
fn detect_debugger() -> bool {
	false
}

struct ParsedEncryptedBundle<'a> {
	bundle_id: &'a str,
	header: &'a [u8],
	nonce: &'a [u8],
	ciphertext_with_tag: &'a [u8],
}

fn derive_bundle_key(master_key: &[u8; 32], bundle_id: &str) -> napi::Result<[u8; 32]> {
	let mut mac = <HmacSha256 as Mac>::new_from_slice(master_key)
		.map_err(|_| napi::Error::from_reason("Failed to initialize bundle key derivation"))?;
	mac.update(KEY_DERIVE_PREFIX);
	mac.update(bundle_id.as_bytes());
	let digest = mac.finalize().into_bytes();
	let mut derived = [0u8; 32];
	derived.copy_from_slice(&digest);
	Ok(derived)
}

fn parse_encrypted_bundle(encrypted: &[u8]) -> napi::Result<ParsedEncryptedBundle<'_>> {
	if encrypted.len() < ENCRYPTED_BUNDLE_HEADER_PREFIX_LENGTH + ENCRYPTED_BUNDLE_NONCE_LENGTH + ENCRYPTED_BUNDLE_TAG_LENGTH {
		return Err(napi::Error::from_reason(
			"Encrypted bundle is too short to be valid",
		));
	}
	if &encrypted[..ENCRYPTED_BUNDLE_MAGIC.len()] != ENCRYPTED_BUNDLE_MAGIC {
		return Err(napi::Error::from_reason(
			"Encrypted bundle header magic mismatch",
		));
	}
	if encrypted[4] != ENCRYPTED_BUNDLE_VERSION {
		return Err(napi::Error::from_reason(format!(
			"Unsupported encrypted bundle version: {}",
			encrypted[4]
		)));
	}

	let bundle_id_length = usize::from(encrypted[5]);
	let nonce_length = usize::from(encrypted[6]);
	let flags = encrypted[7];

	if bundle_id_length == 0 {
		return Err(napi::Error::from_reason(
			"Encrypted bundle header is missing a bundle ID",
		));
	}
	if nonce_length != ENCRYPTED_BUNDLE_NONCE_LENGTH {
		return Err(napi::Error::from_reason(format!(
			"Unsupported encrypted bundle nonce length: {nonce_length}",
		)));
	}
	if flags != 0 {
		return Err(napi::Error::from_reason(format!(
			"Unsupported encrypted bundle flags: {flags}",
		)));
	}

	let header_length = ENCRYPTED_BUNDLE_HEADER_PREFIX_LENGTH + bundle_id_length + nonce_length;
	if encrypted.len() < header_length + ENCRYPTED_BUNDLE_TAG_LENGTH {
		return Err(napi::Error::from_reason(
			"Encrypted bundle payload is truncated",
		));
	}

	let bundle_id_start = ENCRYPTED_BUNDLE_HEADER_PREFIX_LENGTH;
	let bundle_id_end = bundle_id_start + bundle_id_length;
	let nonce_end = header_length;
	let bundle_id = std::str::from_utf8(&encrypted[bundle_id_start..bundle_id_end])
		.map_err(|_| napi::Error::from_reason("Encrypted bundle ID is not valid UTF-8"))?;

	Ok(ParsedEncryptedBundle {
		bundle_id,
		header: &encrypted[..header_length],
		nonce: &encrypted[bundle_id_end..nonce_end],
		ciphertext_with_tag: &encrypted[header_length..],
	})
}

// ── N-API export ───────────────────────────────────────────────────────────

/// Decrypt the AES-256-GCM-encrypted app bundle.
///
/// # Format
/// `encrypted` layout:
/// `[magic: 4][version: 1][bundle_id_len: 1][nonce_len: 1][flags: 1][bundle_id][nonce][ciphertext + tag]`
///
/// The launcher must supply `expected_bundle_id` so the decryptor can reject
/// swapped payloads and derive the matching bundle-specific AES key.
#[napi]
pub fn decrypt_bundle(encrypted: Buffer, expected_bundle_id: String) -> napi::Result<String> {
	if detect_debugger() {
		return Err(napi::Error::from_reason(
			"Refusing to decrypt under a debugger",
		));
	}

	let parsed = parse_encrypted_bundle(encrypted.as_ref())?;
	if parsed.bundle_id != expected_bundle_id {
		return Err(napi::Error::from_reason(format!(
			"Encrypted bundle ID mismatch: expected {expected_bundle_id}, got {}",
			parsed.bundle_id
		)));
	}

	let mut master_key = decode_master_key();
	let mut bundle_key = derive_bundle_key(&master_key, &expected_bundle_id)?;
	zero_bytes(&mut master_key);
	let cipher = Aes256Gcm::new(GenericArray::from_slice(&bundle_key));
	zero_bytes(&mut bundle_key);
	let nonce = Nonce::from_slice(parsed.nonce);
	let plaintext = cipher
		.decrypt(
			nonce,
			Payload {
				msg: parsed.ciphertext_with_tag,
				aad: parsed.header,
			},
		)
		.map_err(|_| napi::Error::from_reason("Bundle decryption failed — key mismatch, payload swap, or corrupted data"))?;

	String::from_utf8(plaintext)
			.map_err(|_| napi::Error::from_reason("Decrypted bundle is not valid UTF-8"))
}

/// Volatile zeroing — the compiler cannot optimise this away.
fn zero_bytes(bytes: &mut [u8]) {
	for byte in bytes.iter_mut() {
		// SAFETY: writing to a valid mutable reference.
		unsafe { std::ptr::write_volatile(byte, 0) };
	}
}
