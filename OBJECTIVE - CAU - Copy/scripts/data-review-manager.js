// scripts/data-review-manager.js
// Data Review Manager - Shows popup after script execution for data manipulation
'use strict';

import { StorageManager } from './storage-manager.js';
import { getDisplayNameForKey } from './utils.js';
import { STORAGE_KEY_DATA } from './constants.js';

class DataReviewManager {
    constructor() {
        this.pendingData = null;
        this.modal = null;
        this.excludedFolders = new Set();
        this.foldersToDelete = new Set(); // Track folders marked for deletion
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        // Load excluded folders from settings
        const browserAPI = typeof chrome !== 'undefined' ? chrome : null;
        if (browserAPI?.storage) {
            const result = await browserAPI.storage.local.get('dataReviewExcludedFolders');
            if (result.dataReviewExcludedFolders && Array.isArray(result.dataReviewExcludedFolders)) {
                this.excludedFolders = new Set(result.dataReviewExcludedFolders);
            }
        }
        
        this.createModal();
        this.initialized = true;
        console.log('DataReviewManager: Initialized');
    }

    createModal() {
        // Create modal HTML
        const modal = document.createElement('div');
        modal.id = 'dataReviewModal';
        modal.className = 'data-review-modal';
        modal.style.display = 'none';
        
        modal.innerHTML = `
            <div class="data-review-content">
                <div class="data-review-header">
                    <h2>Review Collected Data</h2>
                    <button class="data-review-close" aria-label="Close">×</button>
                </div>
                <div class="data-review-body">
                    <div class="data-review-summary"></div>
                    <div class="data-review-folders"></div>
                </div>
                <div class="data-review-footer">
                    <button class="btn btn-secondary" id="dataReviewCloseBtn">Close</button>
                    <button class="btn btn-primary" id="dataReviewSaveBtn" disabled>Save Changes</button>
                    <button class="btn btn-danger" id="dataReviewDeleteBtn" disabled>Delete Excluded Data</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        this.modal = modal;
        
        // Add event listeners
        modal.querySelector('.data-review-close').addEventListener('click', () => this.close());
        modal.querySelector('#dataReviewCloseBtn').addEventListener('click', () => this.close());
        modal.querySelector('#dataReviewSaveBtn').addEventListener('click', () => this.saveChanges());
        modal.querySelector('#dataReviewDeleteBtn').addEventListener('click', () => this.deleteExcludedData());
        
        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.close();
        });
        
        // Add styles
        this.addStyles();
    }

    addStyles() {
        if (document.getElementById('data-review-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'data-review-styles';
        style.textContent = `
            .data-review-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            }
            
