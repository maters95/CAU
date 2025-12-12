// config-validator.js - Configuration validation utilities (v1.1 - Allow null in delete criteria)
'use strict';

/**
 * Validates folder configuration objects used for processing runs.
 * Checks for required fields, correct types, and valid formats.
 * @param {Object} config - The folder configuration object to validate. Expected format: { name: string, script: 'A'|'B', year: number, month: number, urls: string[] }
 * @returns {{valid: boolean, errors: string[]}} Object indicating if the config is valid and an array of error messages if invalid.
 */
export function validateFolderConfig(config) {
  const errors = [];

  // Check if config is a valid object
  if (!config || typeof config !== 'object' || config === null) {
    return {
      valid: false,
      errors: ['Invalid configuration: Input must be a non-null object.']
    };
  }

  // --- Required Fields ---
  // Name validation
  if (!config.name || typeof config.name !== 'string') {
    errors.push('Folder name is required and must be a string.');
  } else if (config.name.trim().length === 0) {
    errors.push('Folder name cannot be empty or just whitespace.');
  }

  // Script type validation
  if (!config.script || !['A', 'B'].includes(config.script)) {
    errors.push('Script type is required and must be either "A" or "B".');
  }

  // Year validation
  if (typeof config.year !== 'number' || !Number.isInteger(config.year) || config.year < 2000 || config.year > 2100) {
    errors.push('Year is required and must be a valid integer between 2000 and 2100.');
  }

  // Month validation
  if (typeof config.month !== 'number' || !Number.isInteger(config.month) || config.month < 1 || config.month > 12) {
    errors.push('Month is required and must be a valid integer between 1 and 12.');
  }

  // URLs validation
  if (!config.urls) {
    errors.push('URLs array is required.');
  } else if (!Array.isArray(config.urls)) {
    errors.push('URLs must be provided as an array.');
  } else if (config.urls.length === 0) {
    errors.push('At least one URL is required in the urls array.');
  } else {
    // Validate each URL within the array
    config.urls.forEach((url, index) => {
      if (!url || typeof url !== 'string') {
        errors.push(`URL at index ${index} must be a non-empty string.`);
      } else if (url.trim().length === 0) {
        errors.push(`URL at index ${index} cannot be empty or just whitespace.`);
      } else {
        // Basic URL format check (doesn't guarantee reachability)
        try {
          new URL(url); // Attempt to parse the URL
        } catch (e) {
          errors.push(`Invalid URL format at index ${index}: "${url}" (Error: ${e.message})`);
        }
      }
    });
  }

  // Return validation result
  return {
    valid: errors.length === 0,
    errors: errors // Array of specific error messages
  };
}

/**
 * Validates options used for report generation.
 * @param {Object} options - The report options object. Expected format: { reportYear: number, reportMonth: number, includeWeekGaps?: boolean, teamAllData?: boolean, format?: string }
 * @returns {{valid: boolean, errors: string[]}} Object indicating validity and any errors.
 */
