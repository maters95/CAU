// TEST-works/scripts/dashboard-charts.js
'use strict';

import { filterState, chartDataCache, chartInstances, currentFolderPersonBreakdown, currentPersonFolderBreakdown, cachedPrevPeriodMetrics } from './dashboard-state.js';
import { enableDisableExportButton, clearCanvas } from './dashboard-ui.js';
import { generateChartColors, formatLabel } from './utils.js';
import dashboardExporter from './dashboard-export.js';
import { getSelectedPeriod, prepareLineChartDataByPerson, prepareLineChartDataByFolder } from './dashboard-data.js';
import dashboardDataSync from './storage-sync.js';


function commonChartOptions(specificOptions = {}) { const defaultColor = Chart.defaults.color || '#e0e0e0'; const defaultGridColor = Chart.defaults.borderColor || 'rgba(255, 255, 255, 0.1)'; const safeSpecific = specificOptions || {}; const options = { responsive: true, maintainAspectRatio: false, indexAxis: safeSpecific.indexAxis || 'x', scales: {}, plugins: { legend: { display: safeSpecific.legendDisplay !== false, position: safeSpecific.legendPos || 'top', align: safeSpecific.legendAlign || 'center', labels: { color: defaultColor, boxWidth: safeSpecific.plugins?.legend?.labels?.boxWidth ?? 12, padding: safeSpecific.plugins?.legend?.labels?.padding ?? 10, font: { size: 11 }, ...(safeSpecific.plugins?.legend?.labels || {}) }, ...(safeSpecific.plugins?.legend || {}) }, title: { display: !!safeSpecific.titleText, text: safeSpecific.titleText || '', color: defaultColor, font: { size: 16, weight: 'bold', ...(safeSpecific.plugins?.title?.font || {}) } }, tooltip: { enabled: safeSpecific.tooltipEnabled !== false, mode: safeSpecific.tooltipMode || 'nearest', intersect: safeSpecific.tooltipIntersect !== false, callbacks: { label: safeSpecific.tooltipLabelCallback || function(context) { let l=context.dataset.label||''; l&&(l+=": "); return l+(context.parsed.y!==null&&options.indexAxis!=='y'?context.formattedValue:context.parsed.x!==null&&options.indexAxis==='y'?context.formattedValue:'') }, footer: safeSpecific.tooltipCallback || undefined, ...(safeSpecific.plugins?.tooltip?.callbacks || {}) }, backgroundColor: 'rgba(0, 0, 0, 0.8)', titleColor: '#ffffff', bodyColor: '#ffffff', footerColor: '#dddddd', footerAlign: 'left', footerSpacing: 2, footerMarginTop: 6, ...(safeSpecific.plugins?.tooltip || {}) }, background: { color: Chart.defaults.backgroundColor }, ...(safeSpecific.plugins || {}) }, onClick: safeSpecific.onClick, total: safeSpecific.total || 0 }; if (safeSpecific.scales !== false) { const axes = ['x', 'y', 'r']; axes.forEach(axis => { if (safeSpecific.scales?.[axis] === false) return; const axisOptions = safeSpecific.scales?.[axis] || {}; const isAxisDefined = safeSpecific.scales?.[axis] !== undefined; if (isAxisDefined || (axis !== 'r' && !safeSpecific.scales?.r)) { options.scales[axis] = { display: axisOptions.display !== false, beginAtZero: (axis === 'y' || (safeSpecific.indexAxis === 'y' && axis === 'x')) && axisOptions.beginAtZero !== false, title: { display: !!(axis === 'x' ? safeSpecific.xTitle : safeSpecific.yTitle), text: (axis === 'x' ? safeSpecific.xTitle : safeSpecific.yTitle) || '', color: defaultColor, ...(axisOptions.title || {}) }, ticks: { display: axisOptions.ticks?.display !== false, color: defaultColor, ...(axisOptions.ticks || {}) }, grid: { display: axisOptions.grid?.display !== false, color: defaultGridColor, ...(axisOptions.grid || {}) }, pointLabels: axis === 'r' ? { display: axisOptions.pointLabels?.display !== false, color: defaultColor, ...(axisOptions.pointLabels || {}) } : undefined, ...(axisOptions || {}) }; if (axis === 'y' && safeSpecific.indexAxis === 'y') options.scales[axis].beginAtZero = false; if (axis !== 'r') delete options.scales[axis]?.pointLabels; } }); if (options.scales && !options.scales.x && !safeSpecific.scales?.r) options.scales.x = { display: true, title:{}, ticks:{color: defaultColor}, grid:{color: defaultGridColor}, beginAtZero: safeSpecific.indexAxis !== 'y'}; if (options.scales && !options.scales.y && !safeSpecific.scales?.r) options.scales.y = { display: true, title:{}, ticks:{color: defaultColor}, grid:{color: defaultGridColor}, beginAtZero: safeSpecific.indexAxis === 'y' ? false : true }; } else { delete options.scales; } return options; }
function handleChartError(error, ctx, message, chartId) { console.error(`Dashboard.js: ${message} (ID: ${chartId})`, error); if (ctx) { clearCanvas(ctx); } enableDisableExportButton(`export${chartId.replace('Chart', 'Data')}`, false); enableDisableExportButton(`export${chartId.replace('Chart', 'Image')}`, false); }

