// TEST/scripts/report-generator.js
// report-generator.js (v1.54 - Collated Detailed Reports)
'use strict';
console.log("report-generator.js loaded (v1.54 - Collated Detailed Reports)");

// Import dependencies
import { StorageManager } from './storage-manager.js';
import { holidayService } from './holiday-service.js';
import { ErrorManager, SEVERITY, CATEGORY } from './enhanced-error-manager.js';
import { validateReportOptions } from './config-validator.js';
// Import time formatter and queue data key
import { getWeekNumber, safeCsvCell, formatMillisecondsToMMSS } from './utils.js';
// Import relevant storage keys and folder order
import { STORAGE_KEY_DATA, STORAGE_KEY_QUEUE_DATA, FOLDER_ORDER } from './constants.js';

// Constants
const browserAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
const MONTH_NAMES_SHORT = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES_FULL = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// --- Helper Functions (Mostly Unchanged) ---
function _getDatesInMonth(year, month) { const dates = []; const date = new Date(Date.UTC(year, month - 1, 1)); while (date.getUTCMonth() === month - 1) { dates.push(date.toISOString().slice(0, 10)); date.setUTCDate(date.getUTCDate() + 1); } return dates; }
function _getLastDayOfMonth(year, month) { const lastDayDate = new Date(Date.UTC(year, month, 0)); return lastDayDate.toISOString().slice(0, 10); }
async function _findNextWorkdayInMonth(startDateStr, year, month) { if (!holidayService.isInitialized) await holidayService.initialize(); const holidays = new Set(await holidayService.getHolidays()); let currentDate = new Date(`${startDateStr}T00:00:00Z`); currentDate.setUTCDate(currentDate.getUTCDate() + 1); while (currentDate.getUTCMonth() === month - 1 && currentDate.getUTCFullYear() === year) { const dayOfWeek = currentDate.getUTCDay(); const dateStr = currentDate.toISOString().slice(0, 10); if (dayOfWeek >= 1 && dayOfWeek <= 5) { if (!holidays.has(dateStr)) { return dateStr; } } currentDate.setUTCDate(currentDate.getUTCDate() + 1); } return null; }
async function _getLastWorkdayOfMonth(year, month) { if (!holidayService.isInitialized) await holidayService.initialize(); const holidays = new Set(await holidayService.getHolidays()); const lastDayOfMonth = _getLastDayOfMonth(year, month); let currentDate = new Date(`${lastDayOfMonth}T00:00:00Z`); while (currentDate.getUTCMonth() === month - 1) { const dayOfWeek = currentDate.getUTCDay(); const dateStr = currentDate.toISOString().slice(0, 10); if (dayOfWeek >= 1 && dayOfWeek <= 5) { if (!holidays.has(dateStr)) { return dateStr; } } if (currentDate.getUTCDate() > 1) { currentDate.setUTCDate(currentDate.getUTCDate() - 1); } else { break; } } console.warn(`Could not find last workday for ${year}-${month}, returning last calendar day: ${lastDayOfMonth}`); return lastDayOfMonth; }
async function filterWorkdays(dates) { if (!dates || dates.length === 0) return []; if (!holidayService.isInitialized) await holidayService.initialize(); try { const holidaysArray = await holidayService.getHolidays(); const holidays = new Set(holidaysArray); return dates.filter(dateStr => { if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false; const date = new Date(`${dateStr}T00:00:00Z`); const dayOfWeek = date.getUTCDay(); const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; const isHoliday = holidays.has(dateStr); return !isWeekend && !isHoliday; }); } catch (error) { console.error("Error filtering workdays:", error); ErrorManager.logError('Workday Filtering Error', { context: 'filterWorkdays', error: error.message }, SEVERITY.ERROR, CATEGORY.REPORTING); return dates.filter(dateStr => { if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false; const date = new Date(`${dateStr}T00:00:00Z`); const dayOfWeek = date.getUTCDay(); return dayOfWeek !== 0 && dayOfWeek !== 6; }); } }
function _formatDateDDMon(dateString) { try { if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return '?? ???'; const date = new Date(`${dateString}T00:00:00Z`); const day = String(date.getUTCDate()).padStart(2, '0'); const monthIndex = date.getUTCMonth(); return `${day} ${MONTH_NAMES_SHORT[monthIndex + 1]}`; } catch (e) { console.error("Error formatting date DD Mon:", dateString, e); return '?? ???'; } }
async function _preprocessAndShiftData(activityDataForMonth, year, month) { console.log(`_preprocessAndShiftData: START for ${year}-${month}`); if (!activityDataForMonth || Object.keys(activityDataForMonth).length === 0) { console.log("_preprocessAndShiftData: Input data is empty."); return {}; } const processedData = {}; const holidays = new Set(await holidayService.getHolidays()); const lastDayStr = _getLastDayOfMonth(year, month); const lastWorkdayStr = await _getLastWorkdayOfMonth(year, month); const nextWorkdayCache = {}; for (const folderDisplayName in activityDataForMonth) { const countsForFolder = activityDataForMonth[folderDisplayName]; if (!countsForFolder || typeof countsForFolder !== 'object') continue; const folderKeyForOutput = folderDisplayName; if (!processedData[folderKeyForOutput]) { processedData[folderKeyForOutput] = {}; } for (const dateStr in countsForFolder) { const count = parseInt(countsForFolder[dateStr], 10); if (isNaN(count) || count <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue; let targetDateStr = dateStr; const entryDate = new Date(`${dateStr}T00:00:00Z`); const entryYear = entryDate.getUTCFullYear(); const entryMonth = entryDate.getUTCMonth() + 1; if (entryYear !== year || entryMonth !== month) { targetDateStr = lastDayStr; console.log(`_preprocessAndShiftData: Rolling back future date ${dateStr} (count ${count}) for ${folderKeyForOutput} to ${targetDateStr}`); } else { const dayOfWeek = entryDate.getUTCDay(); const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; const isHoliday = holidays.has(dateStr); if (isWeekend || isHoliday) { let nextWorkday = nextWorkdayCache[dateStr]; if (nextWorkday === undefined) { nextWorkday = await _findNextWorkdayInMonth(dateStr, year, month); nextWorkdayCache[dateStr] = nextWorkday; } targetDateStr = nextWorkday || lastWorkdayStr; if (!nextWorkday) console.warn(`_preprocessAndShiftData: No next workday for ${dateStr}. Shifting count ${count} for ${folderKeyForOutput} to last workday: ${targetDateStr}`); } } processedData[folderKeyForOutput][targetDateStr] = (processedData[folderKeyForOutput][targetDateStr] || 0) + count; } } console.log(`_preprocessAndShiftData: END for ${year}-${month}`); return processedData; }

/**
 * Prepares data for daily reports in a single collated PDF
 * @param {Object} data - The processed folder data
 * @param {Object} options - Options including reportYear, reportMonth, and report settings
 * @returns {Object} Object containing data for detailed reports
 */
async function _prepareDetailedReportData(data, options) {
  console.log(`--- _prepareDetailedReportData START for ${options.reportYear}-${options.reportMonth} ---`);
  const { reportYear, reportMonth, detailedReportType, selectedWeek } = options;
  
  // Get all days in the month
  let allDatesInMonth = _getDatesInMonth(reportYear, reportMonth);
  let workdaysInMonth = [];
  
  try {
    workdaysInMonth = await filterWorkdays(allDatesInMonth);
    workdaysInMonth.sort(); // Ensure dates are in order
  } catch (error) {
    console.error("Error getting workdays for detailed reports:", error);
    ErrorManager.logError('Get Workdays Error', { context: '_prepareDetailedReportData', error: error.message }, SEVERITY.ERROR, CATEGORY.REPORTING);
    return null;
  }
  
  // Get all folders from the data plus FOLDER_ORDER
  const allFolders = new Set(FOLDER_ORDER);
  Object.keys(data).forEach(folder => allFolders.add(folder));
  
  // Sort folders according to FOLDER_ORDER
  const sortedFolderNames = Array.from(allFolders).sort((a, b) => {
    const indexA = FOLDER_ORDER.indexOf(a);
    const indexB = FOLDER_ORDER.indexOf(b);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.localeCompare(b);
  });
  
  // Organize dates by week
  const weekMap = {};
  workdaysInMonth.forEach(dateStr => {
    const date = new Date(`${dateStr}T00:00:00Z`);
    const weekNum = getWeekNumber(date);
    
    if (!weekMap[weekNum]) {
      weekMap[weekNum] = {
        number: weekNum,
        days: []
      };
    }
    
    weekMap[weekNum].days.push(dateStr);
  });
  
  // Sort weeks by number
  const sortedWeeks = Object.values(weekMap).sort((a, b) => a.number - b.number);
  
  // Filter dates or weeks based on selected option
  let reportData = null;
  
  if (detailedReportType === 'monthlyDaily') {
    // Generate a daily breakdown for the entire month
    reportData = {
      title: `Daily Breakdown - ${MONTH_NAMES_FULL[reportMonth]} ${reportYear}`,
      type: 'monthlyDaily',
      tables: []
    };
    
    // Create a table for each day with all folders
    workdaysInMonth.forEach(dateStr => {
      const date = new Date(`${dateStr}T00:00:00Z`);
      const dayOfWeek = DAYS_OF_WEEK[date.getUTCDay()];
      const formattedDate = `${dayOfWeek}, ${date.getUTCDate()} ${MONTH_NAMES_FULL[reportMonth]} ${reportYear}`;
      
      const tableData = {
        title: formattedDate,
        date: dateStr,
        head: [['Folder', 'Count']],
        body: []
      };
      
      let dayTotal = 0;
      
      // Add rows for each folder, with 0 counts for folders with no data
      sortedFolderNames.forEach(folderName => {
        const folderData = data[folderName] || {};
        const count = folderData[dateStr] || 0;
        
        if (count > 0) {
          dayTotal += count;
        }
        
        // Add folder row with its count (including zero counts)
        tableData.body.push([folderName, count]);
      });
      
      // Add total row
      tableData.body.push(['Total', dayTotal]);
      
      // Add to report tables
      reportData.tables.push(tableData);
    });
    
  } else if (detailedReportType === 'weeklyDaily' && selectedWeek) {
    // Generate daily breakdown for a specific week
    const selectedWeekData = weekMap[selectedWeek];
    
    if (!selectedWeekData) {
      console.error(`Week ${selectedWeek} not found in data.`);
      return null;
    }
    
    const weekDates = selectedWeekData.days;
    
    if (weekDates.length === 0) {
      console.error(`No workdays found in week ${selectedWeek}`);
      return null;
    }
    
    // Get first and last date of the week for the title
    const firstDate = new Date(`${weekDates[0]}T00:00:00Z`);
    const lastDate = new Date(`${weekDates[weekDates.length - 1]}T00:00:00Z`);
    const firstDateStr = `${firstDate.getUTCDate()} ${MONTH_NAMES_SHORT[reportMonth]}`;
    const lastDateStr = `${lastDate.getUTCDate()} ${MONTH_NAMES_SHORT[reportMonth]}`;
    
    reportData = {
      title: `Daily Breakdown - Week ${selectedWeek} (${firstDateStr} - ${lastDateStr}) ${reportYear}`,
      type: 'weeklyDaily',
      tables: []
    };
    
    // Create a table for each day in the selected week
    weekDates.forEach(dateStr => {
      const date = new Date(`${dateStr}T00:00:00Z`);
      const dayOfWeek = DAYS_OF_WEEK[date.getUTCDay()];
      const formattedDate = `${dayOfWeek}, ${date.getUTCDate()} ${MONTH_NAMES_FULL[reportMonth]} ${reportYear}`;
      
      const tableData = {
        title: formattedDate,
        date: dateStr,
        head: [['Folder', 'Count']],
        body: []
      };
      
      let dayTotal = 0;
      
      // Add rows for each folder, with 0 counts for folders with no data
      sortedFolderNames.forEach(folderName => {
        const folderData = data[folderName] || {};
        const count = folderData[dateStr] || 0;
        
        if (count > 0) {
          dayTotal += count;
        }
        
        // Add folder row with its count (including zero counts)
        tableData.body.push([folderName, count]);
      });
      
      // Add total row
      tableData.body.push(['Total', dayTotal]);
      
      // Add to report tables
      reportData.tables.push(tableData);
    });
    
  } else if (detailedReportType === 'monthlySplit') {
    // Generate weekly splits for the month
    reportData = {
      title: `Weekly Splits - ${MONTH_NAMES_FULL[reportMonth]} ${reportYear}`,
      type: 'monthlySplit',
      tables: []
    };
    
    // Process each week
    sortedWeeks.forEach(week => {
      const weekDates = week.days;
      const weekNum = week.number;
      
      // Skip empty weeks
      if (weekDates.length === 0) {
        return;
      }
      
      // Get first and last date of the week for the title
      const firstDate = new Date(`${weekDates[0]}T00:00:00Z`);
      const lastDate = new Date(`${weekDates[weekDates.length - 1]}T00:00:00Z`);
      const firstDateStr = `${firstDate.getUTCDate()} ${MONTH_NAMES_SHORT[reportMonth]}`;
      const lastDateStr = `${lastDate.getUTCDate()} ${MONTH_NAMES_SHORT[reportMonth]}`;
      
      const tableData = {
        title: `Week ${weekNum} (${firstDateStr} - ${lastDateStr})`,
        week: weekNum,
        head: [['Folder', 'Total Count']],
        body: []
      };
      
      // Calculate totals for each folder for this week
      const weeklyFolderTotals = {};
      
      // Initialize all folders with zero
      sortedFolderNames.forEach(folderName => {
        weeklyFolderTotals[folderName] = 0;
      });
      
      // Add up counts for each day in the week
      weekDates.forEach(dateStr => {
        sortedFolderNames.forEach(folderName => {
          const folderData = data[folderName] || {};
          const count = folderData[dateStr] || 0;
          weeklyFolderTotals[folderName] += count;
        });
      });
      
      // Add rows for each folder with the weekly total
      let weekTotal = 0;
      sortedFolderNames.forEach(folderName => {
        const count = weeklyFolderTotals[folderName];
        tableData.body.push([folderName, count]);
        weekTotal += count;
      });
      
      // Add total row
      tableData.body.push(['Total', weekTotal]);
      
      // Add to report tables
      reportData.tables.push(tableData);
    });
  }
  
  if (!reportData || !reportData.tables || reportData.tables.length === 0) {
    console.warn("No data generated for detailed report.");
    return null;
  }
  
  console.log(`--- _prepareDetailedReportData END, created ${reportData.tables.length} tables ---`);
  return reportData;
}

async function _prepareObjectiveTableData(data, options) {
    console.log(`--- _prepareObjectiveTableData START for ${options.reportYear}-${options.reportMonth} (Format: ${options.format}, isIndividualCsv: ${options.isIndividualCsv}) ---`);
    const { reportYear, reportMonth, includeWeekGaps = true, format = 'csv', isIndividualCsv = false } = options;
    let workdaysInMonth = [];
    try { const datesInMonth = _getDatesInMonth(reportYear, reportMonth); workdaysInMonth = (await filterWorkdays(datesInMonth)).sort(); }
    catch (error) { console.error("Error getting workdays:", error); ErrorManager.logError('Get Workdays Error', { context: '_prepareObjectiveTableData', error: error.message }, SEVERITY.ERROR, CATEGORY.REPORTING); return null; }

    let nonZeroEntriesFound = false;
    const allRelevantDates = new Set(workdaysInMonth);

    // REPLACEMENT FIX: Force inclusion of ALL folders from FOLDER_ORDER
    const finalSortedFolderNames = [...FOLDER_ORDER]; // Start with exact copy of FOLDER_ORDER

    // Then add any folders with data that aren't in FOLDER_ORDER
    Object.entries(data).forEach(([folderDisplayName, folderData]) => {
        if (folderData) {
            if (!finalSortedFolderNames.includes(folderDisplayName)) {
                finalSortedFolderNames.push(folderDisplayName);
            }
            Object.keys(folderData).forEach(dateStr => {
                if (folderData[dateStr] > 0) {
                    allRelevantDates.add(dateStr);
                    nonZeroEntriesFound = true;
                }
            });
        }
    });
    
    if (allRelevantDates.size === 0 && workdaysInMonth.length > 0) {
        workdaysInMonth.forEach(wd => allRelevantDates.add(wd));
    } else if (allRelevantDates.size === 0) {
        allRelevantDates.add(_getLastDayOfMonth(reportYear, reportMonth));
    }

    const sortedDailyDates = Array.from(allRelevantDates).sort();

    let csvHeaderOut = []; let csvBodyOut = []; let pdfHeader = []; let pdfBody = [];

    if (format === 'csv') {
        const dailyHeaderRow = ['Folder'];
        const dailyHeaderDatesForMapping = [''];
        const dailyGapIndices = new Set();
        let dailyPrevAddedDateStr = null;

        sortedDailyDates.forEach((dateStr) => {
            const date = new Date(`${dateStr}T00:00:00Z`);
            const currentWeekNumber = getWeekNumber(date);
            const prevDate = dailyPrevAddedDateStr ? new Date(`${dailyPrevAddedDateStr}T00:00:00Z`) : null;
            const prevWeekNumber = prevDate ? getWeekNumber(prevDate) : null;
            if (includeWeekGaps && prevWeekNumber !== null && currentWeekNumber !== prevWeekNumber) {
                dailyHeaderRow.push(''); dailyHeaderDatesForMapping.push('GAP'); dailyGapIndices.add(dailyHeaderRow.length - 1);
            }
            dailyHeaderRow.push(dateStr); dailyHeaderDatesForMapping.push(dateStr);
            dailyPrevAddedDateStr = dateStr;
        });
        dailyHeaderRow.push('Total'); dailyHeaderDatesForMapping.push('Total');

        const dailyDateToColIndex = {};
        dailyHeaderDatesForMapping.forEach((date, index) => {
            if (date && date !== 'GAP' && date !== 'Total') dailyDateToColIndex[date] = index;
        });
        const dailyTotalColIndex = dailyHeaderRow.length - 1;
        const dailyColumnTotals = new Array(dailyHeaderRow.length).fill(0);
        const dailyBodyRows = [];
        let dailyGrandTotal = 0;

        // Use finalSortedFolderNames instead of sortedFolderDisplayNames
        finalSortedFolderNames.forEach(folderDisplayName => {
            const row = new Array(dailyHeaderRow.length).fill(0);
            let finalDisplayName = folderDisplayName;
            if (folderDisplayName === 'Police' || folderDisplayName === 'Personals') { finalDisplayName += ' Batch'; }
            row[0] = finalDisplayName;
            const folderCounts = data[folderDisplayName] || {};
            let rowSum = 0;
            Object.entries(folderCounts).forEach(([dateStr, count]) => {
                const colIndex = dailyDateToColIndex[dateStr];
                if (colIndex !== undefined && count > 0) {
                    const numCount = Number(count); row[colIndex] = numCount;
                    dailyColumnTotals[colIndex] += numCount; rowSum += numCount;
                }
            });
            dailyGapIndices.forEach(gapIndex => { row[gapIndex] = ''; });
            row[dailyTotalColIndex] = rowSum;
            dailyBodyRows.push(row);
        });

        // Add blank rows between weeks for better visual separation in CSV
        if (format === 'csv' && includeWeekGaps) {
            // Identify where week transitions occur in the columns
            const weekTransitions = [];
            let prevWeekNumber = null;
            
            sortedDailyDates.forEach((dateStr, idx) => {
                const date = new Date(`${dateStr}T00:00:00Z`);
                const currentWeekNumber = getWeekNumber(date);
                
                if (prevWeekNumber !== null && currentWeekNumber !== prevWeekNumber) {
                    // This date starts a new week compared to the previous date
                    weekTransitions.push(idx);
                }
                prevWeekNumber = currentWeekNumber;
            });
            
            // Insert blank rows at week transitions
            // Start from the end to avoid index shifting problems
            for (let i = weekTransitions.length - 1; i >= 0; i--) {
                const insertIndex = weekTransitions[i];
                // Insert a blank row after all folders for this week
                dailyBodyRows.splice((insertIndex + 1) * finalSortedFolderNames.length, 0, new Array(dailyHeaderRow.length).fill(''));
            }
        }

        const dailyTotalRow = new Array(dailyHeaderRow.length).fill('');
        dailyTotalRow[0] = 'Total';
        dailyColumnTotals.forEach((total, colIndex) => {
            if (colIndex > 0 && colIndex < dailyTotalColIndex && !dailyGapIndices.has(colIndex)) {
                const numTotal = Number(total); dailyTotalRow[colIndex] = numTotal; dailyGrandTotal += numTotal;
            }
        });
        dailyTotalRow[dailyTotalColIndex] = dailyGrandTotal;
        if (dailyBodyRows.length > 0 || isIndividualCsv) {
             dailyBodyRows.push(dailyTotalRow);
        }

        csvHeaderOut = dailyHeaderRow.map(safeCsvCell);
        csvBodyOut = dailyBodyRows.map(row => row.map(cell => safeCsvCell(cell)).join(','));
        nonZeroEntriesFound = dailyGrandTotal > 0;
    }

    if (format === 'pdf') {
        const weeklyData = {}; const weekDateMap = {};
        sortedDailyDates.forEach(dateStr => {
            const date = new Date(`${dateStr}T00:00:00Z`); const weekNum = getWeekNumber(date);
            if (!weekDateMap[weekNum]) weekDateMap[weekNum] = { dates: [] };
            weekDateMap[weekNum].dates.push(dateStr);
        });

        // Use finalSortedFolderNames instead of sortedFolderDisplayNames
        finalSortedFolderNames.forEach(folderDisplayName => {
            const dailyCounts = data[folderDisplayName] || {};
            Object.entries(dailyCounts).forEach(([dateStr, count]) => {
                if (count > 0) {
                    const date = new Date(`${dateStr}T00:00:00Z`); const weekNum = getWeekNumber(date);
                    if (!weeklyData[weekNum]) weeklyData[weekNum] = {};
                    weeklyData[weekNum][folderDisplayName] = (weeklyData[weekNum][folderDisplayName] || 0) + count;
                }
            });
        });

        const sortedWeekNums = Object.keys(weekDateMap).map(Number).sort((a, b) => a - b);
        const pdfHeaderRow = ['Folder']; const weekNumToColIndex = {};
        sortedWeekNums.forEach((weekNum, index) => {
            const weekDates = weekDateMap[weekNum]?.dates; let weekLabel = `Wk ${weekNum}`;
            if (weekDates && weekDates.length > 0) {
                weekDates.sort(); const startDateStr = weekDates[0]; const endDateStr = weekDates[weekDates.length - 1];
                const formattedStartDate = _formatDateDDMon(startDateStr); const formattedEndDate = _formatDateDDMon(endDateStr);
                weekLabel = (startDateStr === endDateStr) ? formattedStartDate : `${formattedStartDate} - ${formattedEndDate}`;
            }
            pdfHeaderRow.push(weekLabel); weekNumToColIndex[weekNum] = index + 1;
        });
        pdfHeaderRow.push('Total'); const pdfTotalColIndex = pdfHeaderRow.length - 1;
        pdfHeader = [pdfHeaderRow];
        const pdfColumnTotals = new Array(pdfHeaderRow.length).fill(0);
        let pdfGrandTotal = 0;

        // Use finalSortedFolderNames instead of sortedFolderDisplayNames
        finalSortedFolderNames.forEach(folderDisplayName => {
            const row = new Array(pdfHeaderRow.length).fill(0);
            let finalDisplayName = folderDisplayName;
            if (folderDisplayName === 'Police' || folderDisplayName === 'Personals') { finalDisplayName += ' Batch'; }
            row[0] = finalDisplayName;
            let rowSum = 0;
            sortedWeekNums.forEach(weekNum => {
                const weekCount = weeklyData[weekNum]?.[folderDisplayName] || 0;
                const colIndex = weekNumToColIndex[weekNum];
                if (colIndex !== undefined) {
                    row[colIndex] = weekCount;
                    if (weekCount > 0) {
                       pdfColumnTotals[colIndex] += weekCount; rowSum += weekCount;
                    }
                }
            });
            row[pdfTotalColIndex] = rowSum;
            pdfBody.push(row);
        });

        const pdfTotalRow = new Array(pdfHeaderRow.length).fill('');
        pdfTotalRow[0] = 'Total';
        pdfColumnTotals.forEach((total, colIndex) => {
            if (colIndex > 0 && colIndex < pdfTotalColIndex) { pdfTotalRow[colIndex] = total; pdfGrandTotal += total; }
        });
        pdfTotalRow[pdfTotalColIndex] = pdfGrandTotal;
        if (pdfBody.length > 0) pdfBody.push(pdfTotalRow);
        nonZeroEntriesFound = pdfGrandTotal > 0;
    }
    console.log(`--- _prepareObjectiveTableData END (Format: ${options.format}) ---`);
    return { csvHeader: csvHeaderOut, csvBody: csvBodyOut, pdfHeader: pdfHeader, pdfBody: pdfBody, nonZeroEntriesFound };
}

async function _prepareCombinedIndividualDetailObjectiveTableDataCsv(allPersonData, personsForReport, foldersForReport, options) {
    console.log(`--- _prepareCombinedIndividualDetailObjectiveTableDataCsv START for ${options.reportYear}-${options.reportMonth} ---`);
    const { reportYear, reportMonth, includeWeekGaps = true } = options;

    let workdaysInMonth = [];
    try {
        const datesInMonth = _getDatesInMonth(reportYear, reportMonth);
        workdaysInMonth = (await filterWorkdays(datesInMonth)).sort();
    } catch (error) { console.error("Error getting workdays for combined individual detail CSV:", error); return null; }

    const allRelevantDatesWithData = new Set();
    
    // REPLACEMENT FIX: Force inclusion of ALL folders from FOLDER_ORDER
    const finalSortedFolderNames = [...FOLDER_ORDER]; // Start with exact copy of FOLDER_ORDER
    
    let nonZeroEntriesFoundGlobal = false;

    personsForReport.forEach(person => {
        const personMonthData = allPersonData[person]?.[reportYear]?.[reportMonth];
        if (personMonthData) {
            Object.entries(personMonthData).forEach(([folderDisplayName, datesData]) => {
                // IMPROVED: Only check if we need to add non-FOLDER_ORDER folders
                if (!finalSortedFolderNames.includes(folderDisplayName)) {
                    finalSortedFolderNames.push(folderDisplayName);
                }
                
                // Only check data if this folder passes the filter or is in FOLDER_ORDER
                if ((foldersForReport === null || foldersForReport.includes(folderDisplayName)) && 
                    typeof datesData === 'object' && datesData !== null) {
                    Object.keys(datesData).forEach(dateStr => {
                        if (datesData[dateStr] > 0) {
                            allRelevantDatesWithData.add(dateStr);
                            nonZeroEntriesFoundGlobal = true;
                        }
                    });
                }
            });
        }
    });
    
    const sortedDailyDates = allRelevantDatesWithData.size > 0 ? Array.from(allRelevantDatesWithData).sort() : [...workdaysInMonth];
    if (sortedDailyDates.length === 0) { sortedDailyDates.push(_getLastDayOfMonth(reportYear, reportMonth)); }

    const dailyHeaderRow = ['Person', 'Folder'];
    const dailyHeaderDatesForMapping = ['', ''];
    const dailyGapIndices = new Set();
    let dailyPrevAddedDateStr = null;
    sortedDailyDates.forEach((dateStr) => {
        const date = new Date(`${dateStr}T00:00:00Z`);
        const currentWeekNumber = getWeekNumber(date);
        const prevDate = dailyPrevAddedDateStr ? new Date(`${dailyPrevAddedDateStr}T00:00:00Z`) : null;
        const prevWeekNumber = prevDate ? getWeekNumber(prevDate) : null;
        if (includeWeekGaps && prevWeekNumber !== null && currentWeekNumber !== prevWeekNumber) {
            dailyHeaderRow.push(''); dailyHeaderDatesForMapping.push('GAP'); dailyGapIndices.add(dailyHeaderRow.length - 1);
        }
        dailyHeaderRow.push(dateStr); dailyHeaderDatesForMapping.push(dateStr);
        dailyPrevAddedDateStr = dateStr;
    });
    dailyHeaderRow.push('Total'); dailyHeaderDatesForMapping.push('Total');

    const dailyDateToColIndex = {};
    dailyHeaderDatesForMapping.forEach((date, index) => {
        if (date && date !== 'GAP' && date !== 'Total' && index >= 2) {
            dailyDateToColIndex[date] = index;
        }
    });
    const dailyTotalColIndex = dailyHeaderRow.length - 1;

    const dailyBodyRows = [];
    const grandTotalRow = new Array(dailyHeaderRow.length).fill('');
    grandTotalRow[0] = 'Grand Total'; grandTotalRow[1] = '';
    const columnGrandTotals = new Array(dailyHeaderRow.length).fill(0);
    let overallGrandTotal = 0;
    let firstPersonProcessed = true;

    personsForReport.forEach(person => { 
        if (!firstPersonProcessed) {
            dailyBodyRows.push(new Array(dailyHeaderRow.length).fill('')); 
        }
        firstPersonProcessed = false;

        let personTotalForAllFolders = 0;
        const personDateTotals = new Array(dailyHeaderRow.length).fill(0);

        // CRITICAL FIX: Always process all folders from FOLDER_ORDER for every person
        // Keep track of folders already processed to avoid duplicates
        const processedFolders = new Set();
        
        // First process all folders in FOLDER_ORDER to maintain correct order
        for (const folderDisplayName of FOLDER_ORDER) {
            processedFolders.add(folderDisplayName);
            
            // Create a row even if this folder is filtered out
            const datesData = allPersonData[person]?.[reportYear]?.[reportMonth]?.[folderDisplayName];
            const row = new Array(dailyHeaderRow.length).fill(0);
            row[0] = person; row[1] = folderDisplayName;
            let rowSum = 0;

            // Only populate with data if this folder passes the filter or we don't have a filter
            if (foldersForReport === null || foldersForReport.includes(folderDisplayName)) {
                if (datesData && typeof datesData === 'object') {
                    Object.entries(datesData).forEach(([dateStr, count]) => {
                        const colIndex = dailyDateToColIndex[dateStr];
                        if (colIndex !== undefined && count > 0) {
                            const numCount = Number(count); row[colIndex] = numCount;
                            personDateTotals[colIndex] += numCount;
                            columnGrandTotals[colIndex] += numCount;
                            rowSum += numCount;
                        }
                    });
                }
            }
            
            dailyGapIndices.forEach(gapIndex => { row[gapIndex] = ''; });
            row[dailyTotalColIndex] = rowSum;
            dailyBodyRows.push(row);
            personTotalForAllFolders += rowSum;
        }
        
        // Then process any additional folders not in FOLDER_ORDER
        finalSortedFolderNames.forEach(folderDisplayName => {
            // Skip if already processed (FOLDER_ORDER folders)
            if (processedFolders.has(folderDisplayName)) return;
            
            // Skip if doesn't pass the filter
            if (foldersForReport !== null && !foldersForReport.includes(folderDisplayName)) return;
            
            const datesData = allPersonData[person]?.[reportYear]?.[reportMonth]?.[folderDisplayName];
            const row = new Array(dailyHeaderRow.length).fill(0);
            row[0] = person; row[1] = folderDisplayName;
            let rowSum = 0;

            if (datesData && typeof datesData === 'object') {
                Object.entries(datesData).forEach(([dateStr, count]) => {
                    const colIndex = dailyDateToColIndex[dateStr];
                    if (colIndex !== undefined && count > 0) {
                        const numCount = Number(count); row[colIndex] = numCount;
                        personDateTotals[colIndex] += numCount;
                        columnGrandTotals[colIndex] += numCount;
                        rowSum += numCount;
                    }
                });
            }
            
            dailyGapIndices.forEach(gapIndex => { row[gapIndex] = ''; });
            row[dailyTotalColIndex] = rowSum;
            dailyBodyRows.push(row);
            personTotalForAllFolders += rowSum;
        });

        const personTotalRow = new Array(dailyHeaderRow.length).fill('');
        personTotalRow[0] = ""; 
        personTotalRow[1] = `Total for ${person}`;
        personDateTotals.forEach((total, idx) => {
            if (idx >= 2 && idx < dailyTotalColIndex && !dailyGapIndices.has(idx)) {
                personTotalRow[idx] = total > 0 ? total : 0; 
            }
        });
        personTotalRow[dailyTotalColIndex] = personTotalForAllFolders;
        dailyBodyRows.push(personTotalRow);
        overallGrandTotal += personTotalForAllFolders;
    });

    // Add blank rows for week boundaries within each person's section
    if (includeWeekGaps) {
        // Get all week transitions from the dates
        const weekTransitions = [];
        let prevWeekNumber = null;
        
        sortedDailyDates.forEach((dateStr, idx) => {
            const date = new Date(`${dateStr}T00:00:00Z`);
            const currentWeekNumber = getWeekNumber(date);
            
            if (prevWeekNumber !== null && currentWeekNumber !== prevWeekNumber) {
                // This date starts a new week compared to the previous date
                weekTransitions.push({
                    index: idx,
                    weekNumber: currentWeekNumber
                });
            }
            prevWeekNumber = currentWeekNumber;
        });
        
        if (weekTransitions.length > 0) {
            // Process in reverse to avoid index shifting issues
            // We need to find each person's section and add blank rows at the week transitions
            let currentIndex = dailyBodyRows.length - 1;
            let currentPerson = null;
            const personSections = [];
            
            // First identify all person sections
            for (let i = dailyBodyRows.length - 1; i >= 0; i--) {
                const row = dailyBodyRows[i];
                // Check if this is a row with a person name
                if (row[0] && personsForReport.includes(row[0])) {
                    // Found a new person section
                    if (currentPerson !== null) {
                        personSections.unshift({
                            person: currentPerson,
                            startRow: i,
                            endRow: currentIndex
                        });
                    }
                    currentIndex = i - 1;
                    currentPerson = row[0];
                } else if (i === 0 && currentPerson) {
                    // Handle the first person in the data
                    personSections.unshift({
                        person: currentPerson,
                        startRow: 0,
                        endRow: currentIndex
                    });
                }
            }
            
            // For each person section, insert blank rows at week transitions
            for (const section of personSections) {
                // FIXED: This should be the count of ALL folders processed for this person
                // Count all FOLDER_ORDER folders plus any additional filtered folders
                const folderCountInFolderOrder = FOLDER_ORDER.length;
                let additionalFilteredFolders = 0;
                
                // Count any additional folders that passed the filter but aren't in FOLDER_ORDER
                if (foldersForReport !== null) {
                    for (const folder of foldersForReport) {
                        if (!FOLDER_ORDER.includes(folder)) {
                            additionalFilteredFolders++;
                        }
                    }
                } else {
                    // If no filter, count all non-FOLDER_ORDER folders in finalSortedFolderNames
                    for (const folder of finalSortedFolderNames) {
                        if (!FOLDER_ORDER.includes(folder)) {
                            additionalFilteredFolders++;
                        }
                    }
                }
                
                const personFolderCount = folderCountInFolderOrder + additionalFilteredFolders;
                
                // Add a blank row after each week transition within this person's data
                for (const transition of weekTransitions) {
                    // Calculate where to insert the blank row for this person and week
                    const insertPosition = section.startRow + personFolderCount * (transition.index + 1);
                    
                    if (insertPosition < section.endRow) {
                        dailyBodyRows.splice(insertPosition, 0, new Array(dailyHeaderRow.length).fill(''));
                        
                        // Update end row for subsequent calculations
                        section.endRow++;
                        
                        // Update later sections' indices
                        for (let i = personSections.indexOf(section) + 1; i < personSections.length; i++) {
                            personSections[i].startRow++;
                            personSections[i].endRow++;
                        }
                    }
                }
            }
        }
    }

    columnGrandTotals.forEach((total, colIndex) => {
        if (colIndex >= 2 && colIndex < dailyTotalColIndex && !dailyGapIndices.has(colIndex)) {
            grandTotalRow[colIndex] = total > 0 ? total : 0;
        }
    });
    grandTotalRow[dailyTotalColIndex] = overallGrandTotal;

    if (dailyBodyRows.length > 0 || personsForReport.length > 0) {
        dailyBodyRows.push(new Array(dailyHeaderRow.length).fill('')); 
        dailyBodyRows.push(grandTotalRow);
    }

    const csvHeaderOut = dailyHeaderRow.map(safeCsvCell);
    const csvBodyOut = dailyBodyRows.map(row => row.map(cell => safeCsvCell(cell)).join(','));

    console.log(`--- _prepareCombinedIndividualDetailObjectiveTableDataCsv END ---`);
    return { csvHeader: csvHeaderOut, csvBody: csvBodyOut, nonZeroEntriesFound: nonZeroEntriesFoundGlobal };
}

function _prepareQueueStatsTable(queueDataForMonth) { 
    console.log("--- _prepareQueueStatsTable START ---");
    if (!queueDataForMonth || Object.keys(queueDataForMonth).length === 0) {
        console.warn("_prepareQueueStatsTable: No queue data provided.");
        return null;
    }
    const breakdownQueues = {
        "Release of Information": "CRT CAU Release of Info", "CTP": "CRT CAU CTP Insurance",
        "Dishonoured Payments": "CRT CAU Dishonoured Payment", "Dealing Restrictions": "CRT CAU Dealing Restrictions",
        "Suppressed Address": "CRT CAU Supress Address", "All Other Enquiries": "CRT CAU General Enquiries"
    };
    let totalOffer = 0, totalAnswer = 0, totalAbandon = 0, weightedWaitSum = 0;
    const breakdownAnswers = {};
    Object.keys(breakdownQueues).forEach(label => breakdownAnswers[label] = 0);
    Object.entries(queueDataForMonth).forEach(([queueName, stats]) => {
        const offer = stats?.offer || 0; const answer = stats?.answer || 0;
        const abandon = stats?.abandon || 0; const avgWaitMs = stats?.avgWaitMs || 0;
        totalOffer += offer; totalAnswer += answer; totalAbandon += abandon;
        weightedWaitSum += avgWaitMs * offer;
        for (const [reportLabel, csvQueueName] of Object.entries(breakdownQueues)) {
            if (queueName === csvQueueName) { breakdownAnswers[reportLabel] += answer; break; }
        }
    });
    const callsHandledWithinSL = totalAnswer; const callsAbandonedWithinSL = totalAbandon;
    const avgWaitSeconds = totalOffer > 0 ? (weightedWaitSum / totalOffer / 1000) : 0;
    const tableHeader = [['Metric', 'Value']];
    const tableBody = [
        ['Calls Presented', totalOffer], ['Calls Handled Total', totalAnswer],
        ...Object.entries(breakdownAnswers).map(([label, count]) => [`Calls Handled ${label}`, count]),
        ['Calls Handled within service level', callsHandledWithinSL],
        ['Calls Abandoned', totalAbandon],
        ['Calls Abandoned within service level', callsAbandonedWithinSL],
        ['Average wait time, in Seconds', avgWaitSeconds.toFixed(1)]
    ];
    console.log("--- _prepareQueueStatsTable END ---");
    return { head: tableHeader, body: tableBody };
}

function generateCsvContent(objectiveHeader, objectiveBody, queueStatsTable) { 
    let csvContent = "";
    if (Array.isArray(objectiveHeader) && objectiveHeader.length > 0 && Array.isArray(objectiveBody) && objectiveBody.length > 0) {
        csvContent += '"Objective Data Summary"\n';
        csvContent += objectiveHeader.join(',') + '\n';
        csvContent += objectiveBody.join('\n');
    }
    if (queueStatsTable && Array.isArray(queueStatsTable.head) && Array.isArray(queueStatsTable.body)) {
        if (csvContent.length > 0) { csvContent += '\n\n'; }
        csvContent += '"Queue Performance Summary"\n';
        if (queueStatsTable.head.length > 0 && Array.isArray(queueStatsTable.head[0])) {
            csvContent += queueStatsTable.head[0].map(safeCsvCell).join(',') + '\n';
        }
        queueStatsTable.body.forEach(row => {
            if (Array.isArray(row)) { csvContent += row.slice(0, 2).map(safeCsvCell).join(',') + '\n'; }
        });
    }
    return csvContent;
}

/**
 * Prepares data for yearly reports broken down by month for each person
 * @param {Object} allPersonData - All person data from storage
 * @param {Array} personsForReport - List of persons to include in the report
 * @param {Array|null} foldersForReport - List of folders to include, or null for all
 * @param {Number} reportYear - The year to generate the report for
 * @returns {Object} Object containing yearly report data
 */
async function _prepareYearlyReportData(allPersonData, personsForReport, foldersForReport, reportYear) {
    console.log(`--- _prepareYearlyReportData START for ${reportYear} ---`);
    
    if (!personsForReport || personsForReport.length === 0) {
        console.error("No persons provided for yearly report");
        return null;
    }
    
    // Get ALL persons with data in this year (for complete totals)
    const allPersonsInYear = Object.keys(allPersonData || {}).filter(p => 
        allPersonData[p]?.[reportYear]
    );
    
    // Get all folders from FOLDER_ORDER plus any additional folders in the data
    const allFolders = new Set(FOLDER_ORDER);
    allPersonsInYear.forEach(person => {
        const personYearData = allPersonData[person]?.[reportYear];
        if (personYearData) {
            // Iterate through all months
            for (let month = 1; month <= 12; month++) {
                const monthData = personYearData[month];
                if (monthData && typeof monthData === 'object') {
                    Object.keys(monthData).forEach(folder => allFolders.add(folder));
                }
            }
        }
    });
    
    // Sort folders according to FOLDER_ORDER
    const sortedFolderNames = Array.from(allFolders).sort((a, b) => {
        const indexA = FOLDER_ORDER.indexOf(a);
        const indexB = FOLDER_ORDER.indexOf(b);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.localeCompare(b);
    });
    
    // Filter folders if specified
    const finalFolders = foldersForReport ? 
        sortedFolderNames.filter(f => foldersForReport.includes(f)) : 
        sortedFolderNames;
    
    // Structure: { person: { folder: { month: count, total: count }, total: count, daysWorked: number } }
    const yearlyData = {};
    
    // Calculate complete totals for ALL persons (not just selected) - for "Team Total" column
    const completeFolderTotals = {};
    let completeGrandTotal = 0;
    finalFolders.forEach(folder => { completeFolderTotals[folder] = 0; });
    
    allPersonsInYear.forEach(person => {
        const personYearData = allPersonData[person]?.[reportYear];
        if (!personYearData) return;
        
        finalFolders.forEach(folder => {
            for (let month = 1; month <= 12; month++) {
                const monthData = personYearData[month]?.[folder];
                if (monthData && typeof monthData === 'object') {
                    Object.values(monthData).forEach(count => {
                        const numCount = parseInt(count, 10);
                        if (!isNaN(numCount) && numCount > 0) {
                            completeFolderTotals[folder] += numCount;
                            completeGrandTotal += numCount;
                        }
                    });
                }
            }
        });
    });
    
    // Now process the selected persons for display
    personsForReport.forEach(person => {
        const personYearData = allPersonData[person]?.[reportYear];
        
        if (!personYearData) {
            console.warn(`No data for ${person} in year ${reportYear}`);
            return;
        }
        
        yearlyData[person] = {};
        let personYearlyTotal = 0;
        const daysWorkedSet = new Set(); // Track unique days worked
        
        finalFolders.forEach(folder => {
            yearlyData[person][folder] = {};
            let folderYearlyTotal = 0;
            
            // Aggregate data for each month (1-12)
            for (let month = 1; month <= 12; month++) {
                const monthData = personYearData[month]?.[folder];
                let monthTotal = 0;
                
                if (monthData && typeof monthData === 'object') {
                    // Sum all dates in the month and track days worked
                    Object.entries(monthData).forEach(([dateKey, count]) => {
                        const numCount = parseInt(count, 10);
                        if (!isNaN(numCount) && numCount > 0) {
                            monthTotal += numCount;
                            // Add the date to days worked (format: YYYY-MM-DD or just day number)
                            daysWorkedSet.add(`${reportYear}-${month}-${dateKey}`);
                        }
                    });
                }
                
                yearlyData[person][folder][month] = monthTotal;
                folderYearlyTotal += monthTotal;
            }
            
            yearlyData[person][folder].total = folderYearlyTotal;
            personYearlyTotal += folderYearlyTotal;
        });
        
        yearlyData[person].yearlyTotal = personYearlyTotal;
        yearlyData[person].daysWorked = daysWorkedSet.size;
    });
    
    console.log(`--- _prepareYearlyReportData END ---`);
    return {
        yearlyData,
        folders: finalFolders,
        persons: personsForReport,
        year: reportYear,
        completeFolderTotals,  // Complete totals for ALL persons
        completeGrandTotal     // Complete grand total for ALL persons
    };
}

/**
 * Prepares data showing the highest daily totals for each month (excluding batches)
 * Returns top 4 performers per month, each with their own folder breakdown
 * @param {Object} allPersonData - The complete person data object
 * @param {Array} personsForReport - Array of person names to include
 * @param {number} reportYear - The year to generate the report for
 * @returns {Object} Object with highestDays array containing top 4 day info per month
 */
function _prepareHighestDailyTotals(allPersonData, personsForReport, reportYear) {
    console.log(`--- _prepareHighestDailyTotals START for ${reportYear} ---`);
    
    const BATCH_FOLDERS = new Set(["Personals", "Police", "Completed ROI Requests", "Personals Batch", "Police Batch"]);
    const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 
                         'July', 'August', 'September', 'October', 'November', 'December'];
    
    const highestDays = [];
    
    for (let month = 1; month <= 12; month++) {
        const dailyTotals = {};
        
        personsForReport.forEach(person => {
            const personYearData = allPersonData[person]?.[reportYear];
            if (!personYearData || !personYearData[month]) return;
            
            const monthData = personYearData[month];
            
            Object.entries(monthData).forEach(([folder, folderData]) => {
                if (BATCH_FOLDERS.has(folder)) return;
                
                if (folderData && typeof folderData === 'object') {
                    Object.entries(folderData).forEach(([day, count]) => {
                        const numCount = parseInt(count, 10);
                        if (isNaN(numCount) || numCount <= 0) return;
                        
                        const key = `${person}-${day}`;
                        if (!dailyTotals[key]) {
                            dailyTotals[key] = { person, day: parseInt(day, 10), total: 0, folders: {} };
                        }
                        
                        dailyTotals[key].total += numCount;
                        dailyTotals[key].folders[folder] = (dailyTotals[key].folders[folder] || 0) + numCount;
                    });
                }
            });
        });
        
        // Get top 4 daily totals for this month
        const sortedDays = Object.values(dailyTotals).sort((a, b) => b.total - a.total).slice(0, 4);
        
        const topPerformers = sortedDays.map(dayData => ({
            date: `${dayData.day}/${month}/${reportYear}`,
            day: dayData.day,
            person: dayData.person,
            total: dayData.total,
            folders: dayData.folders
        }));
        
        highestDays.push({
            month: month,
            monthName: MONTH_NAMES[month - 1],
            topPerformers: topPerformers
        });
    }
    
    console.log(`--- _prepareHighestDailyTotals END ---`);
    return { highestDays, year: reportYear };
}

