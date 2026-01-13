import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Citation, Message, SourceType } from '@/types';
import { Navbar } from '@/components/layout/Navbar';
import { Sidebar } from '@/components/layout/Sidebar';
import { StatusBar } from '@/components/layout/StatusBar';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Sparkles, MessageSquare, Database, Clock, Shield, ArrowRight } from 'lucide-react';

type ApiSourceRow = {
  source_type: string;
  status: string;
  last_synced_at?: string | null;
};

type ApiChatSessionRow = { id: string };
type ApiChatSessionListRow = { id: string };
type ApiChatMessageRow = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: unknown;
  timestamp: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function isApiSourceRow(v: unknown): v is ApiSourceRow {
  const r = asRecord(v);
  return !!r && typeof r.source_type === 'string' && typeof r.status === 'string';
}

function isApiChatSessionRow(v: unknown): v is ApiChatSessionRow {
  const r = asRecord(v);
  return !!r && typeof r.id === 'string';
}

function isApiChatSessionListRow(v: unknown): v is ApiChatSessionListRow {
  return isApiChatSessionRow(v);
}

function isApiChatMessageRow(v: unknown): v is ApiChatMessageRow {
  const r = asRecord(v);
  if (!r) return false;
  return (
    typeof r.id === 'string' &&
    (r.role === 'user' || r.role === 'assistant') &&
    typeof r.content === 'string' &&
    typeof r.timestamp === 'string'
  );
}

function mapCitation(raw: unknown): Citation {
  const r = asRecord(raw);
  const sourceTypeRaw = r?.sourceType ?? r?.source_type ?? 'gmail';
  const sourceType = sourceTypeRaw === 'drive' ? 'drive' : sourceTypeRaw === 'slack' ? 'slack' : sourceTypeRaw === 'notion' ? 'notion' : 'gmail';

  const title = typeof r?.title === 'string' && r.title.trim() ? r.title : 'Untitled';
  const url = typeof r?.url === 'string' ? r.url : null;

  const number = typeof r?.number === 'number' ? String(r.number) : null;
  const id =
    number ||
    (typeof r?.providerMessageId === 'string' ? r.providerMessageId : null) ||
    (typeof r?.gmailMessageId === 'string' ? r.gmailMessageId : null) ||
    (typeof r?.messageId === 'string' ? r.messageId : null) ||
    title;

  const providerMessageId =
    typeof r?.providerMessageId === 'string'
      ? r.providerMessageId
      : typeof r?.gmailMessageId === 'string'
        ? r.gmailMessageId
        : typeof r?.messageId === 'string'
          ? r.messageId
          : null;

  const threadId = typeof r?.threadId === 'string' ? r.threadId : typeof r?.thread_id === 'string' ? r.thread_id : null;
  const accountEmail =
    typeof r?.accountEmail === 'string'
      ? r.accountEmail
      : typeof r?.ownerEmail === 'string'
        ? r.ownerEmail
        : typeof r?.owner_email === 'string'
          ? r.owner_email
          : typeof r?.gmailOwnerEmail === 'string'
            ? r.gmailOwnerEmail
            : null;

  return {
    id,
    source: sourceType,
    title,
    url,
    providerMessageId,
    threadId,
    accountEmail,
    snippet: typeof r?.snippet === 'string' ? r.snippet : '',
  };
}

function parseCitations(raw: unknown): Citation[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(mapCitation);
}

function shouldAutoSync(lastSyncISO: string | null | undefined, maxAgeMs: number): boolean {
  if (!lastSyncISO) return true;
  const t = new Date(lastSyncISO).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > maxAgeMs;
}

