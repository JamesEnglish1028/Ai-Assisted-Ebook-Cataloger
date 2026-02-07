# AI Ebook Cataloger API

This API allows you to analyze ebook files (PDF and EPUB) and extract metadata, generate AI-powered summaries, and get library classifications.

## Base URL

```
http://localhost:3001
```

## Endpoints

### Health Check

**GET** `/health`

Check if the API server is running.

**Response:**
```json
{
  "status": "ok",
  "message": "AI Ebook Cataloger API is running"
}
```

---

## MARC 21 Export (Web UI)

The MARC 21 export is available in the web interface after analysis completes. It is not an API endpoint.

**What it does:**
- Generates a MARC 21 `.mrk` record using the extracted metadata, summary, and classifications.
- Includes accessibility metadata using MARC field `=341` when access modes or features are available.

**Prompts:**
- `=001` local control number
- `=003` MARC organization code
- `=856 40$u` URL (Available online)

**Preview panel:**
- Supports collapsing, clearing, and downloading the `.mrk` file.

---

### Analyze Book

**POST** `/api/analyze-book`

Upload and analyze an ebook file to extract metadata and generate AI analysis.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: File field named `file` containing a PDF or EPUB file
- Query Parameters (optional):
  - `extractCover` (boolean, default: `false`) - Set to `true` to include cover image (adds ~480KB to response)
  - `maxTextLength` (number, default: `200000`) - Maximum text length for analysis (1000-500000 characters)

**Rate Limits:**
- Analysis endpoint: 10 requests per 15 minutes per IP
- General API: 100 requests per 15 minutes per IP

**File Requirements:**
- Supported formats: PDF, EPUB
- Maximum file size: 100MB
- Files must not be empty
- PDF files must not be password-protected
- EPUB files must not be DRM-protected

**Example using curl:**
```bash
# Without cover image (default - faster, smaller response)
curl -X POST http://localhost:3001/api/analyze-book \
  -F "file=@/path/to/your/book.pdf"

# With cover image (for UI display)
curl -X POST "http://localhost:3001/api/analyze-book?extractCover=true" \
  -F "file=@/path/to/your/book.pdf"
```

**Example using JavaScript/Fetch:**
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

// Without cover image (default - for API integration)
const response = await fetch('http://localhost:3001/api/analyze-book', {
  method: 'POST',
  body: formData
});

// With cover image (for UI display)
const responseWithCover = await fetch('http://localhost:3001/api/analyze-book?extractCover=true', {
  method: 'POST',
  body: formData
});

const result = await response.json();
```

**Response (200 OK):**
```json
{
  "metadata": {
    "title": "Book Title",
    "author": "Author Name",
    "subject": "Subject",
    "keywords": "keyword1, keyword2",
    "publisher": "Publisher Name",
    "publicationDate": "2024-01-01",
    "identifier": {
      "value": "9781234567890",
      "source": "metadata"
    },
    "pageCount": {
      "value": 250,
      "type": "actual"
    },
    "lcc": [
      {
        "designator": "PS",
        "mainClass": "American literature",
        "subClass": "21st century"
      }
    ],
    "bisac": [
      "FIC009000 - FICTION / Fantasy / General"
    ],
    "lcsh": [
      "Fantasy fiction",
      "Adventure stories"
    ],
    "fieldOfStudy": "Humanities",
    "discipline": "Languages & Literature",
    "readingLevel": 8.5,
    "gunningFog": 10.2,
    "epubVersion": "3.0",
    "accessibilityFeatures": ["alternativeText"],
    "accessModes": ["textual", "visual"],
    "accessModesSufficient": ["textual"],
    "hazards": ["none"],
    "certification": "EPUB Accessibility 1.0"
  },
  "summary": "AI-generated 1-2 paragraph summary of the book...",
  "tableOfContents": [
    {
      "label": "Chapter 1",
      "href": "chapter1.html",
      "children": []
    }
  ],
  "pageList": [
    {
      "label": "1",
      "pageNumber": "1"
    }
  ],
  "coverImage": "data:image/jpeg;base64,...",
  "fileName": "book.pdf",
  "fileType": "pdf",
  "processedAt": "2025-10-13T19:14:00.000Z"
}
```

**Error Responses:**

**400 Bad Request - Validation Error**
```json
{
  "error": "Validation failed",
  "details": [
    {
      "field": "query",
      "message": "extractCover must be a boolean value (true/false)",
      "value": "invalid"
    }
  ]
}
```

**400 Bad Request - File Required**
```json
{
  "error": "No file uploaded",
  "code": "FILE_REQUIRED",
  "message": "Please upload a PDF or EPUB file"
}
```

**400 Bad Request - Invalid File Type**
```json
{
  "error": "Invalid file type: text/plain",
  "code": "INVALID_FILE_TYPE",
  "message": "Only PDF and EPUB files are supported",
  "supportedTypes": ["application/pdf", "application/epub+zip"]
}
```

**413 Payload Too Large**
```json
{
  "error": "File too large",
  "code": "FILE_TOO_LARGE", 
  "message": "File size must be less than 100MB"
}
```

**422 Unprocessable Entity - Parse Error**
```json
{
  "error": "Failed to parse file",
  "code": "PARSE_ERROR",
  "message": "The file appears to be corrupted or password-protected",
  "fileType": "pdf"
}
```

**429 Too Many Requests**
```json
{
  "error": "Too many analysis requests from this IP, please try again later.",
  "retryAfter": "15 minutes"
}
```

**503 Service Unavailable**
```json
{
  "error": "AI analysis failed", 
  "code": "AI_SERVICE_ERROR",
  "message": "Unable to generate analysis at this time. Please try again later."
}
```

---

### Analyze Accessibility (EPUB only)

**POST** `/api/analyze-accessibility`

Upload an EPUB file to analyze its accessibility compliance using DAISY Ace standards.

**Prerequisites:**
- DAISY Ace HTTP service must be running on port 8000: `npx ace-http -p 8000`

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: File field named `file` containing an EPUB file only

**Rate Limits:**
- Same as analyze-book: 10 requests per 15 minutes per IP

**File Requirements:**
- **EPUB only:** PDF files are not supported for accessibility analysis
- Maximum file size: 100MB
- Files must not be empty or DRM-protected

**Example using curl:**
```bash
curl -X POST http://localhost:3001/api/analyze-accessibility \
  -F "file=@/path/to/your/book.epub"
