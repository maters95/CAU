// data-backup-utility.js - FIXED to export/import ALL data sources
'use strict';

import { ErrorManager, SEVERITY, CATEGORY } from './enhanced-error-manager.js';
import { StorageManager } from './storage-manager.js';
import { NotificationSystem, NOTIFICATION_TYPE } from './notification-system.js';
import { VERSION } from './version-manager.js';
import {
  ALARM_DAILY_BACKUP,
  ALARM_WEEKLY_MAINTENANCE,
  ALARM_MONTHLY_ARCHIVING,
  STORAGE_KEY_BACKUPS,
  STORAGE_KEY_LAST_BACKUP,
  STORAGE_KEY_FOLDERS_CONFIG,
  STORAGE_KEY_LOGS,
  STORAGE_KEY_ERRORS,
  STORAGE_KEY_NOTIFICATIONS,
  STORAGE_KEY_VERSION,
  STORAGE_KEY_HOLIDAYS,
  STORAGE_KEY_HOLIDAYS_FETCHED,
  STORAGE_KEY_DATA,
  STORAGE_KEY_BACKUPS_DISABLED
} from './constants.js';

const browserAPI = (typeof chrome !== 'undefined') ? chrome : (typeof browser !== 'undefined' ? browser : null);

// Configuration
const MAX_AUTO_BACKUPS = 10;
const QUOTA_WARNING_THRESHOLD = 80;
const QUOTA_CRITICAL_THRESHOLD = 95;

// CRITICAL: Keys that should NEVER be exported (to avoid backup loops and security issues)
const EXCLUDED_KEYS = [
  'backup_',           // All backup entries (to avoid recursive backups)
  'import',           // Import state flags
  'session',          // Session data
  'temp',             // Temporary data
];

// Helper function to check if a key should be excluded
function shouldExcludeKey(key) {
  return EXCLUDED_KEYS.some(excludedPrefix => key.startsWith(excludedPrefix));
}

async function safeStorageRetrieve(key) {
    try {
        if (typeof window !== 'undefined' && window.waitForStorageManager) {
            await window.waitForStorageManager();
        }
        
        if (StorageManager.pako) {
            return await StorageManager.retrieveAndDecompress(key);
        } else {
            const result = await browserAPI.storage.local.get(key);
            return result[key] || null;
        }
    } catch (error) {
        console.error(`SafeStorage: Failed to retrieve ${key}, using fallback:`, error);
        const result = await browserAPI.storage.local.get(key);
        return result[key] || null;
    }
}

async function safeStorageStore(key, data) {
    try {
        if (typeof window !== 'undefined' && window.waitForStorageManager) {
            await window.waitForStorageManager();
        }
        
        if (StorageManager.pako) {
            await StorageManager.storeGenericData(key, data);
        } else {
            await browserAPI.storage.local.set({ [key]: data });
        }
    } catch (error) {
        console.error(`SafeStorage: Failed to store ${key}, using fallback:`, error);
        await browserAPI.storage.local.set({ [key]: data });
    }
}

