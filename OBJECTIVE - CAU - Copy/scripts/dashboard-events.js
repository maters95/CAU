// TEST-works/scripts/dashboard-events.js
'use strict';
import { debounce } from './utils.js';
import { filterState, chartDataCache } from './dashboard-state.js';
import { 
    updateSelectAllVisualState, showTableModal, closeTableModal, 
    updateAllExcludeButtonsVisuals, applyGlobalExclusionToFilters, updateDashboardStatus 
} from './dashboard-ui.js';
import { updateTrendsPeriodState } from './dashboard-data.js';
import dashboardExporter from './dashboard-export.js';

function handleItemChange(e, containerId, selectAllId, updateCallback) { 
    if (e.target.type === 'checkbox' && e.target.closest('.filter-item')) { 
        updateSelectAllVisualState(containerId, selectAllId); 
        updateCallback(); 
    } 
}
function handleSelectAllChange(e, containerId, updateCallback) { const container = document.getElementById(containerId); const isChecked = e.target.checked; e.target.indeterminate = false; if (container) { container.querySelectorAll('.filter-item input[type="checkbox"]:not(:disabled)').forEach(checkbox => { checkbox.checked = isChecked; checkbox.closest('.filter-item')?.classList.toggle('selected', isChecked); }); } updateCallback(); }
function handleTrendsPeriodChange(e, updateCallback) { const selectedPeriod = e.target.value; updateTrendsPeriodState(selectedPeriod); window.updateGranularityControl(selectedPeriod); updateCallback(); }
function handleGlobalExcludeToggle(e, updateCallback) { filterState.excludeBatchesGlobally = !filterState.excludeBatchesGlobally; updateAllExcludeButtonsVisuals(filterState.excludeBatchesGlobally); applyGlobalExclusionToFilters(filterState.excludeBatchesGlobally); updateCallback(); }
function handleTrendModeChange() { filterState.trendsMode = this.value; window.triggerDashboardUpdate(); }
function handleShowTotalToggle(button, updateCallback) { filterState.showTrendsTotal = !filterState.showTrendsTotal; button.textContent = filterState.showTrendsTotal ? "Hide Total" : "Show Total"; button.classList.toggle('active', filterState.showTrendsTotal); updateCallback(); }
function handleChartTypeToggle(button, stateKey) { filterState[stateKey] = filterState[stateKey] === 'bar' ? 'pie' : 'bar'; button.textContent = filterState[stateKey] === 'bar' ? 'Switch to Pie' : 'Switch to Bar'; window.triggerDashboardUpdate(); }
function handleExportClick(button, options) { if (button.disabled) return; updateDashboardStatus(`Exporting ${options.format.toUpperCase()}...`); if (typeof dashboardExporter !== 'undefined') { try { if (options.format === 'pdf') { dashboardExporter.exportDashboardPdf().then(() => updateDashboardStatus("PDF export started.")).catch(err => { console.error("PDF Export Error:", err); updateDashboardStatus(`PDF Export Failed: ${err.message}`, true); }); } else if (options.chartId && options.instance) { const chartInstance = options.instance(); if (chartInstance) { if (options.format === 'png' || options.format === 'jpg') { dashboardExporter.exportChartAsImage(options.chartId, options.format).then(() => updateDashboardStatus(`${options.format.toUpperCase()} export started.`)).catch(err => { console.error(`${options.format.toUpperCase()} Export Error:`, err); updateDashboardStatus(`${options.format.toUpperCase()} Export Failed: ${err.message}`, true); }); } else if (options.format === 'csv') { dashboardExporter.exportChartAsCSV(options.chartId); updateDashboardStatus(`CSV export for ${options.chartId} started.`); } else { updateDashboardStatus(`Unsupported export format: ${options.format}`, true); } } else { updateDashboardStatus(`Cannot export ${options.format.toUpperCase()}: Chart not available.`, true); } } else { updateDashboardStatus("Invalid export configuration.", true); } } catch (exportError) { console.error("Export initiation error:", exportError); updateDashboardStatus(`Export Failed: ${exportError.message}`, true); } } else { updateDashboardStatus("Export functionality not available.", true); } }

