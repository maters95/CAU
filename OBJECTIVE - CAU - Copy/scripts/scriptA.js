// TEST/scripts/scriptA.js
// scriptA.js - Data Processing Module v1.40 (Enhanced Metadata Output)
'use strict';

// --- Constants (Values Only) ---
const CONSOLE_LOGGING_ENABLED = false; // TOGGLE: Set to false to disable console logs
const CLOSE_DELAY_MS = 5000;
const INITIAL_DELAY_MS = 200;

if (CONSOLE_LOGGING_ENABLED) console.log("🚀 Script A (v1.40 - Enhanced Metadata Output) Loading Start:", new Date().toISOString());

// --- Utility Functions ---
function logToBackground(level = 'log', message = '', ...details) { if (CONSOLE_LOGGING_ENABLED && (level === 'error' || level === 'warn' || level === 'info' || level === 'debug')) console[level](`[ScriptA Log] ${message}`, ...details); try { if (typeof browserAPI !== 'undefined' && browserAPI?.runtime?.sendMessage) { browserAPI.runtime.sendMessage({ action: "logFromScript", payload: { script: 'ScriptA', level: level, message: message, details: details, timestamp: new Date().toISOString(), url: window.location.href } }, (response) => { if (browserAPI.runtime.lastError && !browserAPI.runtime.lastError.message?.includes("Receiving end does not exist") && !browserAPI.runtime.lastError.message?.includes("message port closed")) console.error('[ScriptA Log] Failed send log:', browserAPI.runtime.lastError.message); }); } else { if (CONSOLE_LOGGING_ENABLED) console.warn("[ScriptA Log] Cannot send log - browserAPI not available."); } } catch (e) { console.error('[ScriptA Log] Exception sending log:', e); } }
function sendMessageToBackground(message) { logToBackground('info', 'sendMessageToBackground called for action:', message?.action); try { if (typeof browserAPI !== 'undefined' && browserAPI?.runtime?.sendMessage) { browserAPI.runtime.sendMessage(message, (response) => { if (browserAPI.runtime.lastError) logToBackground('error', `sendMessage failed for ${message?.action}:`, browserAPI.runtime.lastError.message); }); } else { logToBackground('error', `Cannot send message - browserAPI not available.`); } } catch (e) { logToBackground('error', `Exception sendMessage ${message?.action}:`, e); } }
function closeWindowWithDelay(reason = "Task complete") { logToBackground('info', `Closing window in ${CLOSE_DELAY_MS / 1000}s. Reason: ${reason}`); try { setTimeout(() => { window.close(); }, CLOSE_DELAY_MS); } catch (e) { logToBackground('warn', `window.close() failed: ${e.message}`); } }
function logExtensionError(message, details = {}, severity = "error") { console.error(`ContentScript Error: ${message}`, details); if (!browserAPI) { if (CONSOLE_LOGGING_ENABLED) console.warn("ContentScript: Cannot log error - no API available"); return; } try { browserAPI.runtime.sendMessage({ action: "logError", error: `ContentScript (${window.location.pathname.substring(0,50)}...): ${message}`, context: { url: window.location?.href || 'unknown', timestamp: new Date().toISOString(), ...details }, severity: severity }).catch(e => console.error("Failed to send error log:", e)); } catch (e) { console.error('ContentScript: Failed to send error log:', e); } }
function setupErrorHandlers() { try { window.addEventListener('error', (event) => { logExtensionError('Global script error caught', { message: event.message, filename: event.filename, line: event.lineno, column: event.colno, errorString: event.error ? String(event.error).substring(0, 200) : 'N/A' }, "critical"); }); window.addEventListener('unhandledrejection', (event) => { const reasonMessage = event.reason?.message || String(event.reason) || 'Unknown'; const reasonStack = event.reason?.stack || 'N/A'; logExtensionError('Unhandled promise rejection caught', { reason: reasonMessage.substring(0, 300), stack: reasonStack.substring(0, 500) }, "error"); }); if (CONSOLE_LOGGING_ENABLED) console.log("ContentScript (ScriptA): Error handlers initialized"); } catch (error) { console.error("ContentScript (ScriptA): Failed to set up error handlers:", error); logExtensionError("Error handler setup failed", { error: error.message }, "critical"); } }

