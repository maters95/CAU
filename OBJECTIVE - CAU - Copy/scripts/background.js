// background.js - MV3 Service Worker (Complete Functionality)
'use strict';

// CRITICAL: Define browserAPI first before ANY other code
const browserAPI = chrome;

// Console logging setup
let LOGGING_ENABLED = false;
const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
};

console.log = (...args) => LOGGING_ENABLED && originalConsole.log(...args);
console.warn = (...args) => LOGGING_ENABLED && originalConsole.warn(...args);
console.error = (...args) => LOGGING_ENABLED && originalConsole.error(...args);

// Early initialization flags
let isInitialized = false;
let isInitializing = false;

// Import pako and handle initialization early
import * as pako from '../libs/pako.min.js';

function initializePakoSafely() {
    try {
        let pakoInstance = pako;
        
        if (pako.default) {
            pakoInstance = pako.default;
        } else if (!pako.deflate || !pako.inflate) {
            originalConsole.warn("BG: Creating minimal pako interface");
            pakoInstance = {
                deflate: function(data) {
                    const str = typeof data === 'string' ? data : JSON.stringify(data);
                    return new TextEncoder().encode(str);
                },
                inflate: function(data, options) {
                    const decoded = new TextDecoder().decode(data);
                    return options?.to === 'string' ? decoded : JSON.parse(decoded);
                }
            };
        }
        return pakoInstance;
    } catch (error) {
        originalConsole.error("BG: Failed to initialize pako:", error);
        return {
            deflate: function(data) {
                const str = typeof data === 'string' ? data : JSON.stringify(data);
                return new TextEncoder().encode(str);
            },
            inflate: function(data, options) {
                const decoded = new TextDecoder().decode(data);
                return options?.to === 'string' ? decoded : JSON.parse(decoded);
            }
        };
    }
}

const pakoInstance = initializePakoSafely();

// Import remaining modules
import {
    ACTION_RUN_SCRIPTS, ACTION_STOP_PROCESSING, ACTION_UPDATE_PROGRESS, ACTION_PROCESSING_COMPLETE,
    ACTION_GENERATE_REPORTS, ACTION_REPORTS_GENERATED, ACTION_DELETE_DATA, ACTION_DELETE_COMPLETE,
    ACTION_GET_HOLIDAYS, ACTION_LOG_ERROR, ACTION_LOG_FROM_SCRIPT, ACTION_CSV_DETECTED,
    ACTION_CLEAR_ALL_DATA, ACTION_EXPORT_ALL_DATA, ACTION_IMPORT_ALL_DATA, ACTION_DATA_UPDATED,
    ACTION_IMPORT_FROM_OBJECTIVE_URLS, ACTION_PROMPT_FOLDER_TYPE_SELECTION,
    ACTION_PROCESS_SELECTED_FOLDER_TYPES, ACTION_OBJECTIVE_IMPORT_COMPLETE,
    ACTION_OBJECTIVE_SUBFOLDER_RESULT, ACTION_OBJECTIVE_MONTHLY_RESULT,
    ACTION_OBJECTIVE_IMPORT_ERROR, ACTION_EXECUTE_OBJECTIVE_SCRAPE,
    STATUS_SUCCESS, STATUS_ACK_PROCESSING, STATUS_ACK_GENERATION, STATUS_ERROR, STATUS_ERR_UNKNOWN_ACTION,
    STORAGE_KEY_DATA, STORAGE_KEY_FOLDERS_CONFIG, STORAGE_KEY_LOGS, STORAGE_KEY_ERRORS, STORAGE_KEY_LAST_AUTO_FETCH,
    ALARM_DAILY_BACKUP, ALARM_WEEKLY_MAINTENANCE, ALARM_MONTHLY_ARCHIVING, ALARM_DAILY_FETCH,
    MONTH_NAMES_SHORT, ACTION_SET_LOGGING, STORAGE_KEY_LOGGING_CONFIG,
    ACTION_GET_DAILY_FETCH_STATUS, ACTION_SET_DAILY_FETCH, ACTION_TRIGGER_DAILY_FETCH, STORAGE_KEY_DAILY_FETCH_CONFIG,
    STORAGE_KEY_QUEUE_DATA, STORAGE_KEY_HOLIDAYS, STORAGE_KEY_HOLIDAYS_FETCHED, STORAGE_KEY_BACKUPS, STORAGE_KEY_LAST_BACKUP
} from './constants.js';

import { ErrorManager, SEVERITY, CATEGORY } from './enhanced-error-manager.js';
import { StorageManager } from './storage-manager.js';
import { holidayService } from './holiday-service.js';
import { processUrls, stopProcessingFlag, handleScriptMessage as handleUrlProcessorMessage } from './url-processor.js';
import { generateObjectiveReports } from './report-generator.js';
import { validateReportOptions, validateDeletionCriteria, validateFolderConfig } from './config-validator.js';
import { DataBackupUtility, setupAutomaticBackups as setupUtilityAlarms } from './data-backup-utility.js';
import { VersionManager } from './version-manager.js';
import { getDisplayNameForKey } from './utils.js';
import { NotificationSystem, NOTIFICATION_TYPE } from './notification-system.js';

// Constants & Globals
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
const MISSED_FETCH_NOTIFICATION_ID = 'missed-daily-fetch-prompt';
const MISSED_FETCH_SESSION_KEY = 'missedFetchNotified';
const ACTIVE_UI_PORTS = new Set();
const OBJECTIVE_IMPORT_SCRIPT_PATH = 'scripts/objective-importer.js';
const OBJECTIVE_TOP_LEVEL_URLS = [
    "https://objective.transport.nsw.gov.au:8443/documents/fA13326375",
    "https://objective.transport.nsw.gov.au:8443/documents/fA13363616"
];
const STATE_FLAGS = {
    URL_PROCESSING: 'isUrlProcessingRunning',
    REPORT_GENERATION: 'isReportGenerationRunning',
    DATA_DELETION: 'isDataDeletionRunning',
    OBJECTIVE_IMPORT: 'isObjectiveImportRunning'
};
const OBJECTIVE_IMPORT_STATE_KEY = 'objectiveImportState';

// Date parsing regex patterns
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const SLASH_DATE_REGEX = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/;

// Normalize date text to ISO format (YYYY-MM-DD)
function normalizeDateTextToIso(dateText) {
    if (!dateText || typeof dateText !== 'string') return null;
    
    const trimmed = dateText.trim();
    if (!trimmed) return null;
    
    // Already in ISO format
    if (ISO_DATE_REGEX.test(trimmed)) return trimmed;
    
    // Try slash/dash format (DD/MM/YYYY or DD-MM-YYYY)
    const slashMatch = trimmed.match(SLASH_DATE_REGEX);
    if (slashMatch) {
        let [, day, month, year] = slashMatch;
        year = year.length === 2 ? `20${year}` : year.padStart(4, '0');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    // Try parsing as general date string
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
        return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
    }
    
    originalConsole.warn(`BG: Unable to parse date text "${dateText}" into ISO format.`);
    return null;
}

// Auto-save force single count folder with count=1 for each row
async function autoSaveForceSingleCountFolder(report, configYear, configMonth) {
    try {
        const folderName = report.folderName || 'Unknown Folder';
        const folderKey = getDisplayNameForKey(folderName);
        console.log(`BG: Auto-saving force single count folder: ${folderName} (key: ${folderKey})`);
        
        const folderPayload = {};
        
        if (report.rows && Array.isArray(report.rows)) {
            report.rows.forEach(row => {
                const personName = (row.person || row.nameText || '').trim();
                if (!personName) return;
                
                // Use isoDate if available, otherwise parse dateText
                const isoDate = row.isoDate || normalizeDateTextToIso(row.dateText || '');
                if (!isoDate) return;
                
                // Force count to 1 for any non-zero count
                const count = (row.count || 0) > 0 ? 1 : 0;
                if (count === 0) return;
                
                folderPayload[personName] = folderPayload[personName] || {};
                folderPayload[personName][isoDate] = (folderPayload[personName][isoDate] || 0) + count;
            });
        }
        
        if (Object.keys(folderPayload).length === 0) {
            console.warn(`BG: No valid data to auto-save for force single count folder: ${folderName}`);
            return;
        }
        
        // Determine target year/month from first date if not provided
        const targetYear = Number.isInteger(configYear) ? configYear : undefined;
        const targetMonth = Number.isInteger(configMonth) ? configMonth + 1 : undefined;
        
        await StorageManager.storeData(folderPayload, folderKey, targetYear, targetMonth);
        console.log(`BG: Successfully auto-saved force single count folder: ${folderName}`);
    } catch (error) {
        console.error(`BG: Error auto-saving force single count folder:`, error);
    }
}

// Initialize StorageManager
async function initializeStorageManager() {
    try {
        StorageManager.initialize(pakoInstance);
        
        if (!pakoInstance.deflate || !pakoInstance.inflate || pakoInstance.minimal) {
            StorageManager.setCompressionEnabled(false);
            originalConsole.log("BG: StorageManager initialized with compression disabled");
        } else {
            originalConsole.log("BG: StorageManager initialized with compression enabled");
        }
        
        return true;
    } catch (error) {
        originalConsole.error("BG: Failed to initialize StorageManager:", error);
        return false;
    }
}

// State Management Functions
async function getObjectiveImportState() {
    try {
        const result = await browserAPI.storage.session.get(OBJECTIVE_IMPORT_STATE_KEY);
        return result[OBJECTIVE_IMPORT_STATE_KEY] || {};
    } catch (e) {
        return {};
    }
}

async function setObjectiveImportState(newState) {
    try {
        await browserAPI.storage.session.set({ [OBJECTIVE_IMPORT_STATE_KEY]: newState });
    } catch (e) {
        console.error("BG State: Failed to set objective import state", e);
    }
}

async function clearObjectiveImportState() {
    try {
        await browserAPI.storage.session.remove(OBJECTIVE_IMPORT_STATE_KEY);
    } catch (e) {
        console.warn("BG State: Failed to clear objective import state", e);
    }
}

async function getStateFlag(flagName) {
    try {
        const result = await browserAPI.storage.session.get(flagName);
        return result[flagName] || false;
    } catch (error) {
        console.error(`BG State: Error getting flag ${flagName}:`, error);
        ErrorManager.logError(`Get State Flag Failed: ${flagName}`, { error: error.message }, SEVERITY.WARNING, CATEGORY.SYSTEM);
        return false;
    }
}

async function setStateFlag(flagName, value) {
    try {
        await browserAPI.storage.session.set({ [flagName]: value });
    } catch (error) {
        console.error(`BG State: Error setting flag ${flagName} to ${value}:`, error);
        ErrorManager.logError(`Set State Flag Failed: ${flagName}`, { value, error: error.message }, SEVERITY.ERROR, CATEGORY.SYSTEM);
    }
}

// Helper Functions
async function addExecutionLog(folder = "SYSTEM", script = "General", status = "Log") {
    try {
        const timestamp = new Date().toISOString();
        const entry = { timestamp, folder, script, status };
        
        const result = await browserAPI.storage.local.get(STORAGE_KEY_LOGS);
        let logs = [];

        if (result && STORAGE_KEY_LOGS in result) {
            const storedData = result[STORAGE_KEY_LOGS];

            if (Array.isArray(storedData)) {
                logs = storedData;
            } else if (typeof storedData === 'object' && storedData !== null) {
                if (typeof storedData.compressed === 'boolean' && typeof storedData.data === 'string') {
                    try {
                        if (StorageManager.pako) {
                            const decompressedLogs = await StorageManager.retrieveAndDecompress(STORAGE_KEY_LOGS);
                            logs = Array.isArray(decompressedLogs) ? decompressedLogs : [];
                        } else {
                            logs = [];
                        }
                    } catch (e) {
                        console.warn(`BG Log: Failed to decompress existing logs, starting fresh:`, e);
                        logs = [];
                    }
                } else {
                    console.warn(`BG Log: Converting legacy object format to array for ${STORAGE_KEY_LOGS}`);
                    logs = [];
                }
            } else {
                console.warn(`BG Log: Unexpected ${STORAGE_KEY_LOGS} format:`, typeof storedData, 'Starting fresh.');
                logs = [];
            }
        }

        logs.unshift(entry);
        if (logs.length > 500) {
            logs = logs.slice(0, 500);
        }

        if (StorageManager.pako) {
            await StorageManager.storeGenericData(STORAGE_KEY_LOGS, logs);
        } else {
            await browserAPI.storage.local.set({ [STORAGE_KEY_LOGS]: logs });
        }

    } catch (error) {
        console.error("BG Log: Error in addExecutionLog:", error);
        ErrorManager?.logError?.('Execution Log Failed', {
            folder, script, status, error: error.message
        }, SEVERITY?.WARNING || 'WARNING', CATEGORY?.SYSTEM || 'SYSTEM');
    }
}

