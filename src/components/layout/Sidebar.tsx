import { useState } from 'react';
import {
  MessageSquare,
  Database,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path: string;
}

const sidebarItems: SidebarItem[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare, path: '/' },
  { id: 'sources', label: 'Sources', icon: Database, path: '/sources' },
  { id: 'history', label: 'History', icon: History, path: '/history' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
];

interface SidebarProps {
  activePath?: string;
  onNavigate?: (path: string) => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onNewChat?: () => void;
}

export function Sidebar({
  activePath = '/',
  onNavigate,
  collapsed = false,
  onCollapsedChange,
  onNewChat,
}: SidebarProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  return (
    <aside
      className={cn(
        'h-full bg-sidebar/50 backdrop-blur-xl border-r border-border/30 flex flex-col transition-all duration-500 ease-out',
        collapsed ? 'w-[72px]' : 'w-56'
      )}
    >
      {/* New Chat Button - Only show on Chat page */}
      {activePath === '/' && onNewChat && (
        <div className="p-3 border-b border-border/30">
          <Button
            onClick={onNewChat}
            className={cn(
              'w-full h-10 bg-primary/10 border border-primary/20 hover:bg-primary/15 hover:border-primary/30 text-primary rounded-lg font-medium transition-all duration-300 hover:shadow-[0_0_20px_-8px_hsl(var(--primary)/0.2)]',
              collapsed && 'px-0 justify-center'
            )}
            size="sm"
          >
            <Plus className={cn('w-4 h-4', !collapsed && 'mr-2')} />
            {!collapsed && 'New Chat'}
          </Button>
        </div>
      )}

      {/* Navigation Items */}
      <nav className="flex-1 p-3 space-y-1.5 pt-6">
        {sidebarItems.map((item) => {
          const isActive = activePath === item.path;
          const isHovered = hoveredItem === item.id;
          const Icon = item.icon;

          const button = (
            <Button
              key={item.id}
              variant="ghost"
              onClick={() => onNavigate?.(item.path)}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
              className={cn(
                'w-full justify-start gap-3 h-11 px-3.5 relative group transition-all duration-300 rounded-xl',
                isActive
                  ? 'bg-gradient-to-r from-primary/15 to-primary/5 text-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                collapsed && 'justify-center px-0'
              )}
            >
              {/* Active indicator */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary rounded-r-full" />
              )}

              <Icon
                className={cn(
                  'w-[18px] h-[18px] shrink-0 transition-all duration-300 relative z-10',
                  isActive && 'text-primary',
                  isHovered && !isActive && 'scale-110'
                )}
              />
              {!collapsed && (
                <span className={cn(
                  'text-sm font-medium relative z-10 transition-colors duration-300',
                  isActive && 'text-foreground'
                )}>
                  {item.label}
                </span>
              )}
            </Button>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.id} delayDuration={0}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent 
                  side="right" 
                  className="bg-popover/95 backdrop-blur-xl border-border/50 rounded-lg"
                >
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          }

          return button;
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-3 border-t border-border/30">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onCollapsedChange?.(!collapsed)}
          className={cn(
            'w-full h-9 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 rounded-lg transition-all duration-300',
            collapsed && 'justify-center'
          )}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4 mr-2" />
              <span className="text-xs font-medium">Collapse</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
