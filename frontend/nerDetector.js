/* ============================================================
   NER Detector — Local Named Entity Recognition
   Uses Transformers.js (Xenova) for in-browser NER.
   Falls back to heuristic detection if model cannot load.
   ============================================================ */

const NERDetector = (() => {
    'use strict';

    let pipeline = null;
    let isLoading = false;
    let isAvailable = false;
    let loadError = null;
    let useFallback = false;

    // NER label → entity type mapping (BERT-base-NER labels)
    const labelMap = {
        'B-PER': 'PERSON',
        'I-PER': 'PERSON',
        'B-LOC': 'ADDRESS',
        'I-LOC': 'ADDRESS',
        'B-ORG': 'ORGANIZATION',
        'I-ORG': 'ORGANIZATION',
        'B-MISC': 'MISC',
        'I-MISC': 'MISC'
    };

    /**
     * Attempt to load the Transformers.js NER pipeline.
     * This is called once at startup. If it fails, we fall back to heuristics.
     * @returns {Promise<boolean>} Whether the model loaded successfully
     */
    async function initialize() {
        if (isAvailable || isLoading) return isAvailable;
        isLoading = true;

        try {
            // Dynamically import Transformers.js from CDN
            const { pipeline: createPipeline } = await import(
                'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2'
            );

            // Load the NER pipeline with a small model
            pipeline = await createPipeline(
                'token-classification',
                'Xenova/bert-base-NER',
                { quantized: true } // Use quantized model for smaller size
            );

            isAvailable = true;
            isLoading = false;
            return true;
        } catch (err) {
            console.warn('[NERDetector] Model failed to load, using heuristic fallback:', err.message);
            loadError = err.message;
            useFallback = true;
            isLoading = false;
            return false;
        }
    }

    /**
     * Run NER detection using the loaded model.
     * @param {string} text
     * @returns {Promise<Detection[]>}
     */
    async function detectWithModel(text) {
        if (!pipeline) return [];

        try {
            const results = await pipeline(text, { ignore_labels: ['O'] });

            // Group consecutive tokens of the same entity
            const entities = [];
            let current = null;

            for (const token of results) {
                const entityType = labelMap[token.entity] || null;
                if (!entityType) continue;

                const isBegin = token.entity.startsWith('B-');
                const isContinue = token.entity.startsWith('I-');

                if (isBegin || (isContinue && (!current || current.type !== entityType))) {
                    // Start new entity
                    if (current) entities.push(current);
                    current = {
                        type: entityType,
                        value: token.word.replace(/^##/, ''),
                        start: token.start,
                        end: token.end,
                        confidence: token.score,
                        source: 'ner'
                    };
                } else if (isContinue && current && current.type === entityType) {
                    // Extend current entity
                    const word = token.word.replace(/^##/, '');
                    // Handle subword tokens (starting with ##)
                    if (token.word.startsWith('##')) {
                        current.value += word;
                    } else {
                        current.value += ' ' + word;
                    }
                    current.end = token.end;
                    // Average confidence across tokens
                    current.confidence = (current.confidence + token.score) / 2;
                }
            }

            if (current) entities.push(current);

            // Clean up values: extract actual text from input using positions
            return entities.map(e => ({
                type: e.type,
                value: text.substring(e.start, e.end).trim(),
                start: e.start,
                end: e.end,
                confidence: Math.round(e.confidence * 100) / 100,
                source: 'ner',
                description: `${e.type} (NER)`
            }));
        } catch (err) {
            console.error('[NERDetector] Model inference failed:', err);
            return heuristicDetect(text);
        }
    }

    /**
     * Heuristic NER fallback — simple pattern-based name/address detection.
     * This is NOT as accurate as ML-based NER but provides basic coverage.
     * @param {string} text
     * @returns {Detection[]}
     */
    function heuristicDetect(text) {
        const detections = [];

        // --- Person names ---
        // Look for patterns like "my name is X", "I am X", "this is X", "for X", "from: X"
        const namePatterns = [
            // "my/his/her/their name(s) is/are X", "i am X", "this is X", "myself X"
            /(?:(?:my|his|her|their|our|your)\s+(?:names?|friend(?:'?s)?\s+names?|sister(?:'?s)?\s+names?|brother(?:'?s)?\s+names?)\s+(?:is|are)|(?:my|his|her|their|our|your)\s+(?:friend(?:'?s)?|sister(?:'?s)?|brother(?:'?s)?|mother(?:'?s)?|father(?:'?s)?|colleague(?:'?s)?|classmate(?:'?s)?)\s+(?:names?\s+(?:is|are)|(?:is|are))|my\s+name\s+is|i\s+am|i'm|name\s*[:=]\s*|this\s+is|myself)\s+([a-zA-Z][a-zA-Z.]*(?:\s+[a-zA-Z][a-zA-Z.]*){0,10})/gi,
            // "friends/friends' names are X and Y and Z"
            /(?:(?:friend(?:'?s)?|friends'?)\s+names?\s+(?:is|are))\s+([a-zA-Z]+(?:(?:\s+(?:and|&)\s+|\s*,\s*|\s+)[a-zA-Z]+){0,5})/gi,
            // Titles: customer, client, patient, user, applicant, student, account holder, friend
            /\b(?:customer|client|patient|user|applicant|student|account\s+holder|holder|friend|classmate|colleague)\s*[:=]?\s+([A-Za-z][A-Za-z.]*(?:\s+[A-Za-z][A-Za-z.]*){0,2})/gi,
            // Formal titles: Dr., Prof. with optional initial like "V." or "M."
            /\b(?:dr\.?|doctor|prof\.?)\s+(?:[A-Za-z]\.?\s+)?([A-Za-z][A-Za-z.]*(?:\s+[A-Za-z][A-Za-z.]*){0,2})/gi,
            // Honorifics: Mr., Mrs., Ms., Shri, Smt (with optional initials)
            /\b(?:mr\.?|mrs\.?|ms\.?|shri|smt)\.?\s+(?:[A-Za-z]\.?\s+)?([A-Za-z][A-Za-z.]*(?:\s+[A-Za-z][A-Za-z.]*){0,2})/gi,
            /\b(?:dear|hi|hello|hey|from|by)\s*[:=]?\s+([A-Za-z][A-Za-z.]*(?:\s+[A-Za-z][A-Za-z.]*){0,2})/gi,
            // "for Capitalized_Name"
            /\b(?:for)\s*[:=]?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g,
            // Letter patterns: "draft a letter for X"
            /\b(?:draft|write|create|send)\s+(?:an?\s+)?(?:[a-zA-Z]+\s+){0,3}(?:letter|application|email|statement|document)\s+(?:for|by|of)\s+([A-Za-z][A-Za-z.]*(?:\s+[A-Za-z][A-Za-z.]*){0,2})/gi,
            // Standalone initial-dot names: "M.Shruthi", "V. Madhu Reddy"
            /\b([A-Z]\.\s?[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g,
            // Closings & Signatures: "Regards, Keerthana", "Sincerely, Rahul Sharma", "Candidate: Keerthana"
            /\b(?:regards|sincerely|faithfully|warmly|applicant|candidate|submitted\s+by|issued\s+to|certify\s+that)[\s:,]*\n?\s*([A-Z][a-zA-Z.]*(?:\s+[A-Z][a-zA-Z.]*){0,2})/gi
        ];

        // Words that explicitly disqualify a candidate from being a person's name
        const nonNameWords = new Set([
            'my', 'your', 'his', 'her', 'our', 'their', 'its',
            'i', 'me', 'we', 'us', 'you', 'he', 'she', 'it', 'they', 'them',
            'is', 'am', 'are', 'was', 'were', 'be', 'been',
            'the', 'a', 'an', 'this', 'that', 'these', 'those',
            'gmail', 'email', 'mail', 'yahoo', 'outlook', 'inbox', 'phone', 'mobile', 'call', 'contact',
            'address', 'account', 'password', 'pwd', 'pass', 'query', 'question',
            'letter', 'leave', 'fever', 'college', 'school', 'draft', 'write', 'no', 'number', 'name', 'names', 'friend', 'friends',
            'science', 'computer', 'engineering', 'technology', 'developer', 'project', 'education', 'sc', 'tech', 'bca', 'mca', 'bba', 'mba', 'b.sc', 'm.sc', 'b.tech', 'm.tech', 'ph.d',
            'details', 'transfer', 'help', 'verification', 'reference', 'sbi', 'bank', 'branch', 'statement', 'hdfc', 'icici',
            // Common verbs & prepositions that appear after names and should not be captured
            'works', 'worked', 'working', 'lives', 'lived', 'living', 'goes', 'went', 'going',
            'signed', 'sent', 'called', 'said', 'told', 'asked', 'joined', 'left',
            'at', 'in', 'on', 'of', 'to', 'from', 'with', 'about', 'treated'
        ]);

        // Common words and job titles that should NOT be detected as names
        const commonWords = new Set([
            'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
            'her', 'was', 'one', 'our', 'out', 'my', 'day', 'get', 'has', 'him', 'his',
            'how', 'its', 'may', 'new', 'now', 'old', 'see', 'way', 'who', 'did',
            'got', 'let', 'say', 'she', 'too', 'use', 'write', 'leave', 'email',
            'professor', 'sir', 'madam', 'please', 'kindly', 'need', 'days',
            'manager', 'boss', 'director', 'lead', 'hr', 'supervisor', 'team',
            'colleague', 'employee', 'admin', 'user', 'client', 'customer',
            'recruiter', 'interviewer', 'management', 'department', 'company',
            'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
            'january', 'february', 'march', 'april', 'june', 'july', 'august',
            'september', 'october', 'november', 'december', 'urgent', 'important',
            'subject', 'dear', 'regards', 'thanks', 'thank', 'account', 'school', 'students', 'quantum', 'phone', 'mobile', 'is', 'number', 'no',
            'gmail', 'mail', 'college', 'fever', 'letter', 'draft', 'name', 'names', 'friend', 'friends'
        ]);

        for (const pattern of namePatterns) {
            const regex = new RegExp(pattern.source, pattern.flags);
            let match;
            while ((match = regex.exec(text)) !== null) {
                const rawCaptured = match[1].trim();
                // Split multi-name phrases joined by conjunctions or prepositions
                const candidateNames = rawCaptured.split(/\s+(?:and|&|to|for|from|with|at|in|about|regarding|password|pwd)\s+|,\s*/i);

                for (const nameCandidate of candidateNames) {
                    let name = nameCandidate.trim();
                    if (name.length < 2) continue;

                    // Strip trailing non-name words (verbs, prepositions)
                    let words = name.split(/\s+/);
                    while (words.length > 1 && nonNameWords.has(words[words.length - 1].toLowerCase())) {
                        words.pop();
                    }
                    // Strip leading non-name words
                    while (words.length > 1 && nonNameWords.has(words[0].toLowerCase())) {
                        words.shift();
                    }
                    name = words.join(' ');
                    if (name.length < 2) continue;

                    // Disqualify if any remaining word is a pronoun, auxiliary verb, or non-name keyword
                    if (words.some(w => nonNameWords.has(w.toLowerCase()))) continue;
                    const isCommon = words.every(w => commonWords.has(w.toLowerCase()));
                    if (isCommon) continue;

                    // Find the actual position of the captured name in the full text
                    const nameStart = text.indexOf(name, match.index);
                    if (nameStart === -1) continue;

                    // Prevent duplicate entries
                    if (detections.some(d => d.type === 'PERSON' && d.start === nameStart)) continue;

                    detections.push({
                        type: 'PERSON',
                        value: name,
                        start: nameStart,
                        end: nameStart + name.length,
                        confidence: 0.75,
                        source: 'ner-heuristic',
                        description: 'Person name (heuristic)'
                    });
                }
            }
        }

        // --- Document Header Standalone Name Detection ---
        // On resumes, CVs, ID cards, and certificates, the person's name is typically the top standalone header.
        const headerLines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        const docHeaderBlacklist = new Set([
            'curriculum', 'vitae', 'resume', 'summary', 'profile', 'objective', 'education',
            'experience', 'projects', 'skills', 'contact', 'declaration', 'certificate', 'transcript',
            'developer', 'engineer', 'analyst', 'manager', 'lead', 'consultant', 'architect',
            'software', 'hardware', 'computer', 'science', 'technology', 'technologies', 'information',
            'college', 'university', 'school', 'institute', 'department', 'campus', 'board',
            'hospital', 'hospitals', 'clinic', 'medical', 'center', 'centre',
            'bachelor', 'master', 'degree', 'diploma', 'course', 'stream', 'intermediate',
            'company', 'corporation', 'limited', 'pvt', 'ltd', 'inc', 'solutions', 'services', 'systems',
            'flat', 'heights', 'road', 'street', 'nagar', 'colony', 'enclave', 'apartment', 'apartments',
            'project', 'report', 'assignment', 'internship', 'intern', 'trainee', 'fresher',
            'languages', 'frameworks', 'tools', 'database', 'databases', 'frontend', 'backend',
            'phone', 'email', 'address', 'linkedin', 'github', 'portfolio', 'website',
            'dear', 'subject', 'hello', 'regards', 'sincerely', 'thanks', 'confidential'
        ]);

        for (let i = 0; i < Math.min(3, headerLines.length); i++) {
            const hLine = headerLines[i];
            if (/^(?:curriculum\s+vitae|resume|cv|biodata|bio-data)$/i.test(hLine)) continue;

            const hClean = hLine.replace(/[^a-zA-Z\s.]/g, '').trim();
            const hWords = hClean.split(/\s+/).filter(w => w.length > 1);

            if (hWords.length >= 2 && hWords.length <= 3) {
                const hasBlacklist = hWords.some(w => docHeaderBlacklist.has(w.toLowerCase()) || nonNameWords.has(w.toLowerCase()));
                if (!hasBlacklist) {
                    const isCapitalized = hWords.every(w => /^[A-Z]/.test(w));
                    if (isCapitalized) {
                        const hStart = text.indexOf(hLine);
                        if (hStart !== -1 && !detections.some(d => d.type === 'PERSON' && d.start === hStart)) {
                            detections.push({
                                type: 'PERSON',
                                value: hLine,
                                start: hStart,
                                end: hStart + hLine.length,
                                confidence: 0.85,
                                source: 'ner-doc-header',
                                description: 'Person name (document header)'
                            });
                        }
                    }
                }
            }
            break;
        }

        // --- Addresses ---
        // Look for Indian-style address patterns
        const addressPatterns = [
            /(?:address|addr|located\s+at|lives?\s+at|residing\s+at)[\s:]*(.{3,80}?)(?:\.|,\s*(?:pin|zip|phone|email|and)|$)/gi,
            /\b(\d{1,5}[,\s]+(?:[A-Z][a-zA-Z]+[\s,]+){2,}(?:road|street|lane|nagar|colony|block|sector|phase|area|city|town|district|state|village)\b.{0,40})/gi,
            /\b(Bangalore|Bengaluru|Mumbai|Delhi|Hyderabad|Chennai|Kolkata|Pune|Ahmedabad|Jaipur)\b/g
        ];

        for (const pattern of addressPatterns) {
            const regex = new RegExp(pattern.source, pattern.flags);
            let match;
            while ((match = regex.exec(text)) !== null) {
                const addr = (match[1] || match[0]).trim();
                if (addr.length < 3) continue;

                detections.push({
                    type: 'ADDRESS',
                    value: addr,
                    start: match.index,
                    end: match.index + match[0].length,
                    confidence: 0.65,
                    source: 'ner-heuristic',
                    description: 'Address (heuristic)'
                });
            }
        }

        // --- Organizations ---
        const orgPatterns = [
            /\b(?:company|organization|employer|work\s+at)[\s:]+([A-Z][A-Za-z0-9\s&.]+(?:Ltd\.?|Inc\.?|Corp\.?|Pvt\.?|Limited|Private|Technologies|Solutions|Services|Bank|University|College|Institute|Hospital)?)/g,
            /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+(?:Ltd\.?|Inc\.?|Corp\.?|Pvt\.?\s*Ltd\.?|Limited|Private\s+Limited|Technologies|Solutions|Services|Bank|University|College|Institute|Hospital))\b/g
        ];

        for (const pattern of orgPatterns) {
            const regex = new RegExp(pattern.source, pattern.flags);
            let match;
            while ((match = regex.exec(text)) !== null) {
                const org = (match[1] || match[0]).trim();
                if (org.length < 3) continue;

                const orgStart = text.indexOf(org, match.index);
                if (orgStart === -1) continue;

                detections.push({
                    type: 'ORGANIZATION',
                    value: org,
                    start: orgStart,
                    end: orgStart + org.length,
                    confidence: 0.70,
                    source: 'ner-heuristic',
                    description: 'Organization (heuristic)'
                });
            }
        }

        return detections;
    }

    /**
     * Main detection entry point.
     * Uses model if available, falls back to heuristics.
     * @param {string} text
     * @returns {Promise<Detection[]>}
     */
    async function detect(text) {
        if (!text || typeof text !== 'string') return [];

        if (isAvailable && pipeline) {
            return detectWithModel(text);
        }

        // Fallback to heuristic
        return heuristicDetect(text);
    }

    /**
     * Get current NER status.
     * @returns {{ available: boolean, loading: boolean, useFallback: boolean, error: string|null }}
     */
    function getStatus() {
        return {
            available: isAvailable,
            loading: isLoading,
            useFallback: useFallback,
            error: loadError
        };
    }

    return {
        initialize,
        detect,
        getStatus,
        heuristicDetect
    };
})();
