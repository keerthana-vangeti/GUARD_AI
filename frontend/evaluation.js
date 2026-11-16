/* ============================================================
   Evaluation Module — Runs detection engine against test data
   and computes actual metrics (no invented numbers).
   ============================================================ */

const Evaluation = (() => {
    'use strict';

    let testDataset = null;

    /**
     * Load the test dataset.
     * @returns {Promise<Object[]>}
     */
    async function loadTestData() {
        if (testDataset) return testDataset;

        try {
            const response = await fetch('/tests/detection-tests.json');
            if (!response.ok) throw new Error('Failed to load test data');
            testDataset = await response.json();
            return testDataset;
        } catch (err) {
            console.error('[Evaluation] Failed to load test data:', err);
            // Fallback: use embedded test data
            testDataset = getEmbeddedTestData();
            return testDataset;
        }
    }

    /**
     * Run the full evaluation.
     * @param {Function} progressCallback - Progress callback (current, total)
     * @returns {Promise<Object>} Evaluation results
     */
    async function run(progressCallback) {
        const data = await loadTestData();
        const results = [];
        let correct = 0;
        let falsePositives = 0;
        let falseNegatives = 0;
        let totalExpected = 0;
        let totalDetected = 0;

        for (let i = 0; i < data.length; i++) {
            const testCase = data[i];

            if (progressCallback) progressCallback(i, data.length);

            // Normalize schema: support both { input, expected } and { prompt, expectedEntities }
            const inputText = testCase.input || testCase.prompt || '';
            const expectedList = testCase.expected || testCase.expectedEntities || [];

            // Run detection
            const detections = await Detector.detectAll(inputText);
            const detectedTypes = detections.map(d => `${d.type}:${d.value}`);
            const expectedTypes = expectedList.map(e => `${e.type}:${e.value}`);

            // Calculate per-test results
            const tp = detectedTypes.filter(d => expectedTypes.includes(d));
            const fp = detectedTypes.filter(d => !expectedTypes.includes(d));
            const fn = expectedTypes.filter(e => !detectedTypes.includes(e));

            correct += tp.length;
            falsePositives += fp.length;
            falseNegatives += fn.length;
            totalExpected += expectedTypes.length;
            totalDetected += detectedTypes.length;

            let status;
            if (fp.length === 0 && fn.length === 0) {
                status = 'correct';
            } else if (fp.length > 0 && fn.length > 0) {
                status = 'mixed';
            } else if (fp.length > 0) {
                status = 'false_positive';
            } else {
                status = 'false_negative';
            }

            results.push({
                index: i + 1,
                input: inputText,
                expected: expectedList,
                detected: detections.map(d => ({ type: d.type, value: d.value, confidence: d.confidence })),
                truePositives: tp,
                falsePositives: fp,
                falseNegatives: fn,
                status
            });
        }

        // Compute aggregate metrics
        const precision = totalDetected > 0 ? correct / totalDetected : 0;
        const recall = totalExpected > 0 ? correct / totalExpected : 0;
        const f1 = (precision + recall) > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

        const correctCases = results.filter(r => r.status === 'correct').length;

        return {
            totalCases: data.length,
            correctCases,
            totalExpected,
            totalDetected,
            truePositives: correct,
            falsePositives,
            falseNegatives,
            precision: Math.round(precision * 10000) / 100,
            recall: Math.round(recall * 10000) / 100,
            f1: Math.round(f1 * 10000) / 100,
            details: results
        };
    }

    /**
     * Embedded test data fallback.
     */
    function getEmbeddedTestData() {
        return [
            { input: "My email is test@example.com", expected: [{ type: "EMAIL", value: "test@example.com" }] },
            { input: "Call me at 9876543210", expected: [{ type: "PHONE", value: "9876543210" }] },
            { input: "My PAN is ABCDE1234F", expected: [{ type: "PAN", value: "ABCDE1234F" }] },
            { input: "Phone: +91-9876543210", expected: [{ type: "PHONE", value: "+91-9876543210" }] },
            { input: "Contact: user@paytm", expected: [{ type: "UPI", value: "user@paytm" }] },
            { input: "IFSC: SBIN0001234", expected: [{ type: "IFSC", value: "SBIN0001234" }] },
            { input: "Explain photosynthesis", expected: [] },
            { input: "What is the capital of India?", expected: [] },
            { input: "My name is Rahul and my phone is 9876543210", expected: [{ type: "PERSON", value: "Rahul" }, { type: "PHONE", value: "9876543210" }] },
            { input: "Email me at john@gmail.com, my PAN is BCDEF2345G", expected: [{ type: "EMAIL", value: "john@gmail.com" }, { type: "PAN", value: "BCDEF2345G" }] },
            { input: "Write a leave email to my professor. My name is Rahul, my phone number is 9876543210 and my PAN is ABCDE1234F.", expected: [{ type: "PERSON", value: "Rahul" }, { type: "PHONE", value: "9876543210" }, { type: "PAN", value: "ABCDE1234F" }] },
            { input: "How does machine learning work?", expected: [] },
            { input: "password: MyStr0ngP@ss!", expected: [{ type: "PASSWORD", value: "MyStr0ngP@ss!" }] },
            { input: "api_key: sk-1234567890abcdef1234567890abcdef", expected: [{ type: "API_KEY", value: "sk-1234567890abcdef1234567890abcdef" }] },
            { input: "UPI ID: rahul.kumar@oksbi", expected: [{ type: "UPI", value: "rahul.kumar@oksbi" }] },
            { input: "Send money to priya@ybl", expected: [{ type: "UPI", value: "priya@ybl" }] },
            { input: "My PAN is XYZAB1234C and email is contact@company.org", expected: [{ type: "PAN", value: "XYZAB1234C" }, { type: "EMAIL", value: "contact@company.org" }] },
            { input: "The weather is nice today", expected: [] },
            { input: "Call +919123456789 for details", expected: [{ type: "PHONE", value: "+919123456789" }] },
            { input: "Bank IFSC HDFC0002345 for transfer", expected: [{ type: "IFSC", value: "HDFC0002345" }] }
        ];
    }

    return { loadTestData, run };
})();
