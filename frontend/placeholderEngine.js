/* ============================================================
   Placeholder Engine — Creates [TYPE_N] placeholders
   and maintains a temporary in-memory mapping.
   NEVER uses localStorage for sensitive data.
   ============================================================ */

const PlaceholderEngine = (() => {
    'use strict';

    /**
     * Create a new placeholder engine instance.
     * Each session gets its own instance via SessionManager.
     * @returns {Object} Placeholder engine instance
     */
    function createInstance() {
        // Temporary in-memory mapping — never persisted
        const mapping = new Map();      // placeholder → original value
        const reverseMap = new Map();   // original value → placeholder
        const counters = {};            // type → count

        /**
         * Generate a placeholder for a detection.
         * If the same value already has a placeholder, reuse it.
         * @param {Detection} detection
         * @returns {string} Placeholder string, e.g. "[NAME_1]"
         */
        function create(detection) {
            // Check if value already has a placeholder
            if (reverseMap.has(detection.value)) {
                return reverseMap.get(detection.value);
            }

            // Increment counter for this type
            const type = detection.type;
            if (!counters[type]) counters[type] = 0;
            counters[type]++;

            const placeholder = `[${type}_${counters[type]}]`;

            // Store bidirectional mapping in memory only
            mapping.set(placeholder, detection.value);
            reverseMap.set(detection.value, placeholder);

            return placeholder;
        }

        /**
         * Get the original value for a placeholder.
         * @param {string} placeholder
         * @returns {string|null}
         */
        function getOriginal(placeholder) {
            return mapping.get(placeholder) || null;
        }

        /**
         * Get the placeholder for an original value.
         * @param {string} value
         * @returns {string|null}
         */
        function getPlaceholder(value) {
            return reverseMap.get(value) || null;
        }

        /**
         * Replace all detected values in text with their placeholders.
         * @param {string} text
         * @param {Detection[]} detections - Already-processed detections
         * @returns {string} Text with placeholders
         */
        function replaceAll(text, detections) {
            if (!detections || detections.length === 0) return text;

            // Sort detections by position (reverse) to replace from end first
            // This preserves correct positions during replacement
            const sorted = [...detections].sort((a, b) => b.start - a.start);

            let result = text;
            for (const det of sorted) {
                const placeholder = create(det);
                // Use the actual position in text for precise replacement
                result = result.substring(0, det.start) + placeholder + result.substring(det.end);
            }

            return result;
        }

        /**
         * Restore permitted placeholders in text with original values.
         * Only restores values that are explicitly permitted.
         * @param {string} text - Text containing placeholders
         * @param {Set<string>} permitted - Set of placeholders allowed to be restored
         * @returns {string} Text with restored values
         */
        function restore(text, permitted) {
            let result = text;
            for (const [placeholder, value] of mapping) {
                if (permitted.has(placeholder)) {
                    // Replace all occurrences of this placeholder
                    result = result.split(placeholder).join(value);
                }
            }
            return result;
        }

        /**
         * Get all mappings (for audit display only).
         * @returns {Object[]} Array of { placeholder, type }
         */
        function getAllMappings() {
            const result = [];
            for (const [placeholder] of mapping) {
                // Extract type from placeholder: [TYPE_N] → TYPE
                const match = placeholder.match(/\[(.+)_\d+\]/);
                result.push({
                    placeholder,
                    type: match ? match[1] : 'UNKNOWN',
                    // DO NOT expose original values in audit — show masked version
                    maskedValue: '••••••'
                });
            }
            return result;
        }

        /**
         * Get the count of all mappings.
         * @returns {number}
         */
        function getCount() {
            return mapping.size;
        }

        /**
         * Destroy all mappings — security-critical.
         * Overwrites values in memory before clearing.
         */
        function destroy() {
            // Overwrite sensitive values before clearing
            for (const [key, _] of mapping) {
                mapping.set(key, '');
            }
            for (const [key, _] of reverseMap) {
                reverseMap.set(key, '');
            }

            mapping.clear();
            reverseMap.clear();

            // Reset counters
            for (const key in counters) {
                delete counters[key];
            }
        }

        return {
            create,
            getOriginal,
            getPlaceholder,
            replaceAll,
            restore,
            getAllMappings,
            getCount,
            destroy
        };
    }

    return { createInstance };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlaceholderEngine;
}
