/* ============================================================
   Detector — Main detection orchestrator
   Runs regex + NER → conflict resolve → overlap resolve
   Returns the final canonical detection list.
   ============================================================ */

if (typeof require !== 'undefined') {
    if (typeof RegexDetectors === 'undefined') var RegexDetectors = require('./regexDetectors');
    if (typeof NERDetector === 'undefined') var NERDetector = require('./nerDetector');
    if (typeof ConflictResolver === 'undefined') var ConflictResolver = require('./conflictResolver');
    if (typeof OverlapResolver === 'undefined') var OverlapResolver = require('./overlapResolver');
    if (typeof Confidence === 'undefined') var Confidence = require('./confidence');
}

const Detector = (() => {
    'use strict';

    /**
     * Run the full detection pipeline on input text.
     * Only returns entities that actually exist in the text.
     * Never invents entities.
     *
     * @param {string} text - User's input text
     * @returns {Promise<Detection[]>} Final canonical detections
     */
    async function detect(text) {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return [];
        }

        // Step 1: Run regex detectors
        const regexResults = RegexDetectors.detect(text);

        // Step 2: Run NER detector
        let nerResults = [];
        try {
            nerResults = await NERDetector.detect(text);
        } catch (err) {
            console.warn('[Detector] NER detection failed, using regex only:', err);
            // NER failure is not fatal — we continue with regex results
        }

        // Step 3: Conflict resolution (merge regex + NER)
        const conflictResolved = ConflictResolver.resolve(regexResults, nerResults);

        // Step 4: Overlap resolution (deduplicate)
        const overlapResolved = OverlapResolver.resolve(conflictResolved);

        // Step 5: Apply confidence threshold filtering
        const filtered = overlapResolved.filter(det => {
            return Confidence.meetsMinimum(det.confidence);
        });

        // Sort by position in text for consistent display
        filtered.sort((a, b) => a.start - b.start);

        return filtered;
    }

    /**
     * Run detection for evaluation purposes (includes all detections, even low-confidence).
     * @param {string} text
     * @returns {Promise<Detection[]>}
     */
    async function detectAll(text) {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return [];
        }

        const regexResults = RegexDetectors.detect(text);
        let nerResults = [];
        try {
            nerResults = await NERDetector.detect(text);
        } catch (err) {
            // Continue with regex only
        }

        const conflictResolved = ConflictResolver.resolve(regexResults, nerResults);
        const overlapResolved = OverlapResolver.resolve(conflictResolved);

        overlapResolved.sort((a, b) => a.start - b.start);
        return overlapResolved;
    }

    return { detect, detectAll };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Detector;
}
