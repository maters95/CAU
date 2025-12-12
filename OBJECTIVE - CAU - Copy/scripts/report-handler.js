// report-handler.js
// Handles the integration between report-generator.js and the PDF service
// with Transport for NSW branding and email attachment support

import { generateObjectiveReports } from './report-generator.js';
import { generateAndDownloadPdf } from './pdf-service.js';
import { downloadBlob } from './pdf-service.js';

const TFNSW_BRANDING = {
    teamName: 'Customer Administration Unit',
};

const EMAIL_TEMPLATES = {
    body: `Dear \${recipientName},

This report contains statistics for your activity in Objective for the selected period.

If you have any questions about this report, please contact the Customer Administration Unit.

Kind Regards,

Customer Administraion Unit
Road Safety Regulation
Safety, Policy, Environment & Regulation
Transport for NSW

T 02 6640 1333  E CustomerAdministrationUnit@transport.nsw.gov.au

Cnr King and Fitzroy Streets Grafton NSW 2460

I acknowledge the Aboriginal people of the country on
which I work, their traditions, culture and a shared history and
identity. I also pay my respects to Elders past and present and recognise the
continued connection to country.

Please consider the environment before printing this email.`
};

export async function generateBrandedReports(selectedPersons, selectedFoldersDisplayNames, options = {}) {
  try {
    console.log('Generating branded reports with options:', options);

    const reportContext = {
        year: options.reportYear,
        month: options.reportMonth, 
        week: options.selectedWeek,
        detailedReportType: options.detailedReportType,
        primaryType: 'Report',
        periodDescriptor: ''
    };

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; // For formatting day names if needed

    const formatDateForSubjectRange = (dateString) => {
        if (!dateString) return '';
        try {
            const date = new Date(dateString); // dateString is expected to be ISO (e.g., from toISOString())
            // Ensure date is valid after parsing
            if (isNaN(date.getTime())) {
                console.warn("Invalid date string for subject formatting:", dateString);
                return ''; // Or some fallback
            }
            // Using DD/MM format
            return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        } catch (e) {
            console.warn("Error formatting date for subject:", dateString, e);
            return '';
        }
    };
    
    // Logic for reportContext based on options
    if (options.detailedReportType === 'weeklyDaily' && options.weekStartDate && options.weekEndDate) {
        reportContext.primaryType = 'Weekly Report'; // Changed from "Daily Breakdown - Week"
        const startDateFormatted = formatDateForSubjectRange(options.weekStartDate);
        const endDateFormatted = formatDateForSubjectRange(options.weekEndDate);
        // Ensure year is derived correctly, assumes week doesn't span New Year for simplicity in subject.
        const yearOfReport = options.weekStartDate ? new Date(options.weekStartDate).getFullYear() : options.reportYear;
        if (startDateFormatted && endDateFormatted) {
            reportContext.periodDescriptor = `Week of ${startDateFormatted} - ${endDateFormatted} ${yearOfReport}`;
        } else { // Fallback if dates are bad
             reportContext.periodDescriptor = `Week ${options.selectedWeek || ''} of ${options.reportYear || ''}`;
        }
    } else if (options.reportMonth !== undefined && options.reportMonth !== null && options.reportMonth >= 0 && options.reportMonth <= 11) {
        reportContext.primaryType = 'Monthly Report';
        reportContext.periodDescriptor = `${monthNames[options.reportMonth]} ${options.reportYear}`;
    } else if (options.selectedWeek !== undefined && String(options.selectedWeek).trim() !== '') {
        reportContext.primaryType = 'Weekly Report';
        const weekNumber = String(options.selectedWeek).replace(/\D/g, '');
        reportContext.periodDescriptor = `Week ${weekNumber || options.selectedWeek} of ${options.reportYear}`;
    } else if (options.detailedReportType?.toLowerCase().includes('daily')) {
        reportContext.primaryType = 'Daily Report';
        reportContext.periodDescriptor = options.reportYear ? String(options.reportYear) : '';
    } else if (options.detailedReportType) {
        reportContext.primaryType = options.detailedReportType;
        reportContext.periodDescriptor = options.reportYear ? String(options.reportYear) : '';
    } else {
        reportContext.primaryType = 'Report';
        reportContext.periodDescriptor = options.reportYear ? String(options.reportYear) : '';
    }

    const result = await generateObjectiveReports(selectedPersons, selectedFoldersDisplayNames, options);

    if (result.errors?.length > 0) {
      return { success: false, message: `Report generation encountered errors: ${result.errors.join(', ')}`, generatedReports: 0, errors: result.errors };
    }
    if (!result.generatedReports?.length) {
      return { success: false, message: 'No reports were generated.', generatedReports: 0, errors: ['No reports generated'] };
    }

    let processedCount = 0;
    const errors = [...(result.errors || [])];
    const emailQueue = [];
    const filesToDownload = []; 

    let personReportMap = {};
    if (Array.isArray(selectedPersons) && !options.isTeamReport) {
      result.generatedReports.forEach((report, index) => {
        if (index < selectedPersons.length) personReportMap[report.fileName] = selectedPersons[index];
      });
    }

    for (const report of result.generatedReports) {
      try {
        const targetPersonForEmail = personReportMap[report.fileName] || report.targetPerson || (report.fileName.includes('_') ? report.fileName.split('_')[0] : 'Recipient');
        let fileBlob;
        let fileTypeForEmail;
        let finalFileName = report.fileName;

        if (report.type === 'pdf') {
          const brandedReportData = { ...report.data, branding: TFNSW_BRANDING };
          const pdfGenResult = await generateAndDownloadPdf(brandedReportData, report.fileName, false); 
          if (pdfGenResult && pdfGenResult.blob) { // Check if blob is valid
            fileBlob = pdfGenResult.blob;
            finalFileName = pdfGenResult.fileName || report.fileName;
            fileTypeForEmail = 'application/pdf';
          } else {
            throw new Error(`PDF generation failed or returned invalid blob for ${report.fileName}`);
          }
        } else if (report.type === 'csv') {
          const csvContent = typeof report.content === 'string' ? report.content : String(report.content);
          fileBlob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' });
          fileTypeForEmail = 'text/csv';
        } else {
            console.warn(`Unsupported report type for processing: ${report.type}`);
            continue;
        }
        
        if (fileBlob) {
            filesToDownload.push({ blob: fileBlob, fileName: finalFileName });
            processedCount++;
            if (options.email?.enabled && targetPersonForEmail) {
              emailQueue.push({
                person: targetPersonForEmail,
                fileName: finalFileName,
                type: fileTypeForEmail,
                reportContext: reportContext,
                emailOptionsFromUI: options.email
              });
            }
        }
      } catch (error) {
        console.error(`Error processing report ${report.fileName}:`, error);
        errors.push(`Failed to process ${report.fileName}: ${error.message}`);
      }
    }

    console.log(`Attempting to download ${filesToDownload.length} files.`);
    for (const file of filesToDownload) {
        try {
            if (file.blob && file.fileName) {
                console.log(`Downloading ${file.fileName}...`);
                downloadBlob(file.blob, file.fileName);
            } else {
                errors.push(`Skipped download for a file due to missing blob/filename.`);
            }
        } catch (downloadError) {
            console.error(`Error during deferred download of ${file.fileName}:`, downloadError);
            errors.push(`Failed to download ${file.fileName}: ${downloadError.message}`);
        }
    }

    if (options.email?.enabled && emailQueue.length > 0) {
      console.log(`Email queue has ${emailQueue.length} items. Proceeding to sendReportEmails.`);
      try {
        const emailResults = await sendReportEmails(emailQueue);
        if (emailResults.errors?.length) errors.push(...emailResults.errors);
        if (emailResults.sentCount > 0) console.log(`Successfully initiated ${emailResults.sentCount} email(s)`);
      } catch (emailError) {
        console.error("Error during email sending phase:", emailError);
        errors.push(`Email sending phase error: ${emailError.message}`);
      }
    } else if (options.email?.enabled) {
        console.log("Email was enabled, but the email queue is empty.");
    }

    return {
      success: processedCount > 0 && errors.length === (result.errors?.length || 0),
      message: processedCount > 0 ? `Successfully processed ${processedCount} reports.` : 'No reports were processed.',
      generatedReports: processedCount,
      errors: errors
    };
  } catch (error) {
    console.error("Overall error in generateBrandedReports:", error);
    return { success: false, message: `Generation failed: ${error.message}`, generatedReports: 0, errors: [error.message] };
  }
}

