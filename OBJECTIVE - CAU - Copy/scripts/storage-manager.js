// storage-manager.js – v2.1 (Dependency Injection for Pako)
'use strict';

import { ErrorManager, SEVERITY, CATEGORY } from './enhanced-error-manager.js';
import { STORAGE_KEY_DATA, STORAGE_KEY_QUEUE_DATA } from './constants.js';

const DB_NAME = 'ObjectiveDataDB';
const DB_VERSION = 1;
const STORE_NAME = 'appDataStore';

/**
 * @typedef StoragePayload
 * @property {boolean} compressed
 * @property {string | Uint8Array} data - Uint8Array if compressed, JSON string otherwise.
 */

class StorageManagerClass {
    constructor() {
        this.db = null;
        this.compressionEnabled = true;
        this.pako = null; // pako instance will be stored here
        this.knownKeys = [STORAGE_KEY_DATA, STORAGE_KEY_QUEUE_DATA];
    }

    /**
     * Initializes the manager with external dependencies like the pako library.
     * This must be called from the main background script before any other methods are used.
     * @param {object} pakoInstance - The imported pako library instance.
     */
    initialize(pakoInstance) {
        if (!pakoInstance || typeof pakoInstance.deflate !== 'function' || typeof pakoInstance.inflate !== 'function') {
            const errorMsg = "StorageManager: A valid pako instance must be provided during initialization.";
            console.error(errorMsg);
            throw new Error(errorMsg);
        }
        this.pako = pakoInstance;
        // Use originalConsole if available, otherwise regular console
        const log = (typeof originalConsole !== 'undefined' ? originalConsole.log : console.log);
        log("StorageManager initialized with pako dependency.");
    }

