import express from 'express';

const app = express();
const PORT = 3333;

app.get('/test', (req, res) => {
  console.log('✅ Request received!');
  res.json({ status: 'ok', message: 'Plain JS server works!' });
});

console.log('Creating server...');
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
  console.log('Address:', server.address());
});

server.on('error', (err) => {
  console.error('Server error:', err);
});

console.log('Script finished, server should be running');
