// TEST/scripts/pdf-export.js
// v1.13 - Collated Detailed Reports Support
'use strict';

import { FOLDER_ORDER } from './constants.js';

/**
 * ReportGenerator creates PDF reports with enhanced styling.
 * Handles standard reports, combined reports, and detailed reports.
 */
class ReportGenerator {
    /**
     * Constructor for ReportGenerator.
     * @param {function} jsPDFConstructor - The jsPDF constructor function (e.g., window.jspdf.jsPDF).
     * @param {function|null} autoTablePlugin - The jsPDF AutoTable plugin function, or null if not found globally.
     * @param {object} branding - Branding options { logoDataUrl, teamName }.
     */
    constructor(jsPDFConstructor, autoTablePlugin, branding = {}) {
        if (typeof jsPDFConstructor !== 'function') { throw new Error('jsPDF constructor is required for ReportGenerator.'); }
        this.jsPDFConstructor = jsPDFConstructor;
        this.autoTable = autoTablePlugin;
        if (!this.autoTable) { console.warn("ReportGenerator: jsPDF AutoTable plugin function not found globally."); }
        this.colors = { primary: [0, 51, 102], secondary: [218, 41, 28], accent: [0, 132, 168], lightGrey: [245, 245, 245], mediumGrey: [220, 220, 220], darkGrey: [100, 100, 100], black: [0, 0, 0], white: [255, 255, 255] };
        this.pageOptions = { orientation: 'landscape', unit: 'mm', format: 'a4', fontSize: 9, margins: { top: 20, right: 10, bottom: 15, left: 10 } };
        this.branding = { logoDataUrl: branding.logoDataUrl ? (branding.logoDataUrl.startsWith('data:') ? branding.logoDataUrl : `data:image/png;base64,${branding.logoDataUrl}`) : null, teamName: branding.teamName || 'Customer Administration Unit' };
        console.log("ReportGenerator (v1.13 - Collated Detailed Reports Support) instance created.");
    }

    /**
     * Generates the PDF report as a Blob.
     * Handles single reports, combined reports, and detailed reports.
     * @param {object} reportData - The report data object.
     * @param {object} options - Page generation options (e.g., orientation).
     * @returns {Promise<Blob>} A Promise resolving with the generated PDF Blob.
     */
    async generateReport(reportData, options = {}) {
        console.log("ReportGenerator: generateReport called. isCombined:", reportData?.isCombined, "isDetailed:", reportData?.isDetailed);
        
        if (!reportData || typeof reportData !== 'object') {
            throw new Error("Invalid reportData provided to generateReport.");
        }
        
        try {
            const pageOrientation = options.orientation || this.pageOptions.orientation;
            const pdf = new this.jsPDFConstructor(pageOrientation, this.pageOptions.unit, this.pageOptions.format);
            pdf.setFontSize(this.pageOptions.fontSize);
            pdf.lastAutoTable = null;
            
            const autoTableAvailable = typeof pdf.autoTable === 'function';
            if (!autoTableAvailable && !this.autoTable) {
                throw new Error("jsPDF AutoTable plugin missing.");
            }
            const autoTableFunc = pdf.autoTable || this.autoTable;

            if (reportData.isYearly) {
                // --- Yearly Report Logic ---
                console.log("ReportGenerator: Generating yearly report.");
                
                const yearlyData = reportData.yearlyData;
                if (!yearlyData) {
                    throw new Error("Missing yearly report data.");
                }
                
                // === PAGE 1: Executive Summary Cover Page ===
                pdf.lastY = 0;
                this._addHeader(pdf, reportData.title);
                pdf.lastY = this.pageOptions.margins.top;
                await this._addYearlyCoverPage(pdf, yearlyData, reportData, autoTableFunc);
                
                // Generate summary tables
                // Returns: { topPerformers: { numbers, percentage }, lowerPerformers: { numbers, percentage } }
                const summaryTables = this._prepareYearlySummaryTables(yearlyData);
                
                // === PAGE 2: Top Performers (Numbers + Percentage stacked) ===
                if (summaryTables.topPerformers) {
                    pdf.addPage();
                    pdf.lastY = 0;
                    this._addHeader(pdf, reportData.title);
                    pdf.lastY = this.pageOptions.margins.top;
                    await this._addCompactTablePair(pdf, summaryTables.topPerformers.numbers, summaryTables.topPerformers.percentage, autoTableFunc);
                }
                
                // === PAGE 3: Lower Performers (Numbers + Percentage stacked) ===
                if (summaryTables.lowerPerformers) {
                    pdf.addPage();
                    pdf.lastY = 0;
                    this._addHeader(pdf, reportData.title);
                    pdf.lastY = this.pageOptions.margins.top;
                    await this._addCompactTablePair(pdf, summaryTables.lowerPerformers.numbers, summaryTables.lowerPerformers.percentage, autoTableFunc);
                }
                
                const yearLabel = reportData.reportYear || reportData.yearlyData?.year || 'Year';
                
                // === PAGES 4-5: Best Daily Performance (2 pages, 6 months each) ===
                if (reportData.highestDailyData) {
                    const dailyTables = this._preparePerformanceTables(reportData.highestDailyData, 'daily');
                    
                    if (dailyTables.length > 0) {
                        // Page 1: January - June
                        pdf.addPage();
                        pdf.lastY = 0;
                        this._addHeader(pdf, reportData.title);
                        pdf.lastY = this.pageOptions.margins.top;
                        this._renderPerformanceGrid(pdf, dailyTables, autoTableFunc, `Best Individual Daily Performance - ${yearLabel} (Excl. Batches)`, 1);
                        
                        // Page 2: July - December
                        if (dailyTables.length > 6) {
                            pdf.addPage();
                            pdf.lastY = 0;
                            this._addHeader(pdf, reportData.title);
                            pdf.lastY = this.pageOptions.margins.top;
                            this._renderPerformanceGrid(pdf, dailyTables, autoTableFunc, `Best Individual Daily Performance - ${yearLabel} (Excl. Batches)`, 2);
                        }
                    }
                }
                
                // === PAGES 6-7: Best Weekly Performance (2 pages, 6 months each) ===
                if (reportData.highestWeeklyData) {
                    const weeklyTables = this._preparePerformanceTables(reportData.highestWeeklyData, 'weekly');
                    
                    if (weeklyTables.length > 0) {
                        // Page 1: January - June
                        pdf.addPage();
                        pdf.lastY = 0;
                        this._addHeader(pdf, reportData.title);
                        pdf.lastY = this.pageOptions.margins.top;
                        this._renderPerformanceGrid(pdf, weeklyTables, autoTableFunc, `Best Individual Weekly Performance - ${yearLabel} (Excl. Batches)`, 1);
                        
                        // Page 2: July - December
                        if (weeklyTables.length > 6) {
                            pdf.addPage();
                            pdf.lastY = 0;
                            this._addHeader(pdf, reportData.title);
                            pdf.lastY = this.pageOptions.margins.top;
                            this._renderPerformanceGrid(pdf, weeklyTables, autoTableFunc, `Best Individual Weekly Performance - ${yearLabel} (Excl. Batches)`, 2);
                        }
                    }
                }
                
                // === PAGES 8-9: Best Monthly Performance (2 pages, 6 months each) ===
                if (reportData.highestMonthlyData) {
                    const monthlyPerfTables = this._preparePerformanceTables(reportData.highestMonthlyData, 'monthly');
                    
                    if (monthlyPerfTables.length > 0) {
                        // Page 1: January - June
                        pdf.addPage();
                        pdf.lastY = 0;
                        this._addHeader(pdf, reportData.title);
                        pdf.lastY = this.pageOptions.margins.top;
                        this._renderPerformanceGrid(pdf, monthlyPerfTables, autoTableFunc, `Best Individual Monthly Performance - ${yearLabel} (Excl. Batches)`, 1);
                        
                        // Page 2: July - December
                        if (monthlyPerfTables.length > 6) {
                            pdf.addPage();
                            pdf.lastY = 0;
                            this._addHeader(pdf, reportData.title);
                            pdf.lastY = this.pageOptions.margins.top;
                            this._renderPerformanceGrid(pdf, monthlyPerfTables, autoTableFunc, `Best Individual Monthly Performance - ${yearLabel} (Excl. Batches)`, 2);
                        }
                    }
                }
                
                // Generate monthly breakdown pages (optional based on reportData.includeMonthlyBreakdowns)
                if (reportData.includeMonthlyBreakdowns !== false) {
                    const monthlyBreakdownTables = this._prepareMonthlyBreakdownTables(yearlyData);
                    for (let i = 0; i < monthlyBreakdownTables.length; i++) {
                        pdf.addPage();
                        pdf.lastY = 0;
                        this._addHeader(pdf, reportData.title);
                        pdf.lastY = this.pageOptions.margins.top;
                        await this._addMainTableSection(pdf, monthlyBreakdownTables[i], autoTableFunc, monthlyBreakdownTables[i].title);
                    }
                }
                
            } else if (reportData.isDetailed) {
                // --- Detailed Report Logic ---
                console.log("ReportGenerator: Generating detailed report.");
                pdf.lastY = 0;
                this._addHeader(pdf, reportData.title); // Main title for the document
                pdf.lastY = this.pageOptions.margins.top;
                
                const detailedData = reportData.detailedData;
                if (!detailedData || !detailedData.tables || detailedData.tables.length === 0) {
                    throw new Error("Missing detailed report data or tables.");
                }
                
                // Consolidate all tables into a single table
                const consolidatedTable = this._consolidateDetailedTables(detailedData.tables);
                
                // Add the consolidated table to the PDF
                await this._addMainTableSection(pdf, consolidatedTable, autoTableFunc, "Consolidated Report");
                
            } else if (reportData.isCombined && Array.isArray(reportData.sections)) {
                // --- Combined Report Logic (Individual Reports combined) ---
                // Queue stats are EXCLUDED from sections by report-generator.js
                console.log(`ReportGenerator: Generating combined report with ${reportData.sections.length} sections.`);
                for (let i = 0; i < reportData.sections.length; i++) {
                    const section = reportData.sections[i];
                    if (i > 0) pdf.addPage();
                    pdf.lastY = 0;
                    this._addHeader(pdf, section.title || `Section ${i + 1}`);
                    pdf.lastY = this.pageOptions.margins.top;
                    if (section.mainTable) {
                        console.log(`ReportGenerator: Adding main objective table for section ${i + 1}...`);
                        await this._addMainTableSection(pdf, section.mainTable, autoTableFunc, 'Objective Data');
                    } else {
                        console.log(`ReportGenerator: No main objective table for section ${i + 1}.`);
                    }
                    // No queue stats table added for combined individual sections
                    console.log(`ReportGenerator: Finished section ${i + 1}. Current Y: ${pdf.lastY}`);
                }
            } else {
                // --- Single Report Logic (Used for Team Report) ---
                console.log("ReportGenerator: Generating single report (Team Report).");
                pdf.lastY = 0;
                this._addHeader(pdf, reportData.title || 'Report');
                pdf.lastY = this.pageOptions.margins.top;

                let objectiveTableAdded = false;
                // Add Main Objective Table if it exists
                if (reportData.mainTable) {
                    console.log("ReportGenerator: Adding main objective table...");
                    await this._addMainTableSection(pdf, reportData.mainTable, autoTableFunc, 'Objective Data');
                    objectiveTableAdded = true; // Mark that the first table was added
                } else { console.log("ReportGenerator: No main objective table for this report."); }

                // Add Queue Stats Table if it exists
                if (reportData.queueStatsTable) {
                    console.log("ReportGenerator: Adding queue stats table...");
                    // --- FIX: Add Page Break if objective table was added ---
                    if (objectiveTableAdded) {
                        console.log("ReportGenerator: Adding page break before queue stats table.");
                        pdf.addPage();
                        // Re-add header on the new page
                        this._addHeader(pdf, reportData.title || 'Report');
                        pdf.lastY = this.pageOptions.margins.top; // Reset Y position after header
                    }
                    // --- End Fix ---
                    await this._addMainTableSection(pdf, reportData.queueStatsTable, autoTableFunc, 'Queue Performance Summary');
                } else { console.log("ReportGenerator: No queue stats table for this report."); }
                 console.log("ReportGenerator: Finished single report content. Current Y:", pdf.lastY);
            }

            // Add Footer to all pages
            this._addFooter(pdf);

            console.log("ReportGenerator: PDF generation successful, outputting blob.");
            return pdf.output('blob');
        } catch (error) {
            console.error('ReportGenerator: PDF generation failed internally:', error);
            throw new Error(`PDF generation failed: ${error.message}`);
        }
    }

