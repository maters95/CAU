// batch-processor.js - Batch Processing Module v1.0
'use strict';

/**
 * Handles processing of work items in controlled batches with retries
 */
export class BatchProcessor {
    /**
     * @param {Object} config - Batch processor configuration
     * @param {number} config.maxConcurrent - Maximum number of concurrent items to process
     * @param {number} config.retryCount - Number of retries for failed items
     * @param {number} config.retryDelay - Delay in ms between retries
     * @param {number} config.timeout - Timeout in ms for each item
     */
    constructor(config) {
        this.maxConcurrent = config.maxConcurrent || 3;
        this.retryCount = config.retryCount || 2;
        this.retryDelay = config.retryDelay || 5000;
        this.timeout = config.timeout || 180000;
    }

    /**
     * Process a list of work items using the provided processor function
     * @param {Array} items - Array of work items to process
     * @param {Function} processorFn - Async function to process each item
     * @returns {Promise<Array>} Results of processing
     */
    async process(items, processorFn) {
        if (!Array.isArray(items) || items.length === 0) {
            throw new Error("No items provided for processing");
        }

        if (typeof processorFn !== 'function') {
            throw new Error("Invalid processor function");
        }

        const results = [];
        let currentIndex = 0;

        const processNext = async () => {
            if (currentIndex >= items.length) return;

            const itemIndex = currentIndex++;
            const item = items[itemIndex];
            
            try {
                // Process the item with retries
                const result = await this.processWithRetry(item, processorFn, itemIndex + 1);
                results[itemIndex] = result;
            } catch (error) {
                console.error(`Failed to process item ${itemIndex} after retries:`, error);
                results[itemIndex] = { error: error.message };
            }
        };

        // Create initial batch of promises
        const workers = Array(Math.min(this.maxConcurrent, items.length))
            .fill(null)
            .map(() => processNext());

        // Wait for all work to complete
        await Promise.all(workers);

        return results;
    }

    /**
     * Process a single item with retries
     * @private 
     */
    async processWithRetry(item, processorFn, progress, attempt = 1) {
        try {
            // Add timeout to the processing
            const result = await Promise.race([
                processorFn(item, progress),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Processing timeout')), this.timeout)
                )
            ]);

            return result;

        } catch (error) {
            if (attempt > this.retryCount) {
                throw error; // No more retries, propagate error
            }

            console.warn(`Retry ${attempt}/${this.retryCount} for item:`, error.message);
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, this.retryDelay));
            
            // Recursive retry
            return this.processWithRetry(item, processorFn, progress, attempt + 1);
        }
    }
}
