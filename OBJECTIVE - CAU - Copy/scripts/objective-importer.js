// TEST-works/scripts/objective-importer.js
'use strict';

console.log(`🚀 Objective Importer Script v3.3 EXECUTION STARTED on ${window.location.href} at ${new Date().toISOString()}`);

(async function() {
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    const ACTION_OBJECTIVE_SUBFOLDER_RESULT = 'objectiveSubFolderResult';
    const ACTION_OBJECTIVE_MONTHLY_RESULT = 'objectiveMonthlyResult';
    const ACTION_OBJECTIVE_IMPORT_ERROR = 'objectiveImportError';
    const ACTION_CONTENT_SCRIPT_READY = 'CONTENT_SCRIPT_READY'; 
    
    const PRIMARY_LINK_SELECTORS = [
        'xen-cards-list a.objectTitleComponent__name', 'a.objectTitleComponent__name',                
        'div.xen-cards-list a', 'div.list-view a', 'table.data-table a', '.folder-list a', '.object-list a',
        '.folder-grid a', 'a[title*="Open"]', 'a[aria-label*="folder"]', 'a[data-object-type="folder"]', // Added data-object-type
        'a[href*="/documents/"]', 'a[href*="/objective/folders/"]', 'a[href*="/folders/"]',
        'a[href*="/folder/"]', 'a[href*="/documents/q"]', 'a[href*="/documents/f"]'
    ];

    function sendMessage(action, payload) { /* ... (unchanged from previous full script) ... */ }
    function querySelectorWithFallbacks(selectors) { /* ... (unchanged from previous full script) ... */ }
    function extractFolderTitle() { /* ... (unchanged from previous full script, may still need tuning for qA... pages if "Unknown Folder" persists) ... */ }
    function normalizeUrl(url, baseUrl) { /* ... (unchanged from previous full script) ... */ }

    async function scrapeFolderTypeLinks() {
        const context = "Types Stage 1";
        console.log(`Obj Imp v3.3 (${context}): Starting scrapeFolderTypeLinks...`);
        try {
            await delay(3500); // Slightly increased delay
            const hasScrolled = await scrollAndLoadMore(60, 600); // Slightly increased attempts/pause
            if (hasScrolled) { console.log(`Obj Imp v3.3 (${context}): Scrolled to load more content`); await delay(2500); }
            
            const allLinksPrimary = querySelectorWithFallbacks(PRIMARY_LINK_SELECTORS);
            const foundFolders = [];
            const baseUrl = window.location.origin;
            const processedUrls = new Set();
            const processedLinkTexts = new Set(); // To avoid adding folders with same name but slightly different URLs if they are effectively the same type
            let skippedCopyCount = 0;
            let skippedOtherCount = 0;
            let skippedUrlCount = 0;
            let linksToProcess = [];

            if (allLinksPrimary && allLinksPrimary.length > 0) {
                console.log(`Obj Imp v3.3 (${context}): Found ${allLinksPrimary.length} potential links using PRIMARY selectors.`);
                linksToProcess = Array.from(allLinksPrimary);
            } else {
                console.warn(`Obj Imp v3.3 (${context}): No links found using primary selectors. Trying generic 'a' tags.`);
                linksToProcess = Array.from(document.querySelectorAll('a'));
                console.log(`Obj Imp v3.3 (${context}): Found ${linksToProcess.length} generic links on page as fallback.`);
            }
            
            console.log(`Obj Imp v3.3 (${context}): Total links to process before filtering: ${linksToProcess.length}`);

            linksToProcess.forEach((link, index) => {
                try {
                    const linkText = link?.textContent?.trim();
                    let linkHref = link?.href || link?.getAttribute('href');

                    console.log(`Obj Imp v3.3 (${context}): Processing link #${index + 1}: Text='${linkText}', Href='${linkHref}'`);

                    if (!linkText || !linkHref) { skippedOtherCount++; console.log(` -> Skipped (no text/href)`); return; }

                    if (linkText.toLowerCase().includes('copy')) {
                        console.log(` -> Skipped ('Copy' folder): ${linkText}`);
                        skippedCopyCount++;
                        return; 
                    }

                    let absoluteUrl = normalizeUrl(linkHref, baseUrl);
                    if (!absoluteUrl) { skippedUrlCount++; console.log(` -> Skipped (bad URL)`); return; }
                    
                    // Normalize link text for uniqueness check (e.g. remove multiple spaces)
                    const normalizedLinkText = linkText.replace(/\s+/g, ' ').trim();

                    if (processedUrls.has(absoluteUrl) || processedLinkTexts.has(normalizedLinkText)) {
                        console.log(` -> Skipped (duplicate URL or Text): URL=${absoluteUrl}, Text=${normalizedLinkText}`);
                        return;
                    }
                    
                    // Filter for what looks like a folder type link (adjust if too restrictive/permissive)
                     if (!(absoluteUrl.includes('/documents/') || absoluteUrl.includes('/objective/folders/') ||
                           absoluteUrl.includes('/objective/objects/') || absoluteUrl.includes('/folder/') ||
                           absoluteUrl.includes('/folders/')) || 
                           linkText.length < 3 || linkText.length > 150 ) { // Basic length check
                        console.log(` -> Skipped (doesn't look like a folder link based on URL/text length)`);
                        skippedUrlCount++; return;
                    }

                    console.log(` -> ADDING: Name='${normalizedLinkText}', URL='${absoluteUrl}'`);
                    foundFolders.push({ folderTypeName: normalizedLinkText, url: absoluteUrl });
                    processedUrls.add(absoluteUrl);
                    processedLinkTexts.add(normalizedLinkText);

                } catch (linkError) { console.warn(`Obj Imp v3.3 (${context}): Error processing a link:`, linkError); skippedOtherCount++; }
            });
            console.log(`Obj Imp v3.3 (${context}): Found ${foundFolders.length} valid folder types (Skipped: ${skippedUrlCount} URLs, ${skippedCopyCount} 'Copy', ${skippedOtherCount} other errors/skips)`);
            foundFolders.sort((a, b) => a.folderTypeName.localeCompare(b.folderTypeName));
            sendMessage(ACTION_OBJECTIVE_SUBFOLDER_RESULT, { success: true, folders: foundFolders });
        } catch (error) { /* ... error handling ... */ }
    }

    async function scrapeMonthlyLinks(passedParentFolderTypeName) { /* ... (as per previous full script, uses passedParentFolderTypeName) ... */ }
    
    function extractMonthlyDataFromLinks(links, parentFolderTypeNameForContext) {
        const context = "ExtractMonthly";
        const foundMonthlyData = [];
        // ... (datePatterns, monthMap as before)
        let skippedCopyCount = 0; let skippedDateCount = 0; let skippedUrlCount = 0; let skippedOtherCount = 0;
        const baseUrl = window.location.origin;
        const processedUrls = new Set(); 

        if (!links || links.length === 0) { /* ... warn and return ... */ }

        links.forEach((link) => {
            try {
                const linkText = link?.textContent?.trim();
                let linkHref = link?.href || link?.getAttribute('href');
                if (!linkText || !linkHref) { /* ... skip ... */ return; }

                if (linkText.toLowerCase().includes('copy')) {
                    console.log(`Obj Imp v3.3 (${context}): Skipping 'Copy' month link for "${parentFolderTypeNameForContext}": ${linkText}`);
                    skippedCopyCount++;
                    return;
                }
                
                let absoluteUrl = normalizeUrl(linkHref, baseUrl);
                if (!absoluteUrl) { /* ... skip ... */ return; }
                
                if (processedUrls.has(absoluteUrl)) { /* ... skip if URL already processed for this parent ... */ return; }
                
                if (!(absoluteUrl.includes('/documents/') || /* ... other URL checks ... */)) { /* ... skip ... */ return; }

                let year = null, month = null;
                // ... (Your date parsing logic - ensure it's robust)
                const datePatterns = [ /(?:(\d{1,2})\s+)?([A-Za-z]{3,})\s+(\d{4})/i, /(\d{4})\s+([A-Za-z]{3,})/i, /(\d{1,2})[\/\-\.](\d{4})/i, /(\d{4})[\/\-\.](\d{1,2})/i ];
                const monthMap = { /* ... */ };
                for (const pattern of datePatterns) { /* ... parse ... */ }
                if (!year || !month) { const urlDate = extractDateFromUrl(absoluteUrl); if (urlDate) { /* ... */ } }
                
                if (!year || !month || isNaN(year) || isNaN(month) || year < 2000 || year > 2100 || month < 1 || month > 12) {
                    /* ... skip bad date ... */ return;
                }
                
                // Prevent adding the same month/year combination twice for THIS parentFolder
                if (!foundMonthlyData.some(item => item.year === year && item.month === month)) {
                    foundMonthlyData.push({ month: month, year: year, url: absoluteUrl });
                    processedUrls.add(absoluteUrl); // Add after successful unique month processing
                } else {
                    console.log(`Obj Imp v3.3 (${context}): Duplicate month/year (${month}/${year}) combination detected for "${parentFolderTypeNameForContext}", URL ${absoluteUrl}. Original link text: "${linkText}". Skipping.`);
                }

            } catch (linkError) { /* ... */ }
        });
        console.log(`Obj Imp v3.3 (${context}): Found ${foundMonthlyData.length} unique monthly links for "${parentFolderTypeNameForContext}" (Skipped: ${skippedDateCount} dates, ${skippedUrlCount} URLs, ${skippedCopyCount} 'Copy', ${skippedOtherCount} other)`);
        return foundMonthlyData;
    }
    
    function extractDateFromUrl(url) { /* ... (as per previous full script) ... */ }
    async function scrollAndLoadMore(maxAttempts = 50, scrollPause = 500) { /* ... (as per previous full script with scrollHeightValue fix) ... */ }
    async function scrollAndCapture() { /* ... (as per previous full script) ... */ }

    async function determineTaskAndRun() {
        sendMessage(ACTION_CONTENT_SCRIPT_READY, { status: 'ready', url: window.location.href });
        console.log(`Obj Imp v3.3: Sent ${ACTION_CONTENT_SCRIPT_READY} to background.`);

        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
            chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
                if (message.action === 'EXECUTE_OBJECTIVE_SCRAPE' && message.taskInfo) {
                    // ... (as per previous full script, calls scrapeMonthlyLinks with parentFolderName)
                    const { task, parentFolderName } = message.taskInfo; 
                    if (task === 'scrapeMonthlyLinks') { await scrapeMonthlyLinks(parentFolderName); }
                    // ... other tasks
                    return true; 
                }
            });
        } else { /* ... */ }
    }
    determineTaskAndRun();
})();