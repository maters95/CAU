// TEST-works/scripts/dashboard-export.js
// Amended version v9 - Use injected status updater function
'use strict';

import chartExporter from './chart-export.js';
import { NotificationSystem, NOTIFICATION_TYPE } from './notification-system.js'; // Adjust path if needed

class DashboardExporter {
    constructor() {
        this.initialized = false;
        this.pdfButtonListenerAttached = false;
        this.isExportingPdf = false; // Flag to prevent concurrent PDF exports
        this._boundExportPdfHandler = null; // Store bound handler

        this.chartInstanceMap = {
            'monthlyPieChart': { instance: null, title: 'Monthly Distribution' },
            'volumeBarChart': { instance: null, title: 'Volume Breakdown' },
            'trendsLineChart': { instance: null, title: 'Trends Analysis' }
        };

        this.labelColorForExport = '#000000';
        this.backgroundColorForExport = '#ffffff';
        this.statusUpdater = null; // Placeholder for the status update function
    }

    /**
     * Initializes the exporter and connects it to dashboard
     */
    initialize() {
        if (this.initialized) {
            console.log("Dashboard Export (v9): Already initialized.");
            return;
        }
        this.initialized = true;
        console.log("Dashboard Export (v9): Initializing...");

        this.enablePdfButton(false); // Call the method on the instance

        const pdfButton = document.getElementById('exportDashboardPdf');
        if (pdfButton) {
            console.log(`Dashboard Export (v9): Checking PDF listener. Attached flag: ${this.pdfButtonListenerAttached}`);
            if (this._boundExportPdfHandler) {
                 pdfButton.removeEventListener('click', this._boundExportPdfHandler);
                 console.log("Dashboard Export (v9): Removed previous PDF export listener.");
                 this._boundExportPdfHandler = null; // Clear reference
                 this.pdfButtonListenerAttached = false; // Reset flag too for re-attachment logic
            }

            if (!this.pdfButtonListenerAttached) {
                 // *** FIX: Bind 'this' context and store the reference ***
                 this._boundExportPdfHandler = this.exportDashboardPdf.bind(this); // Store the bound function
                 pdfButton.addEventListener('click', this._boundExportPdfHandler); // Add listener using the bound function
                 this.pdfButtonListenerAttached = true;
                 console.log("Dashboard Export (v9): PDF export button listener ATTACHED.");
            } else {
                 console.log("Dashboard Export (v9): PDF listener ALREADY attached (flag was true).");
            }
        } else {
            console.warn("Dashboard Export (v9): PDF export button ('exportDashboardPdf') not found.");
        }

        console.log("Dashboard Export (v9): Initialization complete.");
        this.updateChartReferences();
    }

    /**
     * Receives the status update function from the main script.
     * @param {function(string, boolean): void} updaterFn - The function to call for status updates.
     */
    setStatusUpdater(updaterFn) {
        if (typeof updaterFn === 'function') {
            this.statusUpdater = updaterFn;
            console.log("Dashboard Export (v9): Status updater function received.");
        } else {
            console.error("Dashboard Export (v9): Invalid status updater function provided.");
            this.statusUpdater = null; // Ensure it's null if invalid
        }
    }

