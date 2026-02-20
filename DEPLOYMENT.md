# Deployment Guide for Render

This guide will help you deploy the AI Ebook Cataloger to Render using separate services for the API and frontend.

## Prerequisites

1. A [Render account](https://render.com) (free tier available)
2. Your repository pushed to GitHub
3. A valid Gemini API key

## Deployment Steps

### 1. Connect Your Repository

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service" and connect your GitHub repository: `JamesEnglish1028/Ai-Assisted-Ebook-Cataloger`
3. Click "New +" → "Static Site" and connect the same repository

### 2. Configure the Services

**API Web Service Settings:**
- **Name**: `ai-ebook-cataloger-api`
- **Environment**: `Node`
- **Region**: Choose closest to your users
- **Branch**: `main`

**Build & Deploy Settings:**
- **Build Command**: `npm ci && npm run ci:render-api`
- **Start Command**: `npm start`
  - This CI step runs a lightweight API smoke test (`tests/textAnalysis.test.ts`) during Render build.

**Static Site Settings:**
- **Name**: `ai-ebook-cataloger-web`
- **Branch**: `main`
- **Build Command**: `npm ci && npm run ci:render-web`
- **Publish Directory**: `dist`

### 3. Set Environment Variables

In the Render dashboard, add these environment variables:

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | API service |
| `NODE_VERSION` | `22` | API service runtime |
| `GEMINI_API_KEY` | `your_api_key_here` | API service |
| `VITE_API_BASE_URL` | `https://ai-ebook-cataloger-api.onrender.com` | Static site |

### 4. Deploy

1. Click "Create Web Service" and "Create Static Site"
2. Render will automatically:
  - Clone your repository
  - Install dependencies
  - Build the frontend for the static site
  - Start the API server

### 5. Access Your App

Once deployed, your app will be available at:
```
https://your-static-site.onrender.com
```

## Features Available After Deployment

- ✅ **Web Interface**: Upload and analyze ebooks
- ✅ **REST API**: `https://your-api-service.onrender.com/api/analyze-book`
- ✅ **Rate Limiting**: Production security enabled
- ✅ **File Processing**: PDF and EPUB support
- ✅ **AI Analysis**: Google Gemini integration

## API Usage

Your deployed API can be used by other applications:

```javascript
const response = await fetch('https://your-app-name.onrender.com/api/analyze-book', {
  method: 'POST',
  body: formData // File in FormData
});

const analysis = await response.json();
```

## Troubleshooting

### Build Fails
- Check that `GEMINI_API_KEY` is set in environment variables
- Verify your GitHub repository is accessible

### App Doesn't Start
- Check logs in Render dashboard
- Ensure `NODE_ENV=production` is set

### API Errors
- Verify Gemini API key is valid and has credits
- Check file size limits (100MB max)

## Render Free Tier Limitations

- ⏰ **Cold Starts**: App sleeps after 15 minutes of inactivity
- 💾 **Storage**: Temporary file storage only
- 🔄 **Restarts**: May restart periodically

For production use, consider upgrading to a paid plan for:
- No cold starts
- Persistent storage
- Better performance
- Custom domains

## Cost Estimates

**Render Free Tier**: $0/month
- Good for development and light usage
- Cold starts after inactivity

**Render Starter Plan**: $7/month
- No cold starts
- Better for production use
- Custom domain support

**Gemini API**: Pay-per-use
- Free tier: 15 requests/minute
- Paid: $0.075 per 1K tokens

## Security Notes

- 🔒 HTTPS is automatically enabled
- 🛡️ Rate limiting is configured
- 🔑 Environment variables are encrypted
- 🚫 No sensitive data is stored in code

## Monitoring

Monitor your deployment in Render dashboard:
- View logs for debugging
- Monitor resource usage
- Set up alerts for downtime

---

Need help? Check the [Render documentation](https://render.com/docs) or open an issue on GitHub.
