/* ============================================================
   LLM Routes — API Endpoints for LLM Interaction & Context Analysis
   ============================================================ */

const express = require('express');
const router = express.Router();
const { validateGenerateRequest } = require('../middleware/security');
const { generateResponse, analyzeContextLLM, DEFAULT_CANDIDATE_MODELS } = require('../services/llmService');

/**
 * GET /api/models
 * Returns the verified supported Gemini candidate models and server status.
 */
router.get('/models', (req, res) => {
  res.status(200).json({
    success: true,
    supportedModels: DEFAULT_CANDIDATE_MODELS,
    offlineModeAvailable: true
  });
});

/**
 * POST /api/generate
 * Receives sanitized prompt + explicit user consent flag.
 * Forwards sanitized prompt to LLM and returns response.
 */
router.post('/generate', validateGenerateRequest, async (req, res) => {
  try {
    const { prompt, model, privacy_mode, image, images, allow_simulated_fallback } = req.body;
    const imagesList = Array.isArray(images) ? images : (image && image.data ? [image] : []);

    console.log(`[API /generate] Processing request (Privacy Mode: ${privacy_mode || 'balanced'}, Images Attached: ${imagesList.length})`);

    const result = await generateResponse(prompt, {
      model,
      images: imagesList,
      image: imagesList[0]
    });

    return res.status(200).json({
      success: true,
      response: result.text,
      provider: result.provider,
      model: result.model,
      isSimulated: Boolean(result.isSimulated),
      status: result.status || (result.isSimulated ? 'simulated' : 'success'),
      note: result.note || null,
      timestamp: result.timestamp
    });
  } catch (err) {
    console.error('[API /generate Error]:', err.message);

    // If caller explicitly requested simulated fallback when real Gemini fails
    if (req.body.allow_simulated_fallback === true && err.simulatedFallback) {
      return res.status(200).json({
        success: true,
        response: err.simulatedFallback.text,
        provider: err.simulatedFallback.provider,
        model: err.simulatedFallback.model,
        isSimulated: true,
        status: 'simulated_fallback',
        note: `Gemini unavailable (${err.code || '503'}). Displaying simulated demonstration output.`,
        errorDetails: err.details || err.message,
        timestamp: new Date().toISOString()
      });
    }

    const statusCode = err.statusCode || (err.message && err.message.includes('timed out') ? 504 : 503);
    return res.status(statusCode).json({
      success: false,
      error: err.code || 'Generation Failed',
      message: err.message || 'Gemini generation request failed.',
      details: err.details || err.message,
      provider: 'Google Gemini',
      isSimulated: false,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/context-analyze
 * Optional LLM-assisted context analyzer endpoint.
 * Receives ONLY sanitized placeholders + entity types (never raw PII values).
 */
router.post('/context-analyze', async (req, res) => {
  try {
    const { placeholders } = req.body;

    if (!Array.isArray(placeholders)) {
      return res.status(400).json({
        error: 'Invalid Payload',
        message: '"placeholders" must be an array of metadata objects.'
      });
    }

    // Ensure NO raw sensitive values are present in payload
    for (const p of placeholders) {
      if (p.value || p.raw) {
        return res.status(400).json({
          error: 'Privacy Violation',
          message: 'Raw sensitive values cannot be sent to context analysis endpoint. Send only placeholders and types.'
        });
      }
    }

    const analysis = await analyzeContextLLM(placeholders);

    if (analysis) {
      return res.status(200).json({ success: true, analysis });
    } else {
      return res.status(200).json({
        success: false,
        message: 'LLM analysis unavailable. Falling back to local rule-based analysis.'
      });
    }
  } catch (err) {
    console.error('[API /context-analyze Error]:', err);
    return res.status(500).json({
      error: 'Analysis Failed',
      message: err.message
    });
  }
});

module.exports = router;