    /**
     * Formats a date string from a table to DDMMM format.
     * @param {Object} table - The table object containing date information
     * @returns {String} - Formatted date string in DDMMM format
     */
    _formatTableDateToDDMMM(table) {
        const MONTH_NAMES_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        // First attempt to use table.date if it exists (ISO format: YYYY-MM-DD)
        if (table.date && /^\d{4}-\d{2}-\d{2}$/.test(table.date)) {
            const [year, month, day] = table.date.split('-');
            const monthIndex = parseInt(month, 10);
            const monthName = monthIndex >= 1 && monthIndex <= 12 ? MONTH_NAMES_SHORT[monthIndex] : '';
            return `${day}${monthName}`;
        }
        
        // If no date property or wrong format, try to extract from the title
        if (table.title) {
            // Try to extract a date from formats like "Monday, 12 January 2025" or "Week 5 (15 Jan - 21 Jan)"
            const dayMonthRegex = /\b(\d{1,2})[\s,]+([A-Za-z]+)\b/;
            const match = table.title.match(dayMonthRegex);
            
            if (match) {
                const day = match[1].padStart(2, '0');
                const monthName = match[2].substring(0, 3); // Take first 3 letters of month
                return `${day}${monthName}`;
            }
            
            // If we cannot extract a proper date, fallback to title
            return table.title.substring(0, 5);
        }
        
        // Last resort
        return "Date";
    }

