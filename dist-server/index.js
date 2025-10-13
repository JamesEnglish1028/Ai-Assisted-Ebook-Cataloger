import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bookAnalysisRouter from './routes/bookAnalysis';
// Load environment variables
dotenv.config();
const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
// Middleware
app.use(cors());
app.use(express.json());
// Routes
app.use('/api', bookAnalysisRouter);
// Health check endpoint
app.get('/health', (req, res) => {
    console.log('✅ Health check endpoint called');
    res.json({ status: 'ok', message: 'AI Ebook Cataloger API is running' });
});
// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});
console.log('About to call app.listen on port:', PORT);
console.log('PORT type:', typeof PORT);
console.log('app object:', !!app);
const server = app.listen(PORT, '127.0.0.1', () => {
    const address = server.address();
    console.log('=== Server callback fired ===');
    console.log('Server address:', address);
    console.log(`🚀 API Server running on http://localhost:${PORT}`);
    console.log(`📚 Health check: http://localhost:${PORT}/health`);
    console.log(`📖 Analyze endpoint: http://localhost:${PORT}/api/analyze-book`);
    console.log('✅ Server is listening and ready to accept connections');
    console.log('Server listening property:', server.listening);
});
server.on('error', (err) => {
    console.error('❌ Server error:', err);
    process.exit(1);
});
server.on('listening', () => {
    console.log('=== Server listening event fired ===');
    console.log('Address:', server.address());
});
// Add some debugging
console.log('Server object created:', !!server);
console.log('Server listening (immediate):', server.listening);
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
