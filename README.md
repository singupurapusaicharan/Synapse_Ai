# Synapse AI - Personal Knowledge Assistant

Synapse AI is a powerful RAG (Retrieval-Augmented Generation) application that enables semantic search across your personal data sources (Gmail, Google Drive) using local LLMs (Ollama) and vector embeddings. Ask natural language questions and get grounded answers with citations from your indexed data.

## 🚀 Features

- **🔍 Semantic Search** - Natural language queries across all connected sources
- **📧 Gmail Integration** - Search through emails with sender-based filtering
- **📁 Google Drive Integration** - Find and query documents
- **💬 ChatGPT-Style Chat** - Persistent chat sessions with conversation history
- **🔐 Secure Authentication** - JWT-based auth with password reset
- **🔒 Encrypted OAuth Tokens** - AES-256-GCM encryption for Google tokens
- **📊 Vector Search** - pgvector-powered similarity search with hybrid retrieval
- **🎨 Modern UI** - Beautiful React + TypeScript interface with shadcn/ui
- **⚡ Fast Responses** - Optimized Ollama integration with context limiting

## 🛠️ Tech Stack

### Frontend
- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** + **shadcn/ui** components
- **React Router** for navigation
- **TanStack Query** for data fetching

### Backend
- **Node.js** + **Express.js**
- **Supabase PostgreSQL** with **pgvector** extension
- **Ollama** for local LLM inference (embeddings + chat)
- **Google APIs** (Gmail + Drive) with OAuth 2.0
- **JWT** authentication + **bcrypt** password hashing
- **Nodemailer** for email sending

### AI/ML
- **Embeddings**: `nomic-embed-text` (768 dimensions)
- **Chat Model**: `mistral` (fallback: `phi`)
- **Vector Search**: pgvector with cosine similarity
- **Hybrid Retrieval**: Metadata filtering + vector search

## 📋 Prerequisites

- **Node.js 18+** and npm
- **Supabase account** (free tier available)
- **Ollama** installed and running locally
- **Google Cloud Project** (for Gmail/Drive OAuth)

## 🔧 Installation

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd synapse-ai-workspace
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Get your credentials from **Settings** → **API**:
   - **Project URL** (`SUPABASE_URL`)
   - **service_role key** (`SUPABASE_SERVICE_ROLE_KEY`)
3. Get database connection string from **Settings** → **Database** → **Connection string** → **URI** (`SUPABASE_DB_URL`)
4. Enable **pgvector** extension in Supabase SQL Editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

### 4. Set Up Ollama

