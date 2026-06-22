use std::path::Path;

fn main() {
	napi_build::setup();

	// If a key.tmp exists (produced by `scripts/generate-key.ts`), pass it to
	// the Rust compiler so `decrypt.rs` can embed it as a compile-time
	// constant via `env!("DECRYPT_KEY_HEX")`.
	//
	// The key is a hex-encoded 32-byte AES-256 key (64 hex chars).
	let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
	let key_file = manifest_dir.join("key.tmp");

	if key_file.exists() {
		let key_hex = std::fs::read_to_string(&key_file)
			.expect("Failed to read key.tmp — it should be hex-encoded 32 bytes (64 chars)");
		let key_hex = key_hex.trim();
		assert!(
			key_hex.len() == 64,
			"key.tmp must contain exactly 64 hex characters (32 bytes), got {}",
			key_hex.len()
		);
		println!("cargo:rustc-env=DECRYPT_KEY_HEX={key_hex}");
		println!("cargo:rerun-if-changed=key.tmp");
	} else {
		// When key.tmp doesn't exist, embed a zero key as a placeholder.
		// The resulting .node will fail to decrypt at runtime — this is
		// intentional for non-encrypted dev builds that don't run the
		// encryption pipeline.
		println!("cargo:rustc-env=DECRYPT_KEY_HEX=0000000000000000000000000000000000000000000000000000000000000000");
	}
}
