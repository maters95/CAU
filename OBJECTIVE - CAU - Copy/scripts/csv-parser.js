/* ==== START: TEST/scripts/csv-parser.js ==== */
// csv-parser.js - Handles parsing CSV data using multiple strategies (v1.1)
'use strict';
// AMENDMENT: Import from the enhanced error manager
import { ErrorManager, SEVERITY, CATEGORY } from './enhanced-error-manager.js';
import { INITIALS_TO_NAME } from './constants.js'; // Use shared initials map

/**
 * Splits a CSV line into cells, handling simple quoted commas.
 * Note: This is a basic implementation and may not handle all edge cases
 * like escaped quotes within quoted fields perfectly.
 * @param {string} line - The CSV line string.
 * @returns {string[]} An array of cell strings.
 */
function simpleCsvSplit(line) {
    const cells = [];
    let currentCell = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            // Handle escaped quotes ("")
            if (inQuotes && line[i + 1] === '"') {
                currentCell += '"';
                i++; // Skip the next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            cells.push(currentCell.trim());
            currentCell = '';
        } else {
            currentCell += char;
        }
    }
    cells.push(currentCell.trim()); // Add the last cell
    // Remove surrounding quotes (single or double) from the final cells
    return cells.map(cell => cell.replace(/^["']|["']$/g, ''));
}


// --- CSV Parsing Strategies ---

/**
 * Parses CSV data where each individual's data is in a block:
 * Individual: Person Name
 * Header1,Date1,Date2,TOTAL
 * Total Entries,Count1,Count2,PersonTotal
 * (Blank line)
 * @param {string[]} lines - Array of CSV lines.
 * @param {string} folderName - Name of the folder being parsed (for logging).
 * @returns {Object} Extracted data: { PersonName: { FormattedDate: count } }
 */
function parseIndividualBlockFormat(lines, folderName) {
    const extractedData = {};
    let currentPerson = null;
    let headerRow = null;
    let dateIndices = {}; // Stores { 'YYYY-MM-DD': columnIndex }

    console.log(`CSV Parser: Trying Individual Block Format for "${folderName}"...`);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]?.trim(); // Trim lines
        if (!line) { // Reset on blank lines
            currentPerson = null;
            headerRow = null;
            dateIndices = {};
            continue;
        }

        // Match "Individual: Person Name" line
        const individualMatch = line.match(/^Individual:\s*(.+)/i);
        if (individualMatch) {
            currentPerson = individualMatch[1].trim().replace(/^["']|["']$/g, ''); // Clean person name
            headerRow = null;
            dateIndices = {};
            console.log(`CSV Parser (Block): Found person block: "${currentPerson}"`);

            // Look ahead for the header row containing dates (YYYY-MM-DD)
            if (i + 1 < lines.length && lines[i + 1]) {
                const potentialHeader = simpleCsvSplit(lines[i + 1]);
                const foundDates = {};
                potentialHeader.forEach((header, index) => {
                    // Use a robust regex for YYYY-MM-DD format
                    if (/^\d{4}-\d{2}-\d{2}$/.test(header)) {
                        foundDates[header] = index;
                    }
                });

                if (Object.keys(foundDates).length > 0) {
                    headerRow = potentialHeader;
                    dateIndices = foundDates;
                    console.log(`CSV Parser (Block): Found ${Object.keys(dateIndices).length} date columns for ${currentPerson}`);
                    i++; // Skip the header row in the next iteration
                } else {
                    console.warn(`CSV Parser (Block): No valid date headers (YYYY-MM-DD) found after 'Individual:' for ${currentPerson}`);
                    currentPerson = null; // Invalidate if no valid header
                }
            } else {
                console.warn(`CSV Parser (Block): Missing header row after 'Individual:' for ${currentPerson}`);
                currentPerson = null;
            }
            continue; // Move to next line after processing Individual line
        }

        // If we have a valid person and header, look for the data row ("Total Entries" or "Total")
        if (currentPerson && headerRow && Object.keys(dateIndices).length > 0) {
            const cells = simpleCsvSplit(line);
            const rowTitle = cells[0]?.toLowerCase();

            if (rowTitle === 'total entries' || rowTitle === 'total') {
                 console.log(`CSV Parser (Block): Found data row for ${currentPerson}`);
                 if (!extractedData[currentPerson]) extractedData[currentPerson] = {};

                 // Iterate through the identified date headers
                 for (const date in dateIndices) {
                     const columnIndex = dateIndices[date];
                     if (columnIndex < cells.length) {
                         const count = parseInt(cells[columnIndex], 10);
                         // Only add positive counts
                         if (!isNaN(count) && count > 0) {
                             extractedData[currentPerson][date] = (extractedData[currentPerson][date] || 0) + count;
                             // console.log(`CSV Parser (Block): Added count ${count} for ${currentPerson} on ${date}`); // Reduce log noise
                         }
                     } else {
                          // Log if a date column index is out of bounds for the current row
                          console.warn(`CSV Parser (Block): Column index ${columnIndex} for date ${date} is out of bounds for row: "${line}"`);
                     }
                 }
                // Reset after processing the data row for this person block
                currentPerson = null;
                headerRow = null;
                dateIndices = {};
            }
            // Ignore other lines within a person block (e.g., sub-totals if any)
        }
    } // End loop through lines

    const personsFound = Object.keys(extractedData).length;
    console.log(`CSV Parser (Block): Finished. Found data for ${personsFound} persons.`);
    return extractedData;
}


/**
 * Parses standard tabular CSV:
 * Individual,Date1,Date2,...
 * PersonA,Count1,Count2,...
 * PersonB,Count3,Count4,...
 * @param {string[]} lines - Array of CSV lines.
 * @param {string} folderName - Name of the folder being parsed (for logging).
 * @returns {Object} Extracted data: { PersonName: { FormattedDate: count } }
 */
function parseTabularFormat(lines, folderName) {
    const extractedData = {};
    console.log(`CSV Parser: Trying Tabular Format for "${folderName}"...`);
    if (lines.length < 2) return extractedData; // Need header and at least one data row

    const headers = simpleCsvSplit(lines[0]);
    let personColumnIndex = -1;
    const dateIndices = {}; // { 'YYYY-MM-DD': columnIndex }

    // Find person column and date columns from header
    headers.forEach((header, index) => {
        const lowerHeader = header.toLowerCase();
        // More robust check for person column
        if (personColumnIndex === -1 && ['individual', 'name', 'user', 'person', 'staff'].includes(lowerHeader)) {
            personColumnIndex = index;
        }
        // Check for YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(header)) {
            dateIndices[header] = index;
        }
    });

    // Validate that essential columns were found
    if (personColumnIndex === -1 || Object.keys(dateIndices).length === 0) {
        console.warn("CSV Parser (Tabular): Required columns (Individual/Name/User and Date) not found in header.");
        return extractedData; // Cannot proceed without required columns
    }
     console.log(`CSV Parser (Tabular): Found person column at index ${personColumnIndex}, ${Object.keys(dateIndices).length} date columns.`);

    // Process data rows starting from the second line
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i]?.trim();
        // Skip empty lines or lines that look like totals/summaries
        if (!line || line.toLowerCase().startsWith('total') || line.toLowerCase().startsWith('grand total')) continue;

        const cells = simpleCsvSplit(line);
        // Ensure the row has enough cells to contain the person identifier
        if (cells.length <= personColumnIndex) {
             // console.warn(`CSV Parser (Tabular): Skipping row ${i + 1} - not enough cells.`); // Reduce noise
             continue;
        }

        const personName = cells[personColumnIndex];
        // Skip rows with no person identifier in the expected column
        if (!personName) {
            // console.warn(`CSV Parser (Tabular): Skipping row ${i + 1} - empty person name.`); // Reduce noise
            continue;
        }

        // Initialize person's data object if it doesn't exist
        if (!extractedData[personName]) extractedData[personName] = {};

        // Extract counts for each identified date column
        for (const date in dateIndices) {
            const columnIndex = dateIndices[date];
            if (columnIndex < cells.length) {
                const count = parseInt(cells[columnIndex], 10);
                // Only store positive counts
                if (!isNaN(count) && count > 0) {
                    extractedData[personName][date] = (extractedData[personName][date] || 0) + count;
                }
            }
            // Silently ignore if date column index is out of bounds for this row
        }
    } // End loop through data rows

    const personsFound = Object.keys(extractedData).length;
    console.log(`CSV Parser (Tabular): Finished. Found data for ${personsFound} persons.`);
    return extractedData;
}

