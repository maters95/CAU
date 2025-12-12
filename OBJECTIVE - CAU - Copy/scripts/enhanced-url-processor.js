// enhanced-url-processor.js - URL Processing Module v1.0
'use strict';

import { ErrorManager, SEVERITY, CATEGORY } from './enhanced-error-manager.js';
import { StorageManager } from './storage-manager.js';
import { BatchProcessor } from './batch-processor.js';
import { ACTION_CSV_DETECTED, ACTION_LOG_ERROR, ACTION_LOG_FROM_SCRIPT, ACTION_UPDATE_PROGRESS, ACTION_PROCESSING_COMPLETE } from './constants.js';

// --- State Management ---
let stopFlag = false;

/**
 * Sets or gets the stop processing flag
 * @param {boolean} [value] - If provided, sets the stop flag
 * @returns {boolean} Current state of stop flag
 */
export function stopProcessingFlag(value) {
    if (typeof value === 'boolean') stopFlag = value;
    return stopFlag;
}

/**
 * Checks if processing should stop
 * @returns {boolean} True if processing should stop
 */
export function shouldStopProcessing() {
    return stopFlag;
}

// --- URL Processing ---
/**
 * Processes a batch of URLs using appropriate scripts
 * @param {string[]} urls - Array of URLs to process
 * @param {string[]} folderNames - Array of folder names
 * @param {string[]} scriptTypes - Array of script types ('A' or 'B')
 * @param {number[]} years - Array of years
 * @param {number[]} months - Array of months
 * @returns {Promise<void>}
 */
export async function processUrls(urls, folderNames, scriptTypes, years, months) {
    if (!Array.isArray(urls) || !urls.length) {
        throw new Error("No URLs provided for processing");
    }

    // Reset stop flag at start of new batch
    stopProcessingFlag(false);

    // Create batches of work
    const workItems = urls.map((url, i) => ({
        url,
        folderName: folderNames[i],
        scriptType: scriptTypes[i],
        year: years[i],
        month: months[i]
    }));

    try {
        // Initialize batch processor with settings
        const batchProcessor = new BatchProcessor({
            maxConcurrent: 3,
            retryCount: 2,
            retryDelay: 5000,
            timeout: 180000 // 3 minutes per URL
        });

        // Process URLs in batches
        const results = await batchProcessor.process(workItems, async (item, progress) => {
            if (shouldStopProcessing()) {
                throw new Error("Processing stopped by user request");
            }

            // Create a tab and process the URL
            const result = await processUrlInTab(item);

            // Report progress
            broadcastProgress(progress, urls.length);

            return result;
        });

        // Handle results
        console.log(`URL Processing complete. Processed ${results.length} URLs.`);
        
        // Send completion message
        try {
            chrome.runtime.sendMessage({
                action: ACTION_PROCESSING_COMPLETE,
                success: true,
                processedCount: results.length
            });
        } catch (e) {
            console.warn("Could not send completion message:", e);
        }

    } catch (error) {
        console.error("URL Processing failed:", error);
        ErrorManager.logError("URL Processing Failed", {
            error: error.message,
            urls: urls.length
        }, SEVERITY.ERROR, CATEGORY.PROCESSING);

        // Try to send error completion message
        try {
            chrome.runtime.sendMessage({
                action: ACTION_PROCESSING_COMPLETE,
                success: false,
                error: error.message
            });
        } catch (e) {
            console.warn("Could not send error completion message:", e);
        }

        throw error; // Re-throw to be handled by caller
    }
}

/**
 * Process a single URL in a new tab
 * @param {Object} item - Work item containing URL and metadata
 * @returns {Promise<Object>} Processing result
 */
async function processUrlInTab(item) {
    const { url, scriptType, folderName } = item;
    let tabId = null;

    try {
        // Create a new tab
        const tab = await chrome.tabs.create({ url, active: false });
        tabId = tab.id;

        // Wait for tab to finish loading
        await waitForTabLoad(tabId);

        if (shouldStopProcessing()) {
            throw new Error("Processing stopped by user");
        }

        // Inject the appropriate script
        await injectScript(tabId, scriptType);

        // Wait for processing result
        const result = await waitForScriptResult(tabId);

        return result;

    } catch (error) {
        console.error(`Failed to process URL ${url}:`, error);
        ErrorManager.logError("Tab Processing Failed", {
            url,
            error: error.message,
            tabId
        }, SEVERITY.WARNING, CATEGORY.PROCESSING);
        throw error;

    } finally {
        // Clean up tab
        if (tabId) {
            try {
                await chrome.tabs.remove(tabId);
            } catch (e) {
                // Ignore errors if tab is already closed
            }
        }
    }
}

/**
 * Wait for a tab to complete loading
 * @param {number} tabId - Chrome tab ID
 * @returns {Promise<void>}
 */