1. Install Ollama from [ollama.ai](https://ollama.ai)
2. Pull required models:
   ```bash
   ollama pull nomic-embed-text  # For embeddings
   ollama pull mistral            # For chat (or phi as fallback)
   ```
3. Verify Ollama is running:
   ```bash
   curl http://localhost:11434/api/tags
   ```

### 5. Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable **Gmail API** and **Google Drive API**
4. Create **OAuth 2.0 Client ID** (Web application)
5. Add **Authorized redirect URIs**:
   - Development: `http://localhost:3001/auth/google/callback`
   - Production: `https://your-backend-domain.com/auth/google/callback`
6. Add **Authorized JavaScript origins**:
   - `http://localhost:3001`
   - `http://localhost:8080`
7. Add your email as a **Test user** (if app is in Testing mode)
8. Copy **Client ID** and **Client Secret**

### 6. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# ============================================
# SUPABASE CONFIGURATION (REQUIRED)
# ============================================
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# ============================================
# JWT & AUTHENTICATION (REQUIRED)
# ============================================
JWT_SECRET=your-random-secret-key-min-32-chars

# ============================================
# SERVER CONFIGURATION (REQUIRED)
# ============================================
PORT=3001
FRONTEND_URL=http://localhost:8080
BACKEND_URL=http://localhost:3001

# ============================================
# FRONTEND CONFIGURATION (REQUIRED)
# ============================================
VITE_API_BASE_URL=http://localhost:3001/api

# ============================================
# GOOGLE OAUTH (REQUIRED for Gmail/Drive)
# ============================================
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# ============================================
# ENCRYPTION (REQUIRED for OAuth token storage)
# ============================================
# Generate a 32-character random key (AES-256-GCM)
ENCRYPTION_KEY=your-random-32-character-key

# ============================================
# OLLAMA CONFIGURATION (OPTIONAL)
# ============================================
# Default: http://localhost:11434
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_CHAT_MODEL=mistral
OLLAMA_CHAT_FALLBACK_MODEL=phi

# ============================================
# EMAIL CONFIGURATION (OPTIONAL)
# ============================================
# Options: console, gmail, sendgrid, smtp
EMAIL_PROVIDER=console

# For Gmail:
# EMAIL_USER=your-email@gmail.com
# EMAIL_PASSWORD=your-app-password
# EMAIL_FROM=your-email@gmail.com

# For SendGrid:
# SENDGRID_API_KEY=your-api-key
# EMAIL_FROM=your-email@domain.com

# For Custom SMTP:
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=your-email@example.com
# SMTP_PASSWORD=your-password
# EMAIL_FROM=your-email@example.com
```

**Generate secure keys:**
```bash
# JWT Secret (32+ characters)
openssl rand -base64 32

# Encryption Key (32 characters)
openssl rand -hex 16
```

### 7. Initialize Database

```bash
npm run init:db
```

This will:
- Create all required tables (users, sessions, sources, document_chunks, query_history, chat_sessions, chat_messages, oauth_tokens)
- Enable pgvector extension
- Create indexes for vector search
- Set up schema migrations

### 8. Start Development Servers

```bash
# Start both frontend and backend
npm run dev:all

# Or separately:
npm run dev:backend  # Backend: http://localhost:3001
npm run dev          # Frontend: http://localhost:8080
```

## 📁 Project Structure

```
synapse-ai-workspace/
├── server/                    # Backend Express server
│   ├── config/
│   │   └── database.js        # Supabase PostgreSQL connection
│   ├── lib/                   # Core utilities
│   │   ├── ollama.js          # Ollama client (embeddings + chat)
│   │   ├── vectorSearch.js    # pgvector similarity search
│   │   ├── vectorStore.js     # Store embeddings in Supabase
│   │   ├── ingestion.js       # Gmail/Drive data ingestion
│   │   ├── googleOAuthReal.js # Google OAuth 2.0 flow
│   │   ├── encryption.js      # AES-256-GCM token encryption
│   │   ├── textClean.js       # HTML stripping, normalization
│   │   └── chunkText.js       # Text chunking (300-500 words)
│   ├── middleware/
│   │   ├── auth.js            # JWT authentication
│   │   ├── sessionAuth.js     # Session verification
│   │   └── rateLimit.js       # Rate limiting
│   ├── routes/
│   │   ├── auth.js            # Authentication endpoints
│   │   ├── oauth.js           # Google OAuth callbacks
│   │   ├── chat.js            # RAG chat endpoints
│   │   ├── history.js         # Query history
│   │   └── sources.js         # Source management
│   ├── scripts/
│   │   ├── initSupabase.js    # Database initialization
│   │   └── checkSupabase.js   # Database diagnostic tool
│   ├── utils/
│   │   └── email.js           # Email sending (Nodemailer)
│   └── index.js               # Express server entry point
├── src/                        # Frontend React application
│   ├── components/
│   │   ├── chat/              # Chat UI components
│   │   ├── layout/            # Layout components
│   │   ├── effects/           # Animations
│   │   └── ui/                # shadcn/ui components
│   ├── hooks/
│   │   ├── useAuth.tsx        # Authentication hook
│   │   └── use-toast.ts       # Toast notifications
│   ├── lib/
│   │   ├── api/
│   │   │   └── client.ts      # API client
│   │   └── utils.ts           # Utility functions
│   ├── pages/
│   │   ├── Dashboard.tsx      # Main chat interface
│   │   ├── History.tsx        # Chat history
│   │   ├── Sources.tsx        # Source management
│   │   ├── Auth.tsx           # Sign in/up
│   │   └── ...
│   └── types/
│       └── index.ts           # TypeScript types
├── public/                     # Static assets
├── .env                        # Environment variables (NOT in git)
├── .gitignore
├── package.json
└── README.md
```

## 🎯 Usage

### 1. Sign Up / Sign In

- Create an account at `/auth`
- Sign in with email and password
- Use "Forgot Password" if needed

### 2. Connect Sources

1. Go to **Sources** page
2. Click **Connect** for Gmail or Google Drive
3. Authorize access in Google OAuth flow
4. Source status will show as "Connected"

### 3. Sync Data

1. Click **Sync** button for connected sources
2. System will:
   - Fetch emails/documents (last 30 days, limited counts)
   - Clean and chunk text (300-500 words with overlap)
   - Generate embeddings using Ollama
   - Store in Supabase `document_chunks` table
3. Wait for sync to complete (check backend logs)

### 4. Ask Questions

1. Go to **Chat** page
2. Ask natural language questions:
   - "What emails did I receive from [Name]?"
   - "Summarize my recent Gmail conversations"
   - "Find documents about [topic]"
3. Get grounded answers with citations
4. Click citations to open original emails/documents

### 5. View History

- **History** page shows all chat sessions
- Click a session to view messages
- "New Chat" button creates a new session

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/signup` - Create account
- `POST /api/auth/signin` - Sign in
- `POST /api/auth/signout` - Sign out
- `GET /api/auth/me` - Get current user
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password

### Chat (RAG Queries)
- `POST /api/chat/session/new` - Create new chat session
- `GET /api/chat/sessions` - List user's chat sessions
- `GET /api/chat/session/:id` - Get session messages
- `POST /api/chat/message` - Send message (RAG query)
- `DELETE /api/chat/session/:id` - Delete session

### Sources
- `GET /api/sources` - Get connected sources
- `POST /api/sources/connect` - Initiate OAuth connection
- `POST /api/sources/sync` - Sync source data
- `POST /api/sources/disconnect` - Disconnect source

### History
- `GET /api/history` - Get query history
- `DELETE /api/history/clear-all` - Clear all history

### OAuth
- `GET /auth/google` - Initiate Google OAuth
- `GET /auth/google/callback` - OAuth callback

### Debug
- `GET /api/debug/ollama` - Check Ollama connectivity

## 🗄️ Database Schema

### Core Tables
- **users** - User accounts
- **sessions** - JWT session tokens
- **sources** - Connected data sources (Gmail, Drive)
- **oauth_tokens** - Encrypted Google OAuth tokens
- **document_chunks** - Text chunks with embeddings (vector(768))
- **query_history** - Query logs
- **chat_sessions** - Chat conversation sessions
- **chat_messages** - Individual messages in sessions

### Key Features
- **pgvector** extension for vector similarity search
- **ivfflat** index on embeddings for fast search
- **User isolation** - All queries filtered by `user_id`
- **Automatic migrations** - Safe, idempotent initialization

## 🔒 Security

- **JWT Authentication** - Secure token-based auth
- **Password Hashing** - bcrypt with salt rounds
- **Encrypted Tokens** - AES-256-GCM for OAuth tokens
- **Rate Limiting** - Prevents abuse
- **User Isolation** - Strict per-user data filtering
- **Read-Only Scopes** - Google OAuth uses read-only permissions
- **Environment Variables** - No secrets in code

## 🐛 Troubleshooting

### Ollama Connection Issues

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# If not running, start Ollama
ollama serve

# Check backend connectivity
curl http://localhost:3001/api/debug/ollama
```

**Error: "Ollama reachable check failed"**
- Set `OLLAMA_BASE_URL` in `.env` to correct URL
- Try: `http://127.0.0.1:11434` or `http://[::1]:11434`
- Verify Ollama is running: `ollama list`

### Database Connection Issues

```bash
# Check database connection
npm run check:db

# Re-initialize database (safe, won't delete data)
npm run init:db
```

**Error: "relation does not exist"**
- Run `npm run init:db` to create tables
- Check Supabase dashboard for connection issues

### Google OAuth Issues

**Error: "redirect_uri_mismatch"**
- Ensure exact redirect URI in Google Cloud Console:
  - `http://localhost:3001/auth/google/callback`
- Check `BACKEND_URL` in `.env` matches

**Error: "access_denied" (403)**
- Add your email as **Test user** in Google Cloud Console
- Or publish the app (requires verification)

### Slow Query Responses

- Reduce context length in `server/routes/chat.js` (maxChunks)
- Use faster Ollama model (e.g., `phi` instead of `mistral`)
- Check Ollama logs for model loading issues
- Reduce chunk text length limit

## 📝 Available Scripts

- `npm run dev` - Start frontend dev server
- `npm run dev:backend` - Start backend server
- `npm run dev:all` - Start both servers concurrently
- `npm run init:db` - Initialize Supabase database
- `npm run check:db` - Check database connection
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## 🚀 Production Deployment

### Backend
1. Set production environment variables
2. Use production Supabase project
3. Set `FRONTEND_URL` and `BACKEND_URL` to production domains
4. Use process manager (PM2, systemd)
5. Enable HTTPS

### Frontend
1. Build: `npm run build`
2. Serve with nginx/Apache or Vercel/Netlify
3. Set `VITE_API_BASE_URL` to production API URL

### Database
- Use Supabase production project
- Enable connection pooling
- Set up automated backups

## 📄 License

This project is private and proprietary.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

For issues and questions:
- Open an issue in the repository
- Check backend logs for detailed error messages
- Use `/api/debug/ollama` endpoint for Ollama diagnostics

## 🙏 Acknowledgments

- **Ollama** for local LLM inference
- **Supabase** for managed PostgreSQL with pgvector
- **shadcn/ui** for beautiful UI components
- **Google APIs** for Gmail and Drive integration

---

**Built with ❤️ using React, Node.js, Ollama, and Supabase**
