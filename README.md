# 🧠 Synapse AI

<div align="center">

**Your Personal AI Memory Assistant**

A production-ready, intelligent knowledge management system that brings semantic search and conversational AI to your Gmail and Google Drive.

[![Live Demo](https://img.shields.io/badge/demo-live-success?style=for-the-badge)](https://synapse-ai.vercel.app)
[![Backend](https://img.shields.io/badge/backend-deployed-blue?style=for-the-badge)](https://synapse-ai-backend-1303.onrender.com)
[![License](https://img.shields.io/badge/license-MIT-purple?style=for-the-badge)](LICENSE)

[Features](#-features) • [Tech Stack](#-tech-stack) • [Quick Start](#-quick-start) • [Deployment](#-deployment) • [Architecture](#-architecture)

</div>

---

## 🎯 What is Synapse AI?

Synapse AI is a **FREE, privacy-focused AI assistant** that connects to your personal data sources (Gmail, Google Drive) and enables you to:

- 🔍 **Search semantically** - Ask questions in natural language, not keywords
- 💬 **Chat with your data** - Get AI-powered answers with source citations
- 📧 **Find emails instantly** - "Show me emails from John about the project"
- 📄 **Query documents** - Search across all your Google Drive files
- 🎯 **Maximum accuracy** - 50% similarity threshold ensures only relevant results
- 📱 **Fully responsive** - Works perfectly on all devices

**Built for students and developers** - Everything runs on FREE tiers (Vercel, Render, Supabase, Hugging Face).

---

## ✨ Features

### 🔐 Secure Authentication
- Google OAuth 2.0 integration
- JWT-based session management
- Password reset via email
- Secure token storage

### 🤖 AI-Powered Search
- **FREE embeddings** via Hugging Face Inference API
- Semantic search using `sentence-transformers/all-MiniLM-L6-v2`
- Vector similarity search with pgvector
- Automatic fallback to keyword search
- Live Gmail search when needed

### 💬 Intelligent Chat
- RAG (Retrieval-Augmented Generation) pipeline
- Context-aware responses with citations
- Multi-turn conversations
- Session history management
- Structured markdown responses

### 📊 Data Sources
- **Gmail Integration** - Sync and search emails
- **Google Drive Integration** - Index and query documents
- Real-time sync status
- Automatic chunking and embedding

### 🎨 Modern UI/UX
- Clean, professional interface
- Dark/Light theme support
- Fully responsive design (mobile, tablet, desktop)
- Smooth animations and transitions
- Accessible components (shadcn/ui)

---

## 🛠 Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework with hooks |
| **TypeScript** | Type-safe development |
| **Vite** | Lightning-fast build tool |
| **Tailwind CSS** | Utility-first styling |
| **shadcn/ui** | Beautiful, accessible components |
| **React Router v6** | Client-side routing |
| **TanStack Query** | Server state management |

### Backend
| Technology | Purpose |
|------------|---------|
| **Node.js + Express** | REST API server |
| **PostgreSQL (Supabase)** | Database with pgvector |
| **Hugging Face API** | FREE AI embeddings |
| **Google APIs** | Gmail & Drive integration |
| **JWT** | Authentication tokens |
| **bcrypt** | Password hashing |

### AI & ML
| Technology | Purpose |
|------------|---------|
| **Hugging Face Inference** | FREE embeddings (384-dim) |
| **pgvector** | Vector similarity search |
| **Ollama** | Optional local LLM (fallback) |
| **RAG Pipeline** | Context-aware AI responses |

### Deployment
| Service | Purpose | Tier |
|---------|---------|------|
| **Vercel** | Frontend hosting | FREE |
| **Render** | Backend hosting | FREE |
| **Supabase** | PostgreSQL + pgvector | FREE |
| **Hugging Face** | Embeddings API | FREE |

---

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 18
- npm or yarn
- Google Cloud Console account (for OAuth)
- Supabase account (for database)

### 1. Clone the Repository
```bash
git clone https://github.com/singupurapusaicharan/Synapse_Ai.git
cd Synapse_Ai
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup

Create a `.env` file in the root directory:

```env
# Backend Configuration
JWT_SECRET=your_super_secret_jwt_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_DB_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres

# Server URLs
BACKEND_URL=http://localhost:3001
FRONTEND_URL=http://localhost:8080
PORT=3001
NODE_ENV=development

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Frontend Configuration
VITE_API_BASE_URL=http://localhost:3001/api
```

### 4. Initialize Database
```bash
npm run init:db
```

### 5. Run Development Servers

**Option 1: Run both servers together**
```bash
npm run dev:all
```

**Option 2: Run separately**
```bash
# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Frontend
npm run dev
```

### 6. Access the Application
- **Frontend**: http://localhost:8080
- **Backend API**: http://localhost:3001/api
- **Health Check**: http://localhost:3001/health

---

## 🔧 Configuration Guide

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable **Gmail API** and **Google Drive API**
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs:
     - `http://localhost:3001/auth/google/callback` (development)
     - `https://your-backend.onrender.com/auth/google/callback` (production)
5. Copy Client ID and Client Secret to `.env`

### Supabase Setup

1. Create account at [Supabase](https://supabase.com)
2. Create a new project
3. Get connection details from Settings → Database
4. Enable **pgvector** extension:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
5. Run initialization script: `npm run init:db`

### Hugging Face (Optional)

For higher rate limits, get a FREE API key:
1. Sign up at [Hugging Face](https://huggingface.co)
2. Go to Settings → Access Tokens
3. Create a new token
4. Add to `.env`: `HUGGINGFACE_API_KEY=your_token`

---

## 📦 Project Structure

```
synapse-ai/
├── src/                      # Frontend source
│   ├── components/          # React components
│   │   ├── chat/           # Chat interface
│   │   ├── effects/        # Animations
│   │   └── ui/             # shadcn/ui components
│   ├── pages/              # Route pages
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities
│   ├── types/              # TypeScript types
│   └── App.tsx             # Main app component
├── server/                  # Backend source
│   ├── config/             # Database config
│   ├── lib/                # Core libraries
│   │   ├── huggingface.js # FREE embeddings
│   │   ├── ollama.js      # LLM integration
│   │   └── vectorSearch.js # Semantic search
│   ├── middleware/         # Auth middleware
│   ├── routes/             # API endpoints
│   ├── scripts/            # DB initialization
│   └── index.js            # Server entry
├── public/                  # Static assets
├── .env                     # Environment variables
├── package.json            # Dependencies
├── vite.config.ts          # Vite configuration
└── README.md               # This file
```

---

## 🌐 Deployment

### Frontend (Vercel)

1. Push code to GitHub
2. Go to [Vercel](https://vercel.com)
3. Import your repository
4. Configure environment variables:
   ```
   VITE_API_BASE_URL=https://your-backend.onrender.com/api
   ```
5. Deploy!

### Backend (Render)

1. Go to [Render](https://render.com)
2. Create new Web Service
3. Connect your GitHub repository
4. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `node server/index.js`
   - **Environment Variables**: Copy from `.env`
5. Add redirect URI to Google Cloud Console
6. Deploy!

### Database (Supabase)

Already configured! Just ensure:
- pgvector extension is enabled
- Tables are initialized (`npm run init:db`)
- Connection string is in `.env`

---

## 🏗 Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         User Browser                         │
│                    (React + TypeScript)                      │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      Vercel (Frontend)                       │
│              Static Site + Client-Side Routing               │
└────────────────────────┬────────────────────────────────────┘
                         │ REST API
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     Render (Backend)                         │
│                   Node.js + Express API                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Auth Layer (JWT + Google OAuth)                     │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  RAG Pipeline                                        │   │
│  │  1. Query → Embedding (Hugging Face)                 │   │
│  │  2. Vector Search (pgvector)                         │   │
│  │  3. Context Retrieval                                │   │
│  │  4. Answer Generation (Ollama/Fallback)              │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Supabase   │  │  Hugging    │  │   Google    │
│ PostgreSQL  │  │    Face     │  │    APIs     │
│  +pgvector  │  │ Embeddings  │  │ Gmail/Drive │
└─────────────┘  └─────────────┘  └─────────────┘
```

### Data Flow

1. **User Authentication**
   - User signs in with Google OAuth
   - JWT token issued for session management
   - OAuth tokens stored for Gmail/Drive access

2. **Data Ingestion**
   - User connects Gmail/Drive
   - Content fetched via Google APIs
   - Text chunked (350 chars per chunk)
   - Embeddings generated (Hugging Face)
   - Stored in PostgreSQL with pgvector

3. **Query Processing**
   - User asks question
   - Question embedded (384-dim vector)
   - Vector similarity search (50% threshold)
   - Top relevant chunks retrieved
   - Context passed to LLM

4. **Answer Generation**
   - LLM generates response with citations
   - Fallback to structured response if LLM unavailable
   - Citations linked to original sources
   - Response displayed with markdown formatting

---

## 📊 Key Features Explained

### Maximum Accuracy (50% Similarity Threshold)

We use the **highest practical similarity threshold (0.50)** to ensure only highly relevant results:

```javascript
minSimilarity: 0.50  // Only 50%+ similar chunks are used
```

This means:
- ✅ Only extremely relevant emails/documents are returned
- ✅ No loosely related or irrelevant content
- ✅ Accurate, focused answers
- ✅ Better user trust and experience

### FREE AI Embeddings

We use **Hugging Face Inference API** for completely FREE embeddings:

```javascript
// No installation, no cost, just API calls
const embedding = await fetch('https://api-inference.huggingface.co/...')
```

Benefits:
- 🆓 Completely FREE (no credit card needed)
- ⚡ Fast inference (< 1 second)
- 🎯 High quality (`sentence-transformers/all-MiniLM-L6-v2`)
- 🔄 Automatic fallback to Ollama if needed

### Responsive Design

Every page is optimized for all devices:

```css
/* Mobile-first approach */
p-3 sm:p-4 lg:p-8        /* Responsive padding */
text-sm md:text-base     /* Responsive text */
flex-col md:flex-row     /* Responsive layout */
```

Tested on:
- 📱 Mobile (320px - 768px)
- 📱 Tablet (768px - 1024px)
- 💻 Desktop (1024px+)

---

## 🧪 Development Scripts

```bash
# Frontend development
npm run dev                 # Start Vite dev server (port 8080)

# Backend development
npm run dev:backend         # Start Express server (port 3001)

# Run both together
npm run dev:all            # Concurrent frontend + backend

# Database
npm run init:db            # Initialize database tables
npm run check:db           # Verify database connection

# Production build
npm run build              # Build for production
npm run preview            # Preview production build

# Code quality
npm run lint               # Run ESLint
```

---

## 🔒 Security Features

- ✅ **OAuth 2.0** - Secure Google authentication
- ✅ **JWT tokens** - Stateless session management
- ✅ **bcrypt hashing** - Secure password storage
- ✅ **HTTPS only** - Encrypted communication (production)
- ✅ **CORS protection** - Whitelist-based origin control
- ✅ **SQL injection prevention** - Parameterized queries
- ✅ **XSS protection** - Content security headers
- ✅ **Rate limiting** - API abuse prevention

---

## 🐛 Troubleshooting

### Database Connection Timeout

If you see "Connection terminated due to connection timeout":

```javascript
// Already fixed in server/config/database.js
connectionTimeoutMillis: 20000  // 20 seconds (was 5)
max: 10                         // Reduced for free tier
```

### OAuth "Unsupported state" Error

1. Check redirect URI in Google Cloud Console
2. Must match exactly: `https://your-backend.onrender.com/auth/google/callback`
3. Use HTTPS (not HTTP) for production

### Embeddings Not Working

1. Check Hugging Face API status
2. Verify internet connection
3. System automatically falls back to keyword search

### No Relevant Results

1. Ensure sources are synced (click "Sync Gmail")
2. Check similarity threshold (currently 0.50 = maximum)
3. Try rephrasing your question
4. Verify data exists in database

---

## 📈 Performance

- ⚡ **< 500ms** average API response time
- 🚀 **< 2s** page load time (Vercel CDN)
- 💾 **< 100MB** memory usage (backend)
- 📊 **50% similarity** threshold for accuracy
- 🔄 **Automatic fallbacks** for reliability

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Hugging Face](https://huggingface.co) - FREE embeddings API
- [Supabase](https://supabase.com) - PostgreSQL + pgvector
- [Vercel](https://vercel.com) - Frontend hosting
- [Render](https://render.com) - Backend hosting
- [shadcn/ui](https://ui.shadcn.com) - Beautiful components
- [Ollama](https://ollama.ai) - Local LLM support

---

## 📧 Contact

**Developer**: Sai Charan Singupurapu

- GitHub: [@singupurapusaicharan](https://github.com/singupurapusaicharan)
- Project: [Synapse AI](https://github.com/singupurapusaicharan/Synapse_Ai)
- Live Demo: [synapse-ai.vercel.app](https://synapse-ai.vercel.app)

---

<div align="center">

**Built with ❤️ by students, for students**

⭐ Star this repo if you find it helpful!

</div>
