// data-optimizer.js - Processes and optimizes data for dashboard visualizations (v1.2 - Removed Mapping Import)
'use strict';

// Removed FOLDER_NAME_MAPPINGS import

/**
 * DataOptimizer prepares data for dashboard display, ensuring display names are used.
 */
class DataOptimizer {
    constructor() {
        this.cached = null;
    }

    /**
     * Optimizes data already containing display names for dashboard display
     * @param {Object} displayData - Data with display names as keys (from storage-sync)
     * @param {Object} options - Optimization options
     * @returns {Object} Processed data with aggregates
     */
    optimizeData(displayData, options = {}) {
        console.log("DataOptimizer: Beginning optimization using display data");

        // The rest of this function already works with the displayData structure
        // where keys are assumed to be display names, as received from storage-sync.

        if (!displayData || !displayData.persons || typeof displayData.persons !== 'object') {
            console.warn("DataOptimizer: Invalid input data (expected display data structure)");
            return null;
        }

        try {
            const maxItems = options.maxItems || 50;
            const periodRange = options.periodRange || 12;

            const aggregates = { byMonth: {}, byPerson: {}, byFolder: {}, overall: { totalItems: 0, folderTotals: {}, personTotals: {} } };

            const periods = this.extractPeriods(displayData, periodRange);
             console.log("DataOptimizer: Target periods:", periods);


            // --- Aggregation Logic ---
            Object.keys(displayData.persons).forEach(person => {
                aggregates.byPerson[person] = {};
                Object.keys(displayData.persons[person]).forEach(year => {
                    Object.keys(displayData.persons[person][year]).forEach(month => {
                        const monthKey = `${year}-${String(month).padStart(2, '0')}`;

                        if (!periods.includes(monthKey)) return;

                        if (!aggregates.byMonth[monthKey]) aggregates.byMonth[monthKey] = {};
                        if (!aggregates.byPerson[person][monthKey]) aggregates.byPerson[person][monthKey] = {};

                        const foldersInMonth = displayData.persons[person][year][month]; // Keys are display names

                        Object.entries(foldersInMonth).forEach(([folderDisplayName, datesData]) => { // folderKey is display name
                            if (typeof datesData !== 'object' || datesData === null) return;
                            const count = Object.values(datesData).reduce((sum, val) => sum + (Number.isFinite(val) ? val : 0), 0);
                            if (count <= 0) return;

                            // Aggregate using the display name
                            aggregates.byMonth[monthKey][folderDisplayName] = (aggregates.byMonth[monthKey][folderDisplayName] || 0) + count;
                            aggregates.byPerson[person][monthKey][folderDisplayName] = (aggregates.byPerson[person][monthKey][folderDisplayName] || 0) + count;

                            if (!aggregates.byFolder[folderDisplayName]) aggregates.byFolder[folderDisplayName] = {};
                            if (!aggregates.byFolder[folderDisplayName][monthKey]) aggregates.byFolder[folderDisplayName][monthKey] = 0;
                            aggregates.byFolder[folderDisplayName][monthKey] += count;

                            aggregates.overall.totalItems += count;
                            aggregates.overall.folderTotals[folderDisplayName] = (aggregates.overall.folderTotals[folderDisplayName] || 0) + count;
                            aggregates.overall.personTotals[person] = (aggregates.overall.personTotals[person] || 0) + count;
                        });
                    });
                });
            });

            console.log("DataOptimizer: Optimization complete");
            return { aggregates, maxItems, periodRange, periods };

        } catch (error) {
            console.error("DataOptimizer: Error optimizing data", error);
            return null;
        }
    }

    /**
     * Extract valid periods from the data
     * @param {Object} data - Data object (can be raw or display)
     * @param {number} maxMonths - Maximum number of months to include
     * @returns {string[]} Array of period keys (YYYY-MM)
     */
    extractPeriods(data, maxMonths = 12) {
         const periods = new Set(); const padMonth = (m) => String(m).padStart(2, '0');
         Object.values(data.persons || {}).forEach(personData => {
             Object.keys(personData || {}).forEach(year => {
                 Object.keys(personData[year] || {}).forEach(month => {
                     periods.add(`${year}-${padMonth(month)}`);
                 });
             });
         });
         return Array.from(periods).sort().reverse().slice(0, maxMonths);
    }

    /**
     * Normalization function (returns the key itself or basic normalization).
     * @param {string} key - The folder key.
     * @returns {string} The key itself or normalized key.
     */
    normalizeFolderName(key) {
         return String(key || '').toLowerCase().trim();
    }
}

// Create and export singleton instance
const dataOptimizer = new DataOptimizer();
export default dataOptimizer;