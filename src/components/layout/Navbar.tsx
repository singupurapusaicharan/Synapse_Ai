import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, History, Settings, ChevronDown, Sparkles, Menu, X, MessageSquare, Database } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

interface NavbarProps {
  onNavigate?: (path: string) => void;
}

export function Navbar({ onNavigate }: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const userMeta =
    (user as unknown as { user_metadata?: { full_name?: string; avatar_url?: string } | null })?.user_metadata || null;
  const userName = userMeta?.full_name || user?.email?.split('@')[0] || 'User';
  const userEmail = user?.email || '';
  const avatarUrl = userMeta?.avatar_url;
  const emailInitial = (userEmail.trim()[0] || 'U').toUpperCase();

  return (
    <header className="h-16 border-b border-border/30 bg-background/60 backdrop-blur-xl sticky top-0 z-50">
      <div className="flex items-center justify-between h-full px-4 lg:px-8">
        {/* Mobile Menu Button (only show when user is logged in) */}
        {user && (
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden mr-2"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <div className="flex flex-col h-full">
                <div className="p-4 border-b border-border/30">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-primary via-primary/80 to-accent flex items-center justify-center">
                      <Sparkles className="w-4.5 h-4.5 text-primary-foreground" />
                    </div>
                    <span className="text-xl font-semibold">Synapse</span>
                  </div>
                </div>
                
                <nav className="flex-1 p-4 space-y-2">
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3"
                    onClick={() => {
                      onNavigate?.('/');
                      setMobileMenuOpen(false);
                    }}
                  >
                    <MessageSquare className="w-4 h-4" />
                    Chat
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3"
                    onClick={() => {
                      onNavigate?.('/sources');
                      setMobileMenuOpen(false);
                    }}
                  >
                    <Database className="w-4 h-4" />
                    Sources
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3"
                    onClick={() => {
                      onNavigate?.('/history');
                      setMobileMenuOpen(false);
                    }}
                  >
                    <History className="w-4 h-4" />
                    History
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3"
                    onClick={() => {
                      onNavigate?.('/settings');
                      setMobileMenuOpen(false);
                    }}
                  >
                    <Settings className="w-4 h-4" />
                    Settings
                  </Button>
                </nav>
              </div>
            </SheetContent>
          </Sheet>
        )}

        {/* Logo */}
        <div 
          className="flex items-center gap-2 sm:gap-3 cursor-pointer group"
          onClick={() => navigate('/')}
        >
          <div className="relative">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl bg-gradient-to-br from-primary via-primary/80 to-accent flex items-center justify-center glow-subtle group-hover:glow-primary transition-all duration-500">
              <Sparkles className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-primary-foreground" />
            </div>
          </div>
          <span className="text-lg sm:text-xl font-semibold tracking-tight">Synapse</span>
        </div>

        {/* User Menu or Sign In Button */}
        {user ? (
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2.5 px-3 h-10 rounded-xl hover:bg-secondary/60 transition-all duration-300"
              >
                <Avatar className="h-7 w-7 ring-2 ring-border/50">
                  <AvatarImage src={avatarUrl} alt={userName} />
                  <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20 text-xs font-medium">
                    {emailInitial}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium hidden sm:inline">{userName}</span>
                <ChevronDown
                  className={cn(
                    'w-4 h-4 text-muted-foreground transition-transform duration-300',
                    isOpen && 'rotate-180'
                  )}
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 p-2 rounded-xl glass-card">
              <div className="px-3 py-2.5 mb-1">
                <p className="text-sm font-semibold">{userName}</p>
                <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
              </div>
              <DropdownMenuSeparator className="bg-border/50" />
              <DropdownMenuItem
                className="cursor-pointer rounded-lg my-0.5 focus:bg-secondary/60 focus:text-foreground data-[highlighted]:bg-secondary/60 data-[highlighted]:text-foreground"
                onClick={() => onNavigate?.('/settings')}
              >
                <User className="w-4 h-4 mr-3" />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer rounded-lg my-0.5 focus:bg-secondary/60 focus:text-foreground data-[highlighted]:bg-secondary/60 data-[highlighted]:text-foreground"
                onClick={() => onNavigate?.('/history')}
              >
                <History className="w-4 h-4 mr-3" />
                History
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer rounded-lg my-0.5 focus:bg-secondary/60 focus:text-foreground data-[highlighted]:bg-secondary/60 data-[highlighted]:text-foreground"
                onClick={() => onNavigate?.('/settings')}
              >
                <Settings className="w-4 h-4 mr-3" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border/50" />
              <DropdownMenuItem
                className="cursor-pointer rounded-lg text-destructive focus:text-destructive focus:bg-destructive/10"
                onClick={handleSignOut}
              >
                <LogOut className="w-4 h-4 mr-3" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button 
            size="sm" 
            onClick={() => navigate('/auth')}
            className="rounded-xl px-5 h-9 font-medium bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 glow-subtle hover:glow-primary transition-all duration-500"
          >
            Get Started
          </Button>
        )}
      </div>
    </header>
  );
}