// Enhanced reports.js - Import/Export compatible data loading
'use strict';

import {
  ACTION_DELETE_DATA, ACTION_DELETE_COMPLETE, ACTION_DATA_UPDATED,
  ACTION_CLEAR_ALL_DATA, ACTION_EXPORT_ALL_DATA, ACTION_IMPORT_ALL_DATA,
  STATUS_ERROR, ACTION_PROCESSING_COMPLETE,
  STORAGE_KEY_DATA, STORAGE_KEY_QUEUE_DATA,
  FOLDER_ORDER
} from './constants.js';
import { StorageManager } from './storage-manager.js';
import { ErrorManager, SEVERITY, CATEGORY } from './enhanced-error-manager.js';
import { getWeekNumber } from './utils.js';
import reportsExporter from './reports-export.js';

const browserAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
const MONTH_NAMES_SHORT = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES_FULL = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const EMAIL_MAPPINGS_KEY = 'ecmEmailMappings';

if (!browserAPI) {
    console.error("Reports.js: Browser API not found!");
}
console.log('Reports.js: Script loaded (Enhanced for Import/Export).');

async function checkEmailMappingsAvailability(selectedPersons) {
  console.log("Reports: Checking email mappings availability for:", selectedPersons);
  if (!selectedPersons) selectedPersons = [];

  try {
    const result = await browserAPI.storage.local.get(EMAIL_MAPPINGS_KEY);
    const emailMappingsData = result[EMAIL_MAPPINGS_KEY] || {};
    
    if (selectedPersons.length === 0) { 
        return { allMapped: false, mappedPersons: [], emailMappings: emailMappingsData };
    }

    const mappedPersons = selectedPersons.filter(person => {
      return !!emailMappingsData[person]?.email;
    });
    
    const allMapped = mappedPersons.length === selectedPersons.length;
    console.log(`Reports: ${mappedPersons.length} of ${selectedPersons.length} selected persons have email mappings.`);
    return { allMapped, mappedPersons, emailMappings: emailMappingsData };

  } catch (error) {
    console.error("Reports: Error checking email mappings:", error);
    ErrorManager.logError(error, 'Error checking email mappings.', SEVERITY.MEDIUM, CATEGORY.EMAIL);
    return { allMapped: false, mappedPersons: [], emailMappings: {} };
  }
}

// *** ENHANCED: Multi-source data loading with fallback support ***
async function loadDataWithFallback() {
  console.log("Reports: Loading data with enhanced fallback support...");
  
  try {
    // Wait for StorageManager to be ready
    if (typeof window !== 'undefined' && window.waitForStorageManager) {
      await window.waitForStorageManager();
    }

    // Wait for any post-import migrations
    if (typeof window !== 'undefined' && window.waitForPostImportMigration) {
      await window.waitForPostImportMigration();
    }

    // Try IndexedDB first (primary data source)
    console.log("Reports: Attempting to load from IndexedDB...");
    let data = await StorageManager.retrieveAndDecompress(STORAGE_KEY_DATA);
    if (data && data.persons && Object.keys(data.persons).length > 0) {
      console.log(`Reports: Retrieved data from IndexedDB - ${Object.keys(data.persons).length} persons`);
      return data;
    }

    // Try browser storage for objectiveCumulativeData (import format)
    console.log("Reports: IndexedDB empty, checking for objectiveCumulativeData...");
    const result = await browserAPI.storage.local.get('objectiveCumulativeData');
    const cumulativeData = result.objectiveCumulativeData;
    
    if (cumulativeData) {
      console.log("Reports: Found objectiveCumulativeData, parsing...");
      const parsedData = await parseObjectiveCumulativeData(cumulativeData);
      if (parsedData && parsedData.persons && Object.keys(parsedData.persons).length > 0) {
        console.log(`Reports: Successfully parsed cumulative data - ${Object.keys(parsedData.persons).length} persons`);
        
        // Store in IndexedDB for future use
        if (StorageManager.pako) {
          try {
            await StorageManager.storeGenericData(STORAGE_KEY_DATA, parsedData);
            console.log("Reports: Migrated parsed data to IndexedDB");
          } catch (storeError) {
            console.warn("Reports: Failed to migrate to IndexedDB:", storeError);
          }
        }
        
        return parsedData;
      }
    }

    // Try direct storage as final fallback
    console.log("Reports: Checking direct storage...");
    const directResult = await browserAPI.storage.local.get(STORAGE_KEY_DATA);
    if (directResult[STORAGE_KEY_DATA] && directResult[STORAGE_KEY_DATA].persons) {
      console.log(`Reports: Found direct storage data - ${Object.keys(directResult[STORAGE_KEY_DATA].persons).length} persons`);
      return directResult[STORAGE_KEY_DATA];
    }

    console.log("Reports: No data found in any source, returning empty structure");
    return { persons: {}, folders: {} };

  } catch (error) {
    console.error("Reports: Error in enhanced data loading:", error);
    return { persons: {}, folders: {} };
  }
}

// *** ENHANCED: Parse objectiveCumulativeData format ***
async function parseObjectiveCumulativeData(cumulativeData) {
  try {
    if (!cumulativeData) return null;

    let rawData = cumulativeData.data;
    
    // Handle compression if present
    if (cumulativeData.compressed && StorageManager.pako) {
      try {
        console.log('Reports: Decompressing objective data...');
        rawData = StorageManager.pako.inflate(rawData, { to: 'string' });
      } catch (decompressError) {
        console.error('Reports: Decompression failed:', decompressError);
        return null;
      }
    }

    // Parse JSON if it's a string
    let statsData;
    if (typeof rawData === 'string') {
      try {
        statsData = JSON.parse(rawData);
        console.log('Reports: Successfully parsed JSON from string');
      } catch (parseError) {
        console.error('Reports: JSON parsing failed:', parseError);
        return null;
      }
    } else if (typeof rawData === 'object' && rawData !== null) {
      statsData = rawData;
      console.log('Reports: Using object data directly');
    } else {
      console.error('Reports: Unexpected data type:', typeof rawData);
      return null;
    }

    // Transform to dashboard format
    return transformStatsDataToDashboardFormat(statsData);

  } catch (error) {
    console.error('Reports: Error parsing cumulative data:', error);
    return null;
  }
}

