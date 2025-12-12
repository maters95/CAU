// storage-sync.js (v2.0 - Enhanced Import/Refresh Support)
'use strict';

import { STORAGE_KEY_DATA } from './constants.js';
import { StorageManager } from './storage-manager.js';

/**
 * DashboardDataSync provides methods to access and monitor data.
 * Enhanced with comprehensive fallback and import scenario handling.
 */
class DashboardDataSync {
    constructor() {
        this.rawData = null;
        this.listeners = [];
        this.initialized = false;
        this.initializationPromise = null;
    }

    async initialize() {
        if (this.initialized) return;
        if (this.initializationPromise) return this.initializationPromise;
        
        this.initializationPromise = this._doInitialize();
        return this.initializationPromise;
    }

    async _doInitialize() {
        console.log("DashboardDataSync: Initializing...");
        
        // Wait for StorageManager to be ready
        if (typeof window !== 'undefined' && window.waitForStorageManager) {
            await window.waitForStorageManager();
        }
        
        // Wait for any import migrations
        if (typeof window !== 'undefined' && window.waitForPostImportMigration) {
            await window.waitForPostImportMigration();
        }
        
        await this.refreshData();
        this.initialized = true;
        return this;
    }

    async refreshData() {
        console.log("DashboardDataSync: Enhanced data refresh starting...");
        try {
            // Wait for any ongoing import processes
            if (typeof window !== 'undefined' && window.waitForStorageManager) {
                await window.waitForStorageManager();
            }
            
            if (typeof window !== 'undefined' && window.waitForPostImportMigration) {
                await window.waitForPostImportMigration();
            }

            let retrievedData = null;

            // Method 1: Try StorageManager IndexedDB (primary source)
            try {
                if (StorageManager && StorageManager.retrieveAndDecompress) {
                    console.log("DashboardDataSync: Trying StorageManager IndexedDB...");
                    retrievedData = await StorageManager.retrieveAndDecompress(STORAGE_KEY_DATA);
                    
                    if (retrievedData && retrievedData.persons && Object.keys(retrievedData.persons).length > 0) {
                        console.log(`DashboardDataSync: Retrieved from IndexedDB - ${Object.keys(retrievedData.persons).length} persons`);
                    } else {
                        console.log("DashboardDataSync: IndexedDB data is empty or invalid");
                        retrievedData = null;
                    }
                }
            } catch (indexedError) {
                console.warn("DashboardDataSync: IndexedDB access failed:", indexedError);
                retrievedData = null;
            }

            // Method 2: Try browser storage for objectiveCumulativeData (import format)
            if (!retrievedData) {
                try {
                    console.log("DashboardDataSync: Trying browser storage for objectiveCumulativeData...");
                    const browserAPI = (typeof chrome !== 'undefined') ? chrome : (typeof browser !== 'undefined' ? browser : null);
                    
                    if (browserAPI && browserAPI.storage) {
                        const result = await new Promise((resolve, reject) => {
                            browserAPI.storage.local.get('objectiveCumulativeData', (items) => {
                                if (browserAPI.runtime.lastError) {
                                    reject(new Error(browserAPI.runtime.lastError.message));
                                } else {
                                    resolve(items);
                                }
                            });
                        });
                        
                        if (result.objectiveCumulativeData) {
                            console.log("DashboardDataSync: Found objectiveCumulativeData, parsing...");
                            const parsedData = await this.parseObjectiveCumulativeData(result.objectiveCumulativeData);
                            
                            if (parsedData && parsedData.persons && Object.keys(parsedData.persons).length > 0) {
                                console.log(`DashboardDataSync: Parsed cumulative data - ${Object.keys(parsedData.persons).length} persons`);
                                retrievedData = parsedData;
                                
                                // Store in IndexedDB for future use
                                if (StorageManager && StorageManager.storeGenericData) {
                                    try {
                                        await StorageManager.storeGenericData(STORAGE_KEY_DATA, parsedData);
                                        console.log("DashboardDataSync: Migrated parsed data to IndexedDB");
                                    } catch (storeError) {
                                        console.warn("DashboardDataSync: Failed to migrate to IndexedDB:", storeError);
                                    }
                                }
                            }
                        }
                    }
                } catch (browserError) {
                    console.warn("DashboardDataSync: Browser storage access failed:", browserError);
                }
            }

            // Method 3: Try direct storage access as final fallback
            if (!retrievedData) {
                try {
                    console.log("DashboardDataSync: Trying direct storage access...");
                    const browserAPI = (typeof chrome !== 'undefined') ? chrome : (typeof browser !== 'undefined' ? browser : null);
                    
                    if (browserAPI && browserAPI.storage) {
                        const directResult = await new Promise((resolve, reject) => {
                            browserAPI.storage.local.get(STORAGE_KEY_DATA, (items) => {
                                if (browserAPI.runtime.lastError) {
                                    reject(new Error(browserAPI.runtime.lastError.message));
                                } else {
                                    resolve(items);
                                }
                            });
                        });
                        
                        if (directResult[STORAGE_KEY_DATA] && directResult[STORAGE_KEY_DATA].persons) {
                            console.log(`DashboardDataSync: Found direct storage data - ${Object.keys(directResult[STORAGE_KEY_DATA].persons).length} persons`);
                            retrievedData = directResult[STORAGE_KEY_DATA];
                        }
                    }
                } catch (directError) {
                    console.warn("DashboardDataSync: Direct storage access failed:", directError);
                }
            }

            // Set the final data
            if (retrievedData && typeof retrievedData === 'object') {
                this.rawData = {
                    persons: retrievedData.persons || {},
                    folders: retrievedData.folders || {}
                };
                console.log(`DashboardDataSync: Data refreshed successfully with ${Object.keys(this.rawData.persons).length} persons`);
            } else {
                console.log("DashboardDataSync: No valid data found in any source, using empty structure");
                this.rawData = { persons: {}, folders: {} };
            }

            this.notifyListeners();

        } catch (error) {
            console.error("DashboardDataSync: Error during enhanced refresh:", error);
            this.rawData = { persons: {}, folders: {} };
            this.notifyListeners();
        }
    }

