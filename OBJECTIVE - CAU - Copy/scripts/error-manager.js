// enhanced-error-manager.js - Improved error handling system
'use strict';

import { STORAGE_KEY_ERRORS } from './constants.js';

// Maximum number of errors to store
const MAX_ERRORS = 500;

// Error severity levels
export const SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

// Error categories for better organization
export const CATEGORY = {
  NETWORK: 'network',
  STORAGE: 'storage',
  PARSING: 'parsing',
  VALIDATION: 'validation',
  CONFIG: 'configuration',
  PROCESSING: 'processing',
  UI: 'ui',
  SYSTEM: 'system'
};

// Browser API access with fallback
const browserAPI = (typeof chrome !== 'undefined') ? chrome : (typeof browser !== 'undefined' ? browser : null);

export const ErrorManager = {
  // Re-export constants
  SEVERITY,
  CATEGORY,
  
  /**
   * Log an error with enhanced metadata
   * @param {string|Error} message - Error message or Error object
   * @param {Object} details - Additional error details
   * @param {string} severity - Error severity from SEVERITY enum
   * @param {string} category - Error category from CATEGORY enum
   * @returns {Object} The error object that was logged
   */
  logError: function(message, details = {}, severity = SEVERITY.ERROR, category = CATEGORY.SYSTEM) {
    // Validate and normalize inputs
    const severityLevel = Object.values(SEVERITY).includes(severity) ? severity : SEVERITY.ERROR;
    const categoryType = Object.values(CATEGORY).includes(category) ? category : CATEGORY.SYSTEM;
    
    // Extract message from Error object if needed
    const errorMessage = message instanceof Error ? message.message : String(message);
    
    // Create error object with metadata
    const errorObj = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2),
      timestamp: new Date().toISOString(),
      message: errorMessage,
      details: {}, // Initialize details
      severity: severityLevel,
      category: categoryType,
      stack: message instanceof Error ? message.stack : null,
      context: { 
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
        url: typeof window !== 'undefined' ? window.location.href : 'N/A'
      }
    };

    // Safely stringify details
    try {
      errorObj.details = JSON.parse(JSON.stringify(details));
    } catch (e) {
      errorObj.details = { 
        stringifyError: e.message, 
        originalType: typeof details,
        fallbackString: String(details)
      };
    }

    // Console logging with appropriate level and formatting
    const logPrefix = `[${severityLevel.toUpperCase()}][${categoryType.toUpperCase()}]`;
    const logDetails = Object.keys(errorObj.details).length > 0 ? errorObj.details : '';
    
    switch (severityLevel) {
      case SEVERITY.INFO:
        console.info(logPrefix, errorObj.message, logDetails);
        break;
      case SEVERITY.WARNING:
        console.warn(logPrefix, errorObj.message, logDetails);
        break;
      case SEVERITY.CRITICAL:
        console.error(logPrefix, errorObj.message, logDetails, errorObj.context);
        break;
      case SEVERITY.ERROR:
      default:
        console.error(logPrefix, errorObj.message, logDetails);
        break;
    }

    // Store error if we have browser API access
    if (browserAPI) {
      this.storeError(errorObj);
    }

    return errorObj;
  },

  /**
   * Store error in browser storage
   * @param {Object} errorObj - The error object to store
   */
  storeError: function(errorObj) {
    if (!browserAPI || !browserAPI.storage || !browserAPI.storage.local) {
      console.warn('[ErrorManager] Cannot store error - browser storage API unavailable');
      return;
    }
    
    browserAPI.storage.local.get(STORAGE_KEY_ERRORS, (result) => {
      if (browserAPI.runtime?.lastError) {
        console.error("Error retrieving error log for storing:", browserAPI.runtime.lastError.message);
        return;
      }
      
      let errorLog = result[STORAGE_KEY_ERRORS] || [];
      
      // Ensure errorLog is an array
      if (!Array.isArray(errorLog)) {
        console.warn("Error log was not an array, resetting");
        errorLog = [];
      }
      
      // Add new error at the beginning
      errorLog.unshift(errorObj);
      
      // Trim if exceeding maximum
      if (errorLog.length > MAX_ERRORS) {
        errorLog = errorLog.slice(0, MAX_ERRORS);
      }
      
      browserAPI.storage.local.set({ [STORAGE_KEY_ERRORS]: errorLog }, () => {
        if (browserAPI.runtime?.lastError) {
          console.error("Error saving error log:", browserAPI.runtime.lastError.message);
        }
      });
    });
  },

  /**
   * Get stored errors with enhanced filtering options
   * @param {Function} callback - Callback function to receive errors
   * @param {Object} filters - Filter options
   * @returns {Promise} Promise if no callback provided
   */
  getErrors: function(callback, filters = {}) {
    if (!browserAPI || !browserAPI.storage || !browserAPI.storage.local) {
      console.warn('[ErrorManager] Cannot retrieve errors - browser storage API unavailable');
      if (typeof callback === 'function') {
        callback([]);
      }
      return Promise.resolve([]);
    }
    
    // If no callback, return a promise
    if (typeof callback !== 'function') {
      return new Promise((resolve, reject) => {
        this.getErrors((errors) => resolve(errors), filters);
      });
    }
    
    browserAPI.storage.local.get(STORAGE_KEY_ERRORS, (result) => {
      if (browserAPI.runtime?.lastError) {
        console.error("Error retrieving error log:", browserAPI.runtime.lastError.message);
        callback([]);
        return;
      }
      
      let errorLog = result[STORAGE_KEY_ERRORS] || [];
      
      // Ensure errorLog is an array
      if (!Array.isArray(errorLog)) {
        console.warn("Retrieved error log was not an array");
        callback([]);
        return;
      }
      
      // Apply filters
      if (filters) {
        // Filter by severity
        if (filters.severity) {
          const severities = Array.isArray(filters.severity) ? filters.severity : [filters.severity];
          errorLog = errorLog.filter(err => severities.includes(err.severity));
        }
        
        // Filter by category
        if (filters.category) {
          const categories = Array.isArray(filters.category) ? filters.category : [filters.category];
          errorLog = errorLog.filter(err => categories.includes(err.category));
        }
        
        // Filter by time range
        if (filters.startDate) {
          errorLog = errorLog.filter(err => new Date(err.timestamp) >= new Date(filters.startDate));
        }
        
        if (filters.endDate) {
          errorLog = errorLog.filter(err => new Date(err.timestamp) <= new Date(filters.endDate));
        }
        
        // Filter by text search
        if (filters.search && typeof filters.search === 'string') {
          const searchLower = filters.search.toLowerCase();
          errorLog = errorLog.filter(err => 
            (err.message && err.message.toLowerCase().includes(searchLower)) ||
            (err.details && JSON.stringify(err.details).toLowerCase().includes(searchLower))
          );
        }
        
        // Limit results
        if (filters.limit && typeof filters.limit === 'number') {
          errorLog = errorLog.slice(0, filters.limit);
        }
      }
      
      callback(errorLog);
    });
  },

  /**
   * Clear all stored errors
   * @param {Function} callback - Callback function when done
   * @returns {Promise} Promise if no callback provided
   */
  clearErrors: function(callback) {
    if (!browserAPI || !browserAPI.storage || !browserAPI.storage.local) {
      console.warn('[ErrorManager] Cannot clear errors - browser storage API unavailable');
      if (typeof callback === 'function') {
        callback(false);
      }
      return Promise.resolve(false);
    }
    
    // If no callback, return a promise
    if (typeof callback !== 'function') {
      return new Promise((resolve, reject) => {
        this.clearErrors((success) => resolve(success));
      });
    }
    
    browserAPI.storage.local.set({ [STORAGE_KEY_ERRORS]: [] }, () => {
      if (browserAPI.runtime?.lastError) {
        console.error("Error clearing error log:", browserAPI.runtime.lastError.message);
        callback(false);
      } else {
        callback(true);
      }
    });
  },
  
  /**
   * Get error statistics
   * @param {Function} callback - Callback function to receive stats
   * @returns {Promise} Promise if no callback provided
   */
  getErrorStats: function(callback) {
    if (typeof callback !== 'function') {
      return new Promise((resolve) => {
        this.getErrorStats((stats) => resolve(stats));
      });
    }
    
    this.getErrors((errors) => {
      const stats = {
        total: errors.length,
        bySeverity: {
          info: 0,
          warning: 0,
          error: 0,
          critical: 0
        },
        byCategory: {
          network: 0,
          storage: 0,
          parsing: 0,
          validation: 0,
          configuration: 0,
          processing: 0,
          ui: 0,
          system: 0
        },
        lastError: errors.length > 0 ? errors[0] : null,
        oldestError: errors.length > 0 ? errors[errors.length - 1] : null
      };
      
      // Count by category and severity
      errors.forEach(err => {
        // Count by severity
        const severity = err.severity || SEVERITY.ERROR;
        if (stats.bySeverity[severity] !== undefined) {
          stats.bySeverity[severity]++;
        }
        
        // Count by category
        const category = err.category || CATEGORY.SYSTEM;
        if (stats.byCategory[category] !== undefined) {
          stats.byCategory[category]++;
        }
      });
      
      callback(stats);
    });
  }
};

export default ErrorManager;