function generateCustomHTMLLegend(chart, legendContainerId) {
    const legendContainer = document.getElementById(legendContainerId);
    if (!legendContainer) return;

    legendContainer.innerHTML = '';
    const legendItems = chart.legend.legendItems;
    if (!legendItems || legendItems.length === 0) return;

    const ul = document.createElement('ul');
    legendItems.forEach((item, index) => {
        const li = document.createElement('li');
        li.style.textDecoration = item.hidden ? 'line-through' : '';
        li.style.opacity = item.hidden ? '0.5' : '1';
        li.onclick = () => {
            chart.toggleDataVisibility(index);
            chart.update();
        };

        const box = document.createElement('span');
        box.className = 'legend-color-box';
        box.style.backgroundColor = item.fillStyle;

        const text = document.createElement('span');
        text.className = 'legend-text';
        text.innerText = item.text;

        li.appendChild(box);
        li.appendChild(text);
        ul.appendChild(li);
    });

    legendContainer.appendChild(ul);
}


export function clearCharts() {
    if (chartInstances.monthlyPieChart) { chartInstances.monthlyPieChart.destroy(); chartInstances.monthlyPieChart = null; }
    if (chartInstances.volumeBarChart) { chartInstances.volumeBarChart.destroy(); chartInstances.volumeBarChart = null; }
    if (chartInstances.trendsLineChart) { chartInstances.trendsLineChart.destroy(); chartInstances.trendsLineChart = null; }
    if (chartInstances.deepDiveChart) { chartInstances.deepDiveChart.destroy(); chartInstances.deepDiveChart = null; }

    clearCanvas(document.getElementById('monthlyPieChart')?.getContext('2d'));
    clearCanvas(document.getElementById('volumeBarChart')?.getContext('2d'));
    clearCanvas(document.getElementById('trendsLineChart')?.getContext('2d'));
    clearCanvas(document.getElementById('deepDiveTrendChart')?.getContext('2d'));

    enableDisableExportButton('exportPieData', false);
    enableDisableExportButton('exportPieImage', false);
    enableDisableExportButton('exportBarData', false);
    enableDisableExportButton('exportBarImage', false);
    enableDisableExportButton('exportTrendData', false);
    enableDisableExportButton('exportTrendImage', false);
    enableDisableExportButton('exportDashboardPdf', false);
}
export async function renderMonthlyDistribution(distributionData, activeDays) {
    const canvas = document.getElementById('monthlyPieChart'); const ctx = canvas?.getContext('2d'); const chartId = 'monthlyPieChart'; if (!ctx) return; if (chartInstances.monthlyPieChart) chartInstances.monthlyPieChart.destroy(); if (!distributionData || Object.keys(distributionData).length === 0) { clearCanvas(ctx, 'No data for selection'); enableDisableExportButton('exportPieData', false); enableDisableExportButton('exportPieImage', false); chartDataCache.monthlyPieChart = null; return; }
    
    const fullSortedByValue = Object.entries(distributionData).sort(([, valA], [, valB]) => valB - valA);
    chartDataCache.monthlyPieChart = { headers: ['Folder', 'Count'], rows: fullSortedByValue.map(([label, value]) => [formatLabel(label), value]) };
    const sortedByValueForChart = (filterState.distChartType !== 'pie') 
        ? fullSortedByValue.slice(0, 10) 
        : fullSortedByValue;

    const originalLabels = sortedByValueForChart.map(([displayName]) => displayName); 
    const values = sortedByValueForChart.map(([, count]) => count); 
    const displayLabels = originalLabels.map(name => formatLabel(name)); 
    
    if (displayLabels.length === 0) { clearCanvas(ctx); enableDisableExportButton('exportPieData', false); enableDisableExportButton('exportPieImage', false); return; } 
    
    const bgColors = generateChartColors(displayLabels.length); 
    const chartDataConfig = { labels: displayLabels, datasets: [{ label: 'Items', data: values, originalLabels: originalLabels, backgroundColor: bgColors, borderColor: bgColors.map(c => `${c}CC`), borderWidth: 1 }] };
    
    const legendContainer = document.getElementById('monthlyPieChart-legend');

    const chartOptions = {
        onClick: (e) => {
            const points = chartInstances.monthlyPieChart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
            if (points.length) {
                const firstPoint = points[0];
                const label = chartInstances.monthlyPieChart.data.datasets[firstPoint.datasetIndex].originalLabels[firstPoint.index];
                filterState.drilldownEntity = label;
                filterState.drilldownType = 'folder';
                window.triggerDashboardUpdate();
            }
        },
        onHover: (e,
            elements, chart) => {
            chart.canvas.style.cursor = elements.length ? 'pointer' : 'default';
        }
    };

    if(filterState.distChartType === 'pie') {
        if (legendContainer) legendContainer.style.display = 'block';
        Object.assign(chartOptions, commonChartOptions({ legendDisplay: false, scales: false, total: values.reduce((s,v)=>s+v,0), tooltipLabelCallback: (context) => { const label = context.label || ''; const value = context.raw || 0; const total = context.chart.options.total; const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0; return `${label}: ${value} (${percentage}%)`; } }));
    } else {
        if (legendContainer) legendContainer.style.display = 'none';
        Object.assign(chartOptions, commonChartOptions({ indexAxis: 'y', legendDisplay: false, yTitle: `Folder (Top ${displayLabels.length})`, xTitle: 'Items Processed', scales: { x: { beginAtZero: true, ticks:{color: Chart.defaults.color}, grid: { color: Chart.defaults.borderColor }, title: { display: true, text: 'Items Processed', color: Chart.defaults.color} }, y: { ticks:{color: Chart.defaults.color, font: { size: 10 } }, grid: { display: false }, title: { display: false } } }, tooltipCallback: function(context) { if (!context.tooltipItems?.length) return ''; const item = context.tooltipItems[0]; const dataset = context.chart.data.datasets[item.datasetIndex]; const originalLabel = dataset.originalLabels[item.dataIndex]; const value = item.formattedValue || item.parsed.x; const days = activeDays[originalLabel] || 0; const avg = days > 0 ? (distributionData[originalLabel] / days).toFixed(1) : 0; let tooltipText = [`${item.label}: ${value}`, `Daily Avg: ${avg}`]; const breakdown = currentFolderPersonBreakdown[originalLabel]; if (breakdown && Object.keys(breakdown).length > 0) { tooltipText.push('', 'Contributors:'); const sortedBreakdown = Object.entries(breakdown).sort(([, a], [, b]) => b - a); const maxTooltipItems = 7; sortedBreakdown.slice(0, maxTooltipItems).forEach(([p, c]) => tooltipText.push(`  ${p}: ${c}`)); if (sortedBreakdown.length > maxTooltipItems) tooltipText.push(`  ...${sortedBreakdown.length - maxTooltipItems} more`); } return tooltipText; } }));
    }

    return new Promise((resolve, reject) => { try { const chart = new Chart(ctx, { type: filterState.distChartType, data: chartDataConfig, options: chartOptions }); chartInstances.monthlyPieChart = chart; window.monthlyPieChartInstance = chart; if (filterState.distChartType === 'pie') { generateCustomHTMLLegend(chart, 'monthlyPieChart-legend'); } setTimeout(() => { enableDisableExportButton('exportPieData', true); enableDisableExportButton('exportPieImage', true); dashboardExporter?.updateChartReferences(); resolve(); }, 150); } catch (e) { handleChartError(e, ctx, "Error rendering distribution", chartId); reject(e); } });
}

