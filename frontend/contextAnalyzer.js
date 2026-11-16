/* ============================================================
   Context Analyzer — Determines if detected entities are
   actually necessary for the user's specific task.

   Primary: Rule-based local analyzer (no external calls)
   Optional: LLM-assisted (sends only sanitized metadata)

   The same entity type can be necessary or unnecessary
   depending on the task context.
   ============================================================ */

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
                CARD_NUMBER: { necessary: false, reason: 'Card details are not relevant to composing an email.' },
                IFSC: { necessary: false, reason: 'IFSC code is not relevant to composing an email.' },
                ADDRESS: { necessary: false, reason: 'An address is usually not needed for a standard email.' },
                ORGANIZATION: { necessary: true, reason: 'The organization name may be relevant context for the email.' },
                API_KEY: { necessary: false, reason: 'API keys should never be included in emails.' },
                PASSWORD: { necessary: false, reason: 'Passwords should never be included in emails.' }
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
                ADDRESS: { necessary: false, reason: 'Address is not relevant to a leave application.' }
            }
        },
        financial: {
            keywords: ['payment', 'transfer', 'bank', 'transaction', 'invoice', 'billing', 'salary', 'tax', 'gst', 'return', 'refund'],
            entityNecessity: {
                PERSON: { necessary: true, reason: 'The name may be needed to identify the account holder or payee.' },
                BANK_ACCOUNT: { necessary: true, reason: 'Bank account details may be relevant to the financial task.' },
                IFSC: { necessary: true, reason: 'IFSC code may be needed for the financial transaction.' },
                UPI: { necessary: true, reason: 'UPI ID may be relevant for the payment task.' },
                PAN: { necessary: true, reason: 'PAN may be needed for tax-related financial tasks.' },
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
                PAN: { necessary: true, reason: 'PAN may be required on tax or official forms.' },
                AADHAAR: { necessary: true, reason: 'Aadhaar may be required for identity verification on the form.' },
                ORGANIZATION: { necessary: true, reason: 'Organization details may be needed on the form.' }
            }
        },
        medical: {
            keywords: ['medical', 'health', 'doctor', 'hospital', 'prescription', 'diagnosis', 'patient', 'treatment', 'symptom'],
            entityNecessity: {
                PERSON: { necessary: true, reason: 'Patient name is typically needed for medical records.' },
                PHONE: { necessary: true, reason: 'Contact number may be needed for medical records.' },
                ADDRESS: { necessary: true, reason: 'Address may be needed for medical records.' },
                PAN: { necessary: false, reason: 'PAN is not typically relevant to medical tasks.' },
                AADHAAR: { necessary: true, reason: 'Aadhaar may be used for identity in medical systems.' },
                EMAIL: { necessary: false, reason: 'Email is usually not central to the medical task.' }
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
                AADHAAR: { necessary: false, reason: 'Aadhaar is not needed on a resume.' }
            }
        },
        general: {
            keywords: [],
            entityNecessity: {
                PERSON: { necessary: false, reason: 'The task does not appear to specifically require personal identity.' },
                EMAIL: { necessary: false, reason: 'The task does not appear to specifically require an email address.' },
                PHONE: { necessary: false, reason: 'The task does not appear to specifically require a phone number.' },
                PAN: { necessary: false, reason: 'PAN is sensitive financial information and is unlikely to be needed for this task.' },
                AADHAAR: { necessary: false, reason: 'Aadhaar is sensitive identity information and is unlikely to be needed for this task.' },
                UPI: { necessary: false, reason: 'UPI information is unlikely to be needed for this task.' },
                BANK_ACCOUNT: { necessary: false, reason: 'Bank account information is unlikely to be needed for this task.' },
                CARD_NUMBER: { necessary: false, reason: 'Card information is unlikely to be needed for this task.' },
                IFSC: { necessary: false, reason: 'IFSC code is unlikely to be needed for this task.' },
                ADDRESS: { necessary: false, reason: 'Address is unlikely to be needed for this task.' },
                ORGANIZATION: { necessary: false, reason: 'Organization name may not be needed for this task.' },
                API_KEY: { necessary: false, reason: 'API keys should not be shared with AI services.' },
                PASSWORD: { necessary: false, reason: 'Passwords should never be shared with AI services.' }
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

        // Score each task type by keyword matches
        let bestMatch = 'general';
        let bestScore = 0;

        for (const [taskType, config] of Object.entries(TASK_PATTERNS)) {
            if (taskType === 'general') continue;

            let score = 0;
            for (const keyword of config.keywords) {
                if (lower.includes(keyword)) {
                    score += keyword.split(' ').length; // Multi-word keywords score higher
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
     * Analyze detected entities against the task context.
     * Returns structured analysis for each entity.
     *
     * This does NOT hard-code results — it dynamically analyzes
     * based on the actual task and entities found.
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

        for (const det of detections) {
            // Get the placeholder that was/will be created
            const placeholder = `[${det.type}_${det._placeholderIndex || 1}]`;

            // Look up necessity for this entity type in this task context
            const necessity = taskConfig.entityNecessity[det.type]
                || TASK_PATTERNS.general.entityNecessity[det.type]
                || { necessary: false, reason: 'This type of information does not appear to be needed for the identified task.' };

            // Determine recommendation based on necessity + risk + policy
            let recommendation;
            if (necessity.necessary) {
                recommendation = 'KEEP';
            } else if (RiskClassifier.isAtLeast(det.risk, 'HIGH')) {
                recommendation = 'REMOVE';
            } else {
                // Medium/Low risk items: recommend MASK (replace with placeholder) instead of full removal
                recommendation = 'MASK';
            }

            // Override with policy defaults
            const policyDefault = PrivacyPolicy.getDefaultAction(det.type);
            if (!necessity.necessary && policyDefault === 'REMOVE') {
                recommendation = 'REMOVE';
            }

            // CRITICAL items: force REMOVE unless explicitly necessary
            if (PrivacyPolicy.isNeverTransmit(det.type)) {
                recommendation = 'REMOVE';
            }

            analysis.push({
                placeholder: det._placeholder || placeholder,
                type: det.type,
                value: det.value,
                necessary: necessity.necessary,
                reason: necessity.reason,
                recommendation: recommendation,
                taskType: taskType,
                risk: det.risk
            });
        }

        return analysis;
    }

    /**
     * Get a human-readable task description.
     * @param {string} taskType
     * @returns {string}
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
        getTaskDescription
    };
})();
