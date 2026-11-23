/* ============================================================
   NER Detector — Local Named Entity Recognition
   Uses Transformers.js (Xenova) for in-browser NER when available.
   Falls back to high-coverage heuristic detection if model cannot load
   or when running in headless / test environments.
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
     * Called at startup. If it fails, falls back to deterministic heuristics.
     */
    async function initialize() {
        if (isAvailable || isLoading) return isAvailable;
        if (typeof window === 'undefined') {
            useFallback = true;
            return false;
        }

        isLoading = true;

        try {
            const { pipeline: createPipeline } = await import(
                'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2'
            );

            pipeline = await createPipeline(
                'token-classification',
                'Xenova/bert-base-NER',
                { quantized: true }
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
     * Run NER detection using Transformers.js model.
     */
    async function detectWithModel(text) {
        if (!pipeline) return heuristicDetect(text);

        try {
            const results = await pipeline(text, { ignore_labels: ['O'] });
            const entities = [];
            let current = null;

            for (const token of results) {
                const entityType = labelMap[token.entity] || null;
                if (!entityType) continue;

                const isBegin = token.entity.startsWith('B-');
                const isContinue = token.entity.startsWith('I-');

                if (isBegin || (isContinue && (!current || current.type !== entityType))) {
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
                    const word = token.word.replace(/^##/, '');
                    if (token.word.startsWith('##')) {
                        current.value += word;
                    } else {
                        current.value += ' ' + word;
                    }
                    current.end = token.end;
                    current.confidence = (current.confidence + token.score) / 2;
                }
            }

            if (current) entities.push(current);

            const modelResults = entities.map(e => ({
                type: e.type,
                value: text.substring(e.start, e.end).trim(),
                start: e.start,
                end: e.end,
                confidence: Math.round(e.confidence * 100) / 100,
                source: 'ner',
                description: `${e.type} (NER)`
            }));

            // Merge with deterministic heuristic results for high recall
            const heuristicResults = heuristicDetect(text);
            const combined = [...modelResults];
            for (const hr of heuristicResults) {
                const overlaps = combined.some(mr =>
                    (hr.start < mr.end && hr.end > mr.start)
                );
                if (!overlaps) {
                    combined.push(hr);
                }
            }
            return combined;
        } catch (err) {
            console.error('[NERDetector] Model inference failed:', err);
            return heuristicDetect(text);
        }
    }

    /**
     * Heuristic NER — High-coverage deterministic pattern detection
     * for Names, Residential Addresses, and Organizations.
     */
    function heuristicDetect(text) {
        if (!text || typeof text !== 'string') return [];
        const detections = [];

        // Words that explicitly disqualify a candidate from being a person's name
        const nonNameWords = new Set([
            'my', 'your', 'his', 'her', 'our', 'their', 'its',
            'i', 'me', 'we', 'us', 'you', 'he', 'she', 'it', 'they', 'them',
            'is', 'am', 'are', 'was', 'were', 'be', 'been',
            'the', 'a', 'an', 'this', 'that', 'these', 'those',
            'gmail', 'email', 'mail', 'yahoo', 'outlook', 'inbox', 'phone', 'mobile', 'call', 'contact',
            'address', 'account', 'password', 'pwd', 'pass', 'query', 'question',
            'letter', 'leave', 'fever', 'college', 'school', 'draft', 'write', 'no', 'number', 'name', 'names',
            'science', 'computer', 'engineering', 'technology', 'developer', 'project', 'education',
            'details', 'transfer', 'help', 'verification', 'reference', 'sbi', 'bank', 'branch', 'statement', 'hdfc', 'icici',
            'at', 'in', 'on', 'of', 'to', 'from', 'with', 'about', 'regarding', 'paid', 'sent', 'using', 'due', 'for',
            'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
            'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
            'report', 'summary', 'prescription', 'hospital', 'diagnosis', 'treatment', 'salary', 'income', 'tax', 'bill',
            'pan', 'aadhaar', 'aadhar', 'upi', 'ifsc', 'card', 'utr', 'imps', 'neft', 'id', 'pincode', 'code', 'pin', 'zip'
        ]);

        // --- 1. Person Names ---
        const namePatterns = [
            // Explicit Context Labels: "Name: Rahul Sharma", "Payee: Priya Sundaram", "Employee: Vikram Seth", etc.
            /\b(?:name|employee|candidate|applicant|patient|payee|recipient|customer|client|student|account\s+holder|user)\s*[:=]\s*([A-Za-z][A-Za-z.]*(?:\s+[A-Za-z][A-Za-z.]*){1,3})\b/gi,
            // "my name is X", "i am X", "this is X", "myself X"
            /\b(?:my\s+name\s+is|i\s+am|i'm|this\s+is|myself)\s+([A-Za-z][A-Za-z.]*(?:\s+[A-Za-z][A-Za-z.]*){0,2})\b/gi,
            // Formal Titles & Honorifics: "Dr. Rajesh Gupta", "Prof. Amit Verma", "Mr. Anand Kumar", "Mrs. Lakshmi Devi", "Ms. Shruthi"
            /\b(?:dr\.?|doctor|prof\.?|mr\.?|mrs\.?|ms\.?|shri|smt\.?)\s+([A-Za-z][A-Za-z.]*(?:\s+[A-Za-z][A-Za-z.]*){0,2})\b/gi,
            // Salutations: "Dear Rahul Sharma", "Hi Priya,"
            /\b(?:dear|hi|hello|hey)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})[,:\s]/g,
            // Signatures & Closings: "Regards, Keerthana", "Sincerely, Rahul Sharma", "Submitted by: Vikram"
            /\b(?:regards|sincerely|faithfully|warmly|submitted\s+by|issued\s+to|certify\s+that)\s*[:=,]?\s*\n?\s*([A-Z][a-zA-Z.]*(?:\s+[A-Z][a-zA-Z.]*){0,2})\b/gi,
            // Natural sentence context with prepositions:
            // "Send report to Rahul Sharma", "Write leave email for employee Vikram Seth", "Verify PAN for Priya Sharma"
            /\b(?:for|to|with|by|from|contact|call|meet)\s+(?:employee|patient|student|client|user\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g,
            // Initial-dot Indian names: "M. Shruthi", "V. Madhu Reddy", "K. Rahul"
            /\b([A-Z]\.\s?[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g
        ];

        for (const pattern of namePatterns) {
            const regex = new RegExp(pattern.source, pattern.flags);
            let match;
            while ((match = regex.exec(text)) !== null) {
                const captured = (match[1] || match[0]).trim();
                if (captured.length < 2) continue;

                // Split words and sanitize
                const words = captured.split(/\s+/).filter(w => w.length > 0);
                if (words.length === 0) continue;

                // Strip trailing/leading non-name tokens
                while (words.length > 1 && nonNameWords.has(words[words.length - 1].toLowerCase())) {
                    words.pop();
                }
                while (words.length > 1 && nonNameWords.has(words[0].toLowerCase())) {
                    words.shift();
                }

                const cleanedName = words.join(' ');
                if (cleanedName.length < 2) continue;

                // Disqualify if all words are common vocabulary or match blacklisted tokens
                const hasBlacklist = words.some(w => nonNameWords.has(w.toLowerCase().replace(/[^a-z]/g, '')));
                if (hasBlacklist) continue;

                const nameStart = text.indexOf(cleanedName, match.index);
                if (nameStart === -1) continue;

                // Avoid duplicating or creating overlapping name matches
                if (detections.some(d => d.type === 'PERSON' && Math.abs(d.start - nameStart) < cleanedName.length)) {
                    continue;
                }

                detections.push({
                    type: 'PERSON',
                    value: cleanedName,
                    start: nameStart,
                    end: nameStart + cleanedName.length,
                    confidence: 0.85,
                    source: 'ner-heuristic',
                    description: 'Person name'
                });
            }
        }

        // --- Document Header Standalone Name Detection ---
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length > 0) {
            const firstLine = lines[0];
            const words = firstLine.split(/\s+/);
            if (words.length >= 2 && words.length <= 3) {
                const isHeaderName = words.every(w => /^[A-Z][a-z]+$/.test(w)) &&
                    !words.some(w => nonNameWords.has(w.toLowerCase()));
                if (isHeaderName) {
                    const start = text.indexOf(firstLine);
                    if (start !== -1 && !detections.some(d => d.type === 'PERSON' && d.start === start)) {
                        detections.push({
                            type: 'PERSON',
                            value: firstLine,
                            start,
                            end: start + firstLine.length,
                            confidence: 0.88,
                            source: 'ner-header',
                            description: 'Person name (header)'
                        });
                    }
                }
            }
        }

        // --- 2. Residential Addresses ---
        const addressPatterns = [
            // Context prefix: "address is Flat 402, Green Glen Layout, Bellandur, Bangalore"
            /(?:address|residing\s+at|lives?\s+at|living\s+at|located\s+at|delivery\s+to|shipped\s+to)[\s:]+([A-Za-z0-9#\/\-.,\s]{8,100}?)(?=[.;\n]|$)/gi,
            // House/Door/Flat with Street/Nagar/Road/Colony/Layout/Sector
            /\b((?:(?:Flat|House|H\.?No\.?|Door|D\.?No\.?|Plot|Villa|Apt)\s*(?:No\.?|#)?\s*[A-Za-z0-9\/-]+[,\s]+)?(?:[A-Za-z0-9\/-]+[\s,]+){1,5}(?:Road|Street|Lane|Cross|Main|Nagar|Colony|Layout|Sector|Phase|Block|Enclave|Apartment|Apartments|Heights|Town|City|State|Village)(?:[\s,]+[A-Za-z0-9\/-]+){0,4})\b/gi,
            // Major Indian Cities when in location context
            /\b(?:in|at|near|from)\s+(Bangalore|Bengaluru|Mumbai|Delhi|New Delhi|Hyderabad|Chennai|Kolkata|Pune|Ahmedabad|Jaipur|Noida|Gurgaon|Gurugram|Chandigarh|Kochi|Lucknow|Bhopal|Indore|Patna|Vadodara)\b/gi
        ];

        for (const pattern of addressPatterns) {
            const regex = new RegExp(pattern.source, pattern.flags);
            let match;
            while ((match = regex.exec(text)) !== null) {
                let addr = (match[1] || match[0]).trim();
                // Strip trailing commas/dots
                addr = addr.replace(/[.,;:\s]+$/, '');
                if (addr.length < 4) continue;

                // Strip leading prepositions if captured
                addr = addr.replace(/^(?:in|at|near|from)\s+/i, '');

                const addrStart = text.indexOf(addr, match.index);
                if (addrStart === -1) continue;

                // Ensure it does not duplicate an existing address
                if (detections.some(d => d.type === 'ADDRESS' && Math.abs(d.start - addrStart) < addr.length)) {
                    continue;
                }

                detections.push({
                    type: 'ADDRESS',
                    value: addr,
                    start: addrStart,
                    end: addrStart + addr.length,
                    confidence: 0.80,
                    source: 'ner-heuristic',
                    description: 'Residential address'
                });
            }
        }

        // --- 3. Organizations ---
        const orgPatterns = [
            /\b(?:company|organization|employer|work\s+at|hospital|clinic)[\s:]+([A-Z][A-Za-z0-9\s&.]+(?:Ltd\.?|Inc\.?|Corp\.?|Pvt\.?|Limited|Private|Technologies|Solutions|Services|Bank|University|College|Institute|Hospital)?)/gi,
            /\b([A-Z][A-Za-z0-9&]+(?:\s+[A-Z][A-Za-z0-9&]+)*\s+(?:Ltd\.?|Inc\.?|Corp\.?|Pvt\.?\s*Ltd\.?|Limited|Private\s+Limited|Technologies|Solutions|Services|Bank|University|College|Institute|Hospital))\b/g
        ];

        for (const pattern of orgPatterns) {
            const regex = new RegExp(pattern.source, pattern.flags);
            let match;
            while ((match = regex.exec(text)) !== null) {
                const org = (match[1] || match[0]).trim().replace(/[.,;:\s]+$/, '');
                if (org.length < 3) continue;

                const orgStart = text.indexOf(org, match.index);
                if (orgStart === -1) continue;

                // Avoid duplicating
                if (detections.some(d => (d.type === 'ORGANIZATION' || d.type === 'ADDRESS') && Math.abs(d.start - orgStart) < org.length)) {
                    continue;
                }

                detections.push({
                    type: 'ORGANIZATION',
                    value: org,
                    start: orgStart,
                    end: orgStart + org.length,
                    confidence: 0.85,
                    source: 'ner-heuristic',
                    description: 'Organization name'
                });
            }
        }

        return detections;
    }

    /**
     * Main detection entry point.
     */
    async function detect(text) {
        if (!text || typeof text !== 'string') return [];
        if (isAvailable && pipeline) {
            return detectWithModel(text);
        }
        return heuristicDetect(text);
    }

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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NERDetector;
}
