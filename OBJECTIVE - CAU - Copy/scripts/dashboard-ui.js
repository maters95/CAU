// TEST-works/scripts/dashboard-ui.js
'use strict';
import { BATCH_FOLDER_DISPLAY_NAMES_TO_EXCLUDE } from './constants.js';

export function updateDashboardStatus(message, isError = false) { let statusDiv = document.getElementById('dashboardStatusDiv'); let fallbackStatusDiv = document.getElementById('statusDiv'); if (!statusDiv && !fallbackStatusDiv) { const newStatusDiv = document.createElement('div'); newStatusDiv.id = 'dashboardStatusDiv'; newStatusDiv.className = 'status'; const filtersDiv = document.querySelector('.filters'); if (filtersDiv?.parentNode) { filtersDiv.parentNode.insertBefore(newStatusDiv, filtersDiv.nextSibling); statusDiv = newStatusDiv; } else { console.warn("Could not find place to insert dashboardStatusDiv."); } } const targetDiv = statusDiv || fallbackStatusDiv; if (targetDiv) { targetDiv.textContent = message; targetDiv.className = `status ${isError ? 'error' : 'info'}`; targetDiv.style.display = 'block'; } else { console.log(`Dashboard Status: ${message}${isError ? ' (ERROR)' : ''}`); } if (isError) console.error("Dashboard Status (Error):", message); }
export function enableDisableExportButton(buttonId, enable) { const button = document.getElementById(buttonId); if (button) { button.disabled = !enable; button.title = enable ? '' : 'No data available'; button.style.opacity = enable ? '1' : '0.5'; button.style.cursor = enable ? 'pointer' : 'not-allowed'; } }
export function clearCanvas(ctx, message = "") { if (ctx?.canvas) { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.canvas.closest('.chart-canvas-container')?.setAttribute('data-message', message); } else if (ctx?.canvas?.id) { const container = document.getElementById(ctx.canvas.id)?.closest('.chart-canvas-container'); if (container) { container.setAttribute('data-message', message); const canvasEl = container.querySelector('canvas'); if (canvasEl?.getContext) { const context = canvasEl.getContext('2d'); if (context) context.clearRect(0, 0, canvasEl.width, canvasEl.height); } } } }
export function generateHtmlTable(headers, dataRows) { const table = document.createElement('table'); const thead = table.createTHead(); const headerRow = thead.insertRow(); headers.forEach(headerText => { const th = document.createElement('th'); th.textContent = headerText; headerRow.appendChild(th); }); const tbody = table.createTBody(); dataRows.forEach((rowData, rowIndex) => { const row = tbody.insertRow(); const isLastRow = rowIndex === dataRows.length - 1 && String(rowData[0]).toLowerCase() === 'total'; rowData.forEach(cellData => { const cell = row.insertCell(); if (isLastRow) { cell.innerHTML = `<strong>${cellData}</strong>`; } else { cell.textContent = cellData; } }); }); return table; }
export function showTableModal(title, headers, dataRows) { const modal = document.getElementById('tableModal'); const titleEl = document.getElementById('tableModalTitle'); const bodyEl = document.getElementById('tableModalBody'); if (!modal || !titleEl || !bodyEl) return; if (!headers || !dataRows || dataRows.length === 0) { titleEl.textContent = 'No Data'; bodyEl.innerHTML = '<p>No data available for this chart.</p>'; } else { titleEl.textContent = title; const table = generateHtmlTable(headers, dataRows); bodyEl.innerHTML = ''; bodyEl.appendChild(table); } modal.style.display = 'flex'; }
export function closeTableModal() { const modal = document.getElementById('tableModal'); if(modal) modal.style.display = 'none'; }
export function updateSelectAllVisualState(containerId, selectAllId) { const container = document.getElementById(containerId); const selectAllCheckbox = document.getElementById(selectAllId); if (!container || !selectAllCheckbox) return; const itemCheckboxes = container.querySelectorAll('.filter-item input[type="checkbox"]:not(:disabled)'); if (itemCheckboxes.length === 0) { selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = false; selectAllCheckbox.disabled = true; return; } selectAllCheckbox.disabled = false; const totalItems = itemCheckboxes.length; const checkedItems = container.querySelectorAll('.filter-item input[type="checkbox"]:checked:not(:disabled)').length; if (checkedItems === 0) { selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = false; } else if (checkedItems === totalItems) { selectAllCheckbox.checked = true; selectAllCheckbox.indeterminate = false; } else { selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = true; } }
export function updateAllExcludeButtonsVisuals(isExcluded) { document.querySelectorAll('.exclude-batches-toggle').forEach(button => { button.classList.toggle('active', isExcluded); button.textContent = isExcluded ? "Excluding Batches" : "Including Batches"; }); }
export function applyGlobalExclusionToFilters(exclude) { const folderContainer = document.getElementById('folderContainer'); const selectAllFoldersCheckbox = document.getElementById('selectAllFolders'); if (!folderContainer || !selectAllFoldersCheckbox) return; let selectionChanged = false; const isSelectAllChecked = selectAllFoldersCheckbox.checked; BATCH_FOLDER_DISPLAY_NAMES_TO_EXCLUDE.forEach(folderNameToExclude => { const folderCheckbox = folderContainer.querySelector(`input[data-folder-name="${folderNameToExclude}"]`); if (folderCheckbox) { const listItem = folderCheckbox.closest('.filter-item'); if (exclude) { if (folderCheckbox.checked) { folderCheckbox.checked = false; selectionChanged = true; } folderCheckbox.disabled = true; if (listItem) { listItem.classList.add('disabled-by-trend-filter'); listItem.classList.remove('selected'); listItem.style.opacity = '0.5'; listItem.title = 'Disabled by Exclude Batches Toggle'; } } else { if (folderCheckbox.disabled) { folderCheckbox.disabled = false; if (isSelectAllChecked && !selectAllFoldersCheckbox.indeterminate) { folderCheckbox.checked = true; if (listItem) listItem.classList.add('selected'); } selectionChanged = true; } if (listItem) { listItem.classList.remove('disabled-by-trend-filter'); listItem.style.opacity = '1'; listItem.title = ''; listItem.classList.toggle('selected', folderCheckbox.checked); } } } }); if (selectionChanged) { updateSelectAllVisualState('folderContainer', 'selectAllFolders'); } }
export function setDefaultDateRange() { const endDateInput = document.getElementById('trendsEndDate'); const startDateInput = document.getElementById('trendsStartDate'); if (!startDateInput || !endDateInput) return; const endDate = new Date(); const startDate = new Date(); startDate.setMonth(startDate.getMonth() - 5); startDate.setDate(1); const formatDate = (date) => date.toISOString().slice(0, 10); endDateInput.value = formatDate(endDate); startDateInput.value = formatDate(startDate); }
export function updateKpiCards(kpiData, prevKpiData) {
    const setComparisonText = (element, current, previous, isNumeric) => {
        element.textContent = '';
        element.className = 'kpi-comparison';
        if (previous === null || previous === undefined) return;
        
        if (isNumeric) {
            if (!isFinite(current) || !isFinite(previous)) return;
            const displayPrevious = Number.isInteger(previous) ? previous : previous.toFixed(1);
            if (previous === 0 || current === previous) {
                element.textContent = `vs ${displayPrevious}`;
                return;
            }
            const diff = ((current - previous) / previous) * 100;
            if (isFinite(diff)) {
                element.textContent = `vs ${displayPrevious} (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%)`;
                element.className = `kpi-comparison ${diff >= 0 ? 'positive' : 'negative'}`;
            } else {
                element.textContent = `vs ${displayPrevious}`;
            }
        } else {
            if (previous && previous !== '-') {
                element.textContent = `was ${previous}`;
            }
        }
    };
    
    document.getElementById('kpi-total-processed').textContent = kpiData.totalProcessed || '0';
    setComparisonText(document.getElementById('kpi-total-processed-comp'), kpiData.totalProcessed, prevKpiData?.totalProcessed, true);
    
    document.getElementById('kpi-busiest-day').textContent = kpiData.busiestDay || '-';
    setComparisonText(document.getElementById('kpi-busiest-day-comp'), null, prevKpiData?.busiestDay, false);
    
    const busiestDayCard = document.getElementById('kpi-busiest-day').closest('.kpi-card');
    if (busiestDayCard) {
        if (kpiData.busiestDayDate) {
            busiestDayCard.dataset.date = kpiData.busiestDayDate;
            busiestDayCard.style.cursor = 'pointer';
            const dayPart = (kpiData.busiestDay || '').split(':')[0].trim();
            busiestDayCard.title = `Click to deep dive for ${dayPart}`;
        } else {
            delete busiestDayCard.dataset.date;
            busiestDayCard.style.cursor = 'default';
            busiestDayCard.title = '';
        }
    }

    document.getElementById('kpi-avg-daily-per-person').textContent = kpiData.avgDailyPerPerson ? kpiData.avgDailyPerPerson.toFixed(1) : '0';
    setComparisonText(document.getElementById('kpi-avg-daily-per-person-comp'), kpiData.avgDailyPerPerson, prevKpiData?.avgDailyPerPerson, true);

    document.getElementById('kpi-top-performer').textContent = kpiData.topPerformer || '-';
    setComparisonText(document.getElementById('kpi-top-performer-comp'), null, prevKpiData?.topPerformer, false);
    
    document.getElementById('kpi-forecasted-total').textContent = kpiData.forecastedTotal ? Math.round(kpiData.forecastedTotal) : '-';
    document.getElementById('kpi-forecast-details').textContent = kpiData.forecastedTotal ? `based on ${kpiData.runRate.toFixed(1)}/day` : 'not enough data';

    const highestOutputEl = document.getElementById('kpi-highest-daily-output');
    const highestOutputCompEl = document.getElementById('kpi-highest-daily-output-comp');

    if (kpiData.peakPerformance && kpiData.peakPerformance.count > 0) {
        highestOutputEl.textContent = `${kpiData.peakPerformance.person} ${kpiData.peakPerformance.count} on ${kpiData.peakPerformance.date}`;
    } else {
        highestOutputEl.textContent = '-';
    }

    if (prevKpiData?.peakPerformance && prevKpiData.peakPerformance.count > 0) {
        highestOutputCompEl.textContent = `was ${prevKpiData.peakPerformance.person} ${prevKpiData.peakPerformance.count}`;
    } else {
        highestOutputCompEl.textContent = 'no previous best';
    }
}