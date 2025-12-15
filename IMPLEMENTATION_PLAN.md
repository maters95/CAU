# CAU Data Review Implementation Plan

## Current State Analysis

### D&A Implementation
1. **scriptB.js** - Stores extraction reports with raw text (dateText, nameText, countText) ✅
2. **background.js** - Sends verification data to index.html after processing
3. **index.js** - Has inline verification modal handler (lines 480-900)
4. **index.html** - Has modal HTML structure in the page

### CAU Current State  
1. **scriptB.js** - ✅ ALREADY stores extraction reports with raw text (same as D&A)
2. **background.js** - ❌ NO verification sending
3. **index.js** - ❌ NO verification modal
4. **data-review-manager.js** - ❌ WRONG approach - standalone modal

## Implementation Steps

### Step 1: Add Verification Sending to background.js
Add code after processing to send verification data to index.html

### Step 2: Add Verification Modal Handler to index.js
Copy D&A's verification modal code (lines 480-900) and adapt for CAU

### Step 3: Add Modal HTML to index.html
Add the modal structure to the HTML

### Step 4: Remove data-review-manager.js
Delete the file and remove its import from index.js

### Step 5: Test Complete Flow
1. Run script
2. Verify modal appears with raw text
3. Test editing counts
4. Test saving changes