// *** ENHANCED: Transform stats data to expected dashboard format ***
function transformStatsDataToDashboardFormat(statsData) {
  try {
    console.log('Reports: Transforming stats data to dashboard format...');
    
    // If it's already in dashboard format, return as-is
    if (statsData.persons && typeof statsData.persons === 'object') {
      // Check if it looks like the dashboard format (nested year/month structure)
      const firstPerson = Object.values(statsData.persons)[0];
      if (firstPerson && typeof firstPerson === 'object') {
        const firstYear = Object.values(firstPerson)[0];
        if (firstYear && typeof firstYear === 'object') {
          const firstMonth = Object.values(firstYear)[0];
          if (firstMonth && typeof firstMonth === 'object') {
            console.log('Reports: Data is already in dashboard format');
            return {
              persons: statsData.persons,
              folders: statsData.folders || {}
            };
          }
        }
      }
    }

    // Transform from other formats
    const dashboardData = { persons: {}, folders: {} };

    // Handle different possible structures
    if (statsData.persons) {
      Object.entries(statsData.persons).forEach(([personName, personData]) => {
        dashboardData.persons[personName] = {};
        
        // Handle nested year structure
        if (personData.years) {
          Object.entries(personData.years).forEach(([year, yearData]) => {
            dashboardData.persons[personName][year] = {};
            
            if (yearData.months) {
              Object.entries(yearData.months).forEach(([month, monthData]) => {
                dashboardData.persons[personName][year][month] = {};
                
                if (monthData.folders) {
                  Object.entries(monthData.folders).forEach(([folderName, folderData]) => {
                    dashboardData.persons[personName][year][month][folderName] = {};
                    
                    if (folderData.dates) {
                      Object.entries(folderData.dates).forEach(([date, count]) => {
                        dashboardData.persons[personName][year][month][folderName][date] = count;
                      });
                    }
                  });
                }
              });
            }
          });
        } else if (typeof personData === 'object') {
          // Direct year/month structure
          Object.entries(personData).forEach(([year, yearData]) => {
            if (typeof yearData === 'object' && yearData !== null) {
              dashboardData.persons[personName][year] = yearData;
            }
          });
        }
      });
    }

    // Handle folders
    if (statsData.folders) {
      dashboardData.folders = statsData.folders;
    }

    console.log(`Reports: Transformed data for ${Object.keys(dashboardData.persons).length} persons`);
    return dashboardData;

  } catch (error) {
    console.error('Reports: Error transforming stats data:', error);
    return { persons: {}, folders: {} };
  }
}