export const DataBackupUtility = {
  /**
   * COMPREHENSIVE: Enhanced backup creation that exports from ALL sources
   */
  async createBackup(name = '', description = '', automatic = false, keysToBackup = null) {
    console.log(`DataBackupUtility: Starting COMPREHENSIVE backup creation (Automatic: ${automatic}). Name: "${name}"`);
    try {
      if (!browserAPI || !browserAPI.storage || !browserAPI.storage.local) {
        throw new Error('Browser storage API is not available for backup.');
      }
      
      const timestamp = new Date().toISOString();
      const backupName = name || `Backup ${timestamp.replace(/[:.]/g, '-')}`;
      const backupId = `backup_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      
      // COMPREHENSIVE: Get data from ALL sources
      const dataToBackup = await this._getComprehensiveDataForBackup(keysToBackup);
      
      const includedKeys = Object.keys(dataToBackup);
      console.log(`DataBackupUtility: COMPREHENSIVE backup includes ${includedKeys.length} keys:`, includedKeys);

      const backupMeta = {
        id: backupId,
        name: backupName,
        description: description || `Comprehensive backup created on ${new Date(timestamp).toLocaleString()}`,
        timestamp,
        version: VERSION.current,
        automatic,
        keys: includedKeys,
        dataTypes: {
          hasObjectiveData: !!dataToBackup.objectiveCumulativeData,
          hasFolders: !!dataToBackup.ecmFolders,
          hasEmailMappings: !!dataToBackup.ecmEmailMappings,
          hasSettings: !!dataToBackup.ecmExtensionVersion,
          hasHolidays: !!dataToBackup.ecmHolidays,
          hasLogs: !!dataToBackup.ecmExecutionLogs,
          totalKeys: includedKeys.length
        }
      };
      
      const backupData = { meta: backupMeta, data: dataToBackup };

      await browserAPI.storage.local.set({ [backupId]: backupData });
      await this._updateBackupRegistry(backupMeta);
      await browserAPI.storage.local.set({ [STORAGE_KEY_LAST_BACKUP]: timestamp });

      // Enhanced success message
      const successMsg = `Comprehensive backup "${backupName}" created with ${includedKeys.length} data keys`;
      console.log(`DataBackupUtility: ${successMsg}`);

      if (!automatic) {
        try {
          NotificationSystem.showInAppNotification(successMsg, NOTIFICATION_TYPE.SUCCESS);
        } catch (uiNotifyError) {
          console.warn(`DataBackupUtility: Fallback to browser notification`);
          NotificationSystem.showNotification('Backup Created', successMsg, NOTIFICATION_TYPE.SUCCESS);
        }
      }
      
      if (automatic) {
        await this._cleanupOldAutomaticBackups();
      }
      
      return { success: true, backupId, timestamp, message: successMsg, dataTypes: backupMeta.dataTypes };
      
    } catch (error) {
      console.error(`DataBackupUtility: Failed to create comprehensive backup - ${error.message}`, error);
      ErrorManager.logError('Failed to create comprehensive backup', { name, automatic, error: error.message }, SEVERITY.ERROR, CATEGORY.STORAGE);
      
      const errorMsg = `Failed to create backup: ${error.message}`;
      if (!automatic) {
        try { 
          NotificationSystem.showInAppNotification(errorMsg, NOTIFICATION_TYPE.ERROR); 
        } catch (uiNotifyError) { 
          NotificationSystem.showNotification('Backup Failed', errorMsg, NOTIFICATION_TYPE.ERROR); 
        }
      } else {
        NotificationSystem.showNotification('Automatic Backup Failed', errorMsg, NOTIFICATION_TYPE.ERROR);
      }
      
      return { success: false, error: error.message };
    }
  },

  /**
   * COMPREHENSIVE: Get ALL data from both IndexedDB and chrome.storage.local
   */
  async _getComprehensiveDataForBackup(keysToBackup = null) {
    console.log("DataBackupUtility: Gathering COMPREHENSIVE data from ALL sources...");
    
    try {
      // Step 1: Get ALL chrome.storage.local data
      console.log("DataBackupUtility: Step 1 - Getting ALL chrome.storage.local data...");
      const allBrowserData = await this._getAllBrowserStorageData(keysToBackup);
      console.log(`DataBackupUtility: Found ${Object.keys(allBrowserData).length} keys in chrome.storage.local:`, Object.keys(allBrowserData));
      
      // Step 2: Get IndexedDB data and ensure it's included
      console.log("DataBackupUtility: Step 2 - Getting IndexedDB data...");
      try {
        if (typeof window !== 'undefined' && window.waitForStorageManager) {
          await window.waitForStorageManager();
        }
        
        const indexedData = await StorageManager.retrieveAndDecompress(STORAGE_KEY_DATA);
        console.log("DataBackupUtility: IndexedDB data check:", {
          hasData: !!indexedData,
          hasPersons: !!(indexedData?.persons),
          personCount: indexedData?.persons ? Object.keys(indexedData.persons).length : 0,
          folderCount: indexedData?.folders ? Object.keys(indexedData.folders).length : 0
        });
        
        if (indexedData && indexedData.persons && Object.keys(indexedData.persons).length > 0) {
          console.log("DataBackupUtility: Found IndexedDB data, ensuring it's in export format...");
          
          // CRITICAL: Always include IndexedDB data as objectiveCumulativeData
          allBrowserData.objectiveCumulativeData = {
            compressed: false,
            data: JSON.stringify(indexedData)
          };
          
          console.log("DataBackupUtility: IndexedDB data converted to export format");
          console.log("DataBackupUtility: IndexedDB persons:", Object.keys(indexedData.persons));
          
          // Ensure folders are properly represented
          if (indexedData.folders && Object.keys(indexedData.folders).length > 0) {
            // Update ecmFolders if not already present or incomplete
            if (!allBrowserData.ecmFolders || !Array.isArray(allBrowserData.ecmFolders) || allBrowserData.ecmFolders.length === 0) {
              allBrowserData.ecmFolders = Object.entries(indexedData.folders).map(([name, data]) => ({
                name: name,
                displayName: name,
                lastProcessed: data.lastProcessed || new Date().toISOString()
              }));
              console.log("DataBackupUtility: Created ecmFolders from IndexedDB folder data");
            }
          }
        } else {
          console.log("DataBackupUtility: No IndexedDB data found or empty");
        }
        
      } catch (indexedError) {
        console.warn("DataBackupUtility: Error accessing IndexedDB:", indexedError.message);
      }
      
      // Step 3: Validate comprehensive data
      console.log("DataBackupUtility: Step 3 - Validating comprehensive data...");
      const dataAnalysis = {
        totalKeys: Object.keys(allBrowserData).length,
        hasObjectiveData: !!allBrowserData.objectiveCumulativeData,
        hasFolders: !!allBrowserData.ecmFolders,
        hasEmailMappings: !!allBrowserData.ecmEmailMappings,
        hasSettings: !!allBrowserData.ecmExtensionVersion,
        hasHolidays: !!allBrowserData.ecmHolidays,
        hasLogs: !!allBrowserData.ecmExecutionLogs,
        hasBackups: !!allBrowserData.ecmBackups,
        allKeys: Object.keys(allBrowserData)
      };
      
      console.log("DataBackupUtility: COMPREHENSIVE backup analysis:", dataAnalysis);
      
      // Step 4: Ensure critical data is present
      if (!allBrowserData.objectiveCumulativeData) {
        console.warn("DataBackupUtility: No objectiveCumulativeData found - this may indicate no objective data exists");
      }
      
      if (!allBrowserData.ecmFolders) {
        console.warn("DataBackupUtility: No ecmFolders found - adding empty array");
        allBrowserData.ecmFolders = [];
      }
      
      return allBrowserData;
      
    } catch (error) {
      console.error("DataBackupUtility: Error in comprehensive data gathering:", error);
      // Fallback to basic browser storage
      return await this._getAllBrowserStorageData(keysToBackup);
    }
  },

  /**
   * Get ALL data from chrome.storage.local (excluding backup entries)
   */
  async _getAllBrowserStorageData(keysToBackup = null) {
    return new Promise((resolve, reject) => {
      // Get ALL data if no specific keys requested
      const keysToGet = (Array.isArray(keysToBackup) && keysToBackup.length > 0) ? keysToBackup : null;
      
      browserAPI.storage.local.get(keysToGet, (items) => {
        if (browserAPI.runtime?.lastError) {
          reject(new Error(browserAPI.runtime.lastError.message));
        } else {
          // Filter out backup entries and temporary data to avoid recursion
          const filteredItems = {};
          Object.entries(items || {}).forEach(([key, value]) => {
            if (!shouldExcludeKey(key)) {
              filteredItems[key] = value;
            }
          });
          
          console.log(`DataBackupUtility: Filtered ${Object.keys(items || {}).length} total keys to ${Object.keys(filteredItems).length} exportable keys`);
          resolve(filteredItems);
        }
      });
    });
  },

  /**
   * COMPREHENSIVE: Enhanced import function that restores ALL data
   */
  async importBackup(fileContent, filename) {
    console.log(`DataBackupUtility: Starting COMPREHENSIVE import from file: ${filename}`);
    try {
      if (!fileContent) throw new Error("File content is empty.");
      
      // Parse the backup file
      const backupData = JSON.parse(fileContent);

      if (!backupData.meta || !backupData.data) {
        throw new Error("Invalid backup file format: Missing 'meta' or 'data' properties.");
      }
      
      console.log("DataBackupUtility: Backup file parsed successfully");
      console.log("DataBackupUtility: Keys in backup:", Object.keys(backupData.data));
      console.log("DataBackupUtility: Backup metadata:", backupData.meta.dataTypes || 'No metadata available');
      
      // Set import pending flag
      await browserAPI.storage.local.set({ importPending: true });
      
      // COMPREHENSIVE: Restore ALL backup data to chrome.storage.local
      console.log("DataBackupUtility: Restoring ALL backup data to chrome.storage.local...");
      await browserAPI.storage.local.set(backupData.data);
      console.log("DataBackupUtility: ALL backup data restored to chrome.storage.local");
      
      // CRITICAL: Process objectiveCumulativeData for IndexedDB migration
      if (backupData.data.objectiveCumulativeData) {
        console.log("DataBackupUtility: Processing objectiveCumulativeData for IndexedDB...");
        await this._processObjectiveCumulativeData(backupData.data.objectiveCumulativeData);
      }
      
      // Update backup registry
      const backupMeta = {
        ...backupData.meta,
        name: `Imported - ${backupData.meta.name}`,
        description: `Imported from file "${filename}" on ${new Date().toLocaleString()}`,
        automatic: false,
        timestamp: new Date().toISOString(),
        id: `backup_${Date.now()}_imported`
      };
      
      await this._updateBackupRegistry(backupMeta);
      
      // Clear import pending flag
      await browserAPI.storage.local.remove('importPending');
      
      // Trigger post-import migration and refresh
      await this._triggerPostImportMigration();
      
      const dataTypes = backupData.meta.dataTypes || {};
      const successMessage = `Successfully imported comprehensive backup from "${filename}" with ${Object.keys(backupData.data).length} data keys`;
      console.log(`DataBackupUtility: ${successMessage}`);
      console.log("DataBackupUtility: Imported data types:", dataTypes);
      
      // Dispatch import event for UI refresh
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dataImported', { 
          detail: { filename, keys: Object.keys(backupData.data), dataTypes } 
        }));
      }
      
      try {
        NotificationSystem.showInAppNotification(successMessage, NOTIFICATION_TYPE.SUCCESS);
      } catch (uiNotifyError) {
        NotificationSystem.showNotification('Import Successful', successMessage, NOTIFICATION_TYPE.SUCCESS);
      }
      
      return { success: true, message: successMessage, dataTypes };

    } catch (error) {
      console.error(`DataBackupUtility: Failed to import comprehensive backup - ${error.message}`, error);
      ErrorManager.logError('Failed to import comprehensive backup', { filename, error: error.message }, SEVERITY.ERROR, CATEGORY.STORAGE);
      
      // Clean up on failure
      await browserAPI.storage.local.remove('importPending');
      
      const errorMsg = `Failed to import backup: ${error.message}`;
      try {
        NotificationSystem.showInAppNotification(errorMsg, NOTIFICATION_TYPE.ERROR);
      } catch (uiNotifyError) {
        NotificationSystem.showNotification('Import Failed', errorMsg, NOTIFICATION_TYPE.ERROR);
      }
      
      return { success: false, error: error.message };
    }
  },

  /**
   * Process objectiveCumulativeData format to ensure proper IndexedDB storage
   */
  async _processObjectiveCumulativeData(cumulativeData) {
    try {
      console.log("DataBackupUtility: Processing objectiveCumulativeData for IndexedDB storage...");
      
      if (!cumulativeData || !cumulativeData.data) {
        console.warn("DataBackupUtility: No data in objectiveCumulativeData");
        return;
      }

      let rawData = cumulativeData.data;
      
      // Handle compression if present
      if (cumulativeData.compressed && StorageManager.pako) {
        try {
          console.log('DataBackupUtility: Decompressing objective data...');
          rawData = StorageManager.pako.inflate(rawData, { to: 'string' });
        } catch (decompressError) {
          console.error('DataBackupUtility: Decompression failed:', decompressError);
        }
      }

      // Parse JSON if it's a string
      let statsData;
      if (typeof rawData === 'string') {
        try {
          statsData = JSON.parse(rawData);
          console.log('DataBackupUtility: Successfully parsed JSON from objectiveCumulativeData');
        } catch (parseError) {
          console.error('DataBackupUtility: JSON parsing failed:', parseError);
          return;
        }
      } else if (typeof rawData === 'object' && rawData !== null) {
        statsData = rawData;
        console.log('DataBackupUtility: Using object data directly from objectiveCumulativeData');
      } else {
        console.error('DataBackupUtility: Unexpected data type in objectiveCumulativeData:', typeof rawData);
        return;
      }

      // Store in IndexedDB if StorageManager is available
      if (StorageManager.pako && statsData.persons) {
        console.log('DataBackupUtility: Storing objective data in IndexedDB...');
        const transformedData = this._transformToIndexedDBFormat(statsData);
        await StorageManager.storeGenericData(STORAGE_KEY_DATA, transformedData);
        console.log(`DataBackupUtility: Objective data stored in IndexedDB with ${Object.keys(transformedData.persons).length} persons`);
      }

    } catch (error) {
      console.error('DataBackupUtility: Error processing objectiveCumulativeData:', error);
    }
  },

  /**
   * Transform stats data to IndexedDB-compatible format
   */
  _transformToIndexedDBFormat(statsData) {
    try {
      console.log('DataBackupUtility: Transforming data to IndexedDB format...');
      
      // If already in correct format, return as-is
      if (statsData.persons && typeof statsData.persons === 'object') {
        const firstPerson = Object.values(statsData.persons)[0];
        if (firstPerson && typeof firstPerson === 'object') {
          const firstYear = Object.values(firstPerson)[0];
          if (firstYear && typeof firstYear === 'object') {
            const firstMonth = Object.values(firstYear)[0];
            if (firstMonth && typeof firstMonth === 'object') {
              console.log('DataBackupUtility: Data already in IndexedDB format');
              return {
                persons: statsData.persons,
                folders: statsData.folders || {}
              };
            }
          }
        }
      }

      // Transform data structure
      const transformedData = { persons: {}, folders: {} };

      if (statsData.persons) {
        Object.entries(statsData.persons).forEach(([personName, personData]) => {
          transformedData.persons[personName] = {};
          if (personData && typeof personData === 'object') {
            Object.entries(personData).forEach(([year, yearData]) => {
              if (yearData && typeof yearData === 'object') {
                transformedData.persons[personName][year] = yearData;
              }
            });
          }
        });
      }

      if (statsData.folders) {
        transformedData.folders = statsData.folders;
      }

      console.log(`DataBackupUtility: Transformed data for ${Object.keys(transformedData.persons).length} persons and ${Object.keys(transformedData.folders).length} folders`);
      return transformedData;

    } catch (error) {
      console.error('DataBackupUtility: Error transforming data:', error);
      return { persons: {}, folders: {} };
    }
  },

  /**
   * Trigger post-import migration to ensure IndexedDB is populated
   */
  async _triggerPostImportMigration() {
    try {
      console.log("DataBackupUtility: Triggering comprehensive post-import migration...");
      
      // Wait for StorageManager
      if (typeof window !== 'undefined' && window.waitForStorageManager) {
        await window.waitForStorageManager();
      }

      // Process objectiveCumulativeData if present
      if (StorageManager.pako) {
        const result = await browserAPI.storage.local.get('objectiveCumulativeData');
        if (result.objectiveCumulativeData) {
          console.log("DataBackupUtility: Re-processing objectiveCumulativeData for migration...");
          await this._processObjectiveCumulativeData(result.objectiveCumulativeData);
        }

        // Also ensure direct data is stored
        const directData = await safeStorageRetrieve(STORAGE_KEY_DATA);
        if (directData && directData.persons) {
          console.log("DataBackupUtility: Ensuring direct data is in IndexedDB...");
          await StorageManager.storeGenericData(STORAGE_KEY_DATA, directData);
        }
      }

      // Dispatch completion event
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('postImportMigrationComplete'));
          window.dispatchEvent(new CustomEvent('storageRefreshed'));
          window.dispatchEvent(new CustomEvent('dataRefreshNeeded'));
        }, 500);
      }

      console.log("DataBackupUtility: Comprehensive post-import migration completed");

    } catch (error) {
      console.error("DataBackupUtility: Error in post-import migration:", error);
    }
  },

  // Keep all existing methods but with enhanced logging
  async _updateBackupRegistry(backupMeta) { 
    const result = await browserAPI.storage.local.get(STORAGE_KEY_BACKUPS); 
    let backups = result?.[STORAGE_KEY_BACKUPS] || []; 
    if (!Array.isArray(backups)) backups = []; 
    backups.push(backupMeta); 
    await browserAPI.storage.local.set({ [STORAGE_KEY_BACKUPS]: backups });
    console.log(`DataBackupUtility: Updated backup registry, now contains ${backups.length} backups`);
  },
  
  async _cleanupOldAutomaticBackups() { 
    try { 
      const backups = await this.getBackups(); 
      const automaticBackups = backups.filter(b => b.automatic); 
      if (automaticBackups.length > MAX_AUTO_BACKUPS) { 
        const backupsToDelete = automaticBackups.slice(MAX_AUTO_BACKUPS); 
        console.log(`DataBackupUtility: Cleaning up ${backupsToDelete.length} old automatic backups`);
        for (const backup of backupsToDelete) { 
          await this.deleteBackup(backup.id); 
        } 
      } 
    } catch (error) { 
      console.error("DataBackupUtility: Error during automatic backup cleanup:", error); 
    } 
  },

  // Rest of existing methods remain the same...
  async getBackups() {
    try {
      if (!browserAPI || !browserAPI.storage || !browserAPI.storage.local) throw new Error('Browser storage API is not available.');
      const result = await browserAPI.storage.local.get(STORAGE_KEY_BACKUPS);
      const backups = result?.[STORAGE_KEY_BACKUPS] || [];
      if (!Array.isArray(backups)) {
        console.warn("DataBackupUtility: Backup registry is not an array. Resetting.");
        await browserAPI.storage.local.set({ [STORAGE_KEY_BACKUPS]: [] });
        return [];
      }
      return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      console.error(`DataBackupUtility: Failed to get backups list - ${error.message}`, error);
      return [];
    }
  },

  async deleteBackup(backupId) {
    console.log(`DataBackupUtility: Attempting to delete backup ID: ${backupId}`);
    try {
      if (!browserAPI || !browserAPI.storage || !browserAPI.storage.local) throw new Error('Browser storage API is not available.');
      if (!backupId || typeof backupId !== 'string') throw new Error('Invalid backup ID provided.');
      const result = await browserAPI.storage.local.get(STORAGE_KEY_BACKUPS);
      let backups = result?.[STORAGE_KEY_BACKUPS] || [];
      const backupIndex = backups.findIndex(b => b.id === backupId);
      const backupName = backups[backupIndex]?.name || backupId;
      if (backupIndex !== -1) {
        backups.splice(backupIndex, 1);
        await browserAPI.storage.local.set({ [STORAGE_KEY_BACKUPS]: backups });
      }
      await browserAPI.storage.local.remove(backupId);
      console.log(`DataBackupUtility: Successfully deleted backup "${backupName}"`);
      return { success: true, backupId, message: `Backup "${backupName}" deleted successfully.` };
    } catch (error) {
      console.error(`DataBackupUtility: Failed to delete backup - ${error.message}`, error);
      return { success: false, error: error.message };
    }
  },
  
  async exportBackup(backupId) {
    console.log(`DataBackupUtility: Exporting backup ID: ${backupId}`);
    try {
      if (!backupId) throw new Error("Backup ID is required for export.");
      const backupDataResult = await browserAPI.storage.local.get(backupId);
      const backupData = backupDataResult[backupId];
      if (!backupData || !backupData.meta || !backupData.data) {
        throw new Error(`No valid backup data found for ID: ${backupId}`);
      }

      const backupContent = JSON.stringify(backupData, null, 2);
      const blob = new Blob([backupContent], { type: 'application/json;charset=utf-8' });
      const filename = `${backupData.meta.name.replace(/\s/g, '_')}_${backupData.meta.timestamp.slice(0,10)}.json`;

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to create data URL for download.'));
        reader.readAsDataURL(blob);
      });

      await new Promise((resolve, reject) => {
        browserAPI.downloads.download({
          url: dataUrl,
          filename: filename,
          saveAs: true
        }, (downloadId) => {
          if (browserAPI.runtime.lastError) {
            reject(new Error(browserAPI.runtime.lastError.message));
          } else if (downloadId === undefined) {
            reject(new Error("Download failed to start."));
          } else {
            resolve(downloadId);
          }
        });
      });

      console.log(`DataBackupUtility: Successfully exported backup as ${filename}`);
      return { success: true, filename };
    } catch (error) {
      console.error(`DataBackupUtility: Failed to export backup - ${error.message}`, error);
      ErrorManager.logError('Failed to export backup', { backupId, error: error.message }, SEVERITY.ERROR, CATEGORY.STORAGE);
      return { success: false, error: error.message };
    }
  }
};

// Alarm setup functions remain the same...
let currentAlarmListener = null;

export async function setupAutomaticBackups() {
    if (!browserAPI || !browserAPI.alarms) { 
      console.warn('Cannot set up automatic backups - browser alarms API unavailable.'); 
      return; 
    }

    const { [STORAGE_KEY_BACKUPS_DISABLED]: isDisabled } = await browserAPI.storage.local.get(STORAGE_KEY_BACKUPS_DISABLED);
    if (isDisabled) {
        console.log("DataBackupUtility: Automatic backups and maintenance tasks are disabled by user setting. Aborting setup.");
        return;
    }

    const alarmNames = [ALARM_DAILY_BACKUP, ALARM_WEEKLY_MAINTENANCE, ALARM_MONTHLY_ARCHIVING];
    console.log("DataBackupUtility: Setting up alarms...");

    try {
        for (const name of alarmNames) {
          await browserAPI.alarms.clear(name);
        }
        console.log("DataBackupUtility: Cleared any existing alarms before re-creating.");
    } catch (clearError) {
        console.error("DataBackupUtility: Error clearing alarms:", clearError);
    }

    browserAPI.alarms.create(ALARM_DAILY_BACKUP, { delayInMinutes: 60, periodInMinutes: 24 * 60 });
    browserAPI.alarms.create(ALARM_WEEKLY_MAINTENANCE, { delayInMinutes: 120, periodInMinutes: 7 * 24 * 60 });
    browserAPI.alarms.create(ALARM_MONTHLY_ARCHIVING, { delayInMinutes: 180, periodInMinutes: 30 * 24 * 60 });
    console.log("DataBackupUtility: Alarms created.");

    if (currentAlarmListener && browserAPI.alarms.onAlarm.hasListener(currentAlarmListener)) {
        browserAPI.alarms.onAlarm.removeListener(currentAlarmListener);
    }
    currentAlarmListener = handleAlarms;
    browserAPI.alarms.onAlarm.addListener(currentAlarmListener);
    console.log("DataBackupUtility: Added alarm listener.");
}

async function handleAlarms(alarm) {
    console.log(`DataBackupUtility: Alarm "${alarm.name}" triggered.`);
    try {
        switch (alarm.name) {
            case ALARM_DAILY_BACKUP: 
              await DataBackupUtility.createBackup('Daily Backup', 'Automatic daily comprehensive backup', true); 
              break;
            case ALARM_WEEKLY_MAINTENANCE: 
              await DataBackupUtility.verifyDataIntegrity(); 
              await DataBackupUtility.checkStorageUsage(); 
              break;
            case ALARM_MONTHLY_ARCHIVING: 
              await DataBackupUtility.archiveOldData(12); 
              break;
        }
    } catch (error) {
        console.error(`Error handling alarm "${alarm.name}":`, error);
        ErrorManager.logError(`Failed to handle alarm: ${alarm.name}`, { error: error.message }, SEVERITY.ERROR, CATEGORY.SYSTEM);
    }
}

export async function disableAutomaticBackups() {
    if (!browserAPI || !browserAPI.alarms) throw new Error('Browser alarms API is not available.');
    try {
        const allAlarms = [ALARM_DAILY_BACKUP, ALARM_WEEKLY_MAINTENANCE, ALARM_MONTHLY_ARCHIVING];
        
        for (const name of allAlarms) {
          await browserAPI.alarms.clear(name);
        }

        await browserAPI.storage.local.set({ [STORAGE_KEY_BACKUPS_DISABLED]: true });

        const successMsg = 'All automatic backups and maintenance tasks have been disabled.';
        console.log(`DataBackupUtility: ${successMsg}`);
        return { success: true, message: successMsg };
    } catch (error) {
        console.error(`Error disabling all automatic tasks:`, error);
        throw error;
    }
}

export default DataBackupUtility;