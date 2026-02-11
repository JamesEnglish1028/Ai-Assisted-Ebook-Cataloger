import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import bookAnalysisRouter from '../server/routes/bookAnalysis';
import { parsePdfFile } from '../server/services/fileParser';
import { generateBookAnalysis } from '../server/services/geminiService';

jest.mock('../server/services/fileParser', () => ({
  parsePdfFile: jest.fn(),
  parseEpubFile: jest.fn(),
}));

jest.mock('../server/services/geminiService', () => ({
  generateBookAnalysis: jest.fn(),
}));

// Create a test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api', bookAnalysisRouter);
  
  // Error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.status(err.status || 500).json({
      error: err.message || 'Internal server error'
    });
  });
  
  return app;
};

describe('Book Analysis API Integration Tests', () => {
  let app: express.Application;
  const mockParsePdfFile = parsePdfFile as jest.MockedFunction<typeof parsePdfFile>;
  const mockGenerateBookAnalysis = generateBookAnalysis as jest.MockedFunction<typeof generateBookAnalysis>;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockParsePdfFile.mockResolvedValue({
      text: 'This is extracted PDF text used for testing.',
      coverImageUrl: null,
      metadata: {
        title: 'Test PDF Title',
        author: 'Test Author',
        pageCount: { value: 1, type: 'actual' }
      },
      toc: null,
      pageList: null
    });

    mockGenerateBookAnalysis.mockResolvedValue({
      summary: 'Test summary for integration path.',
      lcc: [],
      bisac: [],
      lcsh: [],
      fieldOfStudy: 'Humanities',
      discipline: 'Languages & Literature'
    });
  });

  describe('POST /api/analyze-book', () => {
    it('should reject requests without a file', async () => {
      const response = await request(app)
        .post('/api/analyze-book')
        .expect(400);

      expect(response.body).toEqual({
        error: 'No file uploaded',
        code: 'FILE_REQUIRED',
        message: 'Please upload a PDF or EPUB file'
      });
    });

    it('should reject invalid file types', async () => {
      const response = await request(app)
        .post('/api/analyze-book')
        .attach('file', Buffer.from('fake content'), {
          filename: 'test.txt',
          contentType: 'text/plain'
        })
        .expect(400);

      expect(response.body.error).toContain('Invalid file type');
    });

    it('should reject empty files', async () => {
      const response = await request(app)
        .post('/api/analyze-book')
        .attach('file', Buffer.from(''), {
          filename: 'empty.pdf',
          contentType: 'application/pdf'
        })
        .expect(400);

      expect(response.body).toEqual({
        error: 'Empty file uploaded',
        code: 'FILE_EMPTY',
        message: 'The uploaded file appears to be empty'
      });
    });

    it('should handle query parameter validation', async () => {
      const response = await request(app)
        .post('/api/analyze-book?extractCover=invalid')
        .attach('file', Buffer.from('fake pdf content'), {
          filename: 'test.pdf',
          contentType: 'application/pdf'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'extractCover',
            message: 'extractCover must be a boolean value (true/false)'
          })
        ])
      );
    });

    describe('Query parameter validation', () => {
      it('should accept valid extractCover parameter', async () => {
        const response = await request(app)
          .post('/api/analyze-book?extractCover=true')
          .attach('file', Buffer.from('fake pdf'), {
            filename: 'test.pdf',
            contentType: 'application/pdf'
          })
          .expect(200);

        expect(response.body).toHaveProperty('summary');
        expect(mockParsePdfFile).toHaveBeenCalledWith(
          expect.any(Buffer),
          expect.objectContaining({
            extractCover: true,
            maxTextLength: 200000
          })
        );
      });

      it('should accept valid maxTextLength parameter', async () => {
        const response = await request(app)
          .post('/api/analyze-book?maxTextLength=50000')
          .attach('file', Buffer.from('fake pdf'), {
            filename: 'test.pdf',
            contentType: 'application/pdf'
          })
          .expect(200);

        expect(response.body).toHaveProperty('summary');
        expect(mockParsePdfFile).toHaveBeenCalledWith(
          expect.any(Buffer),
          expect.objectContaining({
            extractCover: false,
            maxTextLength: 50000
          })
        );
      });

      it('should reject invalid maxTextLength parameter', async () => {
        const response = await request(app)
          .post('/api/analyze-book?maxTextLength=100')
          .attach('file', Buffer.from('fake pdf'), {
            filename: 'test.pdf',
            contentType: 'application/pdf'
          })
          .expect(400);

        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: 'maxTextLength must be between 1000 and 500000 characters'
            })
          ])
        );
      });
    });

    describe('File size limits', () => {
      it('should accept files within size limit', async () => {
        const reasonableSizeContent = Buffer.alloc(1024); // 1KB
        const response = await request(app)
          .post('/api/analyze-book')
          .attach('file', reasonableSizeContent, {
            filename: 'test.pdf',
            contentType: 'application/pdf'
          });

        // Should not fail due to file size
        expect(response.status).not.toBe(413);
      });

      it('should return 413 for files exceeding size limit', async () => {
        const largeContent = Buffer.alloc((100 * 1024 * 1024) + 1); // 100MB + 1 byte
        const response = await request(app)
          .post('/api/analyze-book')
          .attach('file', largeContent, {
            filename: 'too-large.pdf',
            contentType: 'application/pdf'
          })
          .expect(413);

        expect(response.body).toEqual({
          error: 'File too large',
          code: 'FILE_TOO_LARGE',
          message: 'File size must be less than 100MB'
        });
      });
    });

    it('should return successful PDF analysis response', async () => {
      const response = await request(app)
        .post('/api/analyze-book')
        .attach('file', Buffer.from('fake pdf payload'), {
          filename: 'success.pdf',
          contentType: 'application/pdf'
        })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          summary: 'Test summary for integration path.',
          fileName: 'success.pdf',
          fileType: 'pdf',
          metadata: expect.objectContaining({
            title: 'Test PDF Title',
            author: 'Test Author',
            fieldOfStudy: 'Humanities',
            discipline: 'Languages & Literature'
          })
        })
      );

      expect(mockParsePdfFile).toHaveBeenCalledTimes(1);
      expect(mockGenerateBookAnalysis).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling', () => {
    it('should handle multer errors gracefully', async () => {
      // This test would require mocking multer to throw specific errors
      // For now, we verify the general error structure
      const response = await request(app)
        .post('/api/analyze-book')
        .attach('file', Buffer.from('content'), {
          filename: 'test.invalid',
          contentType: 'application/invalid'
        });

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
    });
  });
});
