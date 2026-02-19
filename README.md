

# AI Assisted Ebook Cataloger

An intelligent publication analysis tool that extracts metadata, generates AI-powered summaries, and provides library classifications (LCC, BISAC, LCSH) for PDF, EPUB, and audiobook files.

## Features

✨ **Dual Mode Operation:**
- 🖥️ **Web Interface**: Interactive UI for uploading and analyzing ebooks
- 🔌 **REST API**: Backend service for integration with other applications (designed for loose coupling)

📚 **Comprehensive Analysis:**
- Extract metadata (title, author, ISBN, publisher, etc.)
- AI-generated summaries using Google Gemini 2.5 Flash
- Library classifications (LCC, BISAC, LCSH)
- Field of study and discipline categorization
- Reading level metrics (Flesch-Kincaid, Gunning Fog)
- Table of contents extraction (EPUB 2 & 3 support)
- Optional cover image extraction (Base64 encoded)
- Accessibility metadata (EPUB)
- Page list extraction
- **NEW:** MARC 21 export (.mrk) with preview and accessibility fields

🎯 **Support for Multiple Formats:**
- PDF files (non-encrypted)
- EPUB 2.0 and 3.0 (DRM-free)
- Audiobook Phase 1:
  - RWPM `.audiobook` package metadata extraction (manifest-based)
  - Standalone `.mp3`, `.m4b`, and `.wav` ingest with metadata-first fallback analysis
  - Note: Phase 1 does not transcribe audio; AI analysis is generated from extracted metadata context
- Audiobook Phase 2:
  - Provider-aware workflow modes: `metadata-only`, `transcribe-preview`, `transcribe-full`
  - Cost controls via transcription minute caps (preview/full limits)
  - UI telemetry panel with transcription minutes, transcript length, and estimated cost

🛡️ **Production-Ready API:**
- Rate limiting (10 analysis requests per 15 minutes per IP)
- Input validation with detailed error messages
- File size limits (100MB max)
- Response caching for improved performance
- Comprehensive error handling
- Security headers with Helmet.js
- GZIP compression

## Quick Start

### Prerequisites

- Node.js 18+ 
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/JamesEnglish1028/Ai-Assisted-Ebook-Cataloger.git
   cd Ai-Assisted-Ebook-Cataloger
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   
   Create a `.env` file in the project root:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

### Running the Application

#### Option 1: Web Interface (Frontend)

Run the interactive web application:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

#### Option 2: API Server (Backend)

Run the REST API server:

```bash
npm run server
```

