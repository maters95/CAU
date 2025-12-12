// TEST/scripts/reports-export.js
// reports-export.js - Integration for reports.html (v1.14 - TfNSW Branding Support)
'use strict';

// Import necessary functions - we'll dynamically import the report-handler to avoid circular dependencies
import { downloadBlob } from './pdf-service.js';

/**
 * ReportsExporter provides methods to generate and download report files (PDF/CSV).
 * Receives all necessary configuration and selections directly.
 * Now supports Transport for NSW branding.
 */
class ReportsExporter {
    constructor() {
        this.initialized = false;
    }

    /**
     * Initializes the reports export functionality.
     */
    initialize(options = {}) {
        if (this.initialized) return;
        this.initialized = true;
        console.log("Reports Export: Initializing (v1.14 - TfNSW Branding Support)...");
        console.log("Reports Export: Initialization complete (v1.14)");
    }

    /**
     * Exports the report as PDF with Transport for NSW branding.
     * ACCEPTS an options object containing all configuration.
     * @param {object} options - { year, month (0-based), format, isTeam, selectedPersons, selectedFolders, detailedReportType?, selectedWeek?, email? }
     */
    async exportReportPdf(options) {
        const isDetailedReport = options.detailedReportType !== undefined;
        const reportDesc = isDetailedReport ?
            this._getDetailedReportDescription(options) :
            "PDF report(s)";

        this.showMessage(`Generating ${reportDesc}...`, false, 15000);

        try {
            // --- 1. Extract data from options object ---
            const { year, month, format, isTeam, selectedPersons, selectedFolders, detailedReportType, selectedWeek, email } = options;

            // Basic validation of received options
            if (!year || month === undefined || !format) { // month can be 0, so check for undefined
                throw new Error("Missing required report options (year, month, format).");
            }
            if (typeof isTeam !== 'boolean') {
                 throw new Error("Missing required report option (isTeam).");
            }
             // selectedPersons/Folders can be null or array

            const isTeamReport = isTeam;
            console.log(`Reports Export: Using branded report generator with options - isTeamReport = ${isTeamReport}`);

            // --- 2. Validate Person Selection (for Individual reports only) ---
            if (!isTeamReport && Array.isArray(selectedPersons) && selectedPersons.length === 0) {
                 throw new Error("Please select specific people or 'Select All' for individual reports.");
            }

            // --- 3. Prepare Options for generateBrandedReports ---
            const reportOptions = {
                reportYear: year,
                reportMonth: month, // FIX: month is already 0-indexed from reports.js
                format: 'pdf', // Already specified format is pdf
                includeWeekGaps: true, // Or pass from options if needed
                isTeamReport: isTeamReport
            };

            // Add detailed report options if present
            if (isDetailedReport) {
                reportOptions.detailedReportType = detailedReportType;
                if ((detailedReportType === 'weeklyDaily') && selectedWeek) {
                    reportOptions.selectedWeek = selectedWeek;
                }
            }

            // Add email options if present
            if (email) {
                reportOptions.email = email;
            }

            // --- 4. Call Branded Report Generator ---
            // Import dynamically to avoid circular dependencies
            const { generateBrandedReports } = await import('./report-handler.js');

            console.log(`Calling generateBrandedReports (PDF). Options:`, JSON.stringify(reportOptions));
            const result = await generateBrandedReports(selectedPersons, selectedFolders, reportOptions);

            // --- 5. Handle Results ---
            if (!result.success) {
                if (result.errors && result.errors.length > 0) {
                    throw new Error(`Report generation failed: ${result.errors.join('; ')}`);
                } else {
                    throw new Error(`No PDF ${isDetailedReport ? 'detailed ' : ''}report data was generated for the current selection.`);
                }
            }

            this.showMessage(result.message || `Successfully generated ${result.generatedReports} ${isDetailedReport ? 'detailed ' : ''}PDF report(s)!`);
            return true;

        } catch (error) {
            console.error("Reports Export: PDF export process failed:", error);
            this.showMessage(`PDF export failed: ${error.message}`, true);
            return false;
        }
    }

