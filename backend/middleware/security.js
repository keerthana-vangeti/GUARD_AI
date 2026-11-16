/* ============================================================
   Security Middleware — Server-side security and validation
   ============================================================ */

/**
 * Validates request payload for /api/generate
 */
function validateGenerateRequest(req, res, next) {
  const { prompt, consent, session_id, image, images } = req.body;

  // 1. Check prompt text or attached image(s) existence
  const hasText = typeof prompt === 'string' && prompt.trim().length > 0;
  const imagesList = Array.isArray(images) ? images : (image && image.data ? [image] : []);
  const hasImage = imagesList.length > 0;

  if (!hasText && !hasImage) {
    return res.status(400).json({
      error: 'Invalid Payload',
      message: 'Request must contain either a text prompt or at least one attached image.'
    });
  }

  // 1b. Enforce maximum 5 images limit
  if (imagesList.length > 5) {
    return res.status(400).json({
      error: 'Too Many Images',
      message: 'A maximum of 5 images can be attached at a time.'
    });
  }

  // 2. Enforce explicit user consent flag
  if (consent !== true) {
    return res.status(403).json({
      error: 'Consent Required',
      message: 'Explicit user consent (consent: true) is required before sending prompt to LLM.'
    });
  }

  // 3. Request size limit check (max 10,000 characters for text prompt)
  if (hasText && prompt.length > 10000) {
    return res.status(413).json({
      error: 'Payload Too Large',
      message: 'Prompt text exceeds maximum length of 10,000 characters.'
    });
  }

  // 4. Verify no prompt injection override attempt in request header/body
  if (req.body.override_privacy === true || req.body.disable_guard === true) {
    return res.status(403).json({
      error: 'Security Policy Violation',
      message: 'Privacy policies cannot be bypassed or overridden via request parameters.'
    });
  }

  next();
}

/**
 * Audit Logger Middleware — NEVER logs sensitive data or prompt content.
 * Logs only anonymized metadata: timestamp, session ID (hashed/truncated), status.
 */
function auditLogger(req, res, next) {
  const start = Date.now();
  const sessionId = req.body?.session_id ? req.body.session_id.substring(0, 8) + '...' : 'anonymous';

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[AUDIT LOG] ${new Date().toISOString()} | ${req.method} ${req.originalUrl} | Session: ${sessionId} | Status: ${res.statusCode} | Duration: ${duration}ms`);
    // Note: NEVER log req.body.prompt or raw entity values to ensure strict zero-log privacy contract
  });

  next();
}

module.exports = {
  validateGenerateRequest,
  auditLogger
};
