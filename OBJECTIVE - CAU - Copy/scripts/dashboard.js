// TEST-works/scripts/dashboard.js
// Main dashboard controller (v3.2 - Enhanced Import/Refresh)
'use strict';

// --- Module Imports ---
import dashboardDataSync from './storage-sync.js';
import dashboardExporter from './dashboard-export.js';
import { filterState } from './dashboard-state.js';
import { 
    updateDashboardStatus, enableDisableExportButton, updateAllExcludeButtonsVisuals, 
    applyGlobalExclusionToFilters, setDefaultDateRange, updateKpiCards,
    clearCanvas
} from './dashboard-ui.js';
import { 
    getSelectedPeriod, getSelectedPeople, getSelectedFolders, getTrendsDateRange, 
    aggregateDataForDashboard, updateTrendsPeriodState 
} from './dashboard-data.js';
import { 
    renderMonthlyDistribution, renderVolumeBreakdown, renderTrendsChart, 
    renderDeepDive, clearCharts 
} from './dashboard-charts.js';
import { initializeEventListeners } from './dashboard-events.js';
import { debounce, generateChartColors, formatLabel } from './utils.js';

console.log("Dashboard.js: Script loaded (v3.2 - Enhanced Import/Refresh).");

// --- Global Functions (for utility and event handlers) ---
window.updateGranularityControl = (selectedPeriod) => {
    const granularitySelect = document.getElementById('trendsGranularitySelect');
    if (!granularitySelect) return;
    let newGranularity = 'monthly';
    let isDisabled = false;
    const fixedDaily = ['monthly-view-daily', 'this-week-daily', 'last-week-daily', 'mtd-daily'];
    const fixedWeekly = ['monthly-view-weekly', 'mtd-weekly'];
    if (fixedDaily.includes(selectedPeriod)) {
        newGranularity = 'daily';
        isDisabled = true;
    } else if (fixedWeekly.includes(selectedPeriod)) {
        newGranularity = 'weekly';
        isDisabled = true;
    }
    granularitySelect.value = newGranularity;
    granularitySelect.disabled = isDisabled;
    filterState.trendsGranularity = newGranularity;
};
window.enableDisableExportButton = enableDisableExportButton;

// --- Core Application Logic ---
let chartRenderingPromises = [];