    /**
     * Prepares the yearly summary tables showing each person in columns with yearly totals by folder
     * Splits into two pages: top performers on page 1, lower performers on page 2
     * Each page has a numbers table and a percentage table
     * @param {Object} yearlyData - The yearly report data
     * @returns {Array} Array of table data objects (4 tables: 2 numbers + 2 percentages)
     */
    _prepareYearlySummaryTables(yearlyData) {
        const { yearlyData: data, folders, persons, completeFolderTotals, completeGrandTotal } = yearlyData;
        
        // Batch folders to exclude from sorting
        const BATCH_FOLDERS = new Set(["Personals", "Police", "Completed ROI Requests", "Personals Batch", "Police Batch"]);
        
        // Calculate yearly total for each person (both total and excluding batches)
        const personTotals = persons.map(person => {
            let total = 0;
            let totalExclBatches = 0;
            folders.forEach(folder => {
                const folderTotal = data[person]?.[folder]?.total || 0;
                total += folderTotal;
                if (!BATCH_FOLDERS.has(folder)) {
                    totalExclBatches += folderTotal;
                }
            });
            return { name: person, total, totalExclBatches, daysWorked: data[person]?.daysWorked || 0 };
        });
        
        // Use complete grand total (all persons, not just selected)
        const grandTotal = completeGrandTotal || personTotals.reduce((sum, p) => sum + p.total, 0);
        
        // Use complete folder totals (all persons, not just selected)
        const folderGrandTotals = completeFolderTotals || {};
        if (!completeFolderTotals) {
            folders.forEach(folder => {
                let folderTotal = 0;
                persons.forEach(person => {
                    folderTotal += data[person]?.[folder]?.total || 0;
                });
                folderGrandTotals[folder] = folderTotal;
            });
        }
        
        // Calculate total days worked for team total column (count unique)
        const allDaysWorked = persons.reduce((sum, p) => sum + (data[p]?.daysWorked || 0), 0);
        
        // Sort by total excluding batches descending (highest first)
        personTotals.sort((a, b) => b.totalExclBatches - a.totalExclBatches);
        const sortedPersons = personTotals.map(p => p.name);
        
        // Split persons into two groups (roughly half each)
        const midPoint = Math.ceil(sortedPersons.length / 2);
        const topPerformers = sortedPersons.slice(0, midPoint);
        const lowerPerformers = sortedPersons.slice(midPoint);
        
        // Helper to shorten names
        const shortenName = (name, maxLen = 10) => {
            if (!name) return name;
            const parts = name.trim().split(/\s+/);
            if (parts.length >= 2) {
                const firstName = parts[0];
                const lastInitial = parts[parts.length - 1].charAt(0);
                const shortened = `${firstName} ${lastInitial}.`;
                if (shortened.length > maxLen) {
                    return `${firstName.substring(0, maxLen - 3)} ${lastInitial}.`;
                }
                return shortened;
            }
            if (name.length > maxLen) {
                return name.substring(0, maxLen - 1) + '.';
            }
            return name;
        };
        
        // Helper to format percentage
        const formatPercent = (value, total) => {
            if (total === 0) return '0%';
            const pct = (value / total) * 100;
            if (pct === 0) return '0%';
            if (pct < 0.1) return '<0.1%';
            return pct.toFixed(1) + '%';
        };
        
        // Helper to create a numbers table for a group of persons
        const createNumbersTable = (personGroup, title) => {
            const maxNameLen = personGroup.length > 15 ? 10 : 12;
            const displayNames = personGroup.map(p => shortenName(p, maxNameLen));
            const headerRow = ["Folder", ...displayNames, "Team Total"];
            
            const bodyRows = [];
            const columnTotals = new Array(personGroup.length + 1).fill(0); // +1 for team total
            const columnTotalsExclBatches = new Array(personGroup.length + 1).fill(0); // +1 for team total
            
            // Add Days Worked row at the top (light blue styling applied in table renderer)
            const daysWorkedRow = ["Days Worked"];
            personGroup.forEach(person => {
                daysWorkedRow.push(data[person]?.daysWorked || 0);
            });
            daysWorkedRow.push(allDaysWorked); // Team total days worked
            bodyRows.push(daysWorkedRow);
            
            folders.forEach(folder => {
                const row = [folder];
                const isBatch = BATCH_FOLDERS.has(folder);
                
                personGroup.forEach((person, idx) => {
                    const folderTotal = data[person]?.[folder]?.total || 0;
                    row.push(folderTotal);
                    columnTotals[idx] += folderTotal;
                    if (!isBatch) {
                        columnTotalsExclBatches[idx] += folderTotal;
                    }
                });
                
                const teamFolderTotal = folderGrandTotals[folder] || 0;
                row.push(teamFolderTotal); // Team total for this folder (from complete totals)
                columnTotals[personGroup.length] += teamFolderTotal;
                if (!isBatch) {
                    columnTotalsExclBatches[personGroup.length] += teamFolderTotal;
                }
                bodyRows.push(row);
            });
            
            // Add total row
            const totalRow = ["Total", ...columnTotals.slice(0, personGroup.length), grandTotal];
            bodyRows.push(totalRow);
            
            // Add total excluding batches row
            const totalExclBatchesRow = ["Total (Excl. Batches)", ...columnTotalsExclBatches.slice(0, personGroup.length), columnTotalsExclBatches[personGroup.length]];
            bodyRows.push(totalExclBatchesRow);
            
            return {
                head: [headerRow],
                body: bodyRows,
                title: title,
                isYearlySummary: true,
                hasDaysWorkedRow: true,
                hasTotalExclBatchesRow: true,
                personCount: personGroup.length,
                originalPersonNames: personGroup
            };
        };
        
        // Pre-calculate team-wide highest percentage person for each folder (across ALL persons)
        const teamHighestPerFolder = {};
        folders.forEach(folder => {
            let maxPercent = 0;
            let highestPerson = null;
            const teamFolderTotal = folderGrandTotals[folder] || 0;
            
            if (teamFolderTotal > 0) {
                sortedPersons.forEach(person => {
                    const folderTotal = data[person]?.[folder]?.total || 0;
                    const pct = folderTotal / teamFolderTotal;
                    if (pct > maxPercent) {
                        maxPercent = pct;
                        highestPerson = person;
                    }
                });
            }
            if (highestPerson) {
                teamHighestPerFolder[folder] = highestPerson;
            }
        });
        
        // Helper to create a percentage table for a group of persons
        const createPercentageTable = (personGroup, title) => {
            const maxNameLen = personGroup.length > 15 ? 10 : 12;
            const displayNames = personGroup.map(p => shortenName(p, maxNameLen));
            const headerRow = ["Folder", ...displayNames, "Team Total"];
            
            // Batch folders to exclude from the "excl. batches" row
            const BATCH_FOLDERS = new Set(["Personals", "Police", "Completed ROI Requests", "Personals Batch", "Police Batch"]);
            
            const bodyRows = [];
            const columnTotals = new Array(personGroup.length).fill(0); // For calculating person totals
            const columnTotalsExclBatches = new Array(personGroup.length).fill(0); // Excluding batches
            let grandTotalExclBatches = 0;
            
            // First pass: calculate column totals
            folders.forEach(folder => {
                const isBatch = BATCH_FOLDERS.has(folder);
                personGroup.forEach((person, idx) => {
                    const folderTotal = data[person]?.[folder]?.total || 0;
                    columnTotals[idx] += folderTotal;
                    if (!isBatch) {
                        columnTotalsExclBatches[idx] += folderTotal;
                    }
                });
                if (!isBatch) {
                    grandTotalExclBatches += folderGrandTotals[folder] || 0;
                }
            });
            
            // Add Days Worked row at the top (light blue styling applied in table renderer)
            const daysWorkedRow = ["Days Worked"];
            personGroup.forEach(person => {
                daysWorkedRow.push(data[person]?.daysWorked || 0);
            });
            daysWorkedRow.push(allDaysWorked); // Team total days worked
            bodyRows.push(daysWorkedRow);
            
            // Track which column has the highest percentage for each folder row (team-wide)
            // Key: row index, Value: column index (1-based, since 0 is folder name)
            const highestPercentColumns = {};
            
            folders.forEach((folder, folderIdx) => {
                const row = [folder];
                
                // Check if the team-wide highest person for this folder is in this table
                const highestPerson = teamHighestPerFolder[folder];
                const personIdxInGroup = personGroup.indexOf(highestPerson);
                
                personGroup.forEach((person) => {
                    const folderTotal = data[person]?.[folder]?.total || 0;
                    const teamFolderTotal = folderGrandTotals[folder] || 0;
                    // Percentage of this person's contribution to the TEAM total for this folder
                    row.push(formatPercent(folderTotal, teamFolderTotal));
                });
                
                // Only highlight if the team-wide highest person is in THIS table's personGroup
                if (personIdxInGroup >= 0) {
                    // Row index is folderIdx + 1 (because Days Worked is row 0)
                    // Column index is personIdxInGroup + 1 (because column 0 is folder name)
                    highestPercentColumns[folderIdx + 1] = personIdxInGroup + 1;
                }
                
                // Team total (absolute number)
                row.push(folderGrandTotals[folder] || 0);
                bodyRows.push(row);
            });
            
            // Add total row with percentages of grand total
            const totalRow = ["Total"];
            columnTotals.forEach(personTotal => {
                totalRow.push(formatPercent(personTotal, grandTotal));
            });
            totalRow.push(grandTotal); // Grand total number
            bodyRows.push(totalRow);
            
            // Add total excluding batches row
            const totalExclBatchesRow = ["Total (Excl. Batches)"];
            columnTotalsExclBatches.forEach(personTotal => {
                totalExclBatchesRow.push(formatPercent(personTotal, grandTotalExclBatches));
            });
            totalExclBatchesRow.push(grandTotalExclBatches);
            bodyRows.push(totalExclBatchesRow);
            
            return {
                head: [headerRow],
                body: bodyRows,
                title: title,
                isYearlySummary: true,
                isPercentageTable: true,
                hasDaysWorkedRow: true,
                hasTotalExclBatchesRow: true,
                highestPercentColumns: highestPercentColumns, // Map of rowIdx -> colIdx for highlighting
                personCount: personGroup.length,
                originalPersonNames: personGroup
            };
        };
        
        // Return structured object for combined page rendering
        const result = {
            topPerformers: null,
            lowerPerformers: null
        };
        
        // Create tables for top performers
        if (topPerformers.length > 0) {
            result.topPerformers = {
                numbers: createNumbersTable(
                    topPerformers, 
                    `Yearly Summary - Top Performers (Ranked 1-${topPerformers.length})`
                ),
                percentage: createPercentageTable(
                    topPerformers, 
                    `Percentage of Team Total - Top Performers (Ranked 1-${topPerformers.length})`
                )
            };
        }
        
        // Create tables for lower performers
        if (lowerPerformers.length > 0) {
            result.lowerPerformers = {
                numbers: createNumbersTable(
                    lowerPerformers, 
                    `Yearly Summary - Continued (Ranked ${topPerformers.length + 1}-${sortedPersons.length})`
                ),
                percentage: createPercentageTable(
                    lowerPerformers, 
                    `Percentage of Team Total - Continued (Ranked ${topPerformers.length + 1}-${sortedPersons.length})`
                )
            };
        }
        
        return result;
    }
    
