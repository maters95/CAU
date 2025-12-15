const CONFIG = {
    CONSOLE_LOGGING_ENABLED: !0,
    CLOSE_DELAY_MS: 2e3,
    INITIAL_DELAY_MS: 3e3,
    MAX_SCROLL_WAIT_MS: 3e4,
    ITEM_LOAD_CHECK_INTERVAL_MS: 200,
    ITEM_LOAD_MAX_WAIT_MS: 3e4,
    STORE_RUN_HISTORY_DAYS: 30,
};
let SELECTOR_CONFIG = null;
window.scriptBExtractionReports || (window.scriptBExtractionReports = []);
const FOLDER_CONFIG_KEY = "ecmFolders";

function log(level, message, ...details) {
    if (!CONFIG.CONSOLE_LOGGING_ENABLED && "debug" === level) return;
    const timestamp = new Date().toISOString(),
        prefix = `[ScriptB ${timestamp}]`;
    CONFIG.CONSOLE_LOGGING_ENABLED && console["error" === level ? "error" : "log"](`${prefix} ${message}`, ...details);
    try {
        browserAPI?.runtime?.sendMessage &&
            browserAPI.runtime.sendMessage({
                action: "logFromScript",
                payload: { script: "ScriptB", level: level, message: message, details: details, timestamp: timestamp },
            });
    } catch (e) {}
}

function logError(message, error, context = {}) {
    log("error", message, { error: error?.message, stack: error?.stack, ...context });
    try {
        browserAPI?.runtime?.sendMessage &&
            browserAPI.runtime.sendMessage({
                action: "logError",
                error: `ScriptB: ${message}`,
                context: { errorMessage: error?.message, stack: error?.stack, ...context },
                severity: "high",
            });
    } catch (e) {}
}

function sendMessageToBackground(message) {
    try {
        browserAPI?.runtime?.sendMessage && browserAPI.runtime.sendMessage(message);
    } catch (e) {
        log("error", "Failed to send message to background", e);
    }
}

async function loadFolderConfigByUrl() {
    try {
        const currentUrl = window.location.href;
        const result = await new Promise((resolve, reject) => {
            browserAPI.storage.local.get(FOLDER_CONFIG_KEY, (data) => {
                browserAPI.runtime.lastError ? reject(browserAPI.runtime.lastError) : resolve(data);
            });
        });
        
        const folders = result[FOLDER_CONFIG_KEY] || [];
        log("debug", `Loaded ${folders.length} folder configurations for URL matching`);
        
        for (const folder of folders) {
            const urls = folder.urls || [];
            for (const url of urls) {
                if (url && currentUrl.includes(url.trim())) {
                    log("info", `✅ Matched folder config: "${folder.name}" (URL: ${url})`);
                    return folder;
                }
            }
        }
        
        log("debug", "No matching folder configuration found for current URL");
        return null;
    } catch (error) {
        log("error", "Failed to load folder configuration:", error);
        return null;
    }
}