async function triggerDataUpdate() {
    console.log("--- triggerDataUpdate START ---");
    updateDashboardStatus("Updating dashboard...");
    chartRenderingPromises = [];
    
    // Enhanced data loading with comprehensive fallback
    let currentData = dashboardDataSync.getCurrentData();
    
    // If no data, try to refresh from storage
    if (!currentData?.persons || Object.keys(currentData.persons).length === 0) {
        console.log("Dashboard: No data in sync, attempting refresh...");
        updateDashboardStatus("Loading data...");
        
        try {
            // Force data sync refresh
            if (dashboardDataSync && typeof dashboardDataSync.refreshData === 'function') {
                await dashboardDataSync.refreshData();
                currentData = dashboardDataSync.getCurrentData();
            }
            
            // If still no data, try comprehensive loading
            if (!currentData?.persons || Object.keys(currentData.persons).length === 0) {
                console.log("Dashboard: Attempting comprehensive data loading...");
                currentData = await loadDataWithComprehensiveFallback();
                
                // Update data sync with loaded data
                if (currentData?.persons && Object.keys(currentData.persons).length > 0) {
                    dashboardDataSync.rawData = currentData;
                }
            }
        } catch (loadError) {
            console.error("Dashboard: Error during data loading:", loadError);
            updateDashboardStatus(`Data loading error: ${loadError.message}`, true);
        }
    }
    
    if (!currentData?.persons || Object.keys(currentData.persons).length === 0) {
        updateDashboardStatus("No data available. Import data to get started.", true);
        clearCharts();
        return Promise.resolve();
    }
    
    console.log(`Dashboard: Working with data containing ${Object.keys(currentData.persons).length} persons`);
    
    const { selectedYear, selectedMonth } = getSelectedPeriod();
    const selectedPeople = getSelectedPeople();
    const selectedFolders = getSelectedFolders();
    const trendDateRange = getTrendsDateRange();

    if (trendDateRange === null) {
        if (filterState.trendsPeriod.startsWith('monthly-view')) {
            updateDashboardStatus("Select a month and year to use this trend view.", true);
        } else if (filterState.trendsPeriod === 'custom') {
            updateDashboardStatus("Select start and end dates for custom range.", true);
        }
        if (window.trendsLineChartInstance) {
            window.trendsLineChartInstance.destroy();
            window.trendsLineChartInstance = null;
        }
        clearCanvas(document.getElementById('trendsLineChart')?.getContext('2d'));
        enableDisableExportButton('exportTrendData', false);
        enableDisableExportButton('exportTrendImage', false);
    }

    const distVolumeNeedsUpdate = selectedYear !== null && selectedMonth !== null;
    if (!distVolumeNeedsUpdate) {
        if (window.monthlyPieChartInstance) window.monthlyPieChartInstance.destroy();
        if (window.volumeBarChartInstance) window.volumeBarChartInstance.destroy();
        clearCanvas(document.getElementById('monthlyPieChart')?.getContext('2d'));
        clearCanvas(document.getElementById('volumeBarChart')?.getContext('2d'));
        enableDisableExportButton('exportPieData', false);
        enableDisableExportButton('exportPieImage', false);
        enableDisableExportButton('exportBarData', false);
        enableDisableExportButton('exportBarImage', false);
    }

    if ((selectedPeople !== null && selectedPeople.length === 0) || (selectedFolders !== null && selectedFolders.length === 0)) {
        updateDashboardStatus("No data matches filter selection.");
        clearCharts();
        return Promise.resolve();
    }

    try {
        const aggregatedData = await aggregateDataForDashboard(currentData, selectedYear, selectedMonth, selectedPeople, selectedFolders, trendDateRange?.startDate, trendDateRange?.endDate);

        if (filterState.drilldownEntity) {
            renderDeepDive(aggregatedData);
        } else {
            document.getElementById('mainDashboardCard').classList.remove('hidden');
            const container = document.getElementById('deep-dive-container');
            const dashboardContainer = document.getElementById('dashboardContainer');
            container.classList.add('hidden');
            dashboardContainer.classList.remove('hidden');
            document.getElementById('resetDrilldownBtn').style.display = 'none';

            const hasDistVolumeData = distVolumeNeedsUpdate && (Object.keys(aggregatedData.monthlyDistribution).length > 0 || Object.keys(aggregatedData.volumeBreakdown).length > 0);
            if (distVolumeNeedsUpdate) {
                if (hasDistVolumeData) {
                    chartRenderingPromises.push(renderMonthlyDistribution(aggregatedData.monthlyDistribution, aggregatedData.activeDays.folders));
                    chartRenderingPromises.push(renderVolumeBreakdown(aggregatedData.volumeBreakdown, aggregatedData.consistencyScores));
                } else {
                    clearCharts(); 
                }
            }
        }

        const hasTrendData = trendDateRange && aggregatedData.trendsChartData?.datasets?.some(ds => ds.data?.length > 0 && ds.data.some(p => p !== 0));
        if (trendDateRange && !filterState.drilldownEntity) {
            if (hasTrendData) {
                chartRenderingPromises.push(renderTrendsChart(aggregatedData.trendsChartData, aggregatedData.trendsTableData));
            } else {
                if (window.trendsLineChartInstance) window.trendsLineChartInstance.destroy();
                clearCanvas(document.getElementById('trendsLineChart')?.getContext('2d'));
                enableDisableExportButton('exportTrendData', false);
                enableDisableExportButton('exportTrendImage', false);
            }
        } else if (!filterState.drilldownEntity) {
            if (window.trendsLineChartInstance) window.trendsLineChartInstance.destroy();
            clearCanvas(document.getElementById('trendsLineChart')?.getContext('2d'));
            enableDisableExportButton('exportTrendData', false);
            enableDisableExportButton('exportTrendImage', false);
        }

        await Promise.all(chartRenderingPromises);
        console.log("--- All charts updated/cleared ---");
        if (Object.keys(aggregatedData.volumeBreakdown).length > 0 || hasTrendData) {
            updateDashboardStatus("Ready");
            enableDisableExportButton('exportDashboardPdf', true);
        } else {
            updateDashboardStatus("No data available for selection.");
            enableDisableExportButton('exportDashboardPdf', false);
        }
    } catch (error) {
        console.error("Dashboard.js: Error during triggerDataUpdate", error);
        updateDashboardStatus(`Update Error: ${error.message}`, true);
        clearCharts();
        return Promise.reject(error);
    }
    console.log("--- triggerDataUpdate END ---");
    return Promise.resolve();
}