export async function renderVolumeBreakdown(volumeData, consistencyScores) {
    const canvas = document.getElementById('volumeBarChart'); const ctx = canvas?.getContext('2d'); const chartId = 'volumeBarChart'; if (!ctx) return; if (chartInstances.volumeBarChart) chartInstances.volumeBarChart.destroy(); if (!volumeData || Object.keys(volumeData).length === 0) { clearCanvas(ctx, 'No data for selection'); enableDisableExportButton('exportBarData', false); enableDisableExportButton('exportBarImage', false); chartDataCache.volumeBarChart = null; return; }
    
    const fullSortedData = Object.entries(volumeData).sort(([, a], [, b]) => b - a);
    const chartType = filterState.drilldownEntity ? 'bar' : filterState.volumeChartType;
    chartDataCache.volumeBarChart = { headers: ['Person', 'Count'], rows: fullSortedData.map(([person, count]) => [formatLabel(person), count]) };

    const sortedDataForChart = (chartType !== 'pie')
        ? fullSortedData.slice(0, 10)
        : fullSortedData;

    const labels = sortedDataForChart.map(([p]) => formatLabel(p)); 
    const values = sortedDataForChart.map(([, c]) => c); 
    
    if (labels.length === 0) { clearCanvas(ctx); enableDisableExportButton('exportBarData', false); enableDisableExportButton('exportBarImage', false); return; } 
    
    const bgColors = generateChartColors(labels.length); 
    const chartDataConfig = { labels: labels, datasets: [{ label: 'Items Processed', data: values, backgroundColor: bgColors, borderColor: bgColors.map(c => `${c}CC`), borderWidth: 1 }] };
    let chartOptions; 
    const grandTotal = Object.values(volumeData).reduce((sum, v) => sum + v, 0);
    const legendContainer = document.getElementById('volumeBarChart-legend');

    if(chartType === 'pie') {
        if (legendContainer) legendContainer.style.display = 'block';
        chartOptions = commonChartOptions({ legendDisplay: false, scales: false, total: grandTotal, tooltipLabelCallback: (context) => { const label = context.label || ''; const value = context.raw || 0; const total = context.chart.options.total; const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0; return `${label}: ${value} (${percentage}%)`; } });
    } else {
        if (legendContainer) legendContainer.style.display = 'none';
        chartOptions = commonChartOptions({ indexAxis: 'y', legendDisplay: false, yTitle: 'Person', xTitle: 'Items Processed', scales: { x: { beginAtZero: true, ticks:{color: Chart.defaults.color}, grid: { color: Chart.defaults.borderColor }, title: { display: true, text: 'Items Processed', color: Chart.defaults.color} }, y: { ticks:{color: Chart.defaults.color, font: { size: 10 } }, grid: { display: false }, title: { display: false } } }, tooltipCallback: function(context) { if (!context.tooltipItems?.length) return ''; const item = context.tooltipItems[0]; const personLabel = item.label; const value = item.formattedValue || item.parsed.x; const consistency = consistencyScores[personLabel]; let tooltipText = [`${personLabel}: ${value}`]; if(consistency !== undefined) { tooltipText.push(`Consistency Score: ${consistency.toFixed(2)}`); } const breakdown = currentPersonFolderBreakdown[personLabel]; if (breakdown && Object.keys(breakdown).length > 0) { tooltipText.push('', 'Folder Breakdown:'); const sortedBreakdown = Object.entries(breakdown).sort(([, a], [, b]) => b - a); const maxTooltipItems = 7; sortedBreakdown.slice(0, maxTooltipItems).forEach(([f, c]) => tooltipText.push(`  ${formatLabel(f)}: ${c}`)); if (sortedBreakdown.length > maxTooltipItems) tooltipText.push(`  ...${sortedBreakdown.length - maxTooltipItems} more`); } return tooltipText; }, onClick: (e) => { const points = chartInstances.volumeBarChart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true); if (points.length) { const firstPoint = points[0]; const person = chartInstances.volumeBarChart.data.labels[firstPoint.index]; filterState.drilldownEntity = person; filterState.drilldownType = 'person'; window.triggerDashboardUpdate(); } } });
    }

    return new Promise((resolve, reject) => { try { const chart = new Chart(ctx, { type: chartType, data: chartDataConfig, options: chartOptions }); chartInstances.volumeBarChart = chart; window.volumeBarChartInstance = chart; if(chartType === 'pie') { generateCustomHTMLLegend(chart, 'volumeBarChart-legend'); } setTimeout(() => { enableDisableExportButton('exportBarData', true); enableDisableExportButton('exportBarImage', true); dashboardExporter?.updateChartReferences(); resolve(); }, 150); } catch (e) { handleChartError(e, ctx, "Error rendering volume", chartId); reject(e); } });
}