export function validateReportOptions(options) {
  const errors = [];

  // Check if options is a valid object
  if (!options || typeof options !== 'object' || options === null) {
    return {
      valid: false,
      errors: ['Invalid options: Input must be a non-null object.']
    };
  }

  // --- Required Fields ---
  // Report Year validation
  if (typeof options.reportYear !== 'number' || !Number.isInteger(options.reportYear) || options.reportYear < 2000 || options.reportYear > 2100) {
    errors.push('Report year is required and must be a valid integer between 2000 and 2100.');
  }

  // Report Month validation
  if (typeof options.reportMonth !== 'number' || !Number.isInteger(options.reportMonth) || options.reportMonth < 1 || options.reportMonth > 12) {
    errors.push('Report month is required and must be a valid integer between 1 and 12.');
  }

  // --- Optional Fields ---
  // includeWeekGaps validation (if present)
  if (options.hasOwnProperty('includeWeekGaps') && typeof options.includeWeekGaps !== 'boolean') {
    errors.push('If provided, includeWeekGaps must be a boolean value (true or false).');
  }

  // teamAllData validation (if present)
  if (options.hasOwnProperty('teamAllData') && typeof options.teamAllData !== 'boolean') {
    errors.push('If provided, teamAllData must be a boolean value (true or false).');
  }

  // format validation (if present)
  if (options.hasOwnProperty('format') && (typeof options.format !== 'string' || options.format.trim().length === 0)) {
     errors.push('If provided, format must be a non-empty string (e.g., "csv").');
  }

  // Return validation result
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * Validates criteria used for deleting data.
 * @param {Object} criteria - The deletion criteria object. Expected format: { selectedPersons: string[] | null, selectedFolders: string[] | null, options: { reportYear: number, reportMonth: number } }
 * @returns {{valid: boolean, errors: string[]}} Object indicating validity and any errors.
 */
export function validateDeletionCriteria(criteria) {
  const errors = [];

  // Check if criteria is a valid object
  if (!criteria || typeof criteria !== 'object' || criteria === null) {
    return {
      valid: false,
      errors: ['Invalid criteria: Input must be a non-null object.']
    };
  }

  // --- Options Validation (Required) ---
  if (!criteria.options || typeof criteria.options !== 'object' || criteria.options === null) {
    errors.push('Deletion criteria must include an "options" object.');
  } else {
    // Year validation within options
    if (typeof criteria.options.reportYear !== 'number' || !Number.isInteger(criteria.options.reportYear) ||
        criteria.options.reportYear < 2000 || criteria.options.reportYear > 2100) {
      errors.push('options.reportYear is required and must be a valid integer between 2000 and 2100.');
    }
    // Month validation within options
    if (typeof criteria.options.reportMonth !== 'number' || !Number.isInteger(criteria.options.reportMonth) ||
        criteria.options.reportMonth < 1 || criteria.options.reportMonth > 12) {
      errors.push('options.reportMonth is required and must be a valid integer between 1 and 12.');
    }
  }

  // --- Selected Persons Validation (Allow null for Select All) ---
  if (criteria.selectedPersons !== null) { // Check if not null before validating as array
    if (!Array.isArray(criteria.selectedPersons)) {
      errors.push('selectedPersons must be an array or null.');
    } else if (criteria.selectedPersons.length > 0) {
      // Validate each person name in the array only if it's not empty
      criteria.selectedPersons.forEach((person, index) => {
        if (!person || typeof person !== 'string' || person.trim().length === 0) {
          errors.push(`Person name at index ${index} must be a non-empty string.`);
        }
      });
    }
    // Allow empty array if explicitly passed (though UI logic might prevent this)
  }
  // --- Selected Folders Validation (Allow null for Select All) ---
  if (criteria.selectedFolders !== null) { // Check if not null before validating as array
    if (!Array.isArray(criteria.selectedFolders)) {
      errors.push('selectedFolders must be an array or null.');
    } else if (criteria.selectedFolders.length === 0) {
      // Only error on empty array if it's not null (Select All represented by null is okay)
      errors.push('At least one folder must be selected if providing an array.');
    } else {
      // Validate each folder name/key in the array
      criteria.selectedFolders.forEach((folder, index) => {
        if (!folder || typeof folder !== 'string' || folder.trim().length === 0) {
          errors.push(`Folder name/key at index ${index} must be a non-empty string.`);
        }
      });
    }
  }
  // Return validation result
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * Basic HTML sanitization to prevent XSS by escaping common HTML characters.
 * Note: For robust sanitization, consider a dedicated library if handling complex user input.
 * @param {string} html - The potentially unsafe HTML string.
 * @returns {string} The sanitized string with HTML characters escaped.
 */
export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') {
    return ''; // Return empty for non-strings or null/undefined
  }

  // Replace characters that have special meaning in HTML
  return html
    .replace(/&/g, '&amp;')  // Ampersand
    .replace(/</g, '&lt;')   // Less than
    .replace(/>/g, '&gt;')   // Greater than
    .replace(/"/g, '&quot;') // Double quote
    .replace(/'/g, '&#039;'); // Single quote (apostrophe)
}

/**
 * Checks if a given string is a potentially valid URL format.
 * Does not guarantee the URL exists or is reachable.
 * @param {string} url - The URL string to validate.
 * @returns {boolean} True if the string can be parsed as a URL, false otherwise.
 */
export function isValidUrl(url) {
  if (!url || typeof url !== 'string') {
    return false; // Must be a non-empty string
  }

  try {
    new URL(url); // The URL constructor will throw an error for invalid formats
    return true;
  } catch (e) {
    return false; // Parsing failed, invalid format
  }
}

// Optionally export all validators as a group
export const ConfigValidator = {
    validateFolderConfig,
    validateReportOptions,
    validateDeletionCriteria,
    sanitizeHtml,
    isValidUrl
};