// Tab Management Functions
async function executeScriptInTab(tabId, scriptPath) {
    try {
        if (!browserAPI.scripting) throw new Error("Scripting API not available.");
        const results = await browserAPI.scripting.executeScript({
            target: { tabId: tabId },
            files: [scriptPath]
        });
        console.log(`BG: Script ${scriptPath} executed in tab ${tabId}. Results:`, results);
        return results;
    } catch (error) {
        console.error(`BG: Failed to execute script ${scriptPath} in tab ${tabId}:`, error);
        throw error;
    }
}

async function sendMessageToTab(tabId, message) {
    try {
        console.log(`BG: Sending message to tab ${tabId}:`, message.action);
        const response = await browserAPI.tabs.sendMessage(tabId, message);
        console.log(`BG: Response from tab ${tabId} for ${message.action}:`, response);
        return response;
    } catch (error) {
        if (error.message.includes("Could not establish connection") || error.message.includes("No matching message handler")) {
            console.warn(`BG: Tab ${tabId} likely closed or content script not ready for action ${message.action}.`);
        } else {
            console.error(`BG: Error sending message to tab ${tabId} (Action: ${message?.action}):`, error);
            ErrorManager.logError("Tab SendMessage Failed", { tabId, action: message?.action, error: error.message }, SEVERITY.ERROR, CATEGORY.SYSTEM);
        }
        throw error;
    }
}

async function createTabAndWait(url, activate = false) {
    try {
        const tab = await browserAPI.tabs.create({ url, active: activate });
        if (!tab?.id) throw new Error("Tab creation failed.");
        await waitForTabLoad(tab.id);
        console.log(`BG: Tab ${tab.id} created and loaded for ${url}`);
        return tab.id;
    } catch (error) {
        console.error(`BG: Failed to create/wait for tab ${url}:`, error);
        ErrorManager.logError("Tab Creation/Load Failed", { url, error: error.message }, SEVERITY.ERROR, CATEGORY.SYSTEM);
        throw error;
    }
}

async function waitForTabLoad(tabId, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
        const CHECK_INTERVAL = 500;
        let elapsed = 0;
        const check = async () => {
            if (elapsed >= timeoutMs) {
                clearInterval(intervalId);
                reject(new Error(`Tab ${tabId} timed out loading.`));
                return;
            }
            try {
                const tab = await browserAPI.tabs.get(tabId);
                if (tab.status === 'complete') {
                    clearInterval(intervalId);
                    console.log(`BG: Tab ${tabId} load complete.`);
                    resolve();
                } else {
                    elapsed += CHECK_INTERVAL;
                }
            } catch (error) {
                clearInterval(intervalId);
                console.warn(`BG: Error checking tab ${tabId} status (may be closed):`, error.message);
                reject(new Error(`Tab ${tabId} closed or inaccessible: ${error.message}`));
            }
        };
        const intervalId = setInterval(check, CHECK_INTERVAL);
        check();
    });
}

async function closeTab(tabId) {
    if (!tabId) return;
    try {
        await browserAPI.tabs.remove(tabId);
        console.log(`BG: Closed tab ${tabId}`);
    } catch (e) {
        if (!e.message.includes("No tab with id") && !e.message.includes("Invalid tab ID")) {
            console.warn(`BG: Failed to close tab ${tabId}:`, e.message);
        }
    }
}

// --- Offscreen Document Management ---
async function hasOffscreenDocument() {
    if (browserAPI.offscreen.hasDocument) {
        try {
            return await browserAPI.offscreen.hasDocument();
        } catch (e) {
            console.error("Error checking offscreen document with hasDocument():", e);
            return false;
        }
    }
    console.warn("BG Offscreen: chrome.offscreen.hasDocument() not available, using getContexts fallback.");
    if (browserAPI.runtime.getContexts) {
        try {
            const offscreenUrl = browserAPI.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
            const contexts = await browserAPI.runtime.getContexts({
                contextTypes: [browserAPI.runtime.ContextType.OFFSCREEN_DOCUMENT],
                documentUrls: [offscreenUrl]
            });
            return !!contexts.length;
        } catch (e) {
            console.error("BG Offscreen: Error checking for offscreen document contexts:", e);
            return false;
        }
    } else {
        console.error("BG Offscreen: Cannot check for existing document (getContexts missing). Assuming none exists.");
        return false;
    }
}

async function closeOffscreenDocument() {
    if (!(await hasOffscreenDocument())) {
        return;
    }
    try {
        await browserAPI.offscreen.closeDocument();
        console.log('BG Offscreen: Document closed.');
    } catch (e) {
        console.error("BG Offscreen: Error closing document:", e);
        ErrorManager.logError("Offscreen Close Failed", { error: e.message }, SEVERITY.WARNING, CATEGORY.SYSTEM);
    }
}

async function sendMessageToOffscreen(message) {
    if (!(await hasOffscreenDocument())) {
        console.log("BG Offscreen: Document not found, attempting to create...");
        try {
            await browserAPI.offscreen.createDocument({
                url: OFFSCREEN_DOCUMENT_PATH,
                reasons: [browserAPI.offscreen.Reason.BLOBS],
                justification: 'Needed for PDF generation Blob conversion'
            });
            console.log('BG Offscreen: Document created successfully via createDocument.');
            await delay(100);
        } catch (error) {
            if (error.message.includes("Only a single offscreen document may be created")) {
                console.warn("BG Offscreen: Creation failed, document likely already exists (race condition?).");
                await delay(50);
                if (!(await hasOffscreenDocument())) {
                    console.error("BG Offscreen: Still no document after creation attempt failed.");
                    ErrorManager.logError("Offscreen Creation Race Condition?", { error: error.message }, SEVERITY.ERROR, CATEGORY.SYSTEM);
                    throw new Error(`Failed to ensure offscreen document exists: ${error.message}`);
                }
            } else {
                console.error("BG Offscreen: Error creating document:", error);
                ErrorManager.logError("Offscreen Creation Failed", { error: error.message }, SEVERITY.CRITICAL, CATEGORY.SYSTEM);
                throw error;
            }
        }
    }
    try {
        console.log("BG Offscreen: Sending message:", message.action);
        const response = await browserAPI.runtime.sendMessage(message);
        if (response === undefined) {
            console.warn(`BG Offscreen: Received undefined response for action ${message?.action}.`);
        }
        return response;
    } catch (error) {
        console.error(`BG Offscreen: Error sending message (Action: ${message?.action}):`, error);
        if (error.message.toLowerCase().includes("receiving end does not exist")) {
            console.warn("BG Offscreen: Message failed because receiver (offscreen doc?) does not exist.");
        }
        ErrorManager.logError("Offscreen SendMessage Failed", { action: message?.action, error: error.message }, SEVERITY.ERROR, CATEGORY.SYSTEM);
        throw new Error(`Failed to send message to offscreen document: ${error.message}`);
    }
}

async function generatePdfOffscreen(reportDataPayload) {
    if (!reportDataPayload || reportDataPayload.reportYear === undefined || reportDataPayload.reportMonth === undefined) {
        const errorMsg = "BG: generatePdfOffscreen called without year/month or with invalid payload!";
        console.error(errorMsg, reportDataPayload);
        ErrorManager.logError("Offscreen Payload Invalid", { keys: reportDataPayload ? Object.keys(reportDataPayload) : 'null' }, SEVERITY.ERROR, CATEGORY.REPORTING);
        throw new Error("Internal Error: reportYear and reportMonth must be included in the payload for generatePdfOffscreen.");
    }
    try {
        console.log("BG: Sending data to offscreen for PDF generation...");
        console.log("BG: Payload being sent to offscreen:", JSON.stringify(reportDataPayload));
        if (reportDataPayload.mainTable && Array.isArray(reportDataPayload.mainTable.head) && Array.isArray(reportDataPayload.mainTable.body)) {
            console.log(`BG: Payload seems valid. mainTable has ${reportDataPayload.mainTable.head.length} header row(s) and ${reportDataPayload.mainTable.body.length} body rows.`);
        } else {
            console.warn("BG: Payload CHECK FAILED. mainTable structure is invalid or missing before sending!", reportDataPayload);
            ErrorManager.logError("Offscreen Payload Invalid Structure", { hasMainTable: !!reportDataPayload.mainTable, headIsArray: Array.isArray(reportDataPayload.mainTable?.head), bodyIsArray: Array.isArray(reportDataPayload.mainTable?.body) }, SEVERITY.ERROR, CATEGORY.REPORTING);
        }
        const response = await sendMessageToOffscreen({
            target: 'offscreen',
            action: 'generatePdfOffscreen',
            data: reportDataPayload
        });
        if (response?.success && response.dataUrl) {
            console.log("BG: Received data URL from offscreen.");
            return response.dataUrl;
        } else {
            const errorDetail = response?.error || 'Offscreen document failed to generate PDF or return valid response.';
            console.error("BG: Offscreen PDF generation failed:", errorDetail);
            ErrorManager.logError("Offscreen PDF Generation Failed", { detail: errorDetail }, SEVERITY.ERROR, CATEGORY.REPORTING);
            throw new Error(errorDetail);
        }
    } catch (error) {
        console.error("BG: Error communicating with or processing response from offscreen document:", error);
        throw new Error(`PDF generation via offscreen failed: ${error.message}`);
    }
}

