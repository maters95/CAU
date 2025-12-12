// notification-system.js - User notification and messaging system (v1.1 - Array type check fix)
'use strict';

import { ErrorManager, SEVERITY, CATEGORY } from './enhanced-error-manager.js';

// Browser API access with fallback
const browserAPI = (typeof chrome !== 'undefined') ? chrome : (typeof browser !== 'undefined' ? browser : null);

// Notification types
export const NOTIFICATION_TYPE = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error'
};

// Notification storage key
const STORAGE_KEY_NOTIFICATIONS = 'ecmNotifications';

// Max number of stored notifications
const MAX_NOTIFICATIONS = 50;

/**
 * Notification system for user alerts and messages
 */
export const NotificationSystem = {
  /**
   * Show a browser notification
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {string} type - Notification type
   * @returns {Promise<string|null>} Notification ID or null on failure
   */
  async showNotification(title, message, type = NOTIFICATION_TYPE.INFO) {
    try {
      if (!browserAPI || !browserAPI.notifications) {
        console.warn('NotificationSystem: Browser notifications API not available');
        return null;
      }
      
      // Get appropriate icon based on type
      const iconPath = this._getIconForType(type);
      
      // Create notification options
      const options = {
        type: 'basic',
        title: title,
        message: message,
        iconUrl: iconPath,
        isClickable: true
      };
      
      // Create the notification
      return new Promise((resolve) => {
        browserAPI.notifications.create(options, (notificationId) => {
          if (browserAPI.runtime?.lastError) {
            console.error(`NotificationSystem: Error creating notification: ${browserAPI.runtime.lastError.message}`);
            resolve(null);
            return;
          }
          
          // Store the notification
          this._storeNotification(notificationId, title, message, type)
            .catch(error => console.error('Error storing notification:', error));
            
          resolve(notificationId);
        });
      });
    } catch (error) {
      ErrorManager.logError(
        'Failed to show browser notification',
        { title, message, type, error: error.message },
        SEVERITY.WARNING,
        CATEGORY.UI
      );
      
      return null;
    }
  },
  
  /**
   * Show an in-app notification
   * @param {string} message - Notification message
   * @param {string} type - Notification type
   * @param {number} duration - Duration in milliseconds (0 for permanent)
   * @returns {string} Notification ID
   */
  showInAppNotification(message, type = NOTIFICATION_TYPE.INFO, duration = 5000) {
    try {
      // Generate a unique ID
      const notificationId = 'in-app-' + Date.now();
      
      // Create notification element if container exists
      const container = document.getElementById('notification-container');
      if (container) {
        const notification = document.createElement('div');
        notification.id = notificationId;
        notification.className = `notification notification-${type}`;
        
        // Create close button
        const closeButton = document.createElement('button');
        closeButton.className = 'notification-close';
        closeButton.innerHTML = '&times;';
        closeButton.onclick = () => this.clearInAppNotification(notificationId);
        
        // Create message element
        const messageElement = document.createElement('div');
        messageElement.className = 'notification-message';
        messageElement.textContent = message;
        
        // Assemble notification
        notification.appendChild(closeButton);
        notification.appendChild(messageElement);
        
        // Add to container
        container.appendChild(notification);
        
        // Auto-dismiss after duration (if not permanent)
        if (duration > 0) {
          setTimeout(() => this.clearInAppNotification(notificationId), duration);
        }
        
        // Store the notification
        this._storeNotification(notificationId, 'In-App Notification', message, type)
          .catch(error => console.error('Error storing notification:', error));
      } else {
        console.warn('NotificationSystem: Notification container not found');
      }
      
      return notificationId;
    } catch (error) {
      ErrorManager.logError(
        'Failed to show in-app notification',
        { message, type, error: error.message },
        SEVERITY.WARNING,
        CATEGORY.UI
      );
      
      return null;
    }
  },
  
  /**
   * Clear an in-app notification
   * @param {string} notificationId - Notification ID
   */
  clearInAppNotification(notificationId) {
    try {
      const notification = document.getElementById(notificationId);
      if (notification) {
        // Add fade-out animation
        notification.classList.add('notification-fade-out');
        
        // Remove after animation completes
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300); // Match CSS animation duration
      }
    } catch (error) {
      console.error('Error clearing in-app notification:', error);
    }
  },
  
  /**
   * Clear all in-app notifications
   */
  clearAllInAppNotifications() {
    try {
      const container = document.getElementById('notification-container');
      if (container) {
        // Add fade-out animation to all notifications
        const notifications = container.querySelectorAll('.notification');
        notifications.forEach(notification => {
          notification.classList.add('notification-fade-out');
        });
        
        // Remove all notifications after animation completes
        setTimeout(() => {
          while (container.firstChild) {
            container.removeChild(container.firstChild);
          }
        }, 300); // Match CSS animation duration
      }
    } catch (error) {
      console.error('Error clearing all in-app notifications:', error);
    }
  },
  
  /**
   * Get all stored notifications
   * @returns {Promise<Array>} Notifications
   */
  async getNotifications() {
    if (!browserAPI || !browserAPI.storage || !browserAPI.storage.local) {
      return [];
    }
    
    return new Promise((resolve) => {
      browserAPI.storage.local.get(STORAGE_KEY_NOTIFICATIONS, (result) => {
        if (browserAPI.runtime?.lastError) {
          console.error(`Error getting notifications: ${browserAPI.runtime.lastError.message}`);
          resolve([]);
          return;
        }
        
        const storedNotifications = result[STORAGE_KEY_NOTIFICATIONS];
        // *** FIX: Ensure the resolved value is always an array ***
        if (Array.isArray(storedNotifications)) {
            resolve(storedNotifications);
        } else {
            if (storedNotifications !== undefined && storedNotifications !== null) {
                // If it exists but is not an array, log a warning and return empty.
                console.warn(`NotificationSystem: Stored notifications data for key '${STORAGE_KEY_NOTIFICATIONS}' is not an array. Found type: ${typeof storedNotifications}. Resetting to empty array.`);
                 // Optionally, you could try to clear this corrupted storage item here.
                 // browserAPI.storage.local.set({ [STORAGE_KEY_NOTIFICATIONS]: [] });
            }
            resolve([]); // Default to empty array if not found or not an array
        }
      });
    });
  },
  
  /**
   * Clear all stored notifications
   * @returns {Promise<boolean>} Success
   */
  async clearStoredNotifications() {
    if (!browserAPI || !browserAPI.storage || !browserAPI.storage.local) {
      return false;
    }
    
    return new Promise((resolve) => {
      browserAPI.storage.local.set({ [STORAGE_KEY_NOTIFICATIONS]: [] }, () => {
        if (browserAPI.runtime?.lastError) {
          console.error(`Error clearing notifications: ${browserAPI.runtime.lastError.message}`);
          resolve(false);
          return;
        }
        
        resolve(true);
      });
    });
  },
  
  /**
   * Initialize notification click listeners
   */
  initializeListeners() {
    if (!browserAPI || !browserAPI.notifications) {
      return;
    }
    
    // Handle notification clicks
    browserAPI.notifications.onClicked.addListener((notificationId) => {
      // Open the extension UI when notification is clicked
      browserAPI.tabs.create({ url: browserAPI.runtime.getURL('main.html') });
      
      // Clear the notification
      browserAPI.notifications.clear(notificationId);
    });
  },
  
  /**
   * Store a notification in history
   * @private
   * @param {string} id - Notification ID
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {string} type - Notification type
   * @returns {Promise<boolean>} Success
   */
  async _storeNotification(id, title, message, type) {
    if (!browserAPI || !browserAPI.storage || !browserAPI.storage.local) {
      return false;
    }
    
    try {
      // Get existing notifications (this will now always be an array due to the fix)
      const notifications = await this.getNotifications();
      
      // Create new notification record
      const notification = {
        id,
        title,
        message,
        type,
        timestamp: new Date().toISOString(),
        read: false
      };
      
      // Add to beginning of array
      notifications.unshift(notification);
      
      // Limit to maximum number
      if (notifications.length > MAX_NOTIFICATIONS) {
        notifications.length = MAX_NOTIFICATIONS;
      }
      
      // Save updated notifications
      return new Promise((resolve) => {
        browserAPI.storage.local.set({ [STORAGE_KEY_NOTIFICATIONS]: notifications }, () => {
          if (browserAPI.runtime?.lastError) {
            console.error(`Error storing notification: ${browserAPI.runtime.lastError.message}`);
            resolve(false);
            return;
          }
          
          resolve(true);
        });
      });
    } catch (error) {
      console.error('Error storing notification:', error);
      return false;
    }
  },
  
  /**
   * Mark a notification as read
   * @param {string} id - Notification ID
   * @returns {Promise<boolean>} Success
   */
  async markNotificationAsRead(id) {
    if (!browserAPI || !browserAPI.storage || !browserAPI.storage.local) {
      return false;
    }
    
    try {
      // Get existing notifications
      const notifications = await this.getNotifications();
      
      // Find and update the notification
      const notification = notifications.find(n => n.id === id);
      if (notification) {
        notification.read = true;
        
        // Save updated notifications
        return new Promise((resolve) => {
          browserAPI.storage.local.set({ [STORAGE_KEY_NOTIFICATIONS]: notifications }, () => {
            if (browserAPI.runtime?.lastError) {
              console.error(`Error updating notification: ${browserAPI.runtime.lastError.message}`);
              resolve(false);
              return;
            }
            
            resolve(true);
          });
        });
      }
      
      return false;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return false;
    }
  },
  
  /**
   * Get the appropriate icon for a notification type
   * @private
   * @param {string} type - Notification type
   * @returns {string} Icon path
   */
  _getIconForType(type) {
    // Default icon path
    let iconPath = 'icons/icon48.png';
    
    // Use different icons based on type if available
    switch (type) {
      case NOTIFICATION_TYPE.SUCCESS:
        iconPath = 'icons/success-icon48.png';
        break;
      case NOTIFICATION_TYPE.WARNING:
        iconPath = 'icons/warning-icon48.png';
        break;
      case NOTIFICATION_TYPE.ERROR:
        iconPath = 'icons/error-icon48.png';
        break;
      default:
        // Use default icon for info and unknown types
        break;
    }
    
    // Get full extension path
    return browserAPI?.runtime?.getURL(iconPath) || iconPath;
  }
};