// Enhanced comprehensive data loading
async function loadDataWithComprehensiveFallback() {
    console.log("Dashboard: Loading with comprehensive fallback...");
    
    try {
        // Wait for storage manager and any import scenarios
        if (typeof window !== 'undefined' && window.waitForStorageManager) {
            await window.waitForStorageManager();
        }
        
        if (typeof window !== 'undefined' && window.waitForPostImportMigration) {
            await window.waitForPostImportMigration();
        }

        // Method 1: Try StorageManager IndexedDB
        if (typeof StorageManager !== 'undefined' && StorageManager.retrieveAndDecompress) {
            console.log("Dashboard: Trying StorageManager IndexedDB...");
            const indexedData = await StorageManager.retrieveAndDecompress('objectiveData');
            if (indexedData && indexedData.persons && Object.keys(indexedData.persons).length > 0) {
                console.log(`Dashboard: Retrieved from IndexedDB - ${Object.keys(indexedData.persons).length} persons`);
                return indexedData;
            }
        }

        // Method 2: Try browser storage for objectiveCumulativeData
        console.log("Dashboard: Trying browser storage for objectiveCumulativeData...");
        const browserAPI = (typeof chrome !== 'undefined') ? chrome : (typeof browser !== 'undefined' ? browser : null);
        if (browserAPI && browserAPI.storage) {
            const result = await new Promise((resolve) => {
                browserAPI.storage.local.get('objectiveCumulativeData', resolve);
            });
            
            if (result.objectiveCumulativeData) {
                console.log("Dashboard: Found objectiveCumulativeData, parsing...");
                const parsedData = await parseObjectiveCumulativeDataForDashboard(result.objectiveCumulativeData);
                if (parsedData && parsedData.persons && Object.keys(parsedData.persons).length > 0) {
                    console.log(`Dashboard: Parsed cumulative data - ${Object.keys(parsedData.persons).length} persons`);
                    return parsedData;
                }
            }
        }

        // Method 3: Try direct storage key
        console.log("Dashboard: Trying direct storage access...");
        if (browserAPI && browserAPI.storage) {
            const directResult = await new Promise((resolve) => {
                browserAPI.storage.local.get('objectiveData', resolve);
            });
            
            if (directResult.objectiveData && directResult.objectiveData.persons) {
                console.log(`Dashboard: Found direct storage data - ${Object.keys(directResult.objectiveData.persons).length} persons`);
                return directResult.objectiveData;
            }
        }

        console.log("Dashboard: No data found in any source, returning empty structure");
        return { persons: {}, folders: {} };

    } catch (error) {
        console.error("Dashboard: Error in comprehensive data loading:", error);
        return { persons: {}, folders: {} };
    }
}

// Enhanced parsing function for objectiveCumulativeData
async function parseObjectiveCumulativeDataForDashboard(cumulativeData) {
    try {
        if (!cumulativeData || !cumulativeData.data) {
            console.warn("Dashboard: No data in objectiveCumulativeData");
            return null;
        }

        let rawData = cumulativeData.data;
        
        // Handle compression if present
        if (cumulativeData.compressed && typeof StorageManager !== 'undefined' && StorageManager.pako && !StorageManager.pako.error) {
            try {
                console.log('Dashboard: Decompressing objective data...');
                rawData = StorageManager.pako.inflate(rawData, { to: 'string' });
            } catch (decompressError) {
                console.error('Dashboard: Decompression failed:', decompressError);
                // Continue with raw data
            }
        }

        // Parse JSON if it's a string
        let statsData;
        if (typeof rawData === 'string') {
            try {
                statsData = JSON.parse(rawData);
                console.log('Dashboard: Successfully parsed JSON from string');
            } catch (parseError) {
                console.error('Dashboard: JSON parsing failed:', parseError);
                return null;
            }
        } else if (typeof rawData === 'object' && rawData !== null) {
            statsData = rawData;
            console.log('Dashboard: Using object data directly');
        } else {
            console.error('Dashboard: Unexpected data type:', typeof rawData);
            return null;
        }

        // Transform to dashboard format
        return transformStatsToDashboardFormat(statsData);

    } catch (error) {
        console.error('Dashboard: Error parsing cumulative data:', error);
        return null;
    }
}

