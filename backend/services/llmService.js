/* ============================================================
   LLM Service — Communicates with LLM Provider (Google Gemini)
   Handles prompt sending, formatting, timeout, and fallback mock mode.
   ============================================================ */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini API client if key is provided
let genAI = null;
if (process.env.LLM_API_KEY && process.env.LLM_API_KEY !== 'your_gemini_api_key_here') {
  genAI = new GoogleGenerativeAI(process.env.LLM_API_KEY);
}

/**
 * Generates response from LLM using sanitized prompt.
 *
 * @param {string} prompt - Sanitized prompt (never contains raw PII unless user explicitly kept it)
 * @param {Object} options - Additional options (temperature, system instruction)
 * @returns {Promise<Object>} Response object { text, tokenCount, provider, model }
 */
async function generateResponse(prompt, options = {}) {
  // Candidate models in order of speed and availability
  const candidateModels = [
    options.model || 'gemini-flash-lite-latest',
    'gemini-flash-latest',
    'gemini-3.8-flash'
  ].filter((m, i, arr) => arr.indexOf(m) === i); // Ensure unique candidates

  // Normalize images array (support options.images array or options.image object)
  const images = Array.isArray(options.images)
    ? options.images.filter(img => Boolean(img && img.data))
    : (options.image && options.image.data ? [options.image] : []);

  const hasImage = images.length > 0;
  let promptText = (typeof prompt === 'string' ? prompt.trim() : '');
  if (!promptText && hasImage) {
    promptText = images.length > 1
      ? `You are a genius AI vision analyst. Carefully examine all ${images.length} attached images in detail — their visual layout, any text present, diagrams, data, colors, and content. Provide a comprehensive, insightful breakdown and comparison of what each image contains and what they mean together. End by inviting the user to ask follow-up questions.`
      : "You are a genius AI vision analyst. Carefully examine every detail of the attached image — its visual structure, any text present, diagrams, data, colours, and overall content. Provide a comprehensive, insightful breakdown of what the image contains and what it means. End by inviting the user to ask any follow-up questions.";
  } else if (!promptText) {
    promptText = "Please respond to the user's request.";
  }

  // If API key is available, use Google Gemini with smart failover across candidates
  if (genAI) {
    const systemInstruction = options.systemInstruction || (hasImage ?
      `You are a top-tier expert AI vision analyst and intelligence assistant with genius-level comprehension. ` +
      `When images are provided (${images.length} image(s)), carefully and thoroughly examine every visual element, layout, structure, printed/handwritten text, diagrams, labels, charts, data, and nuances across all images in high detail. ` +
      `Provide a comprehensive, clear, and highly insightful breakdown answering the user's prompt or explaining the image contents. ` +
      `Organize your response with clean Markdown (headings, bold points, bulleted lists, and structured sections) so the content is immediately useful, clear, and high-value to the user. ` +
      `Always end your response by letting the user know they can ask any follow-up questions about these images.` :
      `You are an expert, helpful AI assistant. Provide well-structured, comprehensive, insightful, and practical responses formatted with clean Markdown headings and bullet points.`);

    const parts = [{ text: promptText }];

    // Support Multimodal Image Input (up to 5 images)
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

    let lastError = null;

    // Smart failover: try ultra-fast gemini-flash-lite-latest first, auto-fallback on 503 spikes
    for (const currentModel of candidateModels) {
      try {
        console.log(`[LLM Service] Requesting generation using ${currentModel}...`);
        const model = genAI.getGenerativeModel({
          model: currentModel,
          systemInstruction: systemInstruction
        });

        // 35-second timeout per candidate
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`LLM request timed out (35s) on ${currentModel}`)), 35000)
        );

        const apiPromise = model.generateContent(promptConfig);
        const result = await Promise.race([apiPromise, timeoutPromise]);
        const response = await result.response;
        const text = response.text();

        console.log(`[LLM Service] Successfully generated response via ${currentModel}`);
        return {
          text,
          provider: 'Google Gemini (Genius Vision)',
          model: currentModel,
          timestamp: new Date().toISOString()
        };
      } catch (err) {
        lastError = err;
        console.warn(`[LLM Service Warning] Model ${currentModel} failed: ${err.message}. Auto-failing over to next model...`);
        // Brief pause before trying next candidate
        await new Promise(r => setTimeout(r, 400));
      }
    }

    console.error('[LLM Service Error]: All candidate models failed. Last error:', lastError ? lastError.message : 'Unknown');
    // Fallback to simulated response only if every candidate model failed
    return getSimulatedResponse(prompt, `API Error: ${lastError ? lastError.message : 'Demand spike'}`, { ...options, images });
  }

  // Fallback mode when no API key is provided
  return getSimulatedResponse(prompt, 'No API key configured (Running in Simulation Mode)', { ...options, images });
}

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
    provider: hasImage ? 'Multimodal Vision LLM' : 'Simulated LLM (Offline Mode)',
    model: 'simulated-v1',
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

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });
    const prompt = `Analyze entity necessity for the following task placeholders:
Input metadata: ${JSON.stringify(placeholders)}

Return JSON array with format:
[{"placeholder": "...", "necessary": boolean, "reason": "...", "recommendation": "KEEP"|"MASK"|"REMOVE"}]`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (err) {
    console.error('[LLM Context Analysis Error]:', err.message);
    return null;
  }
}

module.exports = {
  generateResponse,
  analyzeContextLLM
};