    // ... (keep updateChartReferences, syncChartReferences, enablePdfButton) ...
    updateChartReferences() { const hasCharts = this.syncChartReferences(); this.enablePdfButton(hasCharts); }
    syncChartReferences() { let oneChartFound = false; try { const isValidChart = (i) => i && typeof i.toBase64Image === 'function'; const pi = typeof window !== 'undefined' ? window.monthlyPieChartInstance : null; const bi = typeof window !== 'undefined' ? window.volumeBarChartInstance : null; const li = typeof window !== 'undefined' ? window.trendsLineChartInstance : null; this.chartInstanceMap.monthlyPieChart.instance = isValidChart(pi) ? pi : null; if(this.chartInstanceMap.monthlyPieChart.instance) oneChartFound = true; this.chartInstanceMap.volumeBarChart.instance = isValidChart(bi) ? bi : null; if(this.chartInstanceMap.volumeBarChart.instance) oneChartFound = true; this.chartInstanceMap.trendsLineChart.instance = isValidChart(li) ? li : null; if(this.chartInstanceMap.trendsLineChart.instance) oneChartFound = true; } catch (error) { console.error("DB Export: Err accessing chart instances:", error); this.chartInstanceMap.monthlyPieChart.instance = null; this.chartInstanceMap.volumeBarChart.instance = null; this.chartInstanceMap.trendsLineChart.instance = null; return false; } return oneChartFound; }
    enablePdfButton(enabled) { const pdfButton = document.getElementById('exportDashboardPdf'); if (pdfButton) { pdfButton.disabled = !enabled; pdfButton.style.opacity = enabled ? '1' : '0.5'; pdfButton.style.cursor = enabled ? 'pointer' : 'not-allowed'; pdfButton.title = enabled ? 'Export Dashboard as PDF' : 'No charts available'; } }


    // ... (keep _applyExportChartColors, _restoreOriginalChartColors) ...
    _applyExportChartColors(chart, exportLabelColor, exportBackgroundColor) { if (!chart || !chart.options) { console.warn("_applyExportChartColors: Invalid chart instance."); return { updateRequired: false }; } const originalSettings = { defaultsColor: Chart.defaults.color, scaleColors: {}, legendColor: chart.options.plugins?.legend?.labels?.color, titleColor: chart.options.plugins?.title?.color, background: chart.options.plugins.background, updateRequired: false }; if (Chart.defaults.color !== exportLabelColor) { Chart.defaults.color = exportLabelColor; originalSettings.updateRequired = true; } if (chart.options.scales) { Object.keys(chart.options.scales).forEach(key => { if (chart.options.scales[key]) { const scale = chart.options.scales[key]; originalSettings.scaleColors[key] = { ticks: scale.ticks?.color, title: scale.title?.color, pointLabels: scale.pointLabels?.color }; if (scale.ticks && scale.ticks.color !== exportLabelColor) { scale.ticks.color = exportLabelColor; originalSettings.updateRequired = true; } if (scale.title && scale.title.color !== exportLabelColor) { scale.title.color = exportLabelColor; originalSettings.updateRequired = true; } if (scale.pointLabels && scale.pointLabels.color !== exportLabelColor) { scale.pointLabels.color = exportLabelColor; originalSettings.updateRequired = true; } } }); } if (chart.options.plugins?.legend?.labels && chart.options.plugins.legend.labels.color !== exportLabelColor) { chart.options.plugins.legend.labels.color = exportLabelColor; originalSettings.updateRequired = true; } if (chart.options.plugins?.title && chart.options.plugins.title.color !== exportLabelColor) { chart.options.plugins.title.color = exportLabelColor; originalSettings.updateRequired = true; } if (!chart.options.plugins.background) chart.options.plugins.background = {}; if (chart.options.plugins.background.color !== exportBackgroundColor) { chart.options.plugins.background.color = exportBackgroundColor; originalSettings.updateRequired = true; } return originalSettings; }
    _restoreOriginalChartColors(chart, originalSettings) { if (!chart || !chart.options || !originalSettings) { console.warn("_restoreOriginalChartColors: Invalid inputs."); return false; } let updateRequired = false; if (Chart.defaults.color !== originalSettings.defaultsColor) { Chart.defaults.color = originalSettings.defaultsColor; updateRequired = true; } if (chart.options.scales) { Object.keys(chart.options.scales).forEach(key => { if (chart.options.scales[key] && originalSettings.scaleColors[key]) { const scale = chart.options.scales[key]; const original = originalSettings.scaleColors[key]; if (scale.ticks && scale.ticks.color !== original.ticks) { scale.ticks.color = original.ticks; updateRequired = true; } if (scale.title && scale.title.color !== original.title) { scale.title.color = original.title; updateRequired = true; } if (scale.pointLabels && scale.pointLabels.color !== original.pointLabels) { scale.pointLabels.color = original.pointLabels; updateRequired = true; } } }); } if (chart.options.plugins?.legend?.labels && chart.options.plugins.legend.labels.color !== originalSettings.legendColor) { chart.options.plugins.legend.labels.color = originalSettings.legendColor; updateRequired = true; } if (chart.options.plugins?.title && chart.options.plugins.title.color !== originalSettings.titleColor) { chart.options.plugins.title.color = originalSettings.titleColor; updateRequired = true; } if (chart.options.plugins.background !== originalSettings.background) { chart.options.plugins.background = originalSettings.background; updateRequired = true; } return updateRequired; }

