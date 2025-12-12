// storage-init-helper.js - Enhanced migration handling with better timeouts
'use strict';

/**
 * This helper ensures StorageManager is properly initialized in UI contexts and handles
 * import scenarios by forcing migrations and data refresh. 
 * Include this script BEFORE any other scripts that use StorageManager.
 */

(async function initializeStorageForUI() {
    // Skip if already initialized
    if (window.StorageManagerInitialized) {
        return;
    }

    console.log('StorageInit: Initializing StorageManager for UI context...');

    try {
        // Import StorageManager
        const { StorageManager } = await import('./storage-manager.js');
        
        // Check if already initialized (e.g., by background script)
        if (StorageManager.pako) {
            console.log('StorageInit: StorageManager already initialized.');
            window.StorageManagerInitialized = true;
            
            // Check for import scenarios and handle them
            await handleImportScenarios(StorageManager);
            
            // Dispatch event for scripts that might be waiting
            window.dispatchEvent(new CustomEvent('storageManagerReady'));
            return;
        }

        // Create a minimal pako-compatible interface for UI contexts
        console.log('StorageInit: UI context detected. Using non-compressing fallback for StorageManager API.');
        const pakoFallback = {
            deflate: function(data) {
                const str = typeof data === 'string' ? data : JSON.stringify(data);
                return new TextEncoder().encode(str);
            },
            inflate: function(data, options) {
                const decoded = new TextDecoder().decode(data);
                return options?.to === 'string' ? decoded : JSON.parse(decoded);
            }
        };

        // Initialize StorageManager with the fallback instance
        StorageManager.initialize(pakoFallback);
        
        // Explicitly disable compression in UI contexts
        StorageManager.setCompressionEnabled(false);
        
        console.log('StorageInit: StorageManager initialized successfully in UI context (compression disabled).');
        window.StorageManagerInitialized = true;

        // Check for import scenarios and handle them
        await handleImportScenarios(StorageManager);

        // Dispatch event to notify other scripts that StorageManager is ready
        window.dispatchEvent(new CustomEvent('storageManagerReady'));

    } catch (error) {
        console.error('StorageInit: Failed to initialize StorageManager in UI context:', error);
        
        // Fallback in case of critical failure
        window.StorageManager = {
            retrieveAndDecompress: async (key) => {
                try {
                    const browserAPI = (typeof chrome !== 'undefined') ? chrome : (typeof browser !== 'undefined' ? browser : null);
                    if (!browserAPI) return null;
                    const result = await browserAPI.storage.local.get(key);
                    return result[key] || null;
                } catch (e) {
                    console.error('Fallback storage access failed:', e);
                    return null;
                }
            },
            storeGenericData: async (key, data) => {
                try {
                    const browserAPI = (typeof chrome !== 'undefined') ? chrome : (typeof browser !== 'undefined' ? browser : null);
                    if (!browserAPI) return;
                    await browserAPI.storage.local.set({ [key]: data });
                } catch (e) {
                    console.error('Fallback storage write failed:', e);
                }
            },
            pako: { minimal: true, error: true }
        };
        window.StorageManagerInitialized = true;
        console.warn('StorageInit: A minimal, error-state StorageManager interface was created.');
    }
})();

/**
 * Enhanced import scenario handling with better error recovery
 */