function getFolderNameFromDOM() {
    const selectors = SELECTOR_CONFIG ? SELECTOR_CONFIG.folderNameSelectors : ["div.MuiBox-root.css-s8z3ro > h1"];
    for (const selector of selectors)
        try {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
                const folderName = element.textContent
                    .trim()
                    .replace(/[\/:*?"<>|]/g, "")
                    .trim();
                return (
                    log("info", `📁 Folder name extracted from DOM: "${folderName}" (using selector: ${selector})`), folderName
                );
            }
        } catch (error) {
            log("warn", `⚠️ Invalid selector for folder name: ${selector}`, error);
        }
    const titleElement = document.querySelector("head > title");
    if (titleElement) {
        const folderName = titleElement.textContent.replace(/\s*-\s*Objective ECM$/, "").trim();
        return log("warn", `📁 Folder name from title fallback: "${folderName}"`), folderName;
    }
    return log("error", "❌ Could not extract folder name from any selector"), "Unknown Folder";
}

async function getFolderName() {
    const folderConfig = await loadFolderConfigByUrl();
    if (folderConfig && folderConfig.name) {
        let folderName = folderConfig.name;
        if (folderConfig.year) {
            folderName = folderName.replace(new RegExp(`^${folderConfig.year}\\s+`), '');
        }
        log("info", `📁 Using saved folder name: "${folderName}" (from configuration)`);
        return folderName;
    }
    
    log("info", "📁 No saved configuration found, extracting folder name from page");
    return getFolderNameFromDOM();
}

function isDataTablePresent() {
    const tableSelector = SELECTOR_CONFIG
            ? SELECTOR_CONFIG.tableSelector
            : "div.queryResultComponent__scrollContainer > table",
        table = document.querySelector(tableSelector);
    if (table) {
        return (
            log(
                "info",
                `✅ Table found with ${table.querySelectorAll("tbody > tr").length} rows using selector: "${tableSelector}"`
            ),
            { found: !0, isEmpty: !1 }
        );
    }
    return document.querySelector(
        "body > div.layout > div.layout__main > div.layout__viewport > div > xen-queries > div > div.navigationLayoutComponent > div.navigationLayoutComponent__content.layout__body > div > div:nth-child(3) > div.queryResultComponent__noContent > p"
    )
        ? (log("info", "🔭 Folder is empty - no results found"), { found: !1, isEmpty: !0 })
        : (log("debug", `⏳ Table not found with selector: "${tableSelector}"`), { found: !1, isEmpty: !1 });
}

function extractPersonIdentifier(nameText) {
    if (!nameText || "string" != typeof nameText) return null;
    const cleaned = nameText.trim(),
        fullNameMatch = cleaned.match(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/);
    if (fullNameMatch) return `${fullNameMatch[1]} ${fullNameMatch[2]}`;
    const initialsMatch = cleaned.match(/\b([A-Z]{2,3})\b/);
    return initialsMatch ? initialsMatch[1] : cleaned;
}

function extractCountFromText(countText) {
    if (!countText || "string" != typeof countText)
        return { count: 1, rule: "default", matched: null };
    const cleaned = countText.trim();
    
    if (/\bnil\s+to\s+action\b/i.test(cleaned)) {
        return { count: 0, rule: "nil_to_action", matched: cleaned };
    }
    
    const xPatternMatch = cleaned.match(/\bx\s*(\d{1,3})\b/i);
    if (xPatternMatch) {
        const count = parseInt(xPatternMatch[1], 10);
        if (Number.isFinite(count) && count >= 0) {
            return { count: count, rule: "x_pattern", matched: xPatternMatch[0] };
        }
    }
    
    const parenMatches = cleaned.matchAll(/\((\d{1,3})\)/g);
    const parenMatchesArray = Array.from(parenMatches);
    const parenCounts = [];
    
    parenMatchesArray.forEach((match, index) => {
        const num = parseInt(match[1], 10);
        if (!Number.isFinite(num) || num < 0) return;
        
        const matchIndex = match.index;
        const beforeContext = cleaned.substring(Math.max(0, matchIndex - 25), matchIndex);
        const afterContext = cleaned.substring(matchIndex + match[0].length, Math.min(cleaned.length, matchIndex + match[0].length + 30)).trim();
        
        if (/\b(conviction|offence|charge|CN)\s*$/i.test(beforeContext) || 
            /\b(QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\s*$/i.test(beforeContext)) {
            log("debug", `Excluding parentheses (${num}) as reference number: "...${beforeContext.slice(-20)}(${num})${afterContext.substring(0, 20)}"`); 
            return;
        }
        
        parenCounts.push(num);
    });
    
    if (parenCounts.length > 0) {
        const totalCount = parenCounts.reduce((sum, n) => sum + n, 0);
        return { count: totalCount, rule: "parentheses", matched: `${parenCounts.length} parentheses` };
    }
    
    const bracketMatches = cleaned.matchAll(/\[(\d{1,3})\]/g);
    const bracketCounts = Array.from(bracketMatches).map(m => parseInt(m[1], 10)).filter(n => Number.isFinite(n) && n >= 0);
    if (bracketCounts.length > 0) {
        const totalCount = bracketCounts.reduce((sum, n) => sum + n, 0);
        return { count: totalCount, rule: "brackets", matched: `${bracketCounts.length} brackets` };
    }
    
    // Handle "Total X - Police Y" pattern - just use total count
    const totalPoliceMatch = cleaned.match(/\bTotal\s+(\d{1,3})\s*-?\s*(?:Police\s*-?\s*\d{1,3})?\b/i);
    if (totalPoliceMatch) {
        const totalCount = parseInt(totalPoliceMatch[1], 10);
        if (Number.isFinite(totalCount) && totalCount >= 0) {
            return { count: totalCount, rule: "total_keyword", matched: totalPoliceMatch[0] };
        }
    }
    
    const totalMatch = cleaned.match(/\bTotal\s+(\d{1,3})\b/i);
    if (totalMatch) {
        const count = parseInt(totalMatch[1], 10);
        if (Number.isFinite(count) && count >= 0)
            return { count: count, rule: "total_keyword", matched: totalMatch[0] };
    }
    
    if (/\b(LAW|MIS|ITOP)(?:\s+\w+)?\s*\d+/i.test(cleaned) || /\bS\d+(?:\/\d+)?/i.test(cleaned))
        return (
            log("info", `📋 Reference code detected: "${countText}" → defaulting to 1`),
            { count: 1, rule: "reference_code", matched: cleaned }
        );
    
    const standaloneMatch = cleaned.match(/^(\d{1,3})$/);
    if (standaloneMatch) {
        const count = parseInt(standaloneMatch[1], 10);
        if (Number.isFinite(count) && count >= 0)
            return { count: count, rule: "standalone", matched: standaloneMatch[0] };
    }
    
    const endNumberMatch = cleaned.match(/\b(\d{1,3})$/);
    if (endNumberMatch) {
        const count = parseInt(endNumberMatch[1], 10),
            beforeNumber = cleaned.substring(0, cleaned.length - endNumberMatch[0].length);
        if (
            !(
                /[A-Z]{2,}\d*$/.test(beforeNumber) ||
                /S\d*\/$/.test(beforeNumber) ||
                /\/\d*$/.test(beforeNumber) ||
                /CN\s*\d*$/.test(beforeNumber) ||
                /I\s+\d+\s+$/.test(beforeNumber) ||
                /\d+-\d+-$/.test(beforeNumber) ||
                /\d-$/.test(beforeNumber) ||
                /[Rr]eminder\s*-\s*$/.test(beforeNumber) ||
                /\b[Oo]ver\s+$/.test(beforeNumber) ||
                /\b[Pp]age\s+$/.test(beforeNumber)
            ) &&
            Number.isFinite(count) &&
            count >= 0
        )
            return { count: count, rule: "end_number", matched: endNumberMatch[0] };
    }
    return (
        log("warn", `⚠️ NO VALID COUNT PATTERN: "${countText}" → defaulting to 1`),
        { count: 1, rule: "default", matched: null }
    );
}

async function processExtractedData(extractedRows) {
    const personData = {},
        dateRange = { earliest: null, latest: null },
        weekYearSet = new Set();
    let processedCount = 0,
        skippedCount = 0;
    
    extractedRows.forEach((row) => {
        const parsedDate = (function parseDate(dateStr) {
            try {
                const original = dateStr,
                    textMonthMatch = (dateStr = dateStr.replace(/\s*/g, "")).match(/(\d{1,2})([A-Za-z]+)(\d{4})/i);
                if (textMonthMatch) {
                    const day = textMonthMatch[1].padStart(2, "0"),
                        monthText = textMonthMatch[2].toLowerCase(),
                        year = textMonthMatch[3],
                        month = {
                            jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03",
                            apr: "04", april: "04", may: "05", jun: "06", june: "06", jul: "07", july: "07",
                            aug: "08", august: "08", sep: "09", sept: "09", september: "09", oct: "10",
                            october: "10", nov: "11", november: "11", dec: "12", december: "12",
                        }[monthText];
                    if (!month) return log("debug", `Unknown month name: ${monthText} in ${original}`), null;
                    const formattedDate = `${year}-${month}-${day}`;
                    return log("debug", `Parsed date: ${original} -> ${formattedDate}`), formattedDate;
                }
                const parts = dateStr.split("/");
                if (3 !== parts.length) return log("debug", `Invalid date format: ${original}`), null;
                const day = parts[0].padStart(2, "0"),
                    month = parts[1].padStart(2, "0");
                let year = parts[2];
                if ((2 === year.length && (year = "20" + year), isNaN(parseInt(day)) || isNaN(parseInt(month)) || isNaN(parseInt(year))))
                    return log("debug", `Invalid date numbers: ${original}`), null;
                const dayNum = parseInt(day),
                    monthNum = parseInt(month);
                if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12)
                    return log("debug", `Date out of range: ${original}`), null;
                const formattedDate = `${year}-${month}-${day}`;
                return log("debug", `Parsed date: ${original} -> ${formattedDate}`), formattedDate;
            } catch (e) {
                return log("error", `Error parsing date "${dateStr}":`, e), null;
            }
        })(row.dateText);
        if (!parsedDate) return void skippedCount++;
        const finalDate = parsedDate,
            weekYearInfo = (function getISOWeekAndYear(dateStr) {
                try {
                    const parts = dateStr.split("-");
                    if (3 !== parts.length) return null;
                    const year = parseInt(parts[0], 10),
                        month = parseInt(parts[1], 10) - 1,
                        day = parseInt(parts[2], 10),
                        date = new Date(Date.UTC(year, month, day)),
                        dayNumber = date.getUTCDay() || 7,
                        target = new Date(date);
                    target.setUTCDate(date.getUTCDate() + 4 - dayNumber);
                    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1)),
                        weekNumber = Math.ceil(((target - yearStart) / 864e5 + 1) / 7);
                    return { year: target.getUTCFullYear(), week: weekNumber };
                } catch (error) {
                    return log("error", `Error calculating week/year for ${dateStr}:`, error), null;
                }
            })(finalDate);
        weekYearInfo && weekYearSet.add(`${weekYearInfo.year}-W${weekYearInfo.week}`);
        const person = extractPersonIdentifier(row.nameText);
        if (!person) return log("debug", "Could not extract person from name text"), void skippedCount++;
        const countInfo = extractCountFromText(row.countText);
        
        // Validate and store count
        if (countInfo.count > 999) {
            log("warn", `⚠️ SUSPICIOUS COUNT EXTRACTED: ${countInfo.count} (rule: ${countInfo.rule})`);
        }
        
        personData[person] = personData[person] || {};
        personData[person][finalDate] = personData[person][finalDate] || 0;
        
        const previousCount = personData[person][finalDate];
        personData[person][finalDate] += countInfo.count;
        
        if (personData[person][finalDate] > 999) {
            log("warn", `⚠️ ACCUMULATION WARNING: ${person} on ${finalDate}: was ${previousCount}, added ${countInfo.count}, now ${personData[person][finalDate]}`);
        }
        
        // Track date range
        if (!dateRange.earliest || finalDate < dateRange.earliest) {
            dateRange.earliest = finalDate;
        }
        if (!dateRange.latest || finalDate > dateRange.latest) {
            dateRange.latest = finalDate;
        }
        
        processedCount++;
    });
    
    // Log summary
    log("info", `📊 Processing complete: ${processedCount} rows processed, ${skippedCount} skipped`);
    log("info", `📅 Date range: ${dateRange.earliest || "N/A"} to ${dateRange.latest || "N/A"}`);
    log("info", `👥 ${Object.keys(personData).length} unique persons found`);
    log("info", `📆 Weeks covered: ${Array.from(weekYearSet).sort().join(", ")}`);
    
    return {
        personData: personData,
        dateRange: dateRange,
        processedCount: processedCount,
        skippedCount: skippedCount,
        weeksCovered: Array.from(weekYearSet).sort()
    };
}