    // ... (keep _addChartPageToPdf) ...
    async _addChartPageToPdf(pdf, pageTitle, chartsToDraw, applyColorChange, startY) { const pageWidth = pdf.internal.pageSize.getWidth(); const pageHeight = pdf.internal.pageSize.getHeight(); const margin = 15; const contentWidth = pageWidth - (2 * margin); const contentHeight = pageHeight - (2 * margin); let currentY = startY; const chartTitleHeight = 8; const spacingAfterChart = 10; pdf.setFontSize(16); pdf.setFont("helvetica", "bold"); pdf.text(pageTitle, pageWidth / 2, currentY, { align: 'center' }); currentY += 12; const maxChartsPerRow = 2; const availableHeight = contentHeight - (currentY - margin); let maxChartHeight = availableHeight * 0.8; let chartWidth = contentWidth * 0.9; if (chartsToDraw.length >= 2) { maxChartHeight = (availableHeight / 2) * 0.85 - (spacingAfterChart / 2) ; chartWidth = (contentWidth - margin) / 2 * 0.98; } maxChartHeight = Math.max(maxChartHeight, 60); chartWidth = Math.max(chartWidth, 80); let currentX = margin; let rowMaxY = currentY; let chartsInCurrentRow = 0;
    for (let i = 0; i < chartsToDraw.length; i++) { const [chartId, chartInfo] = chartsToDraw[i]; const chartInstance = chartInfo.instance; const chartTitle = chartInfo.title; let originalSettings = null; if (chartsInCurrentRow >= maxChartsPerRow) { currentY = rowMaxY; currentX = margin; rowMaxY = currentY; chartsInCurrentRow = 0; } let tempImgHeight = maxChartHeight; let tempImgWidth = chartWidth; if (chartInstance?.canvas) { const estimatedAR = chartInstance.height / chartInstance.width; tempImgHeight = Math.min(maxChartHeight, tempImgWidth * estimatedAR); } const requiredHeight = chartTitleHeight + tempImgHeight + spacingAfterChart; if (currentY + requiredHeight > pageHeight - margin && i > 0) { pdf.addPage(); currentY = margin; rowMaxY = currentY; currentX = margin; chartsInCurrentRow = 0; pdf.setFontSize(16); pdf.setFont("helvetica", "bold"); pdf.text(pageTitle, pageWidth / 2, currentY, { align: 'center' }); currentY += 12; console.log(`PDF Layout: Added new page for chart ${chartTitle} (before drawing)`); }
        try { if (!chartInstance?.canvas) throw new Error(`Invalid instance/canvas for ${chartTitle}`); const titleX = currentX + chartWidth / 2; pdf.setFontSize(11); pdf.setFont("helvetica", "bold"); pdf.text(chartTitle, titleX, currentY, { align: 'center', maxWidth: chartWidth * 0.95 }); let imageStartY = currentY + chartTitleHeight; if (applyColorChange) { originalSettings = this._applyExportChartColors(chartInstance, this.labelColorForExport, this.backgroundColorForExport); if (originalSettings.updateRequired) chartInstance.update('none'); } const imgData = chartInstance.toBase64Image('image/png', 1.0); if (originalSettings && this._restoreOriginalChartColors(chartInstance, originalSettings)) { chartInstance.update('none'); } originalSettings = null; const imgProps = pdf.getImageProperties(imgData); let imgHeight = (imgProps.height * chartWidth) / imgProps.width; let imgWidth = chartWidth; if (imgHeight > maxChartHeight) { imgHeight = maxChartHeight; imgWidth = (imgProps.width * imgHeight) / imgProps.height; } const imgX = currentX + (chartWidth - imgWidth) / 2; pdf.addImage(imgData, 'PNG', imgX, imageStartY, imgWidth, imgHeight); currentX += chartWidth + margin; rowMaxY = Math.max(rowMaxY, imageStartY + imgHeight + spacingAfterChart); chartsInCurrentRow++;
        } catch (chartError) { console.error(`PDF Layout: Error adding ${chartTitle}:`, chartError); if (currentY + 15 > pageHeight - margin) { currentY = margin; currentX = margin; chartsInCurrentRow=0;} pdf.setTextColor(255, 0, 0); pdf.setFontSize(9); pdf.setFont("helvetica", "normal"); pdf.text(`Error: ${chartTitle}`, currentX, currentY); pdf.setTextColor(0, 0, 0); rowMaxY = Math.max(rowMaxY, currentY + 10); currentX += chartWidth + margin; chartsInCurrentRow++; if (originalSettings && chartInstance) { try { if(this._restoreOriginalChartColors(chartInstance, originalSettings)) chartInstance.update('none'); } catch (restoreErr) { console.error("Failed restore colors after error:", restoreErr);}} }
        finally { originalSettings = null; } }
    return rowMaxY; }

