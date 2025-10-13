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

### Analyze Book

**POST** `/api/analyze-book`

Upload and analyze an ebook file to extract metadata and generate AI analysis.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: File field named `file` containing a PDF or EPUB file
- Query Parameters (optional):
  - `extractCover` (boolean, default: `false`) - Set to `true` to include cover image (adds ~480KB to response)

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

- `400 Bad Request` - No file uploaded or invalid file type
- `500 Internal Server Error` - Processing error

```json
{
  "error": "Error message describing what went wrong"
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

2. **From your meBooks app, make a POST request:**
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

3. **Handle the response in your meBooks UI:**
   - Display the AI-generated summary
   - Show the cover image
   - Present metadata fields
   - Display classifications for library organization
   - Show table of contents

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

---

## CORS Configuration

The API is configured with CORS enabled for all origins. For production use, you should restrict this:

```typescript
// In server/index.ts
app.use(cors({
  origin: 'http://localhost:3000' // Your meBooks app URL
}));
```
