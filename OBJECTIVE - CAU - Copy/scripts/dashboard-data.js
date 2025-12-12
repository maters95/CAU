// TEST-works/scripts/dashboard-data.js
'use strict';
import { holidayService } from './holiday-service.js';
import { getWeekNumber, generateChartColors, formatLabel } from './utils.js';
import { 
    filterState, 
    setCachedPrevPeriodMetrics, 
    setCurrentFolderPersonBreakdown, 
    setCurrentPersonFolderBreakdown 
} from './dashboard-state.js';
import { updateDashboardStatus, updateKpiCards } from './dashboard-ui.js';
import { BATCH_FOLDER_DISPLAY_NAMES_TO_EXCLUDE, MONTH_NAMES, DAY_NAMES } from './constants.js';
import { StorageManager } from './storage-manager.js';

function getDayWithOrdinal(day) { if (day > 3 && day < 21) return `${day}th`; switch (day % 10) { case 1: return `${day}st`; case 2: return `${day}nd`; case 3: return `${day}rd`; default: return `${day}th`; } }
function formatDateForKpi(dateString) { try { const date = new Date(dateString); const dayOfWeek = DAY_NAMES[date.getUTCDay()]; const dayOfMonth = getDayWithOrdinal(date.getUTCDate()); return `${dayOfWeek} ${dayOfMonth}`; } catch (e) { return dateString; } }

export function getSelectedFolders() { const container = document.getElementById('folderContainer'); const selectAll = document.getElementById('selectAllFolders'); if (!container || !selectAll) return []; const available = container.querySelectorAll('.filter-item input[type="checkbox"]:not(:disabled)'); if (available.length === 0) return []; if (selectAll.checked && !selectAll.indeterminate) return null; const selected = []; available.forEach(cb => { if (cb.checked) selected.push(cb.value); }); return selected; }
export function getSelectedPeople() { const container = document.getElementById('peopleContainer'); const selectAll = document.getElementById('selectAllPeople'); if (!container || !selectAll) return []; const checkboxes = container.querySelectorAll('.filter-item input[type="checkbox"]'); if (checkboxes.length === 0) return []; if (selectAll.checked && !selectAll.indeterminate) return null; const selected = []; checkboxes.forEach(cb => { if (cb.checked) selected.push(cb.value); }); return selected; }
export function getSelectedPeriod() { const yearSelect = document.getElementById('year-select'); const monthSelect = document.getElementById('monthSelect'); const year = yearSelect ? parseInt(yearSelect.value, 10) : null; const month = monthSelect ? parseInt(monthSelect.value, 10) : null; const isValidYear = yearSelect && yearSelect.value !== "" && !isNaN(year); const isValidMonth = monthSelect && monthSelect.value !== "" && !isNaN(month) && month >= 1 && month <= 12; return { selectedYear: isValidYear ? year : null, selectedMonth: isValidMonth ? month : null }; }

async function getWorkdaysInMonth(year, month) {
    if (!holidayService.isInitialized) await holidayService.initialize();
    const dates = [];
    const date = new Date(Date.UTC(year, month - 1, 1));
    while (date.getUTCMonth() === month - 1) {
        dates.push(date.toISOString().slice(0, 10));
        date.setUTCDate(date.getUTCDate() + 1);
    }
    const holidaysArray = await holidayService.getHolidays();
    const holidays = new Set(holidaysArray);
    return dates.filter(dateStr => {
        const d = new Date(`${dateStr}T00:00:00Z`);
        const dayOfWeek = d.getUTCDay();
        return dayOfWeek !== 0 && dayOfWeek !== 6 && !holidays.has(dateStr);
    });
}

