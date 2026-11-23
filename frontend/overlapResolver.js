/* ============================================================
   Overlap Resolver — Eliminates duplicate/overlapping detections
   Ensures each text span produces exactly one detection.
   ============================================================ */

const OverlapResolver = (() => {
    'use strict';

    /**
     * Check if span A fully contains span B.
     * @param {Detection} a
     * @param {Detection} b
     * @returns {boolean}
     */
    function contains(a, b) {
        return a.start <= b.start && a.end >= b.end;
    }

    /**
     * Check if two spans overlap (any amount).
     * @param {Detection} a
     * @param {Detection} b
     * @returns {boolean}
     */
    function overlaps(a, b) {
        return a.start < b.end && b.start < a.end;
    }

    /**
     * Choose the preferred detection from two overlapping detections.
     * Prefers:
     * 1. Higher confidence
     * 2. More specific type (longer type name = usually more specific)
     * 3. More precise span (covers exactly the target)
     *
     * @param {Detection} a
     * @param {Detection} b
     * @returns {Detection}
     */
    function prefer(a, b) {
        // Significant confidence difference → prefer higher
        if (Math.abs(a.confidence - b.confidence) > 0.1) {
            return a.confidence > b.confidence ? a : b;
        }

        // If one contains the other, prefer the more specific (smaller) span
        // unless the larger span is ADDRESS containing HOUSE_NO or PIN_CODE
        if (contains(a, b) && !contains(b, a)) {
            if (a.type === 'ADDRESS' && (b.type === 'HOUSE_NO' || b.type === 'PIN_CODE')) {
                return a;
            }
            return b;
        }
        if (contains(b, a) && !contains(a, b)) {
            if (b.type === 'ADDRESS' && (a.type === 'HOUSE_NO' || a.type === 'PIN_CODE')) {
                return b;
            }
            return a;
        }

        // Equal or similar confidence — prefer regex source for structured types
        const structuredTypes = new Set([
            'EMAIL', 'PHONE', 'PAN', 'AADHAAR', 'UPI',
            'BANK_ACCOUNT', 'IFSC', 'CARD_NUMBER', 'API_KEY', 'PASSWORD',
            'TRANSACTION_ID', 'IP_ADDRESS'
        ]);

        if (structuredTypes.has(a.type) && !structuredTypes.has(b.type)) return a;
        if (structuredTypes.has(b.type) && !structuredTypes.has(a.type)) return b;

        // Finally, prefer higher confidence
        return a.confidence >= b.confidence ? a : b;
    }

    /**
     * Resolve all overlapping detections into a canonical set.
     * No two detections in the result should overlap.
     *
     * @param {Detection[]} detections - All detections (already conflict-resolved)
     * @returns {Detection[]} Non-overlapping canonical detections
     */
    function resolve(detections) {
        if (!detections || detections.length === 0) return [];

        // Sort by start position, then by span length (longer first)
        const sorted = [...detections].sort((a, b) => {
            if (a.start !== b.start) return a.start - b.start;
            return (b.end - b.start) - (a.end - a.start);
        });

        const result = [];
        const removed = new Set();

        for (let i = 0; i < sorted.length; i++) {
            if (removed.has(i)) continue;

            let current = sorted[i];

            // Check against all subsequent detections for overlap
            for (let j = i + 1; j < sorted.length; j++) {
                if (removed.has(j)) continue;

                const other = sorted[j];

                if (overlaps(current, other)) {
                    // Choose the preferred detection
                    const winner = prefer(current, other);

                    if (winner === current) {
                        removed.add(j);
                    } else {
                        removed.add(i);
                        current = other;
                        // Need to re-check this detection against further ones
                    }
                }
            }

            if (!removed.has(i)) {
                result.push(current);
            }
        }

        // Final dedup: ensure no two detections have identical value and type
        const deduped = [];
        const seen = new Set();

        for (const det of result) {
            const key = `${det.type}:${det.value}:${det.start}`;
            if (!seen.has(key)) {
                seen.add(key);
                deduped.push(det);
            }
        }

        return deduped;
    }

    return { resolve, overlaps, contains, prefer };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OverlapResolver;
}