            .data-review-content {
                background: var(--bg-primary, #fff);
                color: var(--text-primary, #333);
                border-radius: 8px;
                width: 90%;
                max-width: 900px;
                max-height: 85vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            }
            
            .data-review-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px 25px;
                border-bottom: 1px solid var(--border-color, #ddd);
            }
            
            .data-review-header h2 {
                margin: 0;
                font-size: 1.5em;
                color: var(--primary-color, #003366);
            }
            
            .data-review-close {
                background: none;
                border: none;
                font-size: 2em;
                cursor: pointer;
                color: var(--text-secondary, #666);
                line-height: 0.8;
                padding: 0;
                width: 30px;
                height: 30px;
            }
            
            .data-review-close:hover {
                color: var(--danger, #cc0000);
            }
            
            .data-review-body {
                padding: 25px;
                overflow-y: auto;
                flex: 1;
            }
            
            .data-review-summary {
                background: var(--bg-secondary, #f8f9fa);
                padding: 15px;
                border-radius: 6px;
                margin-bottom: 20px;
            }
            
            .data-review-summary-item {
                display: flex;
                justify-content: space-between;
                padding: 5px 0;
            }
            
            .data-review-summary-label {
                font-weight: 600;
                color: var(--text-primary, #333);
            }
            
            .data-review-summary-value {
                color: var(--primary-color, #003366);
                font-weight: 500;
            }
            
            .data-review-folders {
                display: flex;
                flex-direction: column;
                gap: 20px;
            }
            
            .data-review-folder-group {
                border: 1px solid var(--border-color, #ddd);
                border-radius: 6px;
                overflow: hidden;
                background: var(--bg-primary, #fff);
            }
            
            .data-review-folder-group.marked-for-deletion {
                border-color: var(--danger, #dc3545);
                background: rgba(220, 53, 69, 0.05);
            }
            
            .verification-folder-header {
                background: var(--primary-color, #003366);
                color: white;
                padding: 12px 20px;
                font-weight: 600;
                font-size: 16px;
            }
            
            .verification-folder-stats {
                background: var(--bg-secondary, #f0f0f0);
                padding: 8px 20px;
                font-size: 13px;
                color: var(--text-secondary, #666);
                border-bottom: 1px solid var(--border-color, #ddd);
            }
            
            .data-review-person-list {
                display: flex;
                flex-direction: column;
            }
            
            .verification-person-group {
                border-bottom: 1px solid var(--border-color, #e0e0e0);
            }
            
            .verification-person-group:last-child {
                border-bottom: none;
            }
            
            .verification-person-header {
                background: var(--bg-secondary, #f8f9fa);
                padding: 10px 24px 10px 40px;
                font-weight: 500;
                font-size: 14px;
                color: var(--text-primary, #333);
                border-bottom: 1px solid var(--border-color, #ddd);
            }
            
            .verification-header-row {
                display: grid;
                grid-template-columns: 140px 200px 1fr 120px;
                gap: 12px;
                padding: 8px 24px 8px 56px;
                background: var(--bg-hover, #e8e8e8);
                border-bottom: 1px solid var(--border-color, #ddd);
                font-size: 12px;
                font-weight: 600;
                color: var(--text-secondary, #666);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .verification-row {
                display: grid;
                grid-template-columns: 140px 200px 1fr 120px;
                gap: 12px;
                padding: 10px 24px 10px 56px;
                align-items: center;
                border-bottom: 1px solid var(--border-color, #eee);
                transition: background 0.15s;
            }
            
            .verification-row:hover {
                background: var(--bg-secondary, #f8f9fa);
            }
            
            .verification-row.modified {
                background: #fff3cd;
            }
            
            .verification-row.modified:hover {
                background: #ffe69c;
            }
            
            .verification-date {
                font-size: 13px;
                color: var(--text-secondary, #666);
                font-weight: 500;
            }
            
            .verification-name {
                font-size: 13px;
                color: var(--text-primary, #333);
                font-weight: 500;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            
            .verification-count-text {
                font-size: 13px;
                color: var(--text-primary, #333);
                word-wrap: break-word;
                overflow-wrap: break-word;
                white-space: normal;
                line-height: 1.4;
            }
            
            .verification-count-input {
                width: 80px;
                padding: 6px 10px;
                border: 2px solid #28a745;
                border-radius: 4px;
                text-align: center;
                font-size: 14px;
                font-weight: 600;
                background: var(--bg-primary, #fff);
                color: var(--text-primary, #333);
            }
            
            .verification-count-input:focus {
                outline: none;
                border-color: var(--primary-color, #003366);
                box-shadow: 0 0 0 3px rgba(0, 51, 102, 0.1);
            }
            
            .verification-row.modified .verification-count-input {
                border-color: #ffc107;
            }
            
            /* Dark mode support */
            html.dark-mode .data-review-modal {
                background: rgba(0, 0, 0, 0.85);
            }
            
            html.dark-mode .data-review-content {
                background: #1e1e1e;
                color: #e0e0e0;
            }
            
            html.dark-mode .data-review-header h2 {
                color: #5aa9e6;
            }
            
            html.dark-mode .data-review-summary {
                background: #2d2d2d;
            }
            
            html.dark-mode .data-review-summary-label,
            html.dark-mode .data-review-summary-value {
                color: #e0e0e0;
            }
            
            html.dark-mode .data-review-folder-group {
                background: #252525;
                border-color: #444;
            }
            
            html.dark-mode .verification-folder-header {
                background: #1a4d7a;
                color: #fff;
            }
            
            html.dark-mode .verification-folder-stats {
                background: #2d2d2d;
                color: #aaa;
                border-bottom-color: #444;
            }
            
            html.dark-mode .verification-person-header {
                background: #2d2d2d;
                color: #e0e0e0;
                border-bottom-color: #444;
            }
            
            html.dark-mode .verification-header-row {
                background: #333;
                color: #aaa;
                border-bottom-color: #444;
            }
            
            html.dark-mode .verification-row {
                border-bottom-color: #333;
            }
            
            html.dark-mode .verification-row:hover {
                background: #2d2d2d;
            }
            
            html.dark-mode .verification-row.modified {
                background: rgba(255, 193, 7, 0.15);
            }
            
            html.dark-mode .verification-row.modified:hover {
                background: rgba(255, 193, 7, 0.25);
            }
            
            html.dark-mode .verification-date,
            html.dark-mode .verification-name {
                color: #e0e0e0;
            }
            
            html.dark-mode .verification-count-input {
                background: #1e1e1e;
                color: #e0e0e0;
                border-color: #28a745;
            }
            
            html.dark-mode .verification-count-input:focus {
                border-color: #5aa9e6;
                box-shadow: 0 0 0 3px rgba(90, 169, 230, 0.2);
            }
            
            html.dark-mode .verification-row.modified .verification-count-input {
                border-color: #ffc107;
            }
            
            html.dark-mode .data-review-footer {
                background: #2d2d2d;
                border-top-color: #444;
            }
            
            /* System dark mode support */
            @media (prefers-color-scheme: dark) {
                .data-review-modal {
                    background: rgba(0, 0, 0, 0.85);
                }
                
                .data-review-content {
                    background: #1e1e1e;
                    color: #e0e0e0;
                }
                
                .verification-folder-header {
                    background: #1a4d7a;
                }
                
                .verification-row.modified {
                    background: rgba(255, 193, 7, 0.15);
                }
                
                .verification-row.modified:hover {
                    background: rgba(255, 193, 7, 0.25);
                }
            }
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background: var(--bg-secondary, #f8f9fa);
                border-radius: 4px;
            }
            
            .data-review-person-name {
                font-weight: 500;
                color: var(--text-primary, #333);
            }
            
            .data-review-person-count {
                color: var(--primary-color, #003366);
                font-weight: 600;
            }
            
            .data-review-footer {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                padding: 20px 25px;
                border-top: 1px solid var(--border-color, #ddd);
            }
            
            .data-review-folder-actions {
                display: flex;
                gap: 5px;
            }
            
            .data-review-folder-action-btn {
                padding: 4px 10px;
                border: 1px solid var(--border-color, #ddd);
                background: var(--bg-primary, #fff);
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.85em;
            }
            
            .data-review-folder-action-btn:hover {
                background: var(--bg-hover, #e0e0e0);
            }
            
            .data-review-folder-action-btn.danger:hover {
                background: var(--danger-light, #fdd);
                border-color: var(--danger, #cc0000);
                color: var(--danger, #cc0000);
            }
        `;
        
        document.head.appendChild(style);
    }

    async showReview() {
        await this.initialize();
        
        // Load data from storage
        try {
            const allData = await StorageManager.retrieveAndDecompress(STORAGE_KEY_DATA);
            
            if (!allData || !allData.persons || Object.keys(allData.persons).length === 0) {
                console.log('DataReviewManager: No data found in storage');
                return;
            }
            
            // Get excluded folders from settings
            const browserAPI = typeof chrome !== 'undefined' ? chrome : null;
            if (browserAPI?.storage) {
                const result = await browserAPI.storage.local.get('dataReviewSettings');
                if (result.dataReviewSettings && result.dataReviewSettings.excludedFolders) {
                    this.excludedFolders = new Set(result.dataReviewSettings.excludedFolders);
                }
            }
            
            // Transform data into folder-based collection
            this.pendingData = this.transformDataToFolderBased(allData.persons);
            
            this.renderReview();
            this.modal.style.display = 'flex';
        } catch (error) {
            console.error('DataReviewManager: Error loading data for review:', error);
            alert(`Error loading data: ${error.message}`);
        }
    }
    
    transformDataToFolderBased(personData) {
        // Transform from person -> year -> week -> folder -> dates
        // To folder -> person -> dates (aggregated)
        const folderBased = {};
        
        Object.entries(personData).forEach(([person, yearData]) => {
            Object.entries(yearData).forEach(([year, weekData]) => {
                Object.entries(weekData).forEach(([week, folderData]) => {
                    Object.entries(folderData).forEach(([folder, dates]) => {
                        if (!folderBased[folder]) {
                            folderBased[folder] = {};
                        }
                        if (!folderBased[folder][person]) {
                            folderBased[folder][person] = {};
                        }
                        // Merge dates
                        Object.assign(folderBased[folder][person], dates);
                    });
                });
            });
        });
        
        return folderBased;
    }

    renderReview() {
        const summaryDiv = this.modal.querySelector('.data-review-summary');
        const foldersDiv = this.modal.querySelector('.data-review-folders');
        
        // Calculate summary statistics
        let totalFolders = 0;
        let totalPeople = new Set();
        let totalEntries = 0;
        
        Object.keys(this.pendingData).forEach(folderName => {
            const folderData = this.pendingData[folderName];
            totalFolders++;
            
            Object.keys(folderData).forEach(person => {
                totalPeople.add(person);
                const personData = folderData[person];
                if (typeof personData === 'object') {
                    totalEntries += Object.values(personData).reduce((sum, count) => sum + (parseInt(count) || 0), 0);
                }
            });
        });
        
        // Render summary
        summaryDiv.innerHTML = `
            <div class="data-review-summary-item">
                <span class="data-review-summary-label">Folders Collected:</span>
                <span class="data-review-summary-value">${totalFolders}</span>
            </div>
            <div class="data-review-summary-item">
                <span class="data-review-summary-label">Unique People:</span>
                <span class="data-review-summary-value">${totalPeople.size}</span>
            </div>
            <div class="data-review-summary-item">
                <span class="data-review-summary-label">Total Entries:</span>
                <span class="data-review-summary-value">${totalEntries.toLocaleString()}</span>
            </div>
        `;
        
        // Render folder cards
        foldersDiv.innerHTML = '';
        
        const sortedFolders = Object.keys(this.pendingData).sort();
        sortedFolders.forEach(folderName => {
            if (this.excludedFolders.has(folderName)) {
                console.log(`DataReviewManager: Skipping excluded folder "${folderName}"`);
                return;
            }
            
            const folderData = this.pendingData[folderName];
            const displayName = getDisplayNameForKey(folderName);
            const folderCard = this.createFolderCard(folderName, displayName, folderData);
            foldersDiv.appendChild(folderCard);
        });
    }

    createFolderCard(folderKey, displayName, folderData) {
        const card = document.createElement('div');
        card.className = 'data-review-folder-group';
        card.dataset.folderKey = folderKey;
        
        // Calculate stats
        const peopleCount = Object.keys(folderData).length;
        let totalCount = 0;
        let totalRows = 0;
        
        Object.values(folderData).forEach(personData => {
            if (typeof personData === 'object') {
                totalRows += Object.keys(personData).length;
                totalCount += Object.values(personData).reduce((sum, count) => sum + (parseInt(count) || 0), 0);
            }
        });
        
        // Folder header
        const folderHeader = document.createElement('div');
        folderHeader.className = 'verification-folder-header';
        folderHeader.textContent = displayName;
        card.appendChild(folderHeader);
        
        // Folder stats
        const folderStats = document.createElement('div');
        folderStats.className = 'verification-folder-stats';
        folderStats.innerHTML = `Total Rows: ${totalRows} | Total Entries: ${totalCount.toLocaleString()}`;
        card.appendChild(folderStats);
        
        // Person list container
        const personListContainer = document.createElement('div');
        personListContainer.className = 'data-review-person-list';
        card.appendChild(personListContainer);
        
        // Render person list immediately
        this.renderPersonList(personListContainer, folderData, folderKey);
        
        return card;
    }

    renderPersonList(container, folderData, folderKey) {
        const sortedPeople = Object.keys(folderData).sort();
        let personIdx = 0;
        
        sortedPeople.forEach(person => {
            const personData = folderData[person];
            
            // Create person group
            const personGroup = document.createElement('div');
            personGroup.className = 'verification-person-group';
            
            // Person header
            const personHeader = document.createElement('div');
            personHeader.className = 'verification-person-header';
            personHeader.textContent = person;
            personGroup.appendChild(personHeader);
            
            // Column headers (show for first person only)
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
            
            // Create editable rows for each date entry
            if (typeof personData === 'object') {
                const sortedDates = Object.keys(personData).sort();
                
                sortedDates.forEach(date => {
                    const count = personData[date];
                    
                    const rowDiv = document.createElement('div');
                    rowDiv.className = 'verification-row';
                    
                    // Date display
                    const dateSpan = document.createElement('span');
                    dateSpan.className = 'verification-date';
                    dateSpan.textContent = date;
                    
                    // Person name display
                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'verification-name';
                    nameSpan.textContent = person;
                    
                    // Count Text display (raw text from file - placeholder for now)
                    const countTextSpan = document.createElement('span');
                    countTextSpan.className = 'verification-count-text';
                    countTextSpan.textContent = `Count: ${count}`; // Placeholder since we don't store raw text
                    
                    // Editable count input
                    const countInput = document.createElement('input');
                    countInput.type = 'number';
                    countInput.className = 'verification-count-input';
                    countInput.value = count;
                    countInput.min = '0';
                    countInput.max = '999';
                    countInput.dataset.original = count;
                    countInput.dataset.person = person;
                    countInput.dataset.date = date;
                    
                    // Mark modified entries
                    countInput.addEventListener('input', (e) => {
                        const newValue = parseInt(e.target.value) || 0;
                        const originalValue = parseInt(e.target.dataset.original) || 0;
                        
                        if (newValue !== originalValue) {
                            rowDiv.classList.add('modified');
                        } else {
                            rowDiv.classList.remove('modified');
                        }
                        
                        // Update folder stats
                        this.updateFolderStats(container.closest('.data-review-folder-group'));
                    });
                    
                    rowDiv.appendChild(dateSpan);
                    rowDiv.appendChild(nameSpan);
                    rowDiv.appendChild(countTextSpan);
                    rowDiv.appendChild(countInput);
                    personGroup.appendChild(rowDiv);
                });
            }
            
            container.appendChild(personGroup);
            personIdx++;
        });
    }
    
    updateFolderStats(folderCard) {
        if (!folderCard) return;
        
        const inputs = folderCard.querySelectorAll('.verification-count-input');
        let totalCount = 0;
        let totalRows = inputs.length;
        
        inputs.forEach(input => {
            totalCount += parseInt(input.value) || 0;
        });
        
        const statsDiv = folderCard.querySelector('.verification-folder-stats');
        if (statsDiv) {
            statsDiv.innerHTML = `Total Rows: ${totalRows} | Total Entries: ${totalCount.toLocaleString()}`;
        }
        
        // Update save button state
        this.updateSaveButtonState();
    }
    
    updateSaveButtonState() {
        const saveBtn = this.modal.querySelector('#dataReviewSaveBtn');
        const modifiedRows = this.modal.querySelectorAll('.verification-row.modified');
        
        if (modifiedRows.length > 0) {
            saveBtn.textContent = `Save ${modifiedRows.length} Change${modifiedRows.length > 1 ? 's' : ''}`;
            saveBtn.disabled = false;
        } else {
            saveBtn.textContent = 'Save Changes';
            saveBtn.disabled = true;
        }
    }

    excludeFolder(folderKey, cardElement) {
        const displayName = getDisplayNameForKey(folderKey);
        
        if (this.foldersToDelete.has(folderKey)) {
            // Un-mark for deletion
            this.foldersToDelete.delete(folderKey);
            cardElement.classList.remove('marked-for-deletion');
        } else {
            // Mark for deletion
            if (confirm(`Mark "${displayName}" for deletion? The data will be deleted when you click "Delete Excluded Data".`)) {
                this.foldersToDelete.add(folderKey);
                cardElement.classList.add('marked-for-deletion');
            }
        }
        
        // Update delete button state
        const deleteBtn = this.modal.querySelector('#dataReviewDeleteBtn');
        if (this.foldersToDelete.size > 0) {
            deleteBtn.textContent = `Delete ${this.foldersToDelete.size} Folder${this.foldersToDelete.size > 1 ? 's' : ''}`;
            deleteBtn.disabled = false;
        } else {
            deleteBtn.textContent = 'Delete Excluded Data';
            deleteBtn.disabled = true;
        }
    }

    async deleteExcludedData() {
        if (this.foldersToDelete.size === 0) {
            alert('No folders marked for deletion');
            return;
        }
        
        const count = this.foldersToDelete.size;
        const folderNames = Array.from(this.foldersToDelete).map(f => getDisplayNameForKey(f)).join(', ');
        
        if (!confirm(`Delete data from ${count} folder${count > 1 ? 's' : ''}?\n\n${folderNames}\n\nThis action cannot be undone.`)) {
            return;
        }
        
        const deleteBtn = this.modal.querySelector('#dataReviewDeleteBtn');
        const originalText = deleteBtn.textContent;
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting...';
        
        try {
            const storageData = await StorageManager.retrieveAndDecompress(STORAGE_KEY_DATA);
            const allData = storageData.persons || {};
            let deletedCount = 0;
            
            // Delete data for each marked folder
            for (const folderKey of this.foldersToDelete) {
                Object.keys(allData).forEach(person => {
                    const yearData = allData[person];
                    Object.keys(yearData).forEach(year => {
                        const weekData = yearData[year];
                        Object.keys(weekData).forEach(week => {
                            if (weekData[week][folderKey]) {
                                delete weekData[week][folderKey];
                                deletedCount++;
                            }
                        });
                    });
                });
            }
            
            // Save the updated data structure back
            await StorageManager.compressAndStore(STORAGE_KEY_DATA, { persons: allData, folders: storageData.folders || {} });
            
            console.log(`DataReviewManager: Deleted ${deletedCount} folder entries`);
            alert(`Successfully deleted data from ${count} folder${count > 1 ? 's' : ''}.`);
            
            // Trigger data refresh event
            const browserAPI = typeof chrome !== 'undefined' ? chrome : null;
            if (browserAPI?.runtime) {
                try {
                    await browserAPI.runtime.sendMessage({
                        action: 'dataUpdated',
                        source: 'dataReview',
                        deletedFolders: count
                    });
                } catch (e) {
                    console.warn('Could not send data updated message:', e);
                }
            }
            
            this.close();
        } catch (error) {
            console.error('DataReviewManager: Error deleting data:', error);
            alert(`Error deleting data: ${error.message}`);
            deleteBtn.disabled = false;
            deleteBtn.textContent = originalText;
        }
    }
    
    async saveChanges() {
        const modifiedRows = this.modal.querySelectorAll('.data-review-entry-row.modified');
        
        if (modifiedRows.length === 0) {
            alert('No changes to save');
            return;
        }
        
        if (!confirm(`Save ${modifiedRows.length} modified entr${modifiedRows.length > 1 ? 'ies' : 'y'}?`)) {
            return;
        }
        
        const saveBtn = this.modal.querySelector('#dataReviewSaveBtn');
        const originalText = saveBtn.textContent;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        
        try {
            const storageData = await StorageManager.retrieveAndDecompress(STORAGE_KEY_DATA);
            const allData = storageData.persons || {};
            let changesApplied = 0;
            
            // Collect all modified inputs
            const modifiedInputs = this.modal.querySelectorAll('.verification-row.modified .verification-count-input');
            
            modifiedInputs.forEach(input => {
                const person = input.dataset.person;
                const date = input.dataset.date;
                const newCount = parseInt(input.value) || 0;
                const folderKey = input.closest('.data-review-folder-group').dataset.folderKey;
                
                // Find and update the data in the nested structure
                // Structure: persons -> year -> week -> folder -> date -> count
                if (allData[person]) {
                    Object.keys(allData[person]).forEach(year => {
                        const yearData = allData[person][year];
                        Object.keys(yearData).forEach(week => {
                            const weekData = yearData[week];
                            if (weekData[folderKey] && weekData[folderKey][date] !== undefined) {
                                weekData[folderKey][date] = newCount;
                                changesApplied++;
                            }
                        });
                    });
                }
            });
            
            // Save the updated data structure back
            await StorageManager.compressAndStore(STORAGE_KEY_DATA, { persons: allData, folders: storageData.folders || {} });
            
            console.log(`DataReviewManager: Saved ${changesApplied} changes`);
            alert(`Successfully saved ${changesApplied} change${changesApplied > 1 ? 's' : ''}!`);
            
            // Update the 'original' values and clear modified state
            modifiedInputs.forEach(input => {
                input.dataset.original = input.value;
                input.closest('.verification-row').classList.remove('modified');
            });
            
            // Trigger data refresh event
            const browserAPI = typeof chrome !== 'undefined' ? chrome : null;
            if (browserAPI?.runtime) {
                try {
                    await browserAPI.runtime.sendMessage({
                        action: 'dataUpdated',
                        source: 'dataReview',
                        changesApplied: changesApplied
                    });
                } catch (e) {
                    console.warn('Could not send data updated message:', e);
                }
            }
            
            // Update button states
            this.updateSaveButtonState();
            
        } catch (error) {
            console.error('DataReviewManager: Error saving changes:', error);
            alert(`Error saving changes: ${error.message}`);
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    }

    close() {
        if (this.modal) {
            this.modal.style.display = 'none';
            this.pendingData = null;
            this.foldersToDelete.clear();
        }
    }

    async updateExcludedFolders(folders) {
        this.excludedFolders = new Set(folders);
        
        const browserAPI = typeof chrome !== 'undefined' ? chrome : null;
        if (browserAPI?.storage) {
            await browserAPI.storage.local.set({
                dataReviewExcludedFolders: Array.from(this.excludedFolders)
            });
        }
        
        console.log('DataReviewManager: Updated excluded folders:', Array.from(this.excludedFolders));
    }

    getExcludedFolders() {
        return Array.from(this.excludedFolders);
    }
}

// Create singleton instance
export const dataReviewManager = new DataReviewManager();
