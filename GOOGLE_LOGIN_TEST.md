# Google Login Testing Guide

## ✅ Prerequisites Checklist

### 1. Google Cloud Console Setup
**CRITICAL:** Add this redirect URI to your Google OAuth 2.0 Client:
```
http://localhost:3001/auth/google/login/callback
```

**Steps:**
1. Go to: https://console.cloud.google.com
2. Select your project
3. Go to: APIs & Services → Credentials
4. Click your OAuth 2.0 Client ID
5. Under "Authorized redirect URIs", add:
   - `http://localhost:3001/auth/google/login/callback`
6. Click **SAVE**

### 2. Environment Variables (.env file)
Verify these are set:
```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
BACKEND_URL=http://localhost:3001
FRONTEND_URL=http://localhost:8080
JWT_SECRET=your-jwt-secret
```

### 3. Backend Running
Check terminal 8 shows:
```
🚀 Backend server running on http://localhost:3001
✅ Google Login OAuth routes registered at /auth/google
```

### 4. Frontend Running
Check terminal 3 shows:
```
➜  Local:   http://localhost:8080/
```

---

## 🧪 Testing Steps

### Step 1: Open Browser Console
1. Open Chrome/Edge
2. Press **F12**
3. Go to **Console** tab
4. Keep it open

### Step 2: Navigate to Sign In
```
http://localhost:8080/auth
```

### Step 3: Click "Continue with Google"
**Expected Console Output:**
```
[GoogleButton] Redirecting to: http://localhost:3001/auth/google/login
```

**Expected Result:**
- Browser redirects to Google OAuth consent screen
- URL changes to `accounts.google.com/o/oauth2/v2/auth...`

### Step 4: Check Backend Logs (Terminal 8)
**Should show:**
```
[Google Login] /login endpoint hit
[Google Login] REDIRECT_URI: http://localhost:3001/auth/google/login/callback
[Google Login] CLIENT_ID: Set
[Google Login] CLIENT_SECRET: Set
[Google Login] Redirecting to Google OAuth URL
```

**If you see:**
- `CLIENT_ID: NOT SET` → Add GOOGLE_CLIENT_ID to .env
- `CLIENT_SECRET: NOT SET` → Add GOOGLE_CLIENT_SECRET to .env
- Error 500 → Check backend terminal for error details

### Step 5: Select Google Account
- Choose your Google account
- Click "Continue" or "Allow"

### Step 6: Check Callback (Terminal 8)
**Should show:**
```
[Google Login] Callback received
[Google Login] Authorization code received, exchanging for tokens...
[Google Login] User info extracted: { email: 'your@email.com', name: 'Your Name' }
[Google Login] Looking up user in database...
[Google Login] Existing user found: <user-id>  OR  New user created: <user-id>
[Google Login] Creating JWT token and session...
[Google Login] Session created successfully
[Google Login] Redirecting to: http://localhost:8080/?token=<jwt-token>
```

### Step 7: Frontend Token Handling
**Browser Console should show:**
```
[Google Login] Token received in URL, storing and reloading...
```

**Expected Result:**
- Page reloads
- You're logged in
- Dashboard shows (if you have no sources, it shows "Connect Gmail/Drive" message)

---

## 🚨 Troubleshooting

### Error: "redirect_uri_mismatch"
**Problem:** Redirect URI not added in Google Console
**Solution:** 
1. Go to Google Cloud Console
2. Add EXACT URI: `http://localhost:3001/auth/google/login/callback`
3. SAVE and wait 5 minutes for propagation

### Error: "oauth_not_configured"
**Problem:** Missing Google OAuth credentials
**Solution:**
1. Check `.env` file has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
2. Restart backend: Kill terminal 8 process, run `npm run dev:backend`

### Backend shows "CLIENT_ID: NOT SET"
**Problem:** .env not loaded
**Solution:**
```bash
# Stop backend (Ctrl+C in terminal)
# Verify .env exists in project root
# Run:
npm run dev:backend
```

### Token in URL but not logged in
**Problem:** Token handler not working
**Solution:**
1. Open browser console
2. Run: `localStorage.clear()`
3. Refresh page
4. Try again

### Stuck on loading spinner
**Problem:** Auth context not updating
**Solution:**
1. Check backend logs for errors
2. Verify JWT_SECRET is set in .env
3. Check browser Network tab (F12 → Network) for failed API calls

---

## 🔍 Debug Commands

### Check Backend Server
```bash
curl http://localhost:3001/health
# Should return: {"status":"ok","message":"Server is running"}
```

### Check Token Storage
**Browser Console:**
```javascript
console.log('Token:', localStorage.getItem('auth_token'));
// Should show JWT token string or null
```

### Test Direct Auth URL
**Visit in browser:**
```
http://localhost:3001/auth/google/login
```
**Should redirect to Google immediately**

### Check Database User
**Run in backend terminal (Ctrl+C first):**
```bash
node -e "
import pool from './server/config/database.js';
const result = await pool.query('SELECT email, full_name FROM users WHERE password_hash IS NULL');
console.log('Google users:', result.rows);
process.exit(0);
"
```

---

## ✅ Success Criteria

1. ✅ Button click → Google consent screen
2. ✅ Select account → Callback logs shown
3. ✅ User created/found in database
4. ✅ Session created
5. ✅ Redirect to `/?token=...`
6. ✅ Token stored in localStorage
7. ✅ Page reloads
8. ✅ Dashboard shows (logged in)

---

## 📞 If Still Not Working

**Provide these details:**
1. Screenshot of browser console (F12 → Console)
2. Backend terminal logs (terminal 8 output)
3. Error message if any
4. What step it fails at

