/* ============================================================
   Privacy Policy Engine — Defines security constraints
   per entity type, affected by privacy mode.
   The policy engine provides constraints — it does NOT decide
   necessity (that's the Context Analyzer's job).
   ============================================================ */

const PrivacyPolicy = (() => {
    'use strict';

    /**
     * Privacy modes: basic, balanced, strict
     */
    const MODES = {
        BASIC: 'basic',
        BALANCED: 'balanced',
        STRICT: 'strict'
    };

    let currentMode = MODES.BALANCED;

    /**
     * Per-type policy definitions.
     * Each entry defines behavior across all three modes.
     *
     * - allowKeep: Can the user choose KEEP?
     * - defaultAction: What action is recommended by default?
     * - requireExplicitConsent: Needs explicit approval before sending?
     * - neverTransmit: Blocked from ever being sent externally?
     */
    const policies = {
        PASSWORD: {
            basic:    { allowKeep: false, defaultAction: 'REMOVE', requireExplicitConsent: true,  neverTransmit: true },
            balanced: { allowKeep: false, defaultAction: 'REMOVE', requireExplicitConsent: true,  neverTransmit: true },
            strict:   { allowKeep: false, defaultAction: 'REMOVE', requireExplicitConsent: true,  neverTransmit: true }
        },
        API_KEY: {
            basic:    { allowKeep: false, defaultAction: 'REMOVE', requireExplicitConsent: true,  neverTransmit: true },
            balanced: { allowKeep: false, defaultAction: 'REMOVE', requireExplicitConsent: true,  neverTransmit: true },
            strict:   { allowKeep: false, defaultAction: 'REMOVE', requireExplicitConsent: true,  neverTransmit: true }
        },
        PAN: {
            basic:    { allowKeep: true,  defaultAction: 'MASK',   requireExplicitConsent: false, neverTransmit: false },
            balanced: { allowKeep: true,  defaultAction: 'MASK',   requireExplicitConsent: true,  neverTransmit: false },
            strict:   { allowKeep: false, defaultAction: 'REMOVE', requireExplicitConsent: true,  neverTransmit: true }
        },
        AADHAAR: {
            basic:    { allowKeep: true,  defaultAction: 'MASK',   requireExplicitConsent: false, neverTransmit: false },
            balanced: { allowKeep: false, defaultAction: 'MASK',   requireExplicitConsent: true,  neverTransmit: false },
            strict:   { allowKeep: false, defaultAction: 'REMOVE', requireExplicitConsent: true,  neverTransmit: true }
        },
        BANK_ACCOUNT: {
            basic:    { allowKeep: true,  defaultAction: 'MASK',   requireExplicitConsent: false, neverTransmit: false },
            balanced: { allowKeep: true,  defaultAction: 'MASK',   requireExplicitConsent: true,  neverTransmit: false },
            strict:   { allowKeep: false, defaultAction: 'REMOVE', requireExplicitConsent: true,  neverTransmit: true }
        },
        CARD_NUMBER: {
            basic:    { allowKeep: true,  defaultAction: 'MASK',   requireExplicitConsent: false, neverTransmit: false },
            balanced: { allowKeep: false, defaultAction: 'MASK',   requireExplicitConsent: true,  neverTransmit: false },
            strict:   { allowKeep: false, defaultAction: 'REMOVE', requireExplicitConsent: true,  neverTransmit: true }
        },
        UPI: {
            basic:    { allowKeep: true,  defaultAction: 'MASK',   requireExplicitConsent: false, neverTransmit: false },
            balanced: { allowKeep: true,  defaultAction: 'MASK',   requireExplicitConsent: true,  neverTransmit: false },
            strict:   { allowKeep: false, defaultAction: 'REMOVE', requireExplicitConsent: true,  neverTransmit: true }
        },
        PHONE: {
            basic:    { allowKeep: true,  defaultAction: 'KEEP',   requireExplicitConsent: false, neverTransmit: false },
            balanced: { allowKeep: true,  defaultAction: 'MASK',   requireExplicitConsent: false, neverTransmit: false },
            strict:   { allowKeep: true,  defaultAction: 'REMOVE', requireExplicitConsent: true,  neverTransmit: false }
        },
        EMAIL: {
            basic:    { allowKeep: true,  defaultAction: 'KEEP',   requireExplicitConsent: false, neverTransmit: false },
            balanced: { allowKeep: true,  defaultAction: 'MASK',   requireExplicitConsent: false, neverTransmit: false },
            strict:   { allowKeep: true,  defaultAction: 'REMOVE', requireExplicitConsent: true,  neverTransmit: false }
        },
        PERSON: {
            basic:    { allowKeep: true,  defaultAction: 'KEEP',   requireExplicitConsent: false, neverTransmit: false },
            balanced: { allowKeep: true,  defaultAction: 'KEEP',   requireExplicitConsent: false, neverTransmit: false },
            strict:   { allowKeep: true,  defaultAction: 'MASK',   requireExplicitConsent: true,  neverTransmit: false }
        },
        ADDRESS: {
            basic:    { allowKeep: true,  defaultAction: 'KEEP',   requireExplicitConsent: false, neverTransmit: false },
            balanced: { allowKeep: true,  defaultAction: 'MASK',   requireExplicitConsent: false, neverTransmit: false },
            strict:   { allowKeep: true,  defaultAction: 'REMOVE', requireExplicitConsent: true,  neverTransmit: false }
        },
        ORGANIZATION: {
            basic:    { allowKeep: true,  defaultAction: 'KEEP',   requireExplicitConsent: false, neverTransmit: false },
            balanced: { allowKeep: true,  defaultAction: 'KEEP',   requireExplicitConsent: false, neverTransmit: false },
            strict:   { allowKeep: true,  defaultAction: 'MASK',   requireExplicitConsent: false, neverTransmit: false }
        },
        IFSC: {
            basic:    { allowKeep: true,  defaultAction: 'KEEP',   requireExplicitConsent: false, neverTransmit: false },
            balanced: { allowKeep: true,  defaultAction: 'MASK',   requireExplicitConsent: false, neverTransmit: false },
            strict:   { allowKeep: true,  defaultAction: 'REMOVE', requireExplicitConsent: true,  neverTransmit: false }
        },
        PIN_CODE: {
            basic:    { allowKeep: true,  defaultAction: 'KEEP',   requireExplicitConsent: false, neverTransmit: false },
            balanced: { allowKeep: true,  defaultAction: 'MASK',   requireExplicitConsent: false, neverTransmit: false },
            strict:   { allowKeep: false, defaultAction: 'REMOVE', requireExplicitConsent: true,  neverTransmit: false }
        },
        HOUSE_NO: {
            basic:    { allowKeep: true,  defaultAction: 'KEEP',   requireExplicitConsent: false, neverTransmit: false },
            balanced: { allowKeep: true,  defaultAction: 'MASK',   requireExplicitConsent: false, neverTransmit: false },
            strict:   { allowKeep: false, defaultAction: 'REMOVE', requireExplicitConsent: true,  neverTransmit: false }
        },
        VOTER_ID: {
            basic:    { allowKeep: true,  defaultAction: 'MASK',   requireExplicitConsent: false, neverTransmit: false },
            balanced: { allowKeep: false, defaultAction: 'MASK',   requireExplicitConsent: true,  neverTransmit: false },
            strict:   { allowKeep: false, defaultAction: 'REMOVE', requireExplicitConsent: true,  neverTransmit: true }
        },
        MISC: {
            basic:    { allowKeep: true,  defaultAction: 'KEEP',   requireExplicitConsent: false, neverTransmit: false },
            balanced: { allowKeep: true,  defaultAction: 'MASK',   requireExplicitConsent: false, neverTransmit: false },
            strict:   { allowKeep: true,  defaultAction: 'REMOVE', requireExplicitConsent: true,  neverTransmit: false }
        }
    };

    /**
     * Get the privacy policy for a specific entity type in the current mode.
     * @param {string} type - Entity type
     * @returns {Object} Policy for the current mode
     */
    function getPolicy(type) {
        const typePolicy = policies[type] || policies['MISC'];
        return typePolicy[currentMode] || typePolicy['balanced'];
    }

    /**
     * Check if an entity type can be kept (sent in original form).
     * @param {string} type
     * @returns {boolean}
     */
    function canKeep(type) {
        return getPolicy(type).allowKeep;
    }

    /**
     * Check if an entity type is never-transmit (absolute block).
     * @param {string} type
     * @returns {boolean}
     */
    function isNeverTransmit(type) {
        return getPolicy(type).neverTransmit;
    }

    /**
     * Get the default action for an entity type in the current mode.
     * @param {string} type
     * @returns {'KEEP'|'MASK'|'REMOVE'}
     */
    function getDefaultAction(type) {
        return getPolicy(type).defaultAction;
    }

    /**
     * Check if explicit consent is required before sending.
     * @param {string} type
     * @returns {boolean}
     */
    function requiresConsent(type) {
        return getPolicy(type).requireExplicitConsent;
    }

    /**
     * Set the current privacy mode.
     * @param {'basic'|'balanced'|'strict'} mode
     */
    function setMode(mode) {
        if (Object.values(MODES).includes(mode)) {
            currentMode = mode;
        }
    }

    /**
     * Get the current privacy mode.
     * @returns {string}
     */
    function getMode() {
        return currentMode;
    }

    /**
     * Get a human-readable explanation of why an action is restricted.
     * @param {string} type
     * @param {string} attemptedAction
     * @returns {string|null}
     */
    function getRestrictionReason(type, attemptedAction) {
        const pol = getPolicy(type);

        if (attemptedAction === 'KEEP' && !pol.allowKeep) {
            if (pol.neverTransmit) {
                return `${type} information is classified as CRITICAL and cannot be transmitted to external AI services under any privacy mode.`;
            }
            return `In ${currentMode.toUpperCase()} mode, ${type} information cannot be kept in its original form. Consider using MASK instead.`;
        }

        return null;
    }

    return {
        MODES,
        getPolicy,
        canKeep,
        isNeverTransmit,
        getDefaultAction,
        requiresConsent,
        setMode,
        getMode,
        getRestrictionReason
    };
})();