The API will be available at [http://localhost:3001](http://localhost:3001)

#### Option 3: Both Together (Recommended for Development)

Run both frontend and backend simultaneously (in separate terminals):

```bash
# Terminal 1 - Backend API (must start first)
npm run server

# Terminal 2 - Frontend (with proxy to API)
npm run dev
```

The frontend will proxy `/api/*` requests to the backend server automatically.

**Important:** Always start the backend API server before the frontend to ensure proper connectivity.

## API Integration

The API is designed for integration with other applications like meBooks. See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for complete API reference.

### Quick Example

**Basic Book Analysis:**
```javascript
const formData = new FormData();
formData.append('file', ebookFile);

const response = await fetch('http://localhost:3001/api/analyze-book', {
  method: 'POST',
  body: formData
});

const analysis = await response.json();
console.log(analysis.summary); // AI-generated summary
console.log(analysis.metadata); // Book metadata and classifications
```

## Project Structure

```
Ai-Assisted-Ebook-Cataloger/
├── App.tsx                 # Main React application
├── index.tsx              # React entry point
├── components/            # React UI components
│   ├── FileUpload.tsx           # File upload component
│   ├── MetadataDisplay.tsx      # Book metadata display
│   └── ...                      # Other UI components
├── services/              # Frontend services
├── server/                # Backend API server
│   ├── index.ts          # Express server
│   ├── routes/           # API routes
│   ├── controllers/      # Request handlers
│   └── services/         # Backend services (parsing, AI)
│       ├── fileParser.ts               # PDF/EPUB parsing
│       ├── geminiService.ts            # AI analysis
│       └── textAnalysis.ts             # Reading metrics
├── utils/                # Utility functions
├── API_DOCUMENTATION.md  # Complete API reference
└── README.md            # This file
```

## Technologies Used

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **Backend**: Express.js, Node.js
- **AI**: Google Gemini 2.5 Flash
- **File Processing**: pdf-parse, JSZip, @xmldom/xmldom
- **Security**: Helmet.js, express-rate-limit, express-validator
- **Testing**: Jest, Supertest (unit & integration tests)
- **Type Safety**: TypeScript throughout

## Use Cases

### For Libraries & Catalogers
- Automate metadata extraction from ebooks
- Generate professional summaries
- Get standardized library classifications
- Generate MARC 21 records with accessibility metadata

### For Publishers & Content Creators
- Provide accessibility metadata when available

### For Personal Library Apps
- Integrate AI-enhanced book details
- Automatically organize books by classification
- Provide rich metadata for user libraries

### For Developers
- REST API for ebook analysis
- Easy integration with existing applications
- Loosely coupled microservice architecture

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google Gemini API key (required when using Google provider) | Conditionally |
| `OPENAI_API_KEY` | OpenAI API key (required when using OpenAI provider) | Conditionally |
| `ANTHROPIC_API_KEY` | Anthropic API key (required when using Anthropic provider) | Conditionally |
| `PORT` | API server port (default: 3001) | No |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed browser origins for API CORS | No |
| `SERVE_STATIC` | Set `false` when deploying API + frontend as separate Render services | No |

## Development & Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests for CI/CD
npm run test:ci
```

### Development Scripts

```bash
# Start API server with auto-reload
npm run server:watch

# Start frontend with hot reload
npm run dev

# Build frontend for production
npm run build

# Preview production build
npm run preview
```

### Building for Production

```bash
# Build frontend
npm run build

# Run API in production mode
npm run server:prod
```

### Production Deployment

This application is ready for deployment on **Render** (recommended) or similar platforms.

### Render.com Configuration (Exact Values)

This repo is configured for **two Render services** from one repository:
1. `ai-ebook-cataloger-api` (Web Service, Node API)
2. `ai-ebook-cataloger-web` (Static Site, React frontend)

Use **Blueprint Deploy** with the included `render.yaml`:
1. In Render, go to `New` -> `Blueprint`.
2. Select this GitHub repo.
3. Render will detect and create both services from `render.yaml`.

#### API service (`ai-ebook-cataloger-api`)

Set/verify these values in Render:
1. `Type`: `Web Service`
2. `Environment`: `Node`
3. `Plan`: `starter`
4. `Region`: `oregon`
5. `Build Command`: `npm ci`
6. `Start Command`: `npm run start`
7. `Health Check Path`: `/health`
8. `Environment Variables`:
   - `NODE_ENV=production`
   - `SERVE_STATIC=false`
   - `GEMINI_API_KEY` (set if using Google provider)
   - `OPENAI_API_KEY` (set if using OpenAI provider)
   - `ANTHROPIC_API_KEY` (set if using Anthropic provider)
   - `ALLOWED_ORIGINS` (recommended: set to your static-site URL, e.g. `https://ai-ebook-cataloger-web.onrender.com`)

#### Frontend static site (`ai-ebook-cataloger-web`)

Set/verify these values in Render:
1. `Type`: `Static Site`
2. `Build Command`: `npm ci && npm run build`
3. `Publish Directory`: `dist`
4. `Environment Variables`:
   - `VITE_API_BASE_URL=https://ai-ebook-cataloger-api.onrender.com` (use your actual API URL)
5. `Routes` rewrite:
   - Source: `/*`
   - Destination: `/index.html`

#### Post-deploy checks

1. Open API health endpoint: `https://<your-api>.onrender.com/health`
2. Open frontend URL and upload a test PDF/EPUB.
3. In the UI, select provider/model and confirm analysis succeeds.
4. If browser calls fail, verify `ALLOWED_ORIGINS` on API includes your static site URL.

**For detailed deployment instructions, see:** [RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md)

**Live Demo**: Coming soon (deploy your own instance in minutes!)

## Important Notes

### MARC 21 Export (Web UI)
- Generate a MARC 21 .mrk record from the UI after analysis completes.
- The export prompts for `=001` local control number, `=003` MARC org code, and a URL for `=856`.
- The preview panel supports collapsing, clearing, and download, and includes accessibility fields (`=341`) when available.

### Cover Extraction
By default, the API does **not** extract cover images (for performance). To request cover extraction:
- **API**: Add query parameter `?extractCover=true`
- **Web UI**: Always extracts covers automatically

See [COVER_EXTRACTION_UPDATE.md](./COVER_EXTRACTION_UPDATE.md) for details.

### Browser Compatibility
- Recommended: Chrome, Safari
- Firefox may experience file upload issues with certain EPUB files (use Chrome as alternative)

## Limitations

### General
- Maximum file size: 100MB
- Text truncated to 200,000 characters for AI analysis (configurable via `maxTextLength` parameter)
- DRM-protected or encrypted files are not supported
- Requires internet connection for AI analysis
- Rate limited to prevent API abuse (10 analysis requests per 15 minutes per IP)

### Accessibility Metadata
- **EPUB only:** Accessibility metadata is extracted when present in the EPUB package

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Related Projects

- **meBooks**: Personal library management application (integrates with this API)

## Support

For API integration questions, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)

For issues or feature requests, please open an issue on GitHub.

---

View original app in AI Studio: https://ai.studio/apps/drive/1u7lAdiYfCJl4by7zJffVkSbeb1VnSwWy
