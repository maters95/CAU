// verification-modal.js - Data Verification Modal Handler
// Based on D&A implementation minus police count functionality

export class VerificationModal {
    constructor() {
        this.modal = null;
        this.modalBody = null;
        this.searchInput = null;
        this.counter = null;
        this.cancelBtn = null;
        this.confirmBtn = null;
        this.verificationData = [];
        this.allFolderData = [];
        this.currentWeekInfo = null;
        
        this.initializeModal();
        this.setupMessageListener();
    }
    
    initializeModal() {
        this.modal = document.getElementById('verificationModal');
        this.modalBody = document.getElementById('verificationBody');
        this.searchInput = document.getElementById('verificationSearch');
        this.counter = document.getElementById('verificationCounter');
        this.cancelBtn = document.getElementById('verificationCancel');
        this.confirmBtn = document.getElementById('verificationConfirm');
        
        if (!this.modal || !this.modalBody || !this.confirmBtn || !this.cancelBtn) {
            console.error('Verification Modal: Required elements not found');
            return;
        }
        
        console.log('Verification Modal: Handler initialized');
    }
    
    setupMessageListener() {
        if (typeof chrome === 'undefined' || !chrome.runtime) return;
        
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'showVerificationModal') {
                console.log('Verification Modal: Received data', message);
                this.showVerificationModal(message.data, message.weekInfo);
                sendResponse({ status: 'modal_shown' });
            }
            return false;
        });
    }
    
    showVerificationModal(data, weekInfo) {
        console.log('Verification Modal: Showing modal with', data.length, 'folders', 'weekInfo:', weekInfo);
        
        this.allFolderData = data;
        this.verificationData = this.flattenData(data);
        this.currentWeekInfo = weekInfo;
        
        // Hide spinner, show modal
        const spinner = document.getElementById('spinnerOverlay');
        if (spinner) spinner.style.display = 'none';
        
        // Populate modal
        this.populateModal();
        this.updateCounter();
        
        // Show modal
        this.modal.style.display = 'flex';
        
        // Setup event listeners
        this.setupEventListeners();
    }
    
    flattenData(folderArray) {
        const flat = [];
        folderArray.forEach(folder => {
            folder.persons.forEach(person => {
                person.rows.forEach(row => {
                    flat.push({
                        folderName: folder.folderName,
                        personName: person.personName,
                        dateText: row.dateText,
                        nameText: row.nameText,
                        countText: row.countText,
                        extractedCount: row.extractedCount,
                        rule: row.rule
                    });
                });
            });
        });
        return flat;
    }
    
    populateModal() {
        this.modalBody.innerHTML = '';
        
        // Reset attention count
        this.attentionCount = 0;
        
        if (this.allFolderData.length === 0) {
            this.modalBody.innerHTML = '<p style="padding: 20px; text-align: center;">No data to verify</p>';
            return;
        }
        
        // Build hierarchical structure
        this.allFolderData.forEach((folder, folderIdx) => {
            const folderGroup = document.createElement('div');
            folderGroup.className = 'verification-folder-group';
            
            // Calculate folder totals
            let totalRows = 0;
            let totalExtracted = 0;
            folder.persons.forEach(person => {
                totalRows += person.rows.length;
                person.rows.forEach(row => {
                    totalExtracted += row.extractedCount || 0;
                });
            });
            
            // Folder header
            const folderHeader = document.createElement('div');
            folderHeader.className = 'verification-folder-header';
            folderHeader.textContent = folder.folderName;
            folderGroup.appendChild(folderHeader);
            
            // Folder stats
            const folderStats = document.createElement('div');
            folderStats.className = 'verification-folder-stats';
            folderStats.innerHTML = `Total Rows: ${totalRows} | Total Extracted: ${totalExtracted}`;
            folderGroup.appendChild(folderStats);
            
            // Person groups
            folder.persons.forEach((person, personIdx) => {
                const personGroup = document.createElement('div');
                personGroup.className = 'verification-person-group';
                
                // Person header
                const personHeader = document.createElement('div');
                personHeader.className = 'verification-person-header';
                personHeader.textContent = person.personName;
                personGroup.appendChild(personHeader);
                
                // Column headers (only for first person in folder)
                if (personIdx === 0) {
                    const headerRow = document.createElement('div');
                    headerRow.className = 'verification-header-row';
                    headerRow.innerHTML = `
                        <span class="verification-date">Date</span>
                        <span class="verification-name">Name</span>
                        <span class="verification-count-text">Count Text</span>
                        <span class="verification-count-header">Count</span>
                    `;
                    personGroup.appendChild(headerRow);
                }
                
                // Rows
                person.rows.forEach((row, rowIdx) => {
                    const rowDiv = document.createElement('div');
                    rowDiv.className = 'verification-row';
                    rowDiv.dataset.folderIdx = folderIdx;
                    rowDiv.dataset.personIdx = personIdx;
                    rowDiv.dataset.rowIdx = rowIdx;
                    
                    // Determine if this row needs attention
                    const needsAttention = this._checkNeedsAttention(row);
                    if (needsAttention.flag) {
                        rowDiv.classList.add('needs-attention');
                        rowDiv.dataset.attentionReason = needsAttention.reason;
                        this.attentionCount++;
                    }
                    
                    // Create all elements
                    const dateSpan = document.createElement('span');
                    dateSpan.className = 'verification-date';
                    dateSpan.textContent = row.dateText;
                    
                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'verification-name';
                    nameSpan.textContent = row.nameText;
                    
                    const countTextSpan = document.createElement('span');
                    countTextSpan.className = 'verification-count-text';
                    countTextSpan.textContent = row.countText;
                    
                    // Add attention indicator if needed
                    if (needsAttention.flag) {
                        const indicator = document.createElement('span');
                        indicator.className = 'attention-indicator';
                        indicator.textContent = '⚠';
                        indicator.title = needsAttention.reason;
                        countTextSpan.appendChild(indicator);
                    }
                    
                    const input = document.createElement('input');
                    input.type = 'number';
                    input.className = 'verification-count-input';
                    input.value = row.extractedCount;
                    input.min = '0';
                    input.max = '999';
                    input.dataset.original = row.extractedCount;
                    
                    // Update folder stats on input change
                    input.addEventListener('input', () => {
                        this.updateFolderStats(folderIdx);
                    });
                    
                    // Append all elements in order
                    rowDiv.appendChild(dateSpan);
                    rowDiv.appendChild(nameSpan);
                    rowDiv.appendChild(countTextSpan);
                    rowDiv.appendChild(input);
                    
                    personGroup.appendChild(rowDiv);
                });
                
                folderGroup.appendChild(personGroup);
            });
            
            this.modalBody.appendChild(folderGroup);
        });
        
        // Update footer stats after populating
        this.updateFooterStats();
    }
    
    updateFolderStats(folderIdx) {
        // Find all inputs for this folder
        const folderGroup = this.modalBody.querySelectorAll('.verification-folder-group')[folderIdx];
        if (!folderGroup) return;
        
        const inputs = folderGroup.querySelectorAll('.verification-count-input');
        let totalExtracted = 0;
        inputs.forEach(input => {
            totalExtracted += parseInt(input.value) || 0;
        });
        
        const totalRows = inputs.length;
        
        // Update the stats display
        const statsDiv = folderGroup.querySelector('.verification-folder-stats');
        if (statsDiv) {
            statsDiv.innerHTML = `Total Rows: ${totalRows} | Total Extracted: ${totalExtracted}`;
        }
        
        // Update footer stats whenever folder stats change
        this.updateFooterStats();
    }
    
    updateFooterStats() {
        // Count all rows
        const allRows = this.modalBody.querySelectorAll('.verification-row');
        let totalRows = 0;
        
        allRows.forEach(row => {
            // Only count visible rows
            if (row.style.display !== 'none') {
                totalRows++;
            }
        });
        
        // Update footer displays
        const totalRowsSpan = document.getElementById('verificationTotalRows');
        
        if (totalRowsSpan) {
            totalRowsSpan.textContent = `Total Rows: ${totalRows}`;
        }
    }
    
    updateCounter() {
        const total = this.verificationData.length;
        let counterText = `${total} ${total === 1 ? 'entry' : 'entries'}`;
        
        // Add attention count if there are items needing attention
        if (this.attentionCount > 0) {
            counterText += ` | ${this.attentionCount} need attention`;
        }
        
        this.counter.textContent = counterText;
    }
    
    /**
     * Check if a row needs attention based on various criteria
     * @param {Object} row - The row data to check
     * @returns {Object} { flag: boolean, reason: string }
     */
    _checkNeedsAttention(row) {
        const count = row.extractedCount;
        const countText = (row.countText || '').toLowerCase().trim();
        
        // Check 1: Non-single results (not exactly 1)
        if (count !== 1 && count !== 0) {
            // Check if count text suggests multiple results
            if (countText.includes('result') && !countText.includes('1 result')) {
                return { flag: true, reason: `Multiple results detected: ${count}` };
            }
            // High count threshold (anything over 50 is unusual for a single day)
            if (count > 50) {
                return { flag: true, reason: `Unusually high count: ${count}` };
            }
        }
        
        // Check 2: Zero count (might be parsing error or legitimate)
        if (count === 0) {
            return { flag: true, reason: 'Zero count - verify this is correct' };
        }
        
        // Check 3: Count text doesn't match extracted count
        const numberMatch = countText.match(/(\d+)\s*result/i);
        if (numberMatch) {
            const expectedCount = parseInt(numberMatch[1]);
            if (expectedCount !== count) {
                return { flag: true, reason: `Count mismatch: text shows ${expectedCount}, extracted ${count}` };
            }
        }
        
        // Check 4: Count text contains unexpected patterns
        if (countText.includes('error') || countText.includes('fail') || countText.includes('invalid')) {
            return { flag: true, reason: 'Potential error in source data' };
        }
        
        // Check 5: Very high counts (batches or bulk processing)
        if (count > 100) {
            return { flag: true, reason: `Very high count (${count}) - may be batch processing` };
        }
        
        return { flag: false, reason: '' };
    }
    
    /**
     * Apply the attention filter to show/hide rows
     */
    _applyAttentionFilter() {
        const rows = document.querySelectorAll('.verification-row');
        
        rows.forEach(row => {
            if (this.showOnlyAttention) {
                // Only show rows that need attention
                row.style.display = row.classList.contains('needs-attention') ? 'grid' : 'none';
            } else {
                // Show all rows
                row.style.display = 'grid';
            }
        });
        
        // Hide empty person groups
        document.querySelectorAll('.verification-person-group').forEach(personGroup => {
            const visibleRows = personGroup.querySelectorAll('.verification-row[style*="grid"]');
            personGroup.style.display = visibleRows.length > 0 ? 'block' : 'none';
        });
        
        // Hide empty folder groups
        document.querySelectorAll('.verification-folder-group').forEach(folderGroup => {
            const visiblePersons = folderGroup.querySelectorAll('.verification-person-group[style*="block"]');
            folderGroup.style.display = visiblePersons.length > 0 ? 'block' : 'none';
        });
        
        // Update footer stats
        this.updateFooterStats();
    }
    
    setupEventListeners() {
        // Attention filter toggle
        const filterAttentionBtn = document.getElementById('filterAttentionBtn');
        if (filterAttentionBtn) {
            this.showOnlyAttention = false;
            filterAttentionBtn.addEventListener('click', () => {
                this.showOnlyAttention = !this.showOnlyAttention;
                filterAttentionBtn.classList.toggle('active', this.showOnlyAttention);
                filterAttentionBtn.textContent = this.showOnlyAttention ? '⚠ Show All' : '⚠ Show Flagged';
                this._applyAttentionFilter();
            });
        }
        
        // Search functionality
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                
                if (!query) {
                    // Show all
                    document.querySelectorAll('.verification-folder-group').forEach(el => {
                        el.style.display = 'block';
                    });
                    document.querySelectorAll('.verification-person-group').forEach(el => {
                        el.style.display = 'block';
                    });
                    document.querySelectorAll('.verification-row').forEach(el => {
                        el.style.display = 'grid';
                    });
                    return;
                }
                
                // Filter rows
                document.querySelectorAll('.verification-row').forEach(row => {
                    const dateText = row.querySelector('.verification-date')?.textContent.toLowerCase() || '';
                    const nameText = row.querySelector('.verification-name')?.textContent.toLowerCase() || '';
                    const countText = row.querySelector('.verification-count-text')?.textContent.toLowerCase() || '';
                    
                    const matches = dateText.includes(query) || 
                                   nameText.includes(query) || 
                                   countText.includes(query);
                    
                    row.style.display = matches ? 'grid' : 'none';
                });
                
                // Hide empty person groups
                document.querySelectorAll('.verification-person-group').forEach(personGroup => {
                    const visibleRows = personGroup.querySelectorAll('.verification-row[style*="grid"]');
                    personGroup.style.display = visibleRows.length > 0 ? 'block' : 'none';
                });
                
                // Hide empty folder groups
                document.querySelectorAll('.verification-folder-group').forEach(folderGroup => {
                    const visiblePersons = folderGroup.querySelectorAll('.verification-person-group[style*="block"]');
                    folderGroup.style.display = visiblePersons.length > 0 ? 'block' : 'none';
                });
            });
        }
        
        // Cancel button
        this.cancelBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to cancel? All changes will be lost.')) {
                this.modal.style.display = 'none';
                this.verificationData = [];
                this.allFolderData = [];
                this.searchInput.value = '';
                
                // Re-enable run button
                const runButton = document.getElementById('runButton');
                if (runButton) runButton.disabled = false;
            }
        });
        
        // Confirm button
        this.confirmBtn.addEventListener('click', () => {
            console.log('Verification Modal: Confirming data');
            
            // Collect all edited counts
            const rows = this.modalBody.querySelectorAll('.verification-row');
            rows.forEach(row => {
                const folderIdx = parseInt(row.dataset.folderIdx);
                const personIdx = parseInt(row.dataset.personIdx);
                const rowIdx = parseInt(row.dataset.rowIdx);
                
                const countInput = row.querySelector('.verification-count-input');
                const newCount = parseInt(countInput.value) || 0;
                
                this.allFolderData[folderIdx].persons[personIdx].rows[rowIdx].extractedCount = newCount;
            });
            
            // Send verified data back to background
            chrome.runtime.sendMessage({
                action: 'verificationConfirmed',
                data: this.allFolderData,
                weekInfo: this.currentWeekInfo
            }, (response) => {
                // Check for runtime errors first
                if (chrome.runtime.lastError) {
                    console.error('Verification Modal: sendMessage error:', chrome.runtime.lastError.message);
                    alert(`Error saving data: ${chrome.runtime.lastError.message}. Please try again.`);
                    return;
                }
                
                console.log('Verification Modal: Confirmation response', response);
                
                if (response && response.status === 'success') {
                    this.modal.style.display = 'none';
                    this.verificationData = [];
                    this.allFolderData = [];
                    this.searchInput.value = '';
                    
                    // Reset filter state
                    this.showOnlyAttention = false;
                    const filterBtn = document.getElementById('filterAttentionBtn');
                    if (filterBtn) {
                        filterBtn.classList.remove('active');
                        filterBtn.textContent = '⚠ Show Flagged';
                    }
                    
                    // Re-enable run button
                    const runButton = document.getElementById('runButton');
                    if (runButton) runButton.disabled = false;
                    
                    // Show success message
                    const logOutput = document.getElementById('logOutput');
                    if (logOutput) {
                        logOutput.textContent = '✅ Data verified and saved successfully!';
                        logOutput.style.color = '#003366';
                        logOutput.style.borderColor = '#003366';
                        logOutput.style.backgroundColor = '#f1f1f1';
                    }
                } else {
                    const errorMsg = response?.error || 'Unknown error';
                    console.error('Verification Modal: Save failed:', errorMsg);
                    alert(`Error saving verified data: ${errorMsg}. Please try again.`);
                }
            });
        });
    }
}

// Create singleton instance
export const verificationModal = new VerificationModal();