export function updateTrendsPeriodState(selectedPeriod) { const customDateContainer = document.getElementById('customDateRangeContainer'); filterState.trendsPeriod = selectedPeriod; const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; const today = new Date(); today.setHours(0, 0, 0, 0); const dailyOmissionPeriods = ['this-week-daily', 'last-week-daily', 'mtd-daily']; filterState.omitEmptyTrendKeys = dailyOmissionPeriods.includes(selectedPeriod); if (customDateContainer) customDateContainer.classList.add('hidden'); switch (selectedPeriod) { case 'monthly-view-daily': case 'monthly-view-weekly': const { selectedYear, selectedMonth } = getSelectedPeriod(); if(selectedYear && selectedMonth) { const startDate = new Date(selectedYear, selectedMonth - 1, 1); const endDate = new Date(selectedYear, selectedMonth, 0); filterState.trendsStartDate = formatDate(startDate); filterState.trendsEndDate = formatDate(endDate); } else { filterState.trendsStartDate = null; filterState.trendsEndDate = null; updateDashboardStatus("Select a month and year for this trend view.", true); } break; case 'this-week-daily': const firstDayOfWeek = new Date(today); firstDayOfWeek.setDate(today.getDate() - today.getDay()); filterState.trendsStartDate = formatDate(firstDayOfWeek); filterState.trendsEndDate = formatDate(today); break; case 'last-week-daily': const endOfLastWeek = new Date(today); endOfLastWeek.setDate(today.getDate() - today.getDay() - 1); const startOfLastWeek = new Date(endOfLastWeek); startOfLastWeek.setDate(endOfLastWeek.getDate() - 6); filterState.trendsStartDate = formatDate(startOfLastWeek); filterState.trendsEndDate = formatDate(endOfLastWeek); break; case 'mtd-daily': case 'mtd-weekly': const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1); filterState.trendsStartDate = formatDate(firstDayOfMonth); filterState.trendsEndDate = formatDate(today); break; case 'custom': if (customDateContainer) customDateContainer.classList.remove('hidden'); const startDateInput = document.getElementById('trendsStartDate'); const endDateInput = document.getElementById('trendsEndDate'); filterState.trendsStartDate = startDateInput?.value || null; filterState.trendsEndDate = endDateInput?.value || null; break; default: const numMonths = parseInt(selectedPeriod, 10); if (!isNaN(numMonths) && numMonths > 0) { const endDate = new Date(); const startDate = new Date(endDate); startDate.setMonth(endDate.getMonth() - (numMonths -1)); startDate.setDate(1); filterState.trendsStartDate = formatDate(startDate); filterState.trendsEndDate = formatDate(endDate); } else { console.warn("Invalid trends period:", selectedPeriod); filterState.trendsStartDate = null; filterState.trendsEndDate = null; } break; } console.log(`Dashboard: Trends period '${selectedPeriod}' set: ${filterState.trendsStartDate} to ${filterState.trendsEndDate}`); }

export function getTrendsDateRange() { if (filterState.trendsPeriod === 'custom') { const startDateInput = document.getElementById('trendsStartDate'); const endDateInput = document.getElementById('trendsEndDate'); const start = startDateInput?.value; const end = endDateInput?.value; if (!start || !end) { updateDashboardStatus("Select Start/End dates.", true); return null; } if (start > end) { updateDashboardStatus("Start date after end date.", true); return null; } filterState.trendsStartDate = start; filterState.trendsEndDate = end; return { startDate: start, endDate: end }; } else { if (!filterState.trendsStartDate || !filterState.trendsEndDate) { updateTrendsPeriodState(filterState.trendsPeriod); if (!filterState.trendsStartDate || !filterState.trendsEndDate) { console.error("Failed trend date calc."); updateDashboardStatus("Error calculating date range.", true); return null; } } return { startDate: filterState.trendsStartDate, endDate: filterState.trendsEndDate }; } }

