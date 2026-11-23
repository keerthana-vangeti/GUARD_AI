/* ============================================================
   Context Analyzer — Determines if detected entities are
   actually necessary for the user's specific task.

   Primary: Rule-based local analyzer (no external calls)
   Optional: LLM-assisted (sends only sanitized metadata)

   The same entity type can be necessary or unnecessary
   depending on the task context.
   Relevance does NOT automatically mean disclosure is safe!
   ============================================================ */

if (typeof require !== 'undefined') {
    if (typeof RiskClassifier === 'undefined') var RiskClassifier = require('./riskClassifier');
    if (typeof PrivacyPolicy === 'undefined') var PrivacyPolicy = require('./privacyPolicy');
}

const ContextAnalyzer = (() => {
    'use strict';

    /**
     * Task type keywords for classification.
     * Each task type has typical entity-necessity patterns.
     */
    const TASK_PATTERNS = {
        email: {
            keywords: ['email', 'mail', 'letter', 'message', 'write to', 'compose', 'send to', 'draft'],
            entityNecessity: {
                PERSON: { necessary: true, reason: 'The name is typically needed to identify the sender or recipient of the email.' },
                EMAIL: { necessary: true, reason: 'An email address may be needed for sending or referencing in the email.' },
                PHONE: { necessary: false, reason: 'A phone number is usually not required to compose an email.' },
                PAN: { necessary: false, reason: 'PAN information is not relevant to composing an email.' },
                AADHAAR: { necessary: false, reason: 'Aadhaar information is not relevant to composing an email.' },
                UPI: { necessary: false, reason: 'UPI payment information is not relevant to composing an email.' },
                BANK_ACCOUNT: { necessary: false, reason: 'Bank account details are not needed to compose an email.' },
                TRANSACTION_ID: { necessary: false, reason: 'Transaction reference is not needed to compose a general email.' },
                CARD_NUMBER: { necessary: false, reason: 'Card details are not relevant to composing an email.' },
                IFSC: { necessary: false, reason: 'IFSC code is not relevant to composing an email.' },
                ADDRESS: { necessary: false, reason: 'An address is usually not needed for a standard email.' },
                ORGANIZATION: { necessary: true, reason: 'The organization name may be relevant context for the email.' },
                API_KEY: { necessary: false, reason: 'API keys should never be included in emails.' },
                PASSWORD: { necessary: false, reason: 'Passwords should never be included in emails.' },
                IP_ADDRESS: { necessary: false, reason: 'IP address is not needed in email drafting.' }
            }
        },
        leave_application: {
            keywords: ['leave', 'absence', 'time off', 'vacation', 'sick leave', 'casual leave', 'day off'],
            entityNecessity: {
                PERSON: { necessary: true, reason: 'Your name is needed to identify who is requesting leave.' },
                EMAIL: { necessary: false, reason: 'An email address is not typically needed in a leave application body.' },
                PHONE: { necessary: false, reason: 'A phone number is not typically required in a leave application.' },
                PAN: { necessary: false, reason: 'PAN is completely unrelated to a leave request.' },
                AADHAAR: { necessary: false, reason: 'Aadhaar is not needed for a leave application.' },
                ORGANIZATION: { necessary: true, reason: 'The organization or department name may provide context.' },
                ADDRESS: { necessary: false, reason: 'Address is not relevant to a leave application.' },
                BANK_ACCOUNT: { necessary: false, reason: 'Bank account is not relevant to a leave application.' }
            }
        },
        financial: {
            keywords: ['payment', 'transfer', 'bank', 'transaction', 'invoice', 'billing', 'salary', 'tax', 'gst', 'return', 'refund', 'remittance', 'statement'],
            entityNecessity: {
                PERSON: { necessary: true, reason: 'The name identifies the account holder or payee in financial communications.' },
                // Sensitive financial identifiers MUST default to MASK:
                // An AI can generate reports, letters, and calculations using masked placeholders without exposing real customer account numbers.
                BANK_ACCOUNT: { necessary: false, reason: 'Raw bank account numbers are sensitive financial data. Masking (e.g. [BANK_ACCOUNT_1]) preserves privacy while allowing complete document generation.' },
                IFSC: { necessary: false, reason: 'IFSC identifies bank branch routing and can be masked to prevent correlating bank location.' },
                UPI: { necessary: false, reason: 'UPI payment handles are sensitive personal identifiers. Masking is recommended.' },
                PAN: { necessary: false, reason: 'PAN is an official tax identifier; masking protects user identity against external data retention.' },
                TRANSACTION_ID: { necessary: false, reason: 'Transaction reference is private financial data; masking is recommended.' },
                CARD_NUMBER: { necessary: false, reason: 'Payment card numbers are high-risk financial secrets and must never be exposed raw.' },
                PHONE: { necessary: false, reason: 'Phone number is usually not required for financial document generation.' },
                EMAIL: { necessary: false, reason: 'Email is usually not needed in the financial document itself.' }
            }
        },
        form_filling: {
            keywords: ['form', 'application', 'registration', 'enrollment', 'signup', 'apply', 'fill', 'correction form'],
            entityNecessity: {
                PERSON: { necessary: true, reason: 'Name is typically required on forms.' },
                EMAIL: { necessary: true, reason: 'Email may be required on the form.' },
                PHONE: { necessary: true, reason: 'Phone number may be required on the form.' },
                ADDRESS: { necessary: true, reason: 'Address may be required on the form.' },
                PAN: { necessary: false, reason: 'PAN should be masked unless specifically completing an official tax submission.' },
                AADHAAR: { necessary: false, reason: 'Aadhaar is a sensitive national ID; masking is recommended.' },
                ORGANIZATION: { necessary: true, reason: 'Organization details may be needed on the form.' }
            }
        },
        medical: {
            keywords: ['medical', 'health', 'doctor', 'hospital', 'prescription', 'diagnosis', 'patient', 'treatment', 'symptom'],
            entityNecessity: {
                PERSON: { necessary: false, reason: 'Patient name is not required for medical diagnosis or clinical AI consultation.' },
                PHONE: { necessary: false, reason: 'Contact number is not needed for medical advice.' },
                ADDRESS: { necessary: false, reason: 'Address is not needed for medical advice.' },
                PAN: { necessary: false, reason: 'PAN is not relevant to medical tasks.' },
                AADHAAR: { necessary: false, reason: 'Aadhaar is not needed for clinical advice.' },
                EMAIL: { necessary: false, reason: 'Email is not relevant to medical tasks.' }
            }
        },
        educational: {
            keywords: ['assignment', 'homework', 'study', 'explain', 'teach', 'learn', 'course', 'class', 'exam', 'photosynthesis', 'physics', 'chemistry', 'biology', 'math', 'history'],
            entityNecessity: {
                PERSON: { necessary: false, reason: 'Personal identity is not needed for an educational query.' },
                PHONE: { necessary: false, reason: 'Phone number is not relevant to an educational query.' },
                EMAIL: { necessary: false, reason: 'Email is not relevant to an educational query.' },
                PAN: { necessary: false, reason: 'PAN is not relevant to an educational query.' },
                AADHAAR: { necessary: false, reason: 'Aadhaar is not relevant to an educational query.' },
                ADDRESS: { necessary: false, reason: 'Address is not relevant to an educational query.' },
                ORGANIZATION: { necessary: false, reason: 'Organization is not relevant to an educational query.' }
            }
        },
        resume_cover: {
            keywords: ['resume', 'cv', 'curriculum vitae', 'cover letter', 'job application', 'portfolio'],
            entityNecessity: {
                PERSON: { necessary: true, reason: 'Your name is required on a resume or cover letter.' },
                EMAIL: { necessary: true, reason: 'Contact email is typically included on a resume.' },
                PHONE: { necessary: true, reason: 'Contact phone is typically included on a resume.' },
                ADDRESS: { necessary: true, reason: 'Address is often included on a resume.' },
                ORGANIZATION: { necessary: true, reason: 'Organization names are relevant for work history.' },
                PAN: { necessary: false, reason: 'PAN is not needed on a resume.' },
                AADHAAR: { necessary: false, reason: 'Aadhaar is not needed on a resume.' },
                BANK_ACCOUNT: { necessary: false, reason: 'Bank accounts should never appear on a resume.' }
            }
        },
        general: {
            keywords: [],
            entityNecessity: {
                PERSON: { necessary: false, reason: 'The task does not appear to specifically require personal identity.' },
                EMAIL: { necessary: false, reason: 'The task does not appear to specifically require an email address.' },
                PHONE: { necessary: false, reason: 'The task does not appear to specifically require a phone number.' },
                PAN: { necessary: false, reason: 'PAN is sensitive financial information and should not be shared.' },
                AADHAAR: { necessary: false, reason: 'Aadhaar is sensitive identity information and should not be shared.' },
                UPI: { necessary: false, reason: 'UPI information is not needed for this task.' },
                BANK_ACCOUNT: { necessary: false, reason: 'Bank account information is not needed for this task.' },
                TRANSACTION_ID: { necessary: false, reason: 'Transaction reference is not needed for this task.' },
                CARD_NUMBER: { necessary: false, reason: 'Card information must never be shared with AI services.' },
                IFSC: { necessary: false, reason: 'IFSC code is not needed for this task.' },
                ADDRESS: { necessary: false, reason: 'Address is unlikely to be needed for this task.' },
                ORGANIZATION: { necessary: false, reason: 'Organization name may not be needed for this task.' },
                API_KEY: { necessary: false, reason: 'API keys should not be shared with AI services.' },
                PASSWORD: { necessary: false, reason: 'Passwords should never be shared with AI services.' },
                IP_ADDRESS: { necessary: false, reason: 'IP address is not needed for this task.' }
            }
        }
    };

    /**
     * Classify the task type from the user's prompt.
     * @param {string} prompt - The user's original prompt
     * @returns {string} Task type key
     */
    function classifyTask(prompt) {
        const lower = prompt.toLowerCase();

        let bestMatch = 'general';
        let bestScore = 0;

        for (const [taskType, config] of Object.entries(TASK_PATTERNS)) {
            if (taskType === 'general') continue;

            let score = 0;
            for (const keyword of config.keywords) {
                if (lower.includes(keyword)) {
                    score += keyword.split(' ').length;
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = taskType;
            }
        }

        return bestMatch;
    }

    /**
     * Analyze detected entities against the task context and active privacy policy.
     * Returns structured analysis with defensible recommendations (KEEP, MASK, REMOVE).
     *
     * Rules:
     * - Relevance does NOT automatically mean disclosure is safe!
     * - Sensitive financial/identity identifiers always default to MASK or REMOVE.
     * - Strict mode enforces maximum redaction.
     * - KEEP requires both contextual necessity AND explicit policy permission.
     *
     * @param {string} prompt - User's original prompt
     * @param {Detection[]} detections - Detected entities
     * @returns {Object[]} Analysis results
     */
    function analyze(prompt, detections) {
        if (!detections || detections.length === 0) return [];

        const taskType = classifyTask(prompt);
        const taskConfig = TASK_PATTERNS[taskType];
        const analysis = [];

        // High-risk identifier types that must never default to KEEP regardless of task context
        const sensitiveIdentifiers = new Set([
            'BANK_ACCOUNT', 'CARD_NUMBER', 'AADHAAR', 'PAN',
            'UPI', 'TRANSACTION_ID', 'PASSWORD', 'API_KEY'
        ]);

        for (const det of detections) {
            const placeholder = `[${det.type}_${det._placeholderIndex || 1}]`;

            // Look up necessity for this entity type in this task context
            const necessity = (taskConfig.entityNecessity && taskConfig.entityNecessity[det.type])
                || TASK_PATTERNS.general.entityNecessity[det.type]
                || { necessary: false, reason: 'This type of information does not appear to be needed for the identified task.' };

            const policyDefault = PrivacyPolicy.getDefaultAction(det.type);
            const canUserKeep = PrivacyPolicy.canKeep(det.type);
            const isNever = PrivacyPolicy.isNeverTransmit(det.type);
            const currentMode = PrivacyPolicy.getMode();

            let recommendation;
            let finalReason = necessity.reason;

            // Rule 1: CRITICAL / Never-transmit items are always REMOVED
            if (isNever) {
                recommendation = 'REMOVE';
                finalReason = `${det.type} is classified as critical security/credential data and cannot be transmitted to external AI services.`;
            }
            // Rule 2: If the current privacy mode strictly disallows KEEP
            else if (!canUserKeep) {
                recommendation = (policyDefault === 'REMOVE' || currentMode === 'strict') ? 'REMOVE' : 'MASK';
                finalReason = `In ${currentMode.toUpperCase()} privacy mode, ${det.type} must be ${recommendation.toLowerCase()}ed to prevent data exposure.`;
            }
            // Rule 3: Sensitive financial and identity identifiers must default to MASK (not KEEP)
            // Even in financial tasks, the task can be completed using placeholders without exposing raw values.
            else if (sensitiveIdentifiers.has(det.type)) {
                recommendation = 'MASK';
                finalReason = `Although relevant to the ${taskType} context, masking protects sensitive financial/identity data from external AI transmission while allowing the document to be drafted.`;
            }
            // Rule 4: If contextually necessary AND policy allows KEEP (e.g. PERSON in leave application or resume)
            else if (necessity.necessary && canUserKeep && policyDefault === 'KEEP') {
                recommendation = 'KEEP';
                finalReason = necessity.reason;
            }
            // Rule 5: Fallback to policy default
            else {
                recommendation = policyDefault || 'MASK';
            }

            analysis.push({
                placeholder: det._placeholder || placeholder,
                type: det.type,
                value: det.value,
                necessary: necessity.necessary,
                reason: finalReason,
                recommendation: recommendation,
                taskType: taskType,
                risk: det.risk
            });
        }

        return analysis;
    }

    /**
     * Get a human-readable task description.
     */
    function getTaskDescription(taskType) {
        const descriptions = {
            email: 'Writing/composing an email',
            leave_application: 'Leave application or absence request',
            financial: 'Financial task (payment, tax, banking)',
            form_filling: 'Form filling or application',
            medical: 'Medical/health related task',
            educational: 'Educational or learning query',
            resume_cover: 'Resume or cover letter',
            general: 'General task'
        };
        return descriptions[taskType] || 'General task';
    }

    return {
        analyze,
        classifyTask,
        getTaskDescription,
        TASK_PATTERNS
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ContextAnalyzer;
}
