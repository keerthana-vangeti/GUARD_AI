/* ============================================================
   LLM Service — Communicates with LLM Provider (Google Gemini)
   Handles prompt sending, formatting, timeout, retries, and fallback mock mode.
   ============================================================ */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Supported production Google Gemini models in order of price/performance and availability
const DEFAULT_CANDIDATE_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash'
];

// Initialize Gemini API client if key is provided
let genAI = null;
if (process.env.LLM_API_KEY && process.env.LLM_API_KEY !== 'your_gemini_api_key_here') {
  genAI = new GoogleGenerativeAI(process.env.LLM_API_KEY);
}

/**
 * Custom error class for Gemini Service errors
 */
class GeminiServiceError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'GeminiServiceError';
    this.statusCode = options.statusCode || 503;
    this.code = options.code || 'SERVICE_UNAVAILABLE';
    this.details = options.details || message;
    this.simulatedFallback = options.simulatedFallback || null;
  }
}

/**
 * Execute an async operation with exponential backoff and jitter for transient 429/503 errors.
 */
async function executeWithRetry(operation, { maxRetries = 1, baseDelay = 1000 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (err) {
      attempt++;
      const errMsg = err?.message || '';
      const status = err?.status || (errMsg.includes('503') ? 503 : (errMsg.includes('429') ? 429 : 0));
      const isTransient = status === 429 || status === 503 ||
        errMsg.includes('temporarily unavailable') ||
        errMsg.includes('high demand') ||
        errMsg.includes('RESOURCE_EXHAUSTED');

      // Fast-fail on non-retryable errors (e.g. 400 Bad Request, API key invalid)
      if (!isTransient || attempt > maxRetries) {
        throw err;
      }

      // Exponential backoff with random jitter to avoid thundering herd
      const jitter = Math.floor(Math.random() * 400);
      const delay = (baseDelay * Math.pow(2, attempt - 1)) + jitter;
      console.warn(`[LLM Service] Transient ${status || 'network'} error on attempt ${attempt} (${errMsg}). Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * Generates response from LLM using sanitized prompt.
 *
 * @param {string} prompt - Sanitized prompt (never contains raw PII unless user explicitly kept it)
 * @param {Object} options - Additional options (model, images, systemInstruction, timeoutMs)
 * @returns {Promise<Object>} Response object { text, provider, model, isSimulated, status, timestamp }
 */
async function generateResponse(prompt, options = {}) {
  // Normalize images array (support options.images array or options.image object)
  const images = Array.isArray(options.images)
    ? options.images.filter(img => Boolean(img && img.data))
    : (options.image && options.image.data ? [options.image] : []);

  const hasImage = images.length > 0;
  let promptText = (typeof prompt === 'string' ? prompt.trim() : '');
  if (!promptText && hasImage) {
    promptText = images.length > 1
      ? `You are an expert AI vision analyst. Carefully examine all ${images.length} attached images in detail — their visual layout, any text present, diagrams, data, colors, and content. Provide a comprehensive, insightful breakdown and comparison of what each image contains and what they mean together. End by inviting the user to ask follow-up questions.`
      : "You are an expert AI vision analyst. Carefully examine every detail of the attached image — its visual structure, any text present, diagrams, data, colours, and overall content. Provide a comprehensive, insightful breakdown of what the image contains and what it means. End by inviting the user to ask any follow-up questions.";
  } else if (!promptText) {
    promptText = "Please respond to the user's request.";
  }

  // If explicit offline/demo mode requested or no valid API key, use labeled Offline Mode
  if (!genAI || options.offline === true) {
    return getSimulatedResponse(
      prompt,
      'No API key configured or offline demo requested (Running in Offline Mode)',
      { ...options, images }
    );
  }

  // Configure candidate models: user's requested model first, then verified stable endpoints
  const requestedModel = options.model && options.model !== 'simulated-v1' ? options.model : null;
  const candidateModels = [
    ...(requestedModel ? [requestedModel] : []),
    ...DEFAULT_CANDIDATE_MODELS
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  const systemInstruction = options.systemInstruction || (hasImage ?
    `You are a top-tier expert AI vision analyst and intelligence assistant with high comprehension. ` +
    `When images are provided (${images.length} image(s)), carefully examine visual elements, layout, structure, printed/handwritten text, diagrams, labels, charts, data, and nuances across all images in detail. ` +
    `Provide a comprehensive, clear, and highly insightful breakdown answering the user's prompt or explaining the image contents. ` +
    `Organize your response with clean Markdown (headings, bold points, bulleted lists, and structured sections). ` +
    `Always end your response by letting the user know they can ask any follow-up questions about these images.` :
    `You are an expert, helpful AI assistant. Provide well-structured, comprehensive, insightful, and practical responses formatted with clean Markdown headings and bullet points.`);

  const parts = [{ text: promptText }];
  for (const img of images) {
    if (img.data && img.mimeType) {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data
        }
      });
    }
  }

  const promptConfig = {
    contents: [{ role: 'user', parts }],
  };

  const timeoutPerAttemptMs = options.timeoutMs || 15000; // 15s per model attempt (avoids long gateway timeouts)
  let lastError = null;

  for (const currentModel of candidateModels) {
    let controller = null;
    let timeoutId = null;

    try {
      console.log(`[LLM Service] Requesting generation using ${currentModel}...`);

      const result = await executeWithRetry(async () => {
        controller = new AbortController();
        timeoutId = setTimeout(() => {
          controller.abort();
        }, timeoutPerAttemptMs);

        const requestOptions = {
          timeout: timeoutPerAttemptMs,
          signal: controller.signal
        };

        const model = genAI.getGenerativeModel({
          model: currentModel,
          systemInstruction: systemInstruction
        }, requestOptions);

        const responsePromise = model.generateContent(promptConfig, requestOptions);
        const apiResult = await responsePromise;
        const response = await apiResult.response;
        return response.text();
      }, { maxRetries: 1, baseDelay: 800 });

      if (timeoutId) clearTimeout(timeoutId);

      console.log(`[LLM Service] Successfully generated response via ${currentModel}`);
      return {
        text: result,
        provider: 'Google Gemini',
        model: currentModel,
        isSimulated: false,
        status: 'success',
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      lastError = err;

      const isKeyInvalid = err?.status === 400 ||
        err?.message?.includes('API_KEY_INVALID') ||
        err?.message?.includes('API key not valid');

      if (isKeyInvalid) {
        console.error('[LLM Service Error] Invalid API key detected. Aborting candidate search.');
        throw new GeminiServiceError('Invalid Gemini API Key. Please check your LLM_API_KEY environment variable.', {
          statusCode: 400,
          code: 'API_KEY_INVALID',
          details: err.message,
          simulatedFallback: getSimulatedResponse(prompt, 'API Key Invalid', { ...options, images })
        });
      }

      console.warn(`[LLM Service Warning] Model ${currentModel} failed: ${err.message}. Trying next candidate if available...`);
    }
  }

  // All candidates failed
  const isTimeout = lastError?.name === 'AbortError' || lastError?.message?.includes('timed out');
  const statusCode = isTimeout ? 504 : (lastError?.status || 503);
  const errorCode = isTimeout ? 'GATEWAY_TIMEOUT' : (lastError?.status === 429 ? 'RATE_LIMIT_EXCEEDED' : 'SERVICE_UNAVAILABLE');

  console.error(`[LLM Service Error] All candidate models failed. Code: ${errorCode}, Status: ${statusCode}`);

  throw new GeminiServiceError(
    `Gemini service unavailable: ${lastError ? lastError.message : 'All candidate models failed.'}`,
    {
      statusCode,
      code: errorCode,
      details: lastError ? lastError.message : 'Unknown generation failure',
      simulatedFallback: getSimulatedResponse(prompt, `Gemini Unavailable (${errorCode})`, { ...options, images })
    }
  );
}

