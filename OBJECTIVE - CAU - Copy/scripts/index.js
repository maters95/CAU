// index.js - Main UI (v1.4.2-compat - Removed storage health check)
'use strict';
// Constants
const ACTION_RUN_SCRIPTS = "runScripts";
const ACTION_UPDATE_PROGRESS = "updateProgress";
const ACTION_PROCESSING_COMPLETE = "processingComplete";
const STORAGE_KEY_FOLDERS_CONFIG = 'ecmFolders';
const STORAGE_KEY_LOGS = 'ecmExecutionLogs';
const STATUS_ACK_PROCESSING = "processing_acknowledged";
const STATUS_ERROR = 'error';

document.addEventListener("DOMContentLoaded", () => {
    console.log("Index.js (v1.4.2-compat): DOMContentLoaded event fired.");

    // --- DOM Elements ---
    const yearDropdown = document.getElementById("yearDropdown");
    const monthDropdown = document.getElementById("monthDropdown");
    const folderContainer = document.getElementById("folderContainer");
    const selectAllCheckbox = document.getElementById("selectAllCheckbox");
    const runButton = document.getElementById("runButton");
    const backButton = document.getElementById("backButton");
    const logOutput = document.getElementById("logOutput");
    const spinnerOverlay = document.getElementById("spinnerOverlay");
    const progressInfo = document.getElementById("progressInfo");
    const spinnerMainText = spinnerOverlay?.querySelector('.spinner-text');

    const browserAPI = (typeof chrome !== 'undefined' && chrome.runtime) ? chrome : null;
    let keepAlivePort = null; // Added for keep-alive

    // --- Populate Year Dropdown Dynamically ---
    function populateYearDropdown() {
        if (!yearDropdown) return;
        const currentYear = new Date().getFullYear();
        const startYear = currentYear - 2; // e.g., 2023 if current is 2025
        const endYear = currentYear + 5;   // e.g., 2030 if current is 2025

        yearDropdown.innerHTML = '<option value="" disabled>Select Year</option>'; // Clear existing options

        for (let year = endYear; year >= startYear; year--) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearDropdown.appendChild(option);
        }
        console.log(`Index.js: Populated years from ${startYear} to ${endYear}`);
    }


    // --- Initialization ---
    function initialize() {
        console.log("Index.js: Initializing...");
        if (!browserAPI) {
            logError("CRITICAL: Chrome API not available.");
            [yearDropdown, monthDropdown, selectAllCheckbox, runButton, backButton].forEach(el => el && (el.disabled = true));
            return;
         }

        // Establish keep-alive connection
        try {
             console.log("Index.js: Attempting to establish keep-alive connection...");
             keepAlivePort = browserAPI.runtime.connect({ name: "keepAliveIndexUI" });
             keepAlivePort.onDisconnect.addListener(() => { console.warn("Index.js: Keep-alive port disconnected."); logError("Warning: Communication channel closed."); keepAlivePort = null; });
             console.log("Index.js: Keep-alive port established.", keepAlivePort);
        } catch (e) { console.error("Index.js: Failed to create keep-alive port:", e); logError("Error initializing communication channel."); }


        if (spinnerOverlay) spinnerOverlay.style.display = 'none';

        populateYearDropdown(); // Populate years dynamically first
        setCurrentDateDefaults(); // Then set defaults AFTER population
        renderFolders(); // Then render folders based on defaults
        addEventListeners(); // Then attach listeners
        // FIX: Removed call to checkStorageHealth()
        logMessage("Select folders above and click 'Fetch Stats' to begin processing.");
        console.log("Index.js: Initialization complete.");
    }

    // --- UI Logic ---
// Set default date (current month) AFTER dropdowns are populated
function setCurrentDateDefaults() {
     try {
        if (!yearDropdown || !monthDropdown) return;
        const now = new Date();
        const defaultYear = now.getFullYear();
        const defaultMonth = now.getMonth() + 1; // getMonth() returns 0-11, so add 1
        console.log(`Index.js: Setting default date to Current Month: ${defaultYear}-${String(defaultMonth).padStart(2,'0')}`);

        // Select year
        if (Array.from(yearDropdown.options).some(opt => opt.value == defaultYear)) {
            yearDropdown.value = defaultYear;
        } else if (yearDropdown.options.length > 1) { // Check if options populated
             yearDropdown.selectedIndex = 1; // Select first actual year
        }

        // Select month
        monthDropdown.value = String(defaultMonth);

    } catch(e) { console.error("Index.js: Error in setCurrentDateDefaults:", e); logError("Failed to set default date."); }
}

    // Get month name utility
    function getMonthName(monthNumber) {
        const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return months[parseInt(monthNumber)] || '';
    }

     // Function to render folders based on selected date
     function renderFolders() {
        console.log("Index.js: renderFolders START");
        if (!folderContainer || !yearDropdown || !monthDropdown || !browserAPI) return;
        folderContainer.innerHTML = "<p>Loading folders...</p>";
        try {
            const selectedYear = parseInt(yearDropdown.value);
            const selectedMonth = parseInt(monthDropdown.value);
            if (isNaN(selectedYear) || isNaN(selectedMonth)) {
                logError("Invalid date selected.");
                folderContainer.innerHTML = "<p class='error'>Invalid date selected.</p>";
                if (selectAllCheckbox) selectAllCheckbox.disabled = true;
                if (runButton) runButton.disabled = true;
                return;
            }
            console.log(`Index.js: renderFolders filtering for ${selectedYear}-${selectedMonth}`);

            browserAPI.storage.local.get(STORAGE_KEY_FOLDERS_CONFIG, (result) => {
                if (browserAPI.runtime.lastError) { logError(`Storage Error: ${browserAPI.runtime.lastError.message}`); folderContainer.innerHTML = "<p class='error'>Error loading.</p>"; return; }
                const folders = result[STORAGE_KEY_FOLDERS_CONFIG] || [];
                let parsedFolders = [];
                 if (folders && typeof folders === 'string') { try { parsedFolders = JSON.parse(folders); if (!Array.isArray(parsedFolders)) parsedFolders = []; } catch (e) { logError(`Error parsing stored folder config: ${e.message}`); parsedFolders = []; } }
                 else if (Array.isArray(folders)) { parsedFolders = folders; }

                console.log(`Index.js: renderFolders parsed ${parsedFolders.length} configs.`);
                const filteredFolders = parsedFolders.filter(f => f && f.year === selectedYear && f.month === selectedMonth);
                console.log(`Index.js: renderFolders filtered to ${filteredFolders.length} configs.`);

                if (filteredFolders.length === 0) {
                     folderContainer.innerHTML = `<p>No folders configured for ${getMonthName(selectedMonth)} ${selectedYear}. Go to 'Configure Folders' to add some.</p>`;
                     if (selectAllCheckbox) { selectAllCheckbox.checked = false; selectAllCheckbox.disabled = true; }
                     if (runButton) runButton.disabled = true;
                     return;
                }

                folderContainer.innerHTML = "";
                const fragment = document.createDocumentFragment();
                // Sort folders alphabetically before rendering
                filteredFolders.sort((a, b) => {
                    const nameA = String(a.name || '').toLowerCase().replace(/^\d{4}\s*-\s*/, '').replace(/^\d{4}\s+/, '');
                    const nameB = String(b.name || '').toLowerCase().replace(/^\d{4}\s*-\s*/, '').replace(/^\d{4}\s+/, '');
                    return nameA.localeCompare(nameB);
                });
                filteredFolders.forEach((folder, index) => { fragment.appendChild(createFolderElement(folder, index)); });
                folderContainer.appendChild(fragment);
                if (selectAllCheckbox) selectAllCheckbox.disabled = false;
                if (runButton) runButton.disabled = false;
                updateSelectAllState();
            });
        } catch (e) { logError(`Render Error: ${e.message}`); console.error("Render folders error:", e); folderContainer.innerHTML = "<p class='error'>Error displaying.</p>"; }
        console.log("Index.js: renderFolders END");
    }

    // Function to create a folder element for the list
    function createFolderElement(folder, index) {
        const wrapper = document.createElement("div"); wrapper.className = "folder-wrapper";
        const mainCheckbox = document.createElement("input"); mainCheckbox.type = "checkbox"; mainCheckbox.className = "folder-main-checkbox"; mainCheckbox.id = `folder-main-${index}`; mainCheckbox.checked = true; mainCheckbox.dataset.folderIndex = index;
        const header = document.createElement("div"); header.className = "folder-header"; let displayName = folder.name || 'Unnamed Folder'; if (String(displayName).startsWith(folder.year + " ")) { displayName = displayName.substring((folder.year + " ").length); } header.innerHTML = `<strong>${displayName}</strong> <span class="script-badge">(Script ${folder.script || 'A'})</span>`;
        wrapper.appendChild(mainCheckbox); wrapper.appendChild(header);
        const urls = Array.isArray(folder.urls) ? folder.urls : (folder.url ? [folder.url] : []);
        urls.forEach((url, urlIndex) => {
            if (url?.trim()) {
                const urlCheckbox = document.createElement("input"); urlCheckbox.type = "checkbox"; urlCheckbox.style.display = "none"; urlCheckbox.className = "url-checkbox"; urlCheckbox.dataset.url = url; urlCheckbox.dataset.name = folder.name; urlCheckbox.dataset.script = folder.script; urlCheckbox.dataset.folderIndex = index; urlCheckbox.checked = true;
                wrapper.appendChild(urlCheckbox);
            }
        });
        mainCheckbox.addEventListener("change", () => { const isChecked = mainCheckbox.checked; wrapper.querySelectorAll(".url-checkbox").forEach(urlCb => { urlCb.checked = isChecked; }); updateSelectAllState(); });
        return wrapper;
    }

    // Function to update the state of the "Select All" checkbox
    function updateSelectAllState() {
        if (!selectAllCheckbox || !folderContainer) return;
        const mainCheckboxes = folderContainer.querySelectorAll(".folder-main-checkbox");
        if (mainCheckboxes.length === 0) { selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = false; selectAllCheckbox.disabled = true; return; }
        selectAllCheckbox.disabled = false;
        const allChecked = Array.from(mainCheckboxes).every(cb => cb.checked);
        const someChecked = Array.from(mainCheckboxes).some(cb => cb.checked);
        selectAllCheckbox.checked = allChecked;
        selectAllCheckbox.indeterminate = !allChecked && someChecked;
    }

    // Function to log messages to the UI
    function logMessage(message, isError = false) {
        if (logOutput) { logOutput.textContent = message; logOutput.style.color = isError ? '#cc0000' : '#003366'; logOutput.style.borderColor = isError ? '#cc0000' : '#003366'; logOutput.style.backgroundColor = isError ? '#fdd' : '#f1f1f1'; }
        if (isError) console.error("UI Log:", message); else console.log("UI Log:", message);
    }
    function logError(message) { logMessage(message, true); }

    // Function to add event listeners
    function addEventListeners() {
        console.log("Index.js: addEventListeners START");
        if (!browserAPI) return;
        if (yearDropdown) yearDropdown.addEventListener("change", renderFolders);
        if (monthDropdown) monthDropdown.addEventListener("change", renderFolders);
        if (selectAllCheckbox) { selectAllCheckbox.addEventListener("change", () => { const isChecked = selectAllCheckbox.checked; folderContainer?.querySelectorAll(".folder-main-checkbox").forEach(cb => { if (cb.checked !== isChecked) { cb.checked = isChecked; cb.dispatchEvent(new Event("change")); } }); selectAllCheckbox.indeterminate = false; }); }
        if (folderContainer) { folderContainer.addEventListener('change', (event) => { if (event.target.matches('.folder-main-checkbox')) { updateSelectAllState(); } }); }
        if (runButton) { runButton.addEventListener("click", handleRunButtonClick); }
        if (backButton) backButton.addEventListener("click", () => { window.location.href = "main.html"; });
        if (browserAPI.runtime?.onMessage) {
             browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.action === ACTION_UPDATE_PROGRESS) { handleProgressUpdate(message); }
                else if (message.action === ACTION_PROCESSING_COMPLETE) { handleProcessingComplete(message); }
                return false; // Indicate synchronous handling for these specific messages
             });
        } else { console.error("Index.js: browserAPI.runtime.onMessage not available!"); logError("Error setting up message listener.") }
         console.log("Index.js: addEventListeners END");
    }

    // Function to handle the "Fetch Stats" button click
    function handleRunButtonClick() {
        console.log("Index.js: handleRunButtonClick START");
        if (!browserAPI || !keepAlivePort) { logError("Communication channel inactive."); console.error("Aborting, keepAlivePort is null."); return; }
        if (!yearDropdown || !monthDropdown) { logError("Date dropdowns not found."); return; }

        try {
            const checkedUrlCbs = folderContainer?.querySelectorAll(".url-checkbox:checked");
            if (!checkedUrlCbs || checkedUrlCbs.length === 0) { logMessage("⚠️ No folders/URLs selected.", true); return; }
            const urlsToProcess = [], folderNamesToProcess = [], scriptTypesToProcess = [];
            checkedUrlCbs.forEach(cb => { const url = cb.dataset.url?.trim(); if (url) { urlsToProcess.push(url); folderNamesToProcess.push(cb.dataset.name || "?"); scriptTypesToProcess.push(cb.dataset.script || "A"); } });
            if (urlsToProcess.length === 0) { logMessage("⚠️ No valid URLs selected.", true); return; }

            const selectedConfigYear = parseInt(yearDropdown.value); const selectedConfigMonth = parseInt(monthDropdown.value);
            if (isNaN(selectedConfigYear) || isNaN(selectedConfigMonth)) { logError("Invalid Run Year/Month selected."); return; }

            logMessage(`🔄 Starting processing for ${urlsToProcess.length} URLs (Run: ${selectedConfigYear}-${selectedConfigMonth})...`);
            console.log("URLs:", urlsToProcess); console.log("Names:", folderNamesToProcess); console.log("Scripts:", scriptTypesToProcess);
            if (spinnerOverlay) spinnerOverlay.style.display = "flex"; if (spinnerMainText) spinnerMainText.textContent = "Initiating processing..."; if (progressInfo) progressInfo.textContent = "Preparing..."; if (runButton) runButton.disabled = true;

            const messagePayload = { action: ACTION_RUN_SCRIPTS, urls: urlsToProcess, folderNames: folderNamesToProcess, scriptTypes: scriptTypesToProcess, configYear: selectedConfigYear, configMonth: selectedConfigMonth - 1 };
            console.log("Index.js: >>> Sending ACTION_RUN_SCRIPTS message:", messagePayload);
            browserAPI.runtime.sendMessage(messagePayload, (response) => {
                console.log("Index.js: sendMessage callback executed. Response:", response);
                // Handle response from background script if needed (e.g., immediate errors)
                if (chrome.runtime.lastError) { console.error("sendMessage failed(lastError):", chrome.runtime.lastError.message); logError(`Error: ${chrome.runtime.lastError.message}`); if(spinnerOverlay) spinnerOverlay.style.display="none"; if(runButton) runButton.disabled=false;}
                else if (response?.status === STATUS_ERROR) { console.error("BG error:", response.error); logError(`Error: ${response.error}`); if(spinnerOverlay) spinnerOverlay.style.display="none"; if(runButton) runButton.disabled=false;}
                else if (response?.status !== STATUS_ACK_PROCESSING) { console.warn("BG ack incorrect:", response); logError(`Warning: Unexpected response from background.`); /* Still processing */ }
                else { logMessage("🔄 Processing acknowledged by background script..."); }
            });
        } catch (e) { logError(`Error initiating run: ${e.message}`); console.error("Run btn error:", e); if(spinnerOverlay) spinnerOverlay.style.display="none"; if(runButton) runButton.disabled=false; }
        console.log("Index.js: handleRunButtonClick END");
    }

    // Function to handle progress updates from background
    function handleProgressUpdate(message) {
        try { if (spinnerOverlay) spinnerOverlay.style.display = "flex"; const folderDisplay = message.folderName || `URL ${message.current}`; const percentage = message.total > 0 ? Math.round((message.current / message.total) * 100) : 0; if (spinnerMainText) spinnerMainText.textContent = `Processing: ${folderDisplay}`; if (progressInfo) progressInfo.textContent = `${percentage}% complete (${message.successful} successful of ${message.total})`; }
        catch (e) { console.error("Error updating progress UI:", e); }
    }

    // Function to handle processing completion from background
    function handleProcessingComplete(message) {
        console.log("Processing complete message received:", message);
        if (spinnerOverlay) spinnerOverlay.style.display = "none"; if (runButton) runButton.disabled = false;
        const failures = message.total - message.successful;
        if (message.error) { logMessage(`❌ ERROR: ${message.error}. ${message.successful}/${message.total} succeeded before error.`, true); }
        else if (failures > 0) { logMessage(`⚠️ Complete! ${message.successful}/${message.total} succeeded (${failures} failed - check Logs).`, true); if (message.results) { console.warn("Failed items:", message.results.filter(r => !r.success)); } }
        else { logMessage(`✅ Complete! All ${message.total} succeeded.`); }
    }

    // FIX: Removed the checkStorageHealth function definition

    // --- Initialize ---
    initialize();

    // Disconnect port on unload
    window.addEventListener('beforeunload', () => { if (keepAlivePort) { console.log("Index.js: Disconnecting keep-alive port on unload."); keepAlivePort.disconnect(); keepAlivePort = null; } });
});