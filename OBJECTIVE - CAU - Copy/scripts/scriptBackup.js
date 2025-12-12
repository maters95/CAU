// TEST/scripts/scriptB.js
// scriptB.js - Police/Personals Data Processing Module v1.14 (Updated Breadcrumb Selectors)
'use strict';

// --- Constants (Values Only) ---
const CONSOLE_LOGGING_ENABLED = false; // TOGGLE: Set to false to disable console logs
const CLOSE_DELAY_MS = 5000;
const INITIAL_DELAY_MS = 200;

if (CONSOLE_LOGGING_ENABLED) console.log("🚀 Script B (v1.14 - Updated Breadcrumb Selectors) Loading Start:", new Date().toISOString());

const INITIALS_TO_NAME_MAP = { 'MB': 'Michael Bourke', 'ZM': 'Zak Masters', 'AD': 'Ashleigh Dykes', 'DL': 'Di Leask', 'KV': 'Kellie Vereyken', 'JLR': 'Jessica Ricketts', 'JC': 'Jethro Carthew', 'BF': 'Blake Foley', 'JB': 'Jennifer Bowe', 'JR': 'Jessica Ronalds', 'BB': 'Ben Burrows', 'CW': 'Cheryl Warren', 'AC': 'Angela Clarke', 'DK': 'Dina Kosso', 'NS': 'Nathan Sweeney', /* Add others */ };
const NSW_PUBLIC_HOLIDAYS_SET = new Set([ "2025-01-01", "2025-01-27", "2025-04-18", "2025-04-21", "2025-04-25", "2025-06-09", "2025-10-06", "2025-12-25", "2025-12-26", "2024-01-01", "2024-01-26", "2024-03-29", "2024-04-01", "2024-04-25", "2024-06-10", "2024-10-07", "2024-12-25", "2024-12-26" /* Add other years */ ]);

// --- Utility Functions ---
function logToBackground(level = 'log', message = '', ...details) { try { if (typeof browserAPI !== 'undefined' && browserAPI?.runtime?.sendMessage) { browserAPI.runtime.sendMessage({ action: "logFromScript", payload: { script: 'ScriptB', level: level, message: message, details: details } }); } } catch (e) {} }
function sendMessageToBackground(message) { try { if (typeof browserAPI !== 'undefined' && browserAPI?.runtime?.sendMessage) { browserAPI.runtime.sendMessage(message); } } catch (e) {} }
function closeWindowWithDelay(reason = "Task complete") { setTimeout(() => { window.close(); }, CLOSE_DELAY_MS); }
function setupErrorHandlers() { window.addEventListener('error', (event) => { logExtensionError('Global script error caught', { message: event.message, filename: event.filename, line: event.lineno }); }); window.addEventListener('unhandledrejection', (event) => { logExtensionError('Unhandled promise rejection caught', { reason: event.reason?.message || 'Unknown' }); }); }
function logExtensionError(message, details = {}) { browserAPI.runtime.sendMessage({ action: "logError", error: `ContentScript (ScriptB): ${message}`, context: { ...details }, severity: "critical" }); }