```

**Example using JavaScript/Fetch:**
```javascript
const formData = new FormData();
formData.append('file', epubFile); // Must be EPUB

const response = await fetch('http://localhost:3001/api/analyze-accessibility', {
  method: 'POST',
  body: formData
});

const accessibilityReport = await response.json();
```

**Response (200 OK):**
```json
{
  "report": {
    "title": "The Adventures of Sherlock Holmes",
    "identifier": "urn:isbn:9781234567890",
    "language": "en",
    "publisher": "Example Publisher",
    "published": "2024-01-01",
    "modified": "2024-01-15",
    "epubVersion": "3.0",
    "outcome": "fail",
    "totalViolations": 5,
    "violationsByImpact": {
      "critical": 1,
      "serious": 2,
      "moderate": 2,
      "minor": 0
    },
    "violationsByRuleset": {
      "wcag21aa": 3,
      "wcag21a": 2
    },
    "violations": [
      {
        "impact": "critical",
        "rule": "color-contrast",
        "description": "Elements must have sufficient color contrast",
        "location": "chapter1.xhtml",
        "fileTitle": "Chapter 1",
        "rulesetTags": ["wcag21aa", "wcag143"],
        "kbUrl": "https://kb.daisy.org/publishing/docs/html/color.html",
        "kbTitle": "Color and Contrast"
      }
    ],
    "metadata": {
      "hasAccessibilityFeatures": true,
      "accessibilityFeatures": [
        "alternativeText",
        "structuralNavigation"
      ],
      "accessibilityHazards": [
        "noFlashingHazard",
        "noMotionSimulationHazard"
      ],
      "accessibilityAPI": ["ARIA"],
      "accessibilitySummary": "This publication includes alternative text for images and proper heading structure.",
      "conformsTo": ["EPUB Accessibility 1.0 - WCAG 2.0 Level AA"]
    },
    "generatedAt": "2024-01-01T12:00:00.000Z",
    "aceVersion": "1.3.0"
  },
  "fileName": "book.epub",
  "fileType": "epub",
  "processedAt": "2024-01-01T12:00:00.000Z",
  "processingTime": "4.2s"
}
```

**Error Responses:**

**400 Bad Request - EPUB Only**
```json
{
  "error": "Invalid file type: application/pdf",
  "code": "INVALID_FILE_TYPE_FOR_ACCESSIBILITY",
  "message": "Only EPUB files are supported for accessibility analysis",
  "supportedTypes": ["application/epub+zip"]
}
```

**503 Service Unavailable - DAISY Ace Service**
```json
{
  "error": "Accessibility analysis failed",
  "code": "ACCESSIBILITY_ANALYSIS_ERROR",
  "message": "DAISY Ace service is not available at http://localhost:8000. Please ensure the service is running with: npx ace-http -p 8000"
}
```

---

## Running the Server

### Development Mode (with auto-reload)
```bash
npm run server
```

### Production Mode
```bash
npm run server:prod
```

### With Accessibility Analysis Support
```bash
# Terminal 1: Start DAISY Ace HTTP service
npx ace-http -p 8000

# Terminal 2: Start the API server
npm run server
```

The server will start on port `3001` by default. You can change this by setting the `PORT` environment variable.

---

## Environment Variables

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3001
```

