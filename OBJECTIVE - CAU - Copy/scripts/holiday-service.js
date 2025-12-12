// scripts/holiday-service.js (v1.8 - Fallback Primary, API Fetch Commented)
'use strict';

// Assuming ErrorManager and constants are correctly imported if this file is used as a module
// If run standalone or unsure, define constants locally or ensure imports work.
// import { ErrorManager } from './error-manager.js'; // Uncomment if needed
// import { STORAGE_KEY_HOLIDAYS, STORAGE_KEY_HOLIDAYS_FETCHED } from './constants.js'; // Uncomment if needed
const STORAGE_KEY_HOLIDAYS = 'nswPublicHolidays';
const STORAGE_KEY_HOLIDAYS_FETCHED = 'nswPublicHolidaysLastFetched';

// --- Configuration ---
const NSW_HOLIDAY_RESOURCE_ID = 'a7184508-d844-44f3-b5cb-e611161b8550'; // Still likely 404
const HOLIDAY_API_URL = `https://data.nsw.gov.au/data/api/3/action/datastore_search?resource_id=${NSW_HOLIDAY_RESOURCE_ID}&limit=500`;
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 1 day

// --- Hardcoded Fallbacks (Extended to 2030) ---
// Keep this updated if possible
const FALLBACK_HOLIDAYS = {
    "2024": ["2024-01-01", "2024-01-26", "2024-03-29", "2024-03-30", "2024-03-31", "2024-04-01", "2024-04-25", "2024-06-10", "2024-10-07", "2024-12-25", "2024-12-26"],
    "2025": ["2025-01-01", "2025-01-27", "2025-04-18", "2025-04-19", "2025-04-20", "2025-04-21", "2025-04-25", "2025-06-09", "2025-10-06", "2025-12-25", "2025-12-26"],
    "2026": ["2026-01-01", "2026-01-26", "2026-04-03", "2026-04-04", "2026-04-05", "2026-04-06", "2026-04-25", "2026-06-08", "2026-10-05", "2026-12-25", "2026-12-26", "2026-12-28"],
    "2027": ["2027-01-01", "2027-01-26", "2027-03-26", "2027-03-27", "2027-03-28", "2027-03-29", "2027-04-25", "2027-04-26", "2027-06-14", "2027-10-04", "2027-12-25", "2027-12-27", "2027-12-26", "2027-12-28"],
    "2028": ["2028-01-01", "2028-01-03", "2028-01-26", "2028-04-14", "2028-04-15", "2028-04-16", "2028-04-17", "2028-04-25", "2028-06-12", "2028-10-02", "2028-12-25", "2028-12-26"],
    "2029": ["2029-01-01", "2029-01-26", "2029-03-30", "2029-03-31", "2029-04-01", "2029-04-02", "2029-04-25", "2029-06-11", "2029-10-01", "2029-12-25", "2029-12-26"],
    "2030": ["2030-01-01", "2030-01-26", "2030-01-28", "2030-04-19", "2030-04-20", "2030-04-21", "2030-04-22", "2030-04-25", "2030-06-10", "2030-10-07", "2030-12-25", "2030-12-26"]
};
const ALL_FALLBACK_HOLIDAYS_SET = new Set(Object.values(FALLBACK_HOLIDAYS).flat());

// Use chrome directly if ErrorManager isn't available/imported
const api = (typeof chrome !== 'undefined') ? chrome : null;

