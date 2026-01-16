import { useState, useEffect, useRef } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Sidebar } from '@/components/layout/Sidebar';
import { StatusBar } from '@/components/layout/StatusBar';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api/client';
import { Clock, MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { formatRelativeTime, formatHistoryDate, formatDateTime } from '../utils/time';

interface ChatSession {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  message_count: number;
  last_message_preview?: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function isChatSession(v: unknown): v is ChatSession {
  const r = asRecord(v);
  if (!r) return false;
  return (
    typeof r.id === 'string' &&
    typeof r.user_id === 'string' &&
    (typeof r.title === 'string' || r.title === null) &&
    typeof r.created_at === 'string' &&
    typeof r.message_count === 'number'
  );
}

export function History() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isFetchingRef = useRef(false);

  const formatTimeAgo = (date: string | Date) => {
    return formatRelativeTime(date);
  };

  const formatDate = (date: string | Date) => {
    return formatHistoryDate(date);
  };

  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    const fetchSessions = async () => {
      if (isFetchingRef.current) return;
      if (document.hidden) return;
      isFetchingRef.current = true;
      try {
        setLoading(true);
        const response = await apiClient.getChatSessions();
        const raw = response.data?.sessions;
        if (Array.isArray(raw)) {
          setSessions(raw.filter(isChatSession));
        } else {
          setSessions([]);
        }
      } catch (error) {
        console.error('Error fetching sessions:', error);
        toast({
          title: 'Error',
          description: 'Failed to load chat sessions. Please try again later.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
        isFetchingRef.current = false;
      }
    };

    fetchSessions();

    // Light polling (avoid hammering backend) + refetch on focus/visibility.
    const interval = setInterval(fetchSessions, 30000);
    const onFocus = () => void fetchSessions();
    const onVisibility = () => {
      if (!document.hidden) void fetchSessions();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user, navigate, toast]);

  const handleSessionClick = (sessionId: string) => {
    navigate(`/?session=${sessionId}`);
  };

  const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this chat session?')) {
      return;
    }

    try {
      const response = await apiClient.deleteChatSession(sessionId);
      if (response.data) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        toast({
          title: 'Deleted',
          description: 'Chat session deleted',
        });
      } else if (response.error) {
        toast({
          title: 'Error',
          description: response.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error deleting session:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete session',
        variant: 'destructive',
      });
    }
  };

  // Time formatting functions are now imported from '../utils/time'

  if (!user) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col">
      <Navbar onNavigate={(path) => navigate(path)} />

      <div className="flex-1 flex min-h-0">
        <Sidebar
          activePath="/history"
          onNavigate={(path) => navigate(path)}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-10 overflow-auto">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-xl sm:text-2xl font-semibold mb-2">Chat History</h1>
            <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8">
              Your past conversations and chat sessions.
            </p>

            {loading ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <Clock className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">Loading sessions...</p>
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground mb-2">No chat sessions yet</p>
                <p className="text-sm text-muted-foreground">
                  Start a new chat to see your conversations here.
                </p>
                <Button
                  className="mt-6"
                  onClick={() => navigate('/')}
                >
                  Start New Chat
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => handleSessionClick(session.id)}
                    className="p-3 sm:p-4 rounded-xl glass-card group transition-all duration-300 hover:border-primary/20 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2 sm:gap-4">
                      <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5 flex-shrink-0">
                          <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="w-full">
                            <p className="font-medium text-xs sm:text-sm leading-relaxed truncate">
                              {session.title || 'New Chat'}
                            </p>
                            {session.last_message_preview && (
                              <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-1">
                                {session.last_message_preview}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
                              <span className="text-[10px] sm:text-xs text-muted-foreground">
                                {formatDate(session.created_at)}
                              </span>
                              <span className="text-[10px] sm:text-xs text-muted-foreground">
                                {formatTimeAgo(session.created_at)}
                              </span>
                              {session.message_count > 0 && (
                                <span className="text-[10px] sm:text-xs text-muted-foreground">
                                  {session.message_count} {session.message_count === 1 ? 'message' : 'messages'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleDelete(session.id, e)}
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive h-8 w-8 p-0 flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <StatusBar />
    </div>
  );
}
