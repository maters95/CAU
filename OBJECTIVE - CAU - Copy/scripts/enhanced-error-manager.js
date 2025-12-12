/* global chrome, browser, console */
// enhanced-error-manager.js - Enhanced Error Management Module v1.0
'use strict';

// Browser API access with fallback
const browserAPI = (typeof chrome !== 'undefined') ? chrome : (typeof browser !== 'undefined' ? browser : null);

// Error severity levels
export const SEVERITY = {
    CRITICAL: 'critical',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info'
};

// Error categories for better organization
export const CATEGORY = {
    SYSTEM: 'system',
    PROCESSING: 'processing',
    DATA: 'data',
    SCRIPT: 'script',
    STORAGE: 'storage',
    VALIDATION: 'validation',
    REPORTING: 'reporting',
    IMPORT: 'import'
};

class EnhancedErrorManager {
    constructor() {
        this.errorLog = [];
        this.maxLogSize = 1000; // Maximum number of errors to keep in memory
        this.consoleEnabled = true;
        this.storageAvailable = !!(browserAPI?.storage?.local);
        
        if (!this.storageAvailable) {
            console.warn('EnhancedErrorManager: Storage API not available, operating in memory-only mode.');
        }
    }

    /**
     * Log an error with enhanced context
     * @param {string} message - Main error message
     * @param {Object} details - Additional error details/context
     * @param {string} severity - Error severity (from SEVERITY enum)
     * @param {string} category - Error category (from CATEGORY enum)
     */
    logError(message, details = {}, severity = SEVERITY.ERROR, category = CATEGORY.SYSTEM) {
        const timestamp = new Date().toISOString();
        const errorEntry = {
            timestamp,
            message,
            details,
            severity,
            category
        };

        // Add to internal log with size limit
        this.errorLog.unshift(errorEntry);
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog.length = this.maxLogSize;
        }

        // Console output if enabled
        if (this.consoleEnabled) {
            const consoleMethod = this.getConsoleMethod(severity);
            console[consoleMethod](`[${severity.toUpperCase()}] [${category}] ${message}`, details);
        }

        // For critical errors, ensure they're persisted if storage is available
        if (severity === SEVERITY.CRITICAL && this.storageAvailable) {
            this.persistError(errorEntry);
        }
    }

    /**
     * Persist critical errors to storage
     * @private
     */
    async persistError(errorEntry) {
        if (!this.storageAvailable) return;
        
        try {
            const key = 'criticalErrors';
            const result = await browserAPI.storage.local.get(key);
            const errors = result[key] || [];
            errors.unshift(errorEntry);
            
            // Keep only last 100 critical errors
            if (errors.length > 100) errors.length = 100;
            
            await browserAPI.storage.local.set({ [key]: errors });
        } catch (e) {
            console.error('Failed to persist critical error:', e);
            // Disable storage if we encounter an error
            this.storageAvailable = false;
        }
    }

    /**
     * Get console method based on severity
     * @private
     */
    getConsoleMethod(severity) {
        switch (severity) {
            case SEVERITY.CRITICAL:
            case SEVERITY.ERROR:
                return 'error';
            case SEVERITY.WARNING:
                return 'warn';
            default:
                return 'log';
        }
    }

    /**
     * Get all logged errors
     * @param {Object} filters - Optional filters for severity, category, etc.
     * @returns {Array} Filtered error log
     */
    getErrors(filters = {}) {
        let filtered = this.errorLog;

        if (filters.severity) {
            filtered = filtered.filter(e => e.severity === filters.severity);
        }
        if (filters.category) {
            filtered = filtered.filter(e => e.category === filters.category);
        }
        if (filters.since) {
            filtered = filtered.filter(e => new Date(e.timestamp) > new Date(filters.since));
        }

        return filtered;
    }

    /**
     * Get critical errors from persistent storage
     */
    async getCriticalErrors() {
        if (!this.storageAvailable) {
            console.warn('Storage not available, returning in-memory critical errors only.');
            return this.errorLog.filter(e => e.severity === SEVERITY.CRITICAL);
        }

        try {
            const result = await browserAPI.storage.local.get('criticalErrors');
            return result.criticalErrors || [];
        } catch (e) {
            console.error('Failed to retrieve critical errors:', e);
            // Disable storage on error
            this.storageAvailable = false;
            return this.errorLog.filter(e => e.severity === SEVERITY.CRITICAL);
        }
    }

    /**
     * Clear all logged errors or specific categories
     * @param {Object} options - Clear options (e.g., category, severity)
     */
    clear(options = {}) {
        if (!options.category && !options.severity) {
            this.errorLog = [];
            return;
        }

        this.errorLog = this.errorLog.filter(error => {
            if (options.category && error.category === options.category) return false;
            if (options.severity && error.severity === options.severity) return false;
            return true;
        });
    }

    /**
     * Enable/disable console output
     * @param {boolean} enabled - Whether to enable console output
     */
    setConsoleOutput(enabled) {
        this.consoleEnabled = enabled;
    }
}

// Export singleton instance
export const ErrorManager = new EnhancedErrorManager();