// --- Core Logic Functions ---
async function handleDeleteData(criteria) {
    console.log("BG Delete: Received criteria:", criteria);
    const { selectedPersons, selectedFolders: selectedFoldersDisplayNames, options } = criteria;
    const { reportYear, reportMonth: reportMonthZeroBased } = options || {};
    if (typeof reportYear !== 'number' || typeof reportMonthZeroBased !== 'number') {
        throw new Error("Invalid deletion criteria: Missing or invalid year/month.");
    }
    const reportMonthOneBased = reportMonthZeroBased + 1;
    const validation = validateDeletionCriteria({ ...criteria, options: { ...options, reportMonth: reportMonthOneBased } });
    if (!validation.valid) {
        throw new Error(`Invalid deletion criteria: ${validation.errors.join('; ')}`);
    }
    let deletedCount = 0;
    let modified = false;
    try {
        let allData;
        if (StorageManager.pako) {
            allData = await StorageManager.retrieveAndDecompress(STORAGE_KEY_DATA);
        } else {
            const result = await browserAPI.storage.local.get(STORAGE_KEY_DATA);
            allData = result[STORAGE_KEY_DATA];
        }
        
        if (!allData || !allData.persons) {
            console.log("BG Delete: No data found in storage.");
            return { success: true, deletedCount: 0 };
        }
        const personsToProcess = selectedPersons === null ? Object.keys(allData.persons) : selectedPersons;
        personsToProcess.forEach(person => {
            const yearData = allData.persons[person]?.[reportYear];
            if (!yearData) return;
            const monthData = yearData[reportMonthOneBased];
            if (!monthData) return;
            const foldersToDelete = selectedFoldersDisplayNames === null ? Object.keys(monthData) : selectedFoldersDisplayNames;
            foldersToDelete.forEach(folderDisplayName => {
                if (monthData[folderDisplayName]) {
                    const entriesInData = typeof monthData[folderDisplayName] === 'object' ? Object.keys(monthData[folderDisplayName]).length : 0;
                    deletedCount += entriesInData;
                    delete monthData[folderDisplayName];
                    modified = true;
                }
            });
            if (Object.keys(monthData).length === 0) {
                delete yearData[reportMonthOneBased];
                modified = true;
            }
            if (Object.keys(yearData).length === 0) {
                delete allData.persons[person][reportYear];
                modified = true;
            }
            if (Object.keys(allData.persons[person]).length === 0) {
                delete allData.persons[person];
                modified = true;
            }
        });
        if (allData.folders && selectedFoldersDisplayNames === null) {
            Object.keys(monthData).forEach(folderDisplayName => {
                if (allData.folders[folderDisplayName]) {
                    delete allData.folders[folderDisplayName];
                    modified = true;
                }
            });
        } else if (allData.folders && selectedFoldersDisplayNames !== null) {
            selectedFoldersDisplayNames.forEach(folderDisplayName => {
                if (allData.folders[folderDisplayName]) {
                    delete allData.folders[folderDisplayName];
                    modified = true;
                }
            });
        }
        if (modified) {
            if (StorageManager.pako) {
                await StorageManager.storeGenericData(STORAGE_KEY_DATA, allData);
            } else {
                await browserAPI.storage.local.set({ [STORAGE_KEY_DATA]: allData });
            }
            console.log(`BG Delete: Storage updated. Approx ${deletedCount} date entries removed.`);
        } else {
            console.log("BG Delete: No matching data found to delete.");
        }
        return { success: true, deletedCount };
    } catch (error) {
        console.error("BG Delete: Error during data deletion:", error);
        ErrorManager.logError("Data Deletion Failed", { criteria, error: error.message }, SEVERITY.ERROR, CATEGORY.STORAGE);
        return { success: false, deletedCount, error: error.message };
    }
}

async function runDailyStatFetch() {
    const logPrefix = "BG Daily Fetch:";
    console.log(`${logPrefix} Starting daily fetch...`);
    await addExecutionLog("SYSTEM", "Auto-Fetch", "Starting daily fetch check...");

    try {
        browserAPI.power.requestKeepAwake('system');
        await setStateFlag(STATE_FLAGS.URL_PROCESSING, true);

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const currentMonthOneBased = currentMonth + 1;

        console.log(`${logPrefix} Starting - Targeting ${currentYear}-${currentMonthOneBased}`);

        let allConfigs;
        if (StorageManager.pako) {
            allConfigs = await StorageManager.retrieveAndDecompress(STORAGE_KEY_FOLDERS_CONFIG) || [];
        } else {
            const configResult = await browserAPI.storage.local.get(STORAGE_KEY_FOLDERS_CONFIG);
            allConfigs = configResult[STORAGE_KEY_FOLDERS_CONFIG] || [];
        }

        if (!Array.isArray(allConfigs)) {
            console.error(`${logPrefix} Stored folder configuration is not an array. Aborting daily fetch.`);
            ErrorManager.logError("Daily Fetch Config Invalid", { type: typeof allConfigs }, SEVERITY.CRITICAL, CATEGORY.PROCESSING);
            await addExecutionLog("SYSTEM", "Auto-Fetch", `Failed: Invalid folder configuration structure.`);
            await setStateFlag(STATE_FLAGS.URL_PROCESSING, false);
            return;
        }

        const urlsToProcess = [];
        const folderNamesToProcess = [];
        const scriptTypesToProcess = [];

        allConfigs.forEach(config => {
            const validation = validateFolderConfig(config);
            if (!validation.valid) {
                console.warn(`${logPrefix} Skipping invalid config: ${validation.errors.join('; ')}`, config);
                return;
            }
            if (typeof config.year === 'number' && typeof config.month === 'number' &&
                config.year === currentYear && config.month === currentMonthOneBased) {
                const urls = Array.isArray(config.urls) ? config.urls : (config.url ? [config.url] : []);
                urls.forEach(url => {
                    if (url?.trim()) {
                        urlsToProcess.push(url.trim());
                        folderNamesToProcess.push(config.name);
                        scriptTypesToProcess.push(config.script);
                    }
                });
            }
        });

        if (urlsToProcess.length === 0) {
            console.warn(`${logPrefix} No URLs to process for ${currentYear}-${currentMonthOneBased}.`);
        } else {
            console.log(`${logPrefix} Found ${urlsToProcess.length} URLs to process for ${currentYear}-${currentMonthOneBased}.`);
        }

        const yearsArray = Array(urlsToProcess.length).fill(currentYear);
        const monthsZeroBasedArray = Array(urlsToProcess.length).fill(currentMonth);

        const summary = await processUrls(urlsToProcess, folderNamesToProcess, scriptTypesToProcess, yearsArray, monthsZeroBasedArray);
        console.log(`${logPrefix} Processing finished.`, summary);

        const successfulCount = summary?.successful ?? 0;
        const totalCount = summary?.total ?? urlsToProcess.length;
        await addExecutionLog("SYSTEM", "Auto-Fetch", `Finished ${currentYear}-${currentMonthOneBased}. Success: ${successfulCount}/${totalCount}.`);
        
        browserAPI.notifications.create(`daily-fetch-complete-${Date.now()}`, {
            type: 'basic',
            iconUrl: browserAPI.runtime.getURL('icons/icon128.png'),
            title: 'Automatic Daily Fetch Complete',
            message: `Successfully processed ${successfulCount} of ${totalCount} configured folders for the current month.`,
            priority: 0
        });

        if (StorageManager.pako) {
            await StorageManager.storeGenericData(STORAGE_KEY_LAST_AUTO_FETCH, new Date().toISOString());
        } else {
            await browserAPI.storage.local.set({ [STORAGE_KEY_LAST_AUTO_FETCH]: new Date().toISOString() });
        }
        console.log(`${logPrefix} Updated last auto fetch timestamp.`);
        await browserAPI.storage.session.remove(MISSED_FETCH_SESSION_KEY);

    } catch (error) {
        console.error(`${logPrefix} Error during automatic fetch:`, error);
        ErrorManager.logError("Daily Fetch Failed", { error: error.message }, SEVERITY.ERROR, CATEGORY.PROCESSING);
        await addExecutionLog("SYSTEM", "Auto-Fetch", `Failed: ${error.message}`);
    } finally {
        await setStateFlag(STATE_FLAGS.URL_PROCESSING, false);
        console.log(`${logPrefix} Released processing lock.`);
        browserAPI.power.releaseKeepAwake();
    }
}

async function checkMissedAutoFetch() {
    console.log("BG Startup: Checking for missed auto-fetch...");
    try {
        let lastFetchTimestamp;
        if (StorageManager.pako) {
            lastFetchTimestamp = await StorageManager.retrieveAndDecompress(STORAGE_KEY_LAST_AUTO_FETCH);
        } else {
            const lastFetchResult = await browserAPI.storage.local.get(STORAGE_KEY_LAST_AUTO_FETCH);
            lastFetchTimestamp = lastFetchResult[STORAGE_KEY_LAST_AUTO_FETCH];
        }
        
        const now = new Date();
        let missed = true;
        if (lastFetchTimestamp) {
            const lastFetchDate = new Date(lastFetchTimestamp);
            if (lastFetchDate.getFullYear() === now.getFullYear() &&
                lastFetchDate.getMonth() === now.getMonth() &&
                lastFetchDate.getDate() === now.getDate()) {
                missed = false;
            }
        }
        if (missed) {
            console.warn("BG Startup: Auto-fetch may have been missed or not run yet today.");
            const notifiedResult = await browserAPI.storage.session.get(MISSED_FETCH_SESSION_KEY);
            if (!notifiedResult[MISSED_FETCH_SESSION_KEY]) {
                const notificationTitle = "Daily Fetch May Have Been Missed";
                const notificationMessage = "The automatic daily data fetch might not have run. Click here to check or run manually.";
                browserAPI.notifications.create(MISSED_FETCH_NOTIFICATION_ID, {
                    type: 'basic',
                    title: notificationTitle,
                    message: notificationMessage,
                    iconUrl: browserAPI.runtime.getURL('icons/icon48.png'),
                    isClickable: true
                });
                await browserAPI.storage.session.set({ [MISSED_FETCH_SESSION_KEY]: true });
                await addExecutionLog("SYSTEM", "Auto-Fetch", "Missed fetch detected on startup - notification shown.");
            } else {
                console.log("BG Startup: Already notified about missed fetch in this session.");
            }
        } else {
            console.log("BG Startup: Auto-fetch appears to have run today.");
        }
    } catch (error) {
        console.error("BG Startup: Error checking missed auto-fetch:", error);
        ErrorManager.logError("Missed Fetch Check Failed", { error: error.message }, SEVERITY.WARNING, CATEGORY.SYSTEM);
    }
}

// --- Objective Import Flow ---
async function startObjectiveImport(sender) {
    console.log("BG Objective Import: Initiating Stage 1 (Scan Folder Types)...");
    if (await getStateFlag(STATE_FLAGS.OBJECTIVE_IMPORT) || await getStateFlag(STATE_FLAGS.URL_PROCESSING)) {
        const busyAction = await getStateFlag(STATE_FLAGS.OBJECTIVE_IMPORT) ? 'Objective import' : 'URL processing';
        throw new Error(`Cannot start Objective import: Another background task (${busyAction}) is running.`);
    }
    await setStateFlag(STATE_FLAGS.OBJECTIVE_IMPORT, true);
    await clearObjectiveImportState();

    await setObjectiveImportState({
        stage: 'scanningTypes',
        urlsToScan: [...OBJECTIVE_TOP_LEVEL_URLS],
        currentUrlIndex: 0,
        foundFolderTypes: [],
        errors: [],
        selectedFolderTypes: [],
        monthlyResults: {},
        processedMonthlyFolders: 0,
        totalMonthlyFoldersToProcess: 0,
        senderTabId: sender?.tab?.id
    });

    await processNextObjectiveUrl();
}

