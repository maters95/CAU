// TEST/scripts/url-processor.js
// -----------------------------------------------------------------------------
// url-processor.js – v1.4  (coerce out‑of‑month dates → last day of run month)
// -----------------------------------------------------------------------------
//  ✧ CHANGELOG v1.4  (29‑Apr‑2025)
//    • Fix for “March run writes into April”
//         – any date that falls **after** the selected run month is coerced to
//           the **last calendar day** of the run month **before** we send the
//           payload to StorageManager.
//    • Keeps the 0‑based→1‑based month fix added in v1.3.
//    • No change to StorageManager signature – we again pass *only* the
//      expected two args (data, key).
// -----------------------------------------------------------------------------

'use strict';

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
import { getDisplayNameForKey, basicNormalize } from './utils.js';
import { ErrorManager, SEVERITY, CATEGORY } from './enhanced-error-manager.js';
import { StorageManager } from './storage-manager.js';
import {
  ACTION_UPDATE_PROGRESS,
  ACTION_PROCESSING_COMPLETE,
  ACTION_CSV_DETECTED,
  ACTION_LOG_ERROR,
  ACTION_LOG_FROM_SCRIPT,
  STORAGE_KEY_LOGS
} from './constants.js';

// ---------------------------------------------------------------------------
// Globals & small helpers
// ---------------------------------------------------------------------------
const delay                  = ms => new Promise(r => setTimeout(r, ms));
const PRE_INJECTION_DELAY_MS = 2000;

export let processingShouldStop = false;
export function stopProcessingFlag(v) { processingShouldStop = !!v; }

const activeTabPromises = new Map();
const browserAPI        = chrome;  // alias

function log(tab, step, msg = '', err = false) {
  const p = tab != null ? `   URLP [Tab ${tab}]` : '   URLP [No Tab]';
  (err ? console.error : console.log)(`${p} (${step}): ${msg}`);
}

// ---- execution‑log helper --------------------------------------------------
async function addExecutionLog(folder = 'SYSTEM', script = 'General', status = 'Log') {
  try {
    const timestamp = new Date().toISOString();
    const entry     = { timestamp, folder, script, status };

    return new Promise(resolve => {
      browserAPI.storage.local.get(STORAGE_KEY_LOGS, result => {
        let logs = [];
        if (result && STORAGE_KEY_LOGS in result && Array.isArray(result[STORAGE_KEY_LOGS])) {
          logs = result[STORAGE_KEY_LOGS];
        }
        logs.unshift(entry);
        if (logs.length > 500) logs = logs.slice(0, 500);
        browserAPI.storage.local.set({ [STORAGE_KEY_LOGS]: logs }, () => {
          if (browserAPI.runtime.lastError) {
            console.error(`Error saving execution log: ${browserAPI.runtime.lastError.message}`);
          }
          resolve();
        });
      });
    });
  } catch (e) {
    console.error('Error in addExecutionLog:', e);
  }
}

// ---- tab / scripting helpers ----------------------------------------------
async function createTab(url) {
  return new Promise((resolve, reject) => {
    browserAPI.tabs.create({ url, active: false }, tab => {
      if (browserAPI.runtime.lastError) reject(new Error(browserAPI.runtime.lastError.message));
      else if (!tab?.id)                reject(new Error('Tab creation returned invalid object.'));
      else resolve(tab);
    });
  });
}

async function waitForTabLoad(tabId, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    let elapsed = 0;
    const interval = 500;
    function check() {
      browserAPI.tabs.get(tabId, tab => {
        if (browserAPI.runtime.lastError)       reject(new Error(browserAPI.runtime.lastError.message));
        else if (tab.status === 'complete')      resolve();
        else if (elapsed >= timeoutMs)           reject(new Error(`Timeout loading tab ${tabId}`));
        else { elapsed += interval; setTimeout(check, interval); }
      });
    }
    check();
  });
}

async function activateTab(tabId) {
  await new Promise((resolve, reject) => {
    browserAPI.tabs.update(tabId, { active: true }, t => {
      if (browserAPI.runtime.lastError) reject(new Error(browserAPI.runtime.lastError.message));
      else resolve();
    });
  });
  try {
    const info = await browserAPI.tabs.get(tabId);
    if (info?.windowId) {
      browserAPI.windows.update(info.windowId, { focused: true });
    }
  } catch {}
}

async function executeScript(tabId, scriptFile) {
  return new Promise((resolve, reject) => {
    if (!browserAPI.scripting) return reject(new Error('Scripting API unavailable'));
    browserAPI.scripting.executeScript({ target: { tabId }, files: [scriptFile] }, res => {
      if (browserAPI.runtime.lastError) reject(new Error(browserAPI.runtime.lastError.message));
      else resolve(res);
    });
  });
}

async function closeTab(tabId) {
  return new Promise(resolve => {
    browserAPI.tabs.remove(tabId, () => resolve());
  });
}