function generateChartLabels(startDateStr, endDateStr, granularity) { const labels = []; const keys = []; try { if (!startDateStr || !endDateStr) throw new Error("Start or end date missing"); const start = new Date(startDateStr); const end = new Date(endDateStr); start.setUTCHours(0,0,0,0); end.setUTCHours(0,0,0,0); if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error("Invalid start or end date format"); let current = new Date(start); if (granularity === 'monthly') { current.setUTCDate(1); while (current <= end) { const year = current.getUTCFullYear(); const month = current.getUTCMonth(); labels.push(`${MONTH_NAMES[month]} ${year}`); keys.push(`${year}-${String(month + 1).padStart(2, '0')}`); current.setUTCMonth(current.getUTCMonth() + 1); } } else if (granularity === 'weekly') { let processedWeeks = new Set(); while (current <= end) { const year = current.getUTCFullYear(); const week = getWeekNumber(current); const weekKey = `${year}-W${String(week).padStart(2, '0')}`; if (!processedWeeks.has(weekKey)) { labels.push(weekKey); keys.push(weekKey); processedWeeks.add(weekKey); } current.setDate(current.getDate() + 1); } } else { while (current <= end) { const year = current.getUTCFullYear(); const month = current.getUTCMonth() + 1; const day = current.getUTCDate(); const dayKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; labels.push(dayKey); keys.push(dayKey); current.setDate(current.getDate() + 1); } } } catch (e) { console.error("Error generating chart labels:", e); return { labels: [], keys: [] }; } return { labels, keys }; }

function getKeyForDate(date, granularity) { const year = date.getUTCFullYear(); const month = date.getUTCMonth() + 1; if (granularity === 'monthly') { return `${year}-${String(month).padStart(2, '0')}`; } if (granularity === 'weekly') { const week = getWeekNumber(date); return `${year}-W${String(week).padStart(2, '0')}`; } const day = date.getUTCDate(); return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }

// *** ENHANCED: Multi-source data loading with fallback support ***
async function loadDataWithComprehensiveFallback() {
    console.log("Dashboard Data: Loading with comprehensive fallback...");
    
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
            console.log("Dashboard Data: Trying StorageManager IndexedDB...");
            const indexedData = await StorageManager.retrieveAndDecompress('objectiveData');
            if (indexedData && indexedData.persons && Object.keys(indexedData.persons).length > 0) {
                console.log(`Dashboard Data: Retrieved from IndexedDB - ${Object.keys(indexedData.persons).length} persons`);
                return indexedData;
            }
        }

        // Method 2: Try browser storage for objectiveCumulativeData
        console.log("Dashboard Data: Trying browser storage for objectiveCumulativeData...");
        const browserAPI = (typeof chrome !== 'undefined') ? chrome : (typeof browser !== 'undefined' ? browser : null);
        if (browserAPI && browserAPI.storage) {
            const result = await new Promise((resolve) => {
                browserAPI.storage.local.get('objectiveCumulativeData', resolve);
            });
            
            if (result.objectiveCumulativeData) {
                console.log("Dashboard Data: Found objectiveCumulativeData, parsing...");
                const parsedData = await parseObjectiveCumulativeDataForDashboard(result.objectiveCumulativeData);
                if (parsedData && parsedData.persons && Object.keys(parsedData.persons).length > 0) {
                    console.log(`Dashboard Data: Parsed cumulative data - ${Object.keys(parsedData.persons).length} persons`);
                    return parsedData;
                }
            }
        }

        // Method 3: Try direct storage key
        console.log("Dashboard Data: Trying direct storage access...");
        if (browserAPI && browserAPI.storage) {
            const directResult = await new Promise((resolve) => {
                browserAPI.storage.local.get('objectiveData', resolve);
            });
            
            if (directResult.objectiveData && directResult.objectiveData.persons) {
                console.log(`Dashboard Data: Found direct storage data - ${Object.keys(directResult.objectiveData.persons).length} persons`);
                return directResult.objectiveData;
            }
        }

        console.log("Dashboard Data: No data found in any source, returning empty structure");
        return { persons: {}, folders: {} };

    } catch (error) {
        console.error("Dashboard Data: Error in comprehensive data loading:", error);
        return { persons: {}, folders: {} };
    }
}

