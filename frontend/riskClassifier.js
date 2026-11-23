/* ============================================================
   Risk Classifier — Assigns risk levels to detected entities
   Risk level is NOT the same as necessity.
   ============================================================ */

const RiskClassifier = (() => {
    'use strict';

    /**
     * Risk levels: LOW, MEDIUM, HIGH, CRITICAL
     * Each entity type has a default risk level.
     * This is configurable.
     */
    const defaultPolicy = {
        'PERSON':       'LOW',
        'EMAIL':        'MEDIUM',
        'PHONE':        'MEDIUM',
        'ADDRESS':      'MEDIUM',
        'ORGANIZATION': 'LOW',
        'PAN':          'HIGH',
        'AADHAAR':      'HIGH',
        'UPI':          'HIGH',
        'BANK_ACCOUNT': 'HIGH',
        'TRANSACTION_ID': 'HIGH',
        'IFSC':         'MEDIUM',
        'CARD_NUMBER':  'HIGH',
        'IP_ADDRESS':   'MEDIUM',
        'API_KEY':      'CRITICAL',
        'PASSWORD':     'CRITICAL',
        'PIN_CODE':     'MEDIUM',
        'HOUSE_NO':     'MEDIUM',
        'VOTER_ID':     'HIGH',
        'MISC':         'LOW'
    };

    // Current active policy (can be modified)
    let policy = { ...defaultPolicy };

    /**
     * Risk level numeric ordering for comparisons.
     */
    const RISK_ORDER = {
        'LOW': 1,
        'MEDIUM': 2,
        'HIGH': 3,
        'CRITICAL': 4
    };

    /**
     * Get risk level for an entity type.
     * @param {string} type - Entity type (e.g. "PHONE", "PAN")
     * @returns {string} Risk level
     */
    function getRisk(type) {
        return policy[type] || 'MEDIUM';
    }

    /**
     * Get numeric risk value for comparison.
     * @param {string} riskLevel
     * @returns {number}
     */
    function getRiskValue(riskLevel) {
        return RISK_ORDER[riskLevel] || 2;
    }

    /**
     * Check if risk level is at or above a threshold.
     * @param {string} riskLevel
     * @param {string} threshold
     * @returns {boolean}
     */
    function isAtLeast(riskLevel, threshold) {
        return getRiskValue(riskLevel) >= getRiskValue(threshold);
    }

    /**
     * Classify all detections with risk levels.
     * Mutates each detection to add a .risk property.
     * @param {Detection[]} detections
     * @returns {Detection[]} Same array with risk levels added
     */
    function classify(detections) {
        for (const det of detections) {
            det.risk = getRisk(det.type);
            det.riskValue = getRiskValue(det.risk);
        }
        return detections;
    }

    /**
     * Get CSS class for a risk level.
     * @param {string} risk
     * @returns {string}
     */
    function getCSSClass(risk) {
        return `risk-${risk.toLowerCase()}`;
    }

    /**
     * Get badge CSS class for a risk level.
     * @param {string} risk
     * @returns {string}
     */
    function getBadgeClass(risk) {
        return `badge-${risk.toLowerCase()}`;
    }

    /**
     * Update risk policy.
     * @param {Object} updates - { type: riskLevel }
     */
    function updatePolicy(updates) {
        Object.assign(policy, updates);
    }

    /**
     * Reset to default policy.
     */
    function resetPolicy() {
        policy = { ...defaultPolicy };
    }

    /**
     * Get current policy.
     * @returns {Object}
     */
    function getPolicy() {
        return { ...policy };
    }

    return {
        getRisk,
        getRiskValue,
        isAtLeast,
        classify,
        getCSSClass,
        getBadgeClass,
        updatePolicy,
        resetPolicy,
        getPolicy,
        RISK_ORDER
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RiskClassifier;
}