    #ensureInitialized() {
        if (!this.pako) {
            throw new Error("StorageManager has not been initialized. Call StorageManager.initialize(pako) first.");
        }
    }

    /**
     * Lazily initializes and returns the IndexedDB database instance.
     * @private
     */
    async #getDb() {
        if (this.db) {
            return this.db;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                const errorMsg = 'IndexedDB failed to open.';
                console.error(errorMsg, event.target.error);
                ErrorManager.logError(errorMsg, { error: event.target.error.message }, SEVERITY.CRITICAL, CATEGORY.STORAGE);
                reject(new Error(errorMsg));
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                }
            };
        });
    }

    async storeData(data, folderKey, procYear, procMonth) {
        this.#ensureInitialized();
        try {
            if (!folderKey) {
                const errorMsg = 'Folder key is required for objective data';
                ErrorManager.logError('Missing FolderKey', { folderKey, procYear, procMonth }, SEVERITY.ERROR, CATEGORY.STORAGE);
                throw new Error(errorMsg);
            }

            if (folderKey.toLowerCase().includes('objective ecm')) {
                const warning = `StorageManager: storeData called with a generic folderKey: "${folderKey}". This may lead to data being grouped incorrectly.`;
                console.warn(warning);
                ErrorManager.logError('Generic FolderKey Detected', { folderKey, procYear, procMonth }, SEVERITY.WARNING, CATEGORY.STORAGE);
            }

            const existing = await this.retrieveAndDecompress(STORAGE_KEY_DATA) || { persons: {}, folders: {} };
            const { persons, folders } = existing;

            Object.entries(data).forEach(([person, dates]) => {
                persons[person] = persons[person] || {};
                Object.entries(dates).forEach(([dateKey, count]) => {
                    const mDate = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                    if (!mDate) return;

                    let year = parseInt(mDate[1], 10);
                    let month = parseInt(mDate[2], 10);

                    const mFolder = folderKey.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i);
                    if (mFolder) {
                        const map = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
                        month = map[mFolder[1].slice(0, 3).toLowerCase()];
                        year = parseInt(mFolder[2], 10);
                    } else if (Number.isInteger(procYear) && Number.isInteger(procMonth)) {
                        year = procYear;
                        month = procMonth;
                    }

                    persons[person][year] = persons[person][year] || {};
                    persons[person][year][month] = persons[person][year][month] || {};
                    persons[person][year][month][folderKey] = persons[person][year][month][folderKey] || {};
                    persons[person][year][month][folderKey][dateKey] = Number.isFinite(count) ? count : 0;
                });
            });

            folders[folderKey] = { ...(folders[folderKey] || {}), lastProcessed: new Date().toISOString() };

            await this.#writeToDb(STORAGE_KEY_DATA, { persons, folders });
            console.log(`StorageManager: Updated objective data for key '${STORAGE_KEY_DATA}'`);

        } catch (e) {
            console.error('StorageManager.storeData (Objective) failed:', e);
            ErrorManager.logError('Objective Data Storage Failed', { folderKey, error: e.message }, SEVERITY.ERROR, CATEGORY.STORAGE);
            throw e;
        }
    }

    async storeGenericData(key, data) {
        this.#ensureInitialized();
        try {
            if (!key) throw new Error('Storage key is required for storeGenericData');
            if (data === undefined) throw new Error('Data cannot be undefined');
            await this.#writeToDb(key, data);
        } catch (e) {
            console.error(`StorageManager.storeGenericData failed for key '${key}':`, e);
            ErrorManager.logError('Generic Data Storage Failed', { storageKey: key, error: e.message }, SEVERITY.ERROR, CATEGORY.STORAGE);
            throw e;
        }
    }

    async #writeToDb(key, data) {
        this.#ensureInitialized();
        const db = await this.#getDb();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const serialized = JSON.stringify(data);
        let payload;

        if (this.compressionEnabled) {
            try {
                const compressedBytes = this.pako.deflate(serialized);
                payload = { compressed: true, data: compressedBytes };
            } catch (compressError) {
                console.warn(`StorageManager: Compression failed for key '${key}', storing uncompressed.`);
                payload = { compressed: false, data: serialized };
            }
        } else {
            payload = { compressed: false, data: serialized };
        }
        
        const request = store.put({ key: key, value: payload });

        return new Promise((resolve, reject) => {
            request.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => {
                 console.error(`StorageManager: Failed to write to IndexedDB for key '${key}'`, event.target.error);
                 reject(event.target.error);
            };
        });
    }

    async retrieveAndDecompress(key) {
        this.#ensureInitialized();
        try {
            const db = await this.#getDb();
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);

            return new Promise((resolve, reject) => {
                request.onerror = (event) => {
                    console.error(`StorageManager: IndexedDB read error for key '${key}'`, event.target.error);
                    reject(event.target.error);
                };

                request.onsuccess = (event) => {
                    const result = event.target.result;
                    if (!result || !result.value) {
                        resolve(null);
                        return;
                    }

                    const payload = result.value;
                    if (payload.compressed) {
                        try {
                            const decompressedData = this.pako.inflate(payload.data, { to: 'string' });
                            resolve(JSON.parse(decompressedData));
                        } catch (processingError) {
                            console.error(`StorageManager: Error processing compressed data for key '${key}':`, processingError);
                            ErrorManager.logError('Decompression Failed', { storageKey: key, error: processingError.message }, SEVERITY.ERROR, CATEGORY.STORAGE);
                            reject(new Error(`Failed to process compressed data for key '${key}'`));
                        }
                    } else {
                         try {
                            resolve(JSON.parse(payload.data));
                        } catch (parseError) {
                            console.error(`StorageManager: Error parsing uncompressed JSON for key '${key}':`, parseError);
                            ErrorManager.logError('JSON Parse Failed', { storageKey: key, error: parseError.message }, SEVERITY.ERROR, CATEGORY.STORAGE);
                            reject(new Error(`Failed to parse uncompressed data for key '${key}'`));
                        }
                    }
                };
            });
        } catch (e) {
            console.error(`StorageManager: Failed to retrieve/decompress data for key '${key}':`, e);
            ErrorManager.logError('Storage Read/Decompress Failed', { storageKey: key, error: e.message }, SEVERITY.ERROR, CATEGORY.STORAGE);
            return null;
        }
    }

    setCompressionEnabled(state) {
        this.compressionEnabled = !!state;
    }

    async clearStorage(key) {
        this.#ensureInitialized();
        const keys = Array.isArray(key) ? key : [key];
        if (keys.length === 0) return;

        try {
            const db = await this.#getDb();
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            keys.forEach(k => store.delete(k));
            
            return new Promise((resolve, reject) => {
                 transaction.oncomplete = () => {
                     console.log(`StorageManager: Cleared storage key(s) from IndexedDB → ${keys.join(', ')}`);
                     resolve();
                 };
                 transaction.onerror = (event) => {
                     console.error(`StorageManager: Failed to clear storage key(s) [${keys.join(', ')}]:`, event.target.error);
                     ErrorManager.logError('Storage Clear Failed', { storageKeys: keys, error: event.target.error.message }, SEVERITY.ERROR, CATEGORY.STORAGE);
                     reject(event.target.error);
                 };
            });
        } catch (error) {
            console.error(`StorageManager: Failed to initiate clear storage for key(s) [${keys.join(', ')}]:`, error);
        }
    }
}

export const StorageManager = new StorageManagerClass();