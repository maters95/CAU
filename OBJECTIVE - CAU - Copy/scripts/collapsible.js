// scripts/collapsible.js
'use strict';

function setupCollapsible(buttonId, contentId) {
    const toggleButton = document.getElementById(buttonId);
    const content = document.getElementById(contentId);

    if (!toggleButton || !content) {
        console.warn(`Collapsible elements not found for button: ${buttonId}, content: ${contentId}`);
        return;
    }

    // Set initial state (collapsed) - CSS handles hiding
    content.classList.remove('expanded');
    toggleButton.setAttribute('aria-expanded', 'false');
    toggleButton.textContent = 'Show Data Management'; // Default text

    toggleButton.addEventListener('click', () => {
        const isExpanded = content.classList.toggle('expanded');
        toggleButton.setAttribute('aria-expanded', isExpanded);

        // Optional: Change button text
        if (isExpanded) {
            toggleButton.textContent = 'Hide Data Management';
        } else {
            toggleButton.textContent = 'Show Data Management';
        }
    });

     console.log(`Collapsible setup for ${buttonId}`);
}

// Initialize after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    setupCollapsible('toggleDataManagementBtn', 'dataManagementContent');
    // Add more calls here if you have other collapsible sections
});