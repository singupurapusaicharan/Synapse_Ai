// Source types
export type SourceType = 'gmail' | 'drive' | 'slack' | 'notion';

export interface Source {
  id: string;
  type: SourceType;
  name: string;
  email?: string;
  connected: boolean;
  lastSynced?: Date;
  documentsCount?: number;
}

// Message types
export interface Citation {
  id: string;
  source: SourceType;
  title: string;
  url: string | null;
  /**
   * Provider-specific identifiers for deep linking (e.g., Gmail messageId/threadId).
   * These are optional for backward compatibility with older stored citations.
   */
  providerMessageId?: string | null;
  threadId?: string | null;
  accountEmail?: string | null;
  snippet?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  timestamp: Date;
}

// Query history types
export interface QueryHistory {
  id: string;
  query: string;
  answer: string;
  citations: Citation[];
  timestamp: Date;
}

// API response types
export interface QueryResponse {
  answer: string;
  citations: Citation[];
}

export interface SourcesResponse {
  sources: Source[];
}

export interface HistoryResponse {
  history: QueryHistory[];
}

// User types
export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

// Status types
export interface ConnectionStatus {
  connected: boolean;
  latency?: number;
  model?: string;
}
