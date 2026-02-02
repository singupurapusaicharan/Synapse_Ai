import { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Sidebar } from '@/components/layout/Sidebar';
import { StatusBar } from '@/components/layout/StatusBar';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api/client';
import { Database, Mail, FileText, MessageSquare, Plus, Check, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const sourceIcons: Record<string, React.ElementType> = {
  gmail: Mail,
  drive: FileText,
  slack: MessageSquare,
  notion: Database,
};

interface Source {
  id: string;
  source_type: string;
  source_name: string;
  status: 'connected' | 'disconnected';
  last_synced_at: string | null;
  connected_at: string | null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function isSourceRow(v: unknown): v is Source {
  const r = asRecord(v);
  if (!r) return false;
  const statusOk = r.status === 'connected' || r.status === 'disconnected';
  return (
    typeof r.id === 'string' &&
    typeof r.source_type === 'string' &&
    typeof r.source_name === 'string' &&
    statusOk &&
    (typeof r.last_synced_at === 'string' || r.last_synced_at === null) &&
    (typeof r.connected_at === 'string' || r.connected_at === null)
  );
}

function parseSources(data: unknown): Source[] {
  const d = asRecord(data);
  const raw = d?.sources;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isSourceRow);
}

const AVAILABLE_SOURCES = [
  { type: 'gmail', name: 'Gmail', icon: Mail },
  { type: 'drive', name: 'Google Drive', icon: FileText },
  { type: 'slack', name: 'Slack', icon: MessageSquare },
  { type: 'notion', name: 'Notion', icon: Database },
];

export function Sources() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  // Keep latest sync/connect state accessible to the polling timer without re-wiring effects.
  const syncingRef = useRef<string | null>(null);
  const connectingRef = useRef<string | null>(null);
  useEffect(() => {
    syncingRef.current = syncing;
  }, [syncing]);
  useEffect(() => {
    connectingRef.current = connecting;
  }, [connecting]);

  const updateLastSyncedLocal = (sourceType: string, isoTimestamp: string) => {
    setSources((prev) =>
      prev.map((s) =>
        s.source_type === sourceType ? { ...s, last_synced_at: isoTimestamp } : s
      )
    );
  };

  useEffect(() => {
    // Don't redirect while auth is still loading (prevents a race right after Google sign-in).
    if (authLoading) {
      return;
    }
    if (!user) {
      navigate('/auth');
      return;
    }

    let isInitial = true;
    const fetchSources = async () => {
      try {
        // Only show the big loading state on first load; polling refresh should not "blink" the UI.
        if (isInitial) setLoading(true);
        const response = await apiClient.getSources();
        const next = parseSources(response.data);
        if (next.length > 0) {
          // Avoid unnecessary state churn (prevents subtle blinking/reflow)
          setSources((prev) => {
            const prevJson = JSON.stringify(prev);
            const nextJson = JSON.stringify(next);
            return prevJson === nextJson ? prev : next;
          });
        } else if (response.error) {
          toast({
            title: 'Error',
            description: response.error,
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('Error fetching sources:', error);
        toast({
          title: 'Error',
          description: 'Failed to load sources',
          variant: 'destructive',
        });
      } finally {
        if (isInitial) setLoading(false);
        isInitial = false;
      }
    };

    fetchSources();

    // Check for OAuth callback success/error
    const urlParams = new URLSearchParams(window.location.search);
    const connected = urlParams.get('connected');
    if (connected === 'gmail' || connected === 'drive') {
      toast({
        title: 'Connected',
        description: `${connected === 'gmail' ? 'Gmail' : 'Google Drive'} connected successfully`,
      });
      // Remove query param
      window.history.replaceState({}, '', '/sources');
      fetchSources();

      // Auto-trigger initial sync after successful connect so chat has indexed data
      (async () => {
        try {
          // Prevent duplicate auto-sync in the same browser session
          const key = `auto_sync_done_${connected}`;
          if (sessionStorage.getItem(key) === 'true') return;
          sessionStorage.setItem(key, 'true');

          setSyncing(connected);
          toast({
            title: 'Sync started',
            description: `Syncing ${connected}… this may take a minute.`,
          });

          const syncRes = await apiClient.syncSource(connected);
          if (syncRes.error) {
            toast({
              title: 'Sync failed',
              description: syncRes.error,
              variant: 'destructive',
            });
            return;
          }

          const results = syncRes.data?.results || {};
          const sourceResult = results[connected];
          if (sourceResult?.error) {
            toast({
              title: 'Sync failed',
              description: sourceResult.error,
              variant: 'destructive',
            });
            return;
          }

          // Immediately reflect the new "last synced" moment in the UI (use server timestamp).
          if (syncRes.data?.timestamp) {
            updateLastSyncedLocal(connected, syncRes.data.timestamp);
          }

          toast({
            title: 'Sync completed',
            description: `Successfully synced ${connected}. You can now ask questions.`,
          });
          await fetchSources();

          // If this connect was triggered by the auto-connect flow, return the user where they came from.
          const returnTo = sessionStorage.getItem('autoconnect_returnTo');
          if (returnTo && returnTo.startsWith('/')) {
            sessionStorage.removeItem('autoconnect_returnTo');
            navigate(returnTo, { replace: true });
          }
        } catch (e: unknown) {
          toast({
            title: 'Sync failed',
            description: e instanceof Error ? e.message : 'Failed to sync source',
            variant: 'destructive',
          });
        } finally {
          setSyncing(null);
        }
      })();
    } else if (urlParams.get('error') === 'oauth_failed') {
      const reason = urlParams.get('reason') || 'Unknown error';
      toast({
        title: 'Connection failed',
        description: `Failed to complete OAuth authorization: ${reason}`,
        variant: 'destructive',
      });
      // Allow retry if an auto-connect attempt failed in this session.
      sessionStorage.removeItem('autoconnect_done_gmail');
      sessionStorage.removeItem('autoconnect_done_drive');
      sessionStorage.removeItem('autoconnect_returnTo');
      // Remove query param
      window.history.replaceState({}, '', '/sources');
    }

    // Poll for updates, but pause while user is actively connecting/syncing to avoid extra UI churn.
    const interval = setInterval(() => {
      if (syncingRef.current || connectingRef.current) return;
      void fetchSources();
    }, 15000);
    return () => clearInterval(interval);
  }, [user, authLoading, navigate, toast]);

  const getSourceStatus = (sourceType: string): Source | null => {
    return sources.find(s => s.source_type === sourceType) || null;
  };

  const handleConnect = useCallback(async (sourceType: string) => {
    if (sourceType === 'gmail' || sourceType === 'drive') {
      try {
        setConnecting(sourceType);
        
        // Get auth token for authenticated request
        const token = localStorage.getItem('auth_token');
        if (!token) {
          toast({
            title: 'Authentication required',
            description: 'Please sign in to connect sources',
            variant: 'destructive',
          });
          navigate('/auth');
          setConnecting(null);
          return;
        }
        
        // Open OAuth URL directly from backend with authentication
        const backendUrl = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:3001';
        const authUrl = `${backendUrl}/auth/google?sourceType=${sourceType}&token=${token}`;
        
        // Open in same window (OAuth flow will redirect back)
        window.location.href = authUrl;
        
        // Note: We don't show toast here because we're redirecting
        // The callback will redirect back to /sources?connected=true
      } catch (error) {
        console.error('Error connecting source:', error);
        setConnecting(null);
        toast({
          title: 'Error',
          description: 'Failed to initiate connection',
          variant: 'destructive',
        });
      }
    } else {
      toast({
        title: 'Coming soon',
        description: `${sourceType} integration is not yet available.`,
      });
    }
  }, [navigate, toast]);

  // Auto-connect flow: used after email/password signup to guide users into connecting Gmail.
  // This still requires the user to approve Google OAuth; it just removes manual steps.
  useEffect(() => {
    if (!user) return;
    if (loading) return;
    if (connecting || syncing) return;

    const urlParams = new URLSearchParams(window.location.search);
    const connected = urlParams.get('connected');
    const oauthError = urlParams.get('error');
    // If we just came back from OAuth (success or error), don't auto-trigger again.
    if (connected || oauthError) return;

    const auto = urlParams.get('autoconnect');
    if (auto !== 'gmail' && auto !== 'drive') return;

    // Persist returnTo through the OAuth redirect round-trip (query params will be lost).
    const returnTo = urlParams.get('returnTo');
    if (returnTo && returnTo.startsWith('/')) {
      sessionStorage.setItem('autoconnect_returnTo', returnTo);
    }

    const key = `autoconnect_done_${auto}`;
    if (sessionStorage.getItem(key) === 'true') return;

    const source = sources.find((s) => s.source_type === auto) || null;
    // If already connected, just clean the URL so we don't loop.
    if (source?.status === 'connected') {
      sessionStorage.setItem(key, 'true');
      window.history.replaceState({}, '', '/sources');
      const rt = sessionStorage.getItem('autoconnect_returnTo');
      if (rt && rt.startsWith('/')) {
        sessionStorage.removeItem('autoconnect_returnTo');
        navigate(rt, { replace: true });
      }
      return;
    }

    // Must have a session token to initiate connector OAuth.
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    sessionStorage.setItem(key, 'true');
    // Kick off OAuth connect (same behavior as clicking Connect).
    void handleConnect(auto);
  }, [user, loading, sources, connecting, syncing, handleConnect, navigate]);

  const handleSync = async (sourceType: string) => {
    // Prevent multiple simultaneous syncs
    if (syncing) {
      return;
    }

    try {
      setSyncing(sourceType);
      const response = await apiClient.syncSource(sourceType);
      
      // Check for errors in the response
      if (response.error) {
        toast({
          title: 'Sync failed',
          description: response.error,
          variant: 'destructive',
        });
      } else if (response.data) {
        // Check if there are errors in the results
        const results = response.data.results || {};
        const sourceResult = results[sourceType];
        
        if (sourceResult?.error) {
          const msg = String(sourceResult.error || '');
          if (msg.toLowerCase().includes('authorization expired') || msg.toLowerCase().includes('invalid_grant')) {
            toast({
              title: 'Reconnect required',
              description: msg,
              variant: 'destructive',
            });
          } else {
          toast({
            title: 'Sync failed',
            description: msg,
            variant: 'destructive',
          });
          }
        } else {
          // Immediately reflect the new "last synced" moment in the UI (use server timestamp).
          if (response.data.timestamp) {
            updateLastSyncedLocal(sourceType, response.data.timestamp);
          }
          toast({
            title: 'Sync completed',
            description: `Successfully synced ${sourceType}`,
          });
        }
      }
      
      // Always refresh sources to get updated last_synced_at
      const sourcesResponse = await apiClient.getSources();
      const next = parseSources(sourcesResponse.data);
      setSources((prev) => {
        const prevJson = JSON.stringify(prev);
        const nextJson = JSON.stringify(next);
        return prevJson === nextJson ? prev : next;
      });
    } catch (error: unknown) {
      console.error('Error syncing source:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to sync source',
        variant: 'destructive',
      });
    } finally {
      setSyncing(null);
    }
  };

  const handleDisconnect = async (sourceType: string) => {
    if (!confirm(`Are you sure you want to disconnect ${sourceType}? All indexed data will be deleted.`)) {
      return;
    }

    try {
      const response = await apiClient.disconnectSource(sourceType);
      if (response.data) {
        toast({
          title: 'Disconnected',
          description: `${sourceType} has been disconnected`,
        });
        // Refresh sources
        const sourcesResponse = await apiClient.getSources();
        setSources(parseSources(sourcesResponse.data));
      } else if (response.error) {
        toast({
          title: 'Error',
          description: response.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error disconnecting source:', error);
      toast({
        title: 'Error',
        description: 'Failed to disconnect source',
        variant: 'destructive',
      });
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col">
      <Navbar onNavigate={(path) => navigate(path)} />

      <div className="flex-1 flex min-h-0">
        <Sidebar
          activePath="/sources"
          onNavigate={(path) => navigate(path)}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-10 overflow-auto">
          <div className="max-w-4xl mx-auto">
            {/* Header with gradient */}
            <div className="mb-8 sm:mb-10">
              <h1 className="text-2xl sm:text-3xl font-bold mb-3 bg-gradient-to-r from-primary via-primary/80 to-accent bg-clip-text text-transparent">
                Data Sources
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Connect and manage your data sources to unlock AI-powered search across all your content
              </p>
            </div>

            {loading ? (
              <div className="text-center py-20">
                <div className="relative w-20 h-20 mx-auto mb-6">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/20 to-accent/20 animate-pulse"></div>
                  <div className="absolute inset-2 rounded-full bg-background flex items-center justify-center">
                    <Database className="w-8 h-8 text-primary animate-spin" style={{ animationDuration: '3s' }} />
                  </div>
                </div>
                <p className="text-muted-foreground font-medium">Loading your sources...</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:gap-5">
                {AVAILABLE_SOURCES.map((availableSource) => {
                  const sourceStatus = getSourceStatus(availableSource.type);
                  const isConnected = sourceStatus?.status === 'connected';
                  const Icon = availableSource.icon;
                  const isSyncing = syncing === availableSource.type;
                  const isConnecting = connecting === availableSource.type;

                  return (
                    <div
                      key={availableSource.type}
                      className={cn(
                        'group relative p-5 sm:p-6 rounded-2xl glass-card transition-all duration-300 overflow-hidden',
                        isConnected 
                          ? 'border-primary/30 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10' 
                          : 'hover:border-primary/20 hover:shadow-md'
                      )}
                    >
                      {/* Gradient background on hover */}
                      <div className={cn(
                        "absolute inset-0 bg-gradient-to-r opacity-0 transition-opacity duration-300",
                        isConnected 
                          ? "from-primary/5 via-accent/5 to-primary/5 group-hover:opacity-100"
                          : "from-primary/0 via-primary/3 to-primary/0 group-hover:opacity-100"
                      )}></div>

                      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          {/* Icon with gradient and animation */}
                          <div className={cn(
                            'relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-300',
                            isConnected 
                              ? 'bg-gradient-to-br from-primary/20 via-primary/15 to-accent/20 group-hover:scale-110' 
                              : 'bg-gradient-to-br from-muted/50 to-muted/30 group-hover:scale-105'
                          )}>
                            <Icon className={cn(
                              'w-7 h-7 sm:w-8 sm:h-8 transition-colors duration-300',
                              isConnected ? 'text-primary' : 'text-muted-foreground group-hover:text-primary/70'
                            )} />
                            {/* Pulse effect for connected sources */}
                            {isConnected && (
                              <div className="absolute inset-0 rounded-2xl bg-primary/20 opacity-0 group-hover:opacity-100 group-hover:animate-ping"></div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-base sm:text-lg mb-1 group-hover:text-primary transition-colors duration-300">
                              {availableSource.name}
                            </h3>
                            <div className="flex items-center gap-2">
                              {isConnected ? (
                                <>
                                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                  <p className="text-xs sm:text-sm text-green-600 dark:text-green-400 font-medium">
                                    Connected & Active
                                  </p>
                                </>
                              ) : (
                                <>
                                  <div className="w-2 h-2 rounded-full bg-muted-foreground/50"></div>
                                  <p className="text-xs sm:text-sm text-muted-foreground">
                                    Not connected
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isConnected && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSync(availableSource.type)}
                                disabled={isSyncing}
                                className={cn(
                                  "text-muted-foreground hover:text-primary hover:bg-primary/10 text-xs sm:text-sm h-9 sm:h-10 px-3 sm:px-4 rounded-xl transition-all duration-300",
                                  isSyncing && "bg-primary/10 text-primary"
                                )}
                              >
                                <RefreshCw className={cn(
                                  'w-4 h-4 mr-2',
                                  isSyncing && 'animate-spin'
                                )} />
                                {isSyncing ? 'Syncing...' : 'Sync Now'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDisconnect(availableSource.type)}
                                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-xs sm:text-sm h-9 sm:h-10 px-3 sm:px-4 rounded-xl transition-all duration-300"
                              >
                                <X className="w-4 h-4 mr-2" />
                                Disconnect
                              </Button>
                            </>
                          )}
                          {!isConnected && (
                            <Button
                              size="sm"
                              onClick={() => handleConnect(availableSource.type)}
                              disabled={isConnecting}
                              className={cn(
                                "bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 rounded-xl text-xs sm:text-sm h-9 sm:h-10 px-4 sm:px-6 transition-all duration-300 shadow-lg shadow-primary/20",
                                isConnecting && "opacity-70"
                              )}
                            >
                              {isConnecting ? (
                                <>
                                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                  Connecting...
                                </>
                              ) : (
                                <>
                                  <Plus className="w-4 h-4 mr-2" />
                                  Connect Now
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Last synced info with better styling */}
                      {isConnected && sourceStatus?.last_synced_at && (
                        <div className="relative mt-4 pt-4 border-t border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/10">
                            <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                          <span className="truncate">Last synced: {new Date(sourceStatus.last_synced_at).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      <StatusBar />
    </div>
  );
}
