/**
 * Automated Test Suite for GuardAI
 * Covers:
 *  - Personal info (Name, Email, Phone, Address)
 *  - Financial info (Bank account, IFSC, UPI ID, Transaction reference)
 *  - Identity info (Aadhaar, PAN)
 *  - Credentials (Password, API key)
 *  - IP Address
 *  - Mixed prompts
 *  - Privacy modes (Basic, Balanced, Strict)
 *  - Policy recommendations (ensuring Bank Account is MASKed, not KEPT)
 *  - Sanitization and restoration
 *  - Offline demonstration mode
 *
 * Uses synthetic fictional test data only.
 */

const assert = require('assert');
const path = require('path');

// Load all modules and expose as globals so detector.js can reference them
// (browser uses <script> tags; Node.js needs explicit globals)
global.Confidence       = require('../frontend/confidence');
global.RegexDetectors   = require('../frontend/regexDetectors');
global.NERDetector      = require('../frontend/nerDetector');
global.ConflictResolver = require('../frontend/conflictResolver');
global.OverlapResolver  = require('../frontend/overlapResolver');
global.RiskClassifier   = require('../frontend/riskClassifier');
global.PrivacyPolicy    = require('../frontend/privacyPolicy');
global.ContextAnalyzer  = require('../frontend/contextAnalyzer');
global.PlaceholderEngine= require('../frontend/placeholderEngine');
global.Sanitizer        = require('../frontend/sanitizer');

// detector.js references the above as globals — must be loaded after them
global.Detector         = require('../frontend/detector');

// Local aliases for test code
const RegexDetectors    = global.RegexDetectors;
const NERDetector       = global.NERDetector;
const ConflictResolver  = global.ConflictResolver;
const OverlapResolver   = global.OverlapResolver;
const Confidence        = global.Confidence;
const RiskClassifier    = global.RiskClassifier;
const PrivacyPolicy     = global.PrivacyPolicy;
const ContextAnalyzer   = global.ContextAnalyzer;
const PlaceholderEngine = global.PlaceholderEngine;
const Sanitizer         = global.Sanitizer;
const Detector          = global.Detector;
const { getSimulatedResponse, DEFAULT_CANDIDATE_MODELS } = require('../backend/services/llmService');

let passedTests = 0;
let totalTests = 0;
const failures = [];

