import { useEffect, useState } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Sidebar } from '@/components/layout/Sidebar';
import { StatusBar } from '@/components/layout/StatusBar';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { User, Bell, MessageSquare, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api/client';

export function Settings() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const navigate = useNavigate();
  const { user, signOut, refreshUser } = useAuth();
  const { toast } = useToast();
  const [feedbackName, setFeedbackName] = useState('');
  const [feedbackEmail, setFeedbackEmail] = useState('');
  const [feedbackComments, setFeedbackComments] = useState('');
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);

  useEffect(() => {
    setFeedbackName(user?.full_name || user?.email?.split('@')[0] || '');
    setFeedbackEmail(user?.email || '');

    // Populate first/last name from full_name (entered at signup)
    const full = (user?.full_name || '').trim();
    if (!full) {
      setFirstName('');
      setLastName('');
      return;
    }
    const parts = full.split(/\s+/);
    setFirstName(parts[0] || '');
    setLastName(parts.slice(1).join(' ') || '');
  }, [user]);

  // Load saved settings from DB
  useEffect(() => {
    const load = async () => {
      const resp = await apiClient.getSettings();
      if (resp.data?.settings) {
        setNotifications(!!resp.data.settings.notifications);
        setEmailAlerts(!!resp.data.settings.emailAlerts);
      }
    };
    load();
  }, []);

  const persistSettings = async (next: { notifications?: boolean; emailAlerts?: boolean }) => {
    setIsSavingNotifications(true);
    try {
      const resp = await apiClient.updateSettings(next);
      if (resp.error) {
        toast({
          title: 'Unable to save',
          description: resp.error,
          variant: 'destructive',
        });
      }
    } finally {
      setIsSavingNotifications(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      const resp = await apiClient.updateSettings({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      if (resp.error) {
        toast({
          title: 'Unable to save',
          description: resp.error,
          variant: 'destructive',
        });
        return;
      }

      // Refresh auth user so the updated name shows immediately everywhere
      await refreshUser();

      toast({
        title: 'Profile saved',
        description: 'Your name has been updated.',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSendFeedback = async () => {
    if (!feedbackComments.trim()) {
      toast({
        title: 'Add a comment',
        description: 'Please write your feedback before sending.',
        variant: 'destructive',
      });
      return;
    }

    setIsSendingFeedback(true);
    try {
      const resp = await apiClient.postFeedback({
        name: feedbackName,
        email: feedbackEmail,
        comments: feedbackComments.trim(),
      });

      if (resp.error) {
        toast({
          title: 'Unable to send feedback',
          description: resp.error,
          variant: 'destructive',
        });
        return;
      }

      setFeedbackComments('');
      toast({
        title: 'Feedback sent',
        description: 'Thanks — we received your feedback.',
      });
    } finally {
      setIsSendingFeedback(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const settingsSections = [
    {
      title: 'Profile',
      icon: User,
      content: (
        <div className="space-y-3 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs sm:text-sm text-muted-foreground">First name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1.5 sm:mt-2 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-xs sm:text-sm outline-none focus:border-primary/40"
                placeholder="First name"
                disabled={isSavingProfile}
              />
            </div>
            <div>
              <label className="text-xs sm:text-sm text-muted-foreground">Last name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1.5 sm:mt-2 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-xs sm:text-sm outline-none focus:border-primary/40"
                placeholder="Last name"
                disabled={isSavingProfile}
              />
            </div>
          </div>
          <div>
            <label className="text-xs sm:text-sm text-muted-foreground">Email</label>
            <p className="font-medium text-xs sm:text-sm mt-1 truncate">{user?.email || 'Not available'}</p>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              className="rounded-lg text-xs sm:text-sm h-8 sm:h-9"
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
            >
              Save profile
            </Button>
          </div>
        </div>
      ),
    },
    {
      title: 'Notifications',
      icon: Bell,
      content: (
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-xs sm:text-sm">Push Notifications</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Receive notifications about updates</p>
            </div>
            <Switch
              checked={notifications}
              disabled={isSavingNotifications}
              onCheckedChange={(v) => {
                setNotifications(v);
                persistSettings({ notifications: v });
              }}
              className="flex-shrink-0"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-xs sm:text-sm">Email Alerts</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Get email alerts for important events</p>
            </div>
            <Switch
              checked={emailAlerts}
              disabled={isSavingNotifications}
              onCheckedChange={(v) => {
                setEmailAlerts(v);
                persistSettings({ emailAlerts: v });
              }}
              className="flex-shrink-0"
            />
          </div>
        </div>
      ),
    },
    {
      title: 'Feedback',
      icon: MessageSquare,
      content: (
        <div className="space-y-3 sm:space-y-4">
          <div>
            <label className="text-xs sm:text-sm text-muted-foreground">Name</label>
            <input
              value={feedbackName}
              onChange={(e) => setFeedbackName(e.target.value)}
              className="mt-1.5 sm:mt-2 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-xs sm:text-sm outline-none focus:border-primary/40"
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="text-xs sm:text-sm text-muted-foreground">Email</label>
            <input
              value={feedbackEmail}
              onChange={(e) => setFeedbackEmail(e.target.value)}
              className="mt-1.5 sm:mt-2 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-xs sm:text-sm outline-none focus:border-primary/40"
              placeholder="you@domain.com"
            />
          </div>
          <div>
            <label className="text-xs sm:text-sm text-muted-foreground">Comments</label>
            <textarea
              value={feedbackComments}
              onChange={(e) => setFeedbackComments(e.target.value)}
              className="mt-1.5 sm:mt-2 w-full min-h-[90px] sm:min-h-[110px] rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-xs sm:text-sm outline-none focus:border-primary/40 resize-y"
              placeholder="Tell us what to improve…"
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              className="rounded-lg text-xs sm:text-sm h-8 sm:h-9"
              onClick={handleSendFeedback}
              disabled={isSendingFeedback}
              aria-label="Send feedback"
              title="Send"
            >
              Send
            </Button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="h-screen flex flex-col">
      <Navbar onNavigate={(path) => navigate(path)} />

      <div className="flex-1 flex min-h-0">
        <Sidebar
          activePath="/settings"
          onNavigate={(path) => navigate(path)}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-10 overflow-auto">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-xl sm:text-2xl font-semibold mb-2">Settings</h1>
            <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8">
              Manage your account and preferences.
            </p>

            <div className="space-y-4 sm:space-y-6">
              {settingsSections.map((section) => (
                <div
                  key={section.title}
                  className="p-4 sm:p-5 rounded-2xl glass-card"
                >
                  <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-5">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <section.icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                    </div>
                    <h2 className="font-semibold text-sm sm:text-base">{section.title}</h2>
                  </div>
                  {section.content}
                </div>
              ))}

              {/* Sign Out */}
              <div className="pt-2 sm:pt-4">
                <Button
                  variant="ghost"
                  onClick={handleSignOut}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs sm:text-sm h-9 sm:h-10"
                >
                  <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>

      <StatusBar />
    </div>
  );
}
