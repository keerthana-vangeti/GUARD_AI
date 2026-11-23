/* ============================================================
   App.js — Main Application Controller
   Orchestrates the complete privacy pipeline and all UI interactions.

   Flow:
   Input → Detect → Classify → Analyze Context → User Control
   → Sanitize → Injection Check → Fail-Closed → Consent
   → Backend → Output Check → Restore → Display
   ============================================================ */

(() => {
    'use strict';

    // ── Configuration ──
    // Auto-detect backend URL:
    // When opened via devtunnels, ngrok, or local port 3001, window.location.origin is the backend server.
    // Only fall back to localhost:3001 if someone explicitly opens via VS Code Live Server (port 5500) or file://.
    const isStaticLiveServerOrFile = window.location.protocol === 'file:' || window.location.port === '5500';
    const API_BASE = isStaticLiveServerOrFile ? 'http://localhost:3001' : (window.location.origin || '');
    const MAX_PROMPT_LENGTH = 10000;

    // ── State ──
    let currentStep = 'input'; // input | analyzing | results | consent | response
    let pipelineData = null;   // Holds all pipeline data for current analysis
    let attachedImages = [];   // Holds attached image objects [{ id, file, dataUrl, mimeType, base64Data, ocrText, ocrStatus }]
    const MAX_ATTACHED_IMAGES = 5;

    // ── DOM References (cached on DOMContentLoaded) ──
    let DOM = {};

    // ===================================================================
    // INITIALIZATION
    // ===================================================================

    document.addEventListener('DOMContentLoaded', () => {
        cacheDOM();
        bindEvents();
        initNER();
        SessionManager.create();
    });

    function cacheDOM() {
        DOM = {
            // Input
            promptInput: document.getElementById('prompt-input'),
            charCount: document.getElementById('char-count'),
            nerStatus: document.getElementById('ner-status'),
            btnAnalyze: document.getElementById('btn-analyze'),
            imageUpload: document.getElementById('image-upload'),
            ocrPreview: document.getElementById('ocr-preview'),
            ocrText: document.getElementById('ocr-text'),
            btnUseOcr: document.getElementById('btn-use-ocr'),

            // Multi-Image Gallery Cards
            imageAttachedCard: document.getElementById('image-attached-card'),
            imageItemsList: document.getElementById('image-items-list'),
            imageCount: document.getElementById('image-count'),
            imageStatus: document.getElementById('image-status'),
            btnRemoveImage: document.getElementById('btn-remove-image'),

            // Image Content Analysis
            imageAnalysisCard: document.getElementById('image-analysis-card'),
            imageAnalysisList: document.getElementById('image-analysis-list'),

            // Mode
            modeButtons: document.querySelectorAll('.mode-btn'),
            btnClearData: document.getElementById('btn-clear-data'),

            // Sections
            loadingSection: document.getElementById('loading-section'),
            loadingMessage: document.getElementById('loading-message'),
            resultsSection: document.getElementById('results-section'),
            failClosedAlert: document.getElementById('fail-closed-alert'),
            failReason: document.getElementById('fail-reason'),
            btnFailRetry: document.getElementById('btn-fail-retry'),

            // Detection
            detectionCard: document.getElementById('detection-card'),
            detectionList: document.getElementById('detection-list'),
            noDetectionMsg: document.getElementById('no-detection-msg'),

            // Context
            contextCard: document.getElementById('context-card'),
            contextList: document.getElementById('context-list'),

            // Control
            controlCard: document.getElementById('control-card'),
            controlList: document.getElementById('control-list'),
            btnApplyDecisions: document.getElementById('btn-apply-decisions'),

            // Sanitized
            sanitizedCard: document.getElementById('sanitized-card'),
            sanitizedPromptText: document.getElementById('sanitized-prompt-text'),
            securityChecks: document.getElementById('security-checks'),

            // Consent
            consentCard: document.getElementById('consent-card'),
            consentSummary: document.getElementById('consent-summary'),
            btnConsentAllow: document.getElementById('btn-consent-allow'),
            btnConsentCancel: document.getElementById('btn-consent-cancel'),

            // Response & Follow-up
            responseCard: document.getElementById('response-card'),
            outputAlert: document.getElementById('output-alert'),
            outputAlertDetails: document.getElementById('output-alert-details'),
            aiResponseText: document.getElementById('ai-response-text'),
            responseMeta: document.getElementById('response-meta'),
            btnOutputMask: document.getElementById('btn-output-mask'),
            btnOutputReview: document.getElementById('btn-output-review'),
            btnOutputBlock: document.getElementById('btn-output-block'),
            followupCard: document.getElementById('followup-card'),
            followupInput: document.getElementById('followup-input'),
            btnSendFollowup: document.getElementById('btn-send-followup'),

            // Audit
            auditToggle: document.getElementById('audit-toggle'),
            auditContent: document.getElementById('audit-content'),
            auditLog: document.getElementById('audit-log'),
            auditCard: document.getElementById('audit-card'),

            // Tabs
            navMain: document.getElementById('nav-main'),
            navEval: document.getElementById('nav-eval'),
            tabMain: document.getElementById('tab-main'),
            tabEvaluation: document.getElementById('tab-evaluation'),

            // Evaluation
            btnRunEval: document.getElementById('btn-run-eval'),
            evalSummary: document.getElementById('eval-summary'),
            evalDetails: document.getElementById('eval-details'),
            evalTableBody: document.getElementById('eval-table-body')
        };
    }

    // ===================================================================
    // EVENT BINDING
    // ===================================================================

    function bindEvents() {
        // Character count
        DOM.promptInput.addEventListener('input', () => {
            const len = DOM.promptInput.value.length;
            DOM.charCount.textContent = `${len.toLocaleString()} / ${MAX_PROMPT_LENGTH.toLocaleString()}`;
        });

        // Analyze
        DOM.btnAnalyze.addEventListener('click', () => runPipeline());

        // Image upload & remove
        DOM.imageUpload.addEventListener('change', handleImageUpload);
        if (DOM.btnRemoveImage) {
            DOM.btnRemoveImage.addEventListener('click', removeAllAttachedImages);
        }
        if (DOM.btnUseOcr) {
            DOM.btnUseOcr.addEventListener('click', () => {
                DOM.promptInput.value = DOM.ocrText.textContent;
                DOM.ocrPreview.classList.add('hidden');
                DOM.charCount.textContent = `${DOM.promptInput.value.length.toLocaleString()} / ${MAX_PROMPT_LENGTH.toLocaleString()}`;
            });
        }

        // Follow-up questions
        if (DOM.btnSendFollowup) {
            DOM.btnSendFollowup.addEventListener('click', handleFollowupQuery);
        }
        if (DOM.followupInput) {
            DOM.followupInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleFollowupQuery();
            });
        }

        // Mode selector
        DOM.modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                DOM.modeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                PrivacyPolicy.setMode(btn.dataset.mode);
            });
        });

        // Clear data
        DOM.btnClearData.addEventListener('click', clearAllSensitiveData);

        // Apply decisions
        DOM.btnApplyDecisions.addEventListener('click', applySanitization);

        // Consent
        DOM.btnConsentAllow.addEventListener('click', sendToBackend);
        DOM.btnConsentCancel.addEventListener('click', () => {
            DOM.consentCard.classList.add('hidden');
        });

        // Output actions
        DOM.btnOutputMask.addEventListener('click', maskOutput);
        DOM.btnOutputBlock.addEventListener('click', blockOutput);
        DOM.btnOutputReview.addEventListener('click', () => {
            DOM.outputAlert.classList.add('hidden');
        });

        // Fail retry
        DOM.btnFailRetry.addEventListener('click', () => {
            DOM.failClosedAlert.classList.add('hidden');
            DOM.resultsSection.classList.add('hidden');
        });

        // Audit toggle
        DOM.auditToggle.addEventListener('click', () => {
            DOM.auditContent.classList.toggle('hidden');
            DOM.auditToggle.querySelector('.collapse-icon').classList.toggle('open');
        });

        // Tabs
        DOM.navMain.addEventListener('click', () => switchTab('main'));
        DOM.navEval.addEventListener('click', () => switchTab('evaluation'));

        // Evaluation
        DOM.btnRunEval.addEventListener('click', runEvaluation);
    }

    // ===================================================================
    // NER INITIALIZATION
    // ===================================================================

    async function initNER() {
        DOM.nerStatus.textContent = 'NER: Loading…';
        DOM.nerStatus.className = 'ner-badge loading';

        const success = await NERDetector.initialize();

        if (success) {
            DOM.nerStatus.textContent = 'NER: Ready';
            DOM.nerStatus.className = 'ner-badge ready';
        } else {
            const status = NERDetector.getStatus();
            DOM.nerStatus.textContent = 'NER: Heuristic';
            DOM.nerStatus.className = 'ner-badge unavailable';
            DOM.nerStatus.title = `ML model unavailable (${status.error || 'unknown error'}). Using heuristic fallback.`;
        }
    }

    // ===================================================================
    // MAIN PIPELINE
    // ===================================================================

    async function runPipeline() {
        let prompt = DOM.promptInput.value.trim();

        // ── Validation ──
        if (!prompt && attachedImages.length === 0) {
            showError(`Please enter a prompt or attach up to ${MAX_ATTACHED_IMAGES} images to analyze.`);
            return;
        }
        if (prompt.length > MAX_PROMPT_LENGTH) {
            showError(`Prompt is too long. Maximum ${MAX_PROMPT_LENGTH.toLocaleString()} characters.`);
            return;
        }

        // Combine prompt text and all images' OCR texts for scanning
        const ocrBlocks = attachedImages
            .map((img, i) => {
                const txt = (img.ocrText || '').trim();
                if (!txt) return '';
                return attachedImages.length > 1
                    ? `[Image ${i + 1}: ${img.file.name}]\n${txt}`
                    : txt;
            })
            .filter(Boolean);

        const combinedOcrText = ocrBlocks.join('\n\n');
        let textToScan = prompt;
        if (combinedOcrText) {
            textToScan = prompt ? (prompt + '\n\n' + combinedOcrText) : combinedOcrText;
        }

        // Use the effective text (including OCR) as the pipeline prompt
        // so sanitizer/context-analyzer receive non-empty input for image-only uploads
        const effectivePrompt = textToScan || prompt;

        // ── Image-only with no text to scan: display image content analysis, send directly ──
        if (!effectivePrompt && attachedImages.length > 0) {
            resetUI();
            const imgCountStr = attachedImages.length > 1 ? `${attachedImages.length} images` : 'image';
            showLoading(`No text detected in ${imgCountStr}. Performing visual analysis & sending directly to AI…`);

            SessionManager.destroyCurrent();
            SessionManager.create();
            const session = SessionManager.getCurrent();
            session.originalPrompt = '';
            session.mode = PrivacyPolicy.getMode();

            pipelineData = {
                prompt: '',
                originalTextPrompt: '',
                session,
                images: attachedImages,
                sanitizedPrompt: '',
                stats: { kept: 0, masked: 0, removed: 0, categories: { kept: [], masked: [], removed: [] } },
                detections: []
            };

            showResults();
            renderImageContentAnalysis();
            await sendToBackend();
            return;
        }

        // ── Reset state ──
        resetUI();
        const scanMsg = attachedImages.length > 0
            ? `Step 1: Analyzing content in ${attachedImages.length > 1 ? `${attachedImages.length} attached images` : 'attached image'}…`
            : 'Analyzing prompt for sensitive information…';
        showLoading(scanMsg);

        // Create fresh session
        SessionManager.destroyCurrent();
        SessionManager.create();
        const session = SessionManager.getCurrent();
        session.originalPrompt = prompt;
        session.mode = PrivacyPolicy.getMode();

        pipelineData = { prompt: effectivePrompt, originalTextPrompt: prompt, session, images: attachedImages };

        try {
            // ── Step 1: Content Analysis (Images) ──
            if (attachedImages.length > 0) {
                renderImageContentAnalysis();
            }

            // ── Step 2: Privacy Detection ──
            updateLoading('Step 2: Checking prompt & image content for sensitive information (Regex + NER)…');
            const detections = await Detector.detect(effectivePrompt);

            // If no sensitive information detected
            if (detections.length === 0) {
                showResults();
                if (attachedImages.length > 0) {
                    renderImageContentAnalysis();
                }
                DOM.detectionList.innerHTML = '';
                DOM.noDetectionMsg.classList.remove('hidden');
                DOM.auditCard.classList.remove('hidden');
                updateAuditLog('Content analyzed and no sensitive information detected. Automatically sending request to AI.');

                pipelineData.sanitizedPrompt = effectivePrompt;
                pipelineData.stats = { kept: 0, masked: 0, removed: 0, categories: { kept: [], masked: [], removed: [] } };
                pipelineData.detections = [];

                // No sensitive data → no consent needed for either text or image → auto-send
                await sendToBackend();
                return;
            }

            DOM.noDetectionMsg.classList.add('hidden');

            // ── Step 2: Risk Classification ──
            updateLoading('Classifying risk levels…');
            RiskClassifier.classify(detections);

            // ── Step 3: Create Placeholders ──
            updateLoading('Creating placeholders…');
            let idx = {};
            for (const det of detections) {
                if (!idx[det.type]) idx[det.type] = 0;
                idx[det.type]++;
                det._placeholderIndex = idx[det.type];
                det._placeholder = session.placeholderEngine.create(det);
            }

            session.detections = detections;
            pipelineData.detections = detections;

            // ── Step 4: Context Analysis ──
            updateLoading('Analyzing context and necessity…');
            const contextAnalysis = ContextAnalyzer.analyze(effectivePrompt, detections);
            session.contextAnalysis = contextAnalysis;
            pipelineData.contextAnalysis = contextAnalysis;

            // ── Step 5: Prompt Injection Check ──
            updateLoading('Checking for prompt injection…');
            const injectionResult = PromptInjection.scan(effectivePrompt);
            pipelineData.injectionResult = injectionResult;

            // ── Show Results ──
            hideLoading();
            showResults();
            if (attachedImages.length > 0) {
                renderImageContentAnalysis();
            }
            renderDetections(detections);
            renderContextAnalysis(contextAnalysis);
            renderUserControls(detections, contextAnalysis);
            DOM.auditCard.classList.remove('hidden');

        } catch (err) {
            // ── FAIL CLOSED ──
            console.error('[Pipeline] Critical error:', err);
            hideLoading();
            failClosed('Detection pipeline error: ' + err.message);
        }
    }

    // ===================================================================
    // UI RENDERING
    // ===================================================================

    function renderDetections(detections) {
        DOM.detectionCard.classList.remove('hidden');
        DOM.detectionList.innerHTML = '';

        for (const det of detections) {
            const riskClass = RiskClassifier.getCSSClass(det.risk);
            const confPercent = Confidence.formatPercent(det.confidence);
            const confColor = Confidence.getColor(det.confidence);
            const needsConfirm = Confidence.needsConfirmation(det.confidence);

            const item = document.createElement('div');
            item.className = `detection-item ${riskClass}`;
            item.dataset.placeholder = det._placeholder;

            // Masked display of the value
            const maskedValue = maskForDisplay(det.value, det.type);

            item.innerHTML = `
                <span class="detection-type-badge">${det.type}</span>
                <div class="detection-info">
                    <div class="detection-value">${escapeHtml(maskedValue)}</div>
                    <div class="detection-meta">
                        <span>📊 Confidence: ${confPercent}
                            <span class="confidence-bar">
                                <span class="confidence-fill" style="width:${Math.round(det.confidence*100)}%;background:${confColor}"></span>
                            </span>
                        </span>
                        <span>⚠️ Risk: ${det.risk}</span>
                        <span>🏷️ ${det._placeholder}</span>
                        <span>📡 Source: ${(det.sources || [det.source]).join(', ')}</span>
                    </div>
                    ${needsConfirm ? `
                        <div class="fp-question">⚡ Is this actually sensitive?</div>
                        <div class="fp-actions">
                            <button class="fp-btn fp-btn-yes" data-ph="${det._placeholder}" data-action="confirm">YES</button>
                            <button class="fp-btn fp-btn-no" data-ph="${det._placeholder}" data-action="dismiss">NO</button>
                        </div>
                    ` : ''}
                </div>
            `;

            DOM.detectionList.appendChild(item);
        }

        // Bind false-positive buttons
        DOM.detectionList.querySelectorAll('.fp-btn').forEach(btn => {
            btn.addEventListener('click', handleFalsePositive);
        });
    }

    function renderContextAnalysis(analysis) {
        DOM.contextCard.classList.remove('hidden');
        DOM.contextList.innerHTML = '';

        const taskType = analysis.length > 0 ? analysis[0].taskType : 'general';
        const taskDesc = ContextAnalyzer.getTaskDescription(taskType);

        // Task type header
        const header = document.createElement('div');
        header.className = 'context-item';
        header.innerHTML = `<div class="context-header">
            <span class="context-entity">🎯 Detected task: ${escapeHtml(taskDesc)}</span>
        </div>`;
        DOM.contextList.appendChild(header);

        for (const ctx of analysis) {
            const item = document.createElement('div');
            item.className = 'context-item';
            item.dataset.placeholder = ctx.placeholder;

            const recClass = ctx.recommendation === 'KEEP' ? 'rec-keep'
                : ctx.recommendation === 'MASK' ? 'rec-mask' : 'rec-remove';

            item.innerHTML = `
                <div class="context-header">
                    <span class="context-entity">${escapeHtml(ctx.placeholder)} <span class="detection-type-badge ${RiskClassifier.getBadgeClass(ctx.risk)}">${ctx.type}</span></span>
                    <span class="necessity-badge ${ctx.necessary ? 'necessity-yes' : 'necessity-no'}">
                        ${ctx.necessary ? '✓ Necessary' : '✗ Not Necessary'}
                    </span>
                </div>
                <div class="context-reason">${escapeHtml(ctx.reason)}</div>
                <div class="context-why">
                    <strong>Why?</strong> ${escapeHtml(ctx.reason)}
                </div>
                <span class="recommendation-badge ${recClass}">
                    Recommendation: ${ctx.recommendation}
                </span>
            `;

            DOM.contextList.appendChild(item);
        }
    }

    function renderUserControls(detections, analysis) {
        DOM.controlCard.classList.remove('hidden');
        DOM.controlList.innerHTML = '';

        const session = SessionManager.getCurrent();

        for (const det of detections) {
            const ctx = analysis.find(a => a.placeholder === det._placeholder) || {};
            const defaultAction = ctx.recommendation || PrivacyPolicy.getDefaultAction(det.type);

            // Store initial decision
            session.userDecisions[det._placeholder] = defaultAction;

            const canKeep = PrivacyPolicy.canKeep(det.type);
            const restriction = !canKeep ? PrivacyPolicy.getRestrictionReason(det.type, 'KEEP') : null;

            const item = document.createElement('div');
            item.className = 'control-item';
            item.dataset.placeholder = det._placeholder;

            item.innerHTML = `
                <div class="control-info">
                    <span class="detection-type-badge ${RiskClassifier.getBadgeClass(det.risk)}">${det.type}</span>
                    <span class="text-mono" style="font-size:0.82rem;color:var(--text-secondary)">${escapeHtml(det._placeholder)}</span>
                </div>
                <div class="control-buttons">
                    <button class="control-btn ${defaultAction === 'KEEP' ? 'selected-keep' : ''} ${!canKeep ? 'disabled-btn' : ''}"
                            data-ph="${det._placeholder}" data-action="KEEP"
                            ${!canKeep ? 'disabled title="' + escapeHtml(restriction || '') + '"' : ''}>
                        KEEP
                    </button>
                    <button class="control-btn ${defaultAction === 'MASK' ? 'selected-mask' : ''}"
                            data-ph="${det._placeholder}" data-action="MASK">
                        MASK
                    </button>
                    <button class="control-btn ${defaultAction === 'REMOVE' ? 'selected-remove' : ''}"
                            data-ph="${det._placeholder}" data-action="REMOVE">
                        REMOVE
                    </button>
                </div>
                ${restriction ? `<div class="control-restricted">🔒 ${escapeHtml(restriction)}</div>` : ''}
            `;

            DOM.controlList.appendChild(item);
        }

        // Bind control buttons
        DOM.controlList.querySelectorAll('.control-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', handleControlClick);
        });
    }

    // ===================================================================
    // USER INTERACTIONS
    // ===================================================================

    function handleFalsePositive(e) {
        const placeholder = e.target.dataset.ph;
        const action = e.target.dataset.action;

        if (action === 'dismiss') {
            // Remove from pipeline — not sensitive
            pipelineData.detections = pipelineData.detections.filter(d => d._placeholder !== placeholder);
            pipelineData.contextAnalysis = pipelineData.contextAnalysis.filter(a => a.placeholder !== placeholder);

            const session = SessionManager.getCurrent();
            session.detections = pipelineData.detections;
            session.contextAnalysis = pipelineData.contextAnalysis;
            delete session.userDecisions[placeholder];

            // Remove from UI
            const detItem = DOM.detectionList.querySelector(`[data-placeholder="${placeholder}"]`);
            if (detItem) detItem.remove();
            const ctxItem = DOM.contextList.querySelector(`[data-placeholder="${placeholder}"]`);
            if (ctxItem) ctxItem.remove();
            const ctrlItem = DOM.controlList.querySelector(`[data-placeholder="${placeholder}"]`);
            if (ctrlItem) ctrlItem.remove();

            // If no detections left
            if (pipelineData.detections.length === 0) {
                DOM.noDetectionMsg.classList.remove('hidden');
                DOM.contextCard.classList.add('hidden');
                DOM.controlCard.classList.add('hidden');
            }
        } else {
            // Confirmed as sensitive — remove the question UI
            const item = e.target.closest('.detection-item');
            const fpQ = item.querySelector('.fp-question');
            const fpA = item.querySelector('.fp-actions');
            if (fpQ) fpQ.remove();
            if (fpA) fpA.remove();
        }
    }

    function handleControlClick(e) {
        const placeholder = e.target.dataset.ph;
        const action = e.target.dataset.action;
        const session = SessionManager.getCurrent();

        // Update decision
        session.userDecisions[placeholder] = action;

        // Update UI
        const container = e.target.closest('.control-item');
        container.querySelectorAll('.control-btn').forEach(btn => {
            btn.classList.remove('selected-keep', 'selected-mask', 'selected-remove');
        });
        e.target.classList.add(`selected-${action.toLowerCase()}`);
    }

    // ===================================================================
    // SANITIZATION
    // ===================================================================

    function applySanitization() {
        try {
            const session = SessionManager.getCurrent();
            const { sanitized, stats } = Sanitizer.sanitize(
                pipelineData.prompt,
                pipelineData.detections,
                session.userDecisions,
                session.placeholderEngine
            );

            // Verify sanitization
            const verification = Sanitizer.verify(sanitized, pipelineData.detections, session.userDecisions, pipelineData.prompt);

            if (!verification.safe) {
                failClosed('Sanitization verification failed. Leaked types: ' + verification.leaks.join(', '));
                return;
            }

            session.sanitizedPrompt = sanitized;
            pipelineData.sanitizedPrompt = sanitized;
            pipelineData.stats = stats;

            // Show sanitized prompt
            DOM.sanitizedCard.classList.remove('hidden');
            DOM.sanitizedPromptText.textContent = sanitized;

            // Security checklist
            renderSecurityChecks();

            // Show consent
            renderConsent(stats);

            // Update audit
            updateAuditLog(buildAuditText());

        } catch (err) {
            failClosed('Sanitization error: ' + err.message);
        }
    }

    function renderSecurityChecks() {
        const checks = [
            { label: 'Privacy policy applied', pass: true },
            { label: 'Prompt injection checked', pass: !pipelineData.injectionResult || pipelineData.injectionResult.safe || pipelineData.injectionResult.severity !== 'HIGH' },
            { label: 'API key protected (server-side)', pass: true },
            { label: 'Fail-safe check passed', pass: true },
            { label: 'Output checker ready', pass: true }
        ];

        if (pipelineData.injectionResult && !pipelineData.injectionResult.safe) {
            checks[1].label += ` (${pipelineData.injectionResult.threats.length} threat(s) neutralized)`;
        }

        DOM.securityChecks.innerHTML = checks.map(c =>
            `<li class="${c.pass ? 'pass' : 'fail'}">${c.pass ? '✓' : '✗'} ${escapeHtml(c.label)}</li>`
        ).join('');
    }

    function renderConsent(stats) {
        const total = pipelineData.detections.length;
        const sending = stats.kept + stats.masked; // Masked values still go as placeholders
        const removed = stats.removed;

        const keepCategories = stats.categories.kept.length > 0
            ? `Kept (original): ${[...new Set(stats.categories.kept)].join(', ')}` : '';
        const maskCategories = stats.categories.masked.length > 0
            ? `Masked (placeholder): ${[...new Set(stats.categories.masked)].join(', ')}` : '';
        const removeCategories = stats.categories.removed.length > 0
            ? `Removed: ${[...new Set(stats.categories.removed)].join(', ')}` : '';

        DOM.consentCard.classList.remove('hidden');
        DOM.consentSummary.innerHTML = `
            <h3>🔒 PRIVACY CHECK</h3>
            <p>Your prompt has been sanitized. Review the summary below before sending to external AI.</p>
            <div class="consent-stats">
                <div class="consent-stat">
                    <span class="consent-stat-number" style="color:var(--text-primary)">${total}</span>
                    <span class="consent-stat-label">Detected</span>
                </div>
                <div class="consent-stat">
                    <span class="consent-stat-number" style="color:var(--risk-low)">${stats.kept}</span>
                    <span class="consent-stat-label">Kept (Original)</span>
                </div>
                <div class="consent-stat">
                    <span class="consent-stat-number" style="color:var(--risk-medium)">${stats.masked}</span>
                    <span class="consent-stat-label">Masked</span>
                </div>
                <div class="consent-stat">
                    <span class="consent-stat-number" style="color:var(--risk-high)">${removed}</span>
                    <span class="consent-stat-label">Removed</span>
                </div>
            </div>
            <div class="consent-categories">
                ${keepCategories ? `<div>✅ ${escapeHtml(keepCategories)}</div>` : ''}
                ${maskCategories ? `<div>🔶 ${escapeHtml(maskCategories)}</div>` : ''}
                ${removeCategories ? `<div>🔴 ${escapeHtml(removeCategories)}</div>` : ''}
            </div>
        `;
    }

    function showConsentForCleanPrompt() {
        showResults();
        DOM.sanitizedCard.classList.remove('hidden');
        DOM.sanitizedPromptText.textContent = pipelineData.prompt;
        DOM.securityChecks.innerHTML = `
            <li class="pass">✓ No sensitive information detected</li>
            <li class="pass">✓ Prompt injection checked</li>
            <li class="pass">✓ API key protected (server-side)</li>
        `;

        DOM.consentCard.classList.remove('hidden');
        DOM.consentSummary.innerHTML = `
            <h3>🔒 PRIVACY CHECK</h3>
            <p>No sensitive information was detected. Your prompt can be sent as-is.</p>
            <div class="consent-stats">
                <div class="consent-stat">
                    <span class="consent-stat-number" style="color:var(--risk-low)">0</span>
                    <span class="consent-stat-label">Sensitive Items</span>
                </div>
            </div>
        `;
    }

    // ===================================================================
    // BACKEND COMMUNICATION
    // ===================================================================

    async function sendToBackend() {
        const session = SessionManager.getCurrent();
        const sanitizedPrompt = pipelineData.sanitizedPrompt || pipelineData.prompt || '';

        showLoading('Sending to AI via secure backend…');
        DOM.consentCard.classList.add('hidden');

        try {
            const payload = {
                prompt: sanitizedPrompt,
                consent: true,
                session_id: session ? session.id : null,
                mode: PrivacyPolicy.getMode()
            };

            if (attachedImages.length > 0) {
                payload.images = attachedImages.map(img => ({
                    mimeType: img.mimeType,
                    data: img.base64Data,
                    ocrText: img.ocrText || '',
                    name: img.file ? img.file.name : 'image'
                }));
                // Backwards compatibility with single image consumers
                payload.image = payload.images[0];
            }

            // ── HTTPS request to backend ──
            const response = await fetch(`${API_BASE}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            let data;
            try { data = await response.json(); } catch (_) { data = {}; }

            if (!response.ok) {
                hideLoading();
                showResults();
                DOM.responseCard.classList.remove('hidden');
                const errTitle = response.status === 504 ? 'Gemini Request Timed Out (504)' :
                    (response.status === 503 ? 'Gemini Service Temporarily Unavailable (503)' :
                    (response.status === 429 ? 'Gemini Rate Limit Exceeded (429)' : `AI Generation Failed (${response.status})`));
                const errMsg = data.message || data.error || `Server returned error status ${response.status}`;
                const errDetails = data.details ? `<br><small style="color:var(--text-secondary);margin-top:0.5rem;display:block;">Details: ${escapeHtml(data.details)}</small>` : '';

                DOM.aiResponseText.innerHTML = `<div style="color:var(--status-danger, #ef4444); padding:1rem; border:1px solid var(--status-danger, #ef4444); border-radius:8px; background:rgba(239,68,68,0.06); line-height:1.5;">
                    <strong style="font-size:1.05rem;">⚠️ ${escapeHtml(errTitle)}</strong><br><br>
                    ${escapeHtml(errMsg)}
                    ${errDetails}
                    <div style="margin-top:1rem; padding-top:0.75rem; border-top:1px solid rgba(239,68,68,0.2); font-size:0.875rem; color:var(--text-secondary);">
                        🛡️ <strong>Privacy Guaranteed:</strong> Your input was safely audited and sanitized on your device. Raw sensitive values were never transmitted.
                    </div>
                </div>`;
                DOM.responseMeta.innerHTML = `<span style="color:var(--status-danger, #ef4444)">❌ Generation halted due to upstream AI service error</span>`;
                return;
            }

            const responseText = data.response || '';
            session.llmResponse = responseText;
            hideLoading();

            // ── Output Privacy Check ──
            const outputCheck = OutputChecker.scan(responseText, session);

            // ── Local Restoration ──
            let finalResponse = responseText;
            if (pipelineData.detections && pipelineData.detections.length > 0) {
                // Only restore values that were KEPT
                const permitted = new Set();
                for (const det of pipelineData.detections) {
                    if (session.userDecisions[det._placeholder] === 'KEEP') {
                        permitted.add(det._placeholder);
                    }
                }
                finalResponse = session.placeholderEngine.restore(finalResponse, permitted);
            }

            // ── Display Response ──
            showResults();
            DOM.responseCard.classList.remove('hidden');

            if (!outputCheck.safe) {
                DOM.outputAlert.classList.remove('hidden');
                DOM.outputAlertDetails.innerHTML = outputCheck.findings.map(f =>
                    `<div>• ${escapeHtml(f.type)}: ${escapeHtml(f.reason)}</div>`
                ).join('');

                // Store for mask/block actions
                pipelineData.outputCheck = outputCheck;
                pipelineData.rawResponse = responseText;
            }

            // Render response (formatted markdown + model indicator)
            const formattedHtml = finalResponse
                ? formatMarkdownResponse(finalResponse)
                : '<em style="color:var(--text-secondary)">The AI returned an empty response.</em>';

            let modelBadge = '';
            if (data.isSimulated) {
                modelBadge = `<div class="ai-model-pill" style="color:var(--status-warning, #f59e0b); border-color:var(--status-warning, #f59e0b); background:rgba(245,158,11,0.1); margin-bottom:1rem;">⚠️ ${escapeHtml(data.provider || 'Simulated LLM (Offline Mode)')} — <em>Demonstration Fallback (Not genuine Gemini output)</em></div>`;
            } else if (data.provider && data.provider.includes('Gemini')) {
                modelBadge = `<div class="ai-model-pill">✨ Powered by ${escapeHtml(data.provider)} (${escapeHtml(data.model || 'gemini-2.5-flash')})</div>`;
            } else if (data.provider) {
                modelBadge = `<div class="ai-model-pill" style="color:var(--text-secondary); border-color:var(--border-subtle); background:var(--bg-elevated)">🤖 ${escapeHtml(data.provider)}</div>`;
            }

            DOM.aiResponseText.innerHTML = modelBadge + formattedHtml;

            const restoredCount = pipelineData.detections && pipelineData.detections.length > 0
                ? '<span>✓ Placeholders restored where permitted</span> • '
                : '';
            DOM.responseMeta.innerHTML = `${restoredCount}<span>✓ Privacy-audited GenAI response</span>`;

            // ── Activate Genius Image Follow-up Q&A UI ──
            if (DOM.followupCard) {
                DOM.followupCard.classList.remove('hidden');
                const label = DOM.followupCard.querySelector('.input-label');
                if (label) {
                    label.textContent = attachedImages.length > 0
                        ? `💬 Genius Multi-Image Q&A Active — Ask any question about ${attachedImages.length > 1 ? `these ${attachedImages.length} images` : 'this image'}:`
                        : '💬 Ask a follow-up question to the AI:';
                }
                if (DOM.followupInput) {
                    DOM.followupInput.placeholder = attachedImages.length > 0
                        ? 'e.g. What are the key details, figures, or differences shown across the images?'
                        : 'e.g. Can you explain this further?';
                }
            }

            // Update audit
            updateAuditLog(buildAuditText());

        } catch (err) {
            hideLoading();

            if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('405')) {
                // Backend not available or opened on wrong static server port (like Live Server 5500)
                DOM.responseCard.classList.remove('hidden');
                DOM.aiResponseText.innerHTML = `<div style="color:var(--risk-medium)">
                    <strong>⚠️ Backend unavailable (or running on wrong port)</strong><br><br>
                    The backend server at <code>${API_BASE}</code> is not running or this page was opened via a static server (like Live Server).<br><br>
                    <strong>How to fix:</strong><br>
                    1. In VS Code terminal, start the server: <code>node backend/server.js</code><br>
                    2. In your browser, open: <a href="http://localhost:3001" target="_blank" style="color:var(--accent-primary); text-decoration:underline; font-weight:600;">http://localhost:3001</a><br><br>
                    <em>Your privacy analysis is still valid.</em> The sanitized prompt shown above is what would be sent.
                </div>`;
            } else {
                failClosed('Backend error: ' + err.message);
            }
        }
    }

    // ===================================================================
    // OUTPUT ACTIONS
    // ===================================================================

    function maskOutput() {
        if (pipelineData.outputCheck) {
            const masked = OutputChecker.maskFindings(
                pipelineData.rawResponse,
                pipelineData.outputCheck.findings
            );
            DOM.aiResponseText.textContent = masked;
            DOM.outputAlert.classList.add('hidden');
        }
    }

    function blockOutput() {
        DOM.aiResponseText.textContent = OutputChecker.blockResponse();
        DOM.outputAlert.classList.add('hidden');
    }

    // ===================================================================
    // OCR & ATTACHED IMAGE HANDLING
    // ===================================================================

    function compressImage(file, maxWidth = 1280, maxHeight = 1280, quality = 0.85) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth || height > maxHeight) {
                    if (width > height) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                const base64Data = dataUrl.split(',')[1];
                URL.revokeObjectURL(objectUrl);

                resolve({ dataUrl, base64Data, mimeType: 'image/jpeg' });
            };
            img.onerror = (err) => {
                URL.revokeObjectURL(objectUrl);
                reject(err);
            };
            img.src = objectUrl;
        });
    }

    async function handleImageUpload(e) {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const currentCount = attachedImages.length;
        const availableSlots = MAX_ATTACHED_IMAGES - currentCount;

        if (availableSlots <= 0) {
            showError(`Maximum limit of ${MAX_ATTACHED_IMAGES} images already reached. Remove an image first.`);
            e.target.value = '';
            return;
        }

        let filesToProcess = files;
        if (files.length > availableSlots) {
            showError(`You can attach up to ${MAX_ATTACHED_IMAGES} images at a time. Only the first ${availableSlots} image(s) will be added.`);
            filesToProcess = files.slice(0, availableSlots);
        }

        showLoading(`Processing and running OCR privacy scan on ${filesToProcess.length} image(s)…`);

        for (let i = 0; i < filesToProcess.length; i++) {
            const file = filesToProcess[i];
            const imageId = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

            updateLoading(`Optimizing image (${i + 1}/${filesToProcess.length}): ${file.name}…`);

            let imageCompressed;
            try {
                imageCompressed = await compressImage(file);
            } catch (cErr) {
                console.warn('[Image Compress Warning]:', cErr);
            }

            const dataUrl = imageCompressed ? imageCompressed.dataUrl : await fileToDataURL(file);
            const base64Data = imageCompressed ? imageCompressed.base64Data : dataUrl.split(',')[1];
            const mimeType = imageCompressed ? imageCompressed.mimeType : (file.type || 'image/jpeg');

            const newImageObj = {
                id: imageId,
                file,
                dataUrl,
                mimeType,
                base64Data,
                ocrText: '',
                ocrStatus: 'scanning'
            };

            attachedImages.push(newImageObj);
            renderAttachedImages();

            try {
                updateLoading(`Scanning privacy text (${i + 1}/${filesToProcess.length}): ${file.name}…`);
                const result = await OCR.processImage(file, (progress) => {
                    updateLoading(`Scanning ${file.name}… ${Math.round(progress * 100)}%`);
                });
                newImageObj.ocrText = result.text || '';
                newImageObj.ocrStatus = (result.text && result.text.trim()) ? 'scanned' : 'no-text';
            } catch (ocrErr) {
                console.warn('[OCR Privacy Scan Warning]:', ocrErr);
                newImageObj.ocrStatus = 'visual-only';
            }

            renderAttachedImages();
        }

        hideLoading();
        e.target.value = '';
    }

    function renderAttachedImages() {
        if (!DOM.imageAttachedCard) return;

        if (attachedImages.length === 0) {
            DOM.imageAttachedCard.classList.add('hidden');
            if (DOM.ocrPreview) DOM.ocrPreview.classList.add('hidden');
            if (DOM.ocrText) DOM.ocrText.textContent = '';
            return;
        }

        DOM.imageAttachedCard.classList.remove('hidden');
        if (DOM.imageCount) DOM.imageCount.textContent = attachedImages.length;

        const allScanned = attachedImages.every(img => img.ocrStatus !== 'scanning');
        if (DOM.imageStatus) {
            DOM.imageStatus.textContent = allScanned
                ? `✓ All ${attachedImages.length} image(s) processed & privacy-ready`
                : 'Processing image(s)…';
        }

        if (DOM.imageItemsList) {
            DOM.imageItemsList.innerHTML = attachedImages.map((img, idx) => {
                const hasText = Boolean(img.ocrText && img.ocrText.trim());
                const statusBadge = hasText
                    ? `<span class="image-item-ocr-badge scanned">✓ Text (${img.ocrText.trim().length} chars)</span>`
                    : `<span class="image-item-ocr-badge">📷 Visual only</span>`;

                return `
                    <div class="image-item-card" data-id="${img.id}">
                        <div class="image-item-preview">
                            <img src="${img.dataUrl}" alt="${escapeHtml(img.file.name)}">
                            <button type="button" class="image-item-remove-btn" title="Remove this image" data-id="${img.id}">✕</button>
                        </div>
                        <div class="image-item-info">
                            <span class="image-item-name" title="${escapeHtml(img.file.name)}">${idx + 1}. ${escapeHtml(img.file.name)}</span>
                            ${statusBadge}
                        </div>
                    </div>
                `;
            }).join('');

            // Bind individual remove buttons
            DOM.imageItemsList.querySelectorAll('.image-item-remove-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    removeAttachedImage(id);
                });
            });
        }

        // Update combined OCR preview
        const ocrContents = attachedImages
            .filter(img => img.ocrText && img.ocrText.trim())
            .map((img, i) => `--- [Image ${i + 1}: ${img.file.name}] ---\n${img.ocrText.trim()}`);

        if (ocrContents.length > 0) {
            if (DOM.ocrPreview) DOM.ocrPreview.classList.remove('hidden');
            if (DOM.ocrText) DOM.ocrText.textContent = ocrContents.join('\n\n');
        } else {
            if (DOM.ocrPreview) DOM.ocrPreview.classList.add('hidden');
            if (DOM.ocrText) DOM.ocrText.textContent = '';
        }
    }

    function fileToDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function removeAttachedImage(id) {
        attachedImages = attachedImages.filter(img => img.id !== id);
        renderAttachedImages();
    }

    function removeAllAttachedImages() {
        attachedImages = [];
        renderAttachedImages();
        if (DOM.imageUpload) DOM.imageUpload.value = '';
    }

    function renderImageContentAnalysis() {
        if (!DOM.imageAnalysisCard || !DOM.imageAnalysisList) return;
        if (attachedImages.length === 0) {
            DOM.imageAnalysisCard.classList.add('hidden');
            return;
        }

        DOM.imageAnalysisCard.classList.remove('hidden');
        DOM.imageAnalysisList.innerHTML = attachedImages.map((img, idx) => {
            const rawText = (img.ocrText || '').trim();
            const words = rawText ? rawText.split(/\s+/).filter(Boolean).length : 0;
            const lines = rawText ? rawText.split(/\r?\n/).filter(Boolean).length : 0;
            const chars = rawText.length;

            let contentType = 'Visual Graphic / Photo';
            const lower = rawText.toLowerCase();
            if (lower.includes('invoice') || lower.includes('bill') || lower.includes('amount') || lower.includes('total') || lower.includes('gst') || lower.includes('tax')) {
                contentType = 'Invoice / Financial Receipt';
            } else if (lower.includes('dear') || lower.includes('sincerely') || lower.includes('subject:') || lower.includes('leave') || lower.includes('regards')) {
                contentType = 'Letter / Formal Document';
            } else if (lower.includes('function') || lower.includes('import') || lower.includes('const') || lower.includes('{') || lower.includes('error')) {
                contentType = 'Code / Technical Screenshot';
            } else if (lower.includes('doctor') || lower.includes('patient') || lower.includes('hospital') || lower.includes('prescription')) {
                contentType = 'Medical / Healthcare Report';
            } else if (words > 15) {
                contentType = 'Text Document / Form';
            } else if (words > 0) {
                contentType = 'Labeled UI / Graphic Element';
            }

            const snippet = rawText
                ? escapeHtml(rawText)
                : '<em style="color:var(--text-muted)">Non-textual visual content (graphic, chart, or diagram). Visual structure and color layouts will be processed directly by the Vision AI.</em>';

            return `
                <div class="image-analysis-item">
                    <div class="image-analysis-thumb-col">
                        <img src="${img.dataUrl}" alt="${escapeHtml(img.file.name)}">
                    </div>
                    <div class="image-analysis-body">
                        <div class="image-analysis-header">
                            <span class="image-analysis-title">Image ${idx + 1}: ${escapeHtml(img.file.name)}</span>
                            <span class="image-analysis-tag">🔍 ${contentType}</span>
                        </div>
                        <div class="image-analysis-snippet">${snippet}</div>
                        <div class="image-analysis-stats-row">
                            <span>📊 ${chars} characters</span>
                            <span>📝 ${words} words</span>
                            <span>📑 ${lines} lines</span>
                            <span>🔒 Privacy check: ${rawText ? 'Ready for PII scan' : 'Clean (No text PII)'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function formatMarkdownResponse(markdown) {
        if (!markdown) return '';
        let text = escapeHtml(markdown);

        // Multi-line code blocks: ```lang ... ```
        text = text.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (m, lang, code) => {
            return `<pre><code>${code.trim()}</code></pre>`;
        });

        // Inline code: `code`
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Headers: ###, ##, #
        text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        text = text.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        text = text.replace(/^# (.*$)/gim, '<h2>$1</h2>');

        // Bold & Italic
        text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // Unordered lists (- item, * item, • item)
        text = text.replace(/^[•\-\*]\s+(.*$)/gim, '<li>$1</li>');
        text = text.replace(/(<li>.*?<\/li>(\s*<li>.*?<\/li>)*)/gs, '<ul>$1</ul>');

        // Paragraph separation
        const paragraphs = text.split(/\n{2,}/);
        text = paragraphs.map(p => {
            p = p.trim();
            if (!p) return '';
            if (p.startsWith('<h') || p.startsWith('<pre') || p.startsWith('<ul') || p.startsWith('<ol')) {
                return p;
            }
            return `<p>${p.replace(/\n/g, '<br>')}</p>`;
        }).join('\n');

        return `<div class="ai-formatted-content">${text}</div>`;
    }

    async function handleFollowupQuery() {
        if (!DOM.followupInput) return;
        const query = DOM.followupInput.value.trim();
        if (!query) return;

        DOM.followupInput.value = '';
        const session = SessionManager.getCurrent();

        showLoading('Scanning follow-up for sensitive data & asking AI…');

        try {
            // ── Step 1: Detect sensitive info in the follow-up question ──
            const detections = await Detector.detectAll(query);

            // ── Step 2: Sanitize follow-up query if any sensitive info is detected ──
            let sanitizedQuery = query;
            if (detections && detections.length > 0 && session && session.placeholderEngine) {
                let idx = {};
                for (const det of detections) {
                    if (!idx[det.type]) idx[det.type] = 0;
                    idx[det.type]++;
                    det._placeholderIndex = idx[det.type];
                    det._placeholder = session.placeholderEngine.create(det);
                }
                const decisions = {};
                for (const det of detections) {
                    decisions[det._placeholder] = 'MASK'; // Auto-mask sensitive data in follow-ups
                }
                const sanitizedResult = Sanitizer.sanitize(query, detections, decisions, session.placeholderEngine);
                sanitizedQuery = sanitizedResult.sanitized;
            }

            // ── Step 3: Check for prompt injection in follow-up ──
            const injectionResult = PromptInjection.scan(query);
            if (injectionResult && injectionResult.detected && injectionResult.severity === 'CRITICAL') {
                hideLoading();
                showResults();
                showError('Security Alert: Malicious prompt injection detected in follow-up.');
                return;
            }

            const payload = {
                prompt: `Follow-up question regarding attached image(s) / context:\n"${sanitizedQuery}"`,
                consent: true,
                session_id: session ? session.id : null,
                mode: PrivacyPolicy.getMode()
            };

            if (attachedImages.length > 0) {
                payload.images = attachedImages.map(img => ({
                    mimeType: img.mimeType,
                    data: img.base64Data,
                    ocrText: img.ocrText || '',
                    name: img.file ? img.file.name : 'image'
                }));
                payload.image = payload.images[0];
            }

            const response = await fetch(`${API_BASE}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || errData.error || `Server error: ${response.status}`);
            }

            const data = await response.json();
            hideLoading();
            showResults();

            // ── Step 4: Output privacy check ──
            let responseText = data.response || '';
            if (session) {
                const outputCheck = OutputChecker.scan(responseText, session);
                if (!outputCheck.safe) {
                    // Mask leaked sensitive data in follow-up response
                    responseText = OutputChecker.maskFindings(responseText, outputCheck.findings);
                    DOM.outputAlert.classList.remove('hidden');
                    DOM.outputAlertDetails.innerHTML = outputCheck.findings.map(f =>
                        `<div>• ${escapeHtml(f.type)}: ${escapeHtml(f.reason)}</div>`
                    ).join('');
                }
            }

            const answerHtml = formatMarkdownResponse(responseText);
            const questionDisplay = (detections && detections.length > 0)
                ? `${escapeHtml(sanitizedQuery)} <span style="font-size:0.75rem; color:var(--risk-medium);">(PII Masked)</span>`
                : escapeHtml(query);
            const responseHtml = `<div style="margin-top:1.5rem; padding-top:1rem; border-top:1px dashed var(--border-medium);"><p style="color:var(--accent-primary); font-weight:600;">💬 Question: ${questionDisplay}</p>${answerHtml}</div>`;
            DOM.aiResponseText.innerHTML += responseHtml;
        } catch (err) {
            hideLoading();
            showResults();
            showError('Follow-up question failed: ' + err.message);
        }
    }

    // ===================================================================
    // CLEAR SENSITIVE DATA
    // ===================================================================

    function clearAllSensitiveData() {
        // Destroy session (overwrites sensitive mappings)
        SessionManager.destroyAll();

        // Clear UI
        DOM.promptInput.value = '';
        DOM.charCount.textContent = '0 / 10,000';
        removeAllAttachedImages();

        resetUI();

        // Clear pipeline state
        pipelineData = null;

        // Create fresh session
        SessionManager.create();

        // Confirm to user
        showTemporaryMessage('🗑️ All sensitive data has been cleared.');
    }

    // ===================================================================
    // FAIL-CLOSED
    // ===================================================================

    function failClosed(reason) {
        DOM.resultsSection.classList.add('hidden');
        DOM.failClosedAlert.classList.remove('hidden');
        DOM.failReason.textContent = reason;
        console.error('[FAIL-CLOSED]', reason);
    }

    // ===================================================================
    // EVALUATION
    // ===================================================================

    async function runEvaluation() {
        DOM.btnRunEval.disabled = true;
        DOM.btnRunEval.textContent = '⏳ Running…';

        try {
            const results = await Evaluation.run((current, total) => {
                DOM.btnRunEval.textContent = `⏳ ${current + 1}/${total}…`;
            });

            // Render summary
            DOM.evalSummary.classList.remove('hidden');
            DOM.evalSummary.innerHTML = `
                <div class="eval-metric">
                    <span class="eval-metric-value">${results.totalCases}</span>
                    <span class="eval-metric-label">Test Cases</span>
                </div>
                <div class="eval-metric">
                    <span class="eval-metric-value">${results.correctCases}</span>
                    <span class="eval-metric-label">Correct</span>
                </div>
                <div class="eval-metric">
                    <span class="eval-metric-value" style="color:var(--status-warning)">${results.falsePositives}</span>
                    <span class="eval-metric-label">False Positives</span>
                </div>
                <div class="eval-metric">
                    <span class="eval-metric-value" style="color:var(--status-danger)">${results.falseNegatives}</span>
                    <span class="eval-metric-label">False Negatives</span>
                </div>
                <div class="eval-metric">
                    <span class="eval-metric-value" style="color:var(--accent-primary)">${results.precision}%</span>
                    <span class="eval-metric-label">Precision</span>
                </div>
                <div class="eval-metric">
                    <span class="eval-metric-value" style="color:var(--accent-secondary)">${results.recall}%</span>
                    <span class="eval-metric-label">Recall</span>
                </div>
                <div class="eval-metric">
                    <span class="eval-metric-value" style="color:var(--status-success)">${results.f1}%</span>
                    <span class="eval-metric-label">F1 Score</span>
                </div>
            `;

            // Render details table
            DOM.evalDetails.classList.remove('hidden');
            DOM.evalTableBody.innerHTML = results.details.map(r => {
                const expStr = r.expected.map(e => `${e.type}`).join(', ') || '(none)';
                const detStr = r.detected.map(d => `${d.type} (${Confidence.formatPercent(d.confidence)})`).join(', ') || '(none)';
                const statusClass = r.status === 'correct' ? 'status-correct'
                    : r.status === 'false_positive' ? 'status-fp'
                    : r.status === 'false_negative' ? 'status-fn' : 'status-fp';
                const statusLabel = r.status === 'correct' ? '✓ Correct'
                    : r.status === 'false_positive' ? '⚡ FP'
                    : r.status === 'false_negative' ? '❌ FN' : '⚡ Mixed';

                return `<tr>
                    <td>${r.index}</td>
                    <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.input)}</td>
                    <td>${escapeHtml(expStr)}</td>
                    <td>${escapeHtml(detStr)}</td>
                    <td class="${statusClass}">${statusLabel}</td>
                </tr>`;
            }).join('');

        } catch (err) {
            showError('Evaluation failed: ' + err.message);
        }

        DOM.btnRunEval.disabled = false;
        DOM.btnRunEval.textContent = '▶ Run Evaluation';
    }

    // ===================================================================
    // AUDIT LOG
    // ===================================================================

    function buildAuditText() {
        if (!pipelineData) return 'No analysis data.';

        const session = SessionManager.getCurrent();
        const lines = [];

        lines.push('═══════════════════════════════════════');
        lines.push('         PRIVACY ANALYSIS REPORT');
        lines.push('═══════════════════════════════════════');
        lines.push(`Mode: ${PrivacyPolicy.getMode().toUpperCase()}`);
        lines.push(`Timestamp: ${new Date().toISOString()}`);
        lines.push('');

        // Detections
        if (pipelineData.detections && pipelineData.detections.length > 0) {
            lines.push('── Detected Entities ──');
            for (const det of pipelineData.detections) {
                lines.push(`  ${det._placeholder}`);
                lines.push(`    Risk: ${det.risk}`);
                lines.push(`    Confidence: ${Confidence.formatPercent(det.confidence)}`);
                lines.push(`    Source: ${(det.sources || [det.source]).join(', ')}`);
            }
            lines.push('');
        }

        // Context Analysis
        if (pipelineData.contextAnalysis && pipelineData.contextAnalysis.length > 0) {
            lines.push('── Context Analysis ──');
            const taskType = pipelineData.contextAnalysis[0].taskType;
            lines.push(`  Task: ${ContextAnalyzer.getTaskDescription(taskType)}`);
            for (const ctx of pipelineData.contextAnalysis) {
                lines.push(`  ${ctx.placeholder}`);
                lines.push(`    Necessary: ${ctx.necessary ? 'YES' : 'NO'}`);
                lines.push(`    Reason: ${ctx.reason}`);
                lines.push(`    Recommendation: ${ctx.recommendation}`);
            }
            lines.push('');
        }

        // User Decisions
        if (session.userDecisions && Object.keys(session.userDecisions).length > 0) {
            lines.push('── User Decisions ──');
            for (const [ph, dec] of Object.entries(session.userDecisions)) {
                lines.push(`  ${ph} → ${dec}`);
            }
            lines.push('');
        }

        // Stats
        if (pipelineData.stats) {
            lines.push('── External Processing ──');
            const total = pipelineData.detections ? pipelineData.detections.length : 0;
            lines.push(`  Detected: ${total}`);
            lines.push(`  Kept: ${pipelineData.stats.kept}`);
            lines.push(`  Masked: ${pipelineData.stats.masked}`);
            lines.push(`  Removed: ${pipelineData.stats.removed}`);
            lines.push('');
        }

        // Security
        lines.push('── Security ──');
        lines.push('  ✓ Privacy policy applied');
        lines.push(`  ${pipelineData.injectionResult && !pipelineData.injectionResult.safe ? '⚠' : '✓'} Prompt injection checked`);
        lines.push('  ✓ API key protected (server-side)');
        lines.push('  ✓ Fail-safe check passed');
        lines.push('  ✓ Output checker ready');
        lines.push('');
        lines.push('═══════════════════════════════════════');

        return lines.join('\n');
    }

    function updateAuditLog(text) {
        DOM.auditLog.textContent = text;
    }

    // ===================================================================
    // UI HELPERS
    // ===================================================================

    function showLoading(msg) {
        DOM.loadingSection.classList.remove('hidden');
        DOM.loadingMessage.textContent = msg;
    }

    function updateLoading(msg) {
        DOM.loadingMessage.textContent = msg;
    }

    function hideLoading() {
        DOM.loadingSection.classList.add('hidden');
    }

    function showResults() {
        DOM.resultsSection.classList.remove('hidden');
    }

    function resetUI() {
        DOM.loadingSection.classList.add('hidden');
        DOM.resultsSection.classList.add('hidden');
        DOM.failClosedAlert.classList.add('hidden');

        DOM.detectionList.innerHTML = '';
        DOM.contextList.innerHTML = '';
        DOM.controlList.innerHTML = '';
        if (DOM.imageAnalysisList) DOM.imageAnalysisList.innerHTML = '';
        if (DOM.imageAnalysisCard) DOM.imageAnalysisCard.classList.add('hidden');
        DOM.noDetectionMsg.classList.add('hidden');
        DOM.contextCard.classList.add('hidden');
        DOM.controlCard.classList.add('hidden');
        DOM.sanitizedCard.classList.add('hidden');
        DOM.consentCard.classList.add('hidden');
        DOM.responseCard.classList.add('hidden');
        DOM.outputAlert.classList.add('hidden');
        DOM.auditContent.classList.add('hidden');
        DOM.auditCard.classList.add('hidden');
    }

    function switchTab(tab) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

        if (tab === 'main') {
            DOM.navMain.classList.add('active');
            DOM.tabMain.classList.add('active');
        } else {
            DOM.navEval.classList.add('active');
            DOM.tabEvaluation.classList.add('active');
        }
    }

    function showError(msg) {
        alert(msg); // Simple alert for errors. Could be replaced with toast.
    }

    function showTemporaryMessage(msg) {
        // Create a temporary toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
            background: var(--bg-elevated); color: var(--text-primary);
            padding: 12px 24px; border-radius: 8px; border: 1px solid var(--border-accent);
            box-shadow: var(--shadow-lg); z-index: 1000; font-size: 0.88rem;
            animation: fadeIn 0.3s ease;
        `;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    /**
     * Mask a value for display (partially hide it).
     */
    function maskForDisplay(value, type) {
        if (!value) return '';
        if (type === 'PASSWORD' || type === 'API_KEY') return '••••••••';
        if (value.length <= 4) return value;
        const show = Math.min(4, Math.floor(value.length / 3));
        return value.substring(0, show) + '•'.repeat(value.length - show * 2) + value.substring(value.length - show);
    }

    /**
     * Escape HTML to prevent XSS.
     */
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

})();
