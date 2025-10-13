import express from 'express';
import { GoogleGenAI } from '@google/genai';

console.log('✅ Imported @google/genai successfully');

const app = express();
const PORT = 3002;

app.get('/test', (req, res) => {
  console.log('✅ Test endpoint hit!');
  res.json({ status: 'ok', message: 'Test with @google/genai import works!' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Minimal server running on http://localhost:${PORT}`);
  console.log(`📚 Test endpoint: http://localhost:${PORT}/test`);
  console.log('✅ Server is actually listening!');
});

server.on('error', (err) => {
  console.error('❌ Server error:', err);
});