// *** ENHANCED: Parse objectiveCumulativeData format ***
async function parseObjectiveCumulativeDataForDashboard(cumulativeData) {
    try {
        if (!cumulativeData || !cumulativeData.data) {
            console.warn("Dashboard Data: No data in objectiveCumulativeData");
            return null;
        }

        let rawData = cumulativeData.data;
        
        // Handle compression if present
        if (cumulativeData.compressed && typeof StorageManager !== 'undefined' && StorageManager.pako && !StorageManager.pako.error) {
            try {
                console.log('Dashboard Data: Decompressing objective data...');
                rawData = StorageManager.pako.inflate(rawData, { to: 'string' });
            } catch (decompressError) {
                console.error('Dashboard Data: Decompression failed:', decompressError);
                // Continue with raw data
            }
        }

        // Parse JSON if it's a string
        let statsData;
        if (typeof rawData === 'string') {
            try {
                statsData = JSON.parse(rawData);
                console.log('Dashboard Data: Successfully parsed JSON from string');
            } catch (parseError) {
                console.error('Dashboard Data: JSON parsing failed:', parseError);
                return null;
            }
        } else if (typeof rawData === 'object' && rawData !== null) {
            statsData = rawData;
            console.log('Dashboard Data: Using object data directly');
        } else {
            console.error('Dashboard Data: Unexpected data type:', typeof rawData);
            return null;
        }

        // Transform to dashboard format
        return transformStatsToDashboardFormat(statsData);

    } catch (error) {
        console.error('Dashboard Data: Error parsing cumulative data:', error);
        return null;
    }
}

// *** ENHANCED: Transform stats data to dashboard format ***
function transformStatsToDashboardFormat(statsData) {
    try {
        console.log('Dashboard Data: Transforming stats data to dashboard format...');
        
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
                        console.log('Dashboard Data: Data is already in dashboard format');
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
        console.log(`Dashboard Data: Transformed data for ${personCount} persons`);
        
        return dashboardData;

    } catch (error) {
        console.error('Dashboard Data: Error transforming stats data:', error);
        return { persons: {}, folders: {} };
    }
}

