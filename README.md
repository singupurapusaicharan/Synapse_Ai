# Synapse AI 🧠  
*Your Unified Personal Memory & Knowledge Workspace*  

---

## Introduction

**Synapse AI** is a next-generation, full-stack Retrieval-Augmented Generation (RAG) application that empowers you to transform personal data from sources like Gmail and Google Drive into a highly searchable, conversational memory system. Designed with security, extensibility, and elegant user experience in mind, Synapse AI stands apart as a calm, modern workspace where your knowledge is always at your fingertips.

---

## ✨ Key Features

### Unified Personal Knowledge Hub
- **Connect and Centralize:** Integrates Gmail and Google Drive into one powerful memory graph.
- **Contextual Conversations:** Ask questions using natural language and receive answers grounded in your personal data, complete with citations and deep links.

### Advanced Search & Retrieval
- **Semantic + Hybrid Search:** Leverages vector embeddings (via pgvector) and metadata for ultra-relevant results.
- **Fast Retrieval:** Optimized indexes ensure millisecond response times even with large data volumes.

### Robust Authentication & Security
- **Secure Auth:** Email/password and “Continue with Google” authentication, isolated from data access permissions.
- **Encrypted Tokens:** OAuth tokens stored with AES-256-GCM encryption for airtight security.
- **Strict Data Isolation:** Every user’s data remains completely segregated—your privacy is non-negotiable.

### Modern, Minimal UI/UX
- **Calm Interface:** Focused, distraction-free design theme.
- **Speed & Clarity:** Instant load times, clear information hierarchy, and responsive layout.

### Production-Grade Architecture
- **Separation of Concerns:** Clear delineation of frontend, backend, and storage layers for maintainability and scalability.
- **Ready for Extensions:** Modular approach makes it easy to add new connectors (Notion, Slack, Calendar) or swap AI providers.

---

## 🧱 Tech Stack Overview

| Layer      | Technologies                               |
|------------|--------------------------------------------|
| Frontend   | React 18, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Query    |
| Backend    | Node.js, Express, JWT, Google APIs, Nodemailer                    |
| Database   | PostgreSQL (Supabase), pgvector (vector search), Optimized Indexes |
| AI/ML      | Embeddings: nomic-embed-text, Chat: mistral (fallback: phi)        |
| Deployment | Vercel (frontend), Render/Railway/Fly.io (backend)                 |

---

## 🗂️ Project Structure

```
/
├── src/          # React frontend: UI, business logic
├── server/       # Express backend: APIs, routes, middleware
│   ├── routes/       # Authentication, OAuth, core APIs
│   ├── lib/          # Utilities for ingestion, OAuth, vectors
│   ├── middleware/   # Auth guards, rate limiting
│   └── scripts/      # Database setup, diagnostics
├── public/       # Static assets
├── vercel.json   # SPA rewrites for Vercel deployment
├── package.json  # Monorepo scripts
└── README.md     
```

*Design simplicity is foundational—making it both readable and extensible.*

---

## 🔐 Security Model

- **Two-stage Google OAuth:**
  - **Login:** Used strictly for account authentication.
  - **Data Connectors:** Independent tokens for Gmail/Drive ingestion, never shared with auth.
- **Encryption-first:** All tokens are encrypted at rest using AES-256-GCM.
- **Limit-of-least-privilege:** Only read-only, minimal Google API scopes granted.
- **Per-user Data Guardrails:** Each user’s memory is siloed—full privacy assurance.
- **Additional Protections:** JWT authentication, bcrypt password hashing, and rate limiting on all endpoints.

---

## 🗄️ Database Architecture

- **Core Tables:**
  - `users`, `sessions`, `sources`, `oauth_tokens`, `document_chunks` (vectors)
  - `chat_sessions`, `chat_messages`, `query_history`
- **Security & Performance:**
  - User data isolation at design level.
  - High-performance pgvector for retrieval.
  - Embedding indexes for instant search.

---

## ⚙️ Environment & Configuration

- Single root `.env` file for all sensitive configs.
- **Frontend:** All variables prefixed with `VITE_`.
- **Backend:** Loaded via dotenv library.
- **Safe Defaults:** Example file (`env.example.txt`) provided.
- **Best Practices:** Never commit real `.env` files; rotate keys promptly if disclosed.

---

## 🧪 Local Development Quickstart

1. **Install dependencies**
   ```sh
   npm install
   ```
2. **Initialize the database**
   ```sh
   npm run init:db
   ```
3. **Start development servers**
   ```sh
   npm run dev:all
   ```
4. **Access Synapse AI:**
   - Frontend: [http://localhost:8080](http://localhost:8080)
   - Backend: [http://localhost:3001](http://localhost:3001)
   - Health Check: [http://localhost:3001/health](http://localhost:3001/health)

---

## 🔌 API Reference

### Authentication
- `POST /api/auth/signup` — Register user
- `POST /api/auth/signin` — Login
- `POST /api/auth/signout` — Logout
- `GET  /api/auth/me`     — Get current user

### Chat (RAG)
- `POST /api/chat/session/new` — Start new chat
- `POST /api/chat/message`     — Send/receive messages
- `GET  /api/chat/sessions`    — List sessions

### Sources Management
- `GET  /api/sources`
- `POST /api/sources/connect`
- `POST /api/sources/sync`
- `POST /api/sources/disconnect`

---

## 🚀 Deployment Strategy

| Part      | Recommended     | Notes                           |
|-----------|----------------|---------------------------------|
| Frontend  | Vercel         | Set `VITE_API_BASE_URL` for prod|
| Backend   | Render/Railway/Fly.io | Set all URIs correctly; backend is never on Vercel serverless |
| Config    | Update Google OAuth redirect URIs for your domain.|

---

## 🛡️ Security Best Practices

- JWT-based authentication
- bcrypt for password hashing
- Encrypted storage for OAuth tokens
- Strict, rate-limited APIs
- Per-user data boundaries

---

## 🧭 Vision

> **Synapse AI** is engineered as your personalized knowledge layer—remembering, retrieving, and intelligently reasoning over your scattered digital information, all while staying calm, secure, and under your control.

**Modular. Secure. Extendable. Intuitive.**  
*Own your memory. Shape your knowledge.*

---

## 💡 Extending Synapse AI

- **Add new data sources**: Easily integrate Notion, Slack, Calendar, etc.
- **Swap AI providers:** Modular design supports different model backends.
- **Scale easily:** Grows from local-first to cloud-scale inference with zero friction.

---


---

## ✨ Experience a new era of personal memory — [Start with Synapse AI](#)!