    /**
     * Prepares the highest daily totals tables showing the person with the best single day per month
     * Now includes 2nd best for each month
     * Returns an array of detail tables - one per month with data
     * @param {Object} highestDailyData - The highest daily totals data
     * @returns {Array} Array of table data objects
     */
    /**
     * Prepares top performers tables for daily/weekly/monthly performance
     * Each month gets a table with top 4 performers, each showing their own folders
     */
    _preparePerformanceTables(data, type = 'daily') {
        let dataArray, year;
        
        if (type === 'daily') {
            dataArray = data.highestDays;
            year = data.year;
        } else if (type === 'weekly') {
            dataArray = data.highestWeeks;
            year = data.year;
        } else if (type === 'monthly') {
            dataArray = data.highestMonths;
            year = data.year;
        }
        
        if (!dataArray) return [];
        
        const tables = [];
        
        dataArray.forEach(monthData => {
            if (!monthData.topPerformers || monthData.topPerformers.length === 0) {
                tables.push({
                    monthName: monthData.monthName,
                    performers: [],
                    isEmpty: true
                });
                return;
            }
            
            // Build table data for each performer
            const performers = monthData.topPerformers.map((performer, idx) => {
                const rank = idx + 1;
                const rankLabel = rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : '4th';
                
                // Build rows for this performer's folders
                const folderRows = Object.entries(performer.folders || {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([folder, count]) => ({ folder, count }));
                
                let dateInfo = '';
                if (type === 'daily') {
                    dateInfo = performer.date || '';
                } else if (type === 'weekly') {
                    dateInfo = performer.dateRange ? `Week ${performer.weekNum} (${performer.dateRange})` : `Week ${performer.weekNum}`;
                } else if (type === 'monthly') {
                    dateInfo = monthData.monthName;
                }
                
                return {
                    rank,
                    rankLabel,
                    person: performer.person,
                    total: performer.total,
                    dateInfo,
                    folderRows
                };
            });
            
            tables.push({
                monthName: monthData.monthName,
                performers,
                isEmpty: false
            });
        });
        
        return tables;
    }
    
    /**
     * Renders performance tables in a grid layout (3 cols x 2 rows = 6 months per page)
     */
    _renderPerformanceGrid(pdf, tables, autoTableFunc, title, pageNum) {
        // pageNum: 1 = months 1-6, 2 = months 7-12
        const startIdx = (pageNum - 1) * 6;
        const endIdx = Math.min(startIdx + 6, tables.length);
        const pageTables = tables.slice(startIdx, endIdx);
        
        if (pageTables.length === 0) return;
        
        // Add section title
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(this.colors.primary[0], this.colors.primary[1], this.colors.primary[2]);
        const pageLabel = pageNum === 1 ? 'January - June' : 'July - December';
        pdf.text(`${title} (${pageLabel})`, this.pageOptions.margins.left, pdf.lastY + 5);
        pdf.setTextColor(this.colors.black[0], this.colors.black[1], this.colors.black[2]);
        pdf.setFontSize(this.pageOptions.fontSize);
        pdf.setFont("helvetica", "normal");
        pdf.lastY += 12;
        
        // Grid layout: 3 columns x 2 rows
        const COLS = 3;
        const ROWS = 2;
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const availableWidth = pdfWidth - this.pageOptions.margins.left - this.pageOptions.margins.right;
        const availableHeight = pdfHeight - pdf.lastY - this.pageOptions.margins.bottom;
        const colWidth = (availableWidth / COLS) - 4;
        const rowHeight = (availableHeight / ROWS) - 4;
        const startY = pdf.lastY;
        
        for (let i = 0; i < pageTables.length; i++) {
            const table = pageTables[i];
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            
            const xPos = this.pageOptions.margins.left + (col * (colWidth + 4));
            const yPos = startY + (row * (rowHeight + 4));
            
            // Month title
            pdf.setFontSize(8);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(this.colors.primary[0], this.colors.primary[1], this.colors.primary[2]);
            pdf.text(table.monthName || `Month ${startIdx + i + 1}`, xPos, yPos + 3);
            pdf.setTextColor(this.colors.black[0], this.colors.black[1], this.colors.black[2]);
            
            if (table.isEmpty) {
                pdf.setFontSize(6);
                pdf.setFont("helvetica", "italic");
                pdf.text("No data", xPos, yPos + 10);
                continue;
            }
            
            // Calculate layout for up to 4 performers (2x2 mini-grid within each month cell)
            const performerWidth = (colWidth - 2) / 2;
            const performerHeight = (rowHeight - 8) / 2;
            
            for (let p = 0; p < Math.min(table.performers.length, 4); p++) {
                const performer = table.performers[p];
                const pCol = p % 2;
                const pRow = Math.floor(p / 2);
                
                const pxPos = xPos + (pCol * (performerWidth + 2));
                const pyPos = yPos + 6 + (pRow * (performerHeight + 1));
                
                // Rank colors: gold, silver, bronze, copper
                const rankColors = [
                    [255, 223, 128], // Gold
                    [192, 192, 192], // Silver
                    [205, 127, 50],  // Bronze
                    [184, 115, 51]   // Copper
                ];
                const rankColor = rankColors[p] || rankColors[3];
                
                // Performer header with rank indicator
                pdf.setFillColor(rankColor[0], rankColor[1], rankColor[2]);
                pdf.rect(pxPos, pyPos, 3, 2.5, 'F');
                
                pdf.setFontSize(5);
                pdf.setFont("helvetica", "bold");
                const personLabel = `${performer.rankLabel}: ${performer.person}`;
                pdf.text(personLabel, pxPos + 4, pyPos + 2);
                
                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(4.5);
                const dateLabel = performer.dateInfo || '';
                pdf.text(dateLabel, pxPos + 4, pyPos + 5);
                
                // Build table body - show top folders that fit
                const maxRows = Math.min(performer.folderRows.length, 5); // Max 5 folders
                const tableBody = [];
                for (let f = 0; f < maxRows; f++) {
                    const fr = performer.folderRows[f];
                    tableBody.push([fr.folder, fr.count]);
                }
                // Add total row
                tableBody.push(['Total', performer.total]);
                
                // Render mini table
                autoTableFunc.call(pdf, {
                    startY: pyPos + 7,
                    head: [['Folder', 'Count']],
                    body: tableBody,
                    theme: 'grid',
                    styles: {
                        fontSize: 4.5,
                        cellPadding: 0.3,
                        overflow: 'ellipsize',
                        lineColor: this.colors.mediumGrey,
                        lineWidth: 0.1
                    },
                    headStyles: {
                        fillColor: this.colors.primary,
                        textColor: this.colors.white,
                        fontSize: 4.5,
                        fontStyle: 'bold',
                        halign: 'center'
                    },
                    columnStyles: {
                        0: { cellWidth: performerWidth * 0.65, halign: 'left', overflow: 'ellipsize' },
                        1: { cellWidth: performerWidth * 0.30, halign: 'right' }
                    },
                    tableWidth: performerWidth - 1,
                    margin: { left: pxPos, right: pdfWidth - pxPos - performerWidth + 1 },
                    didParseCell: (data) => {
                        if (data.row.raw?.[0]?.toString().toLowerCase() === 'total' && data.section === 'body') {
                            data.cell.styles.fontStyle = 'bold';
                            data.cell.styles.fillColor = [230, 230, 230];
                        }
                    }
                });
            }
        }
        
        pdf.lastY = startY + availableHeight;
    }
    
    /**
     * Prepares monthly breakdown tables showing folders in rows and months in columns
     * @param {Object} yearlyData - The yearly report data
     * @returns {Array} Array of table data objects
     */
    _prepareMonthlyBreakdownTables(yearlyData) {
        const { yearlyData: data, folders, persons } = yearlyData;
        const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const tables = [];
        
        // Create one table per person
        persons.forEach(person => {
            const personData = data[person];
            if (!personData) return; // Skip if no data for this person
            
            // Create header row: Folder | Jan | Feb | ... | Dec | Total
            const headerRow = ["Folder", ...MONTH_NAMES_SHORT, "Total"];
            
            // Create body rows - one row per folder
            const bodyRows = [];
            const columnTotals = new Array(13).fill(0); // 12 months + 1 total
            
            folders.forEach(folder => {
                const folderData = personData[folder] || {};
                
                const row = [folder];
                let rowTotal = 0;
                
                // Add data for each month (1-12)
                for (let month = 1; month <= 12; month++) {
                    const monthValue = folderData[month] || 0;
                    row.push(monthValue);
                    columnTotals[month - 1] += monthValue;
                    rowTotal += monthValue;
                }
                
                row.push(rowTotal);
                columnTotals[12] += rowTotal;
                bodyRows.push(row);
            });
            
            // Add total row
            const totalRow = ["Total", ...columnTotals];
            bodyRows.push(totalRow);
            
            tables.push({
                head: [headerRow],
                body: bodyRows,
                title: `${person} - Monthly Breakdown`
            });
        });
        
        return tables;
    }

    /**
     * Adds the executive summary cover page for yearly reports
     * @param {Object} pdf - The PDF document
     * @param {Object} yearlyData - The yearly report data
     * @param {Object} reportData - The full report data object
     * @param {Function} autoTableFunc - The autoTable function
     */
    async _addYearlyCoverPage(pdf, yearlyData, reportData, autoTableFunc) {
        const { yearlyData: data, folders, persons, completeGrandTotal, completeFolderTotals } = yearlyData;
        const year = reportData.reportYear || yearlyData.year || new Date().getFullYear();
        
        const BATCH_FOLDERS = new Set(["Personals", "Police", "Completed ROI Requests", "Personals Batch", "Police Batch"]);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const centerX = pdfWidth / 2;
        const leftMargin = this.pageOptions.margins.left;
        const rightMargin = this.pageOptions.margins.right;
        const contentWidth = pdfWidth - leftMargin - rightMargin;
        
        // Calculate key statistics
        let totalExclBatches = 0;
        let busiestMonth = { month: '', total: 0 };
        const monthTotals = {};
        const personTotalsExclBatches = {};
        
        persons.forEach(person => {
            let personTotal = 0;
            folders.forEach(folder => {
                if (!BATCH_FOLDERS.has(folder)) {
                    const folderTotal = data[person]?.[folder]?.total || 0;
                    personTotal += folderTotal;
                    
                    // Sum monthly totals
                    for (let m = 1; m <= 12; m++) {
                        const monthVal = data[person]?.[folder]?.[m] || 0;
                        monthTotals[m] = (monthTotals[m] || 0) + monthVal;
                    }
                }
            });
            personTotalsExclBatches[person] = personTotal;
            totalExclBatches += personTotal;
        });
        
        // Find busiest month
        const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 
                             'July', 'August', 'September', 'October', 'November', 'December'];
        Object.entries(monthTotals).forEach(([month, total]) => {
            if (total > busiestMonth.total) {
                busiestMonth = { month: MONTH_NAMES[parseInt(month) - 1], total };
            }
        });
        
        // Get top 5 performers (by excl batches)
        const sortedPersons = Object.entries(personTotalsExclBatches)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        // === HEADER SECTION ===
        pdf.setFontSize(22);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(this.colors.primary[0], this.colors.primary[1], this.colors.primary[2]);
        pdf.text(`${year} Annual Performance Report`, centerX, pdf.lastY + 12, { align: 'center' });
        
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Customer Administration Unit`, centerX, pdf.lastY + 20, { align: 'center' });
        
        pdf.lastY += 30;
        
        // === TWO COLUMN LAYOUT ===
        const colGap = 10;
        const leftColWidth = (contentWidth - colGap) * 0.45;
        const rightColWidth = (contentWidth - colGap) * 0.55;
        const leftColX = leftMargin;
        const rightColX = leftMargin + leftColWidth + colGap;
        
        // === LEFT COLUMN: Key Statistics ===
        let leftY = pdf.lastY;
        
        // Stats header
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(this.colors.primary[0], this.colors.primary[1], this.colors.primary[2]);
        pdf.text(`Key Statistics`, leftColX, leftY);
        leftY += 8;
        
        // Stats box
        pdf.setFillColor(248, 249, 252);
        pdf.setDrawColor(220, 220, 230);
        pdf.roundedRect(leftColX, leftY, leftColWidth, 60, 2, 2, 'FD');
        
        // Team Size = total people (from data), Current Team = people in this report
        const totalTeamSize = reportData.totalTeamSize || persons.length;
        const currentTeamMembers = reportData.currentTeamMembers || persons.length;
        
        const statsData = [
            ['Team Size', `${totalTeamSize} people`],
            ['Current Team Members', `${currentTeamMembers} people`],
            ['Total Items Processed', (completeGrandTotal || 0).toLocaleString()],
            ['Total (Excl. Batches)', totalExclBatches.toLocaleString()],
            ['Busiest Month', `${busiestMonth.month}`]
        ];
        
        let statY = leftY + 10;
        pdf.setFontSize(9);
        statsData.forEach(([label, value]) => {
            pdf.setFont("helvetica", "normal");
            pdf.setTextColor(80, 80, 80);
            pdf.text(label + ':', leftColX + 5, statY);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(40, 40, 40);
            pdf.text(value, leftColX + leftColWidth - 5, statY, { align: 'right' });
            statY += 10;
        });
        
        leftY += 70;
        
        // === LEGEND (below stats on left) ===
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(this.colors.primary[0], this.colors.primary[1], this.colors.primary[2]);
        pdf.text(`Color Legend`, leftColX, leftY);
        leftY += 7;
        
        pdf.setFillColor(248, 249, 252);
        pdf.setDrawColor(220, 220, 230);
        pdf.roundedRect(leftColX, leftY, leftColWidth, 32, 2, 2, 'FD');
        
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(60, 60, 60);
        
        // Days Worked - light blue
        pdf.setFillColor(173, 216, 230);
        pdf.rect(leftColX + 5, leftY + 5, 10, 6, 'F');
        pdf.text(`Days Worked`, leftColX + 18, leftY + 9.5);
        
        // Excl Batches - light green
        pdf.setFillColor(200, 230, 200);
        pdf.rect(leftColX + 5, leftY + 14, 10, 6, 'F');
        pdf.text(`Total (Excl. Batches)`, leftColX + 18, leftY + 18.5);
        
        // Highest % - gold
        pdf.setFillColor(255, 223, 128);
        pdf.rect(leftColX + 5, leftY + 23, 10, 6, 'F');
        pdf.text(`Highest % for Folder (Team-wide)`, leftColX + 18, leftY + 27.5);
        
        // === RIGHT COLUMN: Top Performers ===
        let rightY = pdf.lastY;
        
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(this.colors.primary[0], this.colors.primary[1], this.colors.primary[2]);
        pdf.text(`Top 5 Performers`, rightColX, rightY);
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(100, 100, 100);
        pdf.text(`(Excluding Batch Work)`, rightColX + 52, rightY);
        rightY += 5;
        
        // Top performers table
        const top5Body = sortedPersons.map(([name, total], idx) => {
            const pct = totalExclBatches > 0 ? ((total / totalExclBatches) * 100).toFixed(1) + '%' : '0%';
            return [`${idx + 1}`, name, total.toLocaleString(), pct];
        });
        
        autoTableFunc.call(pdf, {
            startY: rightY,
            head: [['#', 'Name', 'Total', '% of Team']],
            body: top5Body,
            theme: 'striped',
            styles: {
                fontSize: 9,
                cellPadding: 2.5,
                halign: 'center'
            },
            headStyles: {
                fillColor: this.colors.primary,
                textColor: this.colors.white,
                fontStyle: 'bold',
                fontSize: 9
            },
            columnStyles: {
                0: { cellWidth: 12 },
                1: { cellWidth: rightColWidth * 0.45, halign: 'left' },
                2: { cellWidth: rightColWidth * 0.25 },
                3: { cellWidth: rightColWidth * 0.20 }
            },
            tableWidth: rightColWidth,
            margin: { left: rightColX }
        });
        
        // Track where top performers table ends
        const tableEndY = pdf.lastAutoTable?.finalY || rightY + 60;
        
        // === REPORT CONTENTS SECTION ===
        const contentsY = Math.max(leftY + 42, tableEndY + 10);
        
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(this.colors.primary[0], this.colors.primary[1], this.colors.primary[2]);
        pdf.text(`Report Contents`, leftColX, contentsY);
        
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(60, 60, 60);
        
        // Build dynamic page numbers based on structure
        let pageNum = 2;
        const contents = [];
        contents.push(`Page ${pageNum++}: Top Performers - Totals & Team Contribution %`);
        contents.push(`Page ${pageNum++}: Remaining Team - Totals & Team Contribution %`);
        contents.push(`Pages ${pageNum}-${pageNum+1}: Best Individual Daily Performance`);
        pageNum += 2;
        contents.push(`Pages ${pageNum}-${pageNum+1}: Best Individual Weekly Performance`);
        pageNum += 2;
        contents.push(`Pages ${pageNum}-${pageNum+1}: Best Individual Monthly Performance`);
        pageNum += 2;
        
        if (persons.length > 0 && reportData.includeMonthlyBreakdowns !== false) {
            contents.push(`Pages ${pageNum}+: Individual Monthly Breakdowns (${persons.length} people)`);
        }
        
        let contY = contentsY + 6;
        contents.forEach(item => {
            pdf.text(`• ${item}`, leftColX + 3, contY);
            contY += 5;
        });
        
        pdf.lastY = contY + 5;
    }

    /**
     * Adds two compact tables stacked vertically on one page
     * @param {Object} pdf - The PDF document
     * @param {Object} numbersTable - The numbers table data
     * @param {Object} percentageTable - The percentage table data
     * @param {Function} autoTableFunc - The autoTable function
     */
    async _addCompactTablePair(pdf, numbersTable, percentageTable, autoTableFunc) {
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const availableHeight = pdfHeight - pdf.lastY - this.pageOptions.margins.bottom - 10;
        const tableHeight = availableHeight / 2 - 8; // Split in half with gap
        
        // Compact font size for stacked tables
        const compactFontSize = 5.5;
        const compactHeadFontSize = 5.5;
        const compactCellPadding = { top: 0.5, right: 0.3, bottom: 0.5, left: 0.3 };
        
        // Calculate column widths
        const personCount = numbersTable.personCount || 10;
        const availableWidth = pdf.internal.pageSize.getWidth() - this.pageOptions.margins.left - this.pageOptions.margins.right;
        const folderColWidth = 32;
        const teamTotalColWidth = 18;
        const remainingWidth = availableWidth - folderColWidth - teamTotalColWidth;
        const personColWidth = Math.min(remainingWidth / personCount, 20);
        
        const columnStyles = {
            0: { cellWidth: folderColWidth, halign: 'left', overflow: 'ellipsize' }
        };
        for (let i = 1; i <= personCount; i++) {
            columnStyles[i] = { cellWidth: personColWidth, halign: 'center' };
        }
        columnStyles[personCount + 1] = { cellWidth: teamTotalColWidth, halign: 'center' };
        
        // --- Numbers Table ---
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(this.colors.primary[0], this.colors.primary[1], this.colors.primary[2]);
        pdf.text(numbersTable.title, this.pageOptions.margins.left, pdf.lastY + 4);
        pdf.setTextColor(this.colors.black[0], this.colors.black[1], this.colors.black[2]);
        pdf.lastY += 6;
        
        autoTableFunc.call(pdf, {
            startY: pdf.lastY,
            head: numbersTable.head,
            body: numbersTable.body,
            theme: 'grid',
            styles: {
                fontSize: compactFontSize,
                cellPadding: compactCellPadding,
                overflow: 'ellipsize',
                lineColor: this.colors.mediumGrey,
                lineWidth: 0.1,
                minCellWidth: 5
            },
            headStyles: {
                fillColor: this.colors.primary,
                textColor: this.colors.white,
                fontSize: compactHeadFontSize,
                fontStyle: 'bold',
                halign: 'center',
                cellPadding: compactCellPadding,
                overflow: 'ellipsize',
                minCellHeight: 6
            },
            alternateRowStyles: { fillColor: this.colors.lightGrey },
            columnStyles: columnStyles,
            didParseCell: (data) => {
                if (data.row.raw?.[0]?.toString().toLowerCase() === 'total' && data.section === 'body') {
                    data.cell.styles.fontStyle = 'bold';
                }
                if (numbersTable.hasTotalExclBatchesRow && data.row.raw?.[0]?.toString() === 'Total (Excl. Batches)' && data.section === 'body') {
                    data.cell.styles.fillColor = [200, 230, 200];
                    data.cell.styles.fontStyle = 'bold';
                }
                if (numbersTable.hasDaysWorkedRow && data.row.raw?.[0]?.toString() === 'Days Worked' && data.section === 'body') {
                    data.cell.styles.fillColor = [173, 216, 230];
                    data.cell.styles.fontStyle = 'bold';
                }
                if (data.column.index > 0 && data.section === 'body') {
                    data.cell.styles.halign = 'center';
                }
                // Last column styling
                if (data.column.index === data.table.columns.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                    if (data.section === 'head') {
                        data.cell.styles.fillColor = [0, 71, 122];
                    }
                }
            },
            tableWidth: availableWidth,
            margin: { left: this.pageOptions.margins.left, right: this.pageOptions.margins.right }
        });
        
        pdf.lastY = pdf.lastAutoTable?.finalY + 8 || pdf.lastY + tableHeight + 8;
        
        // --- Percentage Table ---
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(this.colors.primary[0], this.colors.primary[1], this.colors.primary[2]);
        pdf.text(percentageTable.title, this.pageOptions.margins.left, pdf.lastY + 4);
        pdf.setTextColor(this.colors.black[0], this.colors.black[1], this.colors.black[2]);
        pdf.lastY += 6;
        
        autoTableFunc.call(pdf, {
            startY: pdf.lastY,
            head: percentageTable.head,
            body: percentageTable.body,
            theme: 'grid',
            styles: {
                fontSize: compactFontSize,
                cellPadding: compactCellPadding,
                overflow: 'ellipsize',
                lineColor: this.colors.mediumGrey,
                lineWidth: 0.1,
                minCellWidth: 5
            },
            headStyles: {
                fillColor: this.colors.primary,
                textColor: this.colors.white,
                fontSize: compactHeadFontSize,
                fontStyle: 'bold',
                halign: 'center',
                cellPadding: compactCellPadding,
                overflow: 'ellipsize',
                minCellHeight: 6
            },
            alternateRowStyles: { fillColor: this.colors.lightGrey },
            columnStyles: columnStyles,
            didParseCell: (data) => {
                if (data.row.raw?.[0]?.toString().toLowerCase() === 'total' && data.section === 'body') {
                    data.cell.styles.fontStyle = 'bold';
                }
                if (percentageTable.hasTotalExclBatchesRow && data.row.raw?.[0]?.toString() === 'Total (Excl. Batches)' && data.section === 'body') {
                    data.cell.styles.fillColor = [200, 230, 200];
                    data.cell.styles.fontStyle = 'bold';
                }
                if (percentageTable.hasDaysWorkedRow && data.row.raw?.[0]?.toString() === 'Days Worked' && data.section === 'body') {
                    data.cell.styles.fillColor = [173, 216, 230];
                    data.cell.styles.fontStyle = 'bold';
                }
                // Highlight highest percentage cells (team-wide)
                if (percentageTable.highestPercentColumns && data.section === 'body') {
                    const rowIdx = data.row.index;
                    const colIdx = data.column.index;
                    if (percentageTable.highestPercentColumns[rowIdx] === colIdx) {
                        data.cell.styles.fillColor = [255, 223, 128];
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
                if (data.column.index > 0 && data.section === 'body') {
                    data.cell.styles.halign = 'center';
                }
                // Last column styling
                if (data.column.index === data.table.columns.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                    if (data.section === 'head') {
                        data.cell.styles.fillColor = [0, 71, 122];
                    }
                }
            },
            tableWidth: availableWidth,
            margin: { left: this.pageOptions.margins.left, right: this.pageOptions.margins.right }
        });
    }

    /**
     * Consolidates multiple detailed tables into a single table with dates as columns.
     * @param {Array} tables - Array of table objects, each with title, date, head and body.
     * @returns {Object} A single table object with head and body.
     */
    _consolidateDetailedTables(tables) {
        if (!tables || tables.length === 0) {
            console.warn("ReportGenerator: No tables to consolidate.");
            return { head: [['No Data']], body: [] };
        }
        
        // Extract all unique folder names
        const folderSet = new Set();
        tables.forEach(table => {
            // Each table body has folder names in the first column
            // Skip the last row which is usually the "Total" row
            for (let i = 0; i < table.body.length - 1; i++) {
                if (table.body[i][0] && table.body[i][0] !== 'Total') {
                    folderSet.add(table.body[i][0]);
                }
            }
        });
        
        // Sort the folder names according to FOLDER_ORDER
        const sortedFolders = Array.from(folderSet).sort((a, b) => {
            const indexA = FOLDER_ORDER.indexOf(a);
            const indexB = FOLDER_ORDER.indexOf(b);
            
            if (indexA !== -1 && indexB !== -1) {
                return indexA - indexB; // Both in the order array, sort by position
            }
            if (indexA !== -1) {
                return -1; // Only a is in the order array, a comes first
            }
            if (indexB !== -1) {
                return 1; // Only b is in the order array, b comes first
            }
            return a.localeCompare(b); // Neither in the order array, alphabetical
        });
        
        // Create the header row: "Folder" followed by all formatted date headers, and "Total" at the end
        const headerRow = ["Folder"];
        tables.forEach(table => {
            // Format the date in DDMMM format
            const formattedDate = this._formatTableDateToDDMMM(table);
            headerRow.push(formattedDate);
        });
        headerRow.push("Total"); // Add Total column header
        
        // Create the body rows
        const bodyRows = [];
        
        // Add a row for each folder
        sortedFolders.forEach(folder => {
            const row = [folder]; // First cell is the folder name
            let folderTotal = 0; // Initialize total for this folder
            
            // Add the count for each date (table)
            tables.forEach(table => {
                let foundCount = 0;
                // Find the folder in this table's body
                for (let i = 0; i < table.body.length; i++) {
                    if (table.body[i][0] === folder) {
                        foundCount = parseInt(table.body[i][1]) || 0; // Convert to number, default to 0
                        break;
                    }
                }
                row.push(foundCount);
                folderTotal += foundCount; // Add to folder total
            });
            
            // Add the total for this folder as the last column
            row.push(folderTotal);
            
            bodyRows.push(row);
        });
        
        // Add a "Total" row
        const totalRow = ["Total"];
        const columnTotals = new Array(tables.length + 1).fill(0); // +1 for the grand total column
        
        // Calculate column totals
        bodyRows.forEach(row => {
            // Start from index 1 to skip the folder name column
            for (let i = 1; i < row.length; i++) {
                columnTotals[i-1] += parseInt(row[i]) || 0;
            }
        });
        
        // Add the column totals to the total row
        totalRow.push(...columnTotals);
        
        bodyRows.push(totalRow);
        
        return { head: [headerRow], body: bodyRows };
    }

    /**
     * Adds the header section (logo, title, subtitle) to the current PDF page.
     * @param {object} pdf - The jsPDF document instance.
     * @param {string} title - The title for this specific page/section.
     * @param {string} subtitle - Optional subtitle (used for daily reports).
     */
    _addHeader(pdf, title, subtitle = null) {
        const { margins } = this.pageOptions;
        const pageWidth = pdf.internal.pageSize.getWidth();
        const headerStartY = 5;
        pdf.lastY = headerStartY;
        
        // Logo
        const logoHeight = 12;
        const logoX = margins.left;
        let logoWidth = 40;
        
        if (this.branding.logoDataUrl) {
            try {
                const imgProps = pdf.getImageProperties(this.branding.logoDataUrl);
                logoWidth = (imgProps.width / imgProps.height) * logoHeight;
                pdf.addImage(this.branding.logoDataUrl, 'PNG', logoX, pdf.lastY, logoWidth, logoHeight);
            } catch (error) {
                console.error("ReportGenerator: Error adding logo:", error);
                pdf.setTextColor(this.colors.secondary[0], this.colors.secondary[1], this.colors.secondary[2]);
                pdf.text("[Logo Error]", logoX + logoWidth / 2, pdf.lastY + logoHeight / 2, { align: 'center', baseline: 'middle'});
                pdf.setTextColor(this.colors.black[0], this.colors.black[1], this.colors.black[2]);
            }
        } else {
            console.warn("ReportGenerator: No logo data URL provided.");
        }
        
        // Title
        const titleCenterX = pageWidth / 2;
        const titleY = pdf.lastY + (logoHeight / 2) - 2;
        pdf.setTextColor(this.colors.primary[0], this.colors.primary[1], this.colors.primary[2]);
        pdf.setFontSize(14);
        pdf.setFont("helvetica", "bold");
        pdf.text(title, titleCenterX, titleY, { align: 'center', baseline: 'middle' });
        
        // Subtitle (used for daily reports)
        let teamNameY = titleY + 5;
        if (subtitle) {
            const subtitleY = titleY + 5;
            pdf.setTextColor(this.colors.secondary[0], this.colors.secondary[1], this.colors.secondary[2]);
            pdf.setFontSize(11);
            pdf.setFont("helvetica", "normal");
            pdf.text(subtitle, titleCenterX, subtitleY, { align: 'center', baseline: 'middle' });
            
            teamNameY = subtitleY + 5; // Adjust team name position
        }
        
        // Team Name
        pdf.setTextColor(this.colors.darkGrey[0], this.colors.darkGrey[1], this.colors.darkGrey[2]);
        pdf.setFontSize(9);
        pdf.setFont("helvetica", "normal");
        pdf.text(this.branding.teamName, titleCenterX, teamNameY, { align: 'center', baseline: 'middle' });
        
        // Reset to base
        pdf.lastY = headerStartY + logoHeight + 3;
        if (subtitle) pdf.lastY += 5; // Add more space if subtitle is present
        
        pdf.setTextColor(this.colors.black[0], this.colors.black[1], this.colors.black[2]);
        pdf.setFontSize(this.pageOptions.fontSize);
        pdf.setFont("helvetica", "normal");
    }

    /**
     * Adds a data table section to the PDF with an optional title.
     * @param {object} pdf - The jsPDF document instance.
     * @param {object} tableData - Table data { head: [[]], body: [[]] }.
     * @param {function} autoTableFunc - The AutoTable function to use.
     * @param {string} [tableTitle] - Optional title to display above the table.
     */
    async _addMainTableSection(pdf, tableData, autoTableFunc, tableTitle = null) {
        if (typeof autoTableFunc !== 'function') { console.error("ReportGenerator: AutoTable function is invalid."); pdf.text("Error: Table generation library missing.", this.pageOptions.margins.left, pdf.lastY + 5); pdf.lastY += 10; return; }
        if (!tableData?.head || !tableData?.body || !Array.isArray(tableData.head) || !Array.isArray(tableData.body)) { console.warn("ReportGenerator: Invalid or missing table data (head/body). Skipping table:", tableTitle); if (tableTitle) { pdf.setFont("helvetica", "italic"); pdf.setFontSize(8); pdf.text(`(${tableTitle}: No data available)`, this.pageOptions.margins.left, pdf.lastY + 5); pdf.setFont("helvetica", "normal"); pdf.setFontSize(this.pageOptions.fontSize); pdf.lastY += 10; } return; }
        const finalHead = Array.isArray(tableData.head[0]) ? tableData.head : [tableData.head];
        let titleHeight = 0; if (tableTitle) { pdf.setFontSize(10); pdf.setFont("helvetica", "bold"); pdf.setTextColor(this.colors.primary[0], this.colors.primary[1], this.colors.primary[2]); pdf.text(tableTitle, this.pageOptions.margins.left, pdf.lastY + 5); pdf.setTextColor(this.colors.black[0], this.colors.black[1], this.colors.black[2]); pdf.setFontSize(this.pageOptions.fontSize); pdf.setFont("helvetica", "normal"); titleHeight = 8; pdf.lastY += titleHeight; }
        
        // Determine column styles based on table type
        let columnStyles = { 0: { cellWidth: 'wrap', fontStyle: 'bold', halign: 'left' } };
        
        // Calculate font sizes based on number of columns for yearly summary
        let bodyFontSize = 7;
        let headFontSize = 7.5;
        let cellPad = 1;
        
        if (tableTitle === 'Queue Performance Summary') {
            columnStyles = { 0: { cellWidth: 'wrap', fontStyle: 'bold', halign: 'left' }, 1: { cellWidth: 'auto', halign: 'right' } };
        } else if (tableData.isYearlySummary && tableData.personCount) {
            // Adaptive sizing based on number of people
            const personCount = tableData.personCount;
            if (personCount > 30) {
                bodyFontSize = 5;
                headFontSize = 5;
                cellPad = 0.5;
            } else if (personCount > 20) {
                bodyFontSize = 5.5;
                headFontSize = 5.5;
                cellPad = 0.7;
            } else if (personCount > 10) {
                bodyFontSize = 6;
                headFontSize = 6;
                cellPad = 0.8;
            } else {
                bodyFontSize = 6.5;
                headFontSize = 6.5;
            }
            // First column (Folder) should be wider and left-aligned
            columnStyles = { 0: { cellWidth: 32, fontStyle: 'bold', halign: 'left', fontSize: bodyFontSize } };
        }
        
        try {
             autoTableFunc.call(pdf, {
                startY: pdf.lastY, 
                head: finalHead, 
                body: tableData.body, 
                theme: 'grid',
                styles: { 
                    fontSize: tableData.isYearlySummary ? bodyFontSize : 7, 
                    cellPadding: tableData.isYearlySummary ? cellPad : 1, 
                    overflow: 'ellipsize', // Use ellipsis instead of line break for yearly summary
                    lineColor: this.colors.mediumGrey, 
                    lineWidth: 0.1,
                    cellWidth: 'auto',
                    minCellWidth: tableData.isYearlySummary ? 6 : 10
                },
                headStyles: { 
                    fillColor: this.colors.primary, 
                    textColor: this.colors.white, 
                    fontSize: tableData.isYearlySummary ? headFontSize : 7.5, 
                    fontStyle: 'bold', 
                    halign: 'center', 
                    valign: 'middle', 
                    cellPadding: tableData.isYearlySummary ? { top: 0.8, right: 0.5, bottom: 0.8, left: 0.5 } : { top: 1.5, right: 1, bottom: 1.5, left: 1 },
                    overflow: 'ellipsize',
                    minCellHeight: tableData.isYearlySummary ? 8 : undefined
                },
                alternateRowStyles: { fillColor: this.colors.lightGrey },
                columnStyles: columnStyles,
                didParseCell: (data) => { 
                    if (data.row.raw?.[0]?.toString().toLowerCase() === 'total' && data.section === 'body') { 
                        data.cell.styles.fontStyle = 'bold'; 
                    }
                    // Light green styling for "Total (Excl. Batches)" row
                    if (tableData.hasTotalExclBatchesRow && data.row.raw?.[0]?.toString() === 'Total (Excl. Batches)' && data.section === 'body') {
                        data.cell.styles.fillColor = [200, 230, 200]; // Light green
                        data.cell.styles.fontStyle = 'bold';
                    }
                    // Light blue styling for "Days Worked" row (first data row)
                    if (tableData.hasDaysWorkedRow && data.row.raw?.[0]?.toString() === 'Days Worked' && data.section === 'body') {
                        data.cell.styles.fillColor = [173, 216, 230]; // Light blue
                        data.cell.styles.fontStyle = 'bold';
                    }
                    // Highlight highest percentage cell for each folder row in percentage tables
                    if (tableData.isPercentageTable && tableData.highestPercentColumns && data.section === 'body') {
                        const rowIdx = data.row.index;
                        const colIdx = data.column.index;
                        if (tableData.highestPercentColumns[rowIdx] === colIdx) {
                            data.cell.styles.fillColor = [255, 223, 128]; // Gold/yellow highlight
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                    if (tableTitle !== 'Queue Performance Summary' && data.column.index > 0 && data.section === 'body') { 
                        if (!isNaN(data.cell.raw) && data.cell.raw !== null && data.cell.raw !== '' && typeof data.cell.raw !== 'boolean') { 
                            data.cell.styles.halign = 'right'; 
                        } 
                    }
                    // For yearly summary, center-align all numeric data columns
                    if (tableData.isYearlySummary && data.column.index > 0 && data.section === 'body') {
                        data.cell.styles.halign = 'center';
                    }
                    // Highlight the total column (last column)
                    if (data.column.index === data.table.columns.length - 1) {
                        data.cell.styles.fontStyle = 'bold';
                        if (data.section === 'head') {
                            data.cell.styles.fillColor = [0, 71, 122]; // Darker blue for the total column header
                        } else if (data.section === 'body') {
                            // Special case for Days Worked row - keep light blue but slightly darker for team total
                            if (tableData.hasDaysWorkedRow && data.row.raw?.[0]?.toString() === 'Days Worked') {
                                data.cell.styles.fillColor = [135, 190, 210]; // Slightly darker light blue for team total
                            } else if (tableData.hasTotalExclBatchesRow && data.row.raw?.[0]?.toString() === 'Total (Excl. Batches)') {
                                data.cell.styles.fillColor = [160, 200, 160]; // Slightly darker light green for team total
                            } else {
                                // Fix: Handle non-array fillColor - ensure we're working with an array
                                if (!Array.isArray(data.cell.styles.fillColor)) {
                                    data.cell.styles.fillColor = [240, 240, 240]; // Default to light gray if not an array
                                } else {
                                    // Safely darken the existing color
                                    data.cell.styles.fillColor = [
                                        Math.max(0, data.cell.styles.fillColor[0] - 15),
                                        Math.max(0, data.cell.styles.fillColor[1] - 15),
                                        Math.max(0, data.cell.styles.fillColor[2] - 15)
                                    ];
                                }
                            }
                        }
                    }
                },
                didDrawPage: (hookData) => { /* Footer added globally */ },
                margin: { left: this.pageOptions.margins.left, right: this.pageOptions.margins.right }, 
                pageBreak: 'auto', 
                rowPageBreak: 'auto', 
                // Scale to fit page width
                tableWidth: pdf.internal.pageSize.getWidth() - this.pageOptions.margins.left - this.pageOptions.margins.right,
            });
             if (pdf.lastAutoTable && pdf.lastAutoTable.finalY) { pdf.lastY = pdf.lastAutoTable.finalY + 5; } else { pdf.lastY += 10; }
        } catch (autoTableError) { 
            console.error(`ReportGenerator: Error during autoTable generation for "${tableTitle || 'Unknown Table'}":`, autoTableError); 
            pdf.setTextColor(255, 0, 0); 
            pdf.text(`Error generating table (${tableTitle || ''}): ${autoTableError.message}`, this.pageOptions.margins.left, pdf.lastY + 5); 
            pdf.setTextColor(0, 0, 0); 
            pdf.lastY += 15; 
        }
    }

    /**
     * Adds the CUSTOM footer text to all pages of the PDF.
     * @param {object} pdf - The jsPDF document instance.
     */
     _addFooter(pdf) {
         try { const pageCount = pdf.internal.getNumberOfPages(); const pageHeight = pdf.internal.pageSize.getHeight(); const pageWidth = pdf.internal.pageSize.getWidth(); const footerY = pageHeight - (this.pageOptions.margins.bottom / 2) - 2; const customFooterText = "Generated by Objective Data Extraction Tool - Developed for Transport for NSW by Zak Masters 2025"; for (let i = 1; i <= pageCount; i++) { pdf.setPage(i); pdf.setTextColor(this.colors.darkGrey[0], this.colors.darkGrey[1], this.colors.darkGrey[2]); pdf.setFontSize(8); pdf.setFont("helvetica", "italic"); pdf.text(customFooterText, pageWidth / 2, footerY, { align: 'center' }); } pdf.setFontSize(this.pageOptions.fontSize); pdf.setFont("helvetica", "normal"); } catch(e) { console.error("Error adding footer:", e); }
     }

} // End ReportGenerator Class

export default ReportGenerator;