async function _calculateMetricsForPeriod(sourceData, year, month, peopleFilter, folderFilter, workdaysToInclude = null) {
    const metrics = { monthlyDistribution: {}, volumeBreakdown: {}, kpiData: {}, activeDays: {people: {}, folders: {}}, consistencyScores: {}, personDailyTotals: {}, folderDailyTotals: {}, personFolderBreakdown: {}, folderPersonBreakdown: {} };
    if (!year || !month || !sourceData?.persons) return metrics;
    let peopleToProcess = (peopleFilter === null) ? Object.keys(sourceData.persons) : (peopleFilter || []);
    const dailyTotals = {}; const personDailyTotals = {}; const activeDaysPeople = {}; const activeDaysFolders = {};
    const workdaySet = workdaysToInclude ? new Set(workdaysToInclude) : null;
    peopleToProcess.forEach(person => {
        personDailyTotals[person] = {};
        metrics.personFolderBreakdown[person] = {};
        const personMonthData = sourceData.persons[person]?.[year]?.[month];
        if (!personMonthData) return;
        Object.entries(personMonthData).forEach(([folderDisplayName, datesData]) => {
            let folderTotalForPerson = 0;
            if (typeof datesData === 'object' && datesData !== null) {
                const includeFolder = (folderFilter === null) || (Array.isArray(folderFilter) && folderFilter.includes(folderDisplayName));
                if (includeFolder) {
                    Object.entries(datesData).forEach(([date, num]) => {
                        if (workdaySet && !workdaySet.has(date)) return;
                        const count = Number.isFinite(num) ? num : 0;
                        if (count > 0) {
                            if (!(filterState.excludeBatchesGlobally && BATCH_FOLDER_DISPLAY_NAMES_TO_EXCLUDE.has(folderDisplayName))) {
                                dailyTotals[date] = (dailyTotals[date] || 0) + count;
                                personDailyTotals[person][date] = (personDailyTotals[person][date] || 0) + count;
                                metrics.folderDailyTotals[folderDisplayName] = metrics.folderDailyTotals[folderDisplayName] || {};
                                metrics.folderDailyTotals[folderDisplayName][date] = (metrics.folderDailyTotals[folderDisplayName][date] || 0) + count;
                                metrics.personFolderBreakdown[person][folderDisplayName] = (metrics.personFolderBreakdown[person][folderDisplayName] || 0) + count;
                                metrics.folderPersonBreakdown[folderDisplayName] = metrics.folderPersonBreakdown[folderDisplayName] || {};
                                metrics.folderPersonBreakdown[folderDisplayName][person] = (metrics.folderPersonBreakdown[folderDisplayName][person] || 0) + count;
                            }
                            if (!activeDaysPeople[person]) activeDaysPeople[person] = new Set();
                            activeDaysPeople[person].add(date);
                            if (!activeDaysFolders[folderDisplayName]) activeDaysFolders[folderDisplayName] = new Set();
                            activeDaysFolders[folderDisplayName].add(date);
                            folderTotalForPerson += count;
                        }
                    });
                }
            }
            if (folderTotalForPerson > 0) {
                const includeFolder = (folderFilter === null) || (Array.isArray(folderFilter) && folderFilter.includes(folderDisplayName));
                if (includeFolder && !(filterState.excludeBatchesGlobally && BATCH_FOLDER_DISPLAY_NAMES_TO_EXCLUDE.has(folderDisplayName))) {
                    metrics.monthlyDistribution[folderDisplayName] = (metrics.monthlyDistribution[folderDisplayName] || 0) + folderTotalForPerson;
                    metrics.volumeBreakdown[person] = (metrics.volumeBreakdown[person] || 0) + folderTotalForPerson;
                }
            }
        });
    });
    metrics.personDailyTotals = personDailyTotals;
    Object.keys(personDailyTotals).forEach(person => {
        const dailyCounts = Object.values(personDailyTotals[person]);
        if (dailyCounts.length > 1) {
            const mean = dailyCounts.reduce((a, b) => a + b, 0) / dailyCounts.length;
            const variance = dailyCounts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / dailyCounts.length;
            metrics.consistencyScores[person] = Math.sqrt(variance);
        } else {
            metrics.consistencyScores[person] = 0;
        }
    });
    Object.keys(activeDaysPeople).forEach(p => metrics.activeDays.people[p] = activeDaysPeople[p].size);
    Object.keys(activeDaysFolders).forEach(f => metrics.activeDays.folders[f] = activeDaysFolders[f].size);
    
    metrics.kpiData.totalProcessed = Object.values(dailyTotals).reduce((sum, count) => sum + count, 0);
    const activePeopleCount = Object.keys(metrics.volumeBreakdown).length || 1;
    metrics.kpiData.avgPerPerson = (metrics.kpiData.totalProcessed / activePeopleCount);
    const topPerformerEntry = Object.entries(metrics.volumeBreakdown).sort(([,a],[,b]) => b-a)[0];
    metrics.kpiData.topPerformer = topPerformerEntry ? topPerformerEntry[0] : (filterState.drilldownEntity || '-');
    const busiestDayEntry = Object.entries(dailyTotals).sort(([,a],[,b]) => b-a)[0];
    metrics.kpiData.busiestDay = busiestDayEntry ? `${formatDateForKpi(busiestDayEntry[0])}: ${busiestDayEntry[1]}` : '-';
    metrics.kpiData.busiestDayDate = busiestDayEntry ? busiestDayEntry[0] : null;
    let peakPerformance = { person: '-', date: '-', count: 0 };
    Object.entries(personDailyTotals).forEach(([person, dailyData]) => {
        Object.entries(dailyData).forEach(([date, count]) => {
            if (count > peakPerformance.count) {
                peakPerformance = { person, date, count };
            }
        });
    });
    metrics.kpiData.peakPerformance = { ...peakPerformance, date: formatDateForKpi(peakPerformance.date) };
    const contributorsPerDay = {};
    Object.values(personDailyTotals).forEach(dailyData => {
        Object.keys(dailyData).forEach(date => {
            contributorsPerDay[date] = (contributorsPerDay[date] || 0) + 1;
        });
    });
    let dailyAverages = [];
    Object.entries(dailyTotals).forEach(([date, totalCount]) => {
        const numContributors = contributorsPerDay[date] || 1;
        dailyAverages.push(totalCount / numContributors);
    });
    let finalDailyAverage = 0;
    if (dailyAverages.length > 0) {
        finalDailyAverage = dailyAverages.reduce((sum, avg) => sum + avg, 0) / dailyAverages.length;
    }
    metrics.kpiData.avgDailyPerPerson = finalDailyAverage;

    return metrics;
}