    // --- exportDashboardPdf --- FIX: Use injected statusUpdater ---
    async exportDashboardPdf() {
        const callTimestamp = Date.now(); console.log(`%cDashboard Export (v9): exportDashboardPdf TRIGGERED [${callTimestamp}]. isExportingPdf = ${this.isExportingPdf}`, "color: blue; font-weight: bold;"); if (this.isExportingPdf) { console.warn(`%cDashboard Export (v9): PDF export already in progress [${callTimestamp}]. IGNORING duplicate request.`, "color: orange;"); this.statusUpdater ? this.statusUpdater("Export already running...", true) : console.warn('Status updater not set, message:', "Export already running..."); return; } this.isExportingPdf = true; console.log(`%cDashboard Export (v9): Lock ACQUIRED [${callTimestamp}] (isExportingPdf = ${this.isExportingPdf}).`, "color: green;");
        // Check dependencies FIRST using statusUpdater
        if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF !== 'function') { this.statusUpdater ? this.statusUpdater('Error: jsPDF library not found.', true) : console.warn('Status updater not set, message:', 'Error: jsPDF library not found.'); this.isExportingPdf = false; console.log(`%cDashboard Export (v9): Lock RELEASED [${callTimestamp}] (jsPDF missing).`, "color: red;"); return; }
        if (typeof window.triggerDashboardUpdate !== 'function') { this.statusUpdater ? this.statusUpdater("Error: Dashboard update function not available.", true) : console.warn('Status updater not set, message:', "Error: Dashboard update function not available."); this.isExportingPdf = false; console.log(`%cDashboard Export (v9): Lock RELEASED [${callTimestamp}] (trigger func missing).`, "color: red;"); return; }
        const jsPDF = window.jspdf.jsPDF;
        this.syncChartReferences(); // Sync before checks
        const chartsToExport = Object.entries(this.chartInstanceMap).filter(([id, info]) => info.instance !== null);
        if (chartsToExport.length === 0) { this.statusUpdater ? this.statusUpdater("No charts available for PDF export.", true) : console.warn('Status updater not set, message:', "No charts available for PDF export."); this.enablePdfButton(false); this.isExportingPdf = false; console.log(`%cDashboard Export (v9): Lock RELEASED [${callTimestamp}] (no charts).`, "color: red;"); return; }

        this.statusUpdater ? this.statusUpdater("Generating Dashboard PDF report (2 Pages)...", false) : console.warn('Status updater not set, message:', "Generating Dashboard PDF report (2 Pages)...");
        this.enablePdfButton(false); // Disable button during potentially long process