/**
 * Returns a clearly labeled simulated response for demonstration / offline use.
 */
function getSimulatedResponse(prompt, note, options = {}) {
  const images = Array.isArray(options.images) ? options.images : (options.image && options.image.data ? [options.image] : []);
  const hasImage = typeof options === 'boolean' ? options : (images.length > 0);
  let responseText = '';
  const promptStr = (typeof prompt === 'string' ? prompt : '').toLowerCase();

  if (hasImage) {
    const isFollowUp = promptStr.includes('follow-up');

    if (isFollowUp) {
      responseText = `I've carefully re-examined the attached ${images.length > 1 ? `${images.length} images` : 'image'} to answer your specific question. Based on what is visible across the images, the relevant details you asked about are clearly structured. All personal identifiers remain fully protected.\n\nFeel free to ask any other questions!`;
    } else {
      responseText = `I've comprehensively analyzed the ${images.length > 1 ? `${images.length} attached images` : 'attached image'}. Based on visual structure and textual layout, all items have been examined. I've noted all key semantic elements, layouts, and general intent. Rest assured, any sensitive or personally identifiable information has been redacted and kept fully secure.\n\n**What I observed:**\n• Processed ${images.length > 1 ? `${images.length} images` : '1 image'} with complete visual fidelity\n• All layout and content elements have been examined\n• Any sensitive details have been protected\n\nIs there any specific detail or follow-up question you have about these images?`;
    }
  } else if (promptStr.includes('[name_') || promptStr.includes('leave') || promptStr.includes('absence')) {
    responseText = `Subject: Leave Application Request\n\nDear Manager,\n\nI am writing to formally request leave of absence from work. All specific details, dates, and contact information have been processed securely.\n\nPlease let me know if you need any further information or documentation regarding this request.\n\nBest regards,\n[Applicant]`;
  } else if (promptStr.includes('medical') || promptStr.includes('doctor') || promptStr.includes('treatment')) {
    responseText = `Medical Consultation Summary:\n\nBased on the query, standard clinical management involves initial assessment, symptomatic care, and close monitoring. Please consult a qualified healthcare professional for personalized medical advice.`;
  } else if (promptStr.includes('financial') || promptStr.includes('tax') || promptStr.includes('bank')) {
    responseText = `Financial Guidance Summary:\n\nFor tax calculation or financial planning, standard deductions and income brackets apply as per current regulatory guidelines. Ensure to maintain proper proof documentation for all declared expenses.`;
  } else {
    responseText = `Thank you for your prompt. Here is the generated AI response based on your sanitized input:\n\n"I have processed your request while ensuring that your sensitive personal data remains protected."\n\n[Note: ${note}]`;
  }

  return {
    text: responseText,
    provider: 'Simulated LLM (Offline Demo Mode)',
    model: 'simulated-v1',
    isSimulated: true,
    status: 'simulated',
    note: note,
    timestamp: new Date().toISOString()
  };
}