/**
 * Prepares data showing the highest weekly totals for each month (excluding batches)
 * Returns top 4 performers per month based on their best week
 */
function _prepareHighestWeeklyTotals(allPersonData, personsForReport, reportYear) {
    console.log(`--- _prepareHighestWeeklyTotals START for ${reportYear} ---`);
    
    const BATCH_FOLDERS = new Set(["Personals", "Police", "Completed ROI Requests", "Personals Batch", "Police Batch"]);
    const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 
                         'July', 'August', 'September', 'October', 'November', 'December'];
    
    const highestWeeks = [];
    
    for (let month = 1; month <= 12; month++) {
        // Track weekly totals: key = "person-weekNum", value = { person, weekNum, total, folders }
        const weeklyTotals = {};
        
        personsForReport.forEach(person => {
            const personYearData = allPersonData[person]?.[reportYear];
            if (!personYearData || !personYearData[month]) return;
            
            const monthData = personYearData[month];
            
            Object.entries(monthData).forEach(([folder, folderData]) => {
                if (BATCH_FOLDERS.has(folder)) return;
                
                if (folderData && typeof folderData === 'object') {
                    Object.entries(folderData).forEach(([day, count]) => {
                        const numCount = parseInt(count, 10);
                        if (isNaN(numCount) || numCount <= 0) return;
                        
                        // Calculate week number within the month (1-5)
                        const dayNum = parseInt(day, 10);
                        const weekNum = Math.ceil(dayNum / 7);
                        
                        const key = `${person}-${weekNum}`;
                        if (!weeklyTotals[key]) {
                            weeklyTotals[key] = { person, weekNum, total: 0, folders: {}, startDay: dayNum, endDay: dayNum };
                        }
                        
                        weeklyTotals[key].total += numCount;
                        weeklyTotals[key].folders[folder] = (weeklyTotals[key].folders[folder] || 0) + numCount;
                        weeklyTotals[key].startDay = Math.min(weeklyTotals[key].startDay, dayNum);
                        weeklyTotals[key].endDay = Math.max(weeklyTotals[key].endDay, dayNum);
                    });
                }
            });
        });
        
        // Get top 4 weekly totals for this month
        const sortedWeeks = Object.values(weeklyTotals).sort((a, b) => b.total - a.total).slice(0, 4);
        
        const topPerformers = sortedWeeks.map(weekData => ({
            weekNum: weekData.weekNum,
            dateRange: `${weekData.startDay}-${weekData.endDay}/${month}`,
            person: weekData.person,
            total: weekData.total,
            folders: weekData.folders
        }));
        
        highestWeeks.push({
            month: month,
            monthName: MONTH_NAMES[month - 1],
            topPerformers: topPerformers
        });
    }
    
    console.log(`--- _prepareHighestWeeklyTotals END ---`);
    return { highestWeeks, year: reportYear };
}