    /**
     * Gets a user-friendly description of the detailed report type
     * @param {object} options - Report options containing detailedReportType and potentially selectedWeek
     * @returns {string} Description of the report type
     */
    _getDetailedReportDescription(options) {
        switch (options.detailedReportType) {
            case 'monthlyDaily':
                return 'daily breakdown for entire month';
            case 'weeklyDaily':
                return `daily breakdown for Week ${options.selectedWeek}`;
            case 'monthlySplit':
                return 'weekly splits for the month';
            default:
                return 'detailed reports';
        }
    }

    /**
     * Exports report data as CSV.
     * ACCEPTS an options object containing all configuration.
     * @param {object} options - { year, month (0-based), format, isTeam, selectedPersons, selectedFolders }
     */
    async exportAllDataCsv(options) {
        this.showMessage("Exporting report data as CSV...", false, 10000);
         try {
            // --- 1. Extract data from options object ---
            const { year, month, format, isTeam, selectedPersons, selectedFolders } = options;

            // Basic validation
            if (!year || month === undefined || !format) { // month can be 0, so check for undefined
                 throw new Error("Missing required report options (year, month, format).");
            }
            if (typeof isTeam !== 'boolean') throw new Error("Missing required report option (isTeam).");

            const isTeamReport = isTeam;
            console.log(`Reports Export: Received options - isTeamReport = ${isTeamReport}`);
            const isSelectAllPeople = !isTeamReport && selectedPersons === null;

             // --- 2. Validate Person Selection (for Individual reports) ---
             if (!isTeamReport && Array.isArray(selectedPersons) && selectedPersons.length === 0) {
                 throw new Error("Please select specific people or 'Select All' for individual reports.");
             }

            // --- 3. Prepare Options for generateObjectiveReports ---
            const reportOptions = {
                 reportYear: year,
                 reportMonth: month, // FIX: month is already 0-indexed from reports.js
                 format: 'csv', // Already specified format is csv
                 includeWeekGaps: true,
                 isTeamReport: isTeamReport
            };

            // Import dynamically to avoid circular dependencies
            const { generateObjectiveReports } = await import('./report-generator.js');

            // --- 4. Call Report Generator ---
            // Pass received selections directly
            console.log(`Calling generateObjectiveReports (CSV). Options:`, JSON.stringify(reportOptions));
            const result = await generateObjectiveReports(selectedPersons, selectedFolders, reportOptions);

            // --- 5. Handle Results ---
            if (result.errors && result.errors.length > 0) {
                throw new Error(`CSV generation failed: ${result.errors.join('; ')}`);
            }
            const csvReports = result.generatedReports.filter(r => r.type === 'csv');
            if (csvReports.length === 0) {
                 if (result.generatedReports && result.generatedReports.length > 0) {
                     throw new Error("Internal error: Expected CSV report data, but received other type.");
                 } else {
                     throw new Error("No CSV data was generated for the current selection.");
                 }
            }

            // --- 6. Process CSV Content ---
            let csvContent = '';
            // Default filename now using 0-indexed month consistent with generator.
            // The generator will create filenames with 1-indexed month for display.
            let filename = `Report_Data_${year}_${String(month + 1).padStart(2, '0')}.csv`;


            if (isTeamReport) { // Team report logic
                if (csvReports.length > 0 && csvReports[0].content) {
                    csvContent = csvReports[0].content;
                    filename = csvReports[0].fileName || filename; // Use filename from generator if available
                    console.log("Processing single Team CSV report.");
                } else { throw new Error("Team CSV content not found or invalid structure received."); }
            } else { // Individual report logic
                if (csvReports.length > 0) {
                    const headerMatch = csvReports[0].content?.match(/^.*?\n/);
                    const header = headerMatch ? headerMatch[0] : '';
                    if (!header && csvReports[0].content) {
                         console.warn("CSV header extraction failed. Combining raw content.");
                         csvContent = csvReports.map(r => r.content || "").join('\n');
                    } else if (header) {
                         const bodyRows = csvReports.map(r => r.content ? r.content.substring(header.length) : "").join('');
                         csvContent = header + bodyRows;
                    } else { csvContent = ''; }

                    // Determine filename - use filename from generator if available and sensible
                    if (csvReports.length === 1 && csvReports[0].fileName) {
                        filename = csvReports[0].fileName;
                    } else if (csvReports.length > 0 && csvReports[0].fileName && (isSelectAllPeople || (Array.isArray(selectedPersons) && selectedPersons.length > 1))) {
                        // If multiple people combined into one CSV by generator, use its name
                         filename = csvReports[0].fileName;
                    } else if (isSelectAllPeople) {
                         filename = `All_Individuals_CSV_${year}-${String(month + 1).padStart(2, '0')}_(${csvReports.length}-persons).csv`;
                    } else if (Array.isArray(selectedPersons)) {
                         const personCount = selectedPersons.length > 0 ? selectedPersons.length : csvReports.length;
                         filename = `Combined_Individuals_CSV_${year}-${String(month + 1).padStart(2, '0')}_(${personCount}-persons).csv`;
                    }
                    console.log(`Combined ${csvReports.length} individual CSV reports into one file: ${filename}`);
                } else { throw new Error("Individual CSV report content not found."); }
            }

            // --- 7. Download CSV Blob ---
            if (!csvContent && csvReports.length > 0 && !csvReports[0].content) {
                // This case could happen if the generator produced a CSV entry but content was null/empty
                console.warn("CSV content is empty after processing. Check generator output.");
            } else if (!csvContent && csvReports.length === 0) {
                throw new Error("No CSV content available to download.");
            }


            const blob = new Blob([csvContent || ""], { type: 'text/csv;charset=utf-8;' }); // Ensure blob is not null
            downloadBlob(blob, filename);
            this.showMessage("Data exported successfully as CSV!");
            return true;

        } catch (error) {
            console.error("Reports Export: CSV export failed:", error);
            this.showMessage(`Data export failed: ${error.message}`, true);
            return false;
        }
    }