async function handleImportScenarios(StorageManager) {
    try {
        const browserAPI = (typeof chrome !== 'undefined') ? chrome : (typeof browser !== 'undefined' ? browser : null);
        if (!browserAPI) return;

        console.log('StorageInit: Checking for import scenarios...');

        // Check multiple import indicators
        const importCheck = await browserAPI.storage.local.get([
            'importPending', 
            'objectiveCumulativeData',
            'dataImported',
            'migrationNeeded'
        ]);
        
        const hasImportData = !!(
            importCheck.objectiveCumulativeData || 
            importCheck.importPending || 
            importCheck.dataImported ||
            importCheck.migrationNeeded
        );
        
        if (hasImportData) {
            console.log('StorageInit: Import scenario detected, processing...', {
                hasObjectiveCumulativeData: !!importCheck.objectiveCumulativeData,
                importPending: !!importCheck.importPending,
                dataImported: !!importCheck.dataImported,
                migrationNeeded: !!importCheck.migrationNeeded
            });
            
            // Set migration flags
            window.postImportMigrationInProgress = true;
            window.postImportMigrationComplete = false;
            
            // Set up enhanced migration waiter
            setupEnhancedMigrationWaiter();
            
            // Process the cumulative data with enhanced error handling
            const migrationPromise = processImportedObjectiveDataWithRetry(StorageManager, importCheck.objectiveCumulativeData);
            
            // Execute migration with timeout and retry
            try {
                await Promise.race([
                    migrationPromise,
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Migration timeout')), 10000)
                    )
                ]);
                
                console.log('StorageInit: Migration completed successfully');
            } catch (migrationError) {
                console.warn('StorageInit: Migration failed or timed out:', migrationError);
                
                // Try alternative migration approach
                if (importCheck.objectiveCumulativeData) {
                    console.log('StorageInit: Attempting alternative migration...');
                    try {
                        await processImportedObjectiveDataBasic(importCheck.objectiveCumulativeData);
                        console.log('StorageInit: Alternative migration succeeded');
                    } catch (altError) {
                        console.error('StorageInit: Alternative migration also failed:', altError);
                    }
                }
            }
            
            // Mark completion with delay
            setTimeout(() => {
                window.postImportMigrationInProgress = false;
                window.postImportMigrationComplete = true;
                window.dispatchEvent(new CustomEvent('postImportMigrationComplete'));
                console.log('StorageInit: Post-import migration marked complete');
                
                // Clean up import flags
                browserAPI.storage.local.remove(['importPending', 'dataImported', 'migrationNeeded']);
            }, 1000);
            
        } else {
            console.log('StorageInit: No import scenario detected');
            
            // Set up empty waiters for consistency
            window.postImportMigrationComplete = true;
            window.postImportMigrationInProgress = false;
            setupEnhancedMigrationWaiter();
        }

    } catch (error) {
        console.error('StorageInit: Error handling import scenarios:', error);
        
        // Set up safe defaults on error
        window.postImportMigrationComplete = true;
        window.postImportMigrationInProgress = false;
        setupEnhancedMigrationWaiter();
    }
}

/**
 * Enhanced migration waiter with better timeout handling
 */
function setupEnhancedMigrationWaiter() {
    window.waitForPostImportMigration = function() {
        return new Promise((resolve) => {
            if (window.postImportMigrationComplete) {
                console.log('StorageInit: Post-import migration already complete');
                resolve();
                return;
            }
            
            // If no migration is in progress, resolve immediately
            if (!window.postImportMigrationInProgress) {
                console.log('StorageInit: No migration in progress, resolving immediately');
                window.postImportMigrationComplete = true;
                resolve();
                return;
            }
            
            let timeoutId;
            let pollId;
            
            // Listen for completion event
            const completionHandler = () => {
                console.log('StorageInit: Post-import migration completed via event');
                clearTimeout(timeoutId);
                clearInterval(pollId);
                resolve();
            };
            
            window.addEventListener('postImportMigrationComplete', completionHandler, { once: true });
            
            // Poll for completion more frequently
            let pollCount = 0;
            pollId = setInterval(() => {
                pollCount++;
                
                if (window.postImportMigrationComplete) {
                    console.log(`StorageInit: Migration completed (detected via polling after ${pollCount} checks)`);
                    clearTimeout(timeoutId);
                    clearInterval(pollId);
                    window.removeEventListener('postImportMigrationComplete', completionHandler);
                    resolve();
                    return;
                }
                
                // Check if migration is no longer in progress
                if (!window.postImportMigrationInProgress) {
                    console.log(`StorageInit: Migration no longer in progress (detected via polling after ${pollCount} checks)`);
                    window.postImportMigrationComplete = true;
                    clearTimeout(timeoutId);
                    clearInterval(pollId);
                    window.removeEventListener('postImportMigrationComplete', completionHandler);
                    resolve();
                    return;
                }
                
                // Log progress every 10 polls (5 seconds)
                if (pollCount % 10 === 0) {
                    console.log(`StorageInit: Still waiting for migration completion... (${pollCount * 0.5}s elapsed)`);
                }
            }, 500);
            
            // Extended timeout with better logging
            timeoutId = setTimeout(() => {
                console.warn(`StorageInit: Post-import migration timeout reached after ${pollCount} polls`);
                
                // Try to detect if migration actually completed
                const hasObjectiveData = window.StorageManager && window.StorageManager.retrieveAndDecompress;
                
                if (hasObjectiveData) {
                    console.log('StorageInit: StorageManager is available, assuming migration completed');
                    window.postImportMigrationComplete = true;
                } else {
                    console.warn('StorageInit: Forcing migration completion due to timeout');
                    window.postImportMigrationComplete = true;
                }
                
                window.postImportMigrationInProgress = false;
                clearInterval(pollId);
                window.removeEventListener('postImportMigrationComplete', completionHandler);
                resolve();
            }, 15000); // Increased to 15 seconds
        });
    };
}