    // Enhanced parsing method for objectiveCumulativeData
    async parseObjectiveCumulativeData(cumulativeData) {
        try {
            if (!cumulativeData || !cumulativeData.data) {
                console.warn("DashboardDataSync: No data in objectiveCumulativeData");
                return null;
            }

            let rawData = cumulativeData.data;
            
            // Handle compression if present
            if (cumulativeData.compressed && StorageManager && StorageManager.pako && !StorageManager.pako.error) {
                try {
                    console.log('DashboardDataSync: Decompressing objective data...');
                    rawData = StorageManager.pako.inflate(rawData, { to: 'string' });
                } catch (decompressError) {
                    console.error('DashboardDataSync: Decompression failed:', decompressError);
                    // Continue with raw data
                }
            }

            // Parse JSON if it's a string
            let statsData;
            if (typeof rawData === 'string') {
                try {
                    statsData = JSON.parse(rawData);
                    console.log('DashboardDataSync: Successfully parsed JSON from string');
                } catch (parseError) {
                    console.error('DashboardDataSync: JSON parsing failed:', parseError);
                    return null;
                }
            } else if (typeof rawData === 'object' && rawData !== null) {
                statsData = rawData;
                console.log('DashboardDataSync: Using object data directly');
            } else {
                console.error('DashboardDataSync: Unexpected data type:', typeof rawData);
                return null;
            }

            // Transform to dashboard format
            return this.transformStatsToDashboardFormat(statsData);

        } catch (error) {
            console.error('DashboardDataSync: Error parsing cumulative data:', error);
            return null;
        }
    }