async function processNextObjectiveUrl() {
    const state = await getObjectiveImportState();
    if (!state.stage) { 
        console.warn("BG Objective Import: No state found, stopping."); 
        await setStateFlag(STATE_FLAGS.OBJECTIVE_IMPORT, false); 
        return; 
    }

    if (state.stage === 'scanningTypes') {
        if (state.currentUrlIndex < state.urlsToScan.length) {
            const url = state.urlsToScan[state.currentUrlIndex];
            console.log(`BG Objective Import: Stage 1 - Processing URL ${state.currentUrlIndex + 1}/${state.urlsToScan.length}: ${url}`);
            let tabId = null;
            try {
                tabId = await createTabAndWait(url, false);
                await executeScriptInTab(tabId, OBJECTIVE_IMPORT_SCRIPT_PATH);
                await sendMessageToTab(tabId, { action: ACTION_EXECUTE_OBJECTIVE_SCRAPE, taskInfo: { task: 'scrapeFolderTypes', url: url } });
            } catch (error) {
                console.error(`BG Objective Import: Error processing type URL ${url} (Tab ${tabId}):`, error);
                state.errors.push(`Error scanning ${url}: ${error.message}`);
                state.currentUrlIndex++;
                await setObjectiveImportState(state);
                if (tabId) await closeTab(tabId);
                await processNextObjectiveUrl();
            }
        } else {
            console.log(`BG Objective Import: Stage 1 Complete. Found ${state.foundFolderTypes.length} total potential types.`);
            state.stage = 'awaitingSelection';
            await setObjectiveImportState(state);
            browserAPI.runtime.sendMessage({
                action: ACTION_PROMPT_FOLDER_TYPE_SELECTION,
                folderTypes: state.foundFolderTypes,
                errors: state.errors
            }).catch(e => console.error("BG Objective Import: Failed to send prompt message to settings UI", e));
        }
    } else if (state.stage === 'processingMonthly') {
        if (state.currentUrlIndex < state.selectedFolderTypes.length) {
            const folderInfo = state.selectedFolderTypes[state.currentUrlIndex];
            console.log(`BG Objective Import: Stage 2 - Processing Folder ${state.currentUrlIndex + 1}/${state.selectedFolderTypes.length}: ${folderInfo.folderTypeName}`);
            let tabId = null;
            try {
                tabId = await createTabAndWait(folderInfo.url, false);
                await executeScriptInTab(tabId, OBJECTIVE_IMPORT_SCRIPT_PATH);
                await sendMessageToTab(tabId, {
                    action: ACTION_EXECUTE_OBJECTIVE_SCRAPE,
                    taskInfo: { task: 'scrapeMonthlyLinks', url: folderInfo.url, parentFolderName: folderInfo.folderTypeName }
                });
            } catch (error) {
                console.error(`BG Objective Import: Error processing monthly URL ${folderInfo.url} (Tab ${tabId}):`, error);
                state.errors.push(`Error scanning monthly links for ${folderInfo.folderTypeName}: ${error.message}`);
                state.currentUrlIndex++;
                state.processedMonthlyFolders++;
                await setObjectiveImportState(state);
                if (tabId) await closeTab(tabId);
                await processNextObjectiveUrl();
            }
        } else {
            console.log("BG Objective Import: Stage 2 Complete. All selected folders processed.");
            state.stage = 'generatingConfigs';
            await setObjectiveImportState(state);
            await finalizeObjectiveImport();
        }
    } else {
        console.warn(`BG Objective Import: processNextObjectiveUrl called in unexpected state: ${state.stage}`);
        await setStateFlag(STATE_FLAGS.OBJECTIVE_IMPORT, false);
        await clearObjectiveImportState();
    }
}

async function handleObjectiveSubfolderResult(message, sender) {
    const tabId = sender?.tab?.id;
    console.log(`BG Objective Import: Received Subfolder Result from Tab ${tabId}`, message);
    if (tabId) await closeTab(tabId);

    const state = await getObjectiveImportState();
    if (state.stage !== 'scanningTypes') { 
        console.warn(`BG Objective Import: Received SUBFOLDER_RESULT in wrong state: ${state.stage}`); 
        return; 
    }

    if (message.success && Array.isArray(message.folders)) {
        const currentUrls = new Set(state.foundFolderTypes.map(f => f.url));
        message.folders.forEach(folder => {
            if (!currentUrls.has(folder.url)) {
                state.foundFolderTypes.push(folder);
                currentUrls.add(folder.url);
            }
        });
    } else {
        state.errors.push(message.error || `Failed to get subfolders from ${state.urlsToScan[state.currentUrlIndex]}`);
    }

    state.currentUrlIndex++;
    await setObjectiveImportState(state);
    await processNextObjectiveUrl();
}

async function handleProcessSelectedFolderTypes(message, sender) {
    console.log("BG Objective Import: Received selected folder types from UI:", message.selectedFolderTypes);
    if (!message.selectedFolderTypes || !Array.isArray(message.selectedFolderTypes)) {
        throw new Error("Invalid selected folder types received.");
    }
    if (await getStateFlag(STATE_FLAGS.OBJECTIVE_IMPORT)) {
        const state = await getObjectiveImportState();
        if (state.stage !== 'awaitingSelection') { 
            throw new Error("Received PROCESS_SELECTED_FOLDER_TYPES in unexpected state."); 
        }

        state.stage = 'processingMonthly';
        state.selectedFolderTypes = message.selectedFolderTypes;
        state.currentUrlIndex = 0;
        state.processedMonthlyFolders = 0;
        state.totalMonthlyFoldersToProcess = message.selectedFolderTypes.length;
        state.monthlyResults = {};
        await setObjectiveImportState(state);

        await processNextObjectiveUrl();
    } else {
        throw new Error("Objective import process not running.");
    }
}

async function handleObjectiveMonthlyResult(message, sender) {
    const tabId = sender?.tab?.id;
    console.log(`BG Objective Import: Received Monthly Result for "${message.parentFolderTypeName}" from Tab ${tabId}`);
    if (tabId) await closeTab(tabId);

    const state = await getObjectiveImportState();
    if (state.stage !== 'processingMonthly') { 
        console.warn(`BG Objective Import: Received MONTHLY_RESULT in wrong state: ${state.stage}`); 
        return; 
    }

    if (message.success && Array.isArray(message.monthlyData)) {
        state.monthlyResults[message.parentFolderTypeName] = message.monthlyData;
    } else {
        state.errors.push(message.error || `Failed to get monthly links for ${message.parentFolderTypeName}`);
    }

    state.processedMonthlyFolders++;
    state.currentUrlIndex++;
    await setObjectiveImportState(state);

    if (state.processedMonthlyFolders >= state.totalMonthlyFoldersToProcess) {
        console.log("BG Objective Import: All selected folders processed. Finalizing...");
        state.stage = 'generatingConfigs';
        await setObjectiveImportState(state);
        await finalizeObjectiveImport();
    } else {
        await processNextObjectiveUrl();
    }
}

async function handleObjectiveImportError(message, sender) {
    const tabId = sender?.tab?.id;
    console.error(`BG Objective Import: Received Error from Tab ${tabId || 'unknown'}: ${message.error}`, message.url);
    if (tabId) await closeTab(tabId);

    const state = await getObjectiveImportState();
    state.errors = state.errors || [];
    state.errors.push(`Error from ${message.url || 'unknown URL'}: ${message.error}`);

    if (state.stage === 'scanningTypes') {
        state.currentUrlIndex++;
        await setObjectiveImportState(state);
        await processNextObjectiveUrl();
    } else if (state.stage === 'processingMonthly') {
        state.processedMonthlyFolders++;
        state.currentUrlIndex++;
        await setObjectiveImportState(state);
        if (state.processedMonthlyFolders >= state.totalMonthlyFoldersToProcess) {
            console.log("BG Objective Import: All selected folders processed (with errors). Finalizing...");
            state.stage = 'generatingConfigs';
            await setObjectiveImportState(state);
            await finalizeObjectiveImport();
        } else {
            await processNextObjectiveUrl();
        }
    } else {
        console.warn(`BG Objective Import: Error received in unexpected state: ${state.stage}`);
        await finalizeObjectiveImport(true);
    }
}

async function finalizeObjectiveImport(forcedError = false) {
    console.log("BG Objective Import: Finalizing...");
    const state = await getObjectiveImportState();
    const finalErrors = state.errors || [];
    const generatedConfigs = [];
    let success = !forcedError;

    if (!forcedError && state.stage === 'generatingConfigs' && state.monthlyResults) {
        try {
            let existingConfigs;
            if (StorageManager.pako) {
                existingConfigs = await StorageManager.retrieveAndDecompress(STORAGE_KEY_FOLDERS_CONFIG) || [];
            } else {
                const existingConfigsResult = await browserAPI.storage.local.get(STORAGE_KEY_FOLDERS_CONFIG);
                existingConfigs = existingConfigsResult[STORAGE_KEY_FOLDERS_CONFIG] || [];
            }
            
            if (!Array.isArray(existingConfigs)) existingConfigs = [];

            Object.entries(state.monthlyResults).forEach(([parentFolderName, monthlyLinks]) => {
                if (Array.isArray(monthlyLinks)) {
                    monthlyLinks.forEach(link => {
                        const monthName = MONTH_NAMES_SHORT && MONTH_NAMES_SHORT[link.month-1] ? MONTH_NAMES_SHORT[link.month-1] : `M${link.month}`;
                        const newConfig = {
                            name: `${parentFolderName} - ${monthName} ${link.year}`,
                            urls: [link.url],
                            script: 'A',
                            year: link.year,
                            month: link.month
                        };
                        const isDuplicate = existingConfigs.some(ex =>
                            ex.name === newConfig.name && ex.year === newConfig.year && ex.month === newConfig.month
                        );
                        if (!isDuplicate) {
                            existingConfigs.push(newConfig);
                            generatedConfigs.push(newConfig);
                        } else {
                            console.log(`BG Objective Import: Skipping duplicate config: ${newConfig.name}`);
                        }
                    });
                }
            });

            if (StorageManager.pako) {
                await StorageManager.storeGenericData(STORAGE_KEY_FOLDERS_CONFIG, existingConfigs);
            } else {
                await browserAPI.storage.local.set({ [STORAGE_KEY_FOLDERS_CONFIG]: existingConfigs });
            }
            console.log(`BG Objective Import: Saved ${generatedConfigs.length} new configurations.`);
        } catch (error) {
            console.error("BG Objective Import: Error saving generated configurations:", error);
            finalErrors.push(`Error saving configs: ${error.message}`);
            success = false;
            ErrorManager.logError("Objective Import Save Failed", { error: error.message }, SEVERITY.ERROR, CATEGORY.STORAGE);
        }
    } else if (!forcedError) {
        console.warn("BG Objective Import: Finalizing in unexpected state or with no monthly results.");
        finalErrors.push("Internal error during finalization stage.");
        success = false;
    }

    await clearObjectiveImportState();
    await setStateFlag(STATE_FLAGS.OBJECTIVE_IMPORT, false);

    const senderTabId = state.senderTabId;
    const finalMessage = {
        action: ACTION_OBJECTIVE_IMPORT_COMPLETE,
        success: success,
        folders: generatedConfigs,
        errors: finalErrors,
        error: finalErrors.length > 0 ? finalErrors.join('; ') : null
    };

    if (typeof senderTabId === 'number') {
        try {
            await browserAPI.tabs.sendMessage(senderTabId, finalMessage);
            console.log("BG Objective Import: Sent final completion message to settings tab", senderTabId);
        } catch (e) {
            console.warn(`BG Objective Import: Failed to send completion message to original settings tab ${senderTabId} (likely closed).`, e);
            const notificationMsg = success
                ? `Objective import complete. Added ${generatedConfigs.length} configurations.` + (finalErrors.length ? ` ${finalErrors.length} errors.` : '')
                : `Objective import failed.` + (finalErrors.length ? ` Errors: ${finalErrors.join('; ')}` : '');
            const notificationType = success ? (finalErrors.length ? NOTIFICATION_TYPE.WARNING : NOTIFICATION_TYPE.SUCCESS) : NOTIFICATION_TYPE.ERROR;
            NotificationSystem.showNotification("Objective Import", notificationMsg, notificationType);
        }
    } else {
        console.warn("BG Objective Import: Cannot send completion message - original sender tab ID not stored.");
        const notificationMsg = success
            ? `Objective import complete. Added ${generatedConfigs.length} configurations.` + (finalErrors.length ? ` ${finalErrors.length} errors.` : '')
            : `Objective import failed.` + (finalErrors.length ? ` Errors: ${finalErrors.join('; ')}` : '');
        const notificationType = success ? (finalErrors.length ? NOTIFICATION_TYPE.WARNING : NOTIFICATION_TYPE.SUCCESS) : NOTIFICATION_TYPE.ERROR;
        NotificationSystem.showNotification("Objective Import", notificationMsg, notificationType);
    }

    console.log("BG Objective Import: Process Finished.");
    await addExecutionLog("SYSTEM", "Objective Import", `Finished. Added: ${generatedConfigs.length}. Errors: ${finalErrors.length}.`);
}