async function waitForTabLoad(tabId) {
    return new Promise((resolve, reject) => {
        const CHECK_INTERVAL = 500;
        const TIMEOUT = 60000;
        const startTime = Date.now();

        const checkStatus = async () => {
            try {
                const tab = await chrome.tabs.get(tabId);
                
                if (shouldStopProcessing()) {
                    clearInterval(intervalId);
                    reject(new Error("Processing stopped by user"));
                    return;
                }

                if (tab.status === 'complete') {
                    clearInterval(intervalId);
                    resolve();
                    return;
                }

                if (Date.now() - startTime > TIMEOUT) {
                    clearInterval(intervalId);
                    reject(new Error(`Tab load timeout after ${TIMEOUT}ms`));
                    return;
                }

            } catch (e) {
                clearInterval(intervalId);
                reject(new Error(`Tab ${tabId} check failed: ${e.message}`));
            }
        };

        const intervalId = setInterval(checkStatus, CHECK_INTERVAL);
        checkStatus(); // Check immediately first
    });
}

/**
 * Inject appropriate script into a tab
 * @param {number} tabId - Chrome tab ID
 * @param {string} scriptType - 'A' or 'B'
 * @returns {Promise<void>}
 */
async function injectScript(tabId, scriptType) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: [`scripts/script${scriptType}.js`]
        });
    } catch (error) {
        throw new Error(`Script injection failed: ${error.message}`);
    }
}

/**
 * Wait for processing result from injected script
 * @param {number} tabId - Chrome tab ID
 * @returns {Promise<Object>} Processing result
 */
async function waitForScriptResult(tabId) {
    return new Promise((resolve, reject) => {
        const TIMEOUT = 300000; // 5 minutes
        const timeoutId = setTimeout(() => {
            reject(new Error(`Script result timeout after ${TIMEOUT}ms`));
        }, TIMEOUT);

        const messageHandler = (message, sender) => {
            if (sender.tab?.id !== tabId) return;

            if (message.action === ACTION_CSV_DETECTED) {
                cleanup();
                resolve(message);
            }
            else if (message.action === ACTION_LOG_ERROR) {
                cleanup();
                reject(new Error(message.error || "Unknown script error"));
            }
        };

        const cleanup = () => {
            clearTimeout(timeoutId);
            chrome.runtime.onMessage.removeListener(messageHandler);
        };

        chrome.runtime.onMessage.addListener(messageHandler);
    });
}

/**
 * Broadcast progress update to UI
 * @param {number} current - Current progress
 * @param {number} total - Total items
 */
function broadcastProgress(current, total) {
    try {
        chrome.runtime.sendMessage({
            action: ACTION_UPDATE_PROGRESS,
            progress: {
                current,
                total,
                percentage: Math.round((current / total) * 100)
            }
        });
    } catch (e) {
        console.warn("Could not broadcast progress:", e);
    }
}

/**
 * Handle messages from content scripts (delegated from background)
 * @param {Object} message - Message object
 * @param {Object} sender - Sender information
 */
export function handleScriptMessage(message, sender) {
    const { action } = message;

    switch (action) {
        case ACTION_CSV_DETECTED:
            handleCsvDetected(message, sender);
            break;
        
        case ACTION_LOG_ERROR:
            handleScriptError(message, sender);
            break;
        
        case ACTION_LOG_FROM_SCRIPT:
            handleScriptLog(message, sender);
            break;

        default:
            console.warn(`Unknown script message action: ${action}`);
    }
}

/**
 * Handle CSV data detected by content script
 * @param {Object} message - Message with CSV data
 * @param {Object} sender - Sender information
 */
async function handleCsvDetected(message, sender) {
    try {
        const { dataPayload, folderName } = message;
        if (!dataPayload || !folderName) {
            throw new Error("Invalid CSV data message format");
        }

        // Store the data using StorageManager
        await StorageManager.storeData(dataPayload, folderName);

    } catch (error) {
        console.error("Error handling CSV data:", error);
        ErrorManager.logError("CSV Data Handler Failed", {
            error: error.message,
            folder: message.folderName
        }, SEVERITY.ERROR, CATEGORY.DATA);
    }
}

/**
 * Handle error reported by content script
 * @param {Object} message - Error message
 * @param {Object} sender - Sender information
 */
function handleScriptError(message, sender) {
    const { error, context, severity } = message;
    ErrorManager.logError("Content Script Error", {
        error,
        context,
        url: sender.tab?.url,
        tabId: sender.tab?.id
    }, severity || SEVERITY.ERROR, CATEGORY.SCRIPT);
}

/**
 * Handle log message from content script
 * @param {Object} message - Log message
 * @param {Object} sender - Sender information
 */
function handleScriptLog(message, sender) {
    const { payload } = message;
    if (!payload) return;

    const { level, message: msg, details } = payload;
    // Only log errors and warnings to error manager
    if (level === 'error' || level === 'warn') {
        ErrorManager.logError("Script Log", {
            level,
            message: msg,
            details,
            url: sender.tab?.url,
            tabId: sender.tab?.id
        }, level === 'error' ? SEVERITY.ERROR : SEVERITY.WARNING, CATEGORY.SCRIPT);
    }
}