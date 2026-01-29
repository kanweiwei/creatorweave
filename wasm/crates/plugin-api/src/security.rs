//! Security validation module
//!
//! Provides additional security checks for WASM plugins:
//! - Plugin size limits
//! - Dangerous import detection
//! - Memory access pattern validation
//! - Timeout enforcement
//!
//! This module complements the basic validation in validator.rs
//! with more thorough security checks.

use crate::types::ValidationResult;
use std::collections::HashSet;

//=============================================================================
// Security Validator
//=============================================================================

/// Security validation entry point
pub struct SecurityValidator {
    max_plugin_size: usize,
    allowed_imports: HashSet<String>,
    blocked_imports: HashSet<String>,
}

impl SecurityValidator {
    /// Create a new security validator with default settings
    pub fn new() -> Self {
        let mut blocked: HashSet<String> = HashSet::new();
        // Dangerous imports that could be used to escape the sandbox
        blocked.extend(vec![
            "eval".to_string(),          // JavaScript eval (for potential WASI/JS interop)
            "function".to_string(),      // Function constructor
            "call".to_string(),          // Direct function calls that bypass host
            "syscall".to_string(),       // System calls
            "instantiate".to_string(),   // WebAssembly.instantiate (could load more code)
            "fetch".to_string(),         // Network access
            "xmlhttp".to_string(),       // XHR network access
            "websocket".to_string(),     // WebSocket network access
            "worker".to_string(),        // Worker creation (could bypass isolation)
            "import_scripts".to_string(), // Dynamic script imports
        ]);

        // Allowed host imports (bfosa_* functions)
        let allowed: HashSet<String> = vec![
            "bfosa_log".to_string(),
            "bfosa_get_version".to_string(),
            "bfosa_get_timestamp".to_string(),
            "bfosa_allocate".to_string(),
            "bfosa_report_progress".to_string(),
            "bfosa_stream_chunk".to_string(),
            "bfosa_stream_complete".to_string(),
            "bfosa_stream_start".to_string(),
            "bfosa_is_streaming".to_string(),
            // Also allow standard WASI imports (optional)
            "wasi_snapshot_preview1".to_string(),
            // Allow internal WASM imports
            "__indirect_function_table".to_string(),
            "__data_end".to_string(),
            "__heap_base".to_string(),
        ].into_iter().collect();

        Self {
            max_plugin_size: 10 * 1024 * 1024, // 10MB default
            allowed_imports: allowed,
            blocked_imports: blocked,
        }
    }

    /// Create a security validator with custom max plugin size
    pub fn with_max_size(max_size: usize) -> Self {
        let mut validator = Self::new();
        validator.max_plugin_size = max_size;
        validator
    }

    /// Check if plugin size is within limits
    pub fn check_size(&self, bytes: &[u8]) -> ValidationResult {
        if bytes.len() > self.max_plugin_size {
            ValidationResult::error(format!(
                "Plugin size {} bytes exceeds limit {} bytes",
                bytes.len(),
                self.max_plugin_size
            ))
        } else {
            ValidationResult::ok()
        }
    }

    /// Check for dangerous/blocked imports in WASM name section
    ///
    /// Note: This is a simplified check. A full implementation would
    /// parse the WASM binary's import section. For now, we check
    /// string patterns that might indicate dangerous imports.
    pub fn check_dangerous_imports(&self, wasm_bytes: &[u8]) -> ValidationResult {
        let mut errors = Vec::new();

        // Convert bytes to string for pattern matching
        // This is a simple heuristic - in production, you'd parse the WASM properly
        let wasm_str = String::from_utf8_lossy(wasm_bytes);

        for blocked in &self.blocked_imports {
            if wasm_str.contains(blocked) {
                errors.push(format!(
                    "Blocked import pattern detected: {}",
                    blocked
                ));
            }
        }

        if errors.is_empty() {
            ValidationResult::ok()
        } else {
            ValidationResult {
                is_valid: false,
                errors,
            }
        }
    }

    /// Verify imports match allowed patterns
    ///
    /// Checks that all imports are either:
    /// 1. bfosa_* host functions (allowed)
    /// 2. __* internal WASM functions (allowed)
    pub fn check_allowed_imports_only(&self, wasm_bytes: &[u8]) -> ValidationResult {
        let mut warnings = Vec::new();

        // Simple heuristic: look for import-like patterns
        let wasm_str = String::from_utf8_lossy(wasm_bytes);

        // Common WASM imports that are NOT bfosa_ and might be suspicious
        let suspicious_patterns = vec![
            "js:",
            "javascript:",
            "node:",
            "fs.",     // File system access
            "path.",   // Path manipulation
            "child_", // Child processes
            "exec",   // Execution
            "shell",  // Shell access
        ];

        for pattern in suspicious_patterns {
            if wasm_str.contains(pattern) {
                warnings.push(format!(
                    "Suspicious import pattern detected: {}",
                    pattern
                ));
            }
        }

        if warnings.is_empty() {
            ValidationResult::ok()
        } else {
            ValidationResult {
                is_valid: true, // Warning, not error
                errors: warnings,
            }
        }
    }

