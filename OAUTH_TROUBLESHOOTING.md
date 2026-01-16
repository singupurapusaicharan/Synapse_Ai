# OAuth "Unsupported State" Error - Fix Guide

## Problem
When trying to sync Gmail/Drive, you get an error: **"Sync failed - Unsupported state"**

## Root Cause
This error comes from Google OAuth when:
1. The redirect URI doesn't match what's configured in Google Cloud Console
2. The state parameter is malformed or too long
3. The BACKEND_URL environment variable is incorrect

## Solution

### Step 1: Check Your Render Backend URL
1. Go to your Render dashboard: https://dashboard.render.com
2. Find your `synapse-ai-backend` service
3. Copy the URL (it should look like: `https://synapse-ai-backend-xxxx.onrender.com`)

### Step 2: Update Environment Variables on Render
1. In Render dashboard, go to your backend service
2. Click "Environment" tab
3. Update these variables:
   - `BACKEND_URL` = `https://synapse-ai-backend-xxxx.onrender.com` (your actual Render URL)
   - `FRONTEND_URL` = `https://synapse-ai.vercel.app` (your Vercel URL)

### Step 3: Update Google Cloud Console
1. Go to: https://console.cloud.google.com/apis/credentials
2. Find your OAuth 2.0 Client ID
3. Click "Edit"
4. Under "Authorized redirect URIs", make sure you have BOTH:
   - `http://localhost:3001/auth/google/callback` (for local development)
   - `https://synapse-ai-backend-xxxx.onrender.com/auth/google/callback` (for production - use YOUR actual Render URL)
5. Click "Save"

### Step 4: Redeploy Backend
After updating environment variables on Render:
1. Go to your backend service in Render
2. Click "Manual Deploy" → "Deploy latest commit"
3. Wait for deployment to complete

### Step 5: Test the Fix
1. Go to your website: https://synapse-ai.vercel.app
2. Navigate to Sources page
3. Click "Connect" on Gmail
4. Complete Google OAuth
5. Try syncing - it should work now!

## Additional Notes

### State Parameter Fix
We've updated the code to use Base64 encoding for the state parameter instead of JSON + URL encoding. This is more reliable and prevents "Unsupported state" errors.

### Redirect URI Must Match EXACTLY
Google OAuth is very strict about redirect URIs. They must match character-by-character:
- Protocol (http vs https)
- Domain
- Port (if any)
- Path

### Common Mistakes
❌ `http://localhost:3001/auth/google/callback` in production
✅ `https://your-actual-render-url.onrender.com/auth/google/callback` in production

❌ Trailing slash: `https://example.com/auth/google/callback/`
✅ No trailing slash: `https://example.com/auth/google/callback`

## Verification
After fixing, check the server logs on Render:
1. Go to Render dashboard → Your backend service → Logs
2. Look for these log messages when connecting:
   ```
   [OAuth] Using redirect URI: https://your-render-url.onrender.com/auth/google/callback
   [OAuth] BACKEND_URL: https://your-render-url.onrender.com
   ```
3. The URLs should match your production environment

## Still Having Issues?
If you still see "Unsupported state" error:
1. Clear your browser cookies and cache
2. Try in an incognito/private window
3. Check Render logs for detailed error messages
4. Verify all environment variables are set correctly
5. Make sure Google Cloud Console redirect URIs are saved