export async function aggregateDataForDashboard(sourceData, year, storageMonth, peopleFilter, folderFilter, trendStartDate, trendEndDate) {
    const dashboardAggregates = { monthlyDistribution: {}, volumeBreakdown: {}, kpiData: {}, trendsChartData: { labels: [], datasets: [] }, trendsTableData: null, activeDays: {people:{}, folders:{}}, consistencyScores: {}, personDailyTotals: {}, folderDailyTotals: {}, personFolderBreakdown: {}, folderPersonBreakdown: {} };
    
    // *** ENHANCED: Use enhanced data loading if sourceData is empty or missing ***
    let workingData = sourceData;
    if (!sourceData || !sourceData.persons || Object.keys(sourceData.persons).length === 0) {
        console.log("Dashboard Data: Source data is empty, using enhanced loading...");
        workingData = await loadDataWithComprehensiveFallback();
    }
    
    // Validate we have data after all attempts
    if (!workingData || !workingData.persons || Object.keys(workingData.persons).length === 0) {
        console.warn("Dashboard Data: No data available after all loading attempts");
        updateKpiCards({}, {});
        return dashboardAggregates;
    }
    
    console.log(`Dashboard Data: Working with data containing ${Object.keys(workingData.persons).length} persons`);
    
    if (!year || !storageMonth) {
        updateKpiCards({}, {});
        return dashboardAggregates;
    }
    
    const fullCurrentMonthMetrics = await _calculateMetricsForPeriod(workingData, year, storageMonth, peopleFilter, folderFilter, null);
    let prevYear = year; let prevMonth = storageMonth - 1; if (prevMonth === 0) { prevMonth = 12; prevYear = year - 1; }
    const fullPreviousMonthMetrics = await _calculateMetricsForPeriod(workingData, prevYear, prevMonth, peopleFilter, folderFilter, null);
    
    setCachedPrevPeriodMetrics(fullPreviousMonthMetrics);
    
    const today = new Date();
    const isCurrentMonth = (year === today.getFullYear() && storageMonth === today.getMonth() + 1);
    const currentWorkdays = await getWorkdaysInMonth(year, storageMonth);
    const workdaysSoFar = isCurrentMonth ? currentWorkdays.filter(d => new Date(d) <= today) : currentWorkdays;
    
    if (workdaysSoFar.length > 0) {
        const runRate = fullCurrentMonthMetrics.kpiData.totalProcessed / workdaysSoFar.length;
        fullCurrentMonthMetrics.kpiData.forecastedTotal = runRate * currentWorkdays.length;
        fullCurrentMonthMetrics.kpiData.runRate = runRate;
    }
    
    const prevWorkdays = await getWorkdaysInMonth(prevYear, prevMonth);
    const prevWorkdaysForComparison = prevWorkdays.slice(0, workdaysSoFar.length);
    const currentPartialMetrics = await _calculateMetricsForPeriod(workingData, year, storageMonth, peopleFilter, folderFilter, workdaysSoFar);
    const previousPartialMetrics = await _calculateMetricsForPeriod(workingData, prevYear, prevMonth, peopleFilter, folderFilter, prevWorkdaysForComparison);

    Object.assign(dashboardAggregates, fullCurrentMonthMetrics);
    
    const finalKpiData = { ...fullCurrentMonthMetrics.kpiData };
    const comparisonKpiData = {
        ...fullPreviousMonthMetrics.kpiData,
        totalProcessed: previousPartialMetrics.kpiData.totalProcessed,
        avgPerPerson: previousPartialMetrics.kpiData.avgPerPerson,
        avgDailyPerPerson: previousPartialMetrics.kpiData.avgDailyPerPerson
    };
    updateKpiCards(finalKpiData, comparisonKpiData);

    if (trendStartDate && trendEndDate) { try { const peopleForTrend = filterState.drilldownEntity && filterState.drilldownType === 'person' ? [filterState.drilldownEntity] : ((peopleFilter === null) ? Object.keys(workingData.persons) : (peopleFilter || [])); const trendFunc = filterState.trendsMode === 'folders' ? prepareLineChartDataByFolder : prepareLineChartDataByPerson; const { chartData, tableData } = trendFunc(workingData, peopleForTrend, folderFilter, filterState.showTrendsTotal, trendStartDate, trendEndDate, filterState.excludeBatchesGlobally, filterState.trendsGranularity, filterState.omitEmptyTrendKeys); dashboardAggregates.trendsChartData = chartData; dashboardAggregates.trendsTableData = tableData; } catch (trendError) { console.error("Error preparing trends data:", trendError); } }
    
    setCurrentPersonFolderBreakdown(dashboardAggregates.personFolderBreakdown);
    setCurrentFolderPersonBreakdown(dashboardAggregates.folderPersonBreakdown);
    
    return dashboardAggregates;
}