function setupEventListener(element, event, handler, storageKey, updateCallback) { if (!element) return; const handlerProp = `_${event}Handler_${storageKey || Date.now()}`; element.removeEventListener(event, element[handlerProp]); element[handlerProp] = handler; if (updateCallback) element._updateCallback = updateCallback; element.addEventListener(event, element[handlerProp]); }
function setupTrendsPeriodDropdownListener(updateCallback) { const dropdown = document.getElementById('trendsPeriodSelect'); setupEventListener(dropdown, 'change', (e) => handleTrendsPeriodChange(e, updateCallback), 'trendsPeriod'); }
function setupGlobalExcludeToggle(updateCallback) { document.querySelectorAll('.exclude-batches-toggle').forEach((button, index) => { setupEventListener(button, 'click', (e) => handleGlobalExcludeToggle(e, updateCallback), `globalExclude_${index}`); }); }
function setupTrendModeSelector() { const trendsModeSelect = document.getElementById('trendsModeSelect'); setupEventListener(trendsModeSelect, 'change', handleTrendModeChange, 'trendsMode'); }
function setupShowTotalButtonListener(updateCallback) { const button = document.getElementById('toggleTrendsTotalBtn'); if (button) { button.textContent = filterState.showTrendsTotal ? "Hide Total" : "Show Total"; button.classList.toggle('active', filterState.showTrendsTotal); } setupEventListener(button, 'click', (e) => handleShowTotalToggle(e.currentTarget, updateCallback), 'showTotal'); }
function setupFilterItemListeners(containerId, selectAllId, updateCallback) { const container = document.getElementById(containerId); const selectAllCheckbox = document.getElementById(selectAllId); setupEventListener(container, 'change', (e) => handleItemChange(e, containerId, selectAllId, updateCallback), `${containerId}_itemChange`); setupEventListener(selectAllCheckbox, 'change', (e) => handleSelectAllChange(e, containerId, updateCallback), `${selectAllId}_selectAllChange`); }
function setupExportButtons() { const exportMap = { 'exportPieImage': { chartId: 'monthlyPieChart', format: 'png', instance: () => window.monthlyPieChartInstance }, 'exportPieData': { chartId: 'monthlyPieChart', format: 'csv', instance: () => window.monthlyPieChartInstance }, 'exportBarImage': { chartId: 'volumeBarChart', format: 'png', instance: () => window.volumeBarChartInstance }, 'exportBarData': { chartId: 'volumeBarChart', format: 'csv', instance: () => window.volumeBarChartInstance }, 'exportTrendImage': { chartId: 'trendsLineChart', format: 'png', instance: () => window.trendsLineChartInstance }, 'exportTrendData': { chartId: 'trendsLineChart', format: 'csv', instance: () => window.trendsLineChartInstance }, 'exportDashboardPdf': { format: 'pdf' } }; Object.entries(exportMap).forEach(([buttonId, options]) => { const button = document.getElementById(buttonId); if (button) { button._exportOptions = options; setupEventListener(button, 'click', (e) => handleExportClick(e.currentTarget, e.currentTarget._exportOptions), `${buttonId}_export`); } }); Object.keys(exportMap).forEach(buttonId => window.enableDisableExportButton(buttonId, false)); }

