// TEST/scripts/offscreen-pdf-worker.js
// v1.6 - Fixed logo aspect ratio, grid theme, right-aligned numbers, bold total row

import { TRANSPORT_LOGO_BASE64 } from './transport-logo.js';
// Assumes jsPDF and autoTable are loaded globally via offscreen.html + jspdf-initializer.js

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // (Keep message listener logging and basic handling)
    console.log('[Offscreen] Received message:', message);
    if(message?.data) { /* ... log payload ... */ }

    if (message.target === 'offscreen' && message.action === 'generatePdfOffscreen') {
        console.log('[Offscreen] Processing generatePdfOffscreen action...');
        generatePDF(message.data)
            .then((dataUrl) => { sendResponse({ success: true, dataUrl }); })
            .catch((error) => { sendResponse({ success: false, error: error.message }); });
        return true;
    } else { /* ... ignore message ... */ }
});

async function generatePDF(data) {
    // (Keep initial logging and data extraction)
    console.log('[Offscreen] generatePDF function started...');
    if (!data) throw new Error("generatePDF received null or undefined data payload.");
    const { title, mainTable } = data;

    // (Keep jsPDF / autoTable global checks and initialization)
    if (typeof jsPDF === 'undefined') throw new Error("jsPDF library not loaded...");
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    if (typeof doc.autoTable !== 'function') { /* ... try fallbacks or throw ... */ throw new Error("jsPDF AutoTable plugin not loaded..."); }

    // (Keep header spacing adjustments from v1.2)
    const logoX = 10; const logoY = 5; const logoWidth = 40; const logoHeight = 12; // logoHeight is now mainly for layout calculation
    const pageWidth = doc.internal.pageSize.getWidth(); const pageHeight = doc.internal.pageSize.getHeight();
    const centerX = pageWidth / 2;
    // contentStartY still uses the original logoHeight estimate for spacing. Adjust if needed.
    const contentStartY = logoY + logoHeight + 2; // Adjust this if logo's auto-height significantly changes layout

    // --- Add Logo ---
    try {
        if (TRANSPORT_LOGO_BASE64 && typeof TRANSPORT_LOGO_BASE64 === 'string' && TRANSPORT_LOGO_BASE64.startsWith('data:image')) {
             // --- FIX: Set height to 0 for auto aspect ratio ---
            doc.addImage(TRANSPORT_LOGO_BASE64, 'PNG', logoX, logoY, logoWidth, 0);
            console.log("[Offscreen] Logo added (aspect ratio preserved).");
        } else { console.warn("[Offscreen] TRANSPORT_LOGO_BASE64 is missing or invalid."); }
    } catch (err) {
        console.error('[Offscreen] Adding logo failed:', err, "Logo data length:", TRANSPORT_LOGO_BASE64?.length);
        // Draw placeholder if logo fails
        doc.setTextColor(255, 0, 0); // Red
        doc.setFontSize(8);
        doc.text("[Logo Error]", logoX, logoY + logoHeight / 2, { baseline: 'middle'});
        doc.setTextColor(0, 0, 0); // Reset color
    }
    // --- End Add Logo ---


    // (Keep title/subtitle drawing from v1.2)
    let currentY = contentStartY; doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.text(title || 'Team Report – Unknown Period', centerX, currentY, { align: 'center' });
    currentY += 6; doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.text('Customer Administration Unit', centerX, currentY, { align: 'center' });
    const tableStartY = currentY + 5;

    // --- Add Table ---
    const isMainTableValid = mainTable && typeof mainTable === 'object' && Array.isArray(mainTable.head) && mainTable.head.length > 0 && Array.isArray(mainTable.head[0]) && Array.isArray(mainTable.body);
    console.log(`[Offscreen] Final check before autoTable: isMainTableValid = ${isMainTableValid}`);
    if (isMainTableValid) { //
        try {
            doc.autoTable({ //
                startY: tableStartY,
                head: mainTable.head,
                body: mainTable.body,
                theme: 'grid', // <-- Set theme to 'grid' //
                headStyles: { fillColor: [0, 91, 172] }, // Dark blue header
                styles: {
                    fontSize: 8, //
                    // lineColor: [180, 180, 180], // Optional: Light grey lines
                    // lineWidth: 0.1            // Optional: Thin lines
                 },
                // --- Style numerical columns to be right-aligned ---
                columnStyles: {
                    // Assuming indices based on image_54bcc5.png:
                    // 0: Folder (Left - default)
                    1: { align: 'right' }, // Week 1
                    2: { align: 'right' }, // Week 2
                    3: { align: 'right' }, // Week 3
                    4: { align: 'right' }, // Week 4
                    5: { align: 'right' }, // Week 5 (or partial)
                    6: { align: 'right' }  // Total
                },
                // --- Make the 'Total' row bold ---
                didParseCell: function (data) {
                    // Check if it's the last row (the 'Total' row)
                    if (data.row.index === data.table.body.length - 1) {
                        data.cell.styles.fontStyle = 'bold';
                    }
                },
                didDrawPage: (hookData) => {
                    // Footer
                    const footerY = pageHeight - 8;
                    doc.setFontSize(8); //
                    doc.setFont(undefined, 'italic'); //
                    const footerText = 'Generated by Objective Data Extraction Tool - Developed for Transport for NSW by Zak Masters 2025'; //
                    doc.text(footerText, centerX, footerY, { align: 'center' }); //
                }
            });
             console.log("[Offscreen] autoTable call completed."); //
        } catch (autoTableError) { console.error("[Offscreen] Error during doc.autoTable() call:", autoTableError); throw autoTableError; } //
    } else {
        console.warn("[Offscreen] mainTable data is invalid or missing. Drawing placeholder.");
        doc.setTextColor(255, 0, 0); // Red
        doc.text("Error: Table data is missing or invalid.", logoX, tableStartY + 10);
        doc.setTextColor(0, 0, 0); // Reset color
     }
    // --- End Add Table ---

    // (Keep PDF output logic)
    console.log("[Offscreen] Preparing to output data URL..."); //
    try { const dataUrl = doc.output('dataurlstring'); console.log("[Offscreen] dataurlstring generated successfully."); return dataUrl; } //
    catch (outputError) { console.error("[Offscreen] Error during doc.output():", outputError); throw outputError; } //
}