/**
 * Prepares data showing the highest monthly totals for each month (excluding batches)
 * Returns top 4 performers per month based on their total for that month
 */
function _prepareHighestMonthlyTotals(allPersonData, personsForReport, reportYear) {
    console.log(`--- _prepareHighestMonthlyTotals START for ${reportYear} ---`);
    
    const BATCH_FOLDERS = new Set(["Personals", "Police", "Completed ROI Requests", "Personals Batch", "Police Batch"]);
    const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 
                         'July', 'August', 'September', 'October', 'November', 'December'];
    
    const highestMonths = [];
    
    for (let month = 1; month <= 12; month++) {
        // Track monthly totals per person
        const monthlyTotals = {};
        
        personsForReport.forEach(person => {
            const personYearData = allPersonData[person]?.[reportYear];
            if (!personYearData || !personYearData[month]) return;
            
            const monthData = personYearData[month];
            
            Object.entries(monthData).forEach(([folder, folderData]) => {
                if (BATCH_FOLDERS.has(folder)) return;
                
                if (folderData && typeof folderData === 'object') {
                    Object.entries(folderData).forEach(([day, count]) => {
                        const numCount = parseInt(count, 10);
                        if (isNaN(numCount) || numCount <= 0) return;
                        
                        if (!monthlyTotals[person]) {
                            monthlyTotals[person] = { person, total: 0, folders: {} };
                        }
                        
                        monthlyTotals[person].total += numCount;
                        monthlyTotals[person].folders[folder] = (monthlyTotals[person].folders[folder] || 0) + numCount;
                    });
                }
            });
        });
        
        // Get top 4 monthly totals
        const sortedMonths = Object.values(monthlyTotals).sort((a, b) => b.total - a.total).slice(0, 4);
        
        const topPerformers = sortedMonths.map(personData => ({
            person: personData.person,
            total: personData.total,
            folders: personData.folders
        }));
        
        highestMonths.push({
            month: month,
            monthName: MONTH_NAMES[month - 1],
            topPerformers: topPerformers
        });
    }
    
    console.log(`--- _prepareHighestMonthlyTotals END ---`);
    return { highestMonths, year: reportYear };
}