async function saveRunInfo(folderName, runInfo) {
    const storageKey = `scriptB_lastRun_${folderName}`,
        data = { [storageKey]: { ...runInfo, timestamp: Date.now(), folderName: folderName } };
    try {
        await new Promise((resolve, reject) => {
            browserAPI.storage.local.set(data, () => {
                browserAPI.runtime.lastError ? reject(browserAPI.runtime.lastError) : resolve();
            });
        });
        log("info", `💾 Saved run info for folder: ${folderName}`);
    } catch (error) {
        log("error", "Failed to save run info:", error);
    }
}

window.addEventListener("error", (event) => {
    logError("Global error", event.error);
});

window.addEventListener("unhandledrejection", (event) => {
    logError("Unhandled rejection", new Error(event.reason));
});

window.downloadScriptBConsolidatedReport = function downloadConsolidatedReport() {
    try {
        const reportText = (function generateConsolidatedReport() {
            if (0 === window.scriptBExtractionReports.length)
                return log("warn", "⚠️ No extraction reports to consolidate"), null;
            const lines = [],
                overallStart = new Date().toISOString();
            lines.push("================================================================================"),
                lines.push("SCRIPT B - CONSOLIDATED EXTRACTION REPORT"),
                lines.push("================================================================================"),
                lines.push(""),
                lines.push(`Generated: ${overallStart}`),
                lines.push(`Total Folders Processed: ${window.scriptBExtractionReports.length}`),
                lines.push("");
            const totals = {
                folders: window.scriptBExtractionReports.length,
                expectedTotal: 0,
                actualTotal: 0,
                extractedRows: 0,
                processedRows: 0,
                skippedRows: 0,
                uniquePersons: new Set(),
            };
            
            window.scriptBExtractionReports.forEach((report) => {
                (totals.expectedTotal += report.expectedTotal || 0),
                    (totals.actualTotal += report.actualTotal),
                    (totals.extractedRows += report.extractedRows),
                    (totals.processedRows += report.processedRows),
                    (totals.skippedRows += report.skippedRows),
                    report.personSummary.forEach((ps) => totals.uniquePersons.add(ps.person));
            });
            
            lines.push("================================================================================"),
                lines.push("OVERALL SUMMARY"),
                lines.push("================================================================================"),
                lines.push(""),
                lines.push(`Expected Total Count: ${totals.expectedTotal}`),
                lines.push(`Actual Total Count: ${totals.actualTotal}`),
                lines.push(`Total Rows Extracted: ${totals.extractedRows}`),
                lines.push(`Rows Processed: ${totals.processedRows}`),
                lines.push(`Rows Skipped: ${totals.skippedRows}`),
                lines.push(`Unique Persons Across All Folders: ${totals.uniquePersons.size}`),
                lines.push("");
            
            window.scriptBExtractionReports.forEach((report, idx) => {
                lines.push("================================================================================"),
                    lines.push(`FOLDER ${idx + 1} of ${window.scriptBExtractionReports.length}: ${report.folderName}`),
                    lines.push("================================================================================"),
                    lines.push(""),
                    lines.push(`Processed: ${report.timestamp}`),
                    lines.push(`Expected Total: ${report.expectedTotal || "N/A"}`),
                    lines.push(`Actual Total: ${report.actualTotal}`),
                    lines.push(`Rows Extracted: ${report.extractedRows}`),
                    lines.push(`Rows Processed: ${report.processedRows}`),
                    lines.push(`Rows Skipped: ${report.skippedRows}`),
                    lines.push(`Unique Persons: ${report.uniquePersons}`),
                    lines.push(`Date Range: ${report.dateRange.earliest || "N/A"} to ${report.dateRange.latest || "N/A"}`),
                    lines.push(`Weeks Covered: ${report.weeksCovered.join(", ")}`),
                    lines.push(""),
                    lines.push("--- EXTRACTED ROWS ---"),
                    lines.push("");
                report.rows.forEach((row) => {
                    lines.push(`Row ${row.rowIndex}:`);
                    lines.push(`  Date: ${row.dateText}`);
                    lines.push(`  Name: ${row.nameText}`);
                    lines.push(`  Count: ${row.countText} → Extracted: ${row.count}`);
                    lines.push(`  Person: ${row.person}`);
                    lines.push("");
                });
                lines.push("--- PERSON SUMMARY ---"),
                    lines.push("");
                report.personSummary.forEach((ps) => {
                    lines.push(`${ps.person}: ${ps.total} total`),
                        ps.dates.forEach((d) => {
                            lines.push(`  ${d.date}: ${d.count}`);
                        }),
                        lines.push("");
                });
            });
            
            lines.push("================================================================================"),
                lines.push("END OF CONSOLIDATED REPORT"),
                lines.push("================================================================================");
            return lines.join("\n");
        })();
        
        if (!reportText) return void log("warn", "⚠️ No report to download");
        const blob = new Blob([reportText], { type: "text/plain" }),
            url = URL.createObjectURL(blob),
            filename = `ScriptB_Consolidated_Report_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.txt`,
            a = document.createElement("a");
        (a.href = url),
            (a.download = filename),
            document.body.appendChild(a),
            a.click(),
            setTimeout(() => {
                document.body.removeChild(a), URL.revokeObjectURL(url);
            }, 100),
            log("info", `📥 Consolidated report downloaded: ${filename}`),
            (window.scriptBExtractionReports = []);
    } catch (error) {
        log("error", "❌ Failed to download consolidated report", error);
    }
};

