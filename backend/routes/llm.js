/* ============================================================
   LLM Routes — API Endpoints for LLM Interaction & Context Analysis
   ============================================================ */

const express = require('express');
const router = express.Router();
const { validateGenerateRequest } = require('../middleware/security');
const { generateResponse, analyzeContextLLM } = require('../services/llmService');

/**
 * POST /api/generate
 * Receives sanitized prompt + explicit user consent flag.
 * Forwards sanitized prompt to LLM and returns response.
 */
router.post('/generate', validateGenerateRequest, async (req, res) => {
  try {
    const { prompt, model, privacy_mode, image, images } = req.body;
    const imagesList = Array.isArray(images) ? images : (image && image.data ? [image] : []);

    console.log(`[API /generate] Processing request (Privacy Mode: ${privacy_mode || 'balanced'}, Images Attached: ${imagesList.length})`);

    const result = await generateResponse(prompt, { model, images: imagesList, image: imagesList[0] });

    return res.status(200).json({
      success: true,
      response: result.text,
      provider: result.provider,
      model: result.model,
      note: result.note || null,
      timestamp: result.timestamp
    });
  } catch (err) {
    console.error('[API /generate Error]:', err);
    return res.status(500).json({
      error: 'Generation Failed',
      message: 'An error occurred while generating AI response.',
      details: err.message
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