// --- Updated Folder Name Extraction ---
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
    let titleName = document.title.replace(/[\/:*?"<>|]/g, '').trim();
    titleName = titleName.replace(/\s*-\s*Objective ECM$/, '').trim();
    
    return titleName || 'Unknown Folder';
}

// --- Legacy Helper Function ---
function formatDate(dateStr) {
    const months = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
    const match = dateStr.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/);
    if (!match) return null;
    let day = match[1].padStart(2, '0'); let month = months[match[2].toUpperCase()]; let year = match[3];
    if (!month || isNaN(parseInt(day)) || parseInt(day) < 1 || parseInt(day) > 31 || isNaN(parseInt(year)) || parseInt(year) < 1900 || parseInt(year) > 2100 ) { return null; }
    return { formattedDate: `${year}-${month}-${day}` };
}

// --- Scroll and wait Function ---
async function jumpToBottomUntilStableOrElement({ containerSelector, waitForSelector, pauseAfterScroll = 1000, maxStaleHeightCount = 60, maxRuntime = 300000 }) {
     return new Promise((resolve) => {
        const container = document.querySelector(containerSelector);
        if (!container) { logToBackground('warn', `❌ Scroll container not found: ${containerSelector}`); resolve(false); return; }
        let lastHeight = 0; let staleCount = 0; let start = Date.now(); let scrollInterval = null;
        
        const scrollStep = () => {
            const found = document.querySelector(waitForSelector);
            if (found) { logToBackground('debug', '✅ [A] Found bottom element:', waitForSelector); if (scrollInterval) clearInterval(scrollInterval); resolve(true); return; }
            container.scrollTop = container.scrollHeight; const newHeight = container.scrollHeight; if (newHeight === lastHeight) { staleCount++; } else { staleCount = 0; lastHeight = newHeight; }
            if (staleCount >= maxStaleHeightCount) { logToBackground('debug', '✅ [A] Scroll complete: No height change for max stale count.'); if (scrollInterval) clearInterval(scrollInterval); resolve(true); return; }
            if ((Date.now() - start) > maxRuntime) { logToBackground('warn', '⚠️ [A] Timed out scrolling.'); if (scrollInterval) clearInterval(scrollInterval); resolve(false); return; }
        };
        scrollInterval = setInterval(scrollStep, pauseAfterScroll);
        scrollStep();
    });
}

