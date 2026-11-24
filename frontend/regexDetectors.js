/* ============================================================
   Regex Detectors — Modular Registry
   Each detector is a self-contained unit that returns structured
   detection results. Only detects entities that actually exist.
   ============================================================ */

/**
 * @typedef {Object} Detection
 * @property {string} type     - Entity type (e.g. "EMAIL", "PHONE")
 * @property {string} value    - The matched text
 * @property {number} start    - Start index in original text
 * @property {number} end      - End index in original text
 * @property {number} confidence - 0-1 confidence score
 * @property {string} source   - "regex"
 */

const RegexDetectors = (() => {
    'use strict';

    // ----- Individual Detectors -----

    /** Email addresses (RFC 5322 subset + OCR space tolerance) */
    const emailDetector = {
        type: 'EMAIL',
        pattern: /\b[a-zA-Z0-9._%+\-]+[\s]*@[\s]*[a-zA-Z0-9.\-]+[\s]*\.[a-zA-Z]{2,}\b/gi,
        confidence: 0.97,
        description: 'Email address',
        extractValue: (match) => match.replace(/\s+/g, '').replace(/[.,;:!?]+$/, ''),
        validate: (match) => {
            const clean = match.replace(/\s+/g, '').replace(/[.,;:!?]+$/, '');
            return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(clean);
        }
    };

    /** Indian phone numbers: 10 digits, optional +91/0 prefix, or numbers near phone keywords */
    const phoneDetector = {
        type: 'PHONE',
        pattern: /(?:\+91[\s\-]?|91[\s\-]?|0)?[6-9]\d{4}[\s\-]?\d{5}\b|(?:phone|mobile|cell|contact|tel|call)[^\d\n]{0,30}?(\+?\d[\d\s\-]{6,14}\d)\b/gi,
        confidence: 0.95,
        description: 'Phone number',
        extractValue: (match) => {
            const numMatch = /(\+?\d[\d\s\-]{6,14}\d)/.exec(match);
            return numMatch ? numMatch[1].trim() : match.trim();
        },
        validate: (match, text, start) => {
            if (start > 0 && /\d/.test(text[start - 1])) return false;
            // Prevent matching phone number if preceded by Account or Aadhaar keywords
            const before = text ? text.substring(Math.max(0, start - 30), start).toLowerCase() : '';
            if (/(?:account|a\/c|acct|aadhaar|aadhar|utr|txn|ref)/.test(before)) return false;
            const digits = match.replace(/\D/g, '');
            if (digits.length < 10 || digits.length > 13) return false;
            return true;
        }
    };

    /** Indian PAN: 5 letters + 4 digits + 1 letter, e.g. ABCDE1234F */
    const panDetector = {
        type: 'PAN',
        pattern: /\b[a-zA-Z]{5}\d{4}[a-zA-Z]\b/g,
        confidence: 0.98,
        description: 'Indian PAN (Permanent Account Number)',
        extractValue: (match) => match.toUpperCase(),
        validate: (match, text, start) => {
            const before = text ? text.substring(Math.max(0, start - 20), start).toLowerCase() : '';
            // Avoid matching variable names in code like const abcde1234f
            if (/(?:const|let|var|function|class)\s+$/.test(before)) return false;
            return /^[A-Z]{5}\d{4}[A-Z]$/i.test(match);
        }
    };

    /** Aadhaar-like: 12 digits, optionally space/dash separated in groups of 4 */
    const aadhaarDetector = {
        type: 'AADHAAR',
        pattern: /(?:aadhaar|aadhar|uidai)[^\d\n]{0,30}?(\b[2-9]\d{3}[\s\-]?\d{4}[\s\-]?\d{4}\b)|(\b[2-9]\d{3}[\s\-]?\d{4}[\s\-]?\d{4}\b)/gi,
        confidence: 0.92,
        description: 'Aadhaar 12-digit identifier',
        extractValue: (match) => {
            const m = /([2-9]\d{3}[\s\-]?\d{4}[\s\-]?\d{4})/.exec(match);
            return m ? m[1].trim() : match.trim();
        },
        validate: (match, text, start) => {
            // If the match itself includes explicit Aadhaar keyword, it is valid without before-context checks
            if (/aadhaar|aadhar|uidai/i.test(match)) {
                const m = /([2-9]\d{3}[\s\-]?\d{4}[\s\-]?\d{4})/.exec(match);
                if (!m) return false;
                const digits = m[1].replace(/[\s\-]/g, '');
                return digits.length === 12 && digits[0] !== '0' && digits[0] !== '1';
            }

            // For unanchored 12-digit numbers, look backward only within the current sentence (do not cross punctuation)
            const sentenceBoundary = Math.max(
                text.lastIndexOf('.', start),
                text.lastIndexOf('!', start),
                text.lastIndexOf('?', start),
                text.lastIndexOf('\n', start)
            );
            const checkStart = sentenceBoundary !== -1 ? Math.max(sentenceBoundary + 1, start - 30) : Math.max(0, start - 30);
            const before = text ? text.substring(checkStart, start).toLowerCase() : '';
            if (/(?:account|a\/c|acct|phone|mobile|call|tel|utr|txn|ref|\+)/i.test(before)) return false;

            const m = /([2-9]\d{3}[\s\-]?\d{4}[\s\-]?\d{4})/.exec(match);
            if (!m) return false;
            const digits = m[1].replace(/[\s\-]/g, '');
            if (digits.length !== 12) return false;
            if (digits[0] === '0' || digits[0] === '1') return false; // Aadhaar numbers start with 2-9
            return true;
        }
    };

    /** UPI ID: user@bankhandle or contextual UPI references */
    const upiDetector = {
        type: 'UPI',
        // Pattern 1: Known Indian bank & payment app UPI handles (e.g. user@okhdfcbank, user@paytm, user@axl)
        // Pattern 2: Contextual UPI patterns (e.g. "UPI ID: john.doe@mybank", "VPA: test@abc")
        pattern: /(?:(?:upi(?:\s*id)?|vpa|pay\s*to)[\s:=-]+([a-zA-Z0-9.\-_]{2,64}@[a-zA-Z]{2,32}))|\b([a-zA-Z0-9._\-]+@(?:upi|paytm|ybl|oksbi|okaxis|okicici|okhdfc|okhdfcbank|apl|ibl|sbi|axl|icici|hdfcbank|kotak|boi|pnb|federal|indus|idbi|citi|rbl|yes|dbs|sc|hsbc|axis|jio|freecharge|amazonpay|gpay|phonepe|slice|jupiter|fi|barodampay|postbank|aubank|cnrb|airtel|fbl)\b)/gi,
        confidence: 0.94,
        description: 'UPI ID (Virtual Payment Address)',
        extractValue: (match) => {
            const m = /(?:(?:upi(?:\s*id)?|vpa|pay\s*to)[\s:=-]+([a-zA-Z0-9.\-_]{2,64}@[a-zA-Z]{2,32}))|\b([a-zA-Z0-9._\-]+@(?:upi|paytm|ybl|oksbi|okaxis|okicici|okhdfc|okhdfcbank|apl|ibl|sbi|axl|icici|hdfcbank|kotak|boi|pnb|federal|indus|idbi|citi|rbl|yes|dbs|sc|hsbc|axis|jio|freecharge|amazonpay|gpay|phonepe|slice|jupiter|fi|barodampay|postbank|aubank|cnrb|airtel|fbl)\b)/i.exec(match);
            const val = m ? (m[1] || m[2]) : match;
            return val ? val.trim() : match;
        },
        validate: (match) => {
            const clean = match.replace(/^(?:upi(?:\s*id)?|vpa|pay\s*to)[\s:=-]+/i, '').trim();
            // Disqualify standard web email domains (which have a dot in the domain part like .com, .org)
            const parts = clean.split('@');
            if (parts.length !== 2) return false;
            const handle = parts[1].toLowerCase();
            // Standard emails end in .com, .in, .org, etc. Standard UPI handles do not have dots in the provider handle
            if (/\.(?:com|org|net|in|edu|gov|co|io|dev|app|ai)$/i.test(handle)) {
                return false;
            }
            return true;
        }
    };

    /** Bank account number: 9-18 digits with context keywords */
    const bankAccountDetector = {
        type: 'BANK_ACCOUNT',
        pattern: /(?:(?:a\/c|account|acct|acc|savings\s*a\/c|current\s*a\/c)[\s.:]*(?:no\.?|number|num|#)?[\s.:]*)([0-9]{9,18})\b|(?:transfer\s+(?:to\s+)?(?:account|a\/c)?[\s.:]*)([0-9]{9,18})\b/gi,
        confidence: 0.93,
        description: 'Bank account number',
        extractValue: (match) => {
            const m = /(?:(?:a\/c|account|acct|acc|savings\s*a\/c|current\s*a\/c)[\s.:]*(?:no\.?|number|num|#)?[\s.:]*)([0-9]{9,18})|(?:transfer\s+(?:to\s+)?(?:account|a\/c)?[\s.:]*)([0-9]{9,18})/i.exec(match);
            return m ? (m[1] || m[2]) : match;
        },
        validate: (match, text, start) => {
            const digits = match.replace(/\D/g, '');
            if (digits.length < 9 || digits.length > 18) return false;
            // Prevent matching if preceded by phone keywords
            const before = text ? text.substring(Math.max(0, start - 25), start).toLowerCase() : '';
            if (/(?:phone|mobile|cell|tel|call)/.test(before)) return false;
            return true;
        }
    };

    /** IFSC code: 4 letters + 0 + 6 alphanumeric, e.g. SBIN0001234 */
    const ifscDetector = {
        type: 'IFSC',
        pattern: /\b[A-Za-z]{4}0[A-Za-z0-9]{6}\b/g,
        confidence: 0.96,
        description: 'Indian IFSC code',
        extractValue: (match) => match.toUpperCase(),
        validate: (match) => /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(match)
    };

    /** Transaction Reference / UTR ID */
    const transactionIdDetector = {
        type: 'TRANSACTION_ID',
        pattern: /\b(?:(?:txn|transaction|trans|payment|ref|reference)[\s._-]*(?:id|no\.?|num|number|#)?[\s:=-]+)([A-Za-z0-9]{6,25})\b|\b((?:UTR|IMPS|NEFT|RTGS)[A-Za-z0-9]{10,22})\b|\b(?:UTR|IMPS|NEFT|RTGS)[\s:=-]+([A-Za-z0-9]{10,22})\b/gi,
        confidence: 0.92,
        description: 'Transaction Reference ID (UTR / IMPS / Txn ID)',
        extractValue: (match) => {
            const m = /\b(?:(?:txn|transaction|trans|payment|ref|reference)[\s._-]*(?:id|no\.?|num|number|#)?[\s:=-]+)([A-Za-z0-9]{6,25})\b|\b((?:UTR|IMPS|NEFT|RTGS)[A-Za-z0-9]{10,22})\b|\b(?:UTR|IMPS|NEFT|RTGS)[\s:=-]+([A-Za-z0-9]{10,22})\b/i.exec(match);
            return m ? (m[1] || m[2] || m[3]) : match;
        },
        validate: (match) => {
            const m = /\b(?:(?:txn|transaction|trans|payment|ref|reference)[\s._-]*(?:id|no\.?|num|number|#)?[\s:=-]+)([A-Za-z0-9]{6,25})\b|\b((?:UTR|IMPS|NEFT|RTGS)[A-Za-z0-9]{10,22})\b|\b(?:UTR|IMPS|NEFT|RTGS)[\s:=-]+([A-Za-z0-9]{10,22})\b/i.exec(match);
            if (!m) return false;
            const val = (m[1] || m[2] || m[3]).toLowerCase();
            // Must contain at least one digit to be a transaction ID
            if (!/\d/.test(val)) return false;
            // Reject common words
            const commonWords = new Set(['pending', 'completed', 'successful', 'success', 'failed', 'declined', 'processing', 'number', 'details']);
            return !commonWords.has(val);
        }
    };

    /** IP Address (IPv4 & IPv6) */
    const ipAddressDetector = {
        type: 'IP_ADDRESS',
        pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b|\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:[0-9a-fA-F]{1,4}\b/g,
        confidence: 0.94,
        description: 'IP Address (IPv4 / IPv6)',
        validate: (match, text, start) => {
            // Reject software versions like v1.2.3 or 1.0.0 if preceded by version keywords
            const before = text ? text.substring(Math.max(0, start - 15), start).toLowerCase() : '';
            if (/(?:version|v|ver|release)\s*[:=]?\s*$/i.test(before)) return false;
            // If IPv4, ensure octets are valid
            if (match.includes('.')) {
                const octets = match.split('.').map(Number);
                if (octets.length !== 4) return false;
                if (octets.some(o => isNaN(o) || o < 0 || o > 255)) return false;
            }
            return true;
        }
    };

    /** Credit/Debit card number: 13-19 digits, optionally grouped */
    const cardNumberDetector = {
        type: 'CARD_NUMBER',
        pattern: /\b(?:\d{4}[\s\-]?){3,4}\d{1,4}\b/g,
        confidence: 0.75,
        description: 'Credit/Debit card number',
        validate: (match) => {
            const digits = match.replace(/[\s\-]/g, '');
            if (digits.length < 13 || digits.length > 19) return false;
            return luhnCheck(digits);
        },
        adjustConfidence: (match) => {
            const digits = match.replace(/[\s\-]/g, '');
            return luhnCheck(digits) ? 0.95 : 0.60;
        }
    };

    /** API key / Secret: long alphanumeric strings with key-context or known prefixes */
    const apiKeyDetector = {
        type: 'API_KEY',
        pattern: /(?:(?:api[\s_-]?key|api[\s_-]?secret|access[\s_-]?key|secret|token)[\s:="']*(?:is\s*)?([A-Za-z0-9_./+\-]{12,}))|(?:\b(sk_live_[A-Za-z0-9_]{16,}|sk_test_[A-Za-z0-9_]{16,}|sk-proj-[A-Za-z0-9_\-]{12,}|sk-[A-Za-z0-9_\-]{20,}|ghp_[A-Za-z0-9]{30,}|AIzaSy[A-Za-z0-9_\-]{33})\b)/gi,
        confidence: 0.93,
        description: 'API Key / Secret / Access Token',
        extractValue: (match) => {
            const m = /(?:(?:api[\s_-]?key|api[\s_-]?secret|access[\s_-]?key|secret|token)[\s:="']*(?:is\s*)?([A-Za-z0-9_./+\-]{12,}))|(?:\b(sk_live_[A-Za-z0-9_]{16,}|sk_test_[A-Za-z0-9_]{16,}|sk-proj-[A-Za-z0-9_\-]{12,}|sk-[A-Za-z0-9_\-]{20,}|ghp_[A-Za-z0-9]{30,}|AIzaSy[A-Za-z0-9_\-]{33})\b)/i.exec(match);
            const val = m ? (m[1] || m[2]) : match;
            return val ? val.replace(/[.,;:!]+$/, '') : val;
        }
    };

    /** Password in context (matches any password like 123, 1234, 5896abcd, secret, etc.) */
    const passwordDetector = {
        type: 'PASSWORD',
        pattern: /\b(?:password|passwd|pwd)\b[\s:="']*(?:is\s*)?([^\s,.;]+)/gi,
        confidence: 0.88,
        description: 'Password',
        extractValue: (match) => {
            const m = /\b(?:password|passwd|pwd)\b[\s:="']*(?:is\s*)?([^\s,.;]+)/i.exec(match);
            return m ? m[1] : match;
        },
        validate: (match) => {
            const m = /\b(?:password|passwd|pwd)\b[\s:="']*(?:is\s*)?([^\s,.;]+)/i.exec(match);
            if (!m) return false;
            const val = m[1].toLowerCase();
            if (val.length <= 1) return false;
            if (val.startsWith('-')) return false;
            if (/^\[.*\]$/.test(val) || /^[A-Z_]+_\d+$/.test(val)) return false;

            const invalidVals = new Set([
                'and', 'or', 'in', 'the', 'to', 'is', 'for', 'not', 'like', 'your', 'my', 'our',
                'a', 'an', 'of', 'as', 'with', 'at', 'by', 'on', 'from', 'this', 'that',
                'protection', 'security', 'policy', 'reset', 'management', 'field', 'number', 'numbers',
                'aadhaar', 'pan', 'upi', 'pin', 'email', 'phone', 'card', 'account', 'prompt', 'prompts',
                'should', 'must', 'can', 'will', 'may', 'could', 'would',
                'manager', 'managers', 'details', 'detail',
                'private', 'public', 'confidential', 'secret', 'sensitive',
                'regularly', 'immediately', 'safely', 'securely', 'carefully',
                'change', 'changes', 'changed', 'update', 'updated', 'verify', 'verified'
            ]);
            return !invalidVals.has(val);
        }
    };

    /** Indian Postal PIN code: 6 digits (optionally near PIN keywords) */
    const pinCodeDetector = {
        type: 'PIN_CODE',
        pattern: /(?:(?:pin\s*code|pincode|postal\s*code|pin|zip|zip\s*code)[\s.:#-]*([1-9]\d{2}\s?\d{3})\b)|(?:\b([1-9]\d{2}\s?\d{3})\b)/gi,
        confidence: 0.85,
        description: 'Indian Postal PIN Code',
        extractValue: (match) => {
            const m = /([1-9]\d{2}\s?\d{3})/.exec(match);
            return m ? m[1].replace(/\s/g, '') : match;
        },
        validate: (match, text, start) => {
            if (start > 0 && /\d/.test(text[start - 1])) return false;
            const end = start + match.length;
            if (end < text.length && /\d/.test(text[end])) return false;
            const before = text.substring(Math.max(0, start - 30), start).toLowerCase();
            const hasContext = /(?:pin|pincode|postal|zip|address|delivery|city|nagar|road|flat|house)/.test(before);
            const digits = match.replace(/[\s\D]/g, '');
            if (digits.length !== 6) return false;
            return hasContext || !/^(?:100000|200000|123456)$/.test(digits);
        },
        adjustConfidence: (match, text, start) => {
            const before = text.substring(Math.max(0, start - 30), start).toLowerCase();
            return /(?:pin|pincode|postal|zip)/.test(before) ? 0.95 : 0.80;
        }
    };

    /** Indian Voter ID / EPIC: 3 uppercase letters followed by 7 digits */
    const voterIdDetector = {
        type: 'VOTER_ID',
        pattern: /\b[A-Za-z]{3}\d{7}\b/g,
        confidence: 0.94,
        description: 'Indian Voter ID (EPIC)',
        extractValue: (match) => match.toUpperCase()
    };

    /** House / Flat / Door Number in address context */
    const houseNoDetector = {
        type: 'HOUSE_NO',
        pattern: /\b(?:(?:house|flat|door|plot|apt|apartment|villa)[\s.:#\-]*(?:no\.?|number|num|#)?|h\.?\s*no\.?|d\.?\s*no\.?)[\s.:#\-]+(?!\b(?:no|number|num|and|the|is|in|at)\b)([A-Za-z0-9]+(?:[\/\-][A-Za-z0-9]+)*)\b/gi,
        confidence: 0.88,
        description: 'House / Flat / Door Number',
        extractValue: (match) => {
            const m = /(?:(?:house|flat|door|plot|apt|apartment|villa)[\s.:#\-]*(?:no\.?|number|num|#)?|h\.?\s*no\.?|d\.?\s*no\.?)[\s.:#\-]+(?!\b(?:no|number|num|and|the|is|in|at)\b)([A-Za-z0-9]+(?:[\/\-][A-Za-z0-9]+)*)/i.exec(match);
            return m ? m[1] : match;
        },
        validate: (match) => {
            const m = /(?:(?:house|flat|door|plot|apt|apartment|villa)[\s.:#\-]*(?:no\.?|number|num|#)?|h\.?\s*no\.?|d\.?\s*no\.?)[\s.:#\-]+(?!\b(?:no|number|num|and|the|is|in|at)\b)([A-Za-z0-9]+(?:[\/\-][A-Za-z0-9]+)*)/i.exec(match);
            if (!m) return false;
            const val = m[1].toLowerCase();
            if (val === 'no' || val === 'number' || val === 'num') return false;
            if (/^(?:house|flat|door|plot|apt|person|email|phone|password)_no_\d+$/i.test(val)) return false;
            return true;
        }
    };

    // ----- Luhn Algorithm for card validation -----
    function luhnCheck(num) {
        let sum = 0;
        let alt = false;
        for (let i = num.length - 1; i >= 0; i--) {
            let n = parseInt(num[i], 10);
            if (alt) {
                n *= 2;
                if (n > 9) n -= 9;
            }
            sum += n;
            alt = !alt;
        }
        return sum % 10 === 0;
    }

    // ----- Detector Registry -----
    const registry = [
        emailDetector,
        phoneDetector,
        panDetector,
        aadhaarDetector,
        upiDetector,
        bankAccountDetector,
        ifscDetector,
        transactionIdDetector,
        ipAddressDetector,
        cardNumberDetector,
        apiKeyDetector,
        passwordDetector,
        pinCodeDetector,
        voterIdDetector,
        houseNoDetector
    ];

    /**
     * Run all regex detectors against the input text.
     * Returns only entities that actually exist in the text.
     * @param {string} text - The user's input text
     * @returns {Detection[]} Array of detections
     */
    function detect(text) {
        if (!text || typeof text !== 'string') return [];

        const detections = [];

        for (const detector of registry) {
            const regex = new RegExp(detector.pattern.source, detector.pattern.flags);
            let match;

            while ((match = regex.exec(text)) !== null) {
                const start = match.index;
                const rawValue = match[0];
                const end = start + rawValue.length;

                // Run custom validation if defined
                if (detector.validate && !detector.validate(rawValue, text, start)) {
                    continue;
                }

                // Extract the meaningful value
                const value = detector.extractValue
                    ? detector.extractValue(rawValue)
                    : rawValue;

                // Adjust start and end to point directly to the extracted value if available
                let detStart = start;
                let detEnd = end;
                if (detector.extractValue && value && rawValue.includes(value)) {
                    const offset = rawValue.indexOf(value);
                    detStart = start + offset;
                    detEnd = detStart + value.length;
                }

                let confidence = detector.confidence;
                if (detector.adjustConfidence) {
                    confidence = detector.adjustConfidence(rawValue, text, start);
                }

                detections.push({
                    type: detector.type,
                    value: value,
                    rawMatch: rawValue,
                    start: detStart,
                    end: detEnd,
                    confidence: confidence,
                    source: 'regex',
                    description: detector.description
                });
            }
        }

        return detections;
    }

    /**
     * Get list of all registered detector types.
     * @returns {string[]}
     */
    function getRegisteredTypes() {
        return registry.map(d => d.type);
    }

    return { detect, getRegisteredTypes };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RegexDetectors;
}