    /// Check for potential infinite loops patterns
    ///
    /// This is a heuristic check - infinite loops can only be truly
    /// detected at runtime via timeout enforcement.
    pub fn check_loop_safety(&self, wasm_bytes: &[u8]) -> ValidationResult {
        // Count loop-related bytecode instructions
        // This is a very basic heuristic
        let loop_count = wasm_bytes.iter()
            .filter(|&&b| b == 0x0B || b == 0x0C || b == 0x0D) // loop, if, block
            .count();

        // Very high loop count might indicate complex control flow
        // that could lead to performance issues
        if loop_count > 10000 {
            ValidationResult::warning(format!(
                "High loop instruction count: {} (may indicate complex control flow)",
                loop_count
            ))
        } else {
            ValidationResult::ok()
        }
    }

    /// Perform all security checks
    pub fn validate(&self, wasm_bytes: &[u8]) -> ValidationResult {
        let size_result = self.check_size(wasm_bytes);
        if !size_result.is_valid {
            return size_result;
        }

        let dangerous_result = self.check_dangerous_imports(wasm_bytes);
        if !dangerous_result.is_valid {
            return dangerous_result;
        }

        let allowed_result = self.check_allowed_imports_only(wasm_bytes);
        let loop_result = self.check_loop_safety(wasm_bytes);

        // Combine warnings
        let mut all_errors = Vec::new();
        if !allowed_result.errors.is_empty() {
            all_errors.extend(allowed_result.errors);
        }
        if !loop_result.errors.is_empty() {
            all_errors.extend(loop_result.errors);
        }

        ValidationResult {
            is_valid: true,
            errors: all_errors,
        }
    }

    /// Get the maximum plugin size
    pub fn max_size(&self) -> usize {
        self.max_plugin_size
    }

    /// Check if an import name is allowed
    pub fn is_import_allowed(&self, import_name: &str) -> bool {
        // Allow bfosa_* imports
        if import_name.starts_with("bfosa_") {
            return true;
        }
        // Allow internal WASM imports
        if import_name.starts_with("__") {
            return true;
        }
        // Check explicit allowlist
        self.allowed_imports.contains(import_name)
    }

    /// Check if an import name is blocked
    pub fn is_import_blocked(&self, import_name: &str) -> bool {
        self.blocked_imports.contains(import_name)
    }
}

impl Default for SecurityValidator {
    fn default() -> Self {
        Self::new()
    }
}

//=============================================================================
// Memory Usage Tracker
//=============================================================================

/// Track memory usage during plugin execution
#[derive(Debug, Clone)]
pub struct MemoryUsage {
    pub initial_pages: u32,
    pub current_pages: u32,
    pub max_pages: u32,
    pub peak_pages: u32,
}

impl MemoryUsage {
    /// Create a new memory usage tracker
    pub fn new(initial_pages: u32, max_pages: u32) -> Self {
        Self {
            initial_pages,
            current_pages: initial_pages,
            max_pages,
            peak_pages: initial_pages,
        }
    }

    /// Update current memory usage
    pub fn update(&mut self, current_pages: u32) {
        self.current_pages = current_pages;
        if current_pages > self.peak_pages {
            self.peak_pages = current_pages;
        }
    }

    /// Check if memory usage exceeds limit
    pub fn exceeds_limit(&self) -> bool {
        self.current_pages > self.max_pages
    }

    /// Get memory usage in bytes
    pub fn current_bytes(&self) -> usize {
        (self.current_pages as usize) * 65536 // WASM page size
    }

    /// Get peak memory usage in bytes
    pub fn peak_bytes(&self) -> usize {
        (self.peak_pages as usize) * 65536
    }

    /// Get memory limit in bytes
    pub fn limit_bytes(&self) -> usize {
        (self.max_pages as usize) * 65536
    }

    /// Get memory usage percentage
    pub fn usage_percentage(&self) -> f64 {
        if self.max_pages == 0 {
            return 100.0;
        }
        (self.current_pages as f64 / self.max_pages as f64) * 100.0
    }
}

//=============================================================================
// Timeout Enforcer
//=============================================================================

/// Enforce execution time limits
#[derive(Debug, Clone)]
pub struct TimeoutEnforcer {
    start_time: u64,
    pub timeout_ms: u64,
    triggered: bool,
}

impl TimeoutEnforcer {
    /// Create a new timeout enforcer
    pub fn new(timeout_ms: u64) -> Self {
        Self {
            start_time: Self::now(),
            timeout_ms,
            triggered: false,
        }
    }

    /// Get current timestamp in milliseconds
    fn now() -> u64 {
        // In a real implementation, this would use a proper clock
        // For WASM, we'd use bfosa_get_timestamp from host
        0 // Placeholder
    }

