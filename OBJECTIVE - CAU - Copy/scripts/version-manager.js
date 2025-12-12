// version-manager.js - Centralized version control and update management
'use strict';

import { ErrorManager, SEVERITY, CATEGORY } from './enhanced-error-manager.js';

// Extension version information
export const VERSION = {
  // Main extension version
  current: '1.7.0',
  
  // Component versions - update these when making changes to specific components
  components: {
    urlProcessor: '1.4.0',
    storageManager: '1.7.0',
    errorManager: '1.3.0',
    reportGenerator: '1.12.1',
    objectiveImporter: '3.1.0',
    batchProcessor: '1.0.0',
    holidayService: '1.8.0',
    configValidator: '1.0.0',
    dataVisualization: '1.0.0',
  },
  
  // Build information
  build: {
    timestamp: new Date().toISOString(),
    environment: 'production',
    branch: 'main'
  },
  
  // Update history (most recent first)
  history: [
    {
      version: '1.7.0',
      date: '2025-04-26',
      summary: 'Major update with improved data handling, batch processing, and visualization',
      changes: [
        'Added batch processing for better performance',
        'Enhanced error handling and reporting',
        'Improved storage management with data validation',
        'Added data visualization components',
        'Fixed URL importing in Objective importer'
      ]
    },
    {
      version: '1.6.0',
      date: '2025-03-15',
      summary: 'Added Interstate folder normalization',
      changes: [
        'Fixed Interstate Requests folder name inconsistencies',
        'Improved error handling in background script',
        'Updated Objective importer to version 2.26'
      ]
    },
    {
      version: '1.5.0',
      date: '2025-02-10',
      summary: 'Enhanced reporting capabilities',
      changes: [
        'Added team report generation',
        'Improved CSV export formatting',
        'Fixed date handling in reports'
      ]
    }
  ]
};

/**
 * Storage key for version information
 * @private
 */
const STORAGE_KEY_VERSION = 'ecmExtensionVersion';

/**
 * Browser API access with fallback
 * @private
 */
const browserAPI = (typeof chrome !== 'undefined') ? chrome : (typeof browser !== 'undefined' ? browser : null);

/**
 * Version Manager for tracking and managing extension versions
 */
