//! Encrypted bundle decryption for compiled-binary code protection.
//!
//! At build time the JS mega-bundle is encrypted with AES-256-GCM. The key is
//! passed to the compiler via `DECRYPT_KEY_HEX` (set by `build.rs` from
//! `key.tmp`). This module reconstructs the key at runtime, decrypts the
//! bundle, and returns the original JS source — all inside native machine code.
//!
//! # Anti-debug
//! On Linux, `detect_debugger()` reads `/proc/self/status` and checks
//! `TracerPid`. If a tracer is attached the decrypt function refuses to
//! produce plaintext, forcing an attacker to also bypass the ptrace check.

use aes_gcm::aead::{Aead, generic_array::GenericArray};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use napi::bindgen_prelude::Buffer;
use napi_derive::napi;

// ── Compile-time key material ──────────────────────────────────────────────

/// AES-256 key (64 hex chars → 32 bytes), injected by `build.rs` at compile
/// time. Exists as a string literal in the `.node`'s `.rodata` section —
/// extracting it requires disassembly of the native binary.
const KEY_HEX: &str = env!("DECRYPT_KEY_HEX");

/// Parse 64-char hex string to `[u8; 32]` at runtime. The compiler will
/// typically constant-fold this, but we keep it as a function so the key
/// material can be zeroed after use.
fn decode_key() -> [u8; 32] {
	let mut key = [0u8; 32];
	for i in 0..32 {
		let hi = hex_nibble(KEY_HEX.as_bytes()[i * 2]);
		let lo = hex_nibble(KEY_HEX.as_bytes()[i * 2 + 1]);
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

// ── N-API export ───────────────────────────────────────────────────────────

/// Decrypt the AES-256-GCM-encrypted app bundle.
///
/// # Format
/// `encrypted` layout: `[nonce: 12 bytes][ciphertext + tag: N + 16 bytes]`
///
/// The nonce is prepended at encryption time by the TypeScript
/// `scripts/encrypt-bundle.ts` script.
#[napi]
pub fn decrypt_bundle(encrypted: Buffer) -> napi::Result<String> {
	if detect_debugger() {
		return Err(napi::Error::from_reason(
			"Refusing to decrypt under a debugger",
		));
	}

	if encrypted.len() < 28 {
		// Absolute minimum: 12-byte nonce + 16-byte GCM tag
		return Err(napi::Error::from_reason(
			"Encrypted bundle is too short to be valid",
		));
	}

	let mut key = decode_key();

	let cipher = Aes256Gcm::new(GenericArray::from_slice(&key));

	// Zero key material — the cipher has copied what it needs.
	zero_bytes(&mut key);

	let nonce = Nonce::from_slice(&encrypted[..12]);
	let plaintext = cipher
		.decrypt(nonce, &encrypted[12..])
		.map_err(|_| napi::Error::from_reason("Bundle decryption failed — key mismatch or corrupted data"))?;

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