export function initializeEventListeners(triggerUpdate) {
    const debouncedUpdate = debounce(triggerUpdate, 350);

    const yearSelect = document.getElementById('year-select');
    const monthSelect = document.getElementById('monthSelect');
    const startDateInput = document.getElementById('trendsStartDate');
    const endDateInput = document.getElementById('trendsEndDate');
    const trendsGranularitySelect = document.getElementById('trendsGranularitySelect');
    const resetDrilldownBtn = document.getElementById('resetDrilldownBtn');
    const topPerformerCard = document.getElementById('kpi-top-performer').closest('.kpi-card');
    const highestOutputCard = document.getElementById('kpi-highest-daily-output').closest('.kpi-card');
    const busiestDayCard = document.getElementById('kpi-busiest-day').closest('.kpi-card');
    const tableModal = document.getElementById('tableModal');
    const closeTableModalBtn = document.getElementById('closeTableModalBtn');
    const toggleDistChartTypeBtn = document.getElementById('toggleDistChartTypeBtn');
    const toggleVolumeChartTypeBtn = document.getElementById('toggleVolumeChartTypeBtn');
    
    setupEventListener(yearSelect, 'change', debouncedUpdate, 'yearSelect');
    setupEventListener(monthSelect, 'change', debouncedUpdate, 'monthSelect');
    setupTrendsPeriodDropdownListener(debouncedUpdate);
    setupEventListener(startDateInput, 'change', debouncedUpdate, 'trendsStart');
    setupEventListener(endDateInput, 'change', debouncedUpdate, 'trendsEnd');
    setupEventListener(trendsGranularitySelect, 'change', (e) => { filterState.trendsGranularity = e.target.value; debouncedUpdate(); }, 'trendsGranularity');
    setupEventListener(resetDrilldownBtn, 'click', () => { filterState.drilldownEntity = null; filterState.drilldownType = null; triggerUpdate(); }, 'resetDrilldown');
    setupEventListener(closeTableModalBtn, 'click', closeTableModal, 'closeTableModal');
    setupEventListener(tableModal, 'click', (e) => { if (e.target === tableModal) closeTableModal(); }, 'overlayClose');
    setupEventListener(toggleDistChartTypeBtn, 'click', (e) => handleChartTypeToggle(e.currentTarget, 'distChartType'), 'toggleDistChart');
    setupEventListener(toggleVolumeChartTypeBtn, 'click', (e) => handleChartTypeToggle(e.currentTarget, 'volumeChartType'), 'toggleVolumeChart');
    if (topPerformerCard) {
        topPerformerCard.style.cursor = "pointer";
        topPerformerCard.title = "Click to deep dive this person";
        setupEventListener(topPerformerCard, 'click', () => {
            const topPerformerName = document.getElementById('kpi-top-performer').textContent;
            if (topPerformerName && topPerformerName !== '-') {
                filterState.drilldownEntity = topPerformerName;
                filterState.drilldownType = 'person';
                triggerUpdate();
            }
        }, 'kpiTopPerformerClick');
    }
    if (highestOutputCard) {
        highestOutputCard.style.cursor = "pointer";
        highestOutputCard.title = "Click to deep dive this person";
        setupEventListener(highestOutputCard, 'click', () => {
            const highestOutputText = document.getElementById('kpi-highest-daily-output').textContent;
            if (highestOutputText && highestOutputText !== '-') {
                const parts = highestOutputText.split(' ');
                const onIndex = parts.lastIndexOf('on');
                const personName = parts.slice(0, onIndex - 1).join(' ');
                if (personName) {
                     filterState.drilldownEntity = personName;
                     filterState.drilldownType = 'person';
                     triggerUpdate();
                }
            }
        }, 'kpiHighestOutputClick');
    }
    setupEventListener(busiestDayCard, 'click', () => {
        const busiestDate = busiestDayCard.dataset.date;
        if (busiestDate) {
            filterState.drilldownEntity = busiestDate;
            filterState.drilldownType = 'busiestDay';
            triggerUpdate();
        }
    }, 'kpiBusiestDayClick');

    const tableToggles = {'togglePieTableBtn': 'monthlyPieChart', 'toggleBarTableBtn': 'volumeBarChart', 'toggleTrendTableBtn': 'trendsLineChart'};
    Object.entries(tableToggles).forEach(([btnId, chartKey]) => {
        const button = document.getElementById(btnId);
        if(button) setupEventListener(button, 'click', () => {
            const data = chartDataCache[chartKey];
            const chartContainer = document.getElementById(chartKey)?.closest('.chart-container');
            const title = chartContainer?.querySelector('h3')?.textContent || 'Chart Data';
            if (data) showTableModal(title, data.headers, data.rows);
            else showTableModal(title, [], []);
        }, btnId);
    });
    
    setupGlobalExcludeToggle(debouncedUpdate);
    setupTrendModeSelector();
    setupShowTotalButtonListener(debouncedUpdate);
    setupFilterItemListeners('peopleContainer', 'selectAllPeople', debouncedUpdate);
    setupFilterItemListeners('folderContainer', 'selectAllFolders', debouncedUpdate);
    setupExportButtons();

    window.addEventListener('filters-ready', () => { console.log("Dashboard: 'filters-ready' event. Triggering update."); triggerUpdate(); });
}