// TEST/scripts/utils.js
// scripts/utils.js - Shared utility functions (v1.9 - Added Dashboard Helpers)
'use strict';

import { FOLDER_NAME_MAPPINGS, ORIGINAL_SUBPOENA_NAME, SHORT_SUBPOENA_NAME } from './constants.js';

/**
 * Generates an array of distinct colors for charts.
 * @param {number} count - The number of colors to generate.
 * @returns {string[]} An array of color hex codes.
 */
export function generateChartColors(count) {
    const colors = [];
    if (count <= 0) return colors;
    const baseColors = ['#36a2eb', '#ff6384', '#4bc0c0', '#ff9f40', '#9966ff', '#ffcd56', '#c9cbcf', '#3cba9f', '#e83e8c', '#fd7e14', '#20c997', '#6f42c1'];
    for (let i = 0; i < count; i++) {
        colors.push(baseColors[i % baseColors.length]);
    }
    if (count > baseColors.length) {
        const hueStep = 360 / (count - baseColors.length);
        for (let i = baseColors.length; i < count; i++) {
            const hue = Math.floor((i - baseColors.length) * hueStep + 180) % 360;
            colors.push(`hsl(${hue}, 70%, 60%)`);
        }
    }
    return colors;
}

/**
 * Returns a function, that, as long as it continues to be invoked, will not
 * be triggered. The function will be called after it stops being called for
 * N milliseconds.
 * @param {Function} func The function to debounce.
 * @param {number} wait The number of milliseconds to wait.
 * @returns {Function} The new debounced function.
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Executes an asynchronous operation with retry logic.
 * @param {Function} operation - The async function to execute.
 * @param {number} maxRetries - Maximum number of retry attempts.
 * @param {number} delay - Initial delay between retries in ms.
 * @param {string} operationName - Name for logging purposes.
 * @returns {Promise<any>} Resolves with the operation's result or rejects after all retries.
 */
export async function executeWithRetry(operation, maxRetries = 3, delay = 1000, operationName = "Operation") {
    let lastError = new Error(`${operationName} failed after ${maxRetries} attempts.`);
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            const isLastError = attempt === maxRetries;
            console.warn(`[Retry] ${operationName} failed (attempt ${attempt}/${maxRetries}): ${error?.message || error}. ${isLastError ? 'No more retries.' : `Retrying in ${delay * attempt}ms...`}`);
            if (!isLastError) {
                await new Promise(resolve => setTimeout(resolve, delay * attempt));
            }
        }
    }
    console.error(`${operationName} failed permanently after ${maxRetries} attempts:`, lastError);
    throw lastError;
}

/**
 * Shortens a specific long folder name for display purposes.
 * @param {string} name - The folder name to format.
 * @returns {string} The formatted name.
 */
export function formatLabel(name) {
    if (typeof name !== 'string') return String(name);
    if (name === ORIGINAL_SUBPOENA_NAME) return SHORT_SUBPOENA_NAME;
    return name;
}

/**
 * Performs basic normalization: lowercase and trim.
 * @param {string} folderName - The original folder name.
 * @returns {string} The basic normalized folder name.
 */
export function basicNormalize(folderName) {
    return String(folderName || '').toLowerCase().trim();
}

/**
 * Gets the canonical display name for a raw folder key using mappings.
 * @param {string} rawFolderKey - The raw folder name/key.
 * @returns {string} The display name (from mappings) or the stripped, normalized raw key.
 */
export function getDisplayNameForKey(rawFolderKey) {
    if (!rawFolderKey) return 'Unknown Folder';
    let nameToCheck = String(rawFolderKey).trim();
    let originalNameForLog = nameToCheck;
    const yearPrefixMatch = nameToCheck.match(/^(\d{4})\s+(.*)$/);
    if (yearPrefixMatch && yearPrefixMatch[2]) {
        nameToCheck = yearPrefixMatch[2];
    }
    const normalizedKey = basicNormalize(nameToCheck);
    console.log(`Utils: getDisplayNameForKey Input: "${originalNameForLog}"`);
    if (originalNameForLog !== nameToCheck) {
        console.log(`Utils: Stripped Year, Name to Check: "${nameToCheck}"`);
    }
    console.log(`Utils: Normalized Key for Lookup: "${normalizedKey}"`);
    const mappedValue = FOLDER_NAME_MAPPINGS[normalizedKey];
    const result = mappedValue || normalizedKey;
    if (mappedValue) {
        console.log(`Utils: Mapping Found! Key: "${normalizedKey}" -> Value: "${mappedValue}"`);
    } else {
        console.log(`Utils: No mapping found for key: "${normalizedKey}". Using normalized key as display name.`);
    }
    console.log(`Utils: getDisplayNameForKey Result: "${result}"`);
    return result;
}

/**
 * @deprecated Use getDisplayNameForKey for clarity and better handling of prefixes.
 */
export function normalizeFolderName(folderName) {
    console.warn("normalizeFolderName is deprecated. Use getDisplayNameForKey instead.");
    return getDisplayNameForKey(folderName);
}

/**
 * Gets the ISO 8601 week number for a given Date object.
 * @param {Date} d - The date object.
 * @returns {number} The week number.
 */
export function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
}

/**
 * Creates a safe string for CSV cells.
 * @param {*} content - The content for the cell.
 * @returns {string} The CSV-safe string.
 */
export function safeCsvCell(content) {
    if (content === null || content === undefined) {
        return '';
    }
    const cellString = String(content);
    if (/[",\r\n]/.test(cellString)) {
        return `"${cellString.replace(/"/g, '""')}"`;
    }
    return cellString;
}

/**
 * Formats milliseconds into MM:SS string format.
 * @param {number} ms - Duration in milliseconds.
 * @returns {string} Formatted time string (e.g., "05:32").
 */
export function formatMillisecondsToMMSS(ms) {
    if (typeof ms !== 'number' || isNaN(ms) || ms < 0) {
        return "00:00";
    }
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(seconds).padStart(2, '0');
    return `${formattedMinutes}:${formattedSeconds}`;
}

export const browserAPI = chrome;