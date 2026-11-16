/* ============================================================
   Prompt Injection Protection — Detects and blocks attempts
   to bypass the privacy system via prompt manipulation.

   Privacy rules have HIGHER priority than user instructions.
   This cannot be overridden by prompt content.
   ============================================================ */

const PromptInjection = (() => {
    'use strict';

    /**
     * Suspicious patterns that attempt to bypass privacy protection.
     * Each has a severity level for reporting.
     */
    const PATTERNS = [
        { pattern: /ignore\s+(?:all\s+)?(?:privacy|security|safety)\s+(?:rules|settings|policies|checks)/i, severity: 'HIGH', label: 'Ignore privacy rules' },
        { pattern: /disable\s+(?:privacy|security|sanitiz|filter|protect)/i, severity: 'HIGH', label: 'Disable security' },
        { pattern: /bypass\s+(?:privacy|security|sanitiz|filter|protect|guard)/i, severity: 'HIGH', label: 'Bypass security' },
        { pattern: /reveal\s+(?:original|real|actual|raw|true)\s+(?:values?|data|information|names?)/i, severity: 'HIGH', label: 'Reveal original values' },
        { pattern: /send\s+(?:the\s+)?(?:original|raw|real|actual|unmasked|unsanitized)\s+(?:prompt|data|text|values?|PAN|aadhaar|phone)/i, severity: 'HIGH', label: 'Send original data' },
        { pattern: /reveal\s+(?:the\s+)?placeholder\s+mapping/i, severity: 'HIGH', label: 'Reveal placeholder mapping' },
        { pattern: /show\s+(?:me\s+)?(?:the\s+)?(?:original|real|raw|actual)\s+(?:values?|data)/i, severity: 'MEDIUM', label: 'Show original values' },
        { pattern: /ignore\s+(?:all\s+)?previous\s+(?:instructions|rules|constraints)/i, severity: 'HIGH', label: 'Ignore previous instructions' },
        { pattern: /you\s+(?:are|must)\s+(?:now|no\s+longer)\s+(?:a|an|ignore|forget)/i, severity: 'MEDIUM', label: 'Role override attempt' },
        { pattern: /forget\s+(?:all\s+)?(?:your\s+)?(?:rules|instructions|constraints|privacy)/i, severity: 'HIGH', label: 'Forget rules' },
        { pattern: /override\s+(?:privacy|security|policy|rules|sanitizer)/i, severity: 'HIGH', label: 'Override policy' },
        { pattern: /don'?t\s+(?:mask|sanitize|remove|filter|protect|redact)/i, severity: 'MEDIUM', label: 'Don\'t sanitize' },
        { pattern: /skip\s+(?:privacy|security|sanitiz|detection|analysis)/i, severity: 'MEDIUM', label: 'Skip security' },
        { pattern: /turn\s+off\s+(?:privacy|security|protection|sanitiz)/i, severity: 'HIGH', label: 'Turn off security' },
        { pattern: /(?:system|admin|root)\s+(?:mode|access|override|prompt)/i, severity: 'MEDIUM', label: 'System access attempt' },
        { pattern: /what\s+(?:is|are)\s+(?:the\s+)?(?:original|real|actual)\s+(?:values?|data|PAN|phone|aadhaar|name)/i, severity: 'MEDIUM', label: 'Query original values' },
        { pattern: /replace.*placeholder.*(?:with|by).*original/i, severity: 'HIGH', label: 'Replace placeholders' },
        { pattern: /(?:echo|print|output|return|show)\s+(?:all\s+)?(?:sensitive|private|personal)\s+(?:data|information|values)/i, severity: 'MEDIUM', label: 'Output sensitive data' }
    ];

    /**
     * Scan a prompt for injection attempts.
     * @param {string} prompt - The user's prompt
     * @returns {{ safe: boolean, threats: Object[], severity: string }}
     */
    function scan(prompt) {
        if (!prompt || typeof prompt !== 'string') {
            return { safe: true, threats: [], severity: 'NONE' };
        }

        const threats = [];
        let maxSeverity = 'NONE';

        for (const entry of PATTERNS) {
            if (entry.pattern.test(prompt)) {
                threats.push({
                    label: entry.label,
                    severity: entry.severity
                });

                if (entry.severity === 'HIGH' || (entry.severity === 'MEDIUM' && maxSeverity !== 'HIGH')) {
                    maxSeverity = entry.severity;
                }
            }
        }

        return {
            safe: threats.length === 0,
            threats,
            severity: maxSeverity
        };
    }

    /**
     * Remove injection patterns from a prompt.
     * This strips the manipulative parts while preserving the legitimate request.
     * @param {string} prompt
     * @returns {string} Cleaned prompt
     */
    function neutralize(prompt) {
        let cleaned = prompt;

        for (const entry of PATTERNS) {
            cleaned = cleaned.replace(entry.pattern, '[REDACTED_INSTRUCTION]');
        }

        return cleaned;
    }

    /**
     * Get a user-friendly explanation of detected threats.
     * @param {Object[]} threats
     * @returns {string}
     */
    function explainThreats(threats) {
        if (threats.length === 0) return '';

        const labels = threats.map(t => `• ${t.label} (${t.severity})`);
        return `Potential privacy bypass attempts detected:\n${labels.join('\n')}\n\nPrivacy rules cannot be overridden by prompt instructions.`;
    }

    return { scan, neutralize, explainThreats };
})();