function prepareLineChartData(sourceData, peopleFilter, folderFilter, showTotal, startDate, endDate, excludeBatches, granularity, mode, omitEmptyKeys) {
    let { labels, keys: trendKeys } = generateChartLabels(startDate, endDate, granularity);
    const chartDatasets = [];
    const emptyReturn = { chartData: { labels, datasets: [] }, tableData: { headers: [], rows: [] } };
    if (!sourceData?.persons || trendKeys.length === 0) return emptyReturn;

    const peopleToProcess = (peopleFilter === null) ? Object.keys(sourceData.persons) : (peopleFilter || []);
    const dataByEntity = {};
    const keysWithData = new Set();

    peopleToProcess.forEach(person => {
        const personData = sourceData.persons[person];
        if (!personData) return;
        Object.keys(personData).forEach(year => {
            Object.keys(personData[year]).forEach(monthNum => {
                const monthData = personData[year][monthNum];
                Object.keys(monthData).forEach(folderDisplayName => {
                    const datesData = monthData[folderDisplayName];
                    const includeFolder = (folderFilter === null || folderFilter.includes(folderDisplayName)) && !(excludeBatches && BATCH_FOLDER_DISPLAY_NAMES_TO_EXCLUDE.has(folderDisplayName));
                    if (includeFolder && typeof datesData === 'object' && datesData !== null) {
                        Object.entries(datesData).forEach(([dateStr, count]) => {
                            const entryDate = new Date(`${dateStr}T00:00:00Z`);
                            const startRange = new Date(`${startDate}T00:00:00Z`);
                            const endRange = new Date(`${endDate}T23:59:59Z`);
                            if (entryDate >= startRange && entryDate <= endRange) {
                                const entityName = mode === 'folders' ? folderDisplayName : person;
                                const dateKey = getKeyForDate(entryDate, granularity);
                                const numericCount = Number.isFinite(count) ? count : 0;
                                if (!dataByEntity[entityName]) {
                                    dataByEntity[entityName] = {};
                                    trendKeys.forEach(key => dataByEntity[entityName][key] = 0);
                                }
                                if (dataByEntity[entityName].hasOwnProperty(dateKey)) {
                                    dataByEntity[entityName][dateKey] += numericCount;
                                    if (numericCount > 0) keysWithData.add(dateKey);
                                }
                            }
                        });
                    }
                });
            });
        });
    });

    if (omitEmptyKeys && keysWithData.size > 0) {
        const filteredIndexes = trendKeys.map((key, index) => keysWithData.has(key) ? index : -1).filter(index => index !== -1);
        labels = filteredIndexes.map(index => labels[index]);
        trendKeys = filteredIndexes.map(index => trendKeys[index]);
    }

    const entityTotals = {};
    Object.entries(dataByEntity).forEach(([entityName, keyData]) => {
        entityTotals[entityName] = Object.values(keyData).reduce((sum, count) => sum + count, 0);
    });

    const sortedEntities = Object.entries(entityTotals).filter(([, total]) => total > 0).sort(([, totalA], [, totalB]) => totalB - totalA).map(([entityName]) => entityName);
    const top5Entities = sortedEntities.slice(0, 5);
    const top10Entities = sortedEntities.slice(0, 10);
    const colors = generateChartColors(top5Entities.length + (showTotal ? 1 : 0));

    top5Entities.forEach((entityName, index) => {
        const dataPoints = trendKeys.map(key => dataByEntity[entityName]?.[key] || 0);
        if (dataPoints.some(p => p > 0)) {
            chartDatasets.push({ label: formatLabel(entityName), data: dataPoints, borderColor: colors[index % colors.length], backgroundColor: colors[index % colors.length] + '1A', tension: 0.1, fill: false, pointRadius: 3, pointHoverRadius: 5 });
        }
    });

    const allTotalsPerKey = trendKeys.map(key => Object.values(dataByEntity).reduce((sum, entityData) => sum + (entityData[key] || 0), 0));
    if (showTotal && chartDatasets.length > 0) {
        if (allTotalsPerKey.some(v => v > 0)) {
            chartDatasets.push({ label: 'Total', data: allTotalsPerKey, borderColor: '#cccccc', backgroundColor: 'rgba(204, 204, 204, 0.1)', tension: 0.1, fill: false, borderDash: [5, 5], pointRadius: 3, pointHoverRadius: 5 });
        }
    }
    
    const tableHeaders = ['Period', ...top10Entities.map(formatLabel), 'Total'];
    const tableRows = trendKeys.map((key, index) => [labels[index], ...top10Entities.map(entity => dataByEntity[entity]?.[key] || 0), allTotalsPerKey[index] || 0]);
    const columnTotals = top10Entities.map(entity => entityTotals[entity] || 0);
    const grandTotal = allTotalsPerKey.reduce((sum, total) => sum + total, 0);
    const totalRow = ['Total', ...columnTotals, grandTotal];
    tableRows.push(totalRow);
    console.log(`Trends Prep (${mode} - Granularity: ${granularity}): Prepared ${chartDatasets.length} datasets for ${labels.length} keys.`);
    
    return { chartData: { labels, datasets: chartDatasets }, tableData: { headers: tableHeaders, rows: tableRows } };
}

export function prepareLineChartDataByFolder(sourceData, peopleFilter, folderFilter, showTotal, startDate, endDate, excludeBatches, granularity, omitEmptyKeys) { return prepareLineChartData(sourceData, peopleFilter, folderFilter, showTotal, startDate, endDate, excludeBatches, granularity, 'folders', omitEmptyKeys); }
export function prepareLineChartDataByPerson(sourceData, peopleFilter, folderFilter, showTotal, startDate, endDate, excludeBatches, granularity, omitEmptyKeys) { return prepareLineChartData(sourceData, peopleFilter, folderFilter, showTotal, startDate, endDate, excludeBatches, granularity, 'people', omitEmptyKeys); }