export async function renderTrendsChart(chartData, tableData) { 
    const canvas = document.getElementById('trendsLineChart'); const ctx = canvas?.getContext('2d'); const chartId = 'trendsLineChart'; if (!ctx) return; if (chartInstances.trendsLineChart) chartInstances.trendsLineChart.destroy(); const hasData = chartData?.datasets?.some(ds => ds.data?.length > 0 && ds.data.some(p => p !== 0)); if (!chartData || !chartData.labels?.length || !chartData.datasets?.length || !hasData) { clearCanvas(ctx, 'No data for selection'); enableDisableExportButton('exportTrendData', false); enableDisableExportButton('exportTrendImage', false); chartDataCache.trendsLineChart = null; return; } 
    
    chartDataCache.trendsLineChart = tableData;

    return new Promise((resolve, reject) => { try { chartInstances.trendsLineChart = new Chart(ctx, { type: 'line', data: chartData, options: commonChartOptions({ legendPos: 'bottom', xTitle: 'Time', yTitle: 'Total Items Processed', tooltipMode: 'index', tooltipIntersect: false, scales: { x: { ticks:{color: Chart.defaults.color}, grid: { color: Chart.defaults.borderColor } }, y: { beginAtZero: true, ticks:{color: Chart.defaults.color}, grid: { color: Chart.defaults.borderColor }, title: { display: true, text: 'Total Items Processed', color: Chart.defaults.color} } } }) }); window.trendsLineChartInstance = chartInstances.trendsLineChart; setTimeout(() => { enableDisableExportButton('exportTrendData', true); enableDisableExportButton('exportTrendImage', true); dashboardExporter?.updateChartReferences(); resolve(); }, 150); } catch (e) { handleChartError(e, ctx, "Error rendering trends", chartId); reject(e); } }); 
}

