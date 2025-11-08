<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# AI Assisted Ebook Cataloger

An intelligent ebook analysis tool that extracts metadata, generates AI-powered summaries, and provides library classifications (LCC, BISAC, LCSH) for PDF and EPUB files.

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

🎯 **Support for Multiple Formats:**
- PDF files (non-encrypted)
- EPUB 2.0 and 3.0 (DRM-free)

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
├── services/              # Frontend services
├── server/                # Backend API server
│   ├── index.ts          # Express server
│   ├── routes/           # API routes
│   ├── controllers/      # Request handlers
│   └── services/         # Backend services (parsing, AI)
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
| `GEMINI_API_KEY` | Your Google Gemini API key | Yes |
| `PORT` | API server port (default: 3001) | No |

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

## Important Notes

### Cover Extraction
By default, the API does **not** extract cover images (for performance). To request cover extraction:
- **API**: Add query parameter `?extractCover=true`
- **Web UI**: Always extracts covers automatically

See [COVER_EXTRACTION_UPDATE.md](./COVER_EXTRACTION_UPDATE.md) for details.

### Browser Compatibility
- Recommended: Chrome, Safari
- Firefox may experience file upload issues with certain EPUB files (use Chrome as alternative)

## Limitations

- Maximum file size: 100MB
- Text truncated to 200,000 characters for AI analysis (configurable via `maxTextLength` parameter)
- DRM-protected or encrypted files are not supported
- Requires internet connection for AI analysis
- Rate limited to prevent API abuse (10 analysis requests per 15 minutes per IP)

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
