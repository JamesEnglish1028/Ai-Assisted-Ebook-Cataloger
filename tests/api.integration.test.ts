import request from 'supertest';
import express from 'express';
import path from 'path';
import fs from 'fs';
import bookAnalysisRouter from '../server/routes/bookAnalysis';

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

  beforeAll(() => {
    app = createTestApp();
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
            field: 'query',
            message: 'extractCover must be a boolean value (true/false)'
          })
        ])
      );
    });

    // Note: We can't easily test successful file processing in unit tests
    // without mocking the file parsing services, which would be complex.
    // For now, we'll test the validation and error handling paths.
    
    describe('Query parameter validation', () => {
      it('should accept valid extractCover parameter', async () => {
        const response = await request(app)
          .post('/api/analyze-book?extractCover=true')
          .attach('file', Buffer.from('fake pdf'), {
            filename: 'test.pdf',
            contentType: 'application/pdf'
          });
        
        // Should pass validation (will fail later in processing, but that's expected)
        expect(response.status).not.toBe(400);
      });

      it('should accept valid maxTextLength parameter', async () => {
        const response = await request(app)
          .post('/api/analyze-book?maxTextLength=50000')
          .attach('file', Buffer.from('fake pdf'), {
            filename: 'test.pdf',
            contentType: 'application/pdf'
          });
        
        expect(response.status).not.toBe(400);
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

      // Note: Testing actual large files would be impractical in unit tests
      // This would be better tested in e2e tests with real file fixtures
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