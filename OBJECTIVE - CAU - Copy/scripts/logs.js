// scripts/logs.js - (v2.5 - Use waitForStorageManager instead of import)
'use strict';

import { StorageManager } from './storage-manager.js';
import { DataBackupUtility, disableAutomaticBackups } from './data-backup-utility.js';
import {
  STORAGE_KEY_LOGS,
  ERROR_SEVERITY,
  STORAGE_KEY_ERRORS,
  ACTION_SET_DAILY_FETCH,
  ACTION_GET_DAILY_FETCH_STATUS,
  ACTION_TRIGGER_DAILY_FETCH,
  STORAGE_KEY_BACKUPS_DISABLED
} from './constants.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Wait until storage-init-helper.js has initialized StorageManager on window
    await window.waitForStorageManager();

    const logsContainer          = document.getElementById('logs-container');
    const refreshButton          = document.getElementById('refresh-logs');
    const clearButton            = document.getElementById('clear-logs');
    const logLevelFilter         = document.getElementById('log-level-filter');
    const backBtn                = document.getElementById('backBtn');

    // Data Management UI Elements
    const archiveDataBtn         = document.getElementById('archive-data-btn');
    const disableBackupsBtn      = document.getElementById('disable-backups-btn');
    const dataManagementStatus   = document.getElementById('data-management-status');
    const backupsList            = document.getElementById('backups-list');
    const storageUsageText       = document.getElementById('storage-usage-text');
    const storageUsageBar        = document.getElementById('storage-usage-bar');

    // Daily Fetch UI Elements
    const enableDailyFetchToggle = document.getElementById('enable-daily-fetch-toggle');
    const triggerFetchNowBtn     = document.getElementById('trigger-fetch-now-btn');
    const dailyFetchStatus       = document.getElementById('daily-fetch-status');
    const fetchTimeContainer     = document.getElementById('fetch-time-container');
    const dailyFetchTimeInput    = document.getElementById('daily-fetch-time');

    if (!logsContainer) {
        console.error('Critical element missing: logs-container');
        return;
    }

    // Helpers for status messages
    const updateStatus = (msg, isError = false) => {
        if (!dataManagementStatus) return;
        dataManagementStatus.textContent = msg;
        dataManagementStatus.className   = `status-message ${isError ? 'error' : 'success'}`;
        clearTimeout(window.statusTimeout);
        window.statusTimeout = setTimeout(() => {
            dataManagementStatus.textContent = '';
            dataManagementStatus.className   = 'status-message';
        }, 6000);
    };
    const updateFetchStatus = (msg, isError = false) => {
        if (!dailyFetchStatus) return;
        dailyFetchStatus.textContent = msg;
        dailyFetchStatus.className   = `status-message ${isError ? 'error' : 'success'}`;
    };

    // Confirmation modal
    const showConfirmationModal = (message, onConfirm) => {
        const existing = document.getElementById('confirmation-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'confirmation-modal';
        Object.assign(modal.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex',
            justifyContent: 'center', alignItems: 'center', zIndex: '1000', backdropFilter: 'blur(3px)'
        });

        const content = document.createElement('div');
        Object.assign(content.style, {
            backgroundColor: 'var(--card-bg)', color: 'var(--text)',
            padding: '25px', borderRadius: '8px', textAlign: 'center',
            boxShadow: '0 5px 15px rgba(0,0,0,0.3)', width: '90%', maxWidth: '400px'
        });

        const p = document.createElement('p');
        p.textContent = message;
        p.style.marginBottom = '20px';
        p.style.fontSize     = '1.1em';

        const btnContainer = document.createElement('div');
        const confirmBtn   = document.createElement('button');
        confirmBtn.textContent = 'Confirm';
        confirmBtn.className   = 'btn danger';
        confirmBtn.style.marginRight = '10px';
        const cancelBtn    = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className   = 'btn';

        btnContainer.append(confirmBtn, cancelBtn);
        content.append(p, btnContainer);
        modal.appendChild(content);
        document.body.appendChild(modal);

        const close = () => modal.remove();
        confirmBtn.onclick = () => { close(); onConfirm(); };
        cancelBtn.onclick  = close;
    };

    // Escape HTML
    const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    // Log filtering & rendering (Restored to original format)
    const filterLogs = (logs, level) =>
        level === 'all' ? logs : logs.filter(log => (log.severity || 'info') === level);

    const renderLogs = (logs) => {
        logsContainer.innerHTML = '';
        if (!logs.length) {
            logsContainer.innerHTML = '<p class="log-info" style="text-align:center;padding:1rem;">No logs found.</p>';
            return;
        }
        const filtered = filterLogs(logs, logLevelFilter?.value || 'all');
        filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        filtered.forEach(log => {
            const entry = document.createElement('div');
            entry.className = `log-entry log-${log.severity || 'info'}`;
            const msgHtml = log.message
                ? escapeHtml(log.message)
                : `<pre class="log-full">${escapeHtml(JSON.stringify(log, null, 2))}</pre>`;
            entry.innerHTML = `
                <div class="log-header">
                    <span class="log-timestamp">${new Date(log.timestamp).toLocaleString()}</span>
                    <span class="log-severity">${(log.severity || 'info').toUpperCase()}</span>
                </div>
                <div class="log-message">${msgHtml}</div>
            `;
            logsContainer.appendChild(entry);
        });
    };

    // Load logs
    const loadLogs = async () => {
        try {
            const exec = await StorageManager.retrieveAndDecompress(STORAGE_KEY_LOGS) || [];
            const errs = await StorageManager.retrieveAndDecompress(STORAGE_KEY_ERRORS) || [];
            const validExec = Array.isArray(exec) ? exec : [];
            const validErrs = Array.isArray(errs) ? errs : [];

            const all = [
                ...validExec.map(log => ({ ...log, severity: log.severity || ERROR_SEVERITY.INFO })),
                ...validErrs
            ];
            renderLogs(all);
        } catch (err) {
            console.error('Error loading logs:', err);
            logsContainer.innerHTML = '<p class="log-error" style="text-align:center;padding:1rem;">Failed to load logs. See console.</p>';
        }
    };

    // Clear logs
    const clearLogs = () => {
        showConfirmationModal('Are you sure you want to delete all execution and error logs?', async () => {
            try {
                await StorageManager.clearStorage([STORAGE_KEY_LOGS, STORAGE_KEY_ERRORS]);
                updateStatus('All logs cleared successfully.');
                await loadLogs();
            } catch (err) {
                updateStatus('Failed to clear logs.', true);
            }
        });
    };

    // Show backups
    const loadAndDisplayBackups = async () => {
        if (!backupsList) return;
        try {
            backupsList.innerHTML = '<li>Loading backups...</li>';
            const backups = await DataBackupUtility.getBackups();
            backupsList.innerHTML = backups.length
                ? ''
                : '<li>No backups found.</li>';
            backups.forEach(backup => {
                const li = document.createElement('li');
                li.className = 'backup-item';
                li.innerHTML = `
                  <span class="backup-name">${escapeHtml(backup.name)} ${backup.automatic ? '(Auto)' : ''}</span>
                  <span class="backup-date">${new Date(backup.timestamp).toLocaleString()}</span>
                `;
                const delBtn = document.createElement('button');
                delBtn.textContent = 'Delete';
                delBtn.className = 'btn danger';
                delBtn.style.width = 'auto'; // Override for this specific button
                delBtn.onclick = () => {
                    showConfirmationModal(`Delete backup "${backup.name}"? This cannot be undone.`, async () => {
                        const result = await DataBackupUtility.deleteBackup(backup.id);
                        updateStatus(result.message || result.error, !result.success);
                        if (result.success) {
                            loadAndDisplayBackups();
                            checkStorage();
                        }
                    });
                };
                li.appendChild(delBtn);
                backupsList.appendChild(li);
            });
        } catch (err) {
            updateStatus('Failed to load backup list.', true);
        }
    };
    
    // Check Automatic Task Status
    const checkAutomaticTaskStatus = async () => {
        if (!disableBackupsBtn) return;
        try {
            const result = await chrome.storage.local.get(STORAGE_KEY_BACKUPS_DISABLED);
            if (result[STORAGE_KEY_BACKUPS_DISABLED]) {
                disableBackupsBtn.disabled = true;
                disableBackupsBtn.textContent = 'Automatic Tasks Disabled';
            }
        } catch (e) {
            console.error("Failed to check backup status:", e);
            updateStatus("Could not verify automatic backup status.", true);
        }
    };


    // Storage usage check
    const checkStorage = async () => {
        if (!storageUsageText || !storageUsageBar) return;
        try {
            let usageBytes, quotaBytes;
            if (navigator.storage?.estimate) {
                const estimate = await navigator.storage.estimate();
                usageBytes = estimate.usage || 0;
                quotaBytes = estimate.quota || null;
            } else {
                usageBytes  = await chrome.storage.local.getBytesInUse();
                quotaBytes  = null;
            }
            const usageMB = (usageBytes / 1024 / 1024).toFixed(2);
            if (quotaBytes) {
                const quotaMB = (quotaBytes / 1024 / 1024).toFixed(2);
                const percent = (usageBytes / quotaBytes) * 100;
                storageUsageText.textContent =
                  `Using ${usageMB} MB of ${quotaMB} MB (${percent.toFixed(1)}%)`;
                storageUsageBar.style.display = '';
                storageUsageBar.style.width   = `${percent}%`;
                storageUsageBar.style.backgroundColor =
                  percent > 90   ? 'var(--danger)' :
                  percent > 75   ? 'var(--warning)' :
                                   'var(--success)';
            } else {
                storageUsageText.textContent = `Using ${usageMB} MB`;
                storageUsageBar.style.display = 'none';
            }
        } catch (err) {
            console.warn('Storage check failed:', err);
            storageUsageText.textContent   = 'Storage usage unavailable';
            storageUsageBar.style.display = 'none';
        }
    };

    // Daily fetch status
    const getDailyFetchStatus = () => {
        if (!chrome.runtime?.sendMessage) {
            updateFetchStatus('Cannot communicate with extension background.', true);
            enableDailyFetchToggle.disabled = true;
            triggerFetchNowBtn.disabled     = true;
            return;
        }
        chrome.runtime.sendMessage({ action: ACTION_GET_DAILY_FETCH_STATUS }, response => {
            if (chrome.runtime.lastError || response.error) {
                const msg = chrome.runtime.lastError?.message || response.error;
                console.error('Daily fetch status error:', msg);
                updateFetchStatus(`Error: ${msg}`, true);
                return;
            }
            const isEnabled = response.isEnabled;
            enableDailyFetchToggle.checked  = isEnabled;
            fetchTimeContainer.style.display = isEnabled ? 'flex' : 'none';

            let text = `Daily fetch is ${isEnabled ? 'ENABLED' : 'DISABLED'}.`;
            if (isEnabled) {
                                if (response.nextFetchTime) {
                    text += ` Next run: ${new Date(response.nextFetchTime).toLocaleString()}`;
                }
            }
            updateFetchStatus(text, false);
        });
    };

    // Enable/disable daily fetch
    const setDailyFetch = (isEnabled, time = null) => {
        if (!chrome.runtime?.sendMessage) {
            updateFetchStatus('Cannot communicate with extension background.', true);
            return;
        }
        const payload = { isEnabled };
        if (isEnabled) {
            if (!time) {
                updateFetchStatus('Please select a time before enabling.', true);
                return;
            }
            payload.time = time;
        }
        chrome.runtime.sendMessage({ action: ACTION_SET_DAILY_FETCH, payload }, response => {
            if (chrome.runtime.lastError || response.error) {
                const msg = chrome.runtime.lastError?.message || response.error;
                console.error('Set daily fetch error:', msg);
                updateStatus(`Error: ${msg}`, true);
                getDailyFetchStatus();
                return;
            }
            updateStatus(response.message || 'Daily fetch saved.', false);
            getDailyFetchStatus();
        });
    };

    // Manual fetch trigger
    const triggerFetchNow = () => {
        showConfirmationModal('Trigger manual data fetch now?', () => {
            if (!chrome.runtime?.sendMessage) {
                updateStatus('Cannot communicate with extension background.', true);
                return;
            }
            updateStatus('Triggering manual fetch...');
            chrome.runtime.sendMessage({ action: ACTION_TRIGGER_DAILY_FETCH }, response => {
                if (chrome.runtime.lastError || response.error) {
                    const msg = chrome.runtime.lastError?.message || response.error;
                    console.error('Trigger fetch error:', msg);
                    updateStatus(`Error: ${msg}`, true);
                    return;
                }
                updateStatus(response.message || 'Fetch started.', false);
            });
        });
    };

    // Event listeners
    refreshButton?.addEventListener('click', () => {
        loadLogs();
        loadAndDisplayBackups();
        checkStorage();
        getDailyFetchStatus();
        checkAutomaticTaskStatus();
        updateStatus('Refreshed all data.', false);
    });
    clearButton?.addEventListener('click', clearLogs);
    logLevelFilter?.addEventListener('change', loadLogs);
    backBtn?.addEventListener('click', () => { window.location.href = 'main.html'; });

    archiveDataBtn?.addEventListener('click', () => {
        showConfirmationModal('Archive data older than 12 months? This creates a safety backup first.', async () => {
            updateStatus('Archiving process started...');
            const result = await DataBackupUtility.archiveOldData(12);
            updateStatus(result.message || result.error, !result.success);
            if (result.success) {
                checkStorage();
                loadAndDisplayBackups();
            }
        });
    });

    disableBackupsBtn?.addEventListener('click', () => {
        showConfirmationModal('This will disable ALL automatic tasks, including daily backups, weekly maintenance, and monthly archiving. This action cannot be undone from the UI. Are you sure?', async () => {
            try {
                const result = await disableAutomaticBackups();
                updateStatus(result.message, !result.success);
                if (result.success) {
                    checkAutomaticTaskStatus();
                }
            } catch (err) {
                updateStatus(`Failed to disable automatic tasks: ${err.message}`, true);
            }
        });
    });

    enableDailyFetchToggle?.addEventListener('change', event => {
        const enabled = event.target.checked;
        fetchTimeContainer.style.display = enabled ? 'flex' : 'none';
        if (!enabled) setDailyFetch(false);
        else if (dailyFetchTimeInput.value) setDailyFetch(true, dailyFetchTimeInput.value);
        else updateFetchStatus('Enabled. Please select a time.', false);
    });

    dailyFetchTimeInput?.addEventListener('change', () => {
        if (enableDailyFetchToggle.checked && dailyFetchTimeInput.value) {
            setDailyFetch(true, dailyFetchTimeInput.value);
        }
    });

    triggerFetchNowBtn?.addEventListener('click', triggerFetchNow);

    // Initial load
    loadLogs();
    loadAndDisplayBackups();
    checkStorage();
    getDailyFetchStatus();
    checkAutomaticTaskStatus();
});