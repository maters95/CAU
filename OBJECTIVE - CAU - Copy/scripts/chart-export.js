// chart-export.js - Handles exporting charts as images and data
'use strict';

/**
 * ChartExporter provides methods for exporting dashboard charts
 * as images or data files
 */
class ChartExporter {
    constructor() {
        this.imageQuality = 1.0;
        // Use black for labels by default during export, background remains white
        this.backgroundColor = '#ffffff';
        this.labelColorForExport = '#000000'; // Black for labels during PNG export
    }

    /**
     * Export a Chart.js chart as an image
     * @param {Chart} chart - The Chart.js chart instance
     * @param {string} format - Export format ('png' or 'jpg')
     * @param {Object} options - Export options (quality, background, labelColor, etc)
     * @returns {Promise<string>} Data URL of the exported image
     */
    async exportChartAsImage(chart, format = 'png', options = {}) {
        // --- Store original colors ---
        let originalDefaultsColor;
        const originalScaleColors = {};
        let originalLegendColor;
        let originalTitleColor;
        let currentBg; // Store current background setting

        try {
            originalDefaultsColor = Chart.defaults.color; // Store global default

            if (chart.options.scales) {
                Object.keys(chart.options.scales).forEach(key => {
                    originalScaleColors[key] = {
                        ticks: chart.options.scales[key]?.ticks?.color,
                        title: chart.options.scales[key]?.title?.color,
                        pointLabels: chart.options.scales[key]?.pointLabels?.color // For radar/polar
                    };
                });
            }
            originalLegendColor = chart.options.plugins?.legend?.labels?.color;
            originalTitleColor = chart.options.plugins?.title?.color;
            currentBg = chart.options.plugins.background; // Store current background setting

            // --- Apply export colors (Black labels for PNG) ---
            const exportLabelColor = options.labelColor || this.labelColorForExport;
            Chart.defaults.color = exportLabelColor; // Set global default for labels

            if (chart.options.scales) {
                Object.keys(chart.options.scales).forEach(key => {
                    if (chart.options.scales[key]) {
                        if (chart.options.scales[key].ticks) chart.options.scales[key].ticks.color = exportLabelColor;
                        if (chart.options.scales[key].title) chart.options.scales[key].title.color = exportLabelColor;
                        if (chart.options.scales[key].pointLabels) chart.options.scales[key].pointLabels.color = exportLabelColor;
                    }
                });
            }
            if (chart.options.plugins?.legend?.labels) chart.options.plugins.legend.labels.color = exportLabelColor;
            if (chart.options.plugins?.title) chart.options.plugins.title.color = exportLabelColor;
            // --- End Apply export colors ---

            // Set white background if specified
            if (options.whiteBackground) {
                chart.options.plugins.background = { color: this.backgroundColor };
            }

            chart.update('none'); // Update with new colors/bg

            // --- Create image ---
            const canvas = chart.canvas;
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = canvas.width;
            exportCanvas.height = canvas.height;
            const exportCtx = exportCanvas.getContext('2d');

            // Fill background
            exportCtx.fillStyle = this.backgroundColor;
            exportCtx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw chart onto export canvas
            exportCtx.drawImage(canvas, 0, 0);

            // Get data URL
            const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
            const quality = options.quality || this.imageQuality;
            const dataUrl = exportCanvas.toDataURL(mimeType, quality);
            // --- End Create image ---

            return dataUrl; // Return the data URL

        } catch (error) {
            console.error('Chart export to image failed:', error);
            throw error; // Re-throw the error after attempting restore
        } finally {
            // --- Restore original colors (always runs) ---
            try {
                Chart.defaults.color = originalDefaultsColor;
                if (chart.options.scales) {
                    Object.keys(chart.options.scales).forEach(key => {
                        if (chart.options.scales[key] && originalScaleColors[key]) {
                            if (chart.options.scales[key].ticks) chart.options.scales[key].ticks.color = originalScaleColors[key].ticks;
                            if (chart.options.scales[key].title) chart.options.scales[key].title.color = originalScaleColors[key].title;
                            if (chart.options.scales[key].pointLabels) chart.options.scales[key].pointLabels.color = originalScaleColors[key].pointLabels;
                        }
                    });
                }
                if (chart.options.plugins?.legend?.labels) chart.options.plugins.legend.labels.color = originalLegendColor;
                if (chart.options.plugins?.title) chart.options.plugins.title.color = originalTitleColor;
                // Restore original background setting only if we changed it
                if (options.whiteBackground) {
                    chart.options.plugins.background = currentBg;
                }
                chart.update('none'); // Update back to original colors
                console.log("Chart colors restored after PNG export.");
            } catch (restoreError) {
                console.error("Failed to restore chart colors after PNG export:", restoreError);
            }
            // --- End Restore original colors ---
        }
    }

    /**
     * Export chart data as CSV
     * @param {Chart} chart - The Chart.js chart instance
     * @returns {string} CSV content
     */
    exportChartDataAsCSV(chart) {
        try {
            const datasets = chart.data.datasets;
            const labels = chart.data.labels;

            // Build CSV header
            const header = ['Label', ...datasets.map(ds => ds.label || 'Dataset')].join(',');

            // Build data rows
            const rows = labels.map((label, i) => {
                const values = datasets.map(ds => ds.data[i]);
                // Use safeCsvCell from utils.js if available, otherwise basic quote handling
                const safeLabel = typeof safeCsvCell === 'function' ? safeCsvCell(label) : `"${String(label).replace(/"/g, '""')}"`;
                const safeValues = values.map(v => typeof safeCsvCell === 'function' ? safeCsvCell(v) : `"${String(v).replace(/"/g, '""')}"`);
                return [safeLabel, ...safeValues].join(',');
            });

            return [header, ...rows].join('\n');
        } catch (error) {
            console.error('CSV export failed:', error);
            throw error;
        }
    }

    /**
     * Download chart as image file
     * @param {Chart} chart - The Chart.js chart instance
     * @param {string} filename - Name for downloaded file
     * @param {string} format - Export format ('png' or 'jpg')
     */
    async downloadChartAsImage(chart, filename, format = 'png') {
        try {
            // Force white background and use updated export function for downloads
            const dataUrl = await this.exportChartAsImage(chart, format, { whiteBackground: true });
            const link = document.createElement('a');
            link.download = filename + '.' + format;
            link.href = dataUrl;
            document.body.appendChild(link); // Required for Firefox
            link.click();
            document.body.removeChild(link); // Clean up
        } catch (error) {
            console.error('Chart download failed:', error);
            throw error; // Re-throw to be handled by caller (e.g., dashboard-export)
        }
    }

    /**
     * Download chart data as CSV file
     * @param {Chart} chart - The Chart.js chart instance
     * @param {string} filename - Name for downloaded file
     */
    downloadChartAsCSV(chart, filename) {
        try {
            const csv = this.exportChartDataAsCSV(chart);
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // Add BOM for Excel
            const link = document.createElement('a');
            link.download = filename + '.csv';
            link.href = URL.createObjectURL(blob);
            document.body.appendChild(link); // Required for Firefox
            link.click();
            document.body.removeChild(link); // Clean up
            URL.revokeObjectURL(link.href); // Free up memory
        } catch (error) {
            console.error('CSV download failed:', error);
            throw error; // Re-throw to be handled by caller
        }
    }
}

// Create and export singleton instance
const chartExporter = new ChartExporter();
export default chartExporter;