// --- Main Processing Function ---
async function processObjectiveData() {
    await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY_MS));
    try {
        if (!window || !document) { throw new Error("Critical: Window/Document not available"); }
        setupErrorHandlers();
        logToBackground('log', "Script A - Starting Main Logic (Final Hybrid Scroll)");

        const folderName = getFolderName();
        logToBackground('log', `Script A - Got folder: "${folderName}"`);
        const useTrailingCount = folderName.toUpperCase().includes("FORM 5633");

        const bottomElementSelector = "div.cardsListComponent__total";
        const noObjectsSelector = "div.u-no-content-card";

        // --- FINAL HYBRID SCROLL LOGIC ---
        if (document.querySelector(bottomElementSelector) || document.querySelector(noObjectsSelector)) {
            logToBackground('info', 'Page is already complete or empty. Skipping scroll process.');
        } else {
            logToBackground('info', 'Page needs to be scrolled. Starting scroll process...');
            const scrollSuccess = await jumpToBottomUntilStableOrElement({
                containerSelector: "div.layout__body",
                waitForSelector: bottomElementSelector,
                pauseAfterScroll: 800,
                maxStaleHeightCount: 60,
                maxRuntime: 300000
            });
            logToBackground('log', `Script A - Scroll finished (Success: ${scrollSuccess}).`);
        }

        logToBackground('log', "Script A - Waiting 15s for final rendering...");
        await new Promise(resolve => setTimeout(resolve, 15000));
        logToBackground('log', "Script A - Wait finished.");

        // --- Data Extraction ---
        logToBackground('log', "Script A - Starting data extraction...");
        let dataPayload = {};
        let extractedRows = [];
        let processedCount = 0;
        let skippedCount = 0;
        let minDate = null;
        let maxDate = null;
        let weightedTotal = 0;
        const personDateRegex = /\bModified on (\d{1,2}) ([A-Za-z]{3}) (\d{4}) by ([A-Za-z]+) ([A-Za-z]+)\b/;
        const trailingNumRegex = /\s-\s(\d+)$/;
        const listItemSelector = 'div.layout__content ol > li';
        let rowIndex = 0;

        document.querySelectorAll(listItemSelector).forEach((listItemElement) => {
            rowIndex++;
            const spanElement = listItemElement.querySelector('span[title*="Modified on"]');
            const anchorElement = listItemElement.querySelector('xen-object-title > a');
            if (!spanElement || !anchorElement) {
                skippedCount++;
                return;
            }

            const titleText = spanElement.getAttribute('title');
            const anchorText = anchorElement.textContent || "";
            const personDateMatch = titleText ? titleText.match(personDateRegex) : null;

            if (personDateMatch) {
                const dateStr = `${personDateMatch[1]} ${personDateMatch[2]} ${personDateMatch[3]}`;
                const firstName = personDateMatch[4]; 
                const lastName = personDateMatch[5];
                const formattedObj = formatDate(dateStr);

                if (formattedObj) {
                    const { formattedDate } = formattedObj;
                    const personName = `${firstName} ${lastName}`;
                    let incrementAmount = 1;
                    if (useTrailingCount) {
                        const trailingNumMatch = anchorText.match(trailingNumRegex);
                        if (trailingNumMatch && trailingNumMatch[1]) {
                            const parsedCount = parseInt(trailingNumMatch[1], 10);
                            if (!isNaN(parsedCount) && parsedCount > 0) {
                                incrementAmount = parsedCount;
                            }
                        }
                    }
                    if (!dataPayload[personName]) dataPayload[personName] = {};
                    if (!dataPayload[personName][formattedDate]) dataPayload[personName][formattedDate] = 0;
                    dataPayload[personName][formattedDate] += incrementAmount;
                    
                    processedCount++;
                    weightedTotal += incrementAmount;
                    
                    // Track date range
                    if (!minDate || formattedDate < minDate) minDate = formattedDate;
                    if (!maxDate || formattedDate > maxDate) maxDate = formattedDate;
                    
                    // Store row details for extraction report
                    extractedRows.push({
                        rowIndex: rowIndex,
                        dateText: dateStr,
                        isoDate: formattedDate,  // Pre-parsed ISO date for reliable storage
                        nameText: `${firstName} ${lastName}`,
                        countText: anchorText,
                        person: personName,
                        count: incrementAmount,
                        rule: useTrailingCount ? "trailing_number" : "default"
                    });
                } else {
                    skippedCount++;
                }
            } else {
                skippedCount++;
            }
        });

        const personCount = Object.keys(dataPayload).length;
        const dateRange = { start: minDate, end: maxDate };
        
        logToBackground('log', `Script A - Data extraction finished. Processed: ${processedCount}, Skipped: ${skippedCount}, Persons: ${personCount}`);
        
        sendMessageToBackground({ 
            action: "csvContentDetected", 
            dataPayload: dataPayload, 
            folderName: folderName,
            metadata: {
                processedRows: processedCount,
                skippedRows: skippedCount,
                personCount: personCount,
                dateRange: dateRange,
                expectedTotal: rowIndex,
                actualTotal: weightedTotal,
                scriptType: "A",
                timestamp: new Date().toISOString(),
                extractionReport: {
                    timestamp: new Date().toISOString(),
                    folderName: folderName,
                    expectedTotal: rowIndex,
                    actualTotal: weightedTotal,
                    extractedRows: extractedRows.length,
                    processedRows: processedCount,
                    skippedRows: skippedCount,
                    uniquePersons: personCount,
                    dateRange: dateRange,
                    rows: extractedRows,
                    personSummary: Object.entries(dataPayload).map(([person, dates]) => ({
                        person: person,
                        total: Object.values(dates).reduce((sum, count) => sum + count, 0),
                        dates: Object.entries(dates).map(([date, count]) => ({ date: date, count: count })),
                    })),
                },
            },
        });
        closeWindowWithDelay("Message sent");
    } catch (error) {
        console.error("Script A Critical Error:", error);
        logToBackground('error', `CRITICAL ERROR Script A: ${error.message}`, { stack: error.stack });
        sendMessageToBackground({ action: "logError", error: `Script A critical failure: ${error.message}`, context: { stack: error.stack }, severity: "critical" });
        closeWindowWithDelay("Critical error");
    }
}

processObjectiveData();