    // Transform stats data to dashboard format
    transformStatsToDashboardFormat(statsData) {
        try {
            console.log('DashboardDataSync: Transforming stats data to dashboard format...');
            
            if (!statsData || typeof statsData !== 'object') {
                return { persons: {}, folders: {} };
            }
            
            // If it's already in dashboard format, return as-is
            if (statsData.persons && typeof statsData.persons === 'object') {
                const firstPerson = Object.values(statsData.persons)[0];
                if (firstPerson && typeof firstPerson === 'object') {
                    const firstYear = Object.values(firstPerson)[0];
                    if (firstYear && typeof firstYear === 'object') {
                        const firstMonth = Object.values(firstYear)[0];
                        if (firstMonth && typeof firstMonth === 'object') {
                            console.log('DashboardDataSync: Data is already in dashboard format');
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

            if (statsData.persons) {
                Object.entries(statsData.persons).forEach(([personName, personData]) => {
                    if (!personName || typeof personData !== 'object') {
                        return;
                    }
                    
                    dashboardData.persons[personName] = {};
                    
                    // Handle different possible nested structures
                    if (personData.years) {
                        // Nested structure
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
                    } else {
                        // Direct year/month structure
                        Object.entries(personData).forEach(([year, yearData]) => {
                            if (yearData && typeof yearData === 'object') {
                                dashboardData.persons[personName][year] = yearData;
                            }
                        });
                    }
                });
            }

            if (statsData.folders) {
                dashboardData.folders = statsData.folders;
            }

            const personCount = Object.keys(dashboardData.persons).length;
            console.log(`DashboardDataSync: Transformed data for ${personCount} persons`);
            
            return dashboardData;

        } catch (error) {
            console.error('DashboardDataSync: Error transforming stats data:', error);
            return { persons: {}, folders: {} };
        }
    }

    // Keep decompression logic for compatibility but it's likely not needed anymore
    async decompressData(compressedBase64String) {
        if (!compressedBase64String) { 
            console.warn("Decompression skipped: Input string is empty."); 
            return null; 
        }
        try {
            console.log("Decompression: Starting decompression...");
            const binaryString = atob(compressedBase64String);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) { 
                bytes[i] = binaryString.charCodeAt(i); 
            }

            if (typeof pako === 'undefined') {
                console.error("Decompression error: pako library not loaded");
                throw new Error("pako library not available");
            }
            const decompressed = new TextDecoder().decode(pako.inflate(bytes));
            console.log("Decompression: Successful");
            return decompressed;
        } catch (e) {
            console.error('Decompression failed:', e);
            try {
                JSON.parse(compressedBase64String);
                console.warn("DashboardDataSync: Decompression fallback - Data appears to be uncompressed JSON string.");
                return compressedBase64String;
            } catch (jsonError) {
                console.error('DashboardDataSync: Data is neither valid pako/base64 nor valid JSON string.');
                return null;
            }
        }
    }

    normalizeFolderName(name) {
        return String(name || '').toLowerCase().trim();
    }

    subscribe(callback) {
        if (typeof callback === 'function' && !this.listeners.includes(callback)) {
            this.listeners.push(callback);
            if (this.rawData) {
                try { 
                    callback(JSON.parse(JSON.stringify(this.rawData))); 
                } catch (e) { 
                    console.error("Error notifying new subscriber:", e); 
                }
            }
        }
        return this;
    }

    unsubscribe(callback) {
        const index = this.listeners.indexOf(callback);
        if (index !== -1) { 
            this.listeners.splice(index, 1); 
        }
        return this;
    }

    notifyListeners() {
        console.log("DashboardDataSync: Notifying listeners with data (keyed by display names)");
        const dataToSend = JSON.parse(JSON.stringify(this.rawData || { persons: {}, folders: {} }));
        this.listeners.forEach(listener => {
            try {
                listener(dataToSend);
            } catch (error) {
                console.error("DashboardDataSync: Error in listener", error);
            }
        });
    }

    getCurrentData() {
        return JSON.parse(JSON.stringify(this.rawData || { persons: {}, folders: {} }));
    }
}

// Create singleton instance
const dashboardDataSync = new DashboardDataSync();

// Legacy compatibility additions
if (typeof dashboardDataSync.addListener !== 'function') { 
    dashboardDataSync.addListener = function(callback) { 
        return this.subscribe(callback); 
    }; 
}

export default dashboardDataSync;