// --- Alarm Setup & Handling ---
async function setupDailyFetchAlarm() {
    try {
        let config;
        if (StorageManager.pako) {
            config = await StorageManager.retrieveAndDecompress(STORAGE_KEY_DAILY_FETCH_CONFIG) || { isEnabled: false };
        } else {
            const configResult = await browserAPI.storage.local.get(STORAGE_KEY_DAILY_FETCH_CONFIG);
            config = configResult[STORAGE_KEY_DAILY_FETCH_CONFIG] || { isEnabled: false };
        }

        await browserAPI.alarms.clear(ALARM_DAILY_FETCH);

        if (config.isEnabled && config.time) {
            const [hour, minute] = config.time.split(':').map(Number);
            
            const now = new Date();
            const targetTime = new Date();
            targetTime.setHours(hour, minute, 0, 0);

            if (now.getTime() >= targetTime.getTime()) {
                targetTime.setDate(targetTime.getDate() + 1);
            }

            const delayInMinutes = Math.ceil((targetTime.getTime() - now.getTime()) / 60000);

            browserAPI.alarms.create(ALARM_DAILY_FETCH, {
                delayInMinutes: Math.max(1, delayInMinutes),
                periodInMinutes: 24 * 60
            });
            console.log(`BG Alarms: Daily fetch alarm SET for approx. ${config.time} daily. Next run in ~${delayInMinutes} mins.`);
        } else {
            console.log("BG Alarms: Daily fetch is disabled. Alarm cleared.");
        }
    } catch (error) {
        console.error("BG Alarms: Failed to setup daily fetch alarm:", error);
        ErrorManager.logError("Setup Daily Fetch Alarm Failed", { error: error.message }, SEVERITY.ERROR, CATEGORY.SYSTEM);
    }
}

async function setupAllAlarms() {
    console.log("BG Alarms: Setting up all alarms...");
    try {
        setupUtilityAlarms();
        await setupDailyFetchAlarm();
    } catch (e) {
        console.error("BG Alarms: Error during setupAllAlarms:", e);
        ErrorManager.logError("Setup All Alarms Failed", { error: e.message }, SEVERITY.CRITICAL, CATEGORY.SYSTEM);
    }
}

async function handleAlarms(alarm) {
    const knownAlarms = [ALARM_DAILY_BACKUP, ALARM_WEEKLY_MAINTENANCE, ALARM_MONTHLY_ARCHIVING, ALARM_DAILY_FETCH];
    if (!knownAlarms.includes(alarm.name)) {
        console.warn(`BG Alarms: Received unknown alarm: ${alarm.name}`);
        return;
    }
    const scheduledTime = new Date(alarm.scheduledTime).toLocaleString();
    console.log(`BG Alarms: Handling alarm "${alarm.name}" (Scheduled: ${scheduledTime})`);
    await addExecutionLog("SYSTEM", "Alarms", `Triggered: ${alarm.name}`);

    try {
        switch (alarm.name) {
            case ALARM_DAILY_FETCH:
                console.log(`   - Running daily stat fetch (alarm: ${alarm.name})...`);
                await runDailyStatFetch();
                break;
            case ALARM_DAILY_BACKUP:
                console.log(`   - Running daily backup...`);
                try {
                    await DataBackupUtility.createBackup('Daily Backup', 'Automatic daily backup', true);
                } catch (backupError) {
                    console.error(`BG Alarms: Error during ${alarm.name}:`, backupError);
                    ErrorManager.logError(`Alarm Task Failed: ${alarm.name}`, { error: backupError.message }, SEVERITY.ERROR, CATEGORY.BACKUP);
                    await addExecutionLog("SYSTEM", "Alarms", `Failed Task (${alarm.name}): ${backupError.message}`);
                }
                break;
            case ALARM_WEEKLY_MAINTENANCE:
                console.log(`   - Running weekly maintenance...`);
                try {
                    await DataBackupUtility.verifyDataIntegrity();
                    await DataBackupUtility.checkStorageUsage();
                } catch (maintError) {
                    console.error(`BG Alarms: Error during ${alarm.name}:`, maintError);
                    ErrorManager.logError(`Alarm Task Failed: ${alarm.name}`, { error: maintError.message }, SEVERITY.WARNING, CATEGORY.MAINTENANCE);
                    await addExecutionLog("SYSTEM", "Alarms", `Failed Task (${alarm.name}): ${maintError.message}`);
                }
                break;
            case ALARM_MONTHLY_ARCHIVING:
                console.log(`   - Running monthly archiving...`);
                try {
                    await DataBackupUtility.archiveOldData(12);
                } catch (archiveError) {
                    console.error(`BG Alarms: Error during ${alarm.name}:`, archiveError);
                    ErrorManager.logError(`Alarm Task Failed: ${alarm.name}`, { error: archiveError.message }, SEVERITY.WARNING, CATEGORY.MAINTENANCE);
                    await addExecutionLog("SYSTEM", "Alarms", `Failed Task (${alarm.name}): ${archiveError.message}`);
                }
                break;
        }
        console.log(`BG Alarms: Finished handling alarm "${alarm.name}".`);
        await addExecutionLog("SYSTEM", "Alarms", `Finished: ${alarm.name}`);
    } catch (error) {
        console.error(`BG Alarms: Critical error handling alarm "${alarm.name}":`, error);
        ErrorManager.logError(`Failed to handle alarm: ${alarm.name}`, { error: error.message }, SEVERITY.CRITICAL, CATEGORY.SYSTEM);
        await addExecutionLog("SYSTEM", "Alarms", `Critical Failure (${alarm.name}): ${error.message}`);
    }
}

// --- Main Event Listeners Setup ---
function setupEventListeners() {
    // Alarm listener
    if (browserAPI.alarms && !browserAPI.alarms.onAlarm.hasListeners()) {
        browserAPI.alarms.onAlarm.addListener(handleAlarms);
        console.log("BG Alarms: Added onAlarm listener.");
    }

    // Notification listeners
    if (browserAPI.notifications?.onClicked && !browserAPI.notifications.onClicked.hasListeners()) {
        browserAPI.notifications.onClicked.addListener(handleNotificationClick);
        console.log("BG Notifications: Added onClicked listener.");
    }

    if (browserAPI.notifications?.onButtonClicked && !browserAPI.notifications.onButtonClicked.hasListeners()) {
        browserAPI.notifications.onButtonClicked.addListener(handleNotificationButtonClick);
        console.log("BG Notifications: Added onButtonClicked listener.");
    }
}

function handleNotificationClick(notificationId) {
    console.log(`BG Notifications: Clicked ID: ${notificationId}`);
    openMainUI();
    try {
        browserAPI.notifications.clear(notificationId);
    } catch (e) {
        console.warn(`BG Notifications: Failed clear notification ${notificationId}`, e);
    }
}

function handleNotificationButtonClick(notificationId, buttonIndex) {
    console.log(`BG Notifications: Clicked button ${buttonIndex} on ID: ${notificationId}`);
    try {
        browserAPI.notifications.clear(notificationId);
    } catch (e) {
        console.warn(`BG Notifications: Failed clear notification ${notificationId}`, e);
    }
}

async function openMainUI() {
    const targetUrl = browserAPI.runtime.getURL('main.html');
    try {
        const tabs = await browserAPI.tabs.query({ url: targetUrl });
        if (tabs.length > 0) {
            const existingTab = tabs[0];
            console.log(`BG UI: Found existing tab ${existingTab.id}. Focusing...`);
            try {
                await browserAPI.windows.update(existingTab.windowId, { focused: true });
            } catch(winErr){
                console.warn("BG UI: Could not focus window.", winErr.message);
            }
            await browserAPI.tabs.update(existingTab.id, { active: true });
        } else {
            console.log("BG UI: No existing tab found. Creating new one...");
            const newTab = await browserAPI.tabs.create({ url: targetUrl });
            console.log(`BG UI: Created new tab ${newTab.id}. Focusing window...`);
            try {
                await browserAPI.windows.update(newTab.windowId, { focused: true });
            } catch(winErr){
                console.warn("BG UI: Could not focus new window.", winErr.message);
            }
        }
    } catch (error) {
        console.error("BG UI: Failed to open/focus main UI:", error);
        ErrorManager.logError("Open Main UI Failed", { url: targetUrl, error: error.message }, SEVERITY.ERROR, CATEGORY.UI);
    }
}

// Core initialization function
async function initializeBackgroundScript() {
    if (isInitialized || isInitializing) return;
    isInitializing = true;

    const manifest = browserAPI.runtime.getManifest();
    const manifestVersion = manifest?.version || 'unknown';

    try {
        // Initialize logging state first
        const { [STORAGE_KEY_LOGGING_CONFIG]: savedLoggingState = true } = await browserAPI.storage.local.get(STORAGE_KEY_LOGGING_CONFIG);
        LOGGING_ENABLED = savedLoggingState;
        originalConsole.log(`BG: Initializing Background Script (v${manifestVersion}). Logging is ${LOGGING_ENABLED ? 'ENABLED' : 'DISABLED'}.`);

        // Initialize StorageManager
        const storageInitialized = await initializeStorageManager();
        if (storageInitialized) {
            await addExecutionLog("SYSTEM", "Lifecycle", `Background script starting (v${manifestVersion})`);
        }

        // Clear session storage on each startup to reset transient states
        await browserAPI.storage.session.clear();
        console.log("BG Init: Session storage cleared on startup.");

        await VersionManager.initialize();
        await holidayService.initialize();

        setupEventListeners();
        await setupAllAlarms();
        await checkMissedAutoFetch();

        isInitialized = true;
        console.log('BG Init: Initialization complete.');
        await addExecutionLog("SYSTEM", "Lifecycle", `Background script initialization complete.`);
    } catch (error) {
        console.error("BG Init: Initialization failed:", error);
        ErrorManager.logError("Background Init Failed", { error: error.message }, SEVERITY.CRITICAL, CATEGORY.SYSTEM);
        await addExecutionLog("SYSTEM", "Lifecycle", `Background script initialization FAILED: ${error.message}`);
    } finally {
        isInitializing = false;
    }
}