// Create CSS for in-app notifications
export function createNotificationStyles() {
  return `
    #notification-container {
      position: fixed;
      top: 10px;
      right: 10px;
      max-width: 350px;
      z-index: 9999;
    }
    
    .notification {
      margin-bottom: 10px;
      padding: 12px 15px;
      border-radius: 4px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      position: relative;
      overflow: hidden;
      animation: notification-slide-in 0.3s ease-out forwards;
    }
    
    .notification-fade-out {
      animation: notification-fade-out 0.3s ease-out forwards;
    }
    
    .notification-info {
      background-color: #e3f2fd;
      border-left: 4px solid #2196f3;
      color: #0d47a1;
    }
    
    .notification-success {
      background-color: #e8f5e9;
      border-left: 4px solid #4caf50;
      color: #1b5e20;
    }
    
    .notification-warning {
      background-color: #fff3e0;
      border-left: 4px solid #ff9800;
      color: #e65100;
    }
    
    .notification-error {
      background-color: #ffebee;
      border-left: 4px solid #f44336;
      color: #b71c1c;
    }
    
    .notification-close {
      position: absolute;
      top: 5px;
      right: 5px;
      background: none;
      border: none;
      color: inherit;
      font-size: 16px;
      cursor: pointer;
      opacity: 0.7;
    }
    
    .notification-close:hover {
      opacity: 1;
    }
    
    .notification-message {
      padding-right: 20px;
    }
    
    @keyframes notification-slide-in {
      0% {
        transform: translateX(100%);
        opacity: 0;
      }
      100% {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes notification-fade-out {
      0% {
        transform: translateX(0);
        opacity: 1;
      }
      100% {
        transform: translateX(100%);
        opacity: 0;
      }
    }
  `;
}

/**
 * Create notification container element
 * @returns {HTMLElement} Notification container
 */
export function createNotificationContainer() {
  // Check if container already exists
  let container = document.getElementById('notification-container');
  
  if (!container) {
    // Create container element
    container = document.createElement('div');
    container.id = 'notification-container';
    
    // Add styles if not already present
    if (!document.getElementById('notification-styles')) {
      const styles = document.createElement('style');
      styles.id = 'notification-styles';
      styles.textContent = createNotificationStyles();
      document.head.appendChild(styles);
    }
    
    // Add container to document
    document.body.appendChild(container);
  }
  
  return container;
}

export default NotificationSystem;