/**
 * Parses CSV with Initials column:
 * Initials,Date1,Date2,...
 * ZM,Count1,Count2,...
 * AD,Count3,Count4,...
 * Maps initials to full names using INITIALS_TO_NAME constant.
 * @param {string[]} lines - Array of CSV lines.
 * @param {string} folderName - Name of the folder being parsed (for logging).
 * @returns {Object} Extracted data: { PersonFullName: { FormattedDate: count } }
 */
function parseInitialsFormat(lines, folderName) {
    const extractedData = {};
    console.log(`CSV Parser: Trying Initials Format for "${folderName}"...`);
    if (lines.length < 2) return extractedData;

    const headers = simpleCsvSplit(lines[0]);
    let initialsColumnIndex = -1;
    const dateIndices = {}; // { 'YYYY-MM-DD': columnIndex }

    // Find initials column (common headers: "initials", "initial", "by") and date columns
    headers.forEach((header, index) => {
        const lowerHeader = header.toLowerCase();
        if (initialsColumnIndex === -1 && ['initials', 'initial', 'by'].includes(lowerHeader)) {
            initialsColumnIndex = index;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(header)) {
            dateIndices[header] = index;
        }
    });

    // Validate required columns
    if (initialsColumnIndex === -1 || Object.keys(dateIndices).length === 0) {
        console.warn("CSV Parser (Initials): Required columns (Initials/By and Date) not found in header.");
        return extractedData;
    }
    console.log(`CSV Parser (Initials): Found initials column at index ${initialsColumnIndex}, ${Object.keys(dateIndices).length} date columns.`);

    // Process data rows
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i]?.trim();
        if (!line || line.toLowerCase().startsWith('total') || line.toLowerCase().startsWith('grand total')) continue;

        const cells = simpleCsvSplit(line);
        if (cells.length <= initialsColumnIndex) continue; // Skip rows without enough cells

        const initials = cells[initialsColumnIndex]?.toUpperCase(); // Ensure uppercase for mapping
        if (!initials) continue; // Skip rows with empty initials

        // Map initials to full name using the imported map, provide fallback
        const personName = INITIALS_TO_NAME[initials] || `${initials} (Unknown)`;

        // Initialize person's data object
        if (!extractedData[personName]) extractedData[personName] = {};

        // Extract counts for each date
        for (const date in dateIndices) {
            const columnIndex = dateIndices[date];
            if (columnIndex < cells.length) {
                const count = parseInt(cells[columnIndex], 10);
                if (!isNaN(count) && count > 0) {
                    // Log if storing data for unknown initials
                    if (personName.endsWith('(Unknown)')) {
                         console.warn(`CSV Parser (Initials): Storing data for unknown initials "${initials}" as "${personName}"`);
                    }
                    extractedData[personName][date] = (extractedData[personName][date] || 0) + count;
                }
            }
        }
    } // End loop through data rows

     const personsFound = Object.keys(extractedData).length;
    console.log(`CSV Parser (Initials): Finished. Found data for ${personsFound} persons.`);
    return extractedData;
}