window.addEventListener('DOMContentLoaded', () => {

  const refs = {
    yearSelect: document.getElementById('year-select'),
    monthSelect: document.getElementById('monthSelect'),
    peopleContainer: document.getElementById('peopleContainer'),
    folderContainer: document.getElementById('folderContainer'),
    selectAllPeopleCheckbox: document.getElementById('selectAllPeople'),
    selectAllFoldersCheckbox: document.getElementById('selectAllFolders'),
    generateIndividualBtn: document.getElementById('generateIndividualBtn'),
    generateTeamBtn: document.getElementById('generateTeamBtn'),
    generateYearlyBtn: document.getElementById('generateYearlyBtn'),
    deleteBtn: document.getElementById('deleteBtn'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),
    statusDiv: document.getElementById('statusDiv'),
    dashboardStatusDiv: document.getElementById('dashboardStatusDiv'),
    reportFormatSelect: document.getElementById('reportFormatSelect'),
    backBtn: document.getElementById('backBtn'),
    deleteSelectedDataBtn: document.getElementById('deleteSelectedDataBtn'),
    queueDataFile: document.getElementById('queueDataFile'), 
    uploadQueueDataBtn: document.getElementById('uploadQueueDataBtn'), 
    queueDataStatusDiv: document.getElementById('queueDataStatusDiv'),
    dailyReportDialog: document.getElementById('dailyReportDialog'),
    monthlyDailyOption: document.getElementById('monthlyDailyOption'),
    weeklyDailyOption: document.getElementById('weeklyDailyOption'),
    monthlySplitOption: document.getElementById('monthlySplitOption'),
    weekSelect: document.getElementById('weekSelect'),
    weekSelectionContainer: document.getElementById('weekSelectionContainer'),
    closeDialogBtn: document.getElementById('closeDialogBtn'),
    cancelDialogBtn: document.getElementById('cancelDialogBtn'),
    generateDetailedReportsBtn: document.getElementById('generateDetailedReportsBtn'),
    emailReportsOption: document.getElementById('emailReportsOption'),
    emailOptionsContainer: document.getElementById('emailOptionsContainer'),
    noEmailMappingWarning: document.getElementById('noEmailMappingWarning'),
    configureEmailsLink: document.getElementById('configureEmailsLink')
  };

  if (!refs.statusDiv && !refs.dashboardStatusDiv) {
      const statusDiv = document.createElement('div');
      statusDiv.id = 'statusDiv'; statusDiv.className = 'status'; statusDiv.textContent = 'Ready.';
      const headerElem = document.querySelector('.header');
      if (headerElem?.parentNode) {
          headerElem.parentNode.insertBefore(statusDiv, headerElem.nextSibling);
          refs.statusDiv = statusDiv;
      }
  }

  let criticalElementMissing = false;
  Object.entries(refs).forEach(([key, element]) => {
    const optionalKeys = ['dashboardStatusDiv', 'importFile', 'deleteSelectedDataBtn', 'backBtn', 
                          'exportBtn', 'clearAllBtn', 'importBtn', 'deleteBtn',
                          'queueDataFile', 'uploadQueueDataBtn', 'queueDataStatusDiv'];
    if (!element && !optionalKeys.includes(key) ) {
      console.error(`CRITICAL ERROR: Required element with ID '${key}' not found! Check reports.html.`);
      ErrorManager.logError(null, `Required UI element '${key}' not found.`, SEVERITY.CRITICAL, CATEGORY.UI);
      criticalElementMissing = true;
    } 
  });

  if(criticalElementMissing) {
       const targetStatusDiv = refs.statusDiv || refs.dashboardStatusDiv || document.getElementById('statusDiv');
       if(targetStatusDiv) {
            targetStatusDiv.textContent = "Error: Required UI elements missing. Functionality may be impaired.";
            targetStatusDiv.className = 'status error'; targetStatusDiv.style.display = 'block';
       }
       return;
  }

  let store = { persons: {}, folders: {} };
  let isAnyDataLoaded = false;

  function updateStatus(msg, isError = false, target = 'main') {
      let targetStatusDiv = (target === 'queue' && refs.queueDataStatusDiv) ? refs.queueDataStatusDiv : (refs.statusDiv || refs.dashboardStatusDiv);
      if (!targetStatusDiv) {
          console.log(`Status (${target}): ${msg}${isError ? ' (ERROR)' : ''}`);
          return;
      }
      targetStatusDiv.textContent = msg;
      targetStatusDiv.className = `status ${isError ? 'error' : 'info'}`;
      targetStatusDiv.style.display = 'block';
  }

  function populateYearDropdown(years) {
    if (!refs.yearSelect) {
        console.error("populateYearDropdown: yearSelect element not found.");
        return;
    }
    const currentSelectedValue = refs.yearSelect.value; 
    refs.yearSelect.innerHTML = '<option value="" disabled>Select Year</option>'; 

    let yearsToPopulate = years && years.length > 0 ? years.slice() : [new Date().getFullYear()];
    yearsToPopulate.sort((a, b) => b - a); 

    yearsToPopulate.forEach(year => {
        const option = document.createElement('option');
        option.value = String(year); 
        option.textContent = String(year);
        refs.yearSelect.appendChild(option);
    });

    if (currentSelectedValue && yearsToPopulate.map(String).includes(currentSelectedValue)) {
        refs.yearSelect.value = currentSelectedValue;
    } else if (yearsToPopulate.length > 0) {
        refs.yearSelect.value = String(yearsToPopulate[0]); 
    } else {
        console.warn("populateYearDropdown: No years to select, even after attempting to default.");
        refs.yearSelect.value = ""; 
    }
    console.log(`DEBUG: populateYearDropdown - Years populated. Selected Year: '${refs.yearSelect.value}'`);
}

  function renderList(container, items, type) {
      if (!container) return;
      container.innerHTML = '';
      const selectAllCheckbox = (type === 'people') ? refs.selectAllPeopleCheckbox : refs.selectAllFoldersCheckbox;
      if (!items || items.length === 0) { container.innerHTML = `<p class="empty">No ${type} found for period.</p>`; if (selectAllCheckbox) { selectAllCheckbox.checked = false; selectAllCheckbox.disabled = true; selectAllCheckbox.indeterminate = false; } return; }
      if (selectAllCheckbox) { selectAllCheckbox.disabled = false; }
      items.forEach(item => {
          const div = document.createElement('div'); div.className = 'filter-item selected';
          const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.id = `${type}-${String(item).replace(/[^a-zA-Z0-9_-]/g, '-')}`; checkbox.value = item; checkbox.checked = true;
          if (type === 'folder') { checkbox.dataset.folderName = item; div.dataset.folderName = item; }
          const label = document.createElement('label'); label.htmlFor = checkbox.id; label.textContent = item; if (type === 'folder' && item.length > 40) label.title = item;
          div.appendChild(checkbox); div.appendChild(label); container.appendChild(div);
          checkbox.addEventListener('change', () => { div.classList.toggle('selected', checkbox.checked); updateSelectAllCheckbox(container, type); updateButtonStates(); });
      });
      updateSelectAllCheckbox(container, type);
  }

  function updateSelectAllCheckbox(container, type) {
      const selectAllCheckbox = (type === 'people') ? refs.selectAllPeopleCheckbox : refs.selectAllFoldersCheckbox; if (!selectAllCheckbox) return;
      const checkboxes = container.querySelectorAll('.filter-item input[type="checkbox"]'); if (checkboxes.length === 0) { selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = false; selectAllCheckbox.disabled = true; return; }
      selectAllCheckbox.disabled = false; const total = checkboxes.length; const checkedNum = container.querySelectorAll('.filter-item input[type="checkbox"]:checked').length;
      if (checkedNum === 0) { selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = false; } 
      else if (checkedNum === total) { selectAllCheckbox.checked = true; selectAllCheckbox.indeterminate = false; } 
      else { selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = true; }
  }

  function isAnyPersonSelected(refsToCheck) { return !!(refsToCheck.selectAllPeopleCheckbox?.checked || refsToCheck.peopleContainer?.querySelector('.filter-item input[type="checkbox"]:checked')); }
  function isAnyFolderSelected(refsToCheck) { return !!(refsToCheck.selectAllFoldersCheckbox?.checked || refsToCheck.folderContainer?.querySelector('.filter-item input[type="checkbox"]:checked')); }
  
  function getCriteriaForData() {
       const yearVal = refs.yearSelect?.value; const monthVal = refs.monthSelect?.value; 
       if (!yearVal || !monthVal) return null;
       const year = parseInt(yearVal); const month = parseInt(monthVal); 
       if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null;
       console.log(`DEBUG: getCriteriaForData - Year: ${year}, Month (1-indexed from dropdown): ${month}`);
       return { 
           selectedPersons: reportsExporter.getSelectedList('peopleContainer'), 
           selectedFolders: reportsExporter.getSelectedList('folderContainer'), 
           options: { reportYear: year, reportMonth: month - 1 } 
       };
  }

  function updateButtonStates() {
    const criteria = getCriteriaForData(); const periodSelected = !!criteria; let hasData = false;
    if (periodSelected && store?.persons && criteria.options.reportYear && criteria.options.reportMonth !== undefined) { 
        const { reportYear: year, reportMonth } = criteria.options; 
        hasData = Object.values(store.persons).some(pd => pd?.[year]?.[reportMonth + 1] && Object.keys(pd[year][reportMonth + 1]).length > 0); 
    }
    const anyPerson = isAnyPersonSelected(refs); const anyFolder = isAnyFolderSelected(refs);
    
    // Check if we have data for the selected year (for yearly report button)
    const yearVal = refs.yearSelect?.value;
    let hasYearData = false;
    if (yearVal && store?.persons) {
        const year = parseInt(yearVal);
        hasYearData = Object.values(store.persons).some(pd => pd?.[year] && Object.keys(pd[year]).length > 0);
    }
    
    if(refs.generateTeamBtn) refs.generateTeamBtn.disabled = !(periodSelected && hasData); 
    if(refs.generateIndividualBtn) refs.generateIndividualBtn.disabled = !(periodSelected && hasData && anyPerson);
    if(refs.generateYearlyBtn) refs.generateYearlyBtn.disabled = !(yearVal && hasYearData && anyPerson);
    const delBtn = refs.deleteBtn || refs.deleteSelectedDataBtn; if(delBtn) delBtn.disabled = !(periodSelected && hasData && anyPerson && anyFolder);
    if(refs.exportBtn) refs.exportBtn.disabled = !isAnyDataLoaded; 
    if(refs.clearAllBtn) refs.clearAllBtn.disabled = !isAnyDataLoaded; 
    if(refs.importBtn) refs.importBtn.disabled = false;
    if(refs.uploadQueueDataBtn) refs.uploadQueueDataBtn.disabled = !periodSelected;

    const currentStatus = (refs.statusDiv || refs.dashboardStatusDiv)?.textContent || '';
    const isProcessing = ['generating', 'deleting', 'importing', 'exporting', 'clearing', 'uploading', 'processing', 'started'].some(term => currentStatus.toLowerCase().includes(term));
    
    if (!isProcessing) {
        if (!periodSelected) updateStatus('Select year and month to enable reports and uploads.'); 
        else if (!hasData && criteria) updateStatus(`No objective data for ${MONTH_NAMES_FULL[criteria.options.reportMonth + 1]} ${criteria.options.reportYear}. Uploads enabled.`); 
        else if (!currentStatus.toLowerCase().includes('error')) updateStatus('Ready.');
    }
  }

  async function populateFilters() {
      if (!refs.yearSelect || !refs.monthSelect) { updateButtonStates(); return; }
      const selYear = refs.yearSelect.value; const selMonth = refs.monthSelect.value;
      console.log(`DEBUG: populateFilters - Using Year: ${selYear}, Month (1-indexed): ${selMonth}`);
      
      if(refs.peopleContainer) refs.peopleContainer.innerHTML = '<p class="empty">Loading people...</p>'; 
      if(refs.folderContainer) refs.folderContainer.innerHTML = '<p class="empty">Loading folders...</p>';
      if(refs.selectAllPeopleCheckbox) { refs.selectAllPeopleCheckbox.checked = true; refs.selectAllPeopleCheckbox.indeterminate = false; refs.selectAllPeopleCheckbox.disabled = true; }
      if(refs.selectAllFoldersCheckbox) { refs.selectAllFoldersCheckbox.checked = true; refs.selectAllFoldersCheckbox.indeterminate = false; refs.selectAllFoldersCheckbox.disabled = true; }

      if (!selYear || !selMonth) { 
          updateButtonStates(); 
          if(refs.peopleContainer) refs.peopleContainer.innerHTML = '<p class="empty">Select Year & Month</p>'; 
          if(refs.folderContainer) refs.folderContainer.innerHTML = '<p class="empty">Select Year & Month</p>'; 
          console.log("DEBUG: populateFilters - Year or Month not selected. Aborting filter population.");
          window.dispatchEvent(new CustomEvent('filters-ready')); 
          return; 
      }
      const storageMonthNum = parseInt(selMonth); 
      if (isNaN(storageMonthNum) || storageMonthNum < 1 || storageMonthNum > 12) { 
          console.warn("DEBUG: populateFilters - Invalid month number:", storageMonthNum);
          updateButtonStates(); 
          window.dispatchEvent(new CustomEvent('filters-ready'));
          return; 
      }
      
      if (!store?.persons || Object.keys(store.persons).length === 0) { 
          if(refs.peopleContainer) refs.peopleContainer.innerHTML = '<p class="empty">No objective data loaded</p>'; 
          if(refs.folderContainer) refs.folderContainer.innerHTML = '<p class="empty">No objective data loaded</p>'; 
          updateButtonStates(); 
          console.log("DEBUG: populateFilters - No persons data in store.");
          window.dispatchEvent(new CustomEvent('filters-ready'));
          return; 
      }
      
      const peopleWithData = Object.keys(store.persons).filter(p => store.persons[p]?.[selYear]?.[storageMonthNum] && Object.keys(store.persons[p][selYear][storageMonthNum]).length > 0).sort();
      renderList(refs.peopleContainer, peopleWithData, 'people'); 
      
      const foldersInData = new Set();
      peopleWithData.forEach(p => { 
          const monthD = store.persons[p]?.[selYear]?.[storageMonthNum]; 
          if (monthD && typeof monthD === 'object') Object.keys(monthD).forEach(fKey => { if (fKey && fKey !== 'undefined' && fKey !== 'null') foldersInData.add(fKey); }); 
      });
      const sortedFolders = Array.from(foldersInData).sort((a, b) => { 
          const iA = FOLDER_ORDER.indexOf(a); const iB = FOLDER_ORDER.indexOf(b); 
          if (iA !== -1 && iB !== -1) return iA - iB; if (iA !== -1) return -1; if (iB !== -1) return 1; 
          return a.localeCompare(b); 
      });
      renderList(refs.folderContainer, sortedFolders, 'folder'); 
      updateButtonStates();
      console.log("DEBUG: populateFilters - Filters populated.");
      window.dispatchEvent(new CustomEvent('filters-ready'));
  }

  function setupDateSelectors() {
      if (!refs.monthSelect || !refs.yearSelect) {
          console.error("DEBUG: setupDateSelectors - Month or Year select element not found.");
          return;
      }
      refs.monthSelect.innerHTML = '<option value="" disabled>Select Month</option>';
      MONTH_NAMES_SHORT.forEach((name, i) => { if (i > 0) { const opt = document.createElement('option'); opt.value = String(i); opt.textContent = name; refs.monthSelect.appendChild(opt); } });
      
      const currentMonth = new Date().getMonth() + 1; // 1-indexed
      refs.monthSelect.value = refs.monthSelect.querySelector(`option[value="${currentMonth}"]`) ? String(currentMonth) : "";
      console.log(`DEBUG: setupDateSelectors - Default month set to (1-indexed): ${refs.monthSelect.value}`);
      
      if (!refs.yearSelect.value && refs.yearSelect.options.length > 1) { 
          refs.yearSelect.value = refs.yearSelect.options[1].value; 
          console.log(`DEBUG: setupDateSelectors - Defaulted year select to: ${refs.yearSelect.value} as it was empty.`);
      }

      [refs.monthSelect, refs.yearSelect].forEach(el => {
          if(el) { 
              el.removeEventListener('change', populateFilters); 
              el.addEventListener('change', () => {
                  console.log(`DEBUG: ${el.id} changed to ${el.value}`);
                  populateFilters();
              });
          }
      });
  }

  function setupSelectDeselect(container, selectAllCheckbox) {
      if (!container || !selectAllCheckbox) return; 
      if (selectAllCheckbox._handler) selectAllCheckbox.removeEventListener('change', selectAllCheckbox._handler);
      selectAllCheckbox._handler = () => { 
          const { checked } = selectAllCheckbox; selectAllCheckbox.indeterminate = false; 
          container.querySelectorAll('.filter-item input[type="checkbox"]:not(:disabled)').forEach(cb => { 
              cb.checked = checked; cb.closest('.filter-item')?.classList.toggle('selected', checked); 
          }); 
          updateButtonStates(); 
      };
      selectAllCheckbox.addEventListener('change', selectAllCheckbox._handler);
  }

  function setupEmailDialogListeners() {
    if (refs.emailReportsOption && refs.emailOptionsContainer) {
        refs.emailReportsOption.addEventListener('change', function() {
            if (refs.emailOptionsContainer) refs.emailOptionsContainer.style.display = this.checked ? 'block' : 'none';
        });
    }
    
    if (refs.configureEmailsLink) {
      refs.configureEmailsLink.addEventListener('click', function(e) {
        e.preventDefault();
        const settingsUrl = browserAPI?.runtime?.getURL ? browserAPI.runtime.getURL('settings.html#email-mappings-section') : 'settings.html#email-mappings-section';
        window.open(settingsUrl, '_blank');
      });
    }
  }

  async function showDetailedReportDialog() {
    if (!refs.dailyReportDialog) {
      reportsExporter.showMessage("Error: Detailed report dialog component not found.", true);
      ErrorManager.logError(null, 'Detailed report dialog element not found.', SEVERITY.CRITICAL, CATEGORY.UI);
      return false;
    }
    console.log(`DEBUG: showDetailedReportDialog - Month from main dropdown (1-indexed): ${refs.monthSelect?.value}, Year: ${refs.yearSelect?.value}`);
    populateWeekSelectionDropdown();

    const selectedPersons = reportsExporter.getSelectedList('peopleContainer');
    const { allMapped, mappedPersons, emailMappings } = await checkEmailMappingsAvailability(selectedPersons);
      
    if (refs.noEmailMappingWarning) {
        const hasSpecificSelectedPeople = Array.isArray(selectedPersons) && selectedPersons.length > 0;
        if (hasSpecificSelectedPeople && !allMapped) {
            const unmapped = selectedPersons.filter(p => !mappedPersons.includes(p));
            refs.noEmailMappingWarning.textContent = `Warning: Missing email mappings for: ${unmapped.join(', ')}. Emails will only be prepared for mapped individuals.`;
            refs.noEmailMappingWarning.style.display = 'block';
        } else {
            refs.noEmailMappingWarning.style.display = 'none';
        }
    }
      
    if (refs.emailReportsOption) {
        const canEnableEmailOption = (Array.isArray(selectedPersons) && mappedPersons.length > 0) || 
                                     (!Array.isArray(selectedPersons) && Object.keys(emailMappings || {}).length > 0);
        refs.emailReportsOption.disabled = !canEnableEmailOption;
        refs.emailReportsOption.checked = canEnableEmailOption;
        if (refs.emailOptionsContainer) {
            refs.emailOptionsContainer.style.display = refs.emailReportsOption.checked ? 'block' : 'none';
        }
    }
    
    if(refs.monthlyDailyOption) refs.monthlyDailyOption.checked = true;
    if(refs.weekSelectionContainer) refs.weekSelectionContainer.style.display = 'none';
    
    refs.dailyReportDialog.style.display = 'flex';
    if (!refs.dailyReportDialog._listenersInitialized) {
        setupDialogEventListeners();
        setupEmailDialogListeners();
        refs.dailyReportDialog._listenersInitialized = true;
    }
    return true;
  }

  function populateWeekSelectionDropdown() {
    if (!refs.weekSelect || !refs.yearSelect || !refs.monthSelect) return;
    refs.weekSelect.innerHTML = ''; 
    const year = parseInt(refs.yearSelect.value);
    const month = parseInt(refs.monthSelect.value); 
    console.log(`DEBUG: populateWeekSelectionDropdown - Year: ${year}, Month (1-indexed): ${month}`);
    if (isNaN(year) || isNaN(month)) {
        console.warn("populateWeekSelectionDropdown: Year or Month is NaN or not selected, cannot populate weeks.");
        return;
    }

    try {
      const firstD = new Date(year, month - 1, 1); 
      const lastD = new Date(year, month, 0);
      const weeks = {};
      for (let d = new Date(firstD); d <= lastD; d.setDate(d.getDate() + 1)) {
        const curDate = new Date(d);
        const wNum = getWeekNumber(curDate);
        if (!weeks[wNum]) {
          let weekStartDate = new Date(curDate);
          weekStartDate.setDate(curDate.getDate() - (curDate.getDay() + 6) % 7); 
          let weekEndDate = new Date(weekStartDate);
          weekEndDate.setDate(weekStartDate.getDate() + 6);
          weeks[wNum] = { 
            start: weekStartDate, end: weekEndDate,
            displayStart: new Date(curDate), displayEnd: new Date(curDate) 
          };
        } else {
          weeks[wNum].displayEnd = new Date(curDate);
        }
      }
      Object.entries(weeks).forEach(([w, dates]) => {
        const opt = document.createElement('option'); 
        opt.value = w;
        opt.dataset.isoStartDate = dates.start.toISOString();
        opt.dataset.isoEndDate = dates.end.toISOString();
        opt.textContent = `Week ${w} (${formatDateShort(dates.displayStart)} - ${formatDateShort(dates.displayEnd)})`;
        refs.weekSelect.appendChild(opt);
      });
    } catch (e) { console.error("Err populating weeks:", e); ErrorManager.logError(e, 'Populating weeks failed.', SEVERITY.MEDIUM, CATEGORY.UI); }
  }

  function formatDateShort(date) { return `${date.getDate()} ${MONTH_NAMES_SHORT[date.getMonth() + 1]}`; }

  function setupDialogEventListeners() {
    if (!refs.dailyReportDialog || refs.dailyReportDialog._listenersInitialized) return;
    
    const requiredDialogRefs = ['closeDialogBtn', 'cancelDialogBtn', 'generateDetailedReportsBtn', 
                                'monthlyDailyOption', 'weeklyDailyOption', 'monthlySplitOption', 
                                'weekSelectionContainer', 'weekSelect', 'emailReportsOption', 'emailOptionsContainer'];
    for (const refKey of requiredDialogRefs) {
        if (!refs[refKey]) {
            console.warn(`Dialog element for listener setup is missing: ${refKey}.`);
        }
    }
    
    refs.dailyReportDialog._listenersInitialized = true;
    const toggleWeekSel = () => {
        if(refs.weekSelectionContainer && refs.weeklyDailyOption) refs.weekSelectionContainer.style.display = refs.weeklyDailyOption.checked ? 'block' : 'none';
    };

    if(refs.monthlyDailyOption) refs.monthlyDailyOption.addEventListener('change', toggleWeekSel);
    if(refs.weeklyDailyOption) refs.weeklyDailyOption.addEventListener('change', toggleWeekSel);
    if(refs.monthlySplitOption) refs.monthlySplitOption.addEventListener('change', toggleWeekSel);
    toggleWeekSel();

    if(refs.closeDialogBtn) refs.closeDialogBtn.addEventListener('click', closeDetailedReportDialog);
    if(refs.cancelDialogBtn) refs.cancelDialogBtn.addEventListener('click', closeDetailedReportDialog);
    if(refs.generateDetailedReportsBtn) refs.generateDetailedReportsBtn.addEventListener('click', () => {
      handleGenerateDetailedReports();
    });
  }

  function closeDetailedReportDialog() { if (refs.dailyReportDialog) refs.dailyReportDialog.style.display = 'none'; }

  function handleGenerateDetailedReports() {
    let reportType = 'monthlyDaily'; 
    if (refs.weeklyDailyOption?.checked) reportType = 'weeklyDaily';
    else if (refs.monthlySplitOption?.checked) reportType = 'monthlySplit';

    let selWeek = null;
    let weekStartDateISO = null;
    let weekEndDateISO = null;

    if (reportType === 'weeklyDaily' && refs.weekSelect?.options && refs.weekSelect.selectedIndex !== -1) {
        const selectedOption = refs.weekSelect.options[refs.weekSelect.selectedIndex];
        selWeek = selectedOption.value;
        weekStartDateISO = selectedOption.dataset.isoStartDate;
        weekEndDateISO = selectedOption.dataset.isoEndDate;
    }

    const year = refs.yearSelect?.value; 
    const monthFromDropdown = refs.monthSelect?.value;
    
    console.log(`DEBUG: handleGenerateDetailedReports - Year: ${year}, Month from Dropdown (1-indexed): ${monthFromDropdown}, Report Type: ${reportType}, Selected Week No: ${selWeek}`);

    if (!year || !monthFromDropdown) { 
        reportsExporter.showMessage("Year and month must be selected.", true); 
        return; 
    }
    const monthZeroIndexed = parseInt(monthFromDropdown) - 1;

    const emailOptions = {
      enabled: refs.emailReportsOption?.checked || false,
      ccMyself: false, 
      includeCoverMessage: false, 
      coverMessage: "" 
    };
    
    const exportOptions = {
      year: parseInt(year), 
      month: monthZeroIndexed, 
      format: 'pdf', 
      isTeam: false,
      selectedPersons: reportsExporter.getSelectedList('peopleContainer'),
      selectedFolders: reportsExporter.getSelectedList('folderContainer'),
      detailedReportType: reportType, 
      selectedWeek: selWeek, 
      weekStartDate: weekStartDateISO, 
      weekEndDate: weekEndDateISO,   
      email: emailOptions
    };

    let desc = reportType === 'monthlyDaily' ? 'Daily breakdown for month' : 
               reportType === 'weeklyDaily' ? `Daily breakdown for Week ${selWeek}` : 
               'Weekly splits for month';
    updateStatus(`Generating ${desc}...${emailOptions.enabled ? ' Will prepare emails.' : ''}`);

    reportsExporter.exportReportPdf(exportOptions)
      .then(success => { 
          if (success) { 
              updateStatus('Detailed report generation process started.'); 
              closeDetailedReportDialog(); 
          }
      })
      .catch(err => { 
          updateStatus(`Error generating detailed reports: ${err.message}`, true); 
          console.error("Detailed report generation error:", err); 
          ErrorManager.logError(err, 'Detailed report generation failed from reports.js.', SEVERITY.HIGH, CATEGORY.REPORTING);
      });
  }

  if (refs.generateTeamBtn) refs.generateTeamBtn.addEventListener('click', () => handleGenerateClick(true));
  if (refs.generateIndividualBtn) refs.generateIndividualBtn.addEventListener('click', () => handleGenerateClick(false));
  if (refs.generateYearlyBtn) refs.generateYearlyBtn.addEventListener('click', () => handleYearlyReportClick());
  
  // Yearly Report Modal Elements
  const yearlyModal = document.getElementById('yearlyReportModal');
  const closeYearlyModalBtn = document.getElementById('closeYearlyModalBtn');
  const cancelYearlyBtn = document.getElementById('cancelYearlyBtn');
  const generateYearlyReportBtn = document.getElementById('generateYearlyReportBtn');
  const yearlyPeopleList = document.getElementById('yearlyPeopleList');
  const yearlyFoldersList = document.getElementById('yearlyFoldersList');
  const excludeAllPeople = document.getElementById('excludeAllPeople');
  const excludeAllFolders = document.getElementById('excludeAllFolders');
  const yearlySummary = document.getElementById('yearlySummary');
  
  // Store available people/folders for the modal
  let availablePeople = [];
  let availableFolders = [];
  
  async function showYearlyModal() {
    if (!yearlyModal) return;
    
    const selectedYear = parseInt(refs.yearSelect?.value);
    if (!selectedYear) {
      reportsExporter.showMessage("Please select a year first.", true);
      return;
    }
    
    // Get ALL people and folders from storage for the entire year (not just current month)
    const allPeopleForYear = new Set();
    const allFoldersForYear = new Set();
    
    if (store?.persons) {
      Object.keys(store.persons).forEach(personName => {
        const personYearData = store.persons[personName]?.[selectedYear];
        if (personYearData && typeof personYearData === 'object') {
          // Person has data for this year
          allPeopleForYear.add(personName);
          
          // Check all months for folders
          Object.keys(personYearData).forEach(monthKey => {
            const monthData = personYearData[monthKey];
            if (monthData && typeof monthData === 'object') {
              Object.keys(monthData).forEach(folderName => {
                allFoldersForYear.add(folderName);
              });
            }
          });
        }
      });
    }
    
    // Sort people alphabetically
    availablePeople = Array.from(allPeopleForYear).sort((a, b) => a.localeCompare(b));
    
    // Sort folders by FOLDER_ORDER
    availableFolders = Array.from(allFoldersForYear).sort((a, b) => {
      const indexA = FOLDER_ORDER.indexOf(a);
      const indexB = FOLDER_ORDER.indexOf(b);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.localeCompare(b);
    });
    
    // Populate checkboxes
    populateYearlyCheckboxList(yearlyPeopleList, availablePeople, 'person');
    populateYearlyCheckboxList(yearlyFoldersList, availableFolders, 'folder');
    
    // Reset exclude all checkboxes
    if (excludeAllPeople) excludeAllPeople.checked = false;
    if (excludeAllFolders) excludeAllFolders.checked = false;
    
    updateYearlySummary();
    yearlyModal.style.display = 'flex';
  }
  
  function hideYearlyModal() {
    if (yearlyModal) yearlyModal.style.display = 'none';
  }
  
  function populateYearlyCheckboxList(container, items, type) {
    if (!container) return;
    container.innerHTML = '';
    
    if (!items || items.length === 0) {
      container.innerHTML = '<p class="empty">No items available</p>';
      return;
    }
    
    items.forEach(item => {
      const label = document.createElement('label');
      label.className = 'yearly-checkbox-item';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = item;
      checkbox.dataset.type = type;
      checkbox.addEventListener('change', updateYearlySummary);
      
      const span = document.createElement('span');
      span.textContent = item;
      
      label.appendChild(checkbox);
      label.appendChild(span);
      container.appendChild(label);
    });
  }
  
  function updateYearlySummary() {
    if (!yearlySummary) return;
    
    const excludedPeople = getExcludedItems('person');
    const excludedFolders = getExcludedItems('folder');
    const includedPeople = (availablePeople || []).filter(p => !excludedPeople.includes(p));
    const includedFolders = (availableFolders || []).filter(f => !excludedFolders.includes(f));
    
    const canGenerate = includedPeople.length > 0 && includedFolders.length > 0;
    
    if (generateYearlyReportBtn) {
      generateYearlyReportBtn.disabled = !canGenerate;
    }
    
    if (!canGenerate) {
      yearlySummary.innerHTML = '<span class="warning">⚠️ At least one person and one folder must be included.</span>';
    } else {
      yearlySummary.innerHTML = `<span class="info">📊 Report will include <strong>${includedPeople.length}</strong> ${includedPeople.length === 1 ? 'person' : 'people'} and <strong>${includedFolders.length}</strong> ${includedFolders.length === 1 ? 'folder' : 'folders'}.</span>`;
    }
  }
  
  function getExcludedItems(type) {
    const container = type === 'person' ? yearlyPeopleList : yearlyFoldersList;
    if (!container) return [];
    
    const checkboxes = container.querySelectorAll(`input[type="checkbox"][data-type="${type}"]:checked`);
    return Array.from(checkboxes).map(cb => cb.value);
  }
  
  function toggleAllExclusions(type, excluded) {
    const container = type === 'person' ? yearlyPeopleList : yearlyFoldersList;
    if (!container) return;
    
    const checkboxes = container.querySelectorAll(`input[type="checkbox"][data-type="${type}"]`);
    checkboxes.forEach(cb => { cb.checked = excluded; });
    updateYearlySummary();
  }
  
  // Event listeners for yearly modal
  if (closeYearlyModalBtn) closeYearlyModalBtn.addEventListener('click', hideYearlyModal);
  if (cancelYearlyBtn) cancelYearlyBtn.addEventListener('click', hideYearlyModal);
  if (yearlyModal) {
    yearlyModal.addEventListener('click', (e) => {
      if (e.target === yearlyModal) hideYearlyModal();
    });
  }
  
  if (excludeAllPeople) {
    excludeAllPeople.addEventListener('change', () => toggleAllExclusions('person', excludeAllPeople.checked));
  }
  if (excludeAllFolders) {
    excludeAllFolders.addEventListener('change', () => toggleAllExclusions('folder', excludeAllFolders.checked));
  }
  
  if (generateYearlyReportBtn) {
    generateYearlyReportBtn.addEventListener('click', () => executeYearlyReportGeneration());
  }
  
  async function handleYearlyReportClick() {
    const btn = refs.generateYearlyBtn;
    if (!btn || btn.disabled) return;

    const yearVal = refs.yearSelect?.value;
    
    if (!yearVal) {
      reportsExporter.showMessage("Year must be selected for yearly reports.", true);
      return;
    }
    
    // Show the exclusion modal instead of generating directly
    await showYearlyModal();
  }
  
  async function executeYearlyReportGeneration() {
    const btn = refs.generateYearlyBtn;
    const yearVal = refs.yearSelect?.value;
    
    // Get excluded items from the modal
    const excludedPeople = getExcludedItems('person');
    const excludedFolders = getExcludedItems('folder');
    
    // Get optional settings
    const includeMonthlyBreakdowns = document.getElementById('includeMonthlyBreakdowns')?.checked ?? true;
    
    // Filter to get only included items
    const selPersons = (availablePeople || []).filter(p => !excludedPeople.includes(p));
    const selFolders = (availableFolders || []).filter(f => !excludedFolders.includes(f));
    
    if (selPersons.length === 0 || selFolders.length === 0) {
      reportsExporter.showMessage("At least one person and one folder must be included.", true);
      return;
    }
    
    hideYearlyModal();
    
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Generating...';
    }
    updateStatus('Generating yearly reports...');
    
    try {
      const expOpts = {
        year: parseInt(yearVal),
        selectedPersons: selPersons,
        selectedFolders: selFolders,
        isYearly: true,
        includeMonthlyBreakdowns: includeMonthlyBreakdowns
      };
      
      await reportsExporter.exportYearlyReportPdf(expOpts);
    } catch (e) {
      reportsExporter.showMessage(`Yearly report export failed: ${e.message}`, true);
      updateStatus(`Yearly report export failed: ${e.message}`, true);
      ErrorManager.logError(e, 'Yearly report export failed.', SEVERITY.HIGH, CATEGORY.REPORTING);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Yearly Report';
      }
      const currentStatus = (refs.statusDiv || refs.dashboardStatusDiv)?.textContent || '';
      if (!currentStatus.toLowerCase().includes('error') && currentStatus.toLowerCase().includes('generating')) {
        updateStatus('Ready.');
      }
    }
  }
  
  async function handleGenerateClick(isTeam) {
    const btn = isTeam ? refs.generateTeamBtn : refs.generateIndividualBtn;
    if (!btn || btn.disabled) return;

    const format = refs.reportFormatSelect?.value || 'pdf';
    const yearVal = refs.yearSelect?.value; 
    const monthValFromDropdown = refs.monthSelect?.value;

    console.log(`DEBUG: handleGenerateClick - Year: ${yearVal}, Month from Dropdown (1-indexed): ${monthValFromDropdown}, Is Team: ${isTeam}`);

    if (!yearVal || !monthValFromDropdown) { 
        reportsExporter.showMessage("Year and Month must be selected.", true); 
        return; 
    }
    const monthZeroIndexed = parseInt(monthValFromDropdown) - 1;

    const selPersons = reportsExporter.getSelectedList('peopleContainer');
    const selFolders = reportsExporter.getSelectedList('folderContainer');

    if (!isTeam && format === 'pdf' && Array.isArray(selPersons) && selPersons.length > 0) {
      const dialogShown = await showDetailedReportDialog();
      if (dialogShown) return;
    }
    
    btn.disabled = true; const origTxt = btn.textContent; btn.textContent = 'Generating...';
    updateStatus(`Generating ${isTeam ? 'team' : 'individual'} ${format.toUpperCase()}...`);

    try {
      const expOpts = { 
          year: parseInt(yearVal), 
          month: monthZeroIndexed, 
          format, isTeam, 
          selectedPersons: selPersons, 
          selectedFolders: selFolders, 
          email: { enabled: false }
      };
      if (format === 'pdf') await reportsExporter.exportReportPdf(expOpts);
      else if (format === 'csv') await reportsExporter.exportAllDataCsv(expOpts);
      else reportsExporter.showMessage(`Unsupported format: ${format}`, true);
    } catch (e) { 
      reportsExporter.showMessage(`Export failed: ${e.message}`, true); 
      updateStatus(`Export failed: ${e.message}`, true);
      ErrorManager.logError(e, `Standard ${format} export failed.`, SEVERITY.HIGH, CATEGORY.REPORTING);
    } finally {
      btn.disabled = false; btn.textContent = origTxt;
      const currentStatus = (refs.statusDiv || refs.dashboardStatusDiv)?.textContent || '';
      if (!currentStatus.toLowerCase().includes('error') && currentStatus.toLowerCase().includes('generating')) updateStatus('Ready.');
    }
  }
  
  const delActualBtn = refs.deleteBtn || refs.deleteSelectedDataBtn;
  if (delActualBtn) {
    delActualBtn.addEventListener('click', () => {
      const crit = getCriteriaForData(); 
      console.log("DEBUG: Criteria for delete:", JSON.stringify(crit)); 
      if (!crit) { updateStatus('Year and month required for delete.', true); return; }
      if (!isAnyPersonSelected(refs) || !isAnyFolderSelected(refs)) { updateStatus('Select people and folders for deletion.', true); return; }
      
      let pText = (refs.selectAllPeopleCheckbox?.checked && !refs.selectAllPeopleCheckbox.indeterminate) || crit.selectedPersons === null ? "ALL people" : `${Array.isArray(crit.selectedPersons) ? crit.selectedPersons.length : 'selected'} people`;
      let fText = (refs.selectAllFoldersCheckbox?.checked && !refs.selectAllFoldersCheckbox.indeterminate) || crit.selectedFolders === null ? "ALL folders" : `${Array.isArray(crit.selectedFolders) ? crit.selectedFolders.length : 'selected'} folders`;
      const mText = MONTH_NAMES_FULL[crit.options.reportMonth + 1];
      
      if (confirm(`⚠️ DELETE DATA ⚠️\n\nRemove objective data for:\n- People: ${pText}\n- Folders: ${fText}\n- Period: ${mText} ${crit.options.reportYear}\n\nThis CANNOT be undone. Proceed?`)) {
        updateStatus('Deleting data...'); delActualBtn.disabled = true;
        browserAPI.runtime.sendMessage({ action: ACTION_DELETE_DATA, criteria: crit })
          .catch(e => { 
            updateStatus(`Delete message error: ${e.message}`, true); 
            console.error("Delete send error:", e); 
            delActualBtn.disabled = false;
            ErrorManager.logError(e, "Failed to send delete message to background.", SEVERITY.ERROR, CATEGORY.COMMUNICATION);
          });
      } else {
        updateStatus("Deletion cancelled.");
      }
    });
  }

  if (refs.clearAllBtn) { 
    refs.clearAllBtn.addEventListener('click', () => {
        if (confirm("⚠️ CLEAR ALL DATA ⚠️\n\nThis will remove ALL stored objective data and logs. This action CANNOT be undone. Proceed?")) {
            updateStatus('Clearing all data...');
            browserAPI.runtime.sendMessage({ action: ACTION_CLEAR_ALL_DATA })
                .catch(e => { 
                    updateStatus(`Clear all data message error: ${e.message}`, true); 
                    console.error("Clear all data send error:", e);
                    ErrorManager.logError(e, "Failed to send clear all data message.", SEVERITY.ERROR, CATEGORY.COMMUNICATION);
                });
        } else {
            updateStatus("Clear all data cancelled.");
        }
    });
  }
  
  if (refs.exportBtn) { 
    refs.exportBtn.addEventListener('click', () => {
        updateStatus('Preparing full data export...');
        browserAPI.runtime.sendMessage({ action: ACTION_EXPORT_ALL_DATA })
            .catch(e => { 
                updateStatus(`Export all data message error: ${e.message}`, true); 
                console.error("Export all data send error:", e);
                ErrorManager.logError(e, "Failed to send export all data message.", SEVERITY.ERROR, CATEGORY.COMMUNICATION);
            });
    });
   }
   
  if (refs.importBtn && refs.importFile) { 
    refs.importBtn.addEventListener('click', () => refs.importFile.click());
    refs.importFile.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                updateStatus('Importing data...');
                browserAPI.runtime.sendMessage({ action: ACTION_IMPORT_ALL_DATA, data: e.target.result, filename: file.name })
                    .catch(err => { 
                        updateStatus(`Import data message error: ${err.message}`, true); 
                        console.error("Import data send error:", err);
                        ErrorManager.logError(err, "Failed to send import all data message.", SEVERITY.ERROR, CATEGORY.COMMUNICATION);
                    });
            };
            reader.onerror = (e) => {
                updateStatus(`File read error: ${e.target.error.name}`, true);
                ErrorManager.logError(e.target.error, "File read error during import.", SEVERITY.ERROR, CATEGORY.STORAGE);
            };
            reader.readAsText(file);
            refs.importFile.value = '';
        }
    });
  }
  
  if (refs.backBtn) refs.backBtn.addEventListener('click', () => { window.location.href = 'main.html'; });
  
  if (refs.uploadQueueDataBtn && refs.queueDataFile) { 
    refs.uploadQueueDataBtn.addEventListener('click', () => refs.queueDataFile.click());
    refs.queueDataFile.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        const crit = getCriteriaForData();
        if (!crit) {
            updateStatus('Select year and month before uploading queue data.', true, 'queue');
            refs.queueDataFile.value = '';
            return;
        }
        if (file) {
            updateStatus('Processing queue data file...', false, 'queue');
            try {
                const content = await file.text();
                const parsedData = JSON.parse(content);
                
                if (!parsedData || typeof parsedData.year !== 'number' || typeof parsedData.month !== 'number' || !parsedData.persons) {
                    throw new Error("Invalid queue data file structure. Expected year, month, and persons properties.");
                }

                if (parsedData.year !== crit.options.reportYear || parsedData.month !== (crit.options.reportMonth +1) ) {
                     if(!confirm(`Warning: Queue data is for ${MONTH_NAMES_FULL[parsedData.month]} ${parsedData.year}, but you have ${MONTH_NAMES_FULL[crit.options.reportMonth+1]} ${crit.options.reportYear} selected. Continue with queue data's period?`)){
                        updateStatus("Queue data upload cancelled by user due to period mismatch.", false, 'queue');
                        refs.queueDataFile.value = ''; 
                        return;
                     }
                }
                
                await StorageManager.storeCompressed(STORAGE_KEY_QUEUE_DATA, parsedData);
                updateStatus(`Queue data for ${MONTH_NAMES_FULL[parsedData.month]} ${parsedData.year} uploaded successfully. Reports will use this if applicable.`, false, 'queue');
            } catch (e) {
                updateStatus(`Error processing queue data: ${e.message}`, true, 'queue');
                ErrorManager.logError(e, "Queue data processing/upload failed.", SEVERITY.ERROR, CATEGORY.STORAGE);
            } finally {
                refs.queueDataFile.value = '';
            }
        }
    });
  }

  function handleBackgroundMessage(message, sender, sendResponse) {
    console.log('Reports.js: Message received from background:', message);
    switch (message.action) {
        case ACTION_DELETE_COMPLETE:
            if (message.success) {
                updateStatus(`Data deletion successful. ${message.deletedCount || 0} entries removed. Refreshing view...`);
                console.log(`Reports.js: ACTION_DELETE_COMPLETE success, deleted ${message.deletedCount}. Reloading data.`);
                loadData();
            } else {
                updateStatus(`Data deletion failed: ${message.error || 'Unknown error'}`, true);
                console.error('Reports.js: ACTION_DELETE_COMPLETE failed:', message.error);
            }
            const delActualBtn = refs.deleteBtn || refs.deleteSelectedDataBtn;
            if (delActualBtn) {
                updateButtonStates();
            }
            break;
        case ACTION_DATA_UPDATED:
            updateStatus(message.message || 'Data has been updated. Refreshing view...');
            console.log('Reports.js: ACTION_DATA_UPDATED received. Reloading data.');
            loadData();
            break;
        case ACTION_PROCESSING_COMPLETE:
             updateStatus(message.message || 'Processing complete. Refreshing data view.');
             console.log('Reports.js: ACTION_PROCESSING_COMPLETE received. Reloading data.');
             loadData();
             break;
        default:
            console.log('Reports.js: Received unhandled message action:', message.action);
            break;
    }
    return true; 
  }
  if(browserAPI?.runtime?.onMessage) browserAPI.runtime.onMessage.addListener(handleBackgroundMessage);
  else { console.error("Reports.js: Cannot add message listener."); updateStatus("Error: Cannot communicate with background.", true); }

  // *** ENHANCED: Updated loadData to use enhanced loading with fallback ***
  async function loadData() {
      updateStatus('Loading data...');
      [refs.generateIndividualBtn, refs.generateTeamBtn, refs.deleteBtn, refs.deleteSelectedDataBtn, refs.clearAllBtn, refs.exportBtn, refs.uploadQueueDataBtn]
        .filter(Boolean).forEach(btn => { if(btn) btn.disabled = true; });
      if(refs.importBtn) refs.importBtn.disabled = false; 
      
      try {
          console.log('Reports: Starting enhanced data load...');
          const data = await loadDataWithFallback();
          
          isAnyDataLoaded = !!(data?.persons && Object.keys(data.persons).length > 0);
          store = isAnyDataLoaded ? data : { persons: {}, folders: {} };
          console.log(`DEBUG: loadData - isAnyDataLoaded: ${isAnyDataLoaded}, persons: ${Object.keys(store.persons).length}`);
          
          const yearsWithObjectiveData = isAnyDataLoaded ? [...new Set(Object.values(store.persons || {}).flatMap(pData => Object.keys(pData || {}).map(yearStr => parseInt(yearStr)).filter(y => !isNaN(y))))] : [];
          const uniqueYears = [...new Set(yearsWithObjectiveData)];
          console.log(`DEBUG: loadData - Unique years from data: ${uniqueYears.join(', ')}`);

          populateYearDropdown(uniqueYears); 
          setupDateSelectors(); 
          await populateFilters();
      } catch (e) { 
          updateStatus(`Error loading data: ${e.message}`, true); 
          console.error('Error loading data:', e); 
          ErrorManager.logError(e, 'Failed to load initial data.', SEVERITY.CRITICAL, CATEGORY.STORAGE);
          store = { persons: {}, folders: {} }; isAnyDataLoaded = false; 
          populateYearDropdown([]); 
          setupDateSelectors(); 
          updateButtonStates(); 
          window.dispatchEvent(new CustomEvent('filters-ready'));
      }
  }

  // *** ENHANCED: Setup event listeners for import scenarios ***
  function setupImportEventListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('dataImported', (event) => {
        console.log('Reports: Data import detected, reloading data...');
        updateStatus('Data imported successfully. Refreshing view...');
        setTimeout(() => loadData(), 500);
      });

      window.addEventListener('postImportMigrationComplete', () => {
        console.log('Reports: Post-import migration completed, reloading data...');
        updateStatus('Import processing complete. Refreshing view...');
        setTimeout(() => loadData(), 200);
      });

      window.addEventListener('storageRefreshed', () => {
        console.log('Reports: Storage refresh detected, reloading data...');
        updateStatus('Storage refreshed. Updating view...');
        loadData();
      });

      window.addEventListener('dataRefreshNeeded', () => {
        console.log('Reports: Data refresh requested, reloading...');
        updateStatus('Data refresh requested. Updating...');
        loadData();
      });
    }
  }

  // Initialize everything
  loadData(); 
  setupImportEventListeners();
  
  setupSelectDeselect(refs.peopleContainer, refs.selectAllPeopleCheckbox);
  setupSelectDeselect(refs.folderContainer, refs.selectAllFoldersCheckbox);

});