// TEST-works/scripts/settings.js (v2.6 - Reverted to direct chrome.storage, UI stability)
document.addEventListener("DOMContentLoaded", () => {
  // --- Element References ---
  const nameInput = document.getElementById("folderName");
  const urlInput1 = document.getElementById("folderURL1");
  const urlInput2 = document.getElementById("folderURL2");
  const urlInput3 = document.getElementById("folderURL3");
  const scriptSelect = document.getElementById("scriptType");
  const yearSelect = document.getElementById("folderYear");
  const monthSelect = document.getElementById("folderMonth");
  const saveButton = document.getElementById("saveFolder");
  const backButton = document.getElementById("backButton");
  const folderList = document.getElementById("folderList");
  const exportConfigBtn = document.getElementById("exportConfigBtn");
  const importConfigBtn = document.getElementById("importConfigBtn");
  const importConfigInput = document.getElementById("importConfigInput");
  const toggleAdditionalUrlsBtn = document.getElementById("toggleAdditionalUrls");
  const additionalUrlFields = document.getElementById("additionalUrlFields");
  const filterYearSelect = document.getElementById("filterYear");
  const filterMonthSelect = document.getElementById("filterMonth");
  const importObjectiveBtn = document.getElementById("importObjectiveBtn");
  const deleteAllConfigsBtn = document.getElementById("deleteAllConfigsBtn");

  // Email Mapping UI Elements
  const emailElements = {
    addNewEmailMappingBtn: document.getElementById('addNewEmailMappingBtn'),
    emailMappingsList: document.getElementById('emailMappingsList'),
    emailSearchInput: document.getElementById('emailSearchInput'),
    emailMappingDialog: document.getElementById('emailMappingDialog'),
    emailMappingDialogTitle: document.getElementById('emailMappingDialogTitle'),
    emailMappingName: document.getElementById('emailMappingName'),
    emailMappingEmail: document.getElementById('emailMappingEmail'),
    emailMappingCC: document.getElementById('emailMappingCC'),
    nameMatchesList: document.getElementById('nameMatchesList'),
    closeEmailDialogBtn: document.getElementById('closeEmailDialogBtn'),
    cancelEmailDialogBtn: document.getElementById('cancelEmailDialogBtn'),
    saveEmailMappingBtn: document.getElementById('saveEmailMappingBtn'),
    exportEmailMappingsBtn: document.getElementById('exportEmailMappingsBtn'),
    importEmailMappingsBtn: document.getElementById('importEmailMappingsBtn'),
    importEmailMappingsInput: document.getElementById('importEmailMappingsInput')
  };

  let folderTypeSelectionModal = document.getElementById('folderTypeSelectionModal');
  if (!folderTypeSelectionModal) {
      folderTypeSelectionModal = document.createElement('div');
      folderTypeSelectionModal.id = 'folderTypeSelectionModal';
      Object.assign(folderTypeSelectionModal.style, {
          display: 'none', position: 'fixed', zIndex: '10000',
          left: '0', top: '0', width: '100%', height: '100%',
          overflow: 'auto', backgroundColor: 'rgba(0,0,0,0.6)'
      });
      folderTypeSelectionModal.innerHTML = `
        <div class="modal-content" style="background-color: var(--card-bg, #fefefe); color: var(--text, #000); margin: 10% auto; padding: 25px; border: 1px solid var(--border, #888); width: 80%; max-width: 700px; border-radius: 8px; box-shadow: 0 4px 8px var(--shadow, rgba(0,0,0,0.2));">
          <h2>Select Objective Folder Types</h2>
          <p>Review the folders found. Select the ones you want to import monthly configurations for.</p>
          <div id="folderTypeChecklist" style="margin-bottom: 20px; max-height: 45vh; overflow-y: auto; border: 1px solid var(--input-border, #ddd); padding: 15px; background-color: var(--highlight, #f9f9f9); border-radius: 5px;">
             <i>Scanning Objective pages...</i>
          </div>
          <div style="margin-bottom: 15px;">
             <button id="selectAllFolderTypesBtn" class="btn btn-sm secondary" style="padding: 5px 10px; font-size: 0.8em; cursor: pointer; margin-right: 5px; background-color: var(--button-secondary-bg, #e0e0e0); color: var(--button-secondary-text, #000); border: 1px solid var(--button-border, #ccc); border-radius: 3px;">Select All</button>
             <button id="deselectAllFolderTypesBtn" class="btn btn-sm secondary" style="padding: 5px 10px; font-size: 0.8em; cursor: pointer; background-color: var(--button-secondary-bg, #e0e0e0); color: var(--button-secondary-text, #000); border: 1px solid var(--button-border, #ccc); border-radius: 3px;">Deselect All</button>
          </div>
          <div>
             <button id="confirmFolderTypeImportBtn" class="btn success" style="padding: 10px 20px; background-color: var(--button-success-bg, #28a745); color: var(--button-text, white); border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">Import Selected Folders</button>
             <button id="cancelFolderTypeImportBtn" class="btn secondary" style="padding: 10px 20px; background-color: var(--button-secondary-bg, #6c757d); color: var(--button-text, white); border: none; border-radius: 5px; cursor: pointer;">Cancel</button>
          </div>
          <div id="folderTypeImportStatus" style="margin-top: 15px; font-style: italic; color: var(--secondary-text, #555);"></div>
        </div>`;
      document.body.appendChild(folderTypeSelectionModal);
      console.log("Settings.js: Created folder type selection modal dynamically.");
  }

  const folderTypeChecklist = document.getElementById('folderTypeChecklist');
  const confirmFolderTypeImportBtn = document.getElementById('confirmFolderTypeImportBtn');
  const cancelFolderTypeImportBtn = document.getElementById('cancelFolderTypeImportBtn');
  const folderTypeImportStatus = document.getElementById('folderTypeImportStatus');
  const selectAllFolderTypesBtn = document.getElementById('selectAllFolderTypesBtn');
  const deselectAllFolderTypesBtn = document.getElementById('deselectAllFolderTypesBtn');
  
  const browserAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
  const FOLDER_CONFIG_KEY = 'ecmFolders'; 
  const EMAIL_MAPPINGS_KEY = 'ecmEmailMappings';

  // Email management variables
  let emailMappings = {};
  let currentPersons = [];
  let editingEmailId = null;

  function populateYearDropdowns() { 
      console.log("Populating year dropdowns..."); 
      if (!yearSelect || !filterYearSelect) return; 
      const currentYear = new Date().getFullYear(); 
      const startYear = currentYear - 2; 
      const endYear = currentYear + 5;   
      yearSelect.innerHTML = '<option value="" disabled selected>Select Year</option>'; 
      filterYearSelect.innerHTML = '<option value="all">All Years</option>'; 
      for (let year = endYear; year >= startYear; year--) { 
          const option = document.createElement('option'); option.value = year; option.textContent = year; 
          yearSelect.appendChild(option.cloneNode(true)); filterYearSelect.appendChild(option.cloneNode(true)); 
      } 
      console.log(`Settings.js: Populated years from ${startYear} to ${endYear}`); 
  }

  if(toggleAdditionalUrlsBtn && additionalUrlFields) {
      toggleAdditionalUrlsBtn.addEventListener("click", () => { 
          const isHidden = additionalUrlFields.style.display === "none" || !additionalUrlFields.style.display; 
          additionalUrlFields.style.display = isHidden ? "block" : "none"; 
          toggleAdditionalUrlsBtn.textContent = isHidden ? "- Hide Additional URLs" : "+ Add Additional URLs"; 
      });
  }

  function setFilterDateDefaults() { 
      console.log("Setting filter date defaults..."); 
      if (!filterYearSelect || !filterMonthSelect) return; 
      const currentYear = new Date().getFullYear(); 
      if (Array.from(filterYearSelect.options).some(opt => opt.value == currentYear)) { filterYearSelect.value = currentYear; } 
      else { filterYearSelect.value = "all"; } 
      filterMonthSelect.value = "all"; 
  }

  function setCurrentDateDefaults() { 
      console.log("Setting form date defaults..."); 
      if (!yearSelect || !monthSelect) return; 
      const currentYear = new Date().getFullYear(); const currentMonth = new Date().getMonth() + 1; 
      if (Array.from(yearSelect.options).some(opt => opt.value == currentYear)) { yearSelect.value = currentYear; } 
      else if (yearSelect.options.length > 1) { yearSelect.selectedIndex = 1; } 
      monthSelect.value = currentMonth.toString(); 
  }
  function getMonthName(monthNumber) { const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; return months[parseInt(monthNumber)] || ''; }
  
  function deleteFolder(originalIndex) {
    if (!browserAPI || !browserAPI.storage || !browserAPI.storage.local) { 
        alert("Storage API not available."); return; 
    }
    browserAPI.storage.local.get([FOLDER_CONFIG_KEY], (result) => {
        if (browserAPI.runtime.lastError) {
            alert(`Error accessing storage: ${browserAPI.runtime.lastError.message}`);
            return;
        }
        let folders = result[FOLDER_CONFIG_KEY] || [];
        if (originalIndex >= 0 && originalIndex < folders.length) {
            folders.splice(originalIndex, 1);
            browserAPI.storage.local.set({ [FOLDER_CONFIG_KEY]: folders }, () => {
                if (browserAPI.runtime.lastError) {
                    alert(`Error saving configuration: ${browserAPI.runtime.lastError.message}`);
                } else {
                    renderFolderList();
                }
            });
        } else {
            alert("Error: Could not delete selected folder (invalid index).");
        }
    });
  }
  
  function renderFolderList() {
    console.log("Settings.js renderFolderList called...");
    if (!folderList || !browserAPI || !browserAPI.storage || !browserAPI.storage.local) {
        console.error("renderFolderList: Prerequisites not met (folderList or browserAPI.storage.local).");
        if(folderList) folderList.innerHTML = '<div style="text-align: center; color: red;"><p>Error: Storage API not available to display folders.</p></div>';
        return;
    }
    folderList.innerHTML = '<div style="text-align: center;"><p>Loading folders...</p></div>';
    
    browserAPI.storage.local.get([FOLDER_CONFIG_KEY], (result) => {
        if (browserAPI.runtime.lastError) {
            console.error("Error loading folder config for rendering:", browserAPI.runtime.lastError);
            folderList.innerHTML = `<div style="text-align: center; color: red;"><p>Error loading folder configuration: ${browserAPI.runtime.lastError.message}</p></div>`;
            return;
        }
        
        const folders = result[FOLDER_CONFIG_KEY] || []; 
        console.log(`Settings.js renderFolderList: Loaded ${folders.length} folder configs.`);

        if (folders.length === 0) {
            folderList.innerHTML = '<div style="text-align: center;"><p>No folders configured yet.</p></div>';
            return;
        }

        const filterYearValue = filterYearSelect ? filterYearSelect.value : 'all';
        const filterMonthValue = filterMonthSelect ? filterMonthSelect.value : 'all';

        const foldersWithOriginalIndices = folders.map((folder, index) => ({ ...folder, originalIndex: index }));

        const filteredFoldersWithIndices = foldersWithOriginalIndices.filter(folder => {
            if (!folder || typeof folder.year !== 'number' || typeof folder.month !== 'number') return false;
            if (filterYearValue !== 'all' && folder.year !== parseInt(filterYearValue)) return false;
            if (filterMonthValue !== 'all' && folder.month !== parseInt(filterMonthValue)) return false;
            return true;
        });

        if (filteredFoldersWithIndices.length === 0) {
            folderList.innerHTML = '<div style="text-align: center;"><p>No folders match the selected filters.</p></div>';
            return;
        }

        filteredFoldersWithIndices.sort((a, b) => {
            const nameA = String(a.name || '').toLowerCase().replace(/^\d{4}\s*-\s*/, '').replace(/^\d{4}\s+/, '');
            const nameB = String(b.name || '').toLowerCase().replace(/^\d{4}\s*-\s*/, '').replace(/^\d{4}\s+/, '');
            return nameA.localeCompare(nameB);
        });

        folderList.innerHTML = "";
        filteredFoldersWithIndices.forEach((folder) => {
            const originalIndex = folder.originalIndex;
            const folderItem = document.createElement("div");
            folderItem.className = "folder-item";
            const urls = folder.urls || (folder.url ? [folder.url] : []); 
            const urlCount = urls.filter(url => url && url.trim()).length;
            let displayName = folder.name || 'Unnamed Folder';
            if (folder.year && typeof folder.year === 'number' && String(displayName).startsWith(folder.year + " ")) {
                displayName = displayName.substring((folder.year + " ").length);
            }
            const folderInfo = document.createElement("span");
            folderInfo.textContent = `${displayName} | Script ${folder.script} | ${urlCount} URL${urlCount !== 1 ? 's' : ''}`;
            folderInfo.title = `Full Config Name: ${folder.name}\nYear: ${folder.year}, Month: ${getMonthName(folder.month)}\nURLs:\n${urls.join('\n')}`;
            const deleteButton = document.createElement("button");
            deleteButton.textContent = "Delete";
            // --- AMENDMENT START ---
            // Apply standardized classes for consistent styling from base.css
            deleteButton.className = "btn danger btn-sm";
            // --- AMENDMENT END ---
            deleteButton.dataset.index = originalIndex; // Store original index for deletion
            deleteButton.addEventListener("click", function() {
                const indexToDelete = parseInt(this.dataset.index);
                if (!isNaN(indexToDelete) && indexToDelete >= 0) {
                    deleteFolder(indexToDelete);
                } else { 
                    console.error("Invalid index for deletion:", this.dataset.index); 
                    alert("Error: Could not delete."); 
                }
            });
            folderItem.appendChild(folderInfo);
            folderItem.appendChild(deleteButton);
            folderList.appendChild(folderItem);
        });
        console.log("renderFolderList: Finished rendering.");
    });
  }

  if(saveButton) {
      saveButton.addEventListener("click", () => {
          const name = nameInput.value.trim();
          const url1 = urlInput1.value.trim();
          const url2 = urlInput2.value.trim();
          const url3 = urlInput3.value.trim();
          const script = scriptSelect.value;
          const year = parseInt(yearSelect.value);
          const month = parseInt(monthSelect.value);

          if (!name || !url1) { alert("Please enter folder name and primary URL."); return; }
          if (isNaN(year) || isNaN(month) || year < 2000 || month < 1 || month > 12 ) { alert("Please select a valid Year and Month."); return; }
          
          browserAPI.storage.local.get([FOLDER_CONFIG_KEY], (result) => {
              if (browserAPI.runtime.lastError) { alert("Error getting existing folders: " + browserAPI.runtime.lastError.message); return; }
              let folders = result[FOLDER_CONFIG_KEY] || [];
              const urls = [url1];
              if (url2) urls.push(url2);
              if (url3) urls.push(url3);
              // Store name with year prepended as the unique identifier
              const newFolder = { name: `${year} ${name}`, urls, script, year, month }; 
              
              const isDuplicate = folders.some(f => f.name === newFolder.name && f.year === year && f.month === month);
              if (isDuplicate && !confirm(`Folder "${newFolder.name}" already exists for ${getMonthName(month)}/${year}. Add anyway?`)) return;
              
              folders.push(newFolder);
              browserAPI.storage.local.set({ [FOLDER_CONFIG_KEY]: folders }, () => {
                  if (browserAPI.runtime.lastError) { alert("Error saving folder: " + browserAPI.runtime.lastError.message); return; }
                  nameInput.value = ""; urlInput1.value = ""; urlInput2.value = ""; urlInput3.value = "";
                  if(additionalUrlFields) additionalUrlFields.style.display = "none";
                  if(toggleAdditionalUrlsBtn) toggleAdditionalUrlsBtn.textContent = "+ Add Additional URLs";
                  renderFolderList();
                  setCurrentDateDefaults(); 
              });
          });
      });
  }

  if(exportConfigBtn) {
      exportConfigBtn.addEventListener("click", () => {
          browserAPI.storage.local.get([FOLDER_CONFIG_KEY], (result) => {
              if (browserAPI.runtime.lastError) { alert("Error getting folders for export: " + browserAPI.runtime.lastError.message); return; }
              const folders = result[FOLDER_CONFIG_KEY] || [];
              const dataStr = JSON.stringify(folders, null, 2);
              const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
              const exportFileDefaultName = `ecm_config_${new Date().toISOString().split('T')[0]}.json`;
              const linkElement = document.createElement('a');
              linkElement.setAttribute('href', dataUri);
              linkElement.setAttribute('download', exportFileDefaultName);
              linkElement.click();
          });
      });
  }

  if(importConfigBtn && importConfigInput) {
      importConfigBtn.addEventListener("click", () => { importConfigInput.click(); });
      importConfigInput.addEventListener("change", (event) => { 
          const file = event.target.files[0]; if (!file) return; 
          const reader = new FileReader(); 
          reader.onload = function(e) {
              try { 
                  const importedData = JSON.parse(e.target.result); 
                  if (!Array.isArray(importedData)) throw new Error("Invalid format: Must be JSON array."); 
                  const isValid = importedData.every(item => item && typeof item.name === 'string' && typeof item.script === 'string' && typeof item.year === 'number' && typeof item.month === 'number' && (Array.isArray(item.urls) || typeof item.url === 'string')); 
                  if (!isValid) throw new Error("Invalid format: Missing required properties or incorrect types."); 
                  const convertedFolders = importedData.map(folder => { if (folder.url && !Array.isArray(folder.urls)) return { ...folder, urls: [folder.url] }; if (!Array.isArray(folder.urls)) folder.urls = []; return folder; }); 
                  
                  if (confirm("Replace existing configuration? (Cancel to merge)")) { 
                      browserAPI.storage.local.set({ [FOLDER_CONFIG_KEY]: convertedFolders }, () => { 
                          if(browserAPI.runtime.lastError) alert("Error saving: " + browserAPI.runtime.lastError.message); else { renderFolderList(); alert("Configuration replaced!"); }
                      });
                  } else { 
                      browserAPI.storage.local.get([FOLDER_CONFIG_KEY], (result) => {
                          if (browserAPI.runtime.lastError) { alert("Error getting existing folders: " + browserAPI.runtime.lastError.message); return; }
                          let existingFolders = result[FOLDER_CONFIG_KEY] || [];
                          let addedCount = 0, skippedCount = 0; 
                          convertedFolders.forEach(imported => { 
                              const isDuplicate = existingFolders.some(ex => ex.name === imported.name && ex.year === imported.year && ex.month === imported.month); 
                              if (!isDuplicate) { existingFolders.push(imported); addedCount++; } else { skippedCount++; } 
                          }); 
                          browserAPI.storage.local.set({ [FOLDER_CONFIG_KEY]: existingFolders }, () => { 
                              if (browserAPI.runtime.lastError) alert("Error saving merged config: " + browserAPI.runtime.lastError.message);
                              else { renderFolderList(); alert(`Import complete. Merged ${addedCount} new configurations. Skipped ${skippedCount} duplicates.`); }
                          }); 
                      });
                  } 
              } catch (error) { console.error("Import Error:", error); alert("Error importing: " + error.message); } 
              finally { importConfigInput.value = ''; } 
          }; 
          reader.readAsText(file); 
      });
  }
  
  function resetImportUI(hideModal = false) {
    if(importObjectiveBtn) { importObjectiveBtn.disabled = false; importObjectiveBtn.textContent = "Import Objective folders"; }
    if(hideModal && folderTypeSelectionModal) folderTypeSelectionModal.style.display = 'none';
    if(confirmFolderTypeImportBtn) confirmFolderTypeImportBtn.disabled = true; 
    if(cancelFolderTypeImportBtn) cancelFolderTypeImportBtn.disabled = false;
    if(selectAllFolderTypesBtn) selectAllFolderTypesBtn.disabled = true; 
    if(deselectAllFolderTypesBtn) deselectAllFolderTypesBtn.disabled = true; 
    if(folderTypeImportStatus) folderTypeImportStatus.textContent = '';
    if(folderTypeChecklist) {
        folderTypeChecklist.innerHTML = '<i>Awaiting scan...</i>';
        folderTypeChecklist.querySelectorAll('input').forEach(input => input.disabled = false);
    }
  }

  function handleInitiateBackgroundImport() {
    if(!browserAPI || !browserAPI.runtime || !browserAPI.runtime.sendMessage){ 
        alert("Browser API not available. Cannot initiate import."); 
        resetImportUI(true); // Reset UI as a precaution
        return; 
    }
    console.log("Settings.js: Initiate Background Objective Import...");
    if(importObjectiveBtn) { importObjectiveBtn.disabled = true; importObjectiveBtn.textContent = "Scanning Objective..."; }
    if(folderTypeImportStatus) folderTypeImportStatus.textContent = 'Starting scan of top-level Objective pages...';
    if(folderTypeChecklist) folderTypeChecklist.innerHTML = '<i>Scanning... Please wait. This may take a moment.</i>';
    if(confirmFolderTypeImportBtn) confirmFolderTypeImportBtn.disabled = true;
    if(cancelFolderTypeImportBtn) cancelFolderTypeImportBtn.disabled = false; 
    if(selectAllFolderTypesBtn) selectAllFolderTypesBtn.disabled = true;
    if(deselectAllFolderTypesBtn) deselectAllFolderTypesBtn.disabled = true;
    if(folderTypeSelectionModal) folderTypeSelectionModal.style.display = 'block';

    browserAPI.runtime.sendMessage({ action: 'IMPORT_FROM_OBJECTIVE_URLS' }, (response) => {
      if (browserAPI.runtime.lastError) { 
        const errorMsg = browserAPI.runtime.lastError.message || "Unknown error initiating scan.";
        console.error("Settings.js: Error initiating scan (lastError):", errorMsg);
        alert(`Error initiating scan: ${errorMsg}`);
        resetImportUI(true); 
      } else if (response && response.status === 'error') { 
        const errorMsg = response.error || "Background script reported an error during initiation.";
        console.error("Settings.js: Error initiating scan (response error):", errorMsg);
        alert(`Error initiating scan: ${errorMsg}`);
        resetImportUI(true);
      } else if (response && response.status === 'scan_initiated') { // Check for explicit success acknowledgment
        console.log("Settings.js: Scan process acknowledged by background.");
        if(folderTypeImportStatus) folderTypeImportStatus.textContent = 'Waiting for folder list from Objective...';
      } else {
        // If no specific success or error status, but also no lastError, it might be an unexpected response.
        console.warn("Settings.js: Scan initiation - Unexpected response or no response from background script.", response);
        // Optionally, provide more generic feedback or reset
        // For now, we assume the process continues if no explicit error.
         if(folderTypeImportStatus) folderTypeImportStatus.textContent = 'Scan sent to background. Awaiting results...';
      }
    });
  }

  function displayFolderTypeSelection(folderTypes, errors) { 
    console.log("Settings.js: Displaying folder type selection dialog with", folderTypes.length, "folders"); 
    if (!folderTypeChecklist || !folderTypeSelectionModal) return; 
    folderTypeChecklist.innerHTML = ''; 
    
    if (folderTypes.length === 0) { 
        folderTypeChecklist.innerHTML = '<p>No folders found. Please try again.</p>'; 
        if (selectAllFolderTypesBtn) selectAllFolderTypesBtn.disabled = true; 
        if (deselectAllFolderTypesBtn) deselectAllFolderTypesBtn.disabled = true; 
        if (confirmFolderTypeImportBtn) confirmFolderTypeImportBtn.disabled = true; 
        return; 
    } 
    
    folderTypes.sort((a, b) => a.folderTypeName.localeCompare(b.folderTypeName)); 
    
    folderTypes.forEach((folder, index) => { 
        const item = document.createElement('div'); 
        item.className = 'folder-type-item'; 
        item.style.marginBottom = '10px';
        item.style.padding = '5px';
        item.style.borderRadius = '3px'; 
        
        const checkbox = document.createElement('input'); 
        checkbox.type = 'checkbox'; 
        checkbox.id = `folder-type-${index}`; 
        checkbox.value = folder.url; 
        checkbox.checked = true; // Default to checked 
        checkbox.dataset.folderName = folder.folderTypeName; // Store name in data attribute 
        
        const label = document.createElement('label'); 
        label.htmlFor = checkbox.id; 
        label.textContent = ` ${folder.folderTypeName}`; 
        label.style.fontWeight = 'normal';
        label.style.fontSize = '14px';
        label.style.cursor = 'pointer';
        label.style.marginLeft = '5px'; 
        
        item.appendChild(checkbox); 
        item.appendChild(label); 
        
        if (folder.url) { 
            const urlSpan = document.createElement('div'); 
            urlSpan.textContent = folder.url; 
            urlSpan.style.fontSize = '12px';
            urlSpan.style.color = 'var(--secondary-text, #6c757d)';
            urlSpan.style.marginLeft = '20px';
            urlSpan.style.wordBreak = 'break-all';
            item.appendChild(urlSpan); 
        } 
        
        folderTypeChecklist.appendChild(item); 
    }); 
    
    if (selectAllFolderTypesBtn) selectAllFolderTypesBtn.disabled = false; 
    if (deselectAllFolderTypesBtn) deselectAllFolderTypesBtn.disabled = false; 
    if (confirmFolderTypeImportBtn) confirmFolderTypeImportBtn.disabled = false; 
    
    // Show errors if any 
    if (errors && errors.length > 0) { 
        const errorList = document.createElement('div'); 
        errorList.className = 'folder-type-errors'; 
        errorList.style.marginTop = '15px';
        errorList.style.padding = '10px';
        errorList.style.backgroundColor = 'rgba(220, 53, 69, 0.1)';
        errorList.style.color = 'var(--danger, #dc3545)';
        errorList.style.borderRadius = '3px'; 
        
        const errorTitle = document.createElement('h4'); 
        errorTitle.textContent = 'Errors during scan:'; 
        errorTitle.style.marginTop = '0';
        errorTitle.style.fontSize = '14px';
        errorTitle.style.fontWeight = 'bold';
        errorList.appendChild(errorTitle); 
        
        const errorUl = document.createElement('ul'); 
        errorUl.style.marginBottom = '0';
        errors.forEach(err => { 
            const li = document.createElement('li'); 
            li.textContent = err; 
            li.style.fontSize = '12px';
            errorUl.appendChild(li); 
        }); 
        errorList.appendChild(errorUl); 
        
        folderTypeChecklist.appendChild(errorList); 
    } 
    
    if (folderTypeImportStatus) { 
        folderTypeImportStatus.textContent = 'Ready to process selected folders.'; 
    } 
  }

  if(confirmFolderTypeImportBtn) {
      confirmFolderTypeImportBtn.addEventListener('click', () => {
        const selectedCheckboxes = folderTypeChecklist.querySelectorAll('input[type="checkbox"]:checked');
        if (selectedCheckboxes.length === 0) { alert("Please select at least one folder type."); return; }
        const selectedFoldersData = Array.from(selectedCheckboxes).map(cb => ({ url: cb.value, folderTypeName: cb.dataset.folderName }));
        console.log(`Settings: Sending ${selectedFoldersData.length} selected folders for final import.`);
        // ... (UI updates for processing state)
        browserAPI.runtime.sendMessage({ action: 'PROCESS_SELECTED_FOLDER_TYPES', selectedFolderTypes: selectedFoldersData }, (response) => {
            // Check for immediate errors from sending the message
            if (browserAPI.runtime.lastError) {
                const errorMsg = browserAPI.runtime.lastError.message || "Error sending selected folders to background.";
                console.error("Settings.js: Error sending PROCESS_SELECTED_FOLDER_TYPES (lastError):", errorMsg);
                alert(`Error during import: ${errorMsg}`);
                resetImportUI(true); // Or at least re-enable buttons
            } else if (response && response.status === 'error') {
                const errorMsg = response.error || "Background reported an error starting folder processing.";
                console.error("Settings.js: Error from background on PROCESS_SELECTED_FOLDER_TYPES:", errorMsg);
                alert(`Error during import: ${errorMsg}`);
                resetImportUI(true);
            } else if (response && response.status === 'processing_selected_folders_initiated') {
                console.log("Settings.js: Processing of selected folders acknowledged by background.");
                if(folderTypeImportStatus) folderTypeImportStatus.textContent = `Importing data for ${selectedFoldersData.length} selected folders... This may take a while.`;
                // Buttons remain disabled until OBJECTIVE_IMPORT_COMPLETE
            } else {
                 console.warn("Settings.js: Unexpected response or no response from background after sending selected folders.", response);
                  // Potentially update status, but typically wait for OBJECTIVE_IMPORT_COMPLETE
            }
        });
      });
  }
  if(cancelFolderTypeImportBtn) cancelFolderTypeImportBtn.addEventListener('click', () => { resetImportUI(true); });
  if(selectAllFolderTypesBtn) selectAllFolderTypesBtn.addEventListener('click', () => { if(folderTypeChecklist) { folderTypeChecklist.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach(cb => { cb.checked = true; }); } });
  if(deselectAllFolderTypesBtn) deselectAllFolderTypesBtn.addEventListener('click', () => { if(folderTypeChecklist) { folderTypeChecklist.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach(cb => { cb.checked = false; }); } });

  if(browserAPI && browserAPI.runtime && browserAPI.runtime.onMessage) {
      browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
          // ... (message handling for PROMPT_FOLDER_TYPE_SELECTION, OBJECTIVE_IMPORT_COMPLETE, OBJECTIVE_IMPORT_ERROR - unchanged from v2.5)
          // Make sure sendResponse is called and "return false;" is used for these synchronous handlers
          if (request.action === 'PROMPT_FOLDER_TYPE_SELECTION') {
              console.log("Settings.js: Received PROMPT_FOLDER_TYPE_SELECTION:", request);
              displayFolderTypeSelection(request.folderTypes, request.errors);
              sendResponse({status: "received_and_displayed_folder_types"}); 
              return false; 
          } else if (request.action === 'OBJECTIVE_IMPORT_COMPLETE') {
              console.log("Settings.js: Received OBJECTIVE_IMPORT_COMPLETE:", request);
              resetImportUI(true); 
              let message = "Objective Import Finished.\n";
              const errors = request.errors || [];
              const foldersAdded = request.folders?.length || 0; 
              if (request.success) {
                  if (foldersAdded > 0) { renderFolderList(); message += `Successfully generated and saved ${foldersAdded} new monthly configurations.`; }
                  else { message += "No new configurations were created."; }
                  if (errors.length > 0) { message += `\n\nWARNING: ${errors.length} error(s) occurred. Details: ${errors.join('; ')}`; }
              } else {
                  message = `Import Failed: ${request.error || 'Unknown error.'}`;
                  if (errors.length > 0) { message += `\nAdditionally, ${errors.length} error(s) occurred. Details: ${errors.join('; ')}`;}
              }
              alert(message);
              // No explicit response needed by background here, but good practice to call sendResponse if it was passed.
              if (typeof sendResponse === 'function') sendResponse({status: "objective_import_complete_acknowledged"});
              return false; 
          } else if (request.action === 'OBJECTIVE_IMPORT_ERROR') { 
                console.error("Settings.js: Received OBJECTIVE_IMPORT_ERROR:", request);
                resetImportUI(true);
                alert(`Objective Import Error: ${request.error}\nURL: ${request.url || 'N/A'}`);
                if (typeof sendResponse === 'function') sendResponse({status: "objective_import_error_acknowledged"});
                return false;
          }
      });
  } else { console.error("Settings.js: Cannot add message listener."); }

  function handleDeleteAllConfigsClick() {
    console.log("Delete All Configurations button clicked."); 
    if (!confirm("⚠️ WARNING! ⚠️\n\nDelete ALL saved folder configurations?\n\nThis CANNOT be undone.")) return; 
    console.log("User confirmed deletion."); 
    if(deleteAllConfigsBtn) { deleteAllConfigsBtn.disabled = true; deleteAllConfigsBtn.textContent = "Deleting..."; } 
    
    browserAPI.storage.local.set({ [FOLDER_CONFIG_KEY]: [] }, () => {
        let userMessage = ""; 
        if (browserAPI.runtime.lastError) { 
            console.error("Error clearing folder configs:", browserAPI.runtime.lastError); 
            userMessage = `Failed to delete: ${browserAPI.runtime.lastError.message}`; 
        } else { 
            console.log("Cleared configurations."); 
            userMessage = "All configurations deleted."; 
            renderFolderList(); 
        } 
        alert(userMessage);
        if(deleteAllConfigsBtn) { deleteAllConfigsBtn.disabled = false; deleteAllConfigsBtn.textContent = "Delete All Configurations"; } 
    });
  }

  // Email Mapping Functions

  async function loadEmailMappings() {
    try {
      const result = await browserAPI.storage.local.get(EMAIL_MAPPINGS_KEY);
      emailMappings = result[EMAIL_MAPPINGS_KEY] || {};
      renderEmailMappings();
      return emailMappings;
    } catch (error) {
      console.error("Error loading email mappings:", error);
      return {};
    }
  }

  async function saveEmailMappings() {
    try {
      await browserAPI.storage.local.set({ [EMAIL_MAPPINGS_KEY]: emailMappings });
      console.log("Email mappings saved successfully");
      return true;
    } catch (error) {
      console.error("Error saving email mappings:", error);
      return false;
    }
  }

  function renderEmailMappings(searchTerm = '') {
    if (!emailElements.emailMappingsList) return;
    
    const filteredMappings = Object.entries(emailMappings).filter(([name]) => 
      !searchTerm || name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    if (filteredMappings.length === 0) {
      emailElements.emailMappingsList.innerHTML = '<div class="empty-state">No email mappings found.</div>';
      return;
    }
    
    emailElements.emailMappingsList.innerHTML = '';
    
    filteredMappings.sort(([a], [b]) => a.localeCompare(b)).forEach(([name, data]) => {
      const item = document.createElement('div');
      item.className = 'email-mapping-item';
      
      const info = document.createElement('div');
      info.className = 'email-mapping-info';
      
      const nameElement = document.createElement('div');
      nameElement.className = 'email-mapping-name';
      nameElement.textContent = name;
      
      const addressElement = document.createElement('div');
      addressElement.className = 'email-mapping-address';
      addressElement.textContent = data.email;
      
      info.appendChild(nameElement);
      info.appendChild(addressElement);
      
      if (data.cc) {
        const ccElement = document.createElement('div');
        ccElement.className = 'email-mapping-cc';
        ccElement.textContent = `CC: ${data.cc}`;
        info.appendChild(ccElement);
      }
      
      const actions = document.createElement('div');
      actions.className = 'email-mapping-actions';
      
      const editButton = document.createElement('button');
      editButton.className = 'edit-email-btn';
      editButton.innerHTML = '✏️';
      editButton.title = 'Edit';
      editButton.addEventListener('click', () => openEmailMappingDialog(name));
      
      const deleteButton = document.createElement('button');
      deleteButton.className = 'delete-email-btn';
      deleteButton.innerHTML = '🗑️';
      deleteButton.title = 'Delete';
      deleteButton.addEventListener('click', () => {
        if (confirm(`Are you sure you want to delete the email mapping for "${name}"?`)) {
          delete emailMappings[name];
          saveEmailMappings();
          renderEmailMappings(emailElements.emailSearchInput.value);
        }
      });
      
      actions.appendChild(editButton);
      actions.appendChild(deleteButton);
      
      item.appendChild(info);
      item.appendChild(actions);
      
      emailElements.emailMappingsList.appendChild(item);
    });
  }

  function openEmailMappingDialog(personName = null) {
    editingEmailId = personName;
    
    emailElements.emailMappingDialogTitle.textContent = personName ? 'Edit Email Mapping' : 'Add Email Mapping';
    
    if (personName && emailMappings[personName]) {
      emailElements.emailMappingName.value = personName;
      emailElements.emailMappingName.disabled = true;
      emailElements.emailMappingEmail.value = emailMappings[personName].email || '';
      emailElements.emailMappingCC.value = emailMappings[personName].cc || '';
    } else {
      emailElements.emailMappingName.value = '';
      emailElements.emailMappingName.disabled = false;
      emailElements.emailMappingEmail.value = '';
      emailElements.emailMappingCC.value = '';
    }
    
    emailElements.nameMatchesList.style.display = 'none';
    
    // --- AMENDMENT START ---
    // Remove the 'hidden' class to ensure the dialog is visible, as it likely
    // has a 'display: none !important' style that overrides the inline style.
    emailElements.emailMappingDialog.classList.remove('hidden');
    // --- AMENDMENT END ---

    emailElements.emailMappingDialog.style.display = 'flex';
  }

  function closeEmailMappingDialog() {
    // --- AMENDMENT START ---
    // Add the 'hidden' class back for consistency and to ensure it's hidden.
    emailElements.emailMappingDialog.classList.add('hidden');
    // --- AMENDMENT END ---

    emailElements.emailMappingDialog.style.display = 'none';
    editingEmailId = null;
  }

  async function loadPersonsFromStorage() {
    try {
      // Attempt to get existing data
      const result = await browserAPI.storage.local.get('ecmObjectiveData');
      const data = result.ecmObjectiveData || {};
      
      if (data.persons) {
        currentPersons = Object.keys(data.persons);
        return currentPersons;
      }
      return [];
    } catch (error) {
      console.error("Error loading persons from storage:", error);
      return [];
    }
  }

  function showPersonSuggestions(input) {
    const searchTerm = input.toLowerCase();
    const matchingPersons = currentPersons
      .filter(person => 
        person.toLowerCase().includes(searchTerm) && 
        !emailMappings[person]
      )
      .sort();
    
    if (matchingPersons.length === 0 || searchTerm.length < 2) {
      emailElements.nameMatchesList.style.display = 'none';
      return;
    }
    
    emailElements.nameMatchesList.innerHTML = '';
    
    matchingPersons.slice(0, 5).forEach(person => {
      const item = document.createElement('div');
      item.className = 'match-item';
      item.textContent = person;
      item.addEventListener('click', () => {
        emailElements.emailMappingName.value = person;
        emailElements.nameMatchesList.style.display = 'none';
      });
      emailElements.nameMatchesList.appendChild(item);
    });
    
    emailElements.nameMatchesList.style.display = 'block';
  }

  function setupEmailMappingEventListeners() {
    if (emailElements.addNewEmailMappingBtn) {
      emailElements.addNewEmailMappingBtn.addEventListener('click', () => openEmailMappingDialog());
    }
    
    if (emailElements.emailSearchInput) {
      emailElements.emailSearchInput.addEventListener('input', (e) => renderEmailMappings(e.target.value));
    }
    
    if (emailElements.closeEmailDialogBtn) {
      emailElements.closeEmailDialogBtn.addEventListener('click', closeEmailMappingDialog);
    }
    
    if (emailElements.cancelEmailDialogBtn) {
      emailElements.cancelEmailDialogBtn.addEventListener('click', closeEmailMappingDialog);
    }
    
    if (emailElements.saveEmailMappingBtn) {
      emailElements.saveEmailMappingBtn.addEventListener('click', () => {
        const name = emailElements.emailMappingName.value.trim();
        const email = emailElements.emailMappingEmail.value.trim();
        const cc = emailElements.emailMappingCC.value.trim();
        
        if (!name) {
          alert('Please enter a name');
          return;
        }
        
        if (!email) {
          alert('Please enter an email address');
          return;
        }
        
        // Simple email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          alert('Please enter a valid email address');
          return;
        }
        
        // Check CC emails if provided
        if (cc) {
          const ccEmails = cc.split(',').map(e => e.trim());
          for (const ccEmail of ccEmails) {
            if (!emailRegex.test(ccEmail)) {
              alert(`Invalid CC email address: ${ccEmail}`);
              return;
            }
          }
        }
        
        emailMappings[name] = { email, cc };
        saveEmailMappings();
        closeEmailMappingDialog();
        renderEmailMappings(emailElements.emailSearchInput?.value || '');
      });
    }
    
    if (emailElements.emailMappingName) {
      emailElements.emailMappingName.addEventListener('input', (e) => {
        showPersonSuggestions(e.target.value);
      });
      
      // Hide suggestions when clicking outside
      document.addEventListener('click', (e) => {
        if (e.target !== emailElements.emailMappingName) {
          emailElements.nameMatchesList.style.display = 'none';
        }
      });
    }
    
    if (emailElements.exportEmailMappingsBtn) {
      emailElements.exportEmailMappingsBtn.addEventListener('click', () => {
        const dataStr = JSON.stringify(emailMappings, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        const exportFileDefaultName = `email_mappings_${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
      });
    }
    
    if (emailElements.importEmailMappingsBtn && emailElements.importEmailMappingsInput) {
      emailElements.importEmailMappingsBtn.addEventListener('click', () => {
        emailElements.importEmailMappingsInput.click();
      });
      
      emailElements.importEmailMappingsInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
          try {
            const importedData = JSON.parse(e.target.result);
            
            if (typeof importedData !== 'object') {
              throw new Error("Invalid format: Must be a JSON object");
            }
            
            // Validate the structure
            Object.entries(importedData).forEach(([name, data]) => {
              if (!data.email) {
                throw new Error(`Invalid mapping for "${name}": Missing email address`);
              }
            });
            
            if (confirm("Replace existing email mappings? (Cancel to merge)")) {
              emailMappings = importedData;
            } else {
              // Merge with existing
              emailMappings = { ...emailMappings, ...importedData };
            }
            
            saveEmailMappings();
            renderEmailMappings();
            alert("Email mappings imported successfully!");
          } catch (error) {
            console.error("Import Error:", error);
            alert("Error importing: " + error.message);
          } finally {
            event.target.value = '';
          }
        };
        reader.readAsText(file);
      });
    }
  }

  // Initialize email mapping functionality
  async function initializeEmailMappings() {
    await loadEmailMappings();
    await loadPersonsFromStorage();
    setupEmailMappingEventListeners();
  }

  // ==================== DATA REVIEW SETTINGS ====================
  
  const dataReviewElements = {
    enableToggle: document.getElementById('enableDataReviewToggle'),
    folderExclusionList: document.getElementById('folderExclusionList'),
    applyBtn: document.getElementById('applyDataReviewSettingsBtn'),
    resetBtn: document.getElementById('resetDataReviewSettingsBtn')
  };

  const DATA_REVIEW_SETTINGS_KEY = 'dataReviewSettings';
  let dataReviewSettings = {
    enabled: true,
    excludedFolders: []
  };

  async function loadDataReviewSettings() {
    try {
      const result = await browserAPI.storage.local.get(DATA_REVIEW_SETTINGS_KEY);
      if (result[DATA_REVIEW_SETTINGS_KEY]) {
        dataReviewSettings = result[DATA_REVIEW_SETTINGS_KEY];
      }
      console.log("Data Review Settings loaded:", dataReviewSettings);
    } catch (error) {
      console.error("Error loading data review settings:", error);
    }
  }

  async function saveDataReviewSettings() {
    try {
      await browserAPI.storage.local.set({ [DATA_REVIEW_SETTINGS_KEY]: dataReviewSettings });
      console.log("Data Review Settings saved:", dataReviewSettings);
    } catch (error) {
      console.error("Error saving data review settings:", error);
    }
  }

  async function renderFolderExclusionList() {
    if (!dataReviewElements.folderExclusionList) {
      console.warn("Data Review: folderExclusionList element not found");
      return;
    }

    // Get all configured folders
    const result = await browserAPI.storage.local.get(FOLDER_CONFIG_KEY);
    const configs = result[FOLDER_CONFIG_KEY] || [];
    console.log("Data Review: Loaded configs:", configs.length, "configurations");
    
    // Extract unique folder names (strip year prefix if present)
    const folderNames = new Set();
    configs.forEach(config => {
      if (config.name) {
        // Strip year prefix (e.g., "2025 Folder Name" -> "Folder Name")
        let folderName = config.name;
        const yearMatch = folderName.match(/^(\d{4})\s+(.+)$/);
        if (yearMatch && yearMatch[2]) {
          folderName = yearMatch[2];
        }
        folderNames.add(folderName);
      }
    });

    console.log("Data Review: Found unique folders:", Array.from(folderNames));

    if (folderNames.size === 0) {
      dataReviewElements.folderExclusionList.innerHTML = '<div class="empty-state">No folders configured yet.</div>';
      console.log("Data Review: No folders found, showing empty state");
      return;
    }

    // Sort alphabetically
    const sortedFolders = Array.from(folderNames).sort();
    
    // Create checkboxes
    const html = sortedFolders.map(folderName => {
      const isExcluded = dataReviewSettings.excludedFolders.includes(folderName);
      return `
        <div class="folder-exclusion-item">
          <label>
            <input type="checkbox" 
                   class="folder-exclusion-checkbox" 
                   data-folder="${folderName}"
                   ${isExcluded ? 'checked' : ''}>
            ${folderName}
          </label>
        </div>
      `;
    }).join('');

    dataReviewElements.folderExclusionList.innerHTML = html;
    console.log("Data Review: Rendered", sortedFolders.length, "folder checkboxes");
  }

  function gatherExclusionSettings() {
    const checkboxes = dataReviewElements.folderExclusionList.querySelectorAll('.folder-exclusion-checkbox');
    const excludedFolders = [];
    
    checkboxes.forEach(checkbox => {
      if (checkbox.checked) {
        excludedFolders.push(checkbox.dataset.folder);
      }
    });

    return {
      enabled: dataReviewElements.enableToggle?.checked ?? true,
      excludedFolders
    };
  }

  function applyDataReviewSettings() {
    dataReviewSettings = gatherExclusionSettings();
    saveDataReviewSettings();
    alert('Data review settings saved successfully!');
  }

  function resetDataReviewSettings() {
    if (confirm('Reset data review settings to default? This will clear all folder exclusions.')) {
      dataReviewSettings = {
        enabled: true,
        excludedFolders: []
      };
      saveDataReviewSettings();
      
      // Update UI
      if (dataReviewElements.enableToggle) {
        dataReviewElements.enableToggle.checked = true;
      }
      renderFolderExclusionList();
      
      alert('Data review settings reset to default!');
    }
  }

  async function initializeDataReviewSettings() {
    await loadDataReviewSettings();
    
    // Set toggle state
    if (dataReviewElements.enableToggle) {
      dataReviewElements.enableToggle.checked = dataReviewSettings.enabled;
    }
    
    // Render folder list
    await renderFolderExclusionList();
    
    // Setup event listeners
    if (dataReviewElements.applyBtn) {
      dataReviewElements.applyBtn.addEventListener('click', applyDataReviewSettings);
    }
    
    if (dataReviewElements.resetBtn) {
      dataReviewElements.resetBtn.addEventListener('click', resetDataReviewSettings);
    }
  }

  // ==================== END DATA REVIEW SETTINGS ====================

  // ==================== FORCE SINGLE COUNT SETTINGS ====================
  const forceSingleCountElements = {
    container: document.getElementById('forceSingleCountContainer'),
    list: document.getElementById('forceSingleCountList'),
    applyBtn: document.getElementById('applyForceSingleCountBtn'),
    clearBtn: document.getElementById('clearForceSingleCountBtn')
  };

  const FORCE_SINGLE_COUNT_KEY = 'forceSingleCountFolders';
  let forceSingleCountFolders = [];

  async function loadForceSingleCountSettings() {
    try {
      const result = await browserAPI.storage.local.get([FORCE_SINGLE_COUNT_KEY]);
      if (result[FORCE_SINGLE_COUNT_KEY]) {
        forceSingleCountFolders = result[FORCE_SINGLE_COUNT_KEY];
      }
      console.log("Force Single Count Settings loaded:", forceSingleCountFolders);
    } catch (e) {
      console.error("Error loading force single count settings:", e);
    }
  }

  async function saveForceSingleCountSettings() {
    try {
      await browserAPI.storage.local.set({ [FORCE_SINGLE_COUNT_KEY]: forceSingleCountFolders });
      console.log("Force Single Count Settings saved:", forceSingleCountFolders);
    } catch (e) {
      console.error("Error saving force single count settings:", e);
    }
  }

  async function renderForceSingleCountList() {
    if (!forceSingleCountElements.list) return;
    
    // Get all unique folder names from configurations
    const result = await browserAPI.storage.local.get([FOLDER_CONFIG_KEY]);
    const configs = result[FOLDER_CONFIG_KEY] || [];
    
    const folderNames = new Set();
    configs.forEach(config => {
      // Only include Script B folders
      if (config.script !== 'B') return;
      
      let folderName = config.name;
      // Strip year prefix if present
      const yearMatch = folderName.match(/^(\d{4})\s+(.+)$/);
      if (yearMatch) {
        folderName = yearMatch[2];
      }
      folderNames.add(folderName);
    });
    
    console.log("Force Single Count: Found Script B folders:", Array.from(folderNames));
    
    if (folderNames.size === 0) {
      forceSingleCountElements.list.innerHTML = '<div class="empty-state">No Script B folders configured yet.</div>';
      return;
    }
    
    const sortedFolders = Array.from(folderNames).sort();
    
    const html = sortedFolders.map(folderName => {
      const isForced = forceSingleCountFolders.includes(folderName);
      return `
        <div class="exclusion-item">
          <label>
            <input type="checkbox" 
                   class="force-single-checkbox" 
                   data-folder="${folderName}"
                   ${isForced ? 'checked' : ''}>
            ${folderName}
          </label>
        </div>
      `;
    }).join('');
    
    forceSingleCountElements.list.innerHTML = html;
  }

  function gatherForceSingleCountSettings() {
    const checkboxes = document.querySelectorAll('.force-single-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.dataset.folder);
  }

  function applyForceSingleCountSettings() {
    forceSingleCountFolders = gatherForceSingleCountSettings();
    saveForceSingleCountSettings();
    alert(`Force single count settings applied! ${forceSingleCountFolders.length} folders will have counts capped to 1.`);
  }

  function clearForceSingleCountSettings() {
    if (confirm('Clear all force single count settings?')) {
      forceSingleCountFolders = [];
      saveForceSingleCountSettings();
      renderForceSingleCountList();
      alert('Force single count settings cleared!');
    }
  }

  async function initializeForceSingleCountSettings() {
    await loadForceSingleCountSettings();
    await renderForceSingleCountList();
    
    if (forceSingleCountElements.applyBtn) {
      forceSingleCountElements.applyBtn.addEventListener('click', applyForceSingleCountSettings);
    }
    
    if (forceSingleCountElements.clearBtn) {
      forceSingleCountElements.clearBtn.addEventListener('click', clearForceSingleCountSettings);
    }
  }
  // ==================== END FORCE SINGLE COUNT SETTINGS ====================

  if(deleteAllConfigsBtn) deleteAllConfigsBtn.addEventListener("click", handleDeleteAllConfigsClick);
  if(backButton) backButton.addEventListener("click", () => { window.location.href = "main.html"; });
  if(filterYearSelect) filterYearSelect.addEventListener("change", renderFolderList);
  if(filterMonthSelect) filterMonthSelect.addEventListener("change", renderFolderList);
  
  if(importObjectiveBtn) {
    importObjectiveBtn.addEventListener("click", handleInitiateBackgroundImport);
  } else {
    console.warn("Import Objective Button not found");
  }


  populateYearDropdowns();
  setCurrentDateDefaults();
  setFilterDateDefaults();
  renderFolderList(); 
  initializeEmailMappings();
  initializeDataReviewSettings();
  initializeForceSingleCountSettings();
  console.log("Settings.js: Initial load complete (v2.7).");
});