// API Client for frontend to communicate with backend
// This handles all HTTP requests to the backend API

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

if (!import.meta.env.VITE_API_BASE_URL) {
  console.warn('⚠️  VITE_API_BASE_URL not set in .env, using default: http://localhost:3001/api');
}

interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

type JsonObject = Record<string, unknown>;

interface RateLimitErrorBody {
  retryAfter?: number;
  error?: string;
  message?: string;
}

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T> & { response?: Response }> {
    const token = localStorage.getItem('auth_token');
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const url = `${this.baseURL}${endpoint}`;
      const response = await fetch(url, {
        ...options,
        headers,
      });

      let data;
      try {
        data = (await response.json()) as unknown;
      } catch (parseError) {
        // If response is not JSON, return the status text
        return {
          error: `Server error: ${response.status} ${response.statusText}`,
        };
      }

      if (!response.ok) {
        // Improve rate limit messaging (used by Sources -> Sync)
        const rateLimitBody = data as RateLimitErrorBody;
        if (response.status === 429 && typeof rateLimitBody?.retryAfter === 'number') {
          return {
            error: `Too many requests. Please wait ${rateLimitBody.retryAfter} seconds and try again.`,
          };
        }

        // Return error with response data for detailed error handling
        const errData = (data && typeof data === 'object') ? (data as JsonObject) : {};
        const errMsg =
          (typeof errData.error === 'string' && errData.error) ||
          (typeof errData.message === 'string' && errData.message) ||
          `Error: ${response.status} ${response.statusText}`;

        const errorResponse: ApiResponse<T> & { response?: Response; errorData?: unknown } = {
          error: errMsg,
        };
        // Attach full response and data for error details
        (errorResponse as { response?: Response }).response = response;
        (errorResponse as { errorData?: unknown }).errorData = data;
        return errorResponse;
      }

      return { data: data as T };
    } catch (error) {
      console.error('API request error:', error);
      return {
        error: error instanceof Error ? error.message : 'Network error occurred',
      };
    }
  }

  // Auth endpoints
  async signIn(email: string, password: string) {
    return this.request<{ user: unknown; token: string }>('/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async signUp(email: string, password: string, fullName?: string) {
    return this.request<{ user: unknown; token: string }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName }),
    });
  }

  // Google OAuth handled via /auth/google route (not API endpoint)

  async signOut() {
    localStorage.removeItem('auth_token');
    return this.request('/auth/signout', {
      method: 'POST',
    });
  }

  async getCurrentUser() {
    return this.request<{ user: unknown }>('/auth/me', {
      method: 'GET',
    });
  }

  async forgotPassword(email: string) {
    return this.request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async validateResetToken(token: string) {
    return this.request<{ valid: boolean }>(`/auth/reset-password/${token}`, {
      method: 'GET',
    });
  }

  async resetPassword(token: string, password: string) {
    return this.request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  }

  // Query endpoints
  async createQuery(queryText: string) {
    return this.request<{ query: unknown }>('/queries', {
      method: 'POST',
      body: JSON.stringify({ query_text: queryText }),
    });
  }

  async getQueries() {
    return this.request<{ queries: unknown[] }>('/queries', {
      method: 'GET',
    });
  }

  // RAG Query endpoint
  async query(query: string) {
    return this.request<{ answer: string; citations: unknown[]; matchedChunksPreview: unknown[]; queryId: string; timestamp: string }>('/query', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
  }

  // History endpoints
  async getHistory() {
    return this.request<{ queries: unknown[]; count: number }>('/history', {
      method: 'GET',
    });
  }

  async clearHistory() {
    return this.request<{ message: string; deletedCount: number }>('/history/clear-all', {
      method: 'DELETE',
      body: JSON.stringify({ confirm: true }),
    });
  }

  // Source endpoints
  async getSources() {
    return this.request<{ sources: unknown[] }>('/sources', {
      method: 'GET',
    });
  }

  async createSource(sourceData: unknown) {
    return this.request<{ source: unknown }>('/sources', {
      method: 'POST',
      body: JSON.stringify(sourceData),
    });
  }

  async updateSource(sourceId: string, sourceData: unknown) {
    return this.request<{ source: unknown }>(`/sources/${sourceId}`, {
      method: 'PUT',
      body: JSON.stringify(sourceData),
    });
  }

  async deleteSource(sourceId: string) {
    return this.request(`/sources/${sourceId}`, {
      method: 'DELETE',
    });
  }

  async connectSource(sourceType: string) {
    return this.request<{ authUrl: string }>('/sources/connect', {
      method: 'POST',
      body: JSON.stringify({ sourceType }),
    });
  }

  async syncSource(sourceType: string) {
    return this.request<{ message: string; results: unknown; timestamp: string }>('/sources/sync', {
      method: 'POST',
      body: JSON.stringify({ sourceType }),
    });
  }

  async disconnectSource(sourceType: string) {
    return this.request<{ message: string; sourceType: string }>('/sources/disconnect', {
      method: 'POST',
      body: JSON.stringify({ sourceType }),
    });
  }

  // Chat session endpoints
  async createChatSession(title?: string) {
    return this.request<{ session: unknown }>('/chat/session/new', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  }

  async getChatSessions() {
    return this.request<{ sessions: unknown[]; count: number }>('/chat/sessions', {
      method: 'GET',
    });
  }

  async getChatSession(sessionId: string) {
    return this.request<{ sessionId: string; messages: unknown[]; count: number }>(`/chat/session/${sessionId}`, {
      method: 'GET',
    });
  }

  async postChatMessage(sessionId: string, question: string) {
    return this.request<{ userMessage: unknown; assistantMessage: unknown }>('/chat/message', {
      method: 'POST',
      body: JSON.stringify({ sessionId, question }),
    });
  }

  // Feedback endpoint
  async postFeedback(payload: { name?: string; email?: string; comments: string }) {
    return this.request<{ ok: boolean; id?: string; created_at?: string }>('/feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Settings endpoints
  async getSettings() {
    return this.request<{ ok: boolean; settings: { notifications: boolean; emailAlerts: boolean } }>('/settings', {
      method: 'GET',
    });
  }

  async updateSettings(payload: { notifications?: boolean; emailAlerts?: boolean; firstName?: string; lastName?: string }) {
    return this.request<{ ok: boolean }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteChatSession(sessionId: string) {
    return this.request<{ message: string }>(`/chat/session/${sessionId}`, {
      method: 'DELETE',
    });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
export default apiClient;

