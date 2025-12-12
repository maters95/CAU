// TEST-works/scripts/dashboard-state.js
'use strict';

// Centralized state management for the dashboard

export const filterState = {
    excludeBatchesGlobally: true,
    trendsMode: 'people',
    showTrendsTotal: false,
    trendsPeriod: 'this-week-daily',
    trendsGranularity: 'daily',
    trendsStartDate: null,
    trendsEndDate: null,
    omitEmptyTrendKeys: true,
    drilldownEntity: null,
    drilldownType: null, // 'person' or 'folder'
    distChartType: 'bar',
    volumeChartType: 'bar',
};

export const chartDataCache = {
    monthlyPieChart: null,
    volumeBarChart: null,
    trendsLineChart: null,
};

// State variables that can be reassigned
export let cachedPrevPeriodMetrics = null;
export let currentFolderPersonBreakdown = {};
export let currentPersonFolderBreakdown = {};

// *** FIXED: Added setter functions to modify state from other modules ***
export function setCachedPrevPeriodMetrics(data) {
    cachedPrevPeriodMetrics = data;
}
export function setCurrentFolderPersonBreakdown(data) {
    currentFolderPersonBreakdown = data;
}
export function setCurrentPersonFolderBreakdown(data) {
    currentPersonFolderBreakdown = data;
}


// This is a bridge to keep dashboard-export.js working without modification.
export const chartInstances = {
    monthlyPieChart: null,
    volumeBarChart: null,
    trendsLineChart: null,
    deepDiveChart: null
};

// Expose state to the window for debugging or legacy access if needed.
window.filterState = filterState;