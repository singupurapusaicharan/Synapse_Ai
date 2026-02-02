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
            <h1 className="text-2xl sm:text-3xl font-bold mb-2 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Chat History
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8">
              Your past conversations and chat sessions
            </p>

            {loading ? (
              <div className="text-center py-20">
                <div className="relative w-20 h-20 mx-auto mb-6">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/20 to-primary/40 animate-pulse"></div>
                  <div className="absolute inset-2 rounded-full bg-background flex items-center justify-center">
                    <Clock className="w-8 h-8 text-primary animate-spin" style={{ animationDuration: '3s' }} />
                  </div>
                </div>
                <p className="text-muted-foreground font-medium">Loading your conversations...</p>
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-20">
                <div className="relative w-20 h-20 mx-auto mb-6">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/10 to-primary/20"></div>
                  <div className="absolute inset-2 rounded-full bg-background flex items-center justify-center">
                    <MessageSquare className="w-8 h-8 text-primary" />
                  </div>
                </div>
                <p className="text-lg font-semibold mb-2">No conversations yet</p>
                <p className="text-sm text-muted-foreground mb-6">
                  Start your first chat to see your history here
                </p>
                <Button
                  className="mt-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
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
                    className="group relative p-4 sm:p-5 rounded-2xl glass-card transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 cursor-pointer overflow-hidden"
                  >
                    {/* Gradient background on hover */}
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    
                    <div className="relative flex items-start justify-between gap-3 sm:gap-4">
                      <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                        {/* Icon with gradient */}
                        <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                          <MessageSquare className="w-5 h-5 sm:w-5.5 sm:h-5.5 text-primary" />
                          {/* Pulse effect on hover */}
                          <div className="absolute inset-0 rounded-xl bg-primary/20 opacity-0 group-hover:opacity-100 group-hover:animate-ping"></div>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          {/* Title with gradient on hover */}
                          <p className="font-semibold text-sm sm:text-base leading-relaxed truncate group-hover:text-primary transition-colors duration-300">
                            {session.title || 'New Chat'}
                          </p>
                          
                          {/* Preview text */}
                          {session.last_message_preview && (
                            <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                              {session.last_message_preview}
                            </p>
                          )}
                          
                          {/* Metadata with icons */}
                          <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-3">
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="w-3.5 h-3.5" />
                              {formatDate(session.created_at)}
                            </span>
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <MessageSquare className="w-3.5 h-3.5" />
                              {session.message_count} {session.message_count === 1 ? 'message' : 'messages'}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Delete button with hover effect */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleDelete(session.id, e)}
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-9 w-9 p-0 flex-shrink-0 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
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