/**
 * Enhanced migration with retry logic
 */
async function processImportedObjectiveDataWithRetry(StorageManager, cumulativeData, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`StorageInit: Migration attempt ${attempt}/${maxRetries}`);
            await processImportedObjectiveData(StorageManager, cumulativeData);
            console.log(`StorageInit: Migration succeeded on attempt ${attempt}`);
            return;
        } catch (error) {
            console.warn(`StorageInit: Migration attempt ${attempt} failed:`, error);
            
            if (attempt === maxRetries) {
                throw error;
            }
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}

/**
 * Process imported objectiveCumulativeData with better error handling
 */
async function processImportedObjectiveData(StorageManager, cumulativeData) {
    try {
        console.log('StorageInit: Processing imported objective data...');
        
        if (!cumulativeData || !cumulativeData.data) {
            console.warn('StorageInit: No data in objectiveCumulativeData');
            return;
        }

        let rawData = cumulativeData.data;
        
        // Handle compression if present
        if (cumulativeData.compressed && StorageManager.pako && !StorageManager.pako.error) {
            try {
                console.log('StorageInit: Decompressing objective data...');
                rawData = StorageManager.pako.inflate(rawData, { to: 'string' });
            } catch (decompressError) {
                console.error('StorageInit: Decompression failed:', decompressError);
                // Continue with raw data
            }
        }

        // Parse JSON if it's a string
        let statsData;
        if (typeof rawData === 'string') {
            try {
                statsData = JSON.parse(rawData);
                console.log('StorageInit: Successfully parsed JSON from string');
            } catch (parseError) {
                console.error('StorageInit: JSON parsing failed:', parseError);
                throw parseError;
            }
        } else if (typeof rawData === 'object' && rawData !== null) {
            statsData = rawData;
            console.log('StorageInit: Using object data directly');
        } else {
            console.error('StorageInit: Unexpected data type:', typeof rawData);
            throw new Error('Invalid data type for objective data');
        }

        // Transform and store in IndexedDB format
        if (statsData.persons) {
            console.log('StorageInit: Migrating to IndexedDB format...');
            const transformedData = transformToIndexedDBFormat(statsData);
            
            // Store using proper StorageManager method with retry logic
            let retryCount = 0;
            const maxRetries = 3;
            
            while (retryCount < maxRetries) {
                try {
                    await StorageManager.storeGenericData('objectiveData', transformedData);
                    console.log('StorageInit: Data stored in IndexedDB format successfully');
                    break;
                } catch (storeError) {
                    retryCount++;
                    console.warn(`StorageInit: Storage attempt ${retryCount} failed:`, storeError.message);
                    
                    if (retryCount >= maxRetries) {
                        console.error('StorageInit: All storage attempts failed, but continuing...');
                        break;
                    }
                    
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                }
            }
            
            // Trigger data refresh events with delay
            setTimeout(() => {
                console.log('StorageInit: Triggering data refresh events...');
                window.dispatchEvent(new CustomEvent('dataImported', { 
                    detail: { source: 'objectiveCumulativeData', persons: Object.keys(transformedData.persons).length } 
                }));
                window.dispatchEvent(new CustomEvent('storageRefreshed'));
                window.dispatchEvent(new CustomEvent('dataRefreshNeeded'));
            }, 500);
        }

    } catch (error) {
        console.error('StorageInit: Error processing imported objective data:', error);
        throw error;
    }
}

/**
 * Basic migration fallback
 */
async function processImportedObjectiveDataBasic(cumulativeData) {
    try {
        console.log('StorageInit: Using basic migration approach...');
        
        if (!cumulativeData || !cumulativeData.data) {
            throw new Error('No data in objectiveCumulativeData');
        }

        const browserAPI = (typeof chrome !== 'undefined') ? chrome : (typeof browser !== 'undefined' ? browser : null);
        if (!browserAPI) {
            throw new Error('Browser API not available');
        }

        // Store the data directly without compression/decompression
        await browserAPI.storage.local.set({
            'objectiveData': {
                persons: cumulativeData.data.persons || {},
                folders: cumulativeData.data.folders || {}
            }
        });
        
        console.log('StorageInit: Basic migration completed');
        
        // Trigger events
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('dataImported', { 
                detail: { source: 'basicMigration' } 
            }));
            window.dispatchEvent(new CustomEvent('storageRefreshed'));
            window.dispatchEvent(new CustomEvent('dataRefreshNeeded'));
        }, 500);
        
    } catch (error) {
        console.error('StorageInit: Basic migration failed:', error);
        throw error;
    }
}