export async function generateObjectiveReports(selectedPersons, selectedFoldersDisplayNames, options = {}) {
    const { reportYear, reportMonth: reportMonthZeroBased, format = 'csv', includeWeekGaps = true, isTeamReport } = options;
    console.log(`Report Generator: START (v1.54). Options:`, JSON.stringify(options), `Is Team Report: ${isTeamReport}`);
    const errors = []; const reportsToProcess = []; let combinedPdfData = null;
    const optionsValidation = validateReportOptions({ ...options, reportMonth: reportMonthZeroBased + 1});
    if (!optionsValidation.valid) { errors.push(`Invalid report options: ${optionsValidation.errors.join(', ')}`); return { generatedReports: [], errors }; }
    const reportMonthOneBased = reportMonthZeroBased + 1; const monthStrPadded = String(reportMonthOneBased).padStart(2, '0');

    let allObjectiveData; let allQueueData;
    try {
        allObjectiveData = await StorageManager.retrieveAndDecompress(STORAGE_KEY_DATA);
        allQueueData = await StorageManager.retrieveAndDecompress(STORAGE_KEY_QUEUE_DATA);
    } catch (fetchError) { 
        console.error("Failed to retrieve data:", fetchError);
        errors.push(`Failed to retrieve data: ${fetchError.message}`);
        return { generatedReports: [], errors };
    }
    try { if (!holidayService.isInitialized) await holidayService.initialize(); }
    catch (error) { 
        console.warn("Holiday service initialization failed:", error);
    }

    let queueStatsTableForPdf = null; // Only for Team PDF or explicitly combined PDF with queue stats
    if (allQueueData && allQueueData[reportYear] && allQueueData[reportYear][reportMonthOneBased]) {
        try { queueStatsTableForPdf = _prepareQueueStatsTable(allQueueData[reportYear][reportMonthOneBased]); }
        catch (queueError) { errors.push(`Error preparing queue statistics: ${queueError.message}`); }
    }

    let personsToIterate = [];
    const isSelectAllIndividuals = !isTeamReport && selectedPersons === null;
    const shouldCombineOutputs = (isSelectAllIndividuals || (Array.isArray(selectedPersons) && selectedPersons.length > 1));

    const personsWithObjectiveData = Object.keys(allObjectiveData?.persons || {}).filter(p => allObjectiveData.persons[p]?.[reportYear]?.[reportMonthOneBased]);

    if (isTeamReport) {
        personsToIterate = [...personsWithObjectiveData].sort();
    } else if (isSelectAllIndividuals) {
        personsToIterate = [...personsWithObjectiveData].sort();
    } else if (Array.isArray(selectedPersons) && selectedPersons.length > 0) {
        personsToIterate = [...selectedPersons].filter(p => personsWithObjectiveData.includes(p)).sort(); // Sort here
        // ... (logging for skipped persons)
    } else if (!isTeamReport) {
        errors.push("No specific persons selected for individual report.");
        return { generatedReports: [], errors };
    }
    
    // Check for detailed report options
    if (!isTeamReport && format === 'pdf' && (options.detailedReportType === 'monthlyDaily' || 
                                             options.detailedReportType === 'weeklyDaily' || 
                                             options.detailedReportType === 'monthlySplit')) {
        console.log(`Report Generator: Generating Detailed Reports (${options.detailedReportType})`);
        
        // Generate reports for each person individually
        for (const person of personsToIterate) {
            const personObjectiveDataForMonth = allObjectiveData.persons?.[person]?.[reportYear]?.[reportMonthOneBased];
            if (!personObjectiveDataForMonth) continue;
            
            // Filter data by selected folders
            let filteredObjectiveData = {};
            if (selectedFoldersDisplayNames === null) {
                filteredObjectiveData = personObjectiveDataForMonth;
            } else if (Array.isArray(selectedFoldersDisplayNames)) {
                Object.entries(personObjectiveDataForMonth).forEach(([folderDispName, datesData]) => {
                    if (selectedFoldersDisplayNames.includes(folderDispName)) {
                        filteredObjectiveData[folderDispName] = datesData;
                    }
                });
                if (Object.keys(filteredObjectiveData).length === 0) continue;
            }
            
            // Process the data (shift weekend/holiday data appropriately)
            const processedObjectiveData = await _preprocessAndShiftData(
                filteredObjectiveData, 
                reportYear, 
                reportMonthOneBased
            );
            
            if (!processedObjectiveData || Object.keys(processedObjectiveData).length === 0) continue;
            
            // Generate detailed report data
            const detailedReportData = await _prepareDetailedReportData(
                processedObjectiveData,
                { 
                    reportYear,
                    reportMonth: reportMonthOneBased, 
                    detailedReportType: options.detailedReportType,
                    selectedWeek: options.selectedWeek 
                }
            );
            
            if (!detailedReportData || !detailedReportData.tables || detailedReportData.tables.length === 0) {
                console.warn(`No detailed report data generated for ${person}`);
                continue;
            }
            
            // Create a collated PDF with all the detailed report data
            const fileName = `${person}_${detailedReportData.type}_Report_${reportYear}-${monthStrPadded}.pdf`;
            
            const pdfReportData = {
                title: `${person} - ${detailedReportData.title}`,
                detailedData: detailedReportData,
                queueStatsTable: null, // No queue stats for detailed reports
                reportYear: reportYear,
                reportMonth: reportMonthZeroBased,
                isCombined: false,
                isDetailed: true // Flag for PDF service to identify detailed reports
            };
            
            reportsToProcess.push({
                type: 'pdf',
                fileName: fileName,
                data: pdfReportData
            });
        }
        
        // If detailed reports were generated, return now
        if (reportsToProcess.length > 0) {
            console.log(`Report Generator: Finished generating ${reportsToProcess.length} detailed reports.`);
            return { generatedReports: reportsToProcess, errors };
        } else {
            errors.push("No detailed report data found for the selected criteria.");
        }
    }
    
    const teamAggregatedObjectiveData = {};

    if ((!isTeamReport && format === 'csv' && shouldCombineOutputs) || (isTeamReport && format === 'csv')) {
        const csvReportType = isTeamReport ? "Team_Detail" : (isSelectAllIndividuals ? "All_Individuals" : "Selected_Individuals");
        console.log(`Preparing ${csvReportType} CSV (by Person)...`);
        const combinedCsvTableData = await _prepareCombinedIndividualDetailObjectiveTableDataCsv(
            allObjectiveData.persons, personsToIterate, selectedFoldersDisplayNames,
            { reportYear, reportMonth: reportMonthOneBased, includeWeekGaps }
        );
        if (combinedCsvTableData && (combinedCsvTableData.nonZeroEntriesFound || combinedCsvTableData.csvBody.length > 0)) {
            const csvContent = generateCsvContent(combinedCsvTableData.csvHeader, combinedCsvTableData.csvBody, null); // No queue for this CSV type
            const personCount = personsToIterate.length;
            let fileName = `${csvReportType}_Report_${reportYear}-${monthStrPadded}`;
            if (!isTeamReport && !isSelectAllIndividuals && personCount > 0) fileName += `_(${personCount}-persons)`;
            fileName += ".csv";
            reportsToProcess.push({ type: 'csv', fileName, content: csvContent });
        } else if (combinedCsvTableData) { /* ... create empty/header-only CSV ... */
             const csvContent = generateCsvContent(combinedCsvTableData.csvHeader || ['Person', 'Folder', 'Total'], [], null);
             reportsToProcess.push({ type: 'csv', fileName: `No_Data_${csvReportType}_${reportYear}-${monthStrPadded}.csv`, content: csvContent });
        } else { errors.push(`Failed to prepare ${csvReportType} CSV data.`); }
    } else {
        for (const person of personsToIterate) { // personsToIterate is sorted for combined PDF
            const personObjectiveDataForMonth = allObjectiveData.persons?.[person]?.[reportYear]?.[reportMonthOneBased];
            if (!personObjectiveDataForMonth) continue;
            let filteredObjectiveData = {}; /* ... folder filtering ... */
            if (selectedFoldersDisplayNames === null) { filteredObjectiveData = personObjectiveDataForMonth; }
             else if (Array.isArray(selectedFoldersDisplayNames)) { Object.entries(personObjectiveDataForMonth).forEach(([folderDispName, datesData]) => { if (selectedFoldersDisplayNames.includes(folderDispName)) { filteredObjectiveData[folderDispName] = datesData; } }); if (Object.keys(filteredObjectiveData).length === 0) continue; }

            const processedObjectiveData = await _preprocessAndShiftData(filteredObjectiveData, reportYear, reportMonthOneBased);
            if (!processedObjectiveData || Object.keys(processedObjectiveData).length === 0) continue;

            if (isTeamReport && format === 'pdf') { /* ... aggregate for team PDF ... */
                Object.entries(processedObjectiveData).forEach(([folderDisplayName, dates]) => {
                    if (!teamAggregatedObjectiveData[folderDisplayName]) teamAggregatedObjectiveData[folderDisplayName] = {};
                    Object.entries(dates).forEach(([date, count]) => {
                        teamAggregatedObjectiveData[folderDisplayName][date] = (teamAggregatedObjectiveData[folderDisplayName][date] || 0) + count;
                    });
                });
            } else if (!isTeamReport) {
                const isIndividualCsvFormat = format === 'csv';
                const objectiveTableData = await _prepareObjectiveTableData(processedObjectiveData, { reportYear, reportMonth: reportMonthOneBased, includeWeekGaps, format, isIndividualCsv: isIndividualCsvFormat });
                
                const fileNameBase = `${person}_Report_${reportYear}-${monthStrPadded}`;
                if (format === 'csv') { // Single individual CSV
                    if (objectiveTableData && objectiveTableData.csvHeader && objectiveTableData.csvBody) {
                        const csvContent = generateCsvContent(objectiveTableData.csvHeader, objectiveTableData.csvBody, null);
                        reportsToProcess.push({ type: 'csv', fileName: `${fileNameBase}.csv`, content: csvContent });
                    } else { errors.push(`Invalid objective CSV data for ${person}.`); }
                } else if (format === 'pdf') {
                    if (objectiveTableData && objectiveTableData.nonZeroEntriesFound) {
                        const pdfReportData = {
                            title: `${person} Report - ${MONTH_NAMES_FULL[reportMonthOneBased]} ${reportYear}`,
                            mainTable: { head: objectiveTableData.pdfHeader, body: objectiveTableData.pdfBody },
                            queueStatsTable: null, // Individual PDFs explicitly have no queue stats
                            reportYear: reportYear, reportMonth: reportMonthZeroBased, isCombined: false
                        };
                        if (shouldCombineOutputs) {
                           if (!combinedPdfData) combinedPdfData = { type: 'pdf', fileName: `Combined_Individuals_${reportYear}-${monthStrPadded}.pdf`, data: { reportYear, reportMonth: reportMonthZeroBased, isCombined: true, sections: [], combinedQueueStatsTable: null } }; // Initialize with null queue stats
                           combinedPdfData.data.sections.push({ person: person, title: pdfReportData.title, mainTable: pdfReportData.mainTable, queueStatsTable: null });
                        } else {
                           reportsToProcess.push({ type: 'pdf', fileName: `${fileNameBase}.pdf`, data: pdfReportData });
                        }
                    } else { console.warn(`Skipping PDF section for ${person}: No non-zero objective data.`); }
                }
            }
        }
    }

    if (combinedPdfData && combinedPdfData.data.sections.length > 0) {
        // combinedPdfData.data.combinedQueueStatsTable = queueStatsTableForPdf; // NO: Individual Combined PDF should not have overall queue stats
        combinedPdfData.data.combinedQueueStatsTable = null;
        if (combinedPdfData.data.sections.length === 1) { /* ... reformat to single report, ensure queueStatsTable is null ... */
            const singleSection = combinedPdfData.data.sections[0];
            combinedPdfData.fileName = `${singleSection.person}_Report_${reportYear}-${monthStrPadded}.pdf`;
            combinedPdfData.data = {
                title: singleSection.title,
                summary: { "Person": singleSection.person, "Period": `${MONTH_NAMES_FULL[reportMonthOneBased]} ${reportYear}` },
                mainTable: singleSection.mainTable,
                queueStatsTable: null, // Explicitly null for individual report even if it was single section from combined
                reportYear: reportYear, reportMonth: reportMonthZeroBased, isCombined: false
            };
        }
        reportsToProcess.push(combinedPdfData);
    }

    if (isTeamReport && format === 'pdf') { // Team PDF (aggregated by folder)
        console.log("Finalizing Team PDF Report generation...");
        const hasTeamObjectiveData = Object.keys(teamAggregatedObjectiveData).length > 0;
        if (hasTeamObjectiveData || queueStatsTableForPdf) { // Proceed if either objective data or queue stats exist for PDF
            let objectiveTableDataForPdf = null;
            if (hasTeamObjectiveData) {
                objectiveTableDataForPdf = await _prepareObjectiveTableData(teamAggregatedObjectiveData, { reportYear, reportMonth: reportMonthOneBased, includeWeekGaps, format, isIndividualCsv: false });
            }
            const pdfReportData = {
                title: `Team Report - ${MONTH_NAMES_FULL[reportMonthOneBased]} ${reportYear}`,
                summary: { "Report Type": "Team Aggregate", "Period": `${MONTH_NAMES_FULL[reportMonthOneBased]} ${reportYear}` },
                mainTable: objectiveTableDataForPdf?.nonZeroEntriesFound ? { head: objectiveTableDataForPdf.pdfHeader, body: objectiveTableDataForPdf.pdfBody } : null,
                queueStatsTable: queueStatsTableForPdf, // Team PDF includes queue stats if available
                reportYear: reportYear, reportMonth: reportMonthZeroBased, isCombined: false
            };
            reportsToProcess.push({ type: 'pdf', fileName: `Team_Report_${reportYear}-${monthStrPadded}.pdf`, data: pdfReportData });
        } else { errors.push("No data (objective or queue) found for team PDF report."); }
    }

    if (reportsToProcess.length === 0 && errors.length === 0) {
        const teamPdfWithOnlyQueue = isTeamReport && format === 'pdf' && queueStatsTableForPdf && personsToIterate.length === 0;
        const individualCombinedPdfWithOnlyQueue = !isTeamReport && format === 'pdf' && shouldCombineOutputs && queueStatsTableForPdf && personsToIterate.length > 0 && combinedPdfData?.data?.sections?.length === 0; // A bit complex, means combined PDF was initialized but no objective sections added

        if (!(personsToIterate.length === 0 && !teamPdfWithOnlyQueue && !isTeamReport && !individualCombinedPdfWithOnlyQueue)) {
             errors.push("No report data generated for the selection.");
        } else if (personsToIterate.length === 0 && isTeamReport && format === 'csv') {
             errors.push("No team members found with data for the selected period to generate a detailed team CSV.");
        }
    }
    console.log(`Report Generator: Finished. Reports: ${reportsToProcess.length}. Errors: ${errors.length}`);
    if(errors.length > 0) { console.warn("Report Generator finished with errors:", errors); }
    return { generatedReports: reportsToProcess, errors };
}
/**
 * Generate yearly reports with monthly breakdowns for each person
 * Creates a single PDF with:
 * - Page 1: Summary table with all persons in columns and folders in rows with yearly totals
 * - Subsequent pages: Monthly breakdown table for each person
 * @param {Array|null} selectedPersons - List of persons to include, or null for all
 * @param {Array|null} selectedFoldersDisplayNames - List of folders to include, or null for all
 * @param {Object} options - Report options
 * @returns {Object} Generated reports and any errors
 */