// Transform stats data to dashboard format
function transformStatsToDashboardFormat(statsData) {
    try {
        console.log('Dashboard: Transforming stats data to dashboard format...');
        
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
                        console.log('Dashboard: Data is already in dashboard format');
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
        console.log(`Dashboard: Transformed data for ${personCount} persons`);
        
        return dashboardData;

    } catch (error) {
        console.error('Dashboard: Error transforming stats data:', error);
        return { persons: {}, folders: {} };
    }
}

// Enhanced import event handling
function setupEnhancedImportEventListeners() {
    if (typeof window !== 'undefined') {
        // Data imported event
        window.addEventListener('dataImported', async (event) => {
            console.log('Dashboard: Data import detected, refreshing...', event.detail);
            updateDashboardStatus('Data imported successfully. Refreshing dashboard...');
            
            // Wait a moment for migration to complete
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Force data sync refresh
            if (dashboardDataSync && typeof dashboardDataSync.refreshData === 'function') {
                await dashboardDataSync.refreshData();
            }
            
            // Trigger dashboard update
            await triggerDataUpdate();
        });

        // Post-import migration completion
        window.addEventListener('postImportMigrationComplete', async () => {
            console.log('Dashboard: Post-import migration completed, refreshing...');
            updateDashboardStatus('Import processing complete. Refreshing dashboard...');
            
            // Force data sync refresh
            if (dashboardDataSync && typeof dashboardDataSync.refreshData === 'function') {
                await dashboardDataSync.refreshData();
            }
            
            // Trigger dashboard update
            await triggerDataUpdate();
        });

        // Storage refresh events
        window.addEventListener('storageRefreshed', async () => {
            console.log('Dashboard: Storage refresh detected, updating...');
            updateDashboardStatus('Storage refreshed. Updating dashboard...');
            
            // Force data sync refresh
            if (dashboardDataSync && typeof dashboardDataSync.refreshData === 'function') {
                await dashboardDataSync.refreshData();
            }
            
            await triggerDataUpdate();
        });

        // Data refresh needed
        window.addEventListener('dataRefreshNeeded', async () => {
            console.log('Dashboard: Data refresh requested, updating...');
            updateDashboardStatus('Data refresh requested. Updating...');
            
            // Force data sync refresh
            if (dashboardDataSync && typeof dashboardDataSync.refreshData === 'function') {
                await dashboardDataSync.refreshData();
            }
            
            await triggerDataUpdate();
        });
    }
}

