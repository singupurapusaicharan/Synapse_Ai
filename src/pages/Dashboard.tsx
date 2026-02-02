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
              // Fire and forget; never block the dashboard render on a long sync.
              void apiClient.syncSource(src.source_type);
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
        const newSessionId = typeof data?.sessionId === 'string' ? data.sessionId : null;
        const userMessageRec = asRecord(userMessageRaw);
        const assistantMessageRec = asRecord(assistantMessageRaw);
        if (!userMessageRec || !assistantMessageRec) {
          throw new Error('Invalid server response');
        }
        
        // If server returned a new sessionId (migrated from old history), update it
        if (newSessionId && newSessionId !== sessionId) {
          console.log(`[Dashboard] Session migrated from ${sessionId} to ${newSessionId}`);
          setCurrentSessionId(newSessionId);
          // Update URL to reflect new session
          window.history.replaceState({}, '', `/?session=${newSessionId}`);
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
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-secondary/20">
        <Navbar onNavigate={handleNavigate} />
        
        {/* Hero Section */}
        <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
          <div className="max-w-6xl w-full">
            <div className="text-center mb-16">
              {/* Logo */}
              <div className="relative inline-block mb-8 animate-float">
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full"></div>
                <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-accent flex items-center justify-center shadow-2xl">
                  <Sparkles className="w-10 h-10 sm:w-12 sm:h-12 text-primary-foreground" />
                </div>
              </div>
              
              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 animate-in">
                Your AI-Powered
                <span className="block mt-2 bg-gradient-to-r from-primary via-primary/80 to-accent bg-clip-text text-transparent">
                  Knowledge Assistant
                </span>
              </h1>
              
              {/* Subheadline */}
              <p className="text-lg sm:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto animate-in-delayed leading-relaxed">
                Search across all your data sources with natural language. 
                <span className="block mt-1">Synapse finds answers instantly, so you don't have to.</span>
              </p>

              {/* CTA Button */}
              <Button 
                size="lg" 
                className="h-12 sm:h-14 px-8 sm:px-10 text-base sm:text-lg font-semibold rounded-2xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg hover:shadow-xl transition-all duration-300 group animate-in-delayed"
                style={{ animationDelay: '0.2s' }}
                onClick={() => navigate('/auth')}
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-16">
              {[
                { 
                  icon: MessageSquare, 
                  title: 'Natural Search', 
                  desc: 'Ask questions in plain English',
                  color: 'from-blue-500/10 to-blue-500/5'
                },
                { 
                  icon: Database, 
                  title: 'Connect Sources', 
                  desc: 'Gmail, Drive, Slack & more',
                  color: 'from-purple-500/10 to-purple-500/5'
                },
                { 
                  icon: Clock, 
                  title: 'Instant Results', 
                  desc: 'Get answers in seconds',
                  color: 'from-green-500/10 to-green-500/5'
                },
                { 
                  icon: Shield, 
                  title: 'Secure & Private', 
                  desc: 'Your data stays yours',
                  color: 'from-orange-500/10 to-orange-500/5'
                },
              ].map((feature, i) => (
                <div 
                  key={i}
                  className="group p-6 rounded-2xl bg-gradient-to-br from-secondary/40 to-secondary/20 border border-border/50 hover:border-primary/30 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:shadow-lg animate-in"
                  style={{ animationDelay: `${0.3 + i * 0.1}s` }}
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-base mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* Social Proof / Stats */}
            <div className="mt-16 pt-12 border-t border-border/30">
              <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto">
                {[
                  { value: '10K+', label: 'Searches' },
                  { value: '99.9%', label: 'Uptime' },
                  { value: '<1s', label: 'Response' },
                ].map((stat, i) => (
                  <div key={i} className="text-center animate-in" style={{ animationDelay: `${0.6 + i * 0.1}s` }}>
                    <div className="text-2xl sm:text-3xl font-bold text-primary mb-1">{stat.value}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <StatusBar />
      </div>
    );
  }

  // Authenticated dashboard view
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Navbar 
        onNavigate={handleNavigate} 
        onNewChat={handleNewChat}
        showNewChat={true}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar
          activePath="/"
          onNavigate={handleNavigate}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          onNewChat={handleNewChat}
        />

        <div className="flex-1 flex flex-col min-w-0 w-full overflow-hidden min-h-0">
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
      </div>

      <StatusBar />
    </div>
  );
}