Get your Gemini API key from: https://aistudio.google.com/app/apikey

---

## Integration with meBooks App

To integrate this API with your meBooks application:

1. **Start the cataloger API server:**
   ```bash
   cd /path/to/Ai-Assisted-Ebook-Cataloger
   npm run server
   ```

2. **From your meBooks app, make POST requests:**

   **Basic Book Analysis:**
   ```javascript
   async function analyzeBookFile(file) {
     const formData = new FormData();
     formData.append('file', file);
     
     try {
       const response = await fetch('http://localhost:3001/api/analyze-book', {
         method: 'POST',
         body: formData
       });
       
       if (!response.ok) {
         throw new Error(`API error: ${response.status}`);
       }
       
       const bookData = await response.json();
       
       // Use the returned data in your meBooks library
       return {
         title: bookData.metadata.title,
         author: bookData.metadata.author,
         isbn: bookData.metadata.identifier?.value,
         summary: bookData.summary,
         coverImage: bookData.coverImage,
         classifications: {
           lcc: bookData.metadata.lcc,
           bisac: bookData.metadata.bisac,
           lcsh: bookData.metadata.lcsh
         },
         tableOfContents: bookData.tableOfContents,
         pageCount: bookData.metadata.pageCount?.value,
         publisher: bookData.metadata.publisher,
         publicationDate: bookData.metadata.publicationDate
       };
     } catch (error) {
       console.error('Error analyzing book:', error);
       throw error;
     }
   }
   ```

   **Accessibility Analysis (EPUB only):**
   ```javascript
   async function analyzeAccessibility(epubFile) {
     const formData = new FormData();
     formData.append('file', epubFile);
     
     try {
       const response = await fetch('http://localhost:3001/api/analyze-accessibility', {
         method: 'POST',
         body: formData
       });
       
       if (!response.ok) {
         throw new Error(`API error: ${response.status}`);
       }
       
       const accessibilityData = await response.json();
       
       return {
         outcome: accessibilityData.report.outcome, // 'pass' or 'fail'
         totalViolations: accessibilityData.report.totalViolations,
         wcagLevel: accessibilityData.report.wcagCompliance?.level,
         criticalIssues: accessibilityData.report.violationsByImpact.critical,
         accessibilityFeatures: accessibilityData.report.metadata.accessibilityFeatures,
         conformsTo: accessibilityData.report.metadata.conformsTo,
         violations: accessibilityData.report.violations,
         summary: accessibilityData.report.summary,
         recommendations: accessibilityData.report.recommendations
       };
     } catch (error) {
       console.error('Error analyzing accessibility:', error);
       throw error;
     }
   }
   ```

3. **Handle the response in your meBooks UI:**
   - Display the AI-generated summary
   - Show the cover image
   - Present metadata fields
   - Display classifications for library organization
   - Show table of contents
   - **NEW:** Display accessibility compliance status and features
   - **NEW:** Show WCAG conformance levels
   - **NEW:** Present accessibility violations and recommendations

---

## Technical Details

### Supported Formats
- **PDF**: Any non-encrypted PDF file
- **EPUB**: EPUB 2.0 and 3.0 (DRM-free only)

### File Size Limits
- Maximum file size: 50MB
- Text is truncated to 200,000 characters for AI analysis

### Processing Time
- Typical processing: 5-30 seconds depending on file size
- Timeout: 30 seconds for file parsing

### Dependencies
- Express.js for API server
- Multer for file uploads
- pdf-parse for PDF text extraction
- JSZip for EPUB parsing
- Google Gemini AI for analysis
- **NEW:** DAISY Ace (@daisy/ace-core, @daisy/ace-axe-runner-puppeteer) for accessibility analysis
- **NEW:** node-fetch and form-data for HTTP service integration

---

## Troubleshooting

**Server won't start:**
- Check that port 3001 is not already in use
- Verify `.env` file exists with valid `GEMINI_API_KEY`

**"GEMINI_API_KEY not set" error:**
- Create a `.env` file in the project root
- Add your API key: `GEMINI_API_KEY=your_key_here`

**File upload fails:**
- Check file size (max 50MB)
- Verify file is a valid PDF or EPUB
- Ensure file is not password-protected or DRM-encrypted

**Processing timeout:**
- Try with a smaller file
- Check your internet connection (Gemini API requires internet)

**Accessibility analysis fails:**
- Ensure DAISY Ace HTTP service is running: `npx ace-http -p 8000`
- Check that port 8000 is not blocked by firewall
- Verify EPUB file is valid and not corrupted
- Only EPUB files are supported for accessibility analysis

---

## CORS Configuration

The API is configured with CORS enabled for all origins. For production use, you should restrict this:

```typescript
// In server/index.ts
app.use(cors({
  origin: 'http://localhost:3000' // Your meBooks app URL
}));
```