    // --- Helper Functions ---

    /**
     * Exports yearly report as PDF.
     * @param {object} options - { year, selectedPersons, selectedFolders, isYearly }
     */
    async exportYearlyReportPdf(options) {
        this.showMessage('Generating yearly PDF report(s)...', false, 15000);

        try {
            const { year, selectedPersons, selectedFolders, includeMonthlyBreakdowns = true } = options;

            if (!year) {
                throw new Error("Missing required report option (year).");
            }

            // Validate person selection
            if (Array.isArray(selectedPersons) && selectedPersons.length === 0) {
                throw new Error("Please select specific people or 'Select All' for yearly reports.");
            }

            // Import the yearly report generator
            const { generateYearlyReports } = await import('./report-generator.js');

            const reportOptions = {
                reportYear: year,
                includeMonthlyBreakdowns: includeMonthlyBreakdowns
            };

            console.log(`Calling generateYearlyReports (PDF). Options:`, JSON.stringify(reportOptions));
            const result = await generateYearlyReports(selectedPersons, selectedFolders, reportOptions);

            // Handle errors
            if (result.errors && result.errors.length > 0) {
                throw new Error(`Yearly report generation failed: ${result.errors.join('; ')}`);
            }

            // Generate and download PDFs
            if (!result.generatedReports || result.generatedReports.length === 0) {
                throw new Error('No yearly report data was generated for the current selection.');
            }

            // Import PDF generator and branding
            const ReportGenerator = (await import('./pdf-export.js')).default;
            
            // Get branding data
            let logoDataUrl = null;
            try {
                const response = await fetch(chrome.runtime.getURL('branding/Transport_for_NSW_logo.svg.png'));
                const blob = await response.blob();
                logoDataUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            } catch (error) {
                console.warn("Could not load branding logo:", error);
            }

            const branding = {
                logoDataUrl: logoDataUrl,
                teamName: 'Customer Administration Unit'
            };

            const jsPDFConstructor = window.jspdf?.jsPDF;
            if (!jsPDFConstructor) {
                throw new Error("jsPDF library not found.");
            }

            // Try multiple ways to get autoTable plugin (same as pdf-service.js)
            let autoTablePlugin = jsPDFConstructor.API?.autoTable || window.jspdf?.autoTable || null;
            if (!autoTablePlugin && jsPDFConstructor.prototype && typeof jsPDFConstructor.prototype.autoTable === 'function') {
                autoTablePlugin = jsPDFConstructor.prototype.autoTable;
            }
            
            if (!autoTablePlugin) {
                console.warn("Reports Export: jsPDF AutoTable plugin not found. Tables may not render correctly.");
            }

            const generator = new ReportGenerator(jsPDFConstructor, autoTablePlugin, branding);

            // Generate and download each report
            for (const report of result.generatedReports) {
                if (report.type === 'pdf') {
                    const pdfBlob = await generator.generateReport(report.data, { orientation: 'landscape' });
                    downloadBlob(pdfBlob, report.fileName);
                }
            }

            this.showMessage(`Successfully generated ${result.generatedReports.length} yearly PDF report(s)!`);
            return true;

        } catch (error) {
            console.error("Yearly report export error:", error);
            this.showMessage(`Error: ${error.message}`, true, 10000);
            throw error;
        }
    }