/**
 * Tries to flexibly identify a header row containing dates and a person/identifier column.
 * Less reliable than specific formats but acts as a fallback.
 * @param {string[]} lines - Array of CSV lines.
 * @param {string} folderName - Name of the folder being parsed (for logging).
 * @returns {Object} Extracted data: { PersonIdentifier: { FormattedDate: count } }
 */
function parseFlexibleFormat(lines, folderName) {
    const extractedData = {};
    console.log(`CSV Parser: Trying Flexible Format for "${folderName}"...`);
    let dateRowIndex = -1;
    let headerRow = [];
    const dateIndices = {}; // { 'YYYY-MM-DD': columnIndex }
    let personColumnIndex = -1;

    // --- Find Header Row ---
    // Look for a row with multiple YYYY-MM-DD dates, checking first few lines
    for (let i = 0; i < Math.min(5, lines.length); i++) {
        if (!lines[i]) continue;
        const potentialHeaders = simpleCsvSplit(lines[i]);
        const foundDates = {};
        potentialHeaders.forEach((header, index) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(header)) {
                foundDates[header] = index;
            }
        });

        // Assume header if >= 2 dates found (adjust threshold if needed)
        if (Object.keys(foundDates).length >= 2) {
            dateRowIndex = i;
            headerRow = potentialHeaders;
            Object.assign(dateIndices, foundDates);
            console.log(`CSV Parser (Flexible): Identified potential header at row ${i} with ${Object.keys(dateIndices).length} dates.`);
            break; // Found likely header
        }
    }

    if (dateRowIndex === -1) {
        console.warn("CSV Parser (Flexible): Could not identify a header row with multiple dates.");
        return extractedData; // Cannot proceed without date columns
    }

    // --- Find Person/Identifier Column ---
    // Guess it's the first column that's *not* a date in the identified header row
    for (let i = 0; i < headerRow.length; i++) {
        // Check if this column index corresponds to a date found earlier
        const isDateColumn = Object.values(dateIndices).includes(i);

        if (!isDateColumn) { // If it's not a date column
             const headerText = headerRow[i]?.toLowerCase();
             // Check if the header text suggests it's a person/initials column
             if (['individual', 'name', 'user', 'person', 'initials', 'initial', 'by'].includes(headerText)) {
                 personColumnIndex = i;
                 console.log(`CSV Parser (Flexible): Identified person column by header "${headerRow[i]}" at index ${i}.`);
                 break;
             }
             // If header isn't obvious, check the content of the first data row below the header
             if (personColumnIndex === -1 && dateRowIndex + 1 < lines.length) {
                 const firstDataCells = simpleCsvSplit(lines[dateRowIndex + 1]);
                 if (i < firstDataCells.length) {
                     const firstDataCellContent = firstDataCells[i];
                     // If the cell content exists and is not purely numeric, assume it's the identifier column
                     if (firstDataCellContent && isNaN(parseInt(firstDataCellContent))) {
                         personColumnIndex = i;
                         console.log(`CSV Parser (Flexible): Identified person column by content "${firstDataCellContent}" at index ${i}.`);
                         break;
                     }
                 }
             }
        }
    }

    // If still no person column found, maybe default to index 0 if it wasn't a date column?
    if (personColumnIndex === -1 && headerRow.length > 0 && !Object.values(dateIndices).includes(0)) {
        personColumnIndex = 0;
         console.log(`CSV Parser (Flexible): Defaulting person column to index 0.`);
    }


    if (personColumnIndex === -1) { // Check if we failed to find a person column
        console.warn("CSV Parser (Flexible): Could not reliably identify a person/identifier column.");
        return extractedData; // Cannot proceed without identifier column
    }
    console.log(`CSV Parser (Flexible): Using person column index ${personColumnIndex}.`);


    // --- Process Data Rows ---
    // Start from the row immediately after the identified header row
    for (let i = dateRowIndex + 1; i < lines.length; i++) {
        const line = lines[i]?.trim();
        // Skip empty lines and potential total lines
        if (!line || line.toLowerCase().startsWith('total') || line.toLowerCase().startsWith('grand total')) continue;

        const cells = simpleCsvSplit(line);
        // Ensure the row has enough cells for the identifier column
        if (cells.length <= personColumnIndex) continue;

        let personIdentifier = cells[personColumnIndex];
        if (!personIdentifier) continue; // Skip if identifier is empty

        // Try to map if it looks like initials, otherwise use the identifier as the name
        const personName = INITIALS_TO_NAME[personIdentifier.toUpperCase()] || personIdentifier;

        // Initialize person's data object if needed
        if (!extractedData[personName]) extractedData[personName] = {};

        // Extract counts for each date column
        for (const date in dateIndices) {
            const columnIndex = dateIndices[date];
            if (columnIndex < cells.length) {
                const count = parseInt(cells[columnIndex], 10);
                // Only store positive counts
                if (!isNaN(count) && count > 0) {
                    if (personName.endsWith('(Unknown)')) {
                        // Log only once per unknown initial to reduce noise
                        if (!this._warnedUnknown) this._warnedUnknown = new Set();
                        if (!this._warnedUnknown.has(personIdentifier)) {
                             console.warn(`CSV Parser (Flexible): Storing data for unknown identifier "${personIdentifier}" as "${personName}"`);
                             this._warnedUnknown.add(personIdentifier);
                        }
                    }
                    extractedData[personName][date] = (extractedData[personName][date] || 0) + count;
                }
            }
        }
    } // End loop through data rows

    const personsFound = Object.keys(extractedData).length;
    console.log(`CSV Parser (Flexible): Finished. Found data for ${personsFound} persons.`);
    return extractedData;
}


