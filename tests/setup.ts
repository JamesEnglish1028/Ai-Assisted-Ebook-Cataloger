// Jest setup file
import { config } from 'dotenv';

// Load environment variables for testing
config({ path: '.env.test' });

// Fallback to .env if .env.test doesn't exist
if (!process.env.GEMINI_API_KEY) {
  config();
}

// Set test environment variables
process.env.NODE_ENV = 'test';

// Global test timeout
jest.setTimeout(30000);