// --- Main Message Handler with ALL functionality ---
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const action = message?.action;
    const tabId = sender?.tab?.id;
    const senderOrigin = sender?.origin;
    const senderContext = sender?.documentId ? `Document ${sender.documentId}` : (sender?.tab ? `Tab ${tabId}` : (sender?.id || 'unknown context'));

    // Reduce logging for frequent messages
    if (![ACTION_LOG_FROM_SCRIPT, ACTION_UPDATE_PROGRESS, ACTION_SET_LOGGING].includes(action)) {
        console.log(`BG Received Action: ${action || 'N/A'} from ${senderContext} (${senderOrigin || 'internal'})`, message);
    }

    if (action === ACTION_STOP_PROCESSING) {
        console.log("BG: Received stop processing request.");
        stopProcessingFlag(true);
        sendResponse({ status: "Stop signal received by background." });
        return false;
    }

    // Use IIAFE for async handling
    (async () => {
        let responsePayload = { status: STATUS_ERR_UNKNOWN_ACTION, error: `Unknown action: ${action}` };
        let handledAsync = false;

        try {
            switch (action) {
                case ACTION_SET_DAILY_FETCH: {
                    const { isEnabled, time } = message.payload;
                    if (typeof isEnabled !== 'boolean' || (isEnabled && !/^\d{2}:\d{2}$/.test(time))) {
                        throw new Error("Invalid payload for setDailyFetch. Requires isEnabled (boolean) and time (HH:mm).");
                    }
                    const newConfig = { isEnabled, time: isEnabled ? time : null };
                    if (StorageManager.pako) {
                        await StorageManager.storeGenericData(STORAGE_KEY_DAILY_FETCH_CONFIG, newConfig);
                    } else {
                        await browserAPI.storage.local.set({ [STORAGE_KEY_DAILY_FETCH_CONFIG]: newConfig });
                    }
                    await setupDailyFetchAlarm();
                    responsePayload = { status: STATUS_SUCCESS, message: "Daily fetch configuration updated." };
                    break;
                }
                case ACTION_GET_DAILY_FETCH_STATUS: {
                    let config;
                    if (StorageManager.pako) {
                        config = await StorageManager.retrieveAndDecompress(STORAGE_KEY_DAILY_FETCH_CONFIG) || { isEnabled: false };
                    } else {
                        const configResult = await browserAPI.storage.local.get(STORAGE_KEY_DAILY_FETCH_CONFIG);
                        config = configResult[STORAGE_KEY_DAILY_FETCH_CONFIG] || { isEnabled: false };
                    }
                    
                    let nextFetchTime = null;
                    if (config.isEnabled) {
                        const alarm = await browserAPI.alarms.get(ALARM_DAILY_FETCH);
                        if (alarm) {
                            nextFetchTime = alarm.scheduledTime;
                        }
                    }
                    
                    responsePayload = {
                        isEnabled: config.isEnabled,
                        fetchTime: config.time || null,
                        nextFetchTime: nextFetchTime
                    };
                    break;
                }
                case ACTION_TRIGGER_DAILY_FETCH: {
                    sendResponse({ status: STATUS_ACK_PROCESSING, message: "Manual fetch initiated." });
                    handledAsync = true;
                    await runDailyStatFetch();
                    break;
                }
                case ACTION_SET_LOGGING: {
                    if (typeof message.enabled === 'boolean') {
                        LOGGING_ENABLED = message.enabled;
                        await browserAPI.storage.local.set({ [STORAGE_KEY_LOGGING_CONFIG]: LOGGING_ENABLED });
                        originalConsole.log(`Console logging has been set to: ${LOGGING_ENABLED}`);
                        responsePayload = { status: STATUS_SUCCESS, loggingEnabled: LOGGING_ENABLED };
                    } else {
                        responsePayload = { status: STATUS_ERROR, error: 'Invalid "enabled" property for setLogging' };
                    }
                    break;
                }
                case ACTION_RUN_SCRIPTS: {
                    console.warn("BG ACTION_RUN_SCRIPTS: Proceeding without checking for other concurrent background tasks.");
                    if (!message.urls || !message.folderNames || !message.scriptTypes || typeof message.configYear !== 'number' || typeof message.configMonth !== 'number') { 
                        throw new Error("Invalid arguments for runScripts action."); 
                    }
                    
                    const requireVerification = message.requireVerification !== false;
                    let currentRunExtractionReports = [];
                    
                    sendResponse({ status: STATUS_ACK_PROCESSING });
                    handledAsync = true;
                    try {
                        browserAPI.power.requestKeepAwake('system');
                        await setStateFlag(STATE_FLAGS.URL_PROCESSING, true);
                        
                        // Load excluded folders from settings for auto-save
                        const DATA_REVIEW_SETTINGS_KEY = 'dataReviewSettings';
                        const settingsResult = await browserAPI.storage.local.get([DATA_REVIEW_SETTINGS_KEY, 'forceSingleCountFolders']);
                        const excludedFolders = settingsResult[DATA_REVIEW_SETTINGS_KEY]?.excludedFolders || [];
                        const forceSingleCountFolders = settingsResult.forceSingleCountFolders || [];
                        if (excludedFolders.length > 0) {
                            console.log('BG: Excluded folders (will auto-save):', excludedFolders);
                        }
                        if (forceSingleCountFolders.length > 0) {
                            console.log('BG: Force single count folders (will auto-save with count=1):', forceSingleCountFolders);
                        }
                        
                        const summary = await processUrls(message.urls, message.folderNames, message.scriptTypes, Array(message.urls.length).fill(message.configYear), Array(message.urls.length).fill(message.configMonth), requireVerification, excludedFolders);
                        console.log("BG: URL processing finished via message.", summary);
                        
                        // Collect extraction reports from results (like D&A)
                        if (summary.results && Array.isArray(summary.results)) {
                            summary.results.forEach(result => {
                                if (result.success && result.extractionReport) {
                                    currentRunExtractionReports.push(result.extractionReport);
                                }
                            });
                            console.log(`BG: Collected ${currentRunExtractionReports.length} extraction reports`);
                        }
                        
                        // Send verification modal if enabled and reports exist
                        if (requireVerification && currentRunExtractionReports.length > 0) {
                            try {
                                console.log('BG: Preparing verification data...');
                                
                                // First, process force single count folders (auto-save with count=1)
                                const forceSingleCountReports = currentRunExtractionReports.filter(report => {
                                    return forceSingleCountFolders.some(f => 
                                        report.folderName.includes(f) || f.includes(report.folderName)
                                    );
                                });
                                
                                // Auto-save force single count folders
                                for (const report of forceSingleCountReports) {
                                    console.log(`BG: Auto-saving force single count folder "${report.folderName}"`);
                                    await autoSaveForceSingleCountFolder(report, message.configYear, message.configMonth);
                                }
                                
                                // Filter out excluded folders and force single count folders from verification
                                const verificationData = currentRunExtractionReports
                                    .filter(report => {
                                        const isExcluded = excludedFolders.includes(report.folderName);
                                        const isForceSingleCount = forceSingleCountFolders.some(f => 
                                            report.folderName.includes(f) || f.includes(report.folderName)
                                        );
                                        
                                        if (isExcluded) {
                                            console.log(`BG: Excluding folder "${report.folderName}" from verification (already auto-saved)`);
                                        }
                                        if (isForceSingleCount) {
                                            console.log(`BG: Excluding folder "${report.folderName}" from verification (force single count - already auto-saved)`);
                                        }
                                        return !isExcluded && !isForceSingleCount;
                                    })
                                    .map(report => {
                                    const folderData = {
                                        folderName: report.folderName,
                                        persons: []
                                    };
                                    
                                    // Group rows by person
                                    if (report.rows && Array.isArray(report.rows)) {
                                        const personMap = new Map();
                                        
                                        report.rows.forEach(row => {
                                            const personName = row.person || row.nameText;
                                            if (!personMap.has(personName)) {
                                                personMap.set(personName, []);
                                            }
                                            personMap.get(personName).push({
                                                dateText: row.dateText || '',
                                                isoDate: row.isoDate || '',  // Include pre-parsed ISO date
                                                nameText: row.nameText || '',
                                                countText: row.countText || '',
                                                extractedCount: row.count || 0,
                                                rule: row.rule || 'Unknown'
                                            });
                                        });
                                        
                                        // Convert map to array
                                        personMap.forEach((rows, personName) => {
                                            folderData.persons.push({
                                                personName: personName,
                                                rows: rows
                                            });
                                        });
                                    }
                                    
                                    return folderData;
                                });
                                
                                console.log(`BG: Sending verification modal with ${verificationData.length} folders (after excluding ${excludedFolders.length} folders)`);
                                
                                // If no folders left after exclusion, skip verification and auto-save
                                if (verificationData.length === 0) {
                                    console.log('BG: All folders excluded from review, skipping verification modal');
                                    await updateBadge('Success', message.urls.length);
                                    return { success: true, message: 'All processed folders were excluded from review' };
                                }
                                
                                // Send to index.html verification modal
                                await browserAPI.runtime.sendMessage({
                                    action: 'showVerificationModal',
                                    data: verificationData,
                                    weekInfo: {
                                        year: message.configYear,
                                        week: message.configMonth  // This is 0-based from index.js
                                    }
                                });
                                console.log('BG: Verification modal sent');
                            } catch (error) {
                                console.error("BG: Failed to send verification data:", error);
                            }
                        }
                    } finally {
                        await setStateFlag(STATE_FLAGS.URL_PROCESSING, false);
                        browserAPI.power.releaseKeepAwake();
                    }
                    break;
                }
                case ACTION_GENERATE_REPORTS: {
                    console.warn("BG ACTION_GENERATE_REPORTS: Proceeding without checking for other concurrent background tasks.");
                    const optionsValidation = validateReportOptions({ ...message.options, reportMonth: message.options.reportMonth + 1}); 
                    if (!optionsValidation.valid) { 
                        throw new Error(`Invalid report options: ${optionsValidation.errors.join(', ')}`); 
                    }
                    await setStateFlag(STATE_FLAGS.REPORT_GENERATION, true);
                    sendResponse({ status: STATUS_ACK_GENERATION });
                    handledAsync = true;
                    const finalErrors = [];
                    let finalGeneratedCount = 0;
                    let reportDataResults = { generatedReports: [], errors: [] };
                    try {
                        await addExecutionLog("SYSTEM", "Report Generation", `Starting. Format: ${message.options?.format || 'N/A'}. Team: ${message.options?.isTeamReport}`);
                        let personsForGenerator = [];
                        let foldersForGenerator = message.selectedFolders;
                        const reportOptions = message.options;
                        const reportYear = reportOptions.reportYear;
                        const reportMonthZeroBased = reportOptions.reportMonth;
                        if (reportOptions?.isTeamReport) {
                            console.log("BG: Generating Team Report. Fetching relevant people.");
                            let allData;
                            if (StorageManager.pako) {
                                allData = await StorageManager.retrieveAndDecompress(STORAGE_KEY_DATA);
                            } else {
                                const result = await browserAPI.storage.local.get(STORAGE_KEY_DATA);
                                allData = result[STORAGE_KEY_DATA];
                            }
                            const storageMonthKey = reportMonthZeroBased + 1;
                            if (!allData || !allData.persons) { 
                                throw new Error("Cannot generate team report: No person data found."); 
                            }
                            personsForGenerator = Object.keys(allData.persons).filter(person => {
                                const monthData = allData.persons[person]?.[reportYear]?.[storageMonthKey];
                                if (!monthData) return false;
                                return foldersForGenerator === null || Object.keys(monthData).some(folderDN => foldersForGenerator.includes(folderDN));
                            });
                            console.log(`BG Team Report: Found ${personsForGenerator.length} persons with relevant data.`);
                        } else {
                            personsForGenerator = message.selectedPersons;
                            console.log(`BG Individual Report: Using ${personsForGenerator === null ? 'all available' : (personsForGenerator?.length ?? 0) + ' selected'} persons.`);
                        }
                        if ((reportOptions?.isTeamReport || personsForGenerator === null) && personsForGenerator.length === 0) {
                            const errorMsg = "No data found for any person matching the selected criteria for the report.";
                            finalErrors.push(errorMsg); 
                            console.warn(errorMsg);
                        } else if (!reportOptions?.isTeamReport && personsForGenerator !== null && personsForGenerator.length === 0) {
                            const errorMsg = "Individual report requires specific persons to be selected or 'Select All'.";
                            finalErrors.push(errorMsg); 
                            console.warn(errorMsg);
                        }
                        if (finalErrors.length === 0) {
                            reportDataResults = await generateObjectiveReports(personsForGenerator, foldersForGenerator, reportOptions);
                            finalErrors.push(...(reportDataResults.errors || []));
                        }
                        const reportsToDownload = reportDataResults.generatedReports || [];
                        if (reportsToDownload.length === 0 && finalErrors.length === 0) {
                            finalErrors.push("No report data could be generated for the selected criteria.");
                        }
                        console.log(`BG Report Prep: Reports: ${reportsToDownload.length}. Prep Errors: ${finalErrors.length}`);
                        const pdfReportsExist = reportsToDownload.some(r => r.type === 'pdf');
                        if (pdfReportsExist) { 
                            console.log("BG Report: PDF required, offscreen document will be used."); 
                        }
                        const downloadPromises = reportsToDownload.map(async (report) => {
                            let downloadUrl = null;
                            try {
                                if (report.type === 'csv') {
                                    const csvContent = typeof report.content === 'string' ? report.content : String(report.content);
                                    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
                                    downloadUrl = await new Promise((resolve, reject) => {
                                        const reader = new FileReader();
                                        reader.onload = () => resolve(reader.result);
                                        reader.onerror = (err) => reject(new Error(`FileReader error: ${err?.message || 'Unknown error'}`));
                                        reader.readAsDataURL(blob);
                                    });
                                } else if (report.type === 'pdf') {
                                    if (!report.data) throw new Error(`PDF data missing for ${report.fileName}`);
                                    const payloadForOffscreen = { ...report.data };
                                    if (!payloadForOffscreen.mainTable || !Array.isArray(payloadForOffscreen.mainTable.head) || !Array.isArray(payloadForOffscreen.mainTable.body)) {
                                        console.error("BG: CRITICAL - Invalid mainTable structure detected just before calling generatePdfOffscreen!", payloadForOffscreen);
                                        throw new Error(`Internal Error: Invalid mainTable structure for PDF ${report.fileName}`);
                                    }
                                    downloadUrl = await generatePdfOffscreen(payloadForOffscreen);
                                } else { 
                                    throw new Error(`Unsupported report type: ${report.type}`); 
                                }
                                console.log(`BG Report: Attempting download for: ${report.fileName} (Type: ${report.type})`);
                                const downloadId = await new Promise((resolve, reject) => {
                                    browserAPI.downloads.download({ url: downloadUrl, filename: report.fileName, saveAs: false }, (id) => {
                                        const error = browserAPI.runtime.lastError;
                                        if (error) { 
                                            reject(new Error(error.message)); 
                                        }
                                        else if (id === undefined) { 
                                            reject(new Error("Download failed (API returned undefined download ID).")); 
                                        }
                                        else { 
                                            resolve(id); 
                                        }
                                    });
                                });
                                console.log(`BG Report: Download initiated for ${report.fileName} with ID: ${downloadId}`);
                                finalGeneratedCount++;
                                return { status: 'fulfilled', fileName: report.fileName, downloadId };
                            } catch (downloadError) {
                                console.error(`BG Report: Download init failed for ${report.fileName}:`, downloadError);
                                finalErrors.push(`Failed download for ${report.fileName}: ${downloadError.message}`);
                                return { status: 'rejected', fileName: report.fileName, reason: downloadError.message };
                            }
                        });
                        await Promise.allSettled(downloadPromises);
                        console.log("BG Report: All report processing & download attempts finished.");
                    } catch (prepOrSetupError) {
                        console.error("BG Report: Generation failed critically:", prepOrSetupError);
                        finalErrors.push(`Critical error during report generation: ${prepOrSetupError.message}`);
                        ErrorManager.logError("Report Generation Critical Fail", { error: prepOrSetupError.message }, SEVERITY.ERROR, CATEGORY.REPORTING);
                    } finally {
                        if (reportDataResults.generatedReports?.some(r => r.type === 'pdf')) {
                            await closeOffscreenDocument();
                        }
                        try {
                            console.log(`BG Report: Sending completion message. Count: ${finalGeneratedCount}, Errors: ${finalErrors.length}`);
                            browserAPI.runtime.sendMessage({ action: ACTION_REPORTS_GENERATED, count: finalGeneratedCount, errors: finalErrors }).catch(e => console.warn("BG: Could not send report completion message, UI likely closed.", e));
                        } catch(e) { 
                            console.warn("BG: Error trying to send report completion message.", e); 
                        }
                        await setStateFlag(STATE_FLAGS.REPORT_GENERATION, false);
                        await addExecutionLog("SYSTEM", "Report Generation", `Finished. Generated: ${finalGeneratedCount}. Errors: ${finalErrors.length}.`);
                        console.log("BG Report: Generation Process Finished.");
                    }
                    break;
                }
                case ACTION_DELETE_DATA: {
                    console.warn("BG ACTION_DELETE_DATA: Proceeding without checking for other concurrent background tasks.");
                    if (!message.criteria || !message.criteria.options) { 
                        throw new Error("Invalid deletion criteria provided."); 
                    }
                    await setStateFlag(STATE_FLAGS.DATA_DELETION, true);
                    sendResponse({ status: STATUS_ACK_PROCESSING });
                    handledAsync = true;
                    let deleteResult = { success: false, deletedCount: 0, error: "Unknown error" };
                    try {
                        deleteResult = await handleDeleteData(message.criteria);
                        console.log("BG: Data deletion finished.", deleteResult);
                        await addExecutionLog("SYSTEM", "Data Deletion", `Deleted ${deleteResult.deletedCount} entries. Status: ${deleteResult.success ? 'Success' : 'Failed'}`);
                        browserAPI.runtime.sendMessage({ action: ACTION_DELETE_COMPLETE, success: deleteResult.success, deletedCount: deleteResult.deletedCount, error: deleteResult.error }).catch(e => console.warn("BG: Could not send delete completion message, UI likely closed.", e));
                    } catch (error) {
                        console.error("BG: Data deletion failed.", error);
                        deleteResult = { success: false, deletedCount: 0, error: error.message };
                        await addExecutionLog("SYSTEM", "Data Deletion", `Failed: ${error.message}`);
                        ErrorManager.logError("Data Deletion Message Handler Failed", { error: error.message }, SEVERITY.ERROR, CATEGORY.STORAGE);
                        browserAPI.runtime.sendMessage({ action: ACTION_DELETE_COMPLETE, success: false, error: error.message }).catch(e => console.warn("BG: Could not send delete error message, UI likely closed.", e));
                    } finally {
                        await setStateFlag(STATE_FLAGS.DATA_DELETION, false);
                    }
                    break;
                }
                case ACTION_CLEAR_ALL_DATA: {
                    console.log("BG: Received request to clear all data.");
                    await setStateFlag(STATE_FLAGS.DATA_DELETION, true);
                    try {
                        // Clear from IndexedDB (via StorageManager)
                        if (StorageManager.pako) {
                            await StorageManager.clearStorage([STORAGE_KEY_DATA, STORAGE_KEY_LOGS]);
                        }
                        // Always also clear from chrome.storage.local to prevent re-migration
                        await browserAPI.storage.local.remove([STORAGE_KEY_DATA, STORAGE_KEY_LOGS]);
                        console.log("BG: All report data and execution logs cleared from IndexedDB and chrome.storage.local.");
                        await addExecutionLog("SYSTEM", "Data Management", "Cleared All Data & Logs");
                        responsePayload = { status: STATUS_SUCCESS, message: "All report data and logs cleared." };
                        browserAPI.runtime.sendMessage({ action: ACTION_DATA_UPDATED, status: STATUS_SUCCESS, message: "All report data and logs cleared." }).catch(e => console.warn("BG: Could not send clear completion message.", e));
                    } catch (error) {
                        console.error("BG: Failed to clear all data/logs.", error);
                        ErrorManager.logError("Clear All Data Failed", { error: error.message }, SEVERITY.CRITICAL, CATEGORY.STORAGE);
                        responsePayload = { status: STATUS_ERROR, error: `Failed to clear data: ${error.message}` };
                    } finally {
                        await setStateFlag(STATE_FLAGS.DATA_DELETION, false);
                    }
                    break;
                }
                case ACTION_EXPORT_ALL_DATA: {
                    console.log("BG: Received request to export all data.");
                    try {
                        const backupResult = await DataBackupUtility.createBackup(
                            `Full_Data_Export_${new Date().toISOString().slice(0, 10)}`,
                            'Complete export of all extension data',
                            false,
                            null
                        );
                        if (!backupResult.success || !backupResult.backupId) {
                            throw new Error(backupResult.error || "Failed to prepare data for export.");
                        }
                        try {
                            const exportResult = await DataBackupUtility.exportBackup(backupResult.backupId);
                            if (!exportResult.success) {
                                throw new Error(exportResult.error || "Failed to trigger export download.");
                            }
                            console.log("BG: Full data export initiated.");
                            responsePayload = { status: STATUS_SUCCESS, message: `Full data export started (${exportResult.filename}).` };
                            browserAPI.runtime.sendMessage({ action: ACTION_DATA_UPDATED, status: STATUS_SUCCESS, message: `Full data export started (${exportResult.filename}).` }).catch(e => console.warn("BG: Could not send export success message.", e));
                        } finally {
                            await DataBackupUtility.deleteBackup(backupResult.backupId).catch(delErr => console.warn("Error deleting temporary backup entry after export attempt:", delErr));
                        }
                    } catch (error) {
                        console.error("BG: Full data export failed.", error);
                        ErrorManager.logError("Export All Data Failed", { error: error.message }, SEVERITY.ERROR, CATEGORY.STORAGE);
                        responsePayload = { status: STATUS_ERROR, error: `Export failed: ${error.message}` };
                    }
                    break;
                }
                case ACTION_IMPORT_ALL_DATA: {
                    console.log("BG: Received request to import data.");
                    const fileContent = message.data;
                    const filename = message.filename || 'imported_file.json';
                    if (!fileContent) throw new Error("Import failed: No data content provided.");
                    await setStateFlag(STATE_FLAGS.DATA_DELETION, true);
                    try {
                        const importResult = await DataBackupUtility.importBackup(fileContent, filename);
                        if (importResult.success) {
                            console.log("BG: Data import successful from background.");
                            await addExecutionLog("SYSTEM", "Data Management", `Imported Data from ${filename}`);
                            const successMsg = `Data imported successfully from ${filename}. ${importResult.message || ''}`;
                            responsePayload = { status: STATUS_SUCCESS, message: successMsg };
                            browserAPI.runtime.sendMessage({ action: ACTION_DATA_UPDATED, status: STATUS_SUCCESS, message: successMsg }).catch(e => console.warn("BG: Could not send import success message.", e));
                        } else {
                            console.error("BG: Data import failed (handled by utility). Error:", importResult.error);
                            throw new Error(importResult.error || "Data import failed.");
                        }
                    } catch (error) {
                        console.error("BG: Error during data import process.", error);
                        ErrorManager.logError("Import Data Failed", { filename: filename, error: error.message }, SEVERITY.ERROR, CATEGORY.STORAGE);
                        responsePayload = { status: STATUS_ERROR, error: `Import failed: ${error.message}` };
                    } finally {
                        await setStateFlag(STATE_FLAGS.DATA_DELETION, false);
                    }
                    break;
                }

                // --- Objective Import Handlers ---
                case ACTION_IMPORT_FROM_OBJECTIVE_URLS:
                    await startObjectiveImport(sender);
                    responsePayload = { status: STATUS_ACK_PROCESSING };
                    break;
                case ACTION_OBJECTIVE_SUBFOLDER_RESULT:
                    await handleObjectiveSubfolderResult(message, sender);
                    responsePayload = { handled: true };
                    break;
                case ACTION_PROCESS_SELECTED_FOLDER_TYPES:
                    await handleProcessSelectedFolderTypes(message, sender);
                    responsePayload = { status: STATUS_ACK_PROCESSING };
                    break;
                case ACTION_OBJECTIVE_MONTHLY_RESULT:
                    await handleObjectiveMonthlyResult(message, sender);
                    responsePayload = { handled: true };
                    break;
                case ACTION_OBJECTIVE_IMPORT_ERROR:
                    await handleObjectiveImportError(message, sender);
                    responsePayload = { handled: true };
                    break;
                // --- End Objective Import Handlers ---

                case ACTION_CSV_DETECTED:
                case 'scriptFailed':
                    if (typeof tabId === 'number') {
                        handleUrlProcessorMessage(message, sender);
                        responsePayload = { handled: true };
                    } else {
                        console.warn(`BG: Ignoring script message action "${action}" from non-tab sender.`);
                        responsePayload = { handled: true };
                    }
                    break;
                case ACTION_LOG_FROM_SCRIPT:
                    // Only log ERROR and CRITICAL levels, skip DEBUG, INFO, WARN
                    const logLevel = message.payload?.level?.toUpperCase() || 'INFO';
                    if (logLevel === 'ERROR' || logLevel === 'CRITICAL') {
                        console.log(`BG Log [${logLevel}] from ${senderContext}:`, message.payload?.message, ...(message.payload?.details || []));
                    }
                    responsePayload = { handled: true };
                    break;
                case ACTION_LOG_ERROR:
                    console.error(`BG Logged Error from ${senderContext}:`, message.error, message.context, message.severity);
                    ErrorManager.logError(message.error || "Unknown Error from UI/Script", message.context || {}, message.severity || SEVERITY.ERROR, message.category || CATEGORY.UI);
                    responsePayload = { handled: true };
                    break;
                case ACTION_GET_HOLIDAYS:
                    const holidays = await holidayService.getHolidays();
                    responsePayload = { holidays };
                    break;
                
                case 'verificationConfirmed': {
                    console.log("BG: Received verified data from user");
                    try {
                        const verifiedData = Array.isArray(message.data) ? message.data : [];
                        const weekInfo = message.weekInfo || {};
                        const targetYear = Number.isInteger(weekInfo.year) ? weekInfo.year : undefined;
                        // weekInfo.week is actually the 0-based month (configMonth) from index.js
                        // We convert it to 1-based for storage. Note: This is only used for logging,
                        // actual storage uses dates extracted from the data itself.
                        const targetMonth = Number.isInteger(weekInfo.week) ? weekInfo.week + 1 : undefined;
                        
                        console.log(`BG: Processing ${verifiedData.length} verified folders for month ${targetMonth ?? 'auto'} (${targetYear ?? 'auto'})`);
                        console.log(`BG: Week info received:`, weekInfo);
                        console.log(`BG: Converted to 1-based month: ${targetMonth}`);
                        
                        // Load force single count settings
                        let forceSingleCountFolders = [];
                        try {
                            const fsResult = await browserAPI.storage.local.get(['forceSingleCountFolders']);
                            forceSingleCountFolders = fsResult.forceSingleCountFolders || [];
                            console.log(`BG: Force single count folders:`, forceSingleCountFolders);
                        } catch (e) {
                            console.warn('BG: Could not load force single count settings:', e);
                        }
                        
                        let foldersSaved = 0;
                        
                        for (const folder of verifiedData) {
                            const folderName = folder?.folderName || 'Unknown Folder';
                            const folderKey = getDisplayNameForKey(folderName);
                            console.log(`BG: Processing folder: ${folderName} (key: ${folderKey})`);
                            
                            // Check if this folder should force single count
                            const shouldForceSingleCount = forceSingleCountFolders.some(f => 
                                folderName.includes(f) || folderKey.includes(f) || f.includes(folderKey)
                            );
                            if (shouldForceSingleCount) {
                                console.log(`BG: Folder "${folderName}" is configured to force count=1`);
                            }
                            
                            const folderPayload = {};
                            
                            (folder?.persons || []).forEach(person => {
                                const personName = person?.personName?.trim() || 'Unknown Person';
                                const rows = Array.isArray(person?.rows) ? person.rows : [];
                                
                                console.log(`BG: Processing ${rows.length} rows for person: ${personName}`);
                                
                                rows.forEach(row => {
                                    // Use pre-parsed isoDate if available, otherwise parse from dateText
                                    const isoDate = row?.isoDate || normalizeDateTextToIso(row?.dateText || '');
                                    let count = Number(row?.extractedCount);
                                    
                                    // Force count to 1 if this folder is configured for single count
                                    if (shouldForceSingleCount && count > 0) {
                                        console.log(`BG: Forcing count from ${count} to 1 for folder "${folderName}"`);
                                        count = 1;
                                    }
                                    
                                    console.log(`BG: Row - dateText: "${row?.dateText}", isoDate: "${isoDate}", extractedCount: ${row?.extractedCount}, finalCount: ${count}`);
                                    
                                    if (!isoDate || !Number.isFinite(count) || count < 0) {
                                        console.warn(`BG: Skipping invalid row - isoDate: ${isoDate}, count: ${count}`);
                                        return;
                                    }
                                    
                                    folderPayload[personName] = folderPayload[personName] || {};
                                    folderPayload[personName][isoDate] = (folderPayload[personName][isoDate] || 0) + count;
                                    console.log(`BG: Added ${count} to ${personName}[${isoDate}] = ${folderPayload[personName][isoDate]}`);
                                });
                                
                                if (!folderPayload[personName] || Object.keys(folderPayload[personName]).length === 0) {
                                    delete folderPayload[personName];
                                }
                            });
                            
                            if (Object.keys(folderPayload).length === 0) {
                                console.warn(`BG: Skipping folder \"${folderName}\" - no valid verified rows to store.`);
                                continue;
                            }
                            
                            console.log(`BG: Calling StorageManager.storeData with:`, {
                                folderPayload,
                                folderKey,
                                targetYear,
                                targetMonth
                            });
                            
                            await StorageManager.storeData(
                                folderPayload,
                                folderKey,
                                targetYear,
                                targetMonth
                            );
                            console.log(`BG: Successfully saved folder: ${folderName}`);
                            foldersSaved++;
                        }
                        
                        console.log(`BG: Verification complete. Saved ${foldersSaved} folders.`);
                        responsePayload = { status: 'success', message: `${foldersSaved} folders saved` };
                        
                        // Notify UI of data update
                        browserAPI.runtime.sendMessage({ 
                            action: ACTION_DATA_UPDATED, 
                            status: STATUS_SUCCESS 
                        }).catch(e => console.warn('BG: Could not send data updated message.', e));
                        
                    } catch (error) {
                        console.error('BG: Error processing verified data:', error);
                        ErrorManager.logError('Verification Save Failed', { error: error.message }, SEVERITY.ERROR, CATEGORY.STORAGE);
                        responsePayload = { status: 'error', error: error.message };
                    }
                    break;
                }
                
                // Actions that are just receiving status updates from UI or completion handlers
                case ACTION_REPORTS_GENERATED:
                case ACTION_DELETE_COMPLETE:
                case ACTION_DATA_UPDATED:
                case ACTION_PROCESSING_COMPLETE:
                case ACTION_OBJECTIVE_IMPORT_COMPLETE:
                case ACTION_PROMPT_FOLDER_TYPE_SELECTION:
                case ACTION_UPDATE_PROGRESS:
                    console.log(`BG: Action ${action} received, no specific response needed.`);
                    responsePayload = { handled: true };
                    break;
                
                default:
                    ErrorManager.logError("Unknown Background Action", { action: action, sender: senderContext }, SEVERITY.WARNING, CATEGORY.SYSTEM);
                    responsePayload = { status: STATUS_ERROR, error: `Unknown background action received: ${action}` };
                    break;
            }
        } catch (error) {
            console.error(`BG: Error processing action "${action}":`, error);
            // Reset relevant flags on error
            if (action === ACTION_RUN_SCRIPTS || action === ALARM_DAILY_FETCH) await setStateFlag(STATE_FLAGS.URL_PROCESSING, false);
            if (action === ACTION_GENERATE_REPORTS) await setStateFlag(STATE_FLAGS.REPORT_GENERATION, false);
            if ([ACTION_DELETE_DATA, ACTION_CLEAR_ALL_DATA, ACTION_IMPORT_ALL_DATA].includes(action)) await setStateFlag(STATE_FLAGS.DATA_DELETION, false);
            if ([ACTION_IMPORT_FROM_OBJECTIVE_URLS, ACTION_PROCESS_SELECTED_FOLDER_TYPES].includes(action)) await setStateFlag(STATE_FLAGS.OBJECTIVE_IMPORT, false);

            responsePayload = { status: STATUS_ERROR, error: error.message || "An unknown error occurred processing the action." };
            ErrorManager.logError(`Action Handler Failed: ${action}`, { error: error.message }, SEVERITY.ERROR, CATEGORY.SYSTEM);
        }

        // Send response only if not handled async and not explicitly marked as handled
        if (!handledAsync && !(responsePayload && responsePayload.handled)) {
            try {
                if (sendResponse) {
                    sendResponse(responsePayload);
                } else {
                    console.warn(`BG: sendResponse function not available for action "${action}"`);
                }
            } catch (e) {
                if (!e.message?.includes("Could not establish connection") && !e.message?.includes("Receiving end does not exist")) {
                    console.warn(`BG: Could not send response for action "${action}". Error: ${e.message}`);
                }
            }
        }
    })();

    // Return true to indicate you will respond asynchronously for relevant actions
    return [
        ACTION_RUN_SCRIPTS, ACTION_GENERATE_REPORTS, ACTION_DELETE_DATA, ACTION_CLEAR_ALL_DATA, ACTION_IMPORT_ALL_DATA,
        ACTION_GET_HOLIDAYS, ACTION_SET_LOGGING, ACTION_IMPORT_FROM_OBJECTIVE_URLS, ACTION_PROCESS_SELECTED_FOLDER_TYPES,
        ACTION_SET_DAILY_FETCH, ACTION_GET_DAILY_FETCH_STATUS, ACTION_TRIGGER_DAILY_FETCH, "verificationConfirmed"
    ].includes(message.action);
});