export const holidayService = {
    holidaysSet: new Set(),
    lastFetchedTimestamp: null, // Keep track if we ever *did* fetch successfully
    isInitialized: false,
    initializationPromise: null,

    async initialize() {
        if (this.isInitialized) return;
        if (this.initializationPromise) return this.initializationPromise;

        console.log("Holiday Service: Initializing...");
        this.initializationPromise = (async () => {
            try {
                // 1. Attempt to load from storage FIRST
                await this._loadHolidaysFromStorage();

                // 2. If storage is empty, load fallbacks immediately
                if (this.holidaysSet.size === 0) {
                    if (ALL_FALLBACK_HOLIDAYS_SET.size > 0) {
                        console.log("Holiday Service: No holidays in storage, loading fallbacks.");
                        this.holidaysSet = new Set(ALL_FALLBACK_HOLIDAYS_SET);
                    } else {
                        console.warn("Holiday Service: No holidays in storage and no fallbacks available!");
                    }
                }

                // 3. Attempt API fetch (now commented out by default)
                 // await this.fetchHolidays(); // Attempt fetch - uncomment to re-enable

                console.log(`Holiday Service: Init complete. Using ${this.holidaysSet.size} holidays (likely fallback).`);
                this.isInitialized = true;

            } catch (error) {
                 console.error("Holiday Service: CRITICAL Init failed:", error);
                 // Ensure fallback is loaded even if storage load failed
                 if (this.holidaysSet.size === 0 && ALL_FALLBACK_HOLIDAYS_SET.size > 0) {
                    console.warn("HS: Using fallback due to critical init error.");
                    this.holidaysSet = new Set(ALL_FALLBACK_HOLIDAYS_SET);
                    this.isInitialized = true; // Mark init even with fallback
                 }
                 // Log error using ErrorManager if available
                 // ErrorManager?.logError('Holiday init failed', { error: error.message }, ErrorManager.SEVERITY.CRITICAL);
            } finally {
                this.initializationPromise = null;
            }
        })();
        return this.initializationPromise;
    },

    async _loadHolidaysFromStorage() {
         try {
             if (!api || !api.storage) {
                 console.warn("HS: Storage API not available for loading holidays.");
                 return;
             }
            const result = await new Promise((resolve) => { api.storage.local.get([STORAGE_KEY_HOLIDAYS, STORAGE_KEY_HOLIDAYS_FETCHED], data => { resolve(data || {}); }); });
            const stored = result?.[STORAGE_KEY_HOLIDAYS];
            this.lastFetchedTimestamp = result?.[STORAGE_KEY_HOLIDAYS_FETCHED] || null; // Store last fetch time

            if (Array.isArray(stored) && stored.every(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))) {
                 this.holidaysSet = new Set(stored);
                 console.log(`HS: Loaded ${this.holidaysSet.size} holidays from storage. Last fetched: ${this.lastFetchedTimestamp ? new Date(this.lastFetchedTimestamp).toISOString() : 'Never'}`);
            } else {
                this.holidaysSet = new Set(); // Ensure it's reset if storage is invalid
                if (stored != null) console.warn("HS: Invalid stored holiday data found.");
            }
        } catch (error) {
            console.error("HS: Failed load from storage:", error);
            this.holidaysSet = new Set();
            this.lastFetchedTimestamp = null;
            // ErrorManager?.logError('HS: Failed load from storage', { error: error.message }, ErrorManager.SEVERITY.ERROR);
        }
    },

    // API Fetch function - kept but commented out as the primary source
    async fetchHolidays(forceFetch = false) {
         console.warn("HS: API Fetch is currently disabled due to 404 errors. Using fallback/stored data.");
         return false; // Indicate fetch was not attempted/successful

         /* UNCOMMENT TO RE-ENABLE API FETCH
         const now = Date.now();
         // Only fetch if forced, or cache expired, or never fetched
         if (!forceFetch && this.lastFetchedTimestamp && (now - this.lastFetchedTimestamp < CACHE_DURATION_MS)) {
             console.log("HS: Using cached holidays.");
             return true; // Indicate using cache is fine
         }

         console.log(`HS: Attempting API Fetch (Force: ${forceFetch})...`);
         try {
             const response = await fetch(HOLIDAY_API_URL);
             if (!response.ok) {
                 throw new Error(`API status ${response.status}`); // Includes 404
             }
             const data = await response.json();
             if (!data?.success || !Array.isArray(data.result?.records)) {
                 throw new Error('API response format invalid.');
             }

             const fetchedDates = data.result.records
                .map(r => r.Date?.split('T')[0]) // Extract date part
                .filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d)); // Validate format

             if (fetchedDates.length === 0) {
                 console.warn("HS: API fetch OK but returned 0 valid holiday dates.");
                 // Don't overwrite potentially good stored/fallback data
                 return false; // Indicate fetch didn't yield usable data
             }

             console.log(`HS: Successfully fetched ${fetchedDates.length} holidays from API.`);
             this.holidaysSet = new Set(fetchedDates);
             this.lastFetchedTimestamp = Date.now();

             // Save to storage
             if (api && api.storage) {
                 await new Promise((resolve) => {
                     api.storage.local.set({
                         [STORAGE_KEY_HOLIDAYS]: Array.from(this.holidaysSet),
                         [STORAGE_KEY_HOLIDAYS_FETCHED]: this.lastFetchedTimestamp
                     }, () => {
                         if (api.runtime.lastError) {
                             console.error("HS: Error saving fetched holidays:", api.runtime.lastError.message);
                         }
                         resolve();
                     });
                 });
             }
             return true; // Fetch successful

         } catch (error) {
             console.error("HS: API Fetch failed:", error.message);
             // Do NOT overwrite existing holidays if fetch fails, rely on stored/fallback
             if (this.holidaysSet.size > 0) {
                console.warn(`HS: Retaining ${this.holidaysSet.size} previously loaded/fallback holidays.`);
             } else if (ALL_FALLBACK_HOLIDAYS_SET.size > 0) {
                 console.warn("HS: Fetch failed, using fallback holidays as last resort.");
                 this.holidaysSet = new Set(ALL_FALLBACK_HOLIDAYS_SET);
             } else {
                 console.error("HS: Fetch failed and NO fallback holidays available!");
             }
             // Log error using ErrorManager if available
             // ErrorManager?.logError('HS: API Fetch failed', { error: error.message }, ErrorManager.SEVERITY.WARNING);
             return false; // Indicate fetch failed
         }
         */
    },

    isPublicHoliday(dateString) {
         if (!this.isInitialized) {
             // This shouldn't happen if initialize is awaited properly elsewhere
             console.warn("isPublicHoliday called before service initialized! Returning false.");
             return false;
         }
         if (!dateString || typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
             return false; // Invalid date format
         }
         return this.holidaysSet.has(dateString);
    },

    // Get holidays (ensure initialized first)
    async getHolidays() {
        if (!this.isInitialized) {
            await this.initialize();
        }
        return Array.from(this.holidaysSet); // Return a copy
     }
};

// Initial call to start loading on script load
holidayService.initialize();