    // Get selected list from DOM
    getSelectedList(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`getSelectedList: Container ID "${containerId}" not found.`);
            return undefined; // Signal error finding container
        }
        const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
        const selectAllCheckboxId = `selectAll${containerId.replace('Container', '').charAt(0).toUpperCase() + containerId.replace('Container', '').slice(1)}`;
        const selectAllCheckbox = document.getElementById(selectAllCheckboxId);
        if (selectAllCheckbox && selectAllCheckbox.checked && !selectAllCheckbox.indeterminate) {
            return null;
        }
        if (checkboxes.length > 0) {
            const selectedValues = Array.from(checkboxes).map(cb => cb.value);
            return selectedValues;
        }
        return [];
    }

    // Show status message
    showMessage(message, isError = false, duration = 5000) {
        let statusDiv = document.getElementById('exportStatusDiv');
        let isNewDiv = false;
        if (!statusDiv) {
            isNewDiv = true;
            statusDiv = document.createElement('div');
            statusDiv.id = 'exportStatusDiv';
            statusDiv.style.cssText = `
                position: fixed; bottom: 20px; right: 20px; padding: 12px 18px;
                border-radius: 5px; box-shadow: 0 3px 8px rgba(0,0,0,0.15);
                z-index: 1050; max-width: 320px; font-size: 14px;
                font-family: Arial, sans-serif; opacity: 0;
                transition: opacity 0.4s ease-in-out; pointer-events: none;
            `;
            document.body.appendChild(statusDiv);
        }
        statusDiv.textContent = message;
        statusDiv.style.backgroundColor = isError ? '#f8d7da' : '#d1ecf1';
        statusDiv.style.color = isError ? '#721c24' : '#0c5460';
        statusDiv.style.border = `1px solid ${isError ? '#f5c6cb' : '#bee5eb'}`;
        requestAnimationFrame(() => {
             statusDiv.style.opacity = '1';
        });
        if (statusDiv.hideTimeout) {
            clearTimeout(statusDiv.hideTimeout);
        }
        statusDiv.hideTimeout = setTimeout(() => {
            statusDiv.style.opacity = '0';
            if (isNewDiv) {
                 setTimeout(() => {
                      if (statusDiv && statusDiv.parentNode) {
                           statusDiv.parentNode.removeChild(statusDiv);
                      }
                 }, 400);
            }
        }, duration);
    }
}

// --- Initialization & Export Instance ---
const reportsExporterInstance = new ReportsExporter();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        reportsExporterInstance.initialize();
    });
} else {
    reportsExporterInstance.initialize();
}
export default reportsExporterInstance;