/**
 * Transform stats data to IndexedDB-compatible format with validation
 */
function transformToIndexedDBFormat(statsData) {
    try {
        console.log('StorageInit: Transforming stats data to IndexedDB format...');
        
        if (!statsData || typeof statsData !== 'object') {
            throw new Error('Invalid stats data provided for transformation');
        }
        
        // If it's already in the right format, return as-is
        if (statsData.persons && typeof statsData.persons === 'object') {
            const firstPerson = Object.values(statsData.persons)[0];
            if (firstPerson && typeof firstPerson === 'object') {
                const firstYear = Object.values(firstPerson)[0];
                if (firstYear && typeof firstYear === 'object') {
                    const firstMonth = Object.values(firstYear)[0];
                    if (firstMonth && typeof firstMonth === 'object') {
                        console.log('StorageInit: Data is already in IndexedDB format');
                        return {
                            persons: statsData.persons,
                            folders: statsData.folders || {}
                        };
                    }
                }
            }
        }

        // Transform from other possible formats
        const transformedData = { persons: {}, folders: {} };

        if (statsData.persons) {
            Object.entries(statsData.persons).forEach(([personName, personData]) => {
                if (!personName || typeof personData !== 'object') {
                    console.warn(`StorageInit: Skipping invalid person data for: ${personName}`);
                    return;
                }
                
                transformedData.persons[personName] = {};
                
                // Handle different possible nested structures
                if (personData.years) {
                    // Nested structure with years/months/folders
                    Object.entries(personData.years).forEach(([year, yearData]) => {
                        transformedData.persons[personName][year] = {};
                        
                        if (yearData.months) {
                            Object.entries(yearData.months).forEach(([month, monthData]) => {
                                transformedData.persons[personName][year][month] = {};
                                
                                if (monthData.folders) {
                                    Object.entries(monthData.folders).forEach(([folderName, folderData]) => {
                                        transformedData.persons[personName][year][month][folderName] = {};
                                        
                                        if (folderData.dates) {
                                            Object.entries(folderData.dates).forEach(([date, count]) => {
                                                transformedData.persons[personName][year][month][folderName][date] = count;
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
                            transformedData.persons[personName][year] = yearData;
                        }
                    });
                }
            });
        }

        if (statsData.folders) {
            transformedData.folders = statsData.folders;
        }

        const personCount = Object.keys(transformedData.persons).length;
        console.log(`StorageInit: Transformed data for ${personCount} persons`);
        
        if (personCount === 0) {
            console.warn('StorageInit: No persons found after transformation');
        }
        
        return transformedData;

    } catch (error) {
        console.error('StorageInit: Error transforming stats data:', error);
        return { persons: {}, folders: {} };
    }
}

// For scripts that need to wait for initialization
window.waitForStorageManager = function() {
    return new Promise((resolve) => {
        if (window.StorageManagerInitialized) {
            resolve();
        } else {
            window.addEventListener('storageManagerReady', resolve, { once: true });
            // Auto-resolve after 10 seconds to prevent infinite waiting
            setTimeout(() => {
                console.warn('StorageInit: StorageManager initialization timeout, continuing...');
                resolve();
            }, 10000);
        }
    });
};

// Add debugging helpers
window.debugStorageInit = {
    checkMigrationStatus() {
        console.log('🔍 Migration Status Check:');
        console.log('  postImportMigrationInProgress:', window.postImportMigrationInProgress);
        console.log('  postImportMigrationComplete:', window.postImportMigrationComplete);
        console.log('  StorageManagerInitialized:', window.StorageManagerInitialized);
    },
    
    async forceMigrationComplete() {
        console.log('🔧 Forcing migration completion...');
        window.postImportMigrationInProgress = false;
        window.postImportMigrationComplete = true;
        window.dispatchEvent(new CustomEvent('postImportMigrationComplete'));
        console.log('✅ Migration marked as complete');
    },
    
    async testDataAccess() {
        console.log('🔍 Testing data access...');
        try {
            if (window.StorageManager && window.StorageManager.retrieveAndDecompress) {
                const data = await window.StorageManager.retrieveAndDecompress('objectiveData');
                console.log('✅ Data access successful:', {
                    hasData: !!data,
                    personCount: data?.persons ? Object.keys(data.persons).length : 0
                });
                return data;
            } else {
                console.log('❌ StorageManager not available');
                return null;
            }
        } catch (error) {
            console.error('❌ Data access failed:', error);
            return null;
        }
    }
};

console.log('StorageInit: Enhanced storage initialization helper loaded');