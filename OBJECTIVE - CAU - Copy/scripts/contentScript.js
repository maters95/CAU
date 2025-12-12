// contentScript.js - Handles interaction with Objective ECM pages (v1.5 - Enhanced Loading)
'use strict';

// Immediate load indicator
console.log('Content Script Loading Start:', new Date().toISOString());

// --- Constants ---
const ACTION_LOG_ERROR = "logError";
const ERROR_SEVERITY_CRITICAL = "critical";
const ERROR_SEVERITY_ERROR = "error";
const ERROR_SEVERITY_WARNING = "warning";

// --- API Access ---
const browserAPI = (function initializeBrowserAPI() {
    try {
        // Check Chrome API availability
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            console.log("Content Script: Chrome API available");
            return chrome;
        }
        // Fallback to browser API if available (Firefox)
        if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
            console.log("Content Script: Browser API available");
            return browser;
        }
        console.warn("Content Script: No extension API available");
        return null;
    } catch (e) {
        console.error("Content Script: Error initializing API access:", e);
        return null;
    }
})();

// --- Error Handling ---
function logExtensionError(message, details = {}, severity = ERROR_SEVERITY_ERROR) {
    console.error(`ContentScript Error: ${message}`, details);
    
    if (!browserAPI) {
        console.warn("ContentScript: Cannot log error - no API available");
        return;
    }

    try {
        browserAPI.runtime.sendMessage({
            action: ACTION_LOG_ERROR,
            error: `ContentScript (${window.location.pathname.substring(0,50)}...): ${message}`,
            context: {
                url: window.location?.href || 'unknown',
                timestamp: new Date().toISOString(),
                ...details
            },
            severity: severity
        }).catch(e => console.error("Failed to send error log:", e));
    } catch (e) {
        console.error('ContentScript: Failed to send error log:', e);
    }
}

// --- Error Handlers Setup ---
function setupErrorHandlers() {
    try {
        // Global error handler
        window.addEventListener('error', (event) => {
            logExtensionError('Global script error caught', {
                message: event.message,
                filename: event.filename,
                line: event.lineno,
                column: event.colno,
                errorString: event.error ? String(event.error).substring(0, 200) : 'N/A'
            }, ERROR_SEVERITY_CRITICAL);
        });

        // Promise rejection handler
        window.addEventListener('unhandledrejection', (event) => {
            const reasonMessage = event.reason?.message || String(event.reason) || 'Unknown';
            const reasonStack = event.reason?.stack || 'N/A';
            
            logExtensionError('Unhandled promise rejection caught', {
                reason: reasonMessage.substring(0, 300),
                stack: reasonStack.substring(0, 500)
            }, ERROR_SEVERITY_ERROR);
        });

        console.log("ContentScript: Error handlers initialized");
    } catch (error) {
        console.error("ContentScript: Failed to set up error handlers:", error);
        logExtensionError("Error handler setup failed", { 
            error: error.message 
        }, ERROR_SEVERITY_CRITICAL);
    }
}

// --- Initialization ---
function init() {
    console.log("ContentScript: Starting initialization...");
    
    // Verify DOM access
    if (!document || !window) {
        throw new Error("Critical: DOM/Window not available");
    }

    // Setup error handlers first
    setupErrorHandlers();
    
    // Additional initialization can be added here
    
    console.log("ContentScript: Initialization complete");
}

// --- Run Initialization ---
try {
    // Run init immediately if document is ready, otherwise wait for DOMContentLoaded
    if (document.readyState === 'loading') {
        console.log("ContentScript: Waiting for DOMContentLoaded");
        document.addEventListener('DOMContentLoaded', init);
    } else {
        console.log("ContentScript: Document already loaded, running init");
        init();
    }
    
    // Signal successful loading
    console.log("🚀 Content Script Load Complete:", window.location.href);
} catch (e) {
    console.error("ContentScript: Fatal initialization error:", e);
    logExtensionError("Content script initialization failed", {
        error: e.message,
        stack: e.stack
    }, ERROR_SEVERITY_CRITICAL);
}