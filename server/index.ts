/**
 * AI Assisted Ebook Cataloger - API Server
 * 
 * Express.js server that provides REST API endpoints for ebook analysis.
 * Designed for loose coupling with other applications (e.g., meBooks).
 * 
 * Features:
 * - EPUB parsing with metadata extraction
 * - AI-powered summaries using Google Gemini
 * - Library classifications (LCC, BISAC, LCSH)
 * - Optional cover image extraction
 * - Table of contents extraction
 * - Reading level metrics
 * 
 * @requires Express.js 5.x
 * @requires Node.js 22.x
 * @requires GEMINI_API_KEY environment variable
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import bookAnalysisRouter from './routes/bookAnalysis';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting
const analysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 analysis requests per windowMs
  message: {
    error: 'Too many analysis requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting
app.use(generalLimiter);
app.use('/api/analyze-book', analysisLimiter);

// CORS and body parsing
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('dist'));
}

// Routes
app.use('/api', bookAnalysisRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('✅ Health check endpoint called');
  res.json({ status: 'ok', message: 'AI Ebook Cataloger API is running' });
});

// In production, serve the React app for all non-API routes
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API Server running on port ${PORT}`);
  console.log(`📚 Health check: /health`);
  console.log(`📖 Analyze endpoint: /api/analyze-book`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`🌐 Frontend served from /dist`);
  }
});

server.on('error', (err) => {
  console.error('❌ Server error:', err);
  process.exit(1);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

export default app;