        let originalExclusionState = false; try { originalExclusionState = window.filterState?.excludeBatchesGlobally ?? false; } catch (e) { console.error("Could not get original filter state", e); }
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }); const margin = 15; let finalYPosPage1 = margin; let finalYPosPage2 = margin;

        try {
            const { selectedYear, selectedMonth } = this.getSelectedPeriod(); const monthName = this.getMonthName(selectedMonth); const baseFilename = `Dashboard_${selectedYear}_${String(selectedMonth).padStart(2, '0')}`;
            // Page 1
            console.log(`Dashboard Export (v9): Generating Page 1 [${callTimestamp}]`); if (window.filterState && originalExclusionState) { window.filterState.excludeBatchesGlobally = false; await window.triggerDashboardUpdate(); this.syncChartReferences(); } const page1Title = `Dashboard Report - ${monthName} ${selectedYear} (Includes Batches)`; finalYPosPage1 = await this._addChartPageToPdf(pdf, page1Title, chartsToExport, true, margin);
            // Page 2
            console.log(`Dashboard Export (v9): Generating Page 2 [${callTimestamp}]`); pdf.addPage(); if (window.filterState && !window.filterState.excludeBatchesGlobally) { window.filterState.excludeBatchesGlobally = true; await window.triggerDashboardUpdate(); this.syncChartReferences(); } const page2Title = `Dashboard Report - ${monthName} ${selectedYear} (Excludes Batches)`; finalYPosPage2 = await this._addChartPageToPdf(pdf, page2Title, chartsToExport, true, margin);
            // Save
            console.log(`Dashboard Export (v9): Initiating PDF save [${callTimestamp}]...`); pdf.save(`${baseFilename}_Comparison.pdf`); console.log(`Dashboard Export (v9): PDF save initiated [${callTimestamp}].`); this.statusUpdater ? this.statusUpdater("Dashboard PDF (2 Pages) generated successfully!", false) : console.warn('Status updater not set, message:', "Dashboard PDF (2 Pages) generated successfully!");
        } catch (error) { console.error(`Dashboard Export (v9): PDF export process failed [${callTimestamp}]:`, error); this.statusUpdater ? this.statusUpdater(`PDF export failed: ${error.message || 'Unknown error'}`, true) : console.warn('Status updater not set, message:', `PDF export failed: ${error.message || 'Unknown error'}`); }
        finally {
             console.log(`Dashboard Export (v9): Starting state restore [${callTimestamp}]. Original exclude: ${originalExclusionState}`); if (window.filterState && window.filterState.excludeBatchesGlobally !== originalExclusionState) { window.filterState.excludeBatchesGlobally = originalExclusionState; try { console.log(`Dashboard Export (v9): Triggering restore update [${callTimestamp}]...`); await window.triggerDashboardUpdate(); this.syncChartReferences(); console.log(`Dashboard Export (v9): Dashboard state restored [${callTimestamp}].`); } catch (restoreError) { console.error(`Dashboard Export (v9): Failed to restore state [${callTimestamp}]:`, restoreError); this.statusUpdater ? this.statusUpdater(`Warning: Failed restore filters: ${restoreError.message}`, true) : console.warn('Status updater not set, message:', `Warning: Failed restore filters: ${restoreError.message}`); } } else { console.log(`Dashboard Export (v9): Restore not needed or filterState unavailable [${callTimestamp}].`); }
             console.log(`%cDashboard Export (v9): Releasing export lock [${callTimestamp}] (Value before release: ${this.isExportingPdf}).`, "color: red;"); this.isExportingPdf = false; console.log(`%cDashboard Export (v9): Lock RELEASED [${callTimestamp}] (New value: ${this.isExportingPdf}).`, "color: red; font-weight: bold;"); this.enablePdfButton(true);
        }
    }

    // Keep other methods (exportChartAsImage, exportChartAsCSV, getSelectedPeriod, getMonthName)
     /** Helper for dashboard.js to export a chart as an image directly */ async exportChartAsImage(chartId, format = 'png') { this.syncChartReferences(); const chartInfo = this.chartInstanceMap[chartId]; if (!chartInfo || !chartInfo.instance) { this.statusUpdater ? this.statusUpdater(`Error: Chart '${chartId}' not available for image export.`, true) : console.warn('Status updater not set, message:', `Error: Chart '${chartId}' not available for image export.`); return; } try { this.statusUpdater ? this.statusUpdater(`Exporting ${chartInfo.title} as ${format.toUpperCase()}...`, false) : console.warn('Status updater not set, message:', `Exporting ${chartInfo.title} as ${format.toUpperCase()}...`); const { selectedYear, selectedMonth } = this.getSelectedPeriod(); const filename = `${chartId}_${selectedYear}_${String(selectedMonth).padStart(2, '0')}_${new Date().toISOString().slice(0,10)}`; await chartExporter.downloadChartAsImage(chartInfo.instance, filename, format); this.statusUpdater ? this.statusUpdater(`${chartInfo.title} exported successfully as ${format.toUpperCase()}!`, false) : console.warn('Status updater not set, message:', `${chartInfo.title} exported successfully as ${format.toUpperCase()}!`); } catch (error) { console.error(`DB Export: Image export failed for ${chartId}:`, error); this.statusUpdater ? this.statusUpdater(`Image export failed: ${error.message || 'Unknown error'}`, true) : console.warn('Status updater not set, message:', `Image export failed: ${error.message || 'Unknown error'}`); } }
     /** Helper for dashboard.js to export chart data as CSV directly */ exportChartAsCSV(chartId) { this.syncChartReferences(); const chartInfo = this.chartInstanceMap[chartId]; if (!chartInfo || !chartInfo.instance) { this.statusUpdater ? this.statusUpdater(`Error: Chart '${chartId}' not available for CSV export.`, true) : console.warn('Status updater not set, message:', `Error: Chart '${chartId}' not available for CSV export.`); return; } try { this.statusUpdater ? this.statusUpdater(`Exporting ${chartInfo.title} data as CSV...`, false) : console.warn('Status updater not set, message:', `Exporting ${chartInfo.title} data as CSV...`); const { selectedYear, selectedMonth } = this.getSelectedPeriod(); const filename = `${chartId}_data_${selectedYear}_${String(selectedMonth).padStart(2, '0')}_${new Date().toISOString().slice(0,10)}`; chartExporter.downloadChartAsCSV(chartInfo.instance, filename); this.statusUpdater ? this.statusUpdater(`${chartInfo.title} data exported successfully as CSV!`, false) : console.warn('Status updater not set, message:', `${chartInfo.title} data exported successfully as CSV!`); } catch (error) { console.error(`DB Export: CSV export failed for ${chartId}:`, error); this.statusUpdater ? this.statusUpdater(`CSV export failed: ${error.message || 'Unknown error'}`, true) : console.warn('Status updater not set, message:', `CSV export failed: ${error.message || 'Unknown error'}`); } }
     /** Gets selected year and month from dashboard dropdowns */ getSelectedPeriod() { const yearSelect = document.getElementById('year-select'); const monthSelect = document.getElementById('monthSelect'); const currentYear = new Date().getFullYear(); const currentMonth = new Date().getMonth() + 1; const selectedYear = yearSelect ? parseInt(yearSelect.value, 10) || currentYear : currentYear; const selectedMonth = monthSelect ? parseInt(monthSelect.value, 10) || currentMonth : currentMonth; return { selectedYear, selectedMonth }; }
     /** Gets month name from number (1-12) */ getMonthName(month) { try { const date = new Date(); date.setMonth(month - 1); return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date); } catch (e) { console.warn("DB Export: Could not format month name, using fallback.", e); const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']; const index = Math.max(0, Math.min(11, month - 1)); return monthNames[index]; } }
}

// Create and export singleton instance
const dashboardExporter = new DashboardExporter();
export default dashboardExporter;