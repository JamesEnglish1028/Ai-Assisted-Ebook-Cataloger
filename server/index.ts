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
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import bookAnalysisRouter from './routes/bookAnalysis';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiDocumentationPath = path.join(__dirname, '../API_DOCUMENTATION.md');

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const SERVE_STATIC = process.env.SERVE_STATIC !== 'false';
const OPENAPI_SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'AI Ebook Cataloger API',
    version: '1.0.0',
    description: 'REST API for analyzing ebooks/audiobooks and generating enriched metadata.',
  },
  servers: [
    { url: '/' },
  ],
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        responses: {
          '200': {
            description: 'Server is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    message: { type: 'string', example: 'AI Ebook Cataloger API is running' },
                  },
                  required: ['status', 'message'],
                },
              },
            },
          },
        },
      },
    },
    '/api/health': {
      get: {
        summary: 'Health check alias',
        responses: {
          '200': {
            description: 'Server is healthy',
          },
        },
      },
    },
    '/api/analyze-book': {
      post: {
        summary: 'Analyze an uploaded ebook/audiobook file',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                  aiProvider: { type: 'string', enum: ['google', 'openai', 'anthropic'] },
                  aiModel: { type: 'string' },
                  transcriptionMode: { type: 'string', enum: ['metadata-only', 'transcribe-preview', 'transcribe-full'] },
                  transcriptionMaxMinutes: { type: 'integer' },
                  transcriptionIncludeTimestamps: { type: 'boolean' },
                },
                required: ['file'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Analysis result returned' },
          '400': { description: 'Validation error' },
          '422': { description: 'Parsing/transcription error' },
          '503': { description: 'AI service error' },
        },
      },
    },
    '/api/analyze-text': {
      post: {
        summary: 'Analyze pre-extracted text',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  sourceType: { type: 'string' },
                  metadata: { type: 'object' },
                  telemetry: { type: 'object' },
                  coverImage: { type: 'string' },
                  fileName: { type: 'string' },
                  fileType: { type: 'string' },
                  aiProvider: { type: 'string', enum: ['google', 'openai', 'anthropic'] },
                  aiModel: { type: 'string' },
                },
                required: ['text'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Analysis result returned' },
          '400': { description: 'Validation error' },
          '503': { description: 'AI service error' },
        },
      },
    },
    '/rdoc': {
      get: {
        summary: 'Render markdown API docs as HTML',
        responses: {
          '200': { description: 'HTML docs' },
        },
      },
    },
    '/redoc': {
      get: {
        summary: 'ReDoc OpenAPI UI',
        responses: {
          '200': { description: 'ReDoc HTML UI' },
        },
      },
    },
    '/openapi.json': {
      get: {
        summary: 'OpenAPI document',
        responses: {
          '200': { description: 'OpenAPI JSON' },
        },
      },
    },
  },
};

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
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser clients and same-origin requests.
    if (!origin) {
      return callback(null, true);
    }

    // If no explicit allowlist is configured, keep permissive behavior.
    if (allowedOrigins.length === 0) {
      return callback(null, true);
    }

    return allowedOrigins.includes(origin)
      ? callback(null, true)
      : callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files in production
if (process.env.NODE_ENV === 'production' && SERVE_STATIC) {
  const distPath = path.join(__dirname, '../dist');
  console.log(`📁 Serving static files from: ${distPath}`);
  app.use(express.static(distPath, {
    maxAge: '1d', // Cache static assets for 1 day
    etag: true,
    lastModified: true
  }));
}

// Routes
app.use('/api', bookAnalysisRouter);

// Health check endpoint
const healthHandler = (req: express.Request, res: express.Response) => {
  console.log('✅ Health check endpoint called');
  res.json({ status: 'ok', message: 'AI Ebook Cataloger API is running' });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);
app.get('/openapi.json', (req, res) => {
  res.json(OPENAPI_SPEC);
});

app.get('/redoc', (req, res) => {
  res
    .status(200)
    .type('html')
    .send(`<!doctype html>
<html>
  <head>
    <title>AI Ebook Cataloger API - ReDoc</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { margin: 0; padding: 0; }
    </style>
  </head>
  <body>
    <redoc spec-url="/openapi.json"></redoc>
    <script src="https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js"></script>
  </body>
</html>`);
});

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

app.get('/rdoc', async (req, res) => {
  try {
    const markdown = await readFile(apiDocumentationPath, 'utf8');
    const escaped = escapeHtml(markdown);
    res
      .status(200)
      .type('html')
      .send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI Ebook Cataloger API Documentation</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background: #f8fafc; color: #0f172a; }
    main { max-width: 960px; margin: 0 auto; padding: 24px; }
    pre { white-space: pre-wrap; word-break: break-word; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; line-height: 1.45; font-size: 13px; }
  </style>
</head>
<body>
  <main>
    <pre>${escaped}</pre>
  </main>
</body>
</html>`);
  } catch (error: any) {
    console.error('❌ Unable to load API documentation for /rdoc:', error?.message || error);
    res.status(500).json({
      error: 'Documentation unavailable',
      code: 'DOC_UNAVAILABLE',
      message: 'Could not load API documentation content.',
    });
  }
});

// In production, serve the React app for all non-API routes
if (process.env.NODE_ENV === 'production' && SERVE_STATIC) {
  // Serve React app for root route
  app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, '../dist/index.html');
    console.log(`🌐 Serving React app from: ${indexPath}`);
    res.sendFile(indexPath);
  });
  
  // Catch all other non-API routes and serve React app
  app.use((req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api/') || req.path === '/health') {
      return next();
    }
    
    const indexPath = path.join(__dirname, '../dist/index.html');
    console.log(`🌐 Serving React app from: ${indexPath} for route: ${req.path}`);
    res.sendFile(indexPath);
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
  console.log(`📚 Health check alias: /api/health`);
  console.log(`🧭 OpenAPI JSON: /openapi.json`);
  console.log(`🧭 ReDoc UI: /redoc`);
  console.log(`📘 API docs: /rdoc`);
  console.log(`📖 Analyze endpoint: /api/analyze-book`);
  if (process.env.NODE_ENV === 'production') {
    if (SERVE_STATIC) {
      console.log(`🌐 Frontend served from /dist`);
    } else {
      console.log('🌐 Static frontend serving disabled (SERVE_STATIC=false)');
    }
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
