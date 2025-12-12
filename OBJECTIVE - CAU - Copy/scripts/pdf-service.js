// TEST/scripts/pdf-service.js
// Amended v1.4 - Robust blob handling and controlled download
'use strict';

import ReportGenerator from './pdf-export.js';
import { TRANSPORT_LOGO_BASE64 } from './transport-logo.js';

/**
 * Helper function to trigger download of a blob as a file.
 * Includes checks for blob validity.
 * @param {Blob} blob - The blob data to download
 * @param {string} filename - The filename to use for the download
 */
export function downloadBlob(blob, filename) {
    console.log(`Download Blob: Attempting to download '${filename}'.`);
    if (!blob) {
        console.error("Download Blob Error: Blob is null or undefined for filename:", filename);
        // Optionally inform the user or throw an error
        // For now, just logging and returning to prevent further errors.
        return;
    }
    if (!(blob instanceof Blob)) {
        console.error("Download Blob Error: Provided object is not a Blob for filename:", filename, blob);
        // Optionally inform the user or throw an error
        return;
    }
    if (blob.size === 0) {
        console.warn("Download Blob Warning: Blob size is 0 for filename:", filename, ". Download might result in an empty file.");
        // Continue with download attempt as some valid empty files might exist,
        // but this is often an indicator of an issue.
    }

    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        console.log(`Download Blob: Download initiated for '${filename}'.`);
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log(`Download Blob: Cleaned up URL for '${filename}'.`);
        }, 150); // Increased delay slightly for safety
    } catch (error) {
        console.error(`Download Blob Error for '${filename}':`, error);
        // Optionally show an error message to the user here
        // For example, by calling a global status update function if available
        if (typeof reportsExporter?.showMessage === 'function') {
             reportsExporter.showMessage(`Error downloading file ${filename}: ${error.message}`, true);
        }
    }
}

/**
 * Generates a PDF report using ReportGenerator.
 * Now includes a parameter to control immediate download.
 *
 * @param {Object} reportData - The structured data for the report.
 * @param {string} [originalFilename='report.pdf'] - The desired base filename for the PDF.
 * @param {boolean} [andDownload=true] - Whether to trigger download immediately. If false, returns {blob, fileName}.
 * @returns {Promise<Object|null>} A Promise resolving with an object { blob: Blob, fileName: string } if successful and not downloading,
 * or just the blob if andDownload was true (for backward compatibility if needed, though object is better),
 * or null if PDF generation failed.
 */
export async function generateAndDownloadPdf(reportData, originalFilename = 'report.pdf', andDownload = true) {
    console.log(`PDF Service: Starting PDF generation for "${originalFilename}". Download immediately: ${andDownload}`);
    
    let finalFileName = originalFilename; // Initialize with the provided filename

    try {
        if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF !== 'function') {
             console.error('PDF Service Error: jsPDF library is not loaded.');
             throw new Error('PDF Library (jsPDF) missing.');
        }
        const jsPDFConstructor = window.jspdf.jsPDF;
        let autoTablePlugin = jsPDFConstructor.API?.autoTable || window.jspdf.autoTable || null;

        if (!autoTablePlugin) {
            console.warn('PDF Service Warning: jsPDF AutoTable plugin not found. Tables may not render correctly.');
        } else {
            console.log("PDF Service: Found autoTable plugin.");
        }

        const brandingOptions = {
            logoDataUrl: TRANSPORT_LOGO_BASE64,
            teamName: reportData.branding?.teamName || 'Customer Administration Unit'
        };

        const pdfGenerator = new ReportGenerator(jsPDFConstructor, autoTablePlugin, brandingOptions);

        console.log("PDF Service: Calling pdfGenerator.generateReport...");
        // generateReport should return an object {blob, suggestedFilename}
        // or just a blob for backward compatibility, which we handle.
        const generationResult = await pdfGenerator.generateReport(reportData);
        
        let pdfBlob;
        if (generationResult && generationResult.blob instanceof Blob && generationResult.suggestedFilename) {
            pdfBlob = generationResult.blob;
            finalFileName = generationResult.suggestedFilename; // Use filename from generator if provided
            console.log(`PDF Service: PDF Blob generated. Suggested filename: "${finalFileName}"`);
        } else if (generationResult instanceof Blob) { // Backward compatibility
            pdfBlob = generationResult;
            console.log(`PDF Service: PDF Blob generated (backward compatibility). Using original filename: "${finalFileName}"`);
        } else {
            console.error('PDF Service Error: PDF generation did not return a valid Blob or result object.');
            throw new Error('PDF generation failed to produce a valid output.');
        }

        if (!(pdfBlob instanceof Blob)) {
            console.error('PDF Service Error: Generated output is not a Blob.', pdfBlob);
            throw new Error('Invalid PDF blob generated.');
        }
         if (pdfBlob.size === 0) {
            console.warn(`PDF Service Warning: Generated PDF blob for "${finalFileName}" is empty (0 bytes).`);
        }


        if (andDownload) {
            console.log(`PDF Service: Initiating immediate download for "${finalFileName}"...`);
            downloadBlob(pdfBlob, finalFileName);
            console.log(`PDF Service: PDF generation and immediate download initiated for "${finalFileName}".`);
        } else {
            console.log(`PDF Service: PDF generation complete for "${finalFileName}". Download deferred.`);
        }
        
        // Always return the blob and the final determined filename
        return { blob: pdfBlob, fileName: finalFileName };

    } catch (error) {
        console.error(`PDF Service: Failed to generate PDF for "${finalFileName}":`, error);
        if (typeof reportsExporter?.showMessage === 'function') {
             reportsExporter.showMessage(`Error generating PDF "${finalFileName}": ${error.message}`, true);
        } else {
             alert(`Error generating PDF "${finalFileName}": ${error.message}`);
        }
        // To avoid downstream errors with a missing blob, return null or an object indicating failure
        return { blob: null, fileName: finalFileName, error: error };
    }
}