log("info", "📜 Script B loaded");

(async function processObjectiveData() {
    await new Promise((resolve) => setTimeout(resolve, CONFIG.INITIAL_DELAY_MS));
    try {
        log("info", "🚀 Script B - Starting execution");
        await (async function loadSelectorConfig() {
            const DEFAULT_CONFIG = {
                version: "1.0",
                folderNameSelectors: ["div.MuiBox-root.css-s8z3ro > h1", 'div[class*="MuiBox"] > h1', ".page-header h1"],
                totalCountSelectors: [
                    // Most specific selector based on full page structure
                    "div.navigationLayoutComponent__content.layout__body div.mastheadLayoutComponent dl > div:nth-child(1) > dd",
                    // MUI Stack based selectors with class wildcard
                    'div[class*="MuiStack"] > div > dl > div:nth-child(1) > dd',
                    // Original selectors
                    "div.MuiStack-root.css-4hc9uy > div > dl > div:nth-child(1) > dd",
                    // Generic fallback
                    "dl > div:nth-child(1) > dd"
                ],
                tableSelector: "div.queryResultComponent__scrollContainer > table",
                scrollContainerSelector: "div.queryResultComponent__scrollContainer",
                rowSelector: "div.queryResultComponent__scrollContainer > table > tbody > tr",
                dateColumnIndex: 7,
                nameColumnIndex: 8,
                countColumnIndex: 4,
                columnCellSelector: "span",
                countLinkSelector: "a",
                scrollStepPx: 500,
                scrollDelayMs: 800,
                minRunIntervalHours: 1,
            };
            try {
                const config = (
                    await new Promise((resolve) => {
                        browserAPI && browserAPI.storage && browserAPI.storage.local
                            ? browserAPI.storage.local.get("scriptB_selectorConfig", resolve)
                            : resolve({});
                    })
                ).scriptB_selectorConfig;
                config && config.version
                    ? ((SELECTOR_CONFIG = config), log("info", "⚙️ Loaded custom selector configuration from storage"))
                    : ((SELECTOR_CONFIG = DEFAULT_CONFIG), log("info", "⚙️ Using default selector configuration")),
                    (CONFIG.SCROLL_STEP_PX = SELECTOR_CONFIG.scrollStepPx),
                    (CONFIG.SCROLL_DELAY_MS = SELECTOR_CONFIG.scrollDelayMs),
                    (CONFIG.MIN_RUN_INTERVAL_HOURS = SELECTOR_CONFIG.minRunIntervalHours);
            } catch (error) {
                log("error", "❌ Error loading selector configuration, using defaults", error),
                    (SELECTOR_CONFIG = DEFAULT_CONFIG);
            }
            return SELECTOR_CONFIG;
        })();
        
        const folderName = await getFolderName();
        if (!folderName || "Unknown Folder" === folderName) throw new Error("Could not determine folder name");
        
        const lastRunInfo = await (async function getLastRunInfo(folderName) {
            const storageKey = `scriptB_lastRun_${folderName}`;
            try {
                return (
                    (
                        await new Promise((resolve, reject) => {
                            browserAPI.storage.local.get(storageKey, (data) => {
                                browserAPI.runtime.lastError ? reject(browserAPI.runtime.lastError) : resolve(data);
                            });
                        })
                    )[storageKey] || null
                );
            } catch (error) {
                return log("error", "Failed to get last run info:", error), null;
            }
        })(folderName);
        
        const runCheck = (function shouldRunExtraction(lastRunInfo) {
            if (!lastRunInfo || !lastRunInfo.timestamp)
                return (
                    log("info", "✅ No previous run found, proceeding with extraction"),
                    { shouldRun: !0, reason: "first_run" }
                );
            const hoursSinceLastRun = (Date.now() - lastRunInfo.timestamp) / 36e5;
            return (
                log("info", `✅ Last run was ${hoursSinceLastRun.toFixed(1)} hours ago, proceeding with extraction`),
                { shouldRun: !0, reason: "overwrite", hoursSinceLastRun: hoursSinceLastRun }
            );
        })(lastRunInfo);
        
        log("info", `📊 Run check: ${runCheck.reason}`);
        
        const expectedTotal = (function getTotalCount() {
            const selectors = SELECTOR_CONFIG
                ? SELECTOR_CONFIG.totalCountSelectors
                : [
                    "div.navigationLayoutComponent__content.layout__body div.mastheadLayoutComponent dl > div:nth-child(1) > dd",
                    'div[class*="MuiStack"] > div > dl > div:nth-child(1) > dd',
                    "dl > div:nth-child(1) > dd"
                ];
            log("debug", `🔍 Trying ${selectors.length} selectors for total count...`);
            for (const selector of selectors)
                try {
                    const element = document.querySelector(selector);
                    log("debug", `🔍 Selector "${selector.substring(0, 50)}..." - Element found: ${!!element}`);
                    if (element && element.textContent.trim()) {
                        const match = element.textContent.trim().match(/(\d+)/);
                        if (match) {
                            const count = parseInt(match[1], 10);
                            return (
                                log("info", `📊 Total count extracted: ${count} (from selector: ${selector})`),
                                count
                            );
                        }
                    }
                } catch (error) {
                    log("warn", `⚠️ Invalid selector for total count: ${selector}`, error);
                }
            return log("warn", "⚠️ Could not extract total count from page - scrolling will continue until stable"), null;
        })();
        
        let tableStatus = isDataTablePresent(),
            retryCount = 0;
        const maxRetries = 10,
            retryDelay = 3e3;
        
        if (tableStatus.isEmpty)
            return (
                log("info", "✅ Folder confirmed empty"),
                await saveRunInfo(folderName, {
                    dateRange: { start: null, end: null },
                    recordCount: 0,
                    personCount: 0,
                    status: "empty",
                }),
                sendMessageToBackground({
                    action: "csvContentDetected",
                    dataPayload: {},
                    folderName: folderName,
                    metadata: {
                        status: "empty",
                        expectedTotal: expectedTotal || 0,
                        actualTotal: 0,
                        scriptType: "B",
                    },
                }),
                void setTimeout(() => window.close(), CONFIG.CLOSE_DELAY_MS)
            );
        
        for (; !tableStatus.found && !tableStatus.isEmpty && retryCount < maxRetries; )
            if (
                (retryCount++,
                log("info", `⏳ Waiting for table... (${retryCount}/${maxRetries})`),
                await new Promise((resolve) => setTimeout(resolve, retryDelay)),
                (tableStatus = isDataTablePresent()),
                tableStatus.isEmpty)
            )
                return (
                    log("info", "✅ Folder confirmed empty during wait"),
                    sendMessageToBackground({
                        action: "csvContentDetected",
                        dataPayload: {},
                        folderName: folderName,
                        metadata: { status: "empty", scriptType: "B" },
                    }),
                    void setTimeout(() => window.close(), CONFIG.CLOSE_DELAY_MS)
                );
        
        if (!tableStatus.found)
            return (
                log("error", "❌ Data table not found"),
                sendMessageToBackground({
                    action: "csvContentDetected",
                    dataPayload: {},
                    folderName: folderName,
                    metadata: { status: "error_no_table", scriptType: "B" },
                }),
                void setTimeout(() => window.close(), CONFIG.CLOSE_DELAY_MS)
            );
        
        await (async function scrollTableToLoadAllRows(expectedTotal) {
            const scrollContainerSelector = SELECTOR_CONFIG
                    ? SELECTOR_CONFIG.scrollContainerSelector
                    : "div.queryResultComponent__scrollContainer",
                scrollContainer = document.querySelector(scrollContainerSelector);
            if (!scrollContainer) return log("warn", "⚠️ Scroll container not found"), !1;
            await new Promise((resolve) => setTimeout(resolve, 2e3));
            log("info", `📜 Starting scroll to load all ${expectedTotal || "available"} rows...`);
            const scrollStep = CONFIG.SCROLL_STEP_PX,
                scrollDelay = CONFIG.SCROLL_DELAY_MS;
            let lastScrollTop = -1,
                stableCount = 0,
                attempts = 0;
            const rowSelector = SELECTOR_CONFIG
                ? SELECTOR_CONFIG.rowSelector
                : "div.queryResultComponent__scrollContainer > table > tbody > tr";
            return new Promise((resolve) => {
                const scrollInterval = setInterval(async () => {
                    attempts++;
                    const currentCount = document.querySelectorAll(rowSelector).length;
                    if (
                        ((attempts % 5 != 0 && 1 !== attempts) ||
                            log("info", `📜 Scroll progress: ${currentCount} rows loaded (attempt ${attempts})`),
                        expectedTotal && currentCount >= expectedTotal)
                    )
                        return (
                            log("info", `✅ All ${currentCount} rows loaded`),
                            clearInterval(scrollInterval),
                            await new Promise((resolve) => setTimeout(resolve, 2e3)),
                            void resolve(!0)
                        );
                    const currentScrollTop = scrollContainer.scrollTop;
                    if (currentScrollTop === lastScrollTop) {
                        if ((stableCount++, stableCount >= 3))
                            return (
                                log("info", `🏁 Reached bottom. ${currentCount} rows loaded.`),
                                clearInterval(scrollInterval),
                                await new Promise((resolve) => setTimeout(resolve, 2e3)),
                                void resolve(!0)
                            );
                    } else stableCount = 0;
                    if (((lastScrollTop = currentScrollTop), attempts >= 1000))
                        return (
                            log("warn", `⏱️ Max scroll attempts reached. ${currentCount} rows loaded.`),
                            clearInterval(scrollInterval),
                            await new Promise((resolve) => setTimeout(resolve, 2e3)),
                            void resolve(!1)
                        );
                    scrollContainer.scrollBy(0, scrollStep);
                }, scrollDelay);
            });
        })(expectedTotal);
        
        await new Promise((resolve) => setTimeout(resolve, 1500));
        log("info", "⏸️ Waiting for DOM to settle before extraction...");
        
        let extractedRows = (function extractDataFromTable() {
            const tableSelector = SELECTOR_CONFIG
                    ? SELECTOR_CONFIG.tableSelector
                    : "div.queryResultComponent__scrollContainer > table",
                table = document.querySelector(tableSelector);
            if (!table) return log("error", "❌ Data table not found"), null;
            const tbody = table.querySelector("tbody");
            if (!tbody) return log("error", "❌ Table body not found"), null;
            const rows = tbody.querySelectorAll("tr");
            log("info", `📋 Found ${rows.length} rows in table`);
            const dateColumnIndex = SELECTOR_CONFIG ? SELECTOR_CONFIG.dateColumnIndex : 7,
                nameColumnIndex = SELECTOR_CONFIG ? SELECTOR_CONFIG.nameColumnIndex : 8,
                countColumnIndex = SELECTOR_CONFIG ? SELECTOR_CONFIG.countColumnIndex : 4,
                columnCellSelector = SELECTOR_CONFIG ? SELECTOR_CONFIG.columnCellSelector : "span",
                countLinkSelector = SELECTOR_CONFIG ? SELECTOR_CONFIG.countLinkSelector : "a",
                dateCellSelector = columnCellSelector
                    ? `td:nth-child(${dateColumnIndex}) > ${columnCellSelector}`
                    : `td:nth-child(${dateColumnIndex})`,
                nameCellSelector = columnCellSelector
                    ? `td:nth-child(${nameColumnIndex}) > ${columnCellSelector}`
                    : `td:nth-child(${nameColumnIndex})`,
                countCellSelector = `td:nth-child(${countColumnIndex}) > ${countLinkSelector}`;
            log(
                "info",
                `🔍 Using selectors - Date: "${dateCellSelector}", Name: "${nameCellSelector}", Count: "${countCellSelector}"`
            );
            const extractedData = [];
            
            rows.forEach((row, index) => {
                try {
                    const dateCell = row.querySelector(dateCellSelector),
                        nameCell = row.querySelector(nameCellSelector),
                        countLink = row.querySelector(countCellSelector);
                    if (!dateCell || !nameCell)
                        return void log("debug", `Row ${index + 1}: Missing date or name cell`);
                    const dateText = dateCell.textContent.trim(),
                        nameText = nameCell.textContent.trim(),
                        countText = countLink ? countLink.textContent.trim() : "1";
                    if (!dateText || !nameText)
                        return void log("debug", `Row ${index + 1}: Empty date or name`);
                    extractedData.push({
                        rowIndex: index + 1,
                        dateText: dateText,
                        nameText: nameText,
                        countText: countText,
                    });
                } catch (error) {
                    log("error", `Error extracting row ${index + 1}:`, error);
                }
            });
            
            log("info", `✅ Extracted ${extractedData.length} valid data rows from table`);
            return extractedData;
        })();
        
        if (!extractedRows || 0 === extractedRows.length) throw new Error("No data extracted from table");
        
        const processed = await processExtractedData(extractedRows),
            weightedTotal = (function sumAggregatedCounts(personMap = {}) {
                return Object.values(personMap).reduce(
                    (sum, dateMap) =>
                        dateMap && "object" == typeof dateMap
                            ? sum +
                              Object.values(dateMap).reduce((inner, value) => {
                                  const numericValue = Number(value);
                                  return inner + (Number.isFinite(numericValue) ? numericValue : 0);
                              }, 0)
                            : sum,
                    0
                );
            })(processed.personData),
            personCount = Object.keys(processed.personData).length;
        
        log(
            "info",
            `📦 Data payload summary: ${Object.entries(processed.personData)
                .map(([person, dates]) => {
                    const totalForPerson = Object.values(dates).reduce((sum, count) => sum + count, 0);
                    return `${person}: ${Object.keys(dates).length} dates, total: ${totalForPerson}`;
                })
                .join("; ")}`
        );
        
        (function storeExtractionReport(folderName, extractedRows, processed, expectedTotal, actualTotal) {
            const report = {
                timestamp: new Date().toISOString(),
                folderName: folderName,
                expectedTotal: expectedTotal,
                actualTotal: actualTotal,
                extractedRows: extractedRows.length,
                processedRows: processed.processedCount,
                skippedRows: processed.skippedCount,
                uniquePersons: Object.keys(processed.personData).length,
                dateRange: processed.dateRange,
                weeksCovered: processed.weeksCovered,
                rows: extractedRows.map((row) => {
                    const countInfo = extractCountFromText(row.countText);
                    return {
                        rowIndex: row.rowIndex,
                        dateText: row.dateText,
                        nameText: row.nameText,
                        countText: row.countText,
                        person: extractPersonIdentifier(row.nameText),
                        count: countInfo.count
                    };
                }),
                personSummary: Object.entries(processed.personData).map(([person, dates]) => ({
                    person: person,
                    total: Object.values(dates).reduce((sum, count) => sum + count, 0),
                    dates: Object.entries(dates).map(([date, count]) => ({ date: date, count: count })),
                })),
            };
            window.scriptBExtractionReports.push(report);
            log("info", `📄 Stored extraction report for ${folderName} (${window.scriptBExtractionReports.length} total reports)`);
        })(folderName, extractedRows, processed, expectedTotal, weightedTotal);
        
        await saveRunInfo(folderName, {
            dateRange: processed.dateRange,
            recordCount: weightedTotal,
            rowCount: processed.processedCount,
            personCount: personCount,
            status: "success",
        });
        
        sendMessageToBackground({
            action: "csvContentDetected",
            dataPayload: processed.personData,
            folderName: folderName,
            metadata: {
                processedRows: processed.processedCount,
                skippedRows: processed.skippedCount,
                personCount: personCount,
                dateRange: processed.dateRange,
                expectedTotal: expectedTotal,
                actualTotal: weightedTotal,
                weeksCovered: processed.weeksCovered,
                scriptType: "B",
                timestamp: new Date().toISOString(),
                extractionReport: {
                    timestamp: new Date().toISOString(),
                    folderName: folderName,
                    expectedTotal: expectedTotal,
                    actualTotal: weightedTotal,
                    extractedRows: extractedRows.length,
                    processedRows: processed.processedCount,
                    skippedRows: processed.skippedCount,
                    uniquePersons: Object.keys(processed.personData).length,
                    dateRange: processed.dateRange,
                    weeksCovered: processed.weeksCovered,
                    rows: extractedRows.map((row) => {
                        const countInfo = extractCountFromText(row.countText);
                        // Parse date for reliable storage
                        let isoDate = null;
                        const dateStr = (row.dateText || '').replace(/\s*/g, "");
                        const textMonthMatch = dateStr.match(/(\d{1,2})([A-Za-z]+)(\d{4})/i);
                        if (textMonthMatch) {
                            const day = textMonthMatch[1].padStart(2, "0");
                            const monthText = textMonthMatch[2].toLowerCase();
                            const year = textMonthMatch[3];
                            const monthMap = {
                                jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03",
                                apr: "04", april: "04", may: "05", jun: "06", june: "06", jul: "07", july: "07",
                                aug: "08", august: "08", sep: "09", sept: "09", september: "09", oct: "10",
                                october: "10", nov: "11", november: "11", dec: "12", december: "12"
                            };
                            const month = monthMap[monthText];
                            if (month) {
                                isoDate = `${year}-${month}-${day}`;
                            }
                        } else {
                            const parts = dateStr.split("/");
                            if (parts.length === 3) {
                                const day = parts[0].padStart(2, "0");
                                const month = parts[1].padStart(2, "0");
                                let year = parts[2];
                                if (year.length === 2) year = "20" + year;
                                isoDate = `${year}-${month}-${day}`;
                            }
                        }
                        return {
                            rowIndex: row.rowIndex,
                            dateText: row.dateText,
                            isoDate: isoDate,  // Pre-parsed ISO date for reliable storage
                            nameText: row.nameText,
                            countText: row.countText,
                            person: extractPersonIdentifier(row.nameText),
                            count: countInfo.count,
                            rule: countInfo.rule
                        };
                    }),
                    personSummary: Object.entries(processed.personData).map(([person, dates]) => ({
                        person: person,
                        total: Object.values(dates).reduce((sum, count) => sum + count, 0),
                        dates: Object.entries(dates).map(([date, count]) => ({ date: date, count: count })),
                    })),
                },
            },
        });
        
        log("info", "✅ Script B - Execution complete");
        setTimeout(() => {
            window.close();
        }, CONFIG.CLOSE_DELAY_MS);
    } catch (error) {
        logError("Critical error", error);
        sendMessageToBackground({
            action: "logError",
            error: `Script B: ${error.message}`,
            context: { stack: error.stack },
            severity: "critical",
        });
        setTimeout(() => window.close(), CONFIG.CLOSE_DELAY_MS);
    }
})();