// ---------------------------------------------------------------------------
// Utility: last day of a given month
// ---------------------------------------------------------------------------
function getLastDay(year, month1) {            // month1 = 1‑based
  return new Date(year, month1, 0).getDate();  // day 0 of next month
}

// ---------------------------------------------------------------------------
// processDataPayload  (adds month‑coercion before storing)
// ---------------------------------------------------------------------------
async function processDataPayload(
  rawFolderName,
  configYear,
  configMonth0,            // 0‑based
  dataPayload,
  sourceTabId = '?'
) {
  const displayName = getDisplayNameForKey(rawFolderName);
  log(sourceTabId, 'processDataPayload', `RAW:"${rawFolderName}" → Key:"${displayName}" (Run:${configYear}-${configMonth0 + 1})`);

  // derive final storage key -------------------------------------------------
  const folderKey = displayName && displayName !== 'Unknown Folder'
    ? displayName
    : basicNormalize(rawFolderName);

  if (!folderKey) {
    log(sourceTabId, 'processDataPayload', 'Skipping – could not derive a valid key', true);
    return;
  }

  // ---- month‑boundary coercion --------------------------------------------
  const runMonth1 = configMonth0 + 1;           // 1‑based
  const lastDay   = getLastDay(configYear, runMonth1);
  const canonical = `${configYear}-${String(runMonth1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

  const fixedPayload = {};

  Object.entries(dataPayload || {}).forEach(([person, datesObj]) => {
    fixedPayload[person] = fixedPayload[person] || {};

    Object.entries(datesObj || {}).forEach(([dateKey, count]) => {
      let targetDate = dateKey;
      const [y, m] = dateKey.split('-').map(Number);

      // If the year matches but the month drifts into the future, snap back
      if (y === configYear && m > runMonth1) {
        targetDate = canonical;
      }

      fixedPayload[person][targetDate] =
        (fixedPayload[person][targetDate] || 0) + (Number.isFinite(count) ? count : 0);
    });
  });

  await storeDataWithKey(
    folderKey,
    rawFolderName,
    configYear,
    configMonth0,
    fixedPayload,
    sourceTabId
  );
}

// ---------------------------------------------------------------------------
// storeDataWithKey  (unchanged except for log text)
// ---------------------------------------------------------------------------
async function storeDataWithKey(
  folderKeyToUse,
  rawFolderName,
  configYear,
  configMonth0,
  dataPayload,
  sourceTabId
) {
  if (
    typeof configYear !== 'number' ||
    typeof configMonth0 !== 'number' ||
    configMonth0 < 0 ||
    configMonth0 > 11
  ) {
    log(sourceTabId, 'storeDataWithKey', `Skipping: invalid year/month (Y=${configYear}, M=${configMonth0})`, true);
    return;
  }
  if (!dataPayload || typeof dataPayload !== 'object') {
    log(sourceTabId, 'storeDataWithKey', 'Skipping: invalid dataPayload', true);
    return;
  }
  try {
    await StorageManager.storeData(dataPayload, folderKeyToUse);
    log(sourceTabId, 'storeDataWithKey', `Stored under "${folderKeyToUse}" (raw:"${rawFolderName}")`);
  } catch (error) {
    log(sourceTabId, 'storeDataWithKey', `CRITICAL store error: ${error.message}`, true);
    ErrorManager.logError(
      'Process Payload Fail',
      { folderKey: folderKeyToUse, rawFolder: rawFolderName, error: error.message, stack: error.stack },
      SEVERITY.CRITICAL
    );
  }
}

// ---------------------------------------------------------------------------
// processUrls  •  full implementation (identical to v1.3 except internal logs)
// ---------------------------------------------------------------------------
async function processUrls(urls, rawFolderNames, scriptTypes, configYears, configMonths) {
  const total = urls.length;
  log(null, 'processUrls Start', `Starting ${total} URLs`);
  if (total === 0) return { total, successful: 0, results: [] };
  let successful = 0;
  const results = [];

  const sendProgress = (idx, url, status, folder) => {
    try {
      browserAPI.runtime.sendMessage({
        action: ACTION_UPDATE_PROGRESS,
        current: idx,
        total,
        successful,
        currentUrl: url,
        status,
        folderName: folder
      });
    } catch {}
  };

  for (let i = 0; i < total; i++) {
    if (processingShouldStop) { log(null, `Loop ${i + 1} Stop`, 'Processing stopped.'); break; }

    const url              = urls[i];
    const rawConfigFolder   = rawFolderNames[i];
    const type             = scriptTypes[i];
    const year             = configYears[i];
    const monthZeroBased   = configMonths[i];

    if (
      year == null || monthZeroBased == null ||
      typeof year !== 'number' ||
      typeof monthZeroBased !== 'number' ||
      monthZeroBased < 0 || monthZeroBased > 11
    ) {
      log(null, `Loop ${i + 1} Skip`, `Invalid configYear (${year}) or configMonth (${monthZeroBased}) for URL: ${url}`, true);
      results.push({ success: false, url, reason: 'Invalid run context year/month', configuredFolder: rawConfigFolder });
      sendProgress(i + 1, url, 'Skipped (Invalid Context)', rawConfigFolder);
      continue;
    }

    sendProgress(i + 1, url, 'Starting', rawConfigFolder);
    let tabId = null;

    try {
      const tab = await createTab(url); tabId = tab.id;
      await waitForTabLoad(tabId);
      
      // THE FIX: Re-enable activateTab to ensure the page is fully functional for scraping.
      await activateTab(tabId);
      
      await delay(PRE_INJECTION_DELAY_MS);

      const completion = new Promise((res, rej) => activeTabPromises.set(tabId, { resolve: res, reject: rej }));
      const scriptPath = `scripts/script${type}.js`;
      log(tabId, 'processUrls', `Executing script: ${scriptPath}`);
      await executeScript(tabId, scriptPath);
      const result = await completion; // wait for script message

      if (result.success && result.dataPayload) {
        successful++;
        const extractedRawFolderName = result.folderName || rawConfigFolder;
        await addExecutionLog(extractedRawFolderName, type, 'Success');
        await processDataPayload(extractedRawFolderName, year, monthZeroBased, result.dataPayload, tabId);
        results.push({ success: true, url, configuredFolder: rawConfigFolder, extractedFolder: extractedRawFolderName });
        sendProgress(i + 1, url, 'Success', extractedRawFolderName);
      } else {
        throw new Error(result.message || 'Script failed or returned no data');
      }
    } catch (e) {
      log(tabId, `Loop ${i + 1} Error`, `Processing failed for "${rawConfigFolder}": ${e.message}`, true);
      await addExecutionLog(rawConfigFolder, type, `Failed: ${e.message}`);
      results.push({ success: false, url, reason: e.message, configuredFolder: rawConfigFolder });
      sendProgress(i + 1, url, `Failed: ${e.message}`, rawConfigFolder);
      ErrorManager.logError('URL Processing Failed', { url, folder: rawConfigFolder, error: e.message, stack: e.stack }, SEVERITY.ERROR, CATEGORY.PROCESSING);
    } finally {
      if (tabId != null) {
        activeTabPromises.delete(tabId);
        try { await closeTab(tabId); } catch {}
      }
    }
  }

  log(null, 'processUrls End', `Finished. Success: ${successful}/${total}. Stopped: ${processingShouldStop}`);
  try {
    browserAPI.runtime.sendMessage({ action: ACTION_PROCESSING_COMPLETE, total, successful, results });
  } catch {}
  processingShouldStop = false;
  return { total, successful, results };
}

// ---------------------------------------------------------------------------
// handleScriptMessage  (kept identical to prior release)
// ---------------------------------------------------------------------------
function handleScriptMessage(msg, sender) {
  const tabId = sender?.tab?.id;
  if (typeof tabId !== 'number') {
    log(null, 'handleScriptMessage Error', `Ignoring message from sender without valid tab ID. Action: ${msg?.action}`, true);
    return;
  }
  if (msg.action !== ACTION_LOG_FROM_SCRIPT) {
    log(tabId, 'handleScriptMessage', `Received Action: ${msg?.action || 'N/A'} from Tab ${tabId}`);
  }
  try {
    const funcs = activeTabPromises.get(tabId);
    switch (msg.action) {
      case ACTION_LOG_ERROR:
        ErrorManager.logError(msg.error, { ...msg.context, tab: tabId }, msg.severity);
        if (msg.severity === ErrorManager.SEVERITY.CRITICAL && funcs?.reject) {
          funcs.reject(new Error(msg.error));
          activeTabPromises.delete(tabId);
        }
        break;
      case ACTION_CSV_DETECTED:
        if (funcs?.resolve) {
          funcs.resolve({ success: true, dataPayload: msg.dataPayload, folderName: msg.folderName });
          activeTabPromises.delete(tabId);
        } else {
          log(tabId, 'handleScriptMessage Warning', `Received CSV_DETECTED but no active promise found.`);
        }
        break;
      case 'scriptFailed':
        if (funcs?.reject) {
          funcs.reject(new Error(msg.message || 'Script reported failure'));
          activeTabPromises.delete(tabId);
        } else {
          log(tabId, 'handleScriptMessage Warning', `Received scriptFailed but no active promise found.`);
        }
        break;
      case ACTION_LOG_FROM_SCRIPT:
        log(tabId, 'ContentScript Log', msg.message);
        break;
      default:
        log(tabId, 'handleScriptMessage Info', `Received unhandled action: ${msg?.action}`);
        break;
    }
  } catch (handlerError) {
    log(tabId, 'handleScriptMessage Error', `Exception within handler: ${handlerError.message}`, true);
    try { const funcs = activeTabPromises.get(tabId); if (funcs?.reject) funcs.reject(new Error(`Error in message handler: ${handlerError.message}`)); } catch {}
    finally { activeTabPromises.delete(tabId); }
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export { processUrls, handleScriptMessage };