// --- Multi-Strategy Parser Orchestrator ---
/**
 * Attempts to parse CSV data by trying multiple common format strategies.
 * @param {string[]} lines - An array of non-empty strings representing the CSV lines.
 * @param {string} folderName - The name of the folder (for logging purposes).
 * @returns {Promise<Object>} A promise that resolves to the extracted data object
 * (e.g., { PersonName: { 'YYYY-MM-DD': count } }) or an empty object if parsing fails.
 */
export async function parseCSVWithMultipleStrategies(lines, folderName) {
    console.log(`CSV Parser: Attempting multiple parsing strategies for "${folderName}"...`);
    // Input validation
    if (!Array.isArray(lines) || lines.some(l => typeof l !== 'string')) {
        const errorMsg = "Invalid input - 'lines' must be an array of strings.";
        console.error(`CSV Parser: ${errorMsg}`);
        ErrorManager.logError(errorMsg, { folderName: folderName, inputType: typeof lines }, SEVERITY.ERROR, CATEGORY.PROCESSING);
        return {}; // Return empty object on invalid input
    }

    // Clean lines: trim whitespace and remove empty lines
    const validLines = lines.map(l => l.trim()).filter(l => l);

    if (validLines.length === 0) {
        console.warn(`CSV Parser: No valid content lines found for folder "${folderName}".`);
        return {}; // Return empty if no content after cleaning
    }


    // Define the strategies to try in order of preference/specificity
    const strategies = [
        parseIndividualBlockFormat, // Specific block format first
        parseInitialsFormat,        // Format with an "Initials" column
        parseTabularFormat,         // Standard table with "Individual" or "Name" column
        parseFlexibleFormat         // Fallback flexible format (attempts to guess header/columns)
    ];

    // Try each strategy sequentially
    for (const strategy of strategies) {
        try {
            // Pass the cleaned lines to the strategy function
            const data = strategy(validLines, folderName);

            // Check if the strategy returned a non-empty object
            if (data && typeof data === 'object' && Object.keys(data).length > 0) {
                console.log(`CSV Parser: Success with strategy: ${strategy.name} for "${folderName}"`);

                // Basic validation of the extracted data structure
                // Ensure it looks like { Person: { Date: Count } }
                const isValidStructure = Object.values(data).every(personData =>
                    typeof personData === 'object' && personData !== null &&
                    Object.values(personData).every(count => typeof count === 'number') &&
                    Object.keys(personData).every(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
                );

                if (!isValidStructure) {
                     console.warn(`CSV Parser: Strategy ${strategy.name} produced invalid data structure for "${folderName}". Trying next.`);
                     ErrorManager.logError(`CSV parsing strategy ${strategy.name} produced invalid structure`, { folderName }, SEVERITY.WARNING, CATEGORY.PROCESSING);
                     continue; // Data structure seems wrong, try next strategy
                }

                return data; // Return the first successful, valid result
            }
            // If strategy returned empty object or null, try the next one
        } catch (error) {
            // Log errors encountered within a specific strategy, but continue trying others
            console.warn(`CSV Parser: Strategy ${strategy.name} threw an error for "${folderName}":`, error.message);
            // ErrorManager.logError(`CSV parsing strategy ${strategy.name} failed`, { folderName: folderName, error: error.message }, SEVERITY.WARNING, CATEGORY.PROCESSING); // Optional: Log non-critical strategy errors
        }
    }

    // If all strategies failed to produce a valid, non-empty result
    console.error(`CSV Parser: All parsing strategies failed for folder "${folderName}". Review CSV format or add a new parsing strategy.`);
    ErrorManager.logError(`All CSV parsing strategies failed`, { folderName: folderName }, SEVERITY.ERROR, CATEGORY.PROCESSING);
    return {}; // Return empty object if all fail
}

/* ==== END: TEST/scripts/csv-parser.js ==== */
