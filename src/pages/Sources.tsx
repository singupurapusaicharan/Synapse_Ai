import { useState, useEffect } from 'react';
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
  const { user } = useAuth();

  const updateLastSyncedLocal = (sourceType: string, isoTimestamp: string) => {
    setSources((prev) =>
      prev.map((s) =>
        s.source_type === sourceType ? { ...s, last_synced_at: isoTimestamp } : s
      )
    );
  };

  useEffect(() => {
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
      // Remove query param
      window.history.replaceState({}, '', '/sources');
    }

    // Poll for updates, but not too aggressively (prevents UI churn)
    const interval = setInterval(fetchSources, 15000);
    return () => clearInterval(interval);
  }, [user, navigate, toast]);

  const getSourceStatus = (sourceType: string): Source | null => {
    return sources.find(s => s.source_type === sourceType) || null;
  };

  const handleConnect = async (sourceType: string) => {
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
  };

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
      setSources(parseSources(sourcesResponse.data));
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

        <main className="flex-1 p-6 lg:p-10 overflow-auto">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-2xl font-semibold mb-2">Connected Sources</h1>
            <p className="text-muted-foreground mb-8">
              Manage your data sources to search across all your content.
            </p>

            {loading ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <Database className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">Loading sources...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {AVAILABLE_SOURCES.map((availableSource) => {
                  const sourceStatus = getSourceStatus(availableSource.type);
                  const isConnected = sourceStatus?.status === 'connected';
                  const Icon = availableSource.icon;

                  return (
                    <div
                      key={availableSource.type}
                      className={cn(
                        'p-5 rounded-2xl glass-card transition-all duration-300',
                        isConnected && 'border-primary/20'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            'w-12 h-12 rounded-xl flex items-center justify-center',
                            isConnected 
                              ? 'bg-gradient-to-br from-primary/20 to-accent/20' 
                              : 'bg-muted/50'
                          )}>
                            <Icon className={cn(
                              'w-6 h-6',
                              isConnected ? 'text-primary' : 'text-muted-foreground'
                            )} />
                          </div>
                          <div>
                            <h3 className="font-medium">{availableSource.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {isConnected 
                                ? 'Connected'
                                : 'Not connected'
                              }
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isConnected && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSync(availableSource.type)}
                                disabled={syncing === availableSource.type}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <RefreshCw className={cn(
                                  'w-4 h-4 mr-2',
                                  syncing === availableSource.type && 'animate-spin'
                                )} />
                                Sync
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDisconnect(availableSource.type)}
                                className="text-muted-foreground hover:text-destructive"
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
                              disabled={connecting === availableSource.type}
                              className="rounded-lg"
                            >
                              {connecting === availableSource.type ? (
                                <>
                                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                  Connecting...
                                </>
                              ) : (
                                <>
                                  <Plus className="w-4 h-4 mr-2" />
                                  Connect
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>

                      {isConnected && sourceStatus?.last_synced_at && (
                        <div className="mt-4 pt-4 border-t border-border/30 flex items-center gap-2 text-xs text-muted-foreground">
                          <Check className="w-3 h-3 text-accent" />
                          Last synced: {new Date(sourceStatus.last_synced_at).toLocaleString()}
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
