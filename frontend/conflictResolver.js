/* ============================================================
   Conflict Resolver — Merges Regex and NER detections
   When both systems detect the same text span, produces one
   canonical detection using priority rules.
   ============================================================ */

const ConflictResolver = (() => {
    'use strict';

    // Structured entity types that regex handles well
    const STRUCTURED_TYPES = new Set([
        'EMAIL', 'PHONE', 'PAN', 'AADHAAR', 'UPI',
        'BANK_ACCOUNT', 'IFSC', 'CARD_NUMBER', 'API_KEY', 'PASSWORD'
    ]);

    /**
     * Check if two detection spans overlap.
     * @param {Detection} a
     * @param {Detection} b
     * @returns {boolean}
     */
    function spansOverlap(a, b) {
        return a.start < b.end && b.start < a.end;
    }

    /**
     * Calculate overlap ratio between two spans.
     * @param {Detection} a
     * @param {Detection} b
     * @returns {number} 0-1 ratio
     */
    function overlapRatio(a, b) {
        const overlapStart = Math.max(a.start, b.start);
        const overlapEnd = Math.min(a.end, b.end);
        const overlap = Math.max(0, overlapEnd - overlapStart);
        const minSpan = Math.min(a.end - a.start, b.end - b.start);
        return minSpan > 0 ? overlap / minSpan : 0;
    }

    /**
     * Resolve conflicts between regex and NER detections.
     *
     * Rules:
     * 1. For overlapping spans, prefer high-confidence structured regex results.
     * 2. Preserve useful NER info (merge sources).
     * 3. Non-overlapping detections pass through unchanged.
     * 4. Produce one canonical detection per text span.
     *
     * @param {Detection[]} regexDetections
     * @param {Detection[]} nerDetections
     * @returns {Detection[]} Resolved detections
     */
    function resolve(regexDetections, nerDetections) {
        const merged = [];
        const nerUsed = new Set(); // Track which NER detections have been merged

        // Process each regex detection
        for (const regexDet of regexDetections) {
            let wasConflicted = false;

            for (let i = 0; i < nerDetections.length; i++) {
                const nerDet = nerDetections[i];
                if (nerUsed.has(i)) continue;

                if (spansOverlap(regexDet, nerDet) && overlapRatio(regexDet, nerDet) > 0.3) {
                    // Conflict detected: same text, different classifications
                    wasConflicted = true;
                    nerUsed.add(i);

                    // Rule 1: Prefer structured regex detection with high confidence
                    if (STRUCTURED_TYPES.has(regexDet.type) && regexDet.confidence >= 0.80) {
                        // Keep regex type but merge source info
                        merged.push({
                            ...regexDet,
                            confidence: Confidence.merge(regexDet.confidence, nerDet.confidence),
                            sources: ['regex', nerDet.source || 'ner'],
                            nerType: nerDet.type // Preserve NER classification as metadata
                        });
                    } else if (nerDet.confidence > regexDet.confidence + 0.15) {
                        // Rule 2: NER is significantly more confident → prefer NER
                        merged.push({
                            ...nerDet,
                            confidence: Confidence.merge(regexDet.confidence, nerDet.confidence),
                            sources: [nerDet.source || 'ner', 'regex'],
                            regexType: regexDet.type
                        });
                    } else {
                        // Default: prefer regex for structured entities
                        merged.push({
                            ...regexDet,
                            confidence: Confidence.merge(regexDet.confidence, nerDet.confidence),
                            sources: ['regex', nerDet.source || 'ner'],
                            nerType: nerDet.type
                        });
                    }
                }
            }

            // No conflict — regex detection stands alone
            if (!wasConflicted) {
                merged.push({
                    ...regexDet,
                    sources: ['regex']
                });
            }
        }

        // Add remaining NER detections that didn't overlap with any regex
        for (let i = 0; i < nerDetections.length; i++) {
            if (!nerUsed.has(i)) {
                merged.push({
                    ...nerDetections[i],
                    sources: [nerDetections[i].source || 'ner']
                });
            }
        }

        return merged;
    }

    return { resolve, spansOverlap, overlapRatio };
})();
