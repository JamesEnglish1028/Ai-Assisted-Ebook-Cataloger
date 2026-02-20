# 🚀 Render Deployment Guide

This guide provides step-by-step instructions for deploying the AI-Assisted Ebook Cataloger to Render.

## Overview

The application is configured as **two Render services**: a Node.js API service and a static site for the React frontend. This keeps the API secure and the frontend fast.

## Prerequisites

1. **Render Account**: Sign up at [render.com](https://render.com)
2. **GitHub Repository**: Your code must be in a GitHub repository
3. **Gemini API Key**: Get from [Google AI Studio](https://aistudio.google.com/app/apikey)

## Deployment Architecture

```
┌─────────────────────────┐       ┌─────────────────────────┐
│  Render Web Service     │       │   Render Static Site    │
├─────────────────────────┤       ├─────────────────────────┤
│  📦 Node.js API         │       │  ⚡ Vite build output   │
│  ├─ /api/* routes       │       │  └─ dist/               │
│  └─ /health             │       │                         │
└─────────────────────────┘       └─────────────────────────┘
```

## Step 1: Repository Preparation

1. **Ensure your repository has these files:**
   ```
   render.yaml          ← Render configuration
   package.json         ← Dependencies and scripts
   .env.example         ← Environment variables template
   server/index.ts      ← Express server
   ```

2. **Verify package.json scripts include:**
   ```json
   {
     "scripts": {
       "render-build": "npm ci && npm run build && npm run postbuild",
       "start": "NODE_ENV=production node --import tsx/esm server/index.ts",
       "build": "vite build"
     }
   }
   ```

## Step 2: Create Render Services

### Option A: Using render.yaml (Recommended)

1. **Connect Repository to Render:**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select the repository: `Ai-Assisted-Ebook-Cataloger`

2. **Configure Services (from render.yaml):**
- **API Web Service**: `ai-ebook-cataloger-api`
- **Static Site**: `ai-ebook-cataloger-web`

### Option B: Manual Configuration

If you prefer manual setup instead of render.yaml:

1. **API Web Service:**
```
Name: ai-ebook-cataloger-api
Environment: Node
Build Command: npm ci && npm run ci:render-api
Start Command: npm run start
```
This build command runs a lightweight API smoke test (`tests/textAnalysis.test.ts`) that does not require opening network sockets during Render build.

2. **Static Site:**
```
Name: ai-ebook-cataloger-web
Build Command: npm ci && npm run ci:render-web
Publish Directory: dist
```

2. **Advanced Settings:**
   ```
   Plan: Starter
   Node Version: 22 (latest LTS)
   Health Check Path: /health
   ```

## Step 3: Environment Variables

Set these environment variables in the Render dashboard:

### API Service Variables
```bash
# Essential - Get from Google AI Studio
GEMINI_API_KEY=your_actual_gemini_api_key_here

# Automatic - Set by Render
NODE_ENV=production
PORT=10000
NODE_VERSION=22

```

### Static Site Variables
```bash
# Points the frontend to the API service
VITE_API_BASE_URL=https://ai-ebook-cataloger-api.onrender.com

```

### Setting Variables in Render Dashboard

1. Go to your service → "Environment" tab
2. Add each variable:
   - Key: `GEMINI_API_KEY`
   - Value: Your actual API key
   - Click "Save Changes"

⚠️ **Important**: Never commit your actual API key to the repository!

## Step 4: Deploy and Verify

### Initial Deployment

1. **Trigger Deploy:**
   - Push changes to your main branch, or
   - Click "Manual Deploy" in Render dashboard

2. **Monitor Build Process:**
   - Check build logs in Render dashboard
   - Build typically takes 3-5 minutes
   - Look for "Build successful" message

### Verification Steps

1. **Health Check:**
   ```bash
   curl https://your-app.onrender.com/health
   # Should return: {"status":"ok","message":"AI Ebook Cataloger API is running"}
   ```

2. **Frontend Access:**
   - Visit: `https://your-app.onrender.com`
   - Should load the React application

3. **API Test:**
   ```bash
   curl -X POST https://your-app.onrender.com/api/analyze-book \
     -F "file=@sample.pdf"
   ```

## Expected Render Configuration

Your `render.yaml` should look like this:

```yaml
services:
   - type: web
      name: ai-ebook-cataloger-api
      env: node
      plan: starter
      buildCommand: npm ci && npm run ci:render-api
      startCommand: npm run start
      healthCheckPath: /health
      region: oregon
      numInstances: 1
      maxMemoryGB: 2
      envVars:
         - key: NODE_ENV
            value: production
         - key: NODE_VERSION
            value: "22"
         - key: GEMINI_API_KEY
            sync: false
         - key: PORT
            value: "10000"

staticSites:
   - name: ai-ebook-cataloger-web
      buildCommand: npm ci && npm run ci:render-web
      staticPublishPath: dist
      envVars:
         - key: VITE_API_BASE_URL
            sync: false
```

## Troubleshooting

### Build Failures

**Problem**: Build fails with dependency errors
```bash
# Solution: Ensure all production dependencies are in dependencies, not devDependencies
npm audit
```

**Problem**: TypeScript compilation errors
```bash
# Check TypeScript configuration
npx tsc --noEmit
```

### Runtime Errors

**Problem**: Server won't start
- Check environment variables are set correctly
- Verify PORT is set to "10000" (as string)
- Check server logs in Render dashboard

**Problem**: Static files not served
- Verify `dist/` directory exists after build
- Check Express static file configuration
- Ensure build command runs `npm run build`

### Performance Issues

**Problem**: Cold starts (first request slow)
- **Solution**: Use Starter plan or higher (has better cold start performance)
- Consider using render's "keep alive" features

**Problem**: File upload timeouts
- **Solution**: Render has 30-second request timeout
- Large files (>50MB) may timeout
- Consider implementing chunked uploads for very large files

## Production Considerations

### Security
- ✅ Helmet.js enabled for security headers
- ✅ Rate limiting configured (10 requests/15 minutes)
- ✅ CORS configured
- ✅ File size limits (100MB max)

### Performance
- ✅ Compression enabled
- ✅ Static file caching (1 day)
- ✅ Production build optimizations
- ⚠️ Consider Redis for caching if scaling up

### Monitoring
- ✅ Health check endpoint at `/health`
- ✅ Structured error logging
- 📊 Consider integrating Render metrics with external monitoring

## Cost Estimation

- **Starter Plan**: $7/month (recommended)
  - 512MB RAM, 0.5 CPU
  - Includes Puppeteer support
  - Custom domains

- **Standard Plan**: $25/month (high traffic)
  - 2GB RAM, 1 CPU
  - Better performance for concurrent users

## Support Resources

- **Render Docs**: [render.com/docs](https://render.com/docs)
- **Node.js on Render**: [render.com/docs/node-version](https://render.com/docs/node-version)
- **Puppeteer on Render**: [render.com/docs/puppeteer](https://render.com/docs/puppeteer)

## Next Steps After Deployment

1. **Set up Custom Domain** (optional)
2. **Configure SSL Certificate** (automatic with Render)
3. **Set up Monitoring/Alerts**
4. **Consider CDN for static assets** (if needed for global users)

---

## Quick Deploy Checklist

- [ ] Repository connected to Render
- [ ] `render.yaml` configured
- [ ] Environment variables set (especially `GEMINI_API_KEY`)
- [ ] Build command: `npm run render-build`
- [ ] Start command: `npm run start`
- [ ] Plan: Starter or higher
- [ ] Health check: `/health`
- [ ] Test deployment with sample file

Your application should now be live at: `https://your-service-name.onrender.com` 🎉
