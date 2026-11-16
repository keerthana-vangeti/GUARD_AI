/* ============================================================
   Backend Server — Main Entry Point
   Context-Aware Sensitive Prompt Guard for GenAI
   ============================================================ */

const path = require('path');
// Always load .env from backend folder regardless of where node command was run
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const llmRoutes = require('./routes/llm');
const { auditLogger } = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 3001;

// 1. Security Headers via Helmet
app.use(helmet({
  contentSecurityPolicy: false, // Disabled in dev for CDN compatibility (Tesseract, Transformers.js)
  crossOriginEmbedderPolicy: false
}));

// 2. CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 3. Rate limiting (100 requests per 15 mins per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Rate limit exceeded. Please try again later.' }
});
app.use('/api/', limiter);

// 4. Request Parsers (Support base64 images up to 50mb)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 5. Zero-Log Privacy Audit Middleware
app.use(auditLogger);

// 6. Serve Frontend Static Files
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// 6b. Serve test data for Evaluation Dashboard
app.use('/tests', express.static(path.join(__dirname, '../tests')));

// 7. API Routes
app.use('/api', llmRoutes);

// 8. Healthcheck Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    system: 'Context-Aware Sensitive Prompt Guard',
    version: '1.0.0',
    llmConfigured: Boolean(process.env.LLM_API_KEY && process.env.LLM_API_KEY !== 'your_gemini_api_key_here'),
    timestamp: new Date().toISOString()
  });
});

// 9. Fallback to index.html for SPA/frontend routes
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`
============================================================
  🛡️  Context-Aware Sensitive Prompt Guard Server Running
============================================================
  Local Server:  http://localhost:${PORT}
  Health Check:  http://localhost:${PORT}/health
  Privacy Mode:  ZERO LOGGING (Raw PII never touches disk)
  LLM Provider:  ${process.env.LLM_API_KEY && process.env.LLM_API_KEY !== 'your_gemini_api_key_here' ? 'Google Gemini API' : 'Simulated Offline LLM'}
============================================================
  `);
});