async function sendReportEmails(emailQueue) {
  console.log("sendReportEmails called with queue size:", emailQueue.length);
  const results = { sentCount: 0, errors: [] };
  if (emailQueue.length === 0) {
    console.log("Email queue is empty, skipping email sending.");
    return results;
  }
  try {
    const emailMappings = await loadEmailMappings();
    const reportsByPerson = {};
    emailQueue.forEach(item => {
      if (!reportsByPerson[item.person]) reportsByPerson[item.person] = [];
      reportsByPerson[item.person].push(item);
    });

    for (const [person, reportsForThisPerson] of Object.entries(reportsByPerson)) {
      try {
        const mapping = emailMappings[person];
        if (!mapping || !mapping.email) {
          results.errors.push(`No email mapping found for ${person}`);
          console.warn(`No email mapping for ${person}`);
          continue;
        }
        const reportContext = reportsForThisPerson[0]?.reportContext;
        const emailOptionsFromUI = reportsForThisPerson[0]?.emailOptionsFromUI;

        if (!reportContext || !emailOptionsFromUI) {
            results.errors.push(`Missing report context or email UI options for ${person}`);
            console.warn(`Missing context/options for ${person}`);
            continue;
        }
        console.log(`Calling createEmailWithAttachments for ${person}`);
        await createEmailWithAttachments(person, mapping.email, mapping.cc, reportsForThisPerson, emailOptionsFromUI, reportContext);
        console.log(`Email dialog prepared for ${person} to ${mapping.email}`);
        results.sentCount++;
      } catch (personError) {
        results.errors.push(`Error processing email for ${person}: ${personError.message}`);
        console.error(`Error processing email for ${person}:`, personError);
      }
    }
    return results;
  } catch (error) {
    console.error("Error in sendReportEmails:", error);
    results.errors.push(`Email sending failed: ${error.message}`);
    return results;
  }
}

