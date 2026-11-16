/* ============================================================
   Sanitizer — Produces the exact prompt allowed to leave the
   privacy layer, applying user decisions + policy enforcement.
   ============================================================ */

const Sanitizer = (() => {
    'use strict';

    /**
     * Sanitize the prompt based on user decisions and policy.
     *
     * Actions:
     * - KEEP: Leave original value in place (if policy allows)
     * - MASK: Replace with placeholder
     * - REMOVE: Remove the value entirely (with contextual cleanup)
     *
     * @param {string} originalPrompt - The original user prompt
     * @param {Detection[]} detections - Detected entities
     * @param {Object} decisions - { placeholder: 'KEEP'|'MASK'|'REMOVE' }
     * @param {Object} placeholderEngine - Session's placeholder engine instance
     * @returns {{ sanitized: string, stats: Object }}
     */
    function sanitize(originalPrompt, detections, decisions, placeholderEngine) {
        const emptyStats = { kept: 0, masked: 0, removed: 0, categories: { kept: [], masked: [], removed: [] } };
        if (!originalPrompt) return { sanitized: '', stats: emptyStats };
        if (!detections || detections.length === 0) {
            return { sanitized: originalPrompt, stats: { ...emptyStats } };
        }

        // Sort detections by position (reverse) for safe replacement
        const sorted = [...detections].sort((a, b) => b.start - a.start);

        let result = originalPrompt;
        const stats = { kept: 0, masked: 0, removed: 0, categories: { kept: [], masked: [], removed: [] } };

        for (const det of sorted) {
            const placeholder = det._placeholder || placeholderEngine.getPlaceholder(det.value);
            let action = decisions[placeholder] || decisions[det._placeholder] || 'MASK';

            // --- Policy enforcement ---
            // Override user decision if policy forbids it
            if (action === 'KEEP' && !PrivacyPolicy.canKeep(det.type)) {
                action = 'MASK';
            }
            if (PrivacyPolicy.isNeverTransmit(det.type) && action === 'KEEP') {
                action = 'REMOVE';
            }

            // --- Apply action ---
            const isTextPromptDet = det.end <= originalPrompt.length;

            switch (action) {
                case 'KEEP':
                    // Leave the original value — do nothing
                    stats.kept++;
                    stats.categories.kept.push(det.type);
                    break;

                case 'MASK':
                    // Replace value with placeholder
                    if (placeholder && isTextPromptDet) {
                        result = result.substring(0, det.start) + placeholder + result.substring(det.end);
                    }
                    stats.masked++;
                    stats.categories.masked.push(det.type);
                    break;

                case 'REMOVE':
                    // Remove the value and clean up surrounding text
                    if (isTextPromptDet) {
                        result = removeWithCleanup(result, det.start, det.end);
                    }
                    stats.removed++;
                    stats.categories.removed.push(det.type);
                    break;
            }
        }

        // Clean up any double spaces, orphaned punctuation
        result = cleanupText(result);

        // --- VERIFICATION PASS ---
        // Ensure removed values are actually absent
        for (const det of sorted) {
            const isTextPromptDet = det.end <= originalPrompt.length;
            const placeholder = det._placeholder || placeholderEngine.getPlaceholder(det.value);
            const action = decisions[placeholder] || decisions[det._placeholder] || 'MASK';

            if (action === 'REMOVE' && isTextPromptDet) {
                if (result.includes(det.value)) {
                    // Emergency: value still present after removal — force remove
                    result = result.split(det.value).join('');
                    console.warn('[Sanitizer] Verification caught leaked value, force-removed.');
                }
            }
        }

        return { sanitized: result.trim(), stats };
    }

    /**
     * Remove a text span with contextual cleanup.
     * Handles cases like "my phone is 9876543210 and" → "and"
     * @param {string} text
     * @param {number} start
     * @param {number} end
     * @returns {string}
     */
    function removeWithCleanup(text, start, end) {
        // Look for surrounding context to remove cleanly
        let removeStart = start;
        let removeEnd = end;

        // Expand to remove leading context like "my phone is ", "my PAN is "
        const before = text.substring(Math.max(0, start - 50), start);
        const contextPatterns = [
            /(?:my\s+)?(?:\w+\s+)?(?:is|are|was|:)\s*$/i,
            /(?:my\s+)?(?:\w+\s+)?(?:number|no\.?|id|code)\s+(?:is|:)\s*$/i,
        ];

        for (const pattern of contextPatterns) {
            const match = pattern.exec(before);
            if (match) {
                removeStart = start - match[0].length;
                break;
            }
        }

        // Expand to remove trailing connectors like " and", ", "
        const after = text.substring(end, Math.min(text.length, end + 10));
        const trailingMatch = after.match(/^[\s,]*(?:and|,)\s*/i);
        if (trailingMatch) {
            removeEnd = end + trailingMatch[0].length;
        }

        return text.substring(0, removeStart) + text.substring(removeEnd);
    }

    /**
     * Clean up text artifacts from removal.
     * @param {string} text
     * @returns {string}
     */
    function cleanupText(text) {
        return text
            .replace(/\s{2,}/g, ' ')           // Multiple spaces → single
            .replace(/\s+([.,;:!?])/g, '$1')   // Space before punctuation
            .replace(/([.,;:])\s*\1/g, '$1')   // Double punctuation
            .replace(/^\s*[,;]\s*/gm, '')       // Leading comma/semicolon on line
            .replace(/\s*[,;]\s*$/gm, '')       // Trailing comma/semicolon
            .replace(/\.\s*\./g, '.')           // Double periods
            .trim();
    }

    /**
     * Verify that the sanitized prompt does not contain any values
     * that should have been removed.
     * @param {string} sanitized - The sanitized prompt
     * @param {Detection[]} detections - Original detections
     * @param {Object} decisions - User decisions
     * @returns {{ safe: boolean, leaks: string[] }}
     */
    function verify(sanitized, detections, decisions, originalPrompt = '') {
        const leaks = [];

        for (const det of detections) {
            const isTextPromptDet = originalPrompt && det.end <= originalPrompt.length;
            const placeholder = det._placeholder;
            const action = decisions[placeholder] || 'MASK';

            if (action === 'REMOVE' && isTextPromptDet && sanitized.includes(det.value)) {
                leaks.push(det.type);
            }
        }

        return {
            safe: leaks.length === 0,
            leaks
        };
    }

    return { sanitize, verify };
})();