// Event Listeners
browserAPI.runtime.onInstalled.addListener(async (details) => {
    const manifest = browserAPI.runtime.getManifest();
    const manifestVersion = manifest?.version || 'unknown';
    originalConsole.log(`BG: Extension lifecycle event: ${details.reason} (v${manifestVersion})`);
    await addExecutionLog("SYSTEM", "Lifecycle", `Extension ${details.reason} (v${manifestVersion})`);
    if (details.reason === 'install' || details.reason === 'update') {
        originalConsole.log('BG: Install/Update detected, running initial setup...');
        try {
            await browserAPI.storage.session.clear();
            originalConsole.log("BG: Session storage cleared on install/update.");
            await VersionManager.initialize();
            await holidayService.initialize();
            await setupAllAlarms();
            await checkMissedAutoFetch();
        } catch (error) {
            originalConsole.error("BG: Error during install/update setup:", error);
            ErrorManager.logError("Install/Update Setup Failed", { reason: details.reason, error: error.message }, SEVERITY.CRITICAL, CATEGORY.SYSTEM);
        }
    }
    if (details.reason === 'install') {
        browserAPI.alarms.create(ALARM_DAILY_FETCH, { periodInMinutes: 24 * 60 });
        console.log("BG: Daily fetch alarm created on install.");
    }
    if (details.reason === 'update') {
        originalConsole.log(`BG: Updated from ${details.previousVersion} to ${manifestVersion}.`);
    }
});