export async function generateYearlyReports(selectedPersons, selectedFoldersDisplayNames, options = {}) {
    const { reportYear, includeMonthlyBreakdowns = true } = options;
    console.log(`Yearly Report Generator: START for year ${reportYear}`);
    const errors = [];
    const reportsToProcess = [];
    
    if (!reportYear) {
        errors.push("Report year is required for yearly reports");
        return { generatedReports: [], errors };
    }
    
    // Load data
    let allObjectiveData;
    try {
        allObjectiveData = await StorageManager.retrieveAndDecompress(STORAGE_KEY_DATA);
    } catch (fetchError) {
        console.error("Failed to retrieve data:", fetchError);
        errors.push(`Failed to retrieve data: ${fetchError.message}`);
        return { generatedReports: [], errors };
    }
    
    // Determine which persons to include
    let personsToIterate = [];
    const personsWithDataInYear = Object.keys(allObjectiveData?.persons || {}).filter(p => 
        allObjectiveData.persons[p]?.[reportYear]
    );
    
    if (selectedPersons === null || (Array.isArray(selectedPersons) && selectedPersons.length === 0)) {
        personsToIterate = [...personsWithDataInYear].sort();
    } else if (Array.isArray(selectedPersons)) {
        personsToIterate = [...selectedPersons].filter(p => personsWithDataInYear.includes(p)).sort();
    }
    
    if (personsToIterate.length === 0) {
        errors.push(`No persons with data found for year ${reportYear}`);
        return { generatedReports: [], errors };
    }
    
    // Total team size = all persons with data in this year (before any exclusions)
    const totalTeamSize = personsWithDataInYear.length;
    
    // Prepare yearly report data for ALL persons together
    const yearlyReportData = await _prepareYearlyReportData(
        allObjectiveData.persons,
        personsToIterate,
        selectedFoldersDisplayNames,
        reportYear
    );
    
    // Prepare highest daily totals data (excluding batches) - top 4 per month
    const highestDailyData = _prepareHighestDailyTotals(
        allObjectiveData.persons,
        personsToIterate,
        reportYear
    );
    
    // Prepare highest weekly totals data (excluding batches) - top 4 per month
    const highestWeeklyData = _prepareHighestWeeklyTotals(
        allObjectiveData.persons,
        personsToIterate,
        reportYear
    );
    
    // Prepare highest monthly totals data (excluding batches) - top 4 per month
    const highestMonthlyData = _prepareHighestMonthlyTotals(
        allObjectiveData.persons,
        personsToIterate,
        reportYear
    );
    
    if (!yearlyReportData || !yearlyReportData.yearlyData || Object.keys(yearlyReportData.yearlyData).length === 0) {
        errors.push(`No yearly data found for selected persons in year ${reportYear}`);
        return { generatedReports: [], errors };
    }
    
    const fileName = `Yearly_Report_${reportYear}.pdf`;
    
    const pdfReportData = {
        title: `Yearly Report ${reportYear}`,
        yearlyData: yearlyReportData,
        highestDailyData: highestDailyData,
        highestWeeklyData: highestWeeklyData,
        highestMonthlyData: highestMonthlyData,
        reportYear: reportYear,
        isYearly: true,
        includeMonthlyBreakdowns: includeMonthlyBreakdowns,
        totalTeamSize: totalTeamSize,
        currentTeamMembers: personsToIterate.length
    };
    
    reportsToProcess.push({
        type: 'pdf',
        fileName: fileName,
        data: pdfReportData
    });
    
    console.log(`Yearly Report Generator: Finished. Reports: ${reportsToProcess.length}. Errors: ${errors.length}`);
    if (errors.length > 0) {
        console.warn("Yearly Report Generator finished with errors:", errors);
    }
    return { generatedReports: reportsToProcess, errors };
}