async function createEmailWithAttachments(personName, to, cc, reports, emailOptionsFromUI, reportContext) {
  console.log("Creating email dialog for:", personName, "To:", to);
  const isDarkMode = document.documentElement.classList.contains('dark-mode');

  const bgColor = isDarkMode ? '#2b2b2b' : '#ffffff';
  const textColor = isDarkMode ? '#e0e0e0' : '#212529';
  const borderColor = isDarkMode ? '#444' : '#dee2e6';
  const inputBgColor = isDarkMode ? '#333333' : '#f8f9fa';
  const inputTextColor = isDarkMode ? '#e0e0e0' : '#333';
  const headerColor = isDarkMode ? '#79c0ff': '#003366';
  const attachmentBgColor = isDarkMode ? '#383838' : '#f0f0f0';
  const buttonDefaultBg = isDarkMode ? '#4f5356' : '#6c757d';
  const buttonDefaultText = '#ffffff';
  const buttonPrimaryBg = isDarkMode ? '#2386f7' : '#007bff';
  const buttonPrimaryHoverBg = isDarkMode ? '#0069d9' : '#0056b3';

  const emailDialog = document.createElement('div');
  emailDialog.id = 'emailDialog';
  emailDialog.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background-color: rgba(0, 0, 0, 0.75); display: flex;
    justify-content: center; align-items: center; z-index: 10000;`;

  const emailContent = document.createElement('div');
  emailContent.style.cssText = `
    background-color: ${bgColor}; color: ${textColor}; padding: 25px; border-radius: 8px;
    width: 90%; max-width: 650px; max-height: 85vh; overflow-y: auto;
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3); border: 1px solid ${borderColor};
    font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;`;

  const header = document.createElement('h2');
  header.textContent = 'Confirm Email Details';
  header.style.cssText = `margin-top: 0; color: ${headerColor}; border-bottom: 1px solid ${borderColor}; padding-bottom: 12px; font-size: 1.3em; font-weight: 600;`;

  let subject = `${reportContext.primaryType} for ${personName}`;
  if (reportContext.periodDescriptor) subject += ` - ${reportContext.periodDescriptor}`;
  subject += ` - Transport for NSW`;

  const finalBody = EMAIL_TEMPLATES.body.replace(/\${recipientName}/g, personName || 'Recipient');
  const displayBody = finalBody.replace(/\n/g, '<br>');

  const emailInfo = document.createElement('div');
  emailInfo.innerHTML = `
    <div style="margin: 15px 0; font-size: 0.95em;"><strong>To:</strong> ${to}</div>
    ${(cc && String(cc).trim() !== '') ? `<div style="margin: 15px 0; font-size: 0.95em;"><strong>CC:</strong> ${cc}</div>` : ''}
    <div style="margin: 15px 0; font-size: 0.95em;"><strong>Subject:</strong> ${subject}</div>
    <div style="margin: 15px 0;">
      <strong style="font-size: 0.95em;">Body Preview:</strong>
      <div style="border: 1px solid ${borderColor}; padding: 12px; margin-top: 8px; white-space: pre-wrap; background-color: ${inputBgColor}; color: ${inputTextColor}; border-radius: 6px; font-size: 0.9em; max-height: 200px; overflow-y: auto;">
        ${displayBody}
      </div>
    </div>`;

  const attachmentsSection = document.createElement('div');
  attachmentsSection.innerHTML = `<div style="margin: 20px 0 10px 0; font-size: 0.95em;"><strong>Attachments to include:</strong> (${reports.length})</div>`;
  const attachmentList = document.createElement('ul');
  attachmentList.style.cssText = `list-style: none; padding: 0; margin: 10px 0;`;
  reports.forEach(report => {
    const item = document.createElement('li');
    item.style.cssText = `padding: 10px; margin-bottom: 6px; background-color: ${attachmentBgColor}; color: ${textColor}; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 0.9em;`;
    const fileNameSpan = document.createElement('span');
    fileNameSpan.textContent = report.fileName;
    item.appendChild(fileNameSpan);
    attachmentList.appendChild(item);
  });
  attachmentsSection.appendChild(attachmentList);

  const buttonsSection = document.createElement('div');
  buttonsSection.style.cssText = `display: flex; justify-content: flex-end; margin-top: 25px; gap: 12px;`;

  const commonButtonStyles = `
    padding: 10px 20px; font-size: 0.9em; border: none; border-radius: 5px; cursor: pointer; font-weight: 500; transition: background-color 0.2s ease, box-shadow 0.2s ease;
  `;

  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancel';
  cancelButton.style.cssText = commonButtonStyles + `background-color: ${buttonDefaultBg}; color: ${buttonDefaultText};`;
  cancelButton.onmouseover = () => cancelButton.style.backgroundColor = isDarkMode ? '#676c70' : '#5a6268';
  cancelButton.onmouseout = () => cancelButton.style.backgroundColor = buttonDefaultBg;
  cancelButton.addEventListener('click', () => {
    if (document.getElementById('emailDialog')) document.body.removeChild(emailDialog);
  });

  const sendButton = document.createElement('button');
  sendButton.textContent = 'Open in Email Client';
  sendButton.style.cssText = commonButtonStyles + `background-color: ${buttonPrimaryBg}; color: ${buttonDefaultText};`;
  sendButton.onmouseover = () => sendButton.style.backgroundColor = buttonPrimaryHoverBg;
  sendButton.onmouseout = () => sendButton.style.backgroundColor = buttonPrimaryBg;

  sendButton.addEventListener('click', () => {
    const mailtoSubjectEnc = encodeURIComponent(subject);
    const mailtoBodyEnc = encodeURIComponent(finalBody);

    let mailtoUrl = `mailto:${encodeURIComponent(to)}`;
    mailtoUrl += `?subject=${mailtoSubjectEnc}&body=${mailtoBodyEnc}`;

    if (cc && String(cc).trim() !== '') {
        mailtoUrl += `&cc=${encodeURIComponent(cc)}`;
    }

    window.open(mailtoUrl, '_blank');

    const instructionsBg = isDarkMode ? '#332200' : '#fff3cd';
    const instructionsText = isDarkMode ? '#ffd780': '#856404';
    const instructionsBorder = isDarkMode ? '#5c471f': '#ffeeba';

    const instructions = document.createElement('div');
    instructions.style.cssText = `
      background-color: ${instructionsBg}; color: ${instructionsText}; 
      padding: 15px; margin-top: 15px; border-radius: 6px; font-size: 0.9em; 
      border: 1px solid ${instructionsBorder};`;
    instructions.innerHTML = `<strong>Important:</strong> Your email client has been opened.<br>Please <strong>manually attach</strong> the following ${reports.length} file(s) that were previously downloaded to your computer:<br><ul style="margin-top: 8px; padding-left: 20px;">${reports.map(r => `<li>${r.fileName}</li>`).join('')}</ul>`;
    
    buttonsSection.innerHTML = '';
    buttonsSection.appendChild(instructions);
    
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.style.cssText = commonButtonStyles + `background-color: ${buttonPrimaryBg}; color: ${buttonDefaultText}; margin-top: 15px;`;
    closeButton.onmouseover = () => closeButton.style.backgroundColor = buttonPrimaryHoverBg;
    closeButton.onmouseout = () => closeButton.style.backgroundColor = buttonPrimaryBg;
    closeButton.addEventListener('click', () => {
      if (document.getElementById('emailDialog')) document.body.removeChild(emailDialog);
    });
    buttonsSection.appendChild(closeButton);
  });

  buttonsSection.appendChild(cancelButton);
  buttonsSection.appendChild(sendButton);
  emailContent.appendChild(header);
  emailContent.appendChild(emailInfo);
  emailContent.appendChild(attachmentsSection);
  emailContent.appendChild(buttonsSection);
  emailDialog.appendChild(emailContent);
  
  console.log("Appending emailDialog to body.");
  document.body.appendChild(emailDialog);

  return new Promise((resolve) => {
    const observer = new MutationObserver((mutationsList, obs) => {
      for (const mutation of mutationsList) {
        if (mutation.removedNodes) {
          mutation.removedNodes.forEach(node => {
            if (node.id === 'emailDialog') { obs.disconnect(); resolve(); return; }
          });
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: false });
    const checkDialogInterval = setInterval(() => {
      if (!document.getElementById('emailDialog')) {
        clearInterval(checkDialogInterval);
        observer.disconnect();
        resolve();
      }
    }, 250);
  });
}

async function loadEmailMappings() {
  try {
    const browserAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
    if (!browserAPI || !browserAPI.storage || !browserAPI.storage.local) {
      console.warn("Browser API or storage.local not found. Email mappings may not load.");
      return {};
    }
    const result = await browserAPI.storage.local.get('ecmEmailMappings');
    return result.ecmEmailMappings || {};
  } catch (error) {
    console.error("Error loading email mappings:", error);
    return {};
  }
}