// --- Enhanced Initialization ---
async function initializeDashboard() {
    console.log("Dashboard.js: Initializing...");
    try {
        if (typeof Chart === 'undefined') { 
            throw new Error("Charting library missing."); 
        }

        // Wait for storage manager AND any import scenarios
        console.log("Dashboard: Waiting for storage initialization...");
        if (typeof window !== 'undefined' && window.waitForStorageManager) {
            await window.waitForStorageManager();
        }

        // CRITICAL: Wait for post-import migration if in progress
        if (typeof window !== 'undefined' && window.waitForPostImportMigration) {
            console.log("Dashboard: Waiting for post-import migration...");
            await window.waitForPostImportMigration();
        }

        // Additional wait for data stability after import
        if (window.postImportMigrationInProgress) {
            console.log("Dashboard: Migration still in progress, waiting...");
            await new Promise(resolve => {
                const checkMigration = () => {
                    if (window.postImportMigrationComplete) {
                        console.log("Dashboard: Migration completed, proceeding...");
                        resolve();
                    } else {
                        setTimeout(checkMigration, 500);
                    }
                };
                checkMigration();
            });
        }

        // Chart.js setup
        const legendSizer = {
            id: 'legendSizer',
            beforeUpdate: (chart) => {
                const legendOpts = chart.options.plugins.legend;
                if (chart.config.type === 'pie' && legendOpts && legendOpts.display && legendOpts.position === 'right') {
                    const numItems = chart.data.labels.length;
                    let fontSize = 11;
                    if (numItems > 22) {
                        fontSize = 8;
                    } else if (numItems > 15) {
                        fontSize = 9;
                    }
                    if (!legendOpts.labels.font) {
                        legendOpts.labels.font = {};
                    }
                    legendOpts.labels.font.size = fontSize;
                }
            }
        };

        const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
        Chart.defaults.color = prefersDark ? '#e0e0e0' : '#333';
        Chart.defaults.borderColor = prefersDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        Chart.defaults.backgroundColor = prefersDark ? '#1e1e1e' : '#fff';
        Chart.defaults.plugins.background = { color: Chart.defaults.backgroundColor };
        
        if (typeof Chart.register === 'function') { 
            Chart.register(legendSizer, { 
                id: 'background', 
                beforeDraw: (chart) => { 
                    if (chart.options.plugins.background?.color) { 
                        const {ctx} = chart; 
                        ctx.save(); 
                        ctx.fillStyle = chart.options.plugins.background.color; 
                        ctx.fillRect(0, 0, chart.width, chart.height); 
                        ctx.restore(); 
                    } 
                } 
            }); 
        }
        
        document.querySelectorAll('.chart-canvas-container[data-message]').forEach(el => el.removeAttribute('data-message'));
        
        // Dashboard exporter setup
        if (typeof dashboardExporter?.initialize === 'function') {
            dashboardExporter.initialize();
            if (typeof dashboardExporter?.setStatusUpdater === 'function') {
                dashboardExporter.setStatusUpdater(updateDashboardStatus);
                console.log("Dashboard.js: Status updater injected into DashboardExporter.");
            }
        }
        
        // ENHANCED: Initialize data sync with retry logic
        if (typeof dashboardDataSync?.initialize === 'function') {
            console.log("Dashboard: Initializing data sync...");
            
            // Retry mechanism for data sync initialization
            let retryCount = 0;
            const maxRetries = 3;
            
            while (retryCount < maxRetries) {
                try {
                    await dashboardDataSync.initialize();
                    
                    // Verify data was loaded
                    const testData = dashboardDataSync.getCurrentData();
                    if (testData && testData.persons && Object.keys(testData.persons).length > 0) {
                        console.log(`Dashboard: Data sync initialized successfully with ${Object.keys(testData.persons).length} persons`);
                        break;
                    } else if (retryCount < maxRetries - 1) {
                        console.warn(`Dashboard: Data sync initialized but no data found, retrying... (${retryCount + 1}/${maxRetries})`);
                        retryCount++;
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        continue;
                    } else {
                        console.warn("Dashboard: Data sync initialized but no data available");
                    }
                    break;
                } catch (syncError) {
                    retryCount++;
                    console.error(`Dashboard: Data sync initialization attempt ${retryCount} failed:`, syncError);
                    if (retryCount >= maxRetries) {
                        throw syncError;
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            // Subscribe to data changes with enhanced logging
            dashboardDataSync.subscribe((data) => {
                console.log("--- handleDataUpdate START (Data Sync Trigger) ---");
                console.log("Dashboard: Data sync update received:", {
                    hasPersons: !!(data?.persons),
                    personCount: data?.persons ? Object.keys(data.persons).length : 0,
                    hasFolders: !!(data?.folders),
                    folderCount: data?.folders ? Object.keys(data.folders).length : 0
                });
                triggerDataUpdate();
                console.log("--- handleDataUpdate END (Data Sync Trigger) ---");
            });
        } else { 
            throw new Error("Data Sync module failed!"); 
        }

        // UI setup
        setDefaultDateRange();
        const trendsPeriodSelect = document.getElementById('trendsPeriodSelect');
        updateTrendsPeriodState(trendsPeriodSelect ? trendsPeriodSelect.value : filterState.trendsPeriod);
        window.updateGranularityControl(trendsPeriodSelect ? trendsPeriodSelect.value : filterState.trendsPeriod);

        initializeEventListeners(triggerDataUpdate);
        
        updateAllExcludeButtonsVisuals(filterState.excludeBatchesGlobally);
        applyGlobalExclusionToFilters(filterState.excludeBatchesGlobally);

        // Enhanced import event listeners
        setupEnhancedImportEventListeners();

        // Force initial data load with retry
        console.log("Dashboard: Triggering initial data update...");
        await triggerDataUpdate();

        console.log("Dashboard.js: Initialization sequence complete.");
        
    } catch (error) {
        console.error("Dashboard.js: Initialization failed", error);
        updateDashboardStatus(`Initialization Error: ${error.message}`, true);
    }
}

// --- Global Export and Execution ---
window.triggerDashboardUpdate = triggerDataUpdate;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDashboard);
} else {
    initializeDashboard();
}