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
          <div className="max-w-3xl mx-auto">
            {/* Header with gradient */}
            <div className="mb-8 sm:mb-10">
              <h1 className="text-2xl sm:text-3xl font-bold mb-3 bg-gradient-to-r from-primary via-primary/80 to-accent bg-clip-text text-transparent">
                Settings
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Customize your experience and manage your account preferences
              </p>
            </div>

            <div className="space-y-5 sm:space-y-6">
              {settingsSections.map((section, index) => (
                <div
                  key={section.title}
                  className="group relative p-5 sm:p-6 rounded-2xl glass-card transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 overflow-hidden"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  {/* Gradient background on hover */}
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  
                  <div className="relative">
                    {/* Section header with gradient icon */}
                    <div className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-6">
                      <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/15 to-accent/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                        <section.icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                        {/* Pulse effect on hover */}
                        <div className="absolute inset-0 rounded-2xl bg-primary/20 opacity-0 group-hover:opacity-100 group-hover:animate-ping"></div>
                      </div>
                      <div>
                        <h2 className="font-semibold text-base sm:text-lg group-hover:text-primary transition-colors duration-300">
                          {section.title}
                        </h2>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                          {section.title === 'Profile' && 'Manage your personal information'}
                          {section.title === 'Notifications' && 'Control your notification preferences'}
                          {section.title === 'Feedback' && 'Share your thoughts with us'}
                        </p>
                      </div>
                    </div>
                    
                    {/* Section content */}
                    <div className="pl-0 sm:pl-2">
                      {section.content}
                    </div>
                  </div>
                </div>
              ))}

              {/* Sign Out button with gradient */}
              <div className="pt-4 sm:pt-6">
                <Button
                  variant="ghost"
                  onClick={handleSignOut}
                  className="group relative text-destructive hover:text-destructive hover:bg-destructive/10 text-sm sm:text-base h-11 sm:h-12 px-6 rounded-xl transition-all duration-300 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-destructive/0 via-destructive/10 to-destructive/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <LogOut className="relative w-4 h-4 sm:w-5 sm:h-5 mr-2 group-hover:rotate-12 transition-transform duration-300" />
                  <span className="relative font-medium">Sign Out</span>
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
