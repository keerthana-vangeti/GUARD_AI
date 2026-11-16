/* ============================================================
   Confidence — Threshold engine for detection confidence scores
   ============================================================ */

const Confidence = (() => {
    'use strict';

    // Configurable thresholds
    const thresholds = {
        high: 0.90,      // ≥ 90%: Auto-detect, high confidence
        possible: 0.70,  // 70–89%: Possible detection, ask user
        low: 0.70        // < 70%: Do not auto-treat as sensitive
    };

    /**
     * Classify a confidence score into a category.
     * @param {number} score - 0 to 1
     * @returns {'high'|'possible'|'low'}
     */
    function classify(score) {
        if (score >= thresholds.high) return 'high';
        if (score >= thresholds.possible) return 'possible';
        return 'low';
    }

    /**
     * Check if confidence is above the minimum threshold for detection.
     * @param {number} score
     * @returns {boolean}
     */
    function meetsMinimum(score) {
        return score >= thresholds.possible;
    }

    /**
     * Check if confidence is high enough for automatic detection.
     * @param {number} score
     * @returns {boolean}
     */
    function isHighConfidence(score) {
        return score >= thresholds.high;
    }

    /**
     * Check if confidence is in the "ask user" range.
     * @param {number} score
     * @returns {boolean}
     */
    function needsConfirmation(score) {
        return score >= thresholds.possible && score < thresholds.high;
    }

    /**
     * Format confidence as a percentage string.
     * @param {number} score - 0 to 1
     * @returns {string} e.g. "97%"
     */
    function formatPercent(score) {
        return Math.round(score * 100) + '%';
    }

    /**
     * Get the color class for a confidence score.
     * @param {number} score
     * @returns {string} CSS color variable reference
     */
    function getColor(score) {
        if (score >= thresholds.high) return 'var(--status-success)';
        if (score >= thresholds.possible) return 'var(--status-warning)';
        return 'var(--status-danger)';
    }

    /**
     * Merge two confidence scores (e.g., when regex and NER agree).
     * Uses a boosted average: agreement increases confidence.
     * @param {number} a
     * @param {number} b
     * @returns {number}
     */
    function merge(a, b) {
        // Weighted combination with agreement boost
        const avg = (a + b) / 2;
        const agreementBoost = 0.05; // Small boost for multi-source confirmation
        return Math.min(1.0, Math.max(a, b) + agreementBoost);
    }

    /**
     * Update thresholds (for configurable mode).
     * @param {Object} newThresholds - { high?, possible?, low? }
     */
    function updateThresholds(newThresholds) {
        if (newThresholds.high != null) thresholds.high = newThresholds.high;
        if (newThresholds.possible != null) thresholds.possible = newThresholds.possible;
        if (newThresholds.low != null) thresholds.low = newThresholds.low;
    }

    /**
     * Get current thresholds.
     * @returns {Object}
     */
    function getThresholds() {
        return { ...thresholds };
    }

    return {
        classify,
        meetsMinimum,
        isHighConfidence,
        needsConfirmation,
        formatPercent,
        getColor,
        merge,
        updateThresholds,
        getThresholds
    };
})();