export const VersionManager = {
  /**
   * Initialize the version manager
   * @returns {Promise<Object>} Version information
   */
  async initialize() {
    try {
      // Check for stored version
      const storedVersion = await this.getStoredVersion();
      
      // Compare versions
      if (!storedVersion || storedVersion.current !== VERSION.current) {
        // Version has changed, update stored version and trigger event
        await this.updateStoredVersion();
        
        // Log update
        console.log(`VersionManager: Updated from ${storedVersion?.current || 'none'} to ${VERSION.current}`);
        
        // Return update information
        return {
          updated: true,
          previous: storedVersion?.current || null,
          current: VERSION.current,
          changes: VERSION.history[0]?.changes || []
        };
      }
      
      return {
        updated: false,
        current: VERSION.current
      };
    } catch (error) {
      ErrorManager.logError(
        'Version manager initialization failed',
        { error: error.message },
        SEVERITY.WARNING,
        CATEGORY.SYSTEM
      );
      
      // Return current version on error
      return {
        updated: false,
        error: error.message,
        current: VERSION.current
      };
    }
  },
  
  /**
   * Get the stored version information
   * @returns {Promise<Object|null>} Stored version information
   */
  async getStoredVersion() {
    if (!browserAPI || !browserAPI.storage || !browserAPI.storage.local) {
      throw new Error('Browser storage API not available');
    }
    
    return new Promise((resolve) => {
      browserAPI.storage.local.get(STORAGE_KEY_VERSION, (result) => {
        if (browserAPI.runtime?.lastError) {
          console.warn(`VersionManager: Error getting stored version: ${browserAPI.runtime.lastError.message}`);
          resolve(null);
          return;
        }
        
        resolve(result[STORAGE_KEY_VERSION] || null);
      });
    });
  },
  
  /**
   * Update the stored version information
   * @returns {Promise<boolean>} Success status
   */
  async updateStoredVersion() {
    if (!browserAPI || !browserAPI.storage || !browserAPI.storage.local) {
      throw new Error('Browser storage API not available');
    }
    
    return new Promise((resolve) => {
      browserAPI.storage.local.set({ [STORAGE_KEY_VERSION]: VERSION }, () => {
        if (browserAPI.runtime?.lastError) {
          console.error(`VersionManager: Error updating stored version: ${browserAPI.runtime.lastError.message}`);
          resolve(false);
          return;
        }
        
        resolve(true);
      });
    });
  },
  
  /**
   * Check if a component needs updating
   * @param {string} componentName - Component name
   * @param {string} version - Version to check
   * @returns {boolean} Whether the component needs updating
   */
  isComponentOutdated(componentName, version) {
    const currentVersion = VERSION.components[componentName];
    if (!currentVersion) {
      return false; // Unknown component
    }
    
    return this.compareVersions(version, currentVersion) < 0;
  },
  
  /**
   * Compare two semantic version strings
   * @param {string} version1 - First version
   * @param {string} version2 - Second version
   * @returns {number} -1 if v1 < v2, 0 if v1 = v2, 1 if v1 > v2
   */
  compareVersions(version1, version2) {
    const v1parts = version1.split('.').map(p => parseInt(p, 10));
    const v2parts = version2.split('.').map(p => parseInt(p, 10));
    
    for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
      const v1part = i < v1parts.length ? v1parts[i] : 0;
      const v2part = i < v2parts.length ? v2parts[i] : 0;
      
      if (v1part < v2part) {
        return -1;
      }
      
      if (v1part > v2part) {
        return 1;
      }
    }
    
    return 0;
  },
  
  /**
   * Get version update notes
   * @param {string} fromVersion - Starting version (optional)
   * @returns {Array<Object>} Update notes
   */
  getUpdateNotes(fromVersion = null) {
    if (!fromVersion) {
      // Return all history if no starting version
      return VERSION.history;
    }
    
    // Find updates since fromVersion
    const updates = [];
    for (const update of VERSION.history) {
      if (this.compareVersions(update.version, fromVersion) > 0) {
        updates.push(update);
      } else {
        // History is in descending order, so we can stop once we reach the starting version
        break;
      }
    }
    
    return updates;
  },
  
  /**
   * Check if the extension needs a refresh due to component updates
   * @returns {boolean} Whether a refresh is needed
   */
  needsRefresh() {
    try {
      // This function would check if any critical components have changed
      // that would require a page refresh to take effect
      const storedComponent = document.querySelector('meta[name="extension-components"]');
      
      if (!storedComponent) {
        return true; // No stored components, refresh to be safe
      }
      
      const componentVersions = JSON.parse(storedComponent.getAttribute('content') || '{}');
      
      // Check critical components
      const criticalComponents = ['urlProcessor', 'storageManager', 'errorManager'];
      
      for (const component of criticalComponents) {
        if (this.isComponentOutdated(component, componentVersions[component] || '0.0.0')) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error checking if refresh is needed:', error);
      return true; // Refresh to be safe on error
    }
  },
  
  /**
   * Update the page with current component versions
   */
  updatePageComponentVersions() {
    try {
      // Remove existing meta tag if present
      const existingMeta = document.querySelector('meta[name="extension-components"]');
      if (existingMeta) {
        existingMeta.remove();
      }
      
      // Create new meta tag with current component versions
      const meta = document.createElement('meta');
      meta.name = 'extension-components';
      meta.content = JSON.stringify(VERSION.components);
      document.head.appendChild(meta);
    } catch (error) {
      console.error('Error updating page component versions:', error);
    }
  }
};

/**
 * Create a version information component
 * @returns {string} HTML string for version info
 */
export function createVersionInfoHtml() {
  return `
    <div class="version-info" style="font-size: 12px; color: #666; margin-top: 8px; text-align: center;">
      Extension Version ${VERSION.current}
      <span title="${Object.entries(VERSION.components).map(([k, v]) => `${k}: ${v}`).join('\n')}">
        (${Object.keys(VERSION.components).length} components)
      </span>
      <div style="font-size: 10px; margin-top: 4px;">
        Build: ${VERSION.build.timestamp.split('T')[0]}
      </div>
    </div>
  `;
}

export default VersionManager;