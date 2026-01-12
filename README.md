# Synapse_Ai

Synapse AI — Personal Memory & Knowledge Assistant 🧠

Synapse AI is a full-stack Retrieval-Augmented Generation (RAG) application that transforms your personal data into a searchable, conversational memory system.

It connects to sources like Gmail and Google Drive, securely syncs and indexes content into a vector database (pgvector), and allows you to ask natural-language questions with grounded answers and deep-link citations back to the original source.

Designed as a calm, modern AI workspace, Synapse AI focuses on clarity, speed, and trust.

✨ Key Capabilities

Unified Personal Memory

Search and chat across Gmail and Google Drive from one interface

Semantic Search + Chat

Vector embeddings with pgvector

Context-aware answers with citations

Secure Authentication

Email/password authentication

Google Login (“Continue with Google”) for user accounts

Source Connectors

Gmail & Google Drive OAuth (separate from login OAuth)

Local-First AI

Ollama for embeddings and chat (configurable for hosted models)

Production-Ready Architecture

Clear separation of frontend, backend, and data layers

Modern, Minimal UI

React + TypeScript + Tailwind + shadcn/ui

🧱 Tech Stack
Frontend

React 18, TypeScript, Vite

Tailwind CSS + shadcn/ui

React Router

TanStack Query

Backend

Node.js + Express

JWT authentication

Google APIs (Gmail, Drive)

Nodemailer (password reset)

Database

PostgreSQL (Supabase)

pgvector for similarity search

Optimized indexes for vector queries

AI / ML

Embeddings: nomic-embed-text

Chat models: mistral (fallback: phi)

Hybrid retrieval (metadata + vector similarity)

📁 Project Structure :


├─ src/                    # React frontend
├─ server/                 # Express backend
│  ├─ routes/              # API + OAuth routes
│  ├─ lib/                 # OAuth, ingestion, vector utilities
│  ├─ middleware/          # Auth, rate limiting
│  └─ scripts/             # DB setup & diagnostics
├─ public/                 # Static assets
├─ vercel.json             # SPA rewrites for React Router
├─ package.json            # Root scripts
└─ README.md

🔐 Authentication Model

Synapse AI uses two distinct Google OAuth flows:

Google Login

Used only for account authentication

Gmail / Drive Connectors

Used strictly for data ingestion

Tokens are encrypted at rest using AES-256-GCM

This separation ensures:

Clear security boundaries

Safer permission handling

Easier future extensibility

🗄️ Database Overview

Core tables include:

users

sessions

sources

oauth_tokens (encrypted)

document_chunks (vector embeddings)

chat_sessions

chat_messages

query_history

Key features:

pgvector similarity search

User-scoped data isolation

Indexed embeddings for fast retrieval

⚙️ Environment Configuration

The project uses a single root .env file.

Frontend variables are prefixed with VITE_, while the backend loads environment variables via dotenv.

A complete template is provided in env.example.txt.

Important:

Never commit .env files

Rotate secrets if exposed

🧪 Local Development
Install dependencies
npm install

Initialize the database
npm run init:db

Start frontend + backend
npm run dev:all


Default URLs

Frontend: http://localhost:8080

Backend: http://localhost:3001

Health check: http://localhost:3001/health

🔌 Core API Endpoints
Authentication

POST /api/auth/signup

POST /api/auth/signin

POST /api/auth/signout

GET /api/auth/me

Chat (RAG)

POST /api/chat/session/new

POST /api/chat/message

GET /api/chat/sessions

Sources

GET /api/sources

POST /api/sources/connect

POST /api/sources/sync

POST /api/sources/disconnect

🚀 Deployment Strategy
Frontend

Vercel (recommended)

Set VITE_API_BASE_URL to backend URL

SPA routing handled via vercel.json

Backend

Render / Railway / Fly.io

Standard Node.js server deployment

Set BACKEND_URL and FRONTEND_URL correctly

Update Google OAuth redirect URIs for production

Note: The Express backend is not deployed to Vercel serverless by default.

🛡️ Security Notes

JWT-based authentication

bcrypt password hashing

Encrypted OAuth tokens

Rate-limited endpoints

Strict per-user data isolation

Read-only Google API scopes

🧭 Vision

Synapse AI is designed as a personal knowledge layer — a system that remembers, retrieves, and reasons over your data without overwhelming you.

The architecture is intentionally modular, making it easy to:

Add new data sources (Notion, Slack, Calendar)

Swap AI providers

Scale from local-first to hosted inference