browserAPI.runtime.onStartup.addListener(async () => {
    console.log("BG: onStartup event detected, setting up alarms...");
    await setupAllAlarms();
});

try {
    if (browserAPI.action?.onClicked) {
        browserAPI.action.onClicked.addListener(async (tab) => {
            console.log("BG: Action button clicked!");
            await openMainUI();
        });
        console.log("BG: Registered action.onClicked listener.");
    } else {
        console.warn("BG: Browser action API (chrome.action.onClicked) not available.");
        ErrorManager.logError("Action API Missing", {}, SEVERITY.CRITICAL, CATEGORY.SYSTEM);
    }
} catch (e) {
    console.error("BG: Failed to register action click listener:", e);
    ErrorManager.logError("Register Action Listener Failed", { error: e.message }, SEVERITY.CRITICAL, CATEGORY.SYSTEM);
}

browserAPI.runtime.onConnect.addListener((port) => {
    if (port.name?.startsWith('keepAlive')) {
        console.log(`BG Connect: Connection received from ${port.name}. Adding to active ports.`);
        ACTIVE_UI_PORTS.add(port);
        port.onDisconnect.addListener(() => {
            console.log(`BG Connect: Port ${port.name} disconnected.`);
            ACTIVE_UI_PORTS.delete(port);
            if (ACTIVE_UI_PORTS.size === 0) {
                console.log("BG Connect: Last UI port disconnected.");
            }
        });
        port.onMessage.addListener((msg) => {
            if (msg.type === 'ping') {
                try {
                    port.postMessage({ type: 'pong' });
                } catch (e) {
                    console.warn(`BG Connect: Failed to send pong to ${port.name}, removing port.`, e);
                    ACTIVE_UI_PORTS.delete(port);
                }
            } else {
                console.warn(`BG Connect: Received unknown message on keepAlive port ${port.name}:`, msg);
            }
        });
    } else {
        console.warn(`BG Connect: Received connection from unexpected port name: ${port.name}`);
    }
});

// Initial Setup Execution
(async () => {
    await initializeBackgroundScript();
    originalConsole.log("BG: background.js script loaded and top-level execution finished.");
})();