/**
 * LLM-Assisted Context Analysis (Optional feature)
 * Sends ONLY sanitized placeholders + metadata (never raw values) for reasoning.
 */
async function analyzeContextLLM(placeholders) {
  if (!genAI) {
    return null; // Fallback to client-side rule-based analysis
  }

  const candidateModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

  for (const modelName of candidateModels) {
    let controller = null;
    let timeoutId = null;

    try {
      controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 10000);

      const requestOptions = {
        timeout: 10000,
        signal: controller.signal
      };

      const model = genAI.getGenerativeModel({ model: modelName }, requestOptions);
      const prompt = `Analyze entity necessity for the following task placeholders:
Input metadata: ${JSON.stringify(placeholders)}

Return JSON array with format:
[{"placeholder": "...", "necessary": boolean, "reason": "...", "recommendation": "KEEP"|"MASK"|"REMOVE"}]`;

      const result = await model.generateContent(prompt, requestOptions);
      if (timeoutId) clearTimeout(timeoutId);

      const text = result.response.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      console.warn(`[LLM Context Analysis Warning] Model ${modelName} failed: ${err.message}`);
    }
  }

  console.error('[LLM Context Analysis Error] All candidate models failed. Falling back to local rules.');
  return null;
}

module.exports = {
  generateResponse,
  analyzeContextLLM,
  getSimulatedResponse,
  DEFAULT_CANDIDATE_MODELS
};