function test(name, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  ✓ ${name}`);
    } catch (err) {
        failures.push({ name, error: err.message });
        console.error(`  ✗ ${name}: ${err.message}`);
    }
}

async function asyncTest(name, fn) {
    totalTests++;
    try {
        await fn();
        passedTests++;
        console.log(`  ✓ ${name}`);
    } catch (err) {
        failures.push({ name, error: err.message });
        console.error(`  ✗ ${name}: ${err.message}`);
    }
}

async function runSuite() {
    console.log('\n============================================================');
    console.log('🛡️  GuardAI Automated Privacy & Security Test Suite');
    console.log('============================================================\n');

    // ── SECTION 1: Personal Information Detection ──
    console.log('--- 1. Personal Information Detection ---');

    await asyncTest('Detects person names via heuristic NER (Sender / Salutation / Prefixes)', async () => {
        const text1 = 'Draft leave request from Rahul Sharma to manager.';
        const dets1 = await Detector.detect(text1);
        const name1 = dets1.find(d => d.type === 'PERSON');
        assert(name1, 'Expected PERSON detection for Rahul Sharma');
        assert.strictEqual(name1.value, 'Rahul Sharma');

        const text2 = 'Payee: Priya Sundaram';
        const dets2 = await Detector.detect(text2);
        const name2 = dets2.find(d => d.type === 'PERSON');
        assert(name2, 'Expected PERSON detection for Priya Sundaram');
        assert.strictEqual(name2.value, 'Priya Sundaram');
    });

    await asyncTest('Detects standard and OCR-tolerant email addresses', async () => {
        const text = 'Contact support at security.team@mycompany.org for verification.';
        const dets = await Detector.detect(text);
        const email = dets.find(d => d.type === 'EMAIL');
        assert(email, 'Expected EMAIL detection');
        assert.strictEqual(email.value, 'security.team@mycompany.org');
    });

    await asyncTest('Detects Indian phone numbers with country prefix', async () => {
        const text = 'Reach me at +91 9876543210 regarding the interview.';
        const dets = await Detector.detect(text);
        const phone = dets.find(d => d.type === 'PHONE');
        assert(phone, 'Expected PHONE detection');
        assert(phone.value.includes('9876543210'), 'Phone value should contain 9876543210');
    });

    await asyncTest('Detects residential addresses with layout/road/nagar', async () => {
        const text = 'My residential address is Flat 402, Green Glen Layout, Bellandur, Bangalore';
        const dets = await Detector.detect(text);
        const addr = dets.find(d => d.type === 'ADDRESS');
        assert(addr, 'Expected ADDRESS detection');
        assert(addr.value.toLowerCase().includes('green glen layout'), 'Address should contain street/layout info');
    });

    // ── SECTION 2: Financial Information Detection ──
    console.log('\n--- 2. Financial Information Detection ---');

    await asyncTest('Detects bank account numbers with context', async () => {
        const text = 'Transfer salary to account no. 123456789012 at state bank.';
        const dets = await Detector.detect(text);
        const acc = dets.find(d => d.type === 'BANK_ACCOUNT');
        assert(acc, 'Expected BANK_ACCOUNT detection');
        assert.strictEqual(acc.value, '123456789012');
    });

    await asyncTest('Detects Indian bank IFSC code', async () => {
        const text = 'Bank IFSC is SBIN0001234 for NEFT transfer.';
        const dets = await Detector.detect(text);
        const ifsc = dets.find(d => d.type === 'IFSC');
        assert(ifsc, 'Expected IFSC detection');
        assert.strictEqual(ifsc.value, 'SBIN0001234');
    });

    await asyncTest('Detects various UPI IDs (handles & contextual)', async () => {
        const text1 = 'Pay via UPI: merchant.store@okhdfcbank';
        const dets1 = await Detector.detect(text1);
        const upi1 = dets1.find(d => d.type === 'UPI');
        assert(upi1, 'Expected UPI detection for @okhdfcbank');
        assert.strictEqual(upi1.value, 'merchant.store@okhdfcbank');

        const text2 = 'Send payment to user@paytm';
        const dets2 = await Detector.detect(text2);
        const upi2 = dets2.find(d => d.type === 'UPI');
        assert(upi2, 'Expected UPI detection for @paytm');
        assert.strictEqual(upi2.value, 'user@paytm');
    });

    await asyncTest('Detects Transaction Reference IDs (UTR / Txn ID)', async () => {
        const text = 'Payment completed with Transaction ID: TXN9876543210 and UTR: 2026112312345678';
        const dets = await Detector.detect(text);
        const txns = dets.filter(d => d.type === 'TRANSACTION_ID');
        assert(txns.length >= 1, 'Expected at least one TRANSACTION_ID detection');
        assert(txns.some(t => t.value === 'TXN9876543210' || t.value === '2026112312345678'));
    });

    // ── SECTION 3: Identity Information Detection ──
    console.log('\n--- 3. Identity Information Detection ---');

    await asyncTest('Detects Indian PAN identifier (case-normalized)', async () => {
        const text = 'Tax assessment for PAN ABCDE1234F submitted.';
        const dets = await Detector.detect(text);
        const pan = dets.find(d => d.type === 'PAN');
        assert(pan, 'Expected PAN detection');
        assert.strictEqual(pan.value, 'ABCDE1234F');
    });

    await asyncTest('Detects Aadhaar 12-digit number (groups of 4)', async () => {
        const text = 'Verify identity with Aadhaar 3456 7890 1234 for KYC.';
        const dets = await Detector.detect(text);
        const aadhaar = dets.find(d => d.type === 'AADHAAR');
        assert(aadhaar, 'Expected AADHAAR detection');
        assert.strictEqual(aadhaar.value, '3456 7890 1234');
    });

    // ── SECTION 4: Credentials & IP Address Detection ──
    console.log('\n--- 4. Credentials & Network Identifiers ---');

    await asyncTest('Detects passwords in context', async () => {
        const text = 'Connect to database using password: My$ecureP@ss99!';
        const dets = await Detector.detect(text);
        const pwd = dets.find(d => d.type === 'PASSWORD');
        assert(pwd, 'Expected PASSWORD detection');
        assert.strictEqual(pwd.value, 'My$ecureP@ss99!');
    });

    await asyncTest('Detects API keys / tokens', async () => {
        const text = 'api_key: sk_live_1234567890abcdef123456';
        const dets = await Detector.detect(text);
        const apiKey = dets.find(d => d.type === 'API_KEY');
        assert(apiKey, 'Expected API_KEY detection');
        assert.strictEqual(apiKey.value, 'sk_live_1234567890abcdef123456');
    });

    await asyncTest('Detects IPv4 address', async () => {
        const text = 'Server origin at 192.168.1.150 is offline.';
        const dets = await Detector.detect(text);
        const ip = dets.find(d => d.type === 'IP_ADDRESS');
        assert(ip, 'Expected IP_ADDRESS detection');
        assert.strictEqual(ip.value, '192.168.1.150');
    });

    // ── SECTION 5: Mixed Prompts & Non-Overlapping Spans ──
    console.log('\n--- 5. Mixed Prompts & Overlap Resolution ---');

    await asyncTest('Extracts all entities without collisions in mixed prompt', async () => {
        const mixedText = 'Send payment of Rs 5000 to Priya Sundaram at account no. 987654321012 with IFSC SBIN0001234, phone +91 9123456789, email priya@test.com.';
        const dets = await Detector.detect(mixedText);

        const types = dets.map(d => d.type);
        assert(types.includes('PERSON'), 'Should detect PERSON');
        assert(types.includes('BANK_ACCOUNT'), 'Should detect BANK_ACCOUNT');
        assert(types.includes('IFSC'), 'Should detect IFSC');
        assert(types.includes('PHONE'), 'Should detect PHONE');
        assert(types.includes('EMAIL'), 'Should detect EMAIL');

        // Check for zero overlapping spans
        for (let i = 0; i < dets.length; i++) {
            for (let j = i + 1; j < dets.length; j++) {
                const a = dets[i];
                const b = dets[j];
                const overlap = (a.start < b.end && b.start < a.end);
                assert(!overlap, `Span overlap detected between ${a.type} (${a.start}-${a.end}) and ${b.type} (${b.start}-${b.end})`);
            }
        }
    });

    // ── SECTION 6: Privacy Decision Engine (KEEP / MASK / REMOVE Policy) ──
    console.log('\n--- 6. Privacy Decision Engine Policy Review ---');

    test('Financial Task Policy: BANK_ACCOUNT must NEVER recommend KEEP', () => {
        PrivacyPolicy.setMode('balanced');
        const prompt = 'Please confirm remittance to bank account 123456789012 for the invoice.';
        const detections = [
            { type: 'BANK_ACCOUNT', value: '123456789012', risk: 'HIGH', _placeholder: '[BANK_ACCOUNT_1]' }
        ];
        const analysis = ContextAnalyzer.analyze(prompt, detections);
        const bankResult = analysis.find(a => a.type === 'BANK_ACCOUNT');

        assert(bankResult, 'Must return analysis for BANK_ACCOUNT');
        assert.strictEqual(
            bankResult.recommendation,
            'MASK',
            `BANK_ACCOUNT was recommended for "${bankResult.recommendation}", but MUST be "MASK" even in financial context!`
        );
    });

    test('Financial Task Policy: UPI ID & PAN must default to MASK', () => {
        PrivacyPolicy.setMode('balanced');
        const prompt = 'Process refund to UPI priya@paytm for PAN ABCDE1234F';
        const detections = [
            { type: 'UPI', value: 'priya@paytm', risk: 'HIGH', _placeholder: '[UPI_1]' },
            { type: 'PAN', value: 'ABCDE1234F', risk: 'HIGH', _placeholder: '[PAN_1]' }
        ];
        const analysis = ContextAnalyzer.analyze(prompt, detections);

        const upiResult = analysis.find(a => a.type === 'UPI');
        const panResult = analysis.find(a => a.type === 'PAN');

        assert.strictEqual(upiResult.recommendation, 'MASK', 'UPI must recommend MASK');
        assert.strictEqual(panResult.recommendation, 'MASK', 'PAN must recommend MASK');
    });

    test('Strict Privacy Mode: Forces REMOVE or MASK on all identifiers', () => {
        PrivacyPolicy.setMode('strict');
        const prompt = 'Draft an email from Rahul Sharma to manager.';
        const detections = [
            { type: 'PERSON', value: 'Rahul Sharma', risk: 'LOW', _placeholder: '[PERSON_1]' },
            { type: 'BANK_ACCOUNT', value: '123456789012', risk: 'HIGH', _placeholder: '[BANK_ACCOUNT_1]' }
        ];
        const analysis = ContextAnalyzer.analyze(prompt, detections);

        for (const item of analysis) {
            assert.notStrictEqual(
                item.recommendation,
                'KEEP',
                `Strict mode must never recommend KEEP for ${item.type}`
            );
        }
    });

    test('Basic Privacy Mode: Allows KEEP only for non-critical contextually necessary items', () => {
        PrivacyPolicy.setMode('basic');
        const prompt = 'Write a leave application from Rahul Sharma due to illness.';
        const detections = [
            { type: 'PERSON', value: 'Rahul Sharma', risk: 'LOW', _placeholder: '[PERSON_1]' }
        ];
        const analysis = ContextAnalyzer.analyze(prompt, detections);
        const personResult = analysis.find(a => a.type === 'PERSON');

        assert.strictEqual(personResult.recommendation, 'KEEP', 'Person name in leave application may be KEPT in Basic mode');
    });

    // ── SECTION 7: Prompt Sanitization & Placeholder Restoration ──
    console.log('\n--- 7. Sanitization & Placeholder Restoration ---');

    test('Sanitizes prompt replacing MASKed entities with placeholders', () => {
        const engine = PlaceholderEngine.createInstance();
        const original = 'My account 123456789012 and email test@example.com';
        const detections = [
            { type: 'BANK_ACCOUNT', value: '123456789012', start: 11, end: 23, _placeholder: '[BANK_ACCOUNT_1]' },
            { type: 'EMAIL', value: 'test@example.com', start: 34, end: 50, _placeholder: '[EMAIL_1]' }
        ];
        const decisions = {
            '[BANK_ACCOUNT_1]': 'MASK',
            '[EMAIL_1]': 'MASK'
        };

        const result = Sanitizer.sanitize(original, detections, decisions, engine);
        assert(!result.sanitized.includes('123456789012'), 'Sanitized prompt must not contain raw bank account');
        assert(!result.sanitized.includes('test@example.com'), 'Sanitized prompt must not contain raw email');
        assert(result.sanitized.includes('[BANK_ACCOUNT_1]'), 'Should contain [BANK_ACCOUNT_1]');
        assert(result.sanitized.includes('[EMAIL_1]'), 'Should contain [EMAIL_1]');
    });

    test('Removes REMOVEd entities completely without leaking raw value', () => {
        const engine = PlaceholderEngine.createInstance();
        const original = 'Connect with password: Secret123! immediately.';
        const detections = [
            { type: 'PASSWORD', value: 'Secret123!', start: 23, end: 33, _placeholder: '[PASSWORD_1]' }
        ];
        const decisions = {
            '[PASSWORD_1]': 'REMOVE'
        };

        const result = Sanitizer.sanitize(original, detections, decisions, engine);
        assert(!result.sanitized.includes('Secret123!'), 'Password must be completely removed');
        const verification = Sanitizer.verify(result.sanitized, detections, decisions, original);
        assert(verification.safe, 'Verification must pass with zero leaks');
    });

    // ── SECTION 8: Gemini Candidate Models & Simulated Demo Mode ──
    console.log('\n--- 8. Gemini Models & Offline Demo Fallback ---');

    test('DEFAULT_CANDIDATE_MODELS are official production model endpoints', () => {
        assert(Array.isArray(DEFAULT_CANDIDATE_MODELS), 'Candidates must be an array');
        assert(DEFAULT_CANDIDATE_MODELS.includes('gemini-2.5-flash'), 'Must include gemini-2.5-flash');
        assert(DEFAULT_CANDIDATE_MODELS.includes('gemini-2.5-flash-lite'), 'Must include gemini-2.5-flash-lite');
        // Must NOT use unstable aliases
        assert(!DEFAULT_CANDIDATE_MODELS.includes('gemini-flash-latest'), 'Must NOT use unstable gemini-flash-latest');
        assert(!DEFAULT_CANDIDATE_MODELS.includes('gemini-flash-lite-latest'), 'Must NOT use unstable gemini-flash-lite-latest');
    });

    test('Offline Demo mode returns explicitly labeled simulated output', () => {
        const sim = getSimulatedResponse('Write a leave application', 'Test Offline Note');
        assert.strictEqual(sim.isSimulated, true, 'isSimulated must be true');
        assert.strictEqual(sim.status, 'simulated', 'status must be simulated');
        assert(sim.provider.includes('Simulated'), 'Provider must clearly state Simulated');
        assert(!sim.provider.includes('Google Gemini'), 'Must never claim to be Google Gemini');
    });

    // ── SUMMARY REPORT ──
    console.log('\n============================================================');
    console.log(`📊 Test Suite Completed: ${passedTests}/${totalTests} Passed`);
    if (failures.length > 0) {
        console.error(`❌ ${failures.length} Test(s) Failed:`);
        failures.forEach(f => console.error(`   - ${f.name}: ${f.error}`));
        process.exit(1);
    } else {
        console.log('✅ ALL TESTS PASSED SUCCESSFULLY with zero regressions!');
        console.log('============================================================\n');
    }
}

runSuite().catch(err => {
    console.error('Fatal test suite error:', err);
    process.exit(1);
});