export function Dashboard() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hasSources, setHasSources] = useState(false);
  const [checkingSources, setCheckingSources] = useState(true);
  const { toast } = useToast();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Check if user has connected sources
  useEffect(() => {
    const checkSources = async () => {
      if (!user) {
        setCheckingSources(false);
        return;
      }

      try {
        const response = await apiClient.getSources();
        const data = asRecord(response.data);
        const sourcesRaw = data?.sources;
        const sources = Array.isArray(sourcesRaw) ? sourcesRaw.filter(isApiSourceRow) : [];
        if (sources.length > 0) {
          const connectedSources = sources.filter((s) => s.status === 'connected');
          setHasSources(connectedSources.length > 0);

          // Safe auto-sync (rate-limited client-side) to keep results fresh without user effort.
          // Runs at most once per 12 hours per source in this browser.
          const maxAgeMs = 12 * 60 * 60 * 1000;
          for (const src of connectedSources) {
            if (src.source_type !== 'gmail' && src.source_type !== 'drive') continue;
            const key = `auto_sync_last_${src.source_type}`;
            const lastAttempt = localStorage.getItem(key);
            const okToAttempt = shouldAutoSync(lastAttempt, maxAgeMs);
            const okToSync = shouldAutoSync(src.last_synced_at, maxAgeMs);
            if (!okToAttempt || !okToSync) continue;

            try {
              localStorage.setItem(key, new Date().toISOString());
              // Fire and forget; user can still manually Sync from Sources.
              await apiClient.syncSource(src.source_type);
            } catch (e) {
              // Silent: avoid spamming user; manual Sync button remains available.
            }
          }
        } else {
          setHasSources(false);
        }
      } catch (error) {
        console.error('Error checking sources:', error);
      } finally {
        setCheckingSources(false);
      }
    };

    checkSources();
  }, [user]);

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  const handleNewChat = async () => {
    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'Please sign in to continue.',
      });
      navigate('/auth');
      return;
    }

    try {
      const response = await apiClient.createChatSession();
      const data = asRecord(response.data);
      const session = data?.session;
      const sessionRow = isApiChatSessionRow(session) ? session : null;
      if (sessionRow?.id) {
        setCurrentSessionId(sessionRow.id);
        setMessages([]);
        toast({
          title: 'New chat started',
          description: 'You can now start asking questions.',
        });
      } else if (response.error) {
        throw new Error(response.error);
      }
    } catch (error) {
      console.error('Error creating new chat:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create new chat',
        variant: 'destructive',
      });
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'Please sign in to continue.',
      });
      navigate('/auth');
      return;
    }

    if (!hasSources) {
      toast({
        title: 'No sources connected',
        description: 'Please connect Gmail or Drive to start asking questions.',
      });
      navigate('/sources');
      return;
    }

    // Create session if doesn't exist
    let sessionId = currentSessionId;
    if (!sessionId) {
      try {
        const sessionResponse = await apiClient.createChatSession();
        const data = asRecord(sessionResponse.data);
        const session = data?.session;
        const sessionRow = isApiChatSessionRow(session) ? session : null;
        if (sessionRow?.id) {
          sessionId = sessionRow.id;
          setCurrentSessionId(sessionId);
        } else {
          throw new Error('Failed to create session');
        }
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to create chat session',
          variant: 'destructive',
        });
        return;
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await apiClient.postChatMessage(sessionId!, content);
      
      if (response.error) {
        throw new Error(response.error);
      }

      if (response.data) {
        const data = asRecord(response.data);
        const userMessageRaw = data?.userMessage;
        const assistantMessageRaw = data?.assistantMessage;
        const userMessageRec = asRecord(userMessageRaw);
        const assistantMessageRec = asRecord(assistantMessageRaw);
        if (!userMessageRec || !assistantMessageRec) {
          throw new Error('Invalid server response');
        }
        // Add user message (if not already added)
        const userMsg: Message = {
          id: String(userMessageRec.id),
          role: 'user',
          content: String(userMessageRec.content),
          timestamp: new Date(String(userMessageRec.timestamp)),
        };

        // Add assistant message with citations
        const citations = parseCitations(assistantMessageRec.citations);
        
        const aiMessage: Message = {
          id: String(assistantMessageRec.id),
          role: 'assistant',
          content: String(assistantMessageRec.content),
          citations,
          timestamp: new Date(String(assistantMessageRec.timestamp)),
        };

        // Replace temporary user message with real one, add assistant message
        setMessages((prev) => {
          const filtered = prev.filter(m => m.id !== userMessage.id);
          return [...filtered, userMsg, aiMessage];
        });

          // Show CTA to sync if no citations
        if (citations.length === 0) {
          toast({
            title: 'No Indexed Data',
            description: 'No indexed data yet → Go to Sources → Sync Gmail',
            variant: 'default',
          });
        }
      }
    } catch (error) {
      console.error('Query error:', error);
      
      const errorMsg = error instanceof Error ? error.message : 'Failed to get answer';
      
      toast({
        title: 'Error',
        description: errorMsg,
        variant: 'destructive',
      });
      
      // Remove user message on error
      setMessages((prev) => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
  };

  // Load session if sessionId is in URL or load latest session
  useEffect(() => {
    if (!user || checkingSources) return;

    const loadSession = async () => {
      try {
        // Check URL for session ID
        const urlParams = new URLSearchParams(window.location.search);
        const sessionIdFromUrl = urlParams.get('session');

        if (sessionIdFromUrl) {
          // Load specific session
          const response = await apiClient.getChatSession(sessionIdFromUrl);
          const data = asRecord(response.data);
          const sid = typeof data?.sessionId === 'string' ? data.sessionId : null;
          const msgsRaw = data?.messages;
          const msgs = Array.isArray(msgsRaw) ? msgsRaw.filter(isApiChatMessageRow) : [];
          if (sid) {
            setCurrentSessionId(sid);
            const loadedMessages = msgs.map((msg) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              citations: parseCitations(msg.citations),
              timestamp: new Date(msg.timestamp),
            }));
            setMessages(loadedMessages);
          }
        } else {
          // Try to load latest session
          const sessionsResponse = await apiClient.getChatSessions();
          const sessionsData = asRecord(sessionsResponse.data);
          const sessionsRaw = sessionsData?.sessions;
          const sessions = Array.isArray(sessionsRaw) ? sessionsRaw.filter(isApiChatSessionListRow) : [];
          if (sessions.length > 0) {
            const latestSession = sessions[0];
            setCurrentSessionId(latestSession.id);
            const sessionResponse = await apiClient.getChatSession(latestSession.id);
            const data = asRecord(sessionResponse.data);
            const msgsRaw = data?.messages;
            const msgs = Array.isArray(msgsRaw) ? msgsRaw.filter(isApiChatMessageRow) : [];
            const loadedMessages = msgs.map((msg) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              citations: parseCitations(msg.citations),
              timestamp: new Date(msg.timestamp),
            }));
            setMessages(loadedMessages);
          }
        }
      } catch (error) {
        console.error('Error loading session:', error);
        // If no sessions exist, that's fine - start fresh
      }
    };

    loadSession();
  }, [user, checkingSources]);

  if (loading || checkingSources) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 animate-pulse-slow">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-primary">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-medium">Loading...</span>
        </div>
      </div>
    );
  }

  // Unauthenticated landing view
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar onNavigate={handleNavigate} />
        
        <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
          <div className="max-w-3xl text-center">
            {/* Hero */}
            <div className="relative inline-block mb-10 animate-float">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary via-primary/80 to-accent flex items-center justify-center glow-primary">
                <Sparkles className="w-12 h-12 text-primary-foreground" />
              </div>
            </div>
            
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-5 animate-in">
              Your AI-Powered
              <span className="text-gradient block mt-1">Memory Assistant</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto animate-in-delayed leading-relaxed">
              Search across Gmail, Drive, Slack, and Notion with natural language. 
              Synapse remembers everything so you don't have to.
            </p>

            <Button 
              size="lg" 
              className="mb-16 h-12 px-8 text-base font-semibold rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 glow-subtle hover:glow-primary transition-all duration-500 group animate-in-delayed"
              style={{ animationDelay: '0.2s' }}
              onClick={() => navigate('/auth')}
            >
              Get Started Free
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>

            {/* Features */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
              {[
                { icon: MessageSquare, title: 'Natural Language Search', desc: 'Ask questions in plain English and get instant answers with citations.' },
                { icon: Database, title: 'Connect Your Sources', desc: 'Integrate Gmail, Google Drive, Slack, and Notion in seconds.' },
                { icon: Clock, title: 'Search History', desc: 'Access your past queries and continue conversations seamlessly.' },
                { icon: Shield, title: 'Secure & Private', desc: 'Your data is encrypted and never shared with third parties.' },
              ].map((feature, i) => (
                <div 
                  key={i}
                  className="p-5 rounded-2xl glass-card-hover animate-in"
                  style={{ animationDelay: `${0.3 + i * 0.1}s` }}
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center mb-4">
                    <feature.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <StatusBar />
      </div>
    );
  }

  // Authenticated dashboard view
  return (
    <div className="h-screen flex flex-col">
      <Navbar onNavigate={handleNavigate} />

      <div className="flex-1 flex min-h-0">
        <Sidebar
          activePath="/"
          onNavigate={handleNavigate}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          onNewChat={handleNewChat}
        />

        <ChatPanel
          messages={messages}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          hasSources={hasSources}
          onNewChat={handleNewChat}
          onNavigateToSources={() => navigate('/sources')}
            userEmail={user?.email || ''}
        />
      </div>

      <StatusBar />
    </div>
  );
}