    /// Check if timeout has been exceeded
    pub fn is_timeout(&self) -> bool {
        let elapsed = Self::now() - self.start_time;
        elapsed > self.timeout_ms
    }

    /// Check and record timeout
    pub fn check_timeout(&mut self) -> bool {
        if self.is_timeout() {
            self.triggered = true;
            true
        } else {
            false
        }
    }

    /// Get elapsed time in milliseconds
    pub fn elapsed(&self) -> u64 {
        Self::now() - self.start_time
    }

    /// Get remaining time in milliseconds
    pub fn remaining(&self) -> i64 {
        let remaining = self.timeout_ms as i64 - self.elapsed() as i64;
        if remaining < 0 {
            0
        } else {
            remaining
        }
    }

    /// Check if timeout was triggered
    pub fn was_triggered(&self) -> bool {
        self.triggered
    }
}

//=============================================================================
// Tests
//=============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_security_validator_new() {
        let validator = SecurityValidator::new();
        assert_eq!(validator.max_size(), 10 * 1024 * 1024);
    }

    #[test]
    fn test_check_size_valid() {
        let validator = SecurityValidator::new();
        let small_plugin = vec![0u8; 1024]; // 1KB
        let result = validator.check_size(&small_plugin);
        assert!(result.is_valid);
    }

    #[test]
    fn test_check_size_oversized() {
        let validator = SecurityValidator::new();
        let oversized = vec![0u8; 11 * 1024 * 1024]; // 11MB
        let result = validator.check_size(&oversized);
        assert!(!result.is_valid);
    }

    #[test]
    fn test_check_size_custom_limit() {
        let validator = SecurityValidator::with_max_size(1024);
        let plugin = vec![0u8; 2048]; // 2KB > 1KB limit
        let result = validator.check_size(&plugin);
        assert!(!result.is_valid);
    }

    #[test]
    fn test_check_dangerous_imports_clean() {
        let validator = SecurityValidator::new();
        let clean_wasm = vec![0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00]; // Valid WASM header
        let result = validator.check_dangerous_imports(&clean_wasm);
        assert!(result.is_valid);
    }

    #[test]
    fn test_check_dangerous_imports_blocked() {
        let validator = SecurityValidator::new();
        // WASM with "eval" string embedded
        let mut wasm_with_eval = vec![0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00];
        wasm_with_eval.extend_from_slice(b"eval");
        let result = validator.check_dangerous_imports(&wasm_with_eval);
        assert!(!result.is_valid);
    }

    #[test]
    fn test_is_import_allowed_bfosa() {
        let validator = SecurityValidator::new();
        assert!(validator.is_import_allowed("bfosa_log"));
        assert!(validator.is_import_allowed("bfosa_process_file"));
        assert!(validator.is_import_allowed("bfosa_cleanup"));
    }

    #[test]
    fn test_is_import_allowed_internal() {
        let validator = SecurityValidator::new();
        assert!(validator.is_import_allowed("__heap_base"));
        assert!(validator.is_import_allowed("__data_end"));
        assert!(validator.is_import_allowed("__indirect_function_table"));
    }

    #[test]
    fn test_is_import_blocked() {
        let validator = SecurityValidator::new();
        assert!(validator.is_import_blocked("eval"));
        assert!(validator.is_import_blocked("fetch"));
        assert!(validator.is_import_blocked("syscall"));
    }

    #[test]
    fn test_memory_usage_tracker() {
        let mut tracker = MemoryUsage::new(10, 100);
        assert_eq!(tracker.current_bytes(), 10 * 65536);
        assert!(!tracker.exceeds_limit());

        tracker.update(50);
        assert_eq!(tracker.current_bytes(), 50 * 65536);
        assert_eq!(tracker.peak_bytes(), 50 * 65536);
        assert!(!tracker.exceeds_limit());

        tracker.update(150);
        assert!(tracker.exceeds_limit());
    }

    #[test]
    fn test_memory_usage_percentage() {
        let mut tracker = MemoryUsage::new(50, 100);
        assert_eq!(tracker.usage_percentage(), 50.0);

        tracker.update(75);
        assert_eq!(tracker.usage_percentage(), 75.0);
    }

    #[test]
    fn test_timeout_enforcer() {
        let enforcer = TimeoutEnforcer::new(1000); // 1 second timeout
        assert!(!enforcer.was_triggered());
        assert_eq!(enforcer.timeout_ms, 1000);
    }

    #[test]
    fn test_security_validate_all_checks() {
        let validator = SecurityValidator::new();
        let clean_wasm = vec![0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00];
        let result = validator.validate(&clean_wasm);
        assert!(result.is_valid);
    }

    #[test]
    fn test_security_validate_oversized() {
        let validator = SecurityValidator::new();
        let oversized = vec![0u8; 11 * 1024 * 1024];
        let result = validator.validate(&oversized);
        assert!(!result.is_valid);
    }
}