export async function renderDeepDive(aggregatedData) {
    const container = document.getElementById('deep-dive-container');
    const titleEl = document.getElementById('deep-dive-title');
    const contentEl = document.getElementById('deep-dive-content');
    const dashboardContainer = document.getElementById('dashboardContainer');
    const { selectedYear, selectedMonth } = getSelectedPeriod();

    const chartCanvas = document.getElementById('deepDiveTrendChart');
    const chartCtx = chartCanvas?.getContext('2d');
    if (chartInstances.deepDiveChart) {
        chartInstances.deepDiveChart.destroy();
        chartInstances.deepDiveChart = null;
        window.deepDiveChartInstance = null;
    }

    if (!filterState.drilldownEntity || !selectedYear || !selectedMonth) {
        container.classList.add('hidden');
        dashboardContainer.classList.remove('hidden');
        document.getElementById('resetDrilldownBtn').style.display = 'none';
        return;
    }
    
    dashboardContainer.classList.add('hidden');
    container.classList.remove('hidden');
    document.getElementById('resetDrilldownBtn').style.display = 'inline-block';
    
    contentEl.innerHTML = ''; 
    titleEl.textContent = `Deep Dive: ${formatLabel(filterState.drilldownEntity)}`;

    let trendChartData = null;
    const trendStartDate = new Date(selectedYear, selectedMonth - 1, 1).toISOString().slice(0, 10);
    const trendEndDate = new Date(selectedYear, selectedMonth, 0).toISOString().slice(0, 10);

    let statsHTML = '';
    let breakdownHTML = '';

    if (filterState.drilldownType === 'person') {
        const person = filterState.drilldownEntity;
        const personTotal = aggregatedData.volumeBreakdown[person] || 0;
        const teamTotal = Object.values(aggregatedData.volumeBreakdown).reduce((s, c) => s + c, 0);
        const rank = (Object.entries(aggregatedData.volumeBreakdown).sort(([,a],[,b]) => b-a).findIndex(([p]) => p === person) + 1) || 'N/A';
        const busiestDay = (Object.entries(aggregatedData.personDailyTotals[person] || {}).sort(([,a],[,b])=>b-a)[0]);

        const prevData = cachedPrevPeriodMetrics || { volumeBreakdown: {}, personDailyTotals: {} };
        const prevPersonTotal = prevData.volumeBreakdown?.[person] || 0;
        const prevTeamTotal = Object.values(prevData.volumeBreakdown || {}).reduce((s, c) => s + c, 0);
        const prevRank = (Object.entries(prevData.volumeBreakdown || {}).sort(([,a],[,b]) => b-a).findIndex(([p]) => p === person) + 1) || 'N/A';
        const prevBusiestDay = (Object.entries(prevData.personDailyTotals?.[person] || {}).sort(([,a],[,b])=>b-a)[0]);

        statsHTML = `
            <div>
                <h4 class="deep-dive-section-title">Performance Summary</h4>
                <div class="deep-dive-metrics-grid">
                    <div class="deep-dive-metric-card" title="The person's rank based on total items processed compared to the rest of the selected team.">
                        <h5>Rank</h5>
                        <p>#${rank} <small>(was #${prevRank})</small></p>
                    </div>
                    <div class="deep-dive-metric-card" title="The percentage of the team's total processed items that this person contributed.">
                        <h5>Team Contribution</h5>
                        <p>${teamTotal > 0 ? (personTotal / teamTotal * 100).toFixed(1) : 0}% <small>(was ${prevTeamTotal > 0 ? (prevPersonTotal / prevTeamTotal * 100).toFixed(1) : 0}%)</small></p>
                    </div>
                    <div class="deep-dive-metric-card" title="The day this person processed the most items.">
                        <h5>Busiest Day</h5>
                        <p>${busiestDay ? busiestDay[1] : 0} <small>(was ${prevBusiestDay ? prevBusiestDay[1] : 0})</small></p>
                    </div>
                </div>
            </div>`;

        const breakdown = Object.entries(aggregatedData.personFolderBreakdown[person] || {}).sort(([,a],[,b])=>b-a);
        if (breakdown.length > 0) {
            breakdownHTML = `
                <div>
                    <h4 class="deep-dive-section-title">Folder Contributions</h4>
                    <div class="deep-dive-table-container">
                        <table>
                            <thead><tr><th>Folder</th><th>Count</th></tr></thead>
                            <tbody>
                                ${breakdown.map(([folder, count]) => `<tr><td>${formatLabel(folder)}</td><td>${count}</td></tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>`;
        }

        const { chartData } = prepareLineChartDataByPerson(dashboardDataSync.getCurrentData(), [person], null, false, trendStartDate, trendEndDate, filterState.excludeBatchesGlobally, 'daily', true);
        trendChartData = chartData;

    } else if (filterState.drilldownType === 'folder') {
        const folder = filterState.drilldownEntity;
        const folderTotal = aggregatedData.monthlyDistribution[folder] || 0;
        const teamTotal = Object.values(aggregatedData.monthlyDistribution).reduce((s, c) => s + c, 0);
        const contributors = Object.entries(aggregatedData.folderPersonBreakdown[folder] || {}).sort(([,a],[,b])=>b-a);

        const prevData = cachedPrevPeriodMetrics || { monthlyDistribution: {}};
        const prevFolderTotal = prevData.monthlyDistribution?.[folder] || 0;
        const prevTeamTotal = Object.values(prevData.monthlyDistribution || {}).reduce((s, c) => s + c, 0);

        statsHTML = `
             <div>
                <h4 class="deep-dive-section-title">Folder Summary</h4>
                <div class="deep-dive-metrics-grid">
                    <div class="deep-dive-metric-card" title="Total items processed in this folder.">
                        <h5>Total Items</h5>
                        <p>${folderTotal} <small>(was ${prevFolderTotal})</small></p>
                    </div>
                    <div class="deep-dive-metric-card" title="The percentage of the entire team's output that this folder represents.">
                        <h5>% of Team Total</h5>
                        <p>${teamTotal > 0 ? (folderTotal / teamTotal * 100).toFixed(1) : 0}% <small>(was ${prevTeamTotal > 0 ? (prevFolderTotal / prevTeamTotal * 100).toFixed(1) : 0}%)</small></p>
                    </div>
                     <div class="deep-dive-metric-card" title="Number of people who contributed to this folder.">
                        <h5>Contributors</h5>
                        <p>${contributors.length}</p>
                    </div>
                </div>
            </div>`;
        
        if (contributors.length > 0) {
             breakdownHTML = `
                <div>
                    <h4 class="deep-dive-section-title">Top Contributors</h4>
                    <div class="deep-dive-table-container">
                        <table>
                            <thead><tr><th>Person</th><th>Count</th></tr></thead>
                            <tbody>
                                ${contributors.map(([person, count]) => `<tr><td>${person}</td><td>${count}</td></tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>`;
        }
        
        const { chartData } = prepareLineChartDataByFolder(dashboardDataSync.getCurrentData(), null, [folder], false, trendStartDate, trendEndDate, filterState.excludeBatchesGlobally, 'daily', true);
        trendChartData = chartData;
    } else if (filterState.drilldownType === 'busiestDay') {
        const date = filterState.drilldownEntity;
        titleEl.textContent = `Deep Dive for Busiest Day: ${date}`;

        const peopleOnDay = Object.entries(aggregatedData.personDailyTotals)
            .map(([person, dailyData]) => ({ person, count: dailyData[date] || 0 }))
            .filter(item => item.count > 0)
            .sort((a, b) => b.count - a.count);

        const foldersOnDay = Object.entries(aggregatedData.folderDailyTotals)
            .map(([folder, dailyData]) => ({ folder, count: dailyData[date] || 0 }))
            .filter(item => item.count > 0)
            .sort((a, b) => b.count - a.count);

        let peopleHTML = '<div><h4 class="deep-dive-section-title">People Active on this Day</h4><p>No activity recorded.</p></div>';
        if (peopleOnDay.length > 0) {
            peopleHTML = `
                <div>
                    <h4 class="deep-dive-section-title">People Active on this Day</h4>
                    <div class="deep-dive-table-container">
                        <table>
                            <thead><tr><th>Person</th><th>Count</th></tr></thead>
                            <tbody>
                                ${peopleOnDay.map(({ person, count }) => `<tr><td>${person}</td><td>${count}</td></tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>`;
        }

        let foldersHTML = '<div><h4 class="deep-dive-section-title">Folders Active on this Day</h4><p>No activity recorded.</p></div>';
        if (foldersOnDay.length > 0) {
            foldersHTML = `
                <div>
                    <h4 class="deep-dive-section-title">Folders Active on this Day</h4>
                    <div class="deep-dive-table-container">
                        <table>
                            <thead><tr><th>Folder</th><th>Count</th></tr></thead>
                            <tbody>
                                ${foldersOnDay.map(({ folder, count }) => `<tr><td>${formatLabel(folder)}</td><td>${count}</td></tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>`;
        }

        statsHTML = `<div class="deep-dive-grid">${peopleHTML}${foldersHTML}</div>`;
        breakdownHTML = '';
        trendChartData = null;
    }
    
    contentEl.innerHTML = statsHTML + breakdownHTML;

    if (chartCtx && trendChartData && trendChartData.datasets.length > 0 && trendChartData.datasets.some(ds => ds.data.some(d => d > 0))) {
        chartInstances.deepDiveChart = new Chart(chartCtx, {
            type: 'line',
            data: trendChartData,
            options: commonChartOptions({
                legendDisplay: false,
                titleText: `Daily Trend for ${formatLabel(filterState.drilldownEntity)}`,
                tooltipMode: 'index',
                tooltipIntersect: false,
                scales: {
                    y: { beginAtZero: true, ticks: { font: { size: 10 } } },
                    x: { ticks: { font: { size: 10 } } }
                }
            })
        });
        window.deepDiveChartInstance = chartInstances.deepDiveChart;
    } else if (chartCtx) {
        clearCanvas(chartCtx, 'No trend data for this view');
    }
}