// theme-toggle.js - Adds dark mode toggle functionality
'use strict';

(function() {
  // Theme settings key in storage
  const STORAGE_KEY_THEME = 'ecmThemePreference';

  /**
   * Initializes the theme toggle system and injects the toggle button
   */
  function initializeThemeToggle() {
    // Create toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'theme-toggle';
    toggleBtn.id = 'themeToggleBtn';
    toggleBtn.setAttribute('aria-label', 'Toggle dark mode');
    toggleBtn.innerHTML = '🌓'; // Moon/sun emoji as toggle icon
    document.body.appendChild(toggleBtn);

    // Load saved theme preference or use system preference
    loadThemePreference();

    // Add click event listener to toggle
    toggleBtn.addEventListener('click', toggleTheme);

    console.log('Theme toggle initialized');
  }

  /**
   * Loads the saved theme preference from storage or uses system preference
   */
  function loadThemePreference() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([STORAGE_KEY_THEME], function(result) {
        if (chrome.runtime.lastError) {
          console.warn("Error loading theme preference:", chrome.runtime.lastError);
          applyTheme(getSystemPreference());
          return;
        }

        const savedTheme = result[STORAGE_KEY_THEME];
        if (savedTheme === 'dark' || savedTheme === 'light') {
          applyTheme(savedTheme);
        } else {
          // If no saved preference, use system preference
          applyTheme(getSystemPreference());
        }
      });
    } else {
      // Fallback if Chrome storage is not available
      applyTheme(getSystemPreference());
    }
  }

  /**
   * Gets the system color scheme preference
   * @returns {string} 'dark' or 'light'
   */
  function getSystemPreference() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches 
      ? 'dark' 
      : 'light';
  }

  /**
   * Toggles between light and dark themes
   */
  function toggleTheme() {
    const currentTheme = document.documentElement.classList.contains('dark-mode') ? 'dark' : 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    applyTheme(newTheme);
    saveThemePreference(newTheme);
  }

  /**
   * Applies the specified theme to the document
   * @param {string} theme - 'dark' or 'light'
   */
  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark-mode');
      document.documentElement.classList.remove('light-mode');
      updateToggleIcon('dark');
    } else {
      document.documentElement.classList.add('light-mode');
      document.documentElement.classList.remove('dark-mode');
      updateToggleIcon('light');
    }
  }

  /**
   * Updates the toggle button icon based on current theme
   * @param {string} theme - 'dark' or 'light'
   */
  function updateToggleIcon(theme) {
    const toggleBtn = document.getElementById('themeToggleBtn');
    if (toggleBtn) {
      toggleBtn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
      toggleBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }

  /**
   * Saves the theme preference to storage
   * @param {string} theme - 'dark' or 'light'
   */
  function saveThemePreference(theme) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [STORAGE_KEY_THEME]: theme }, function() {
        if (chrome.runtime.lastError) {
          console.warn("Error saving theme preference:", chrome.runtime.lastError);
        } else {
          console.log(`Theme preference saved: ${theme}`);
        }
      });
    }
  }

  // Listen for system preference changes
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      // Only apply system preference if no user preference is saved
      chrome.storage.local.get([STORAGE_KEY_THEME], function(result) {
        if (!result[STORAGE_KEY_THEME]) {
          applyTheme(e.matches ? 'dark' : 'light');
        }
      });
    });
  }

  // Initialize theme toggle on DOM content loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeThemeToggle);
  } else {
    // DOM already loaded, run immediately
    initializeThemeToggle();
  }
})();