// --- Helper Functions ---
function getFolderName() { 
    // Try the new breadcrumb structure first
    const breadcrumbElement = document.querySelector("span.breadcrumbsComponent__name");
    if (breadcrumbElement && breadcrumbElement.textContent.trim()) {
        return breadcrumbElement.textContent.trim().replace(/[\/:*?"<>|]/g, '').trim();
    }
    
    // Fallback to old breadcrumb structure (for backward compatibility)
    const oldBreadcrumbElement = document.querySelector("div.odl-worksheet-breadcrumb a > span");
    if (oldBreadcrumbElement && oldBreadcrumbElement.textContent.trim()) {
        return oldBreadcrumbElement.textContent.trim().replace(/[\/:*?"<>|]/g, '').trim();
    }
    
    // Final fallback to document title
    const titleElement = document.querySelector("head > title"); 
    if (titleElement) return titleElement.textContent.replace(/\s*-\s*Objective ECM$/, '').trim(); 
    return 'Unknown Folder'; 
}
function parseOnlineDate(dateStr) { try { dateStr = dateStr.replace(/\s*/g, ""); const parts = dateStr.split('/'); if (parts.length !== 3) return null; const day = parts[0].padStart(2, '0'); const month = parts[1].padStart(2, '0'); let year = parts[2]; if (year.length === 2) year = "20" + year; if (isNaN(parseInt(day)) || isNaN(parseInt(month)) || isNaN(parseInt(year))) return null; return { formattedDate: `${year}-${month}-${day}` }; } catch (e) { return null; } }
function getNextWorkingDay(d) { const next = new Date(d); next.setUTCDate(next.getUTCDate() + 1); while (next.getUTCDay() === 0 || next.getUTCDay() === 6 || NSW_PUBLIC_HOLIDAYS_SET.has(`${next.getUTCFullYear()}-${(next.getUTCMonth() + 1).toString().padStart(2, '0')}-${next.getUTCDate().toString().padStart(2, '0')}`)) { next.setUTCDate(next.getUTCDate() + 1); } return next; }

// --- Scroll Function ---
async function scrollContainerUntilElementAppears({ containerSelector, waitForSelector, maxWait = 30000, step = 500, delay = 300 }) {
    return new Promise((resolve) => {
        const container = document.querySelector(containerSelector);
        if (!container) { logToBackground('warn', "Scrollable container not found:", containerSelector); resolve(); return; }
        let start = Date.now(); let lastScrollTop = -1; let scrollInterval = null;
        const scrollStep = () => {
            if (document.querySelector(waitForSelector)) { logToBackground('info', "✅ [B] Target element found"); if (scrollInterval) clearInterval(scrollInterval); resolve(); return; }
            container.scrollBy(0, step);
            if (container.scrollTop === lastScrollTop || (Date.now() - start) > maxWait) { logToBackground('warn', "⚠️ [B] Timeout or no more scroll possible."); if (scrollInterval) clearInterval(scrollInterval); resolve(); return; }
            lastScrollTop = container.scrollTop;
        };
        scrollInterval = setInterval(scrollStep, delay);
        scrollStep();
    });
}

// --- Main Processing Function ---
async function processObjectiveData() {
    await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY_MS));
    try {
        setupErrorHandlers();
        logToBackground('log', "Script B - Starting Main Logic (Final Hybrid Scroll)");

        const bottomElementSelector = "div.cardsListComponent__total";
        const noObjectsSelector = "div.u-no-content-card";

        // --- FINAL HYBRID SCROLL LOGIC ---
        if (document.querySelector(bottomElementSelector) || document.querySelector(noObjectsSelector)) {
            logToBackground('info', 'Page is already complete or empty. Skipping scroll process.');
        } else {
            logToBackground('info', 'Page needs to be scrolled. Starting scroll process...');
            await scrollContainerUntilElementAppears({
                containerSelector: "div.layout__body",
                waitForSelector: bottomElementSelector
            });
            logToBackground('log', `Script B - Scroll finished.`);
        }

        logToBackground('log', "Script B - Waiting 10s for final rendering...");
        await new Promise(resolve => setTimeout(resolve, 10000));
        logToBackground('log', "Script B - Wait finished.");

        // --- Data Extraction & Processing ---
        const dateEntries = {};
        const onlineRegex = /Online Requests?\s+(\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*(?:\d{2}|\d{4}))\s*-\s*(?:(for\s+the\s+.*?not\s+printed\s+([0-9\/&\s-]+))\s*-\s*)?([A-Za-z,\s-]+?)\s*(?:-\s*|\s+)(\d+)/i;
        const msgFilePattern = /\.msg\b/i;

        document.querySelectorAll("xen-object-title a").forEach(el => {
            const text = el.textContent?.trim();
            if (!text || msgFilePattern.test(text)) return;
            const match = text.match(onlineRegex);
            if (match) {
                const dateStr = match[1]; let names = match[4]?.trim() || ""; const countVal = parseInt(match[5], 10);
                if (isNaN(countVal)) return;
                const parsedDate = parseOnlineDate(dateStr);
                if (!parsedDate) return;
                const { formattedDate } = parsedDate;
                if (!dateEntries[formattedDate]) dateEntries[formattedDate] = { initials: {} };
                const initialsArray = names.split(/[-,]/).map(s => s.trim().toUpperCase()).filter(Boolean);
                initialsArray.forEach(initial => {
                    if (!dateEntries[formattedDate].initials[initial]) dateEntries[formattedDate].initials[initial] = 0;
                    dateEntries[formattedDate].initials[initial] += countVal;
                });
            }
        });

        // --- Data Transformation ---
        Object.keys(dateEntries).forEach(key => {
            const d = new Date(key + "T00:00:00Z");
            if (d.getUTCDay() === 0 || d.getUTCDay() === 6 || NSW_PUBLIC_HOLIDAYS_SET.has(key)) {
                const initialsObj = dateEntries[key].initials;
                const nextWorking = getNextWorkingDay(d);
                const nextKey = `${nextWorking.getUTCFullYear()}-${(nextWorking.getUTCMonth() + 1).toString().padStart(2, '0')}-${nextWorking.getUTCDate().toString().padStart(2, '0')}`;
                if (!dateEntries[nextKey]) dateEntries[nextKey] = { initials: {} };
                for (const initial in initialsObj) {
                    if (!dateEntries[nextKey].initials[initial]) dateEntries[nextKey].initials[initial] = 0;
                    dateEntries[nextKey].initials[initial] += initialsObj[initial];
                }
                delete dateEntries[key];
            }
        });
        const dataPayload = {};
        for (const dateStr in dateEntries) {
            for (const initial in dateEntries[dateStr].initials) {
                const count = dateEntries[dateStr].initials[initial];
                const personName = INITIALS_TO_NAME_MAP[initial];
                if (personName && count > 0) {
                    if (!dataPayload[personName]) dataPayload[personName] = {};
                    if (!dataPayload[personName][dateStr]) dataPayload[personName][dateStr] = 0;
                    dataPayload[personName][dateStr] += count;
                }
            }
        }
        
        const folderName = getFolderName();
        sendMessageToBackground({ action: "csvContentDetected", dataPayload, folderName });
        closeWindowWithDelay("Message sent");

    } catch (error) {
        console.error("Script B Critical Error:", error);
        logToBackground('error', `CRITICAL ERROR Script B: ${error.message}`, { stack: error.stack });
        sendMessageToBackground({ action: "logError", error: `Script B critical failure: ${error.message}`, context: { stack: error.stack }, severity: "critical" });
        closeWindowWithDelay("Critical error");
    }
}

processObjectiveData();