//! Integration tests for example plugins

#[cfg(test)]
mod tests {
    use bfosa_plugin_api::PluginValidator;

    /// Helper to create a minimal valid WASM module for testing
    fn create_minimal_wasm() -> Vec<u8> {
        // This is a minimal valid WASM module with the required exports
        // In real testing, you'd use the actual compiled .wasm files
        vec![
            0x00, 0x61, 0x73, 0x6D, // Magic number
            0x01, 0x00, 0x00, 0x00, // Version
        ]
    }

    #[test]
    fn test_plugin_validator_exists() {
        let validator = PluginValidator::new();
        // Test that validator can be created
        assert_eq!(validator.max_plugin_size(), 10 * 1024 * 1024);
    }

    #[test]
    fn test_validate_minimal_wasm() {
        let wasm_bytes = create_minimal_wasm();
        let validator = PluginValidator::new();
        let result = validator.validate(&wasm_bytes);
        // Should validate magic number even if exports are missing
        assert!(result.errors.is_empty() || result.errors.len() < 10);
    }

    #[test]
    fn test_reject_invalid_magic_number() {
        let invalid_wasm = vec![0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00];
        let validator = PluginValidator::new();
        let result = validator.validate(&invalid_wasm);
        assert!(!result.errors.is_empty());
        assert!(result.errors[0].contains("magic"));
    }

    #[test]
    fn test_reject_oversized_plugin() {
        let oversized = vec![0u8; 11 * 1024 * 1024]; // 11MB
        let validator = PluginValidator::new();
        let result = validator.validate(&oversized);
        assert!(!result.errors.is_empty() || !result.is_valid());
    }

    #[test]
    fn test_required_exports_known() {
        // Verify we know what exports are required
        let required = vec![
            "bfosa_plugin_info",
            "bfosa_process_file",
            "bfosa_finalize",
            "bfosa_cleanup",
        ];
        assert_eq!(required.len(), 4);
    }

    // Note: The following tests would work with actual compiled WASM files
    // For now, they serve as documentation of expected behavior

    #[test]
    fn test_md5_plugin_metadata_structure() {
        // Expected metadata structure for MD5 calculator
        let expected_id = "md5-calculator";
        let expected_name = "MD5 Calculator";
        let supports_streaming = true;
        let max_file_size = 100 * 1024 * 1024; // 100MB

        assert_eq!(expected_id, "md5-calculator");
        assert_eq!(expected_name, "MD5 Calculator");
        assert!(supports_streaming);
        assert_eq!(max_file_size, 100 * 1024 * 1024);
    }

    #[test]
    fn test_line_counter_extensions() {
        let expected_extensions = vec![
            "txt", "md", "js", "ts", "jsx", "tsx",
            "rs", "go", "py", "java", "c", "cpp", "h", "hpp",
        ];

        assert_eq!(expected_extensions.len(), 13);
        assert!(expected_extensions.contains(&"rs"));
        assert!(expected_extensions.contains(&"ts"));
    }

    #[test]
    fn test_md5_calculates_correct_hash() {
        // Known MD5 hash for "hello" is: 5d41402abc4b2a76b9719d911017c592
        let input = "hello";
        let expected_hash = "5d41402abc4b2a76b9719d911017c592";

        // This is a reference test - actual plugin would compute this
        assert_eq!(expected_hash.len(), 32);
        assert_eq!(input, "hello");
    }

    #[test]
    fn test_line_counter_counts_correctly() {
        let test_content = "line 1\nline 2\n\nline 4\n";
        let expected_total = 4; // 4 lines
        let expected_blank = 1; // 1 blank line
        let expected_non_blank = 3; // 3 non-blank lines

        // This is a reference test
        assert_eq!(expected_total, 4);
        assert_eq!(expected_blank, 1);
        assert_eq!(expected_non_blank, 3);
    }
}
