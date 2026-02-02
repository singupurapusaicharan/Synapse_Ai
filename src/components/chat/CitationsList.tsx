import { Citation, SourceType } from '@/types';
import { Mail, FolderOpen, MessageSquare, FileText, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { buildGmailDeepLinkUrl, buildGmailInboxUrl } from '@/utils/gmail';

interface CitationsListProps {
  citations: Citation[];
  compact?: boolean;
}

const sourceIcons: Record<SourceType | 'unknown', React.ElementType> = {
  gmail: Mail,
  drive: FolderOpen,
  slack: MessageSquare,
  notion: FileText,
  unknown: FileText,
};

const sourceColors: Record<SourceType | 'unknown', string> = {
  gmail: 'text-red-400 bg-red-400/10',
  drive: 'text-yellow-400 bg-yellow-400/10',
  slack: 'text-purple-400 bg-purple-400/10',
  notion: 'text-foreground bg-foreground/10',
  unknown: 'text-muted-foreground bg-muted/10',
};

export function CitationsList({ citations, compact = false }: CitationsListProps) {
  const { toast } = useToast();

  // Detect if user is on mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (citations.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-1.5', compact ? 'mt-1' : 'mt-2')}>
      {citations.map((citation) => {
        const source = citation.source || 'unknown';
        const Icon = sourceIcons[source] || sourceIcons.unknown;
        const colorClass = sourceColors[source] || sourceColors.unknown;

        // Gmail: SIMPLE SOLUTION - Just open Gmail inbox on mobile
        // Gmail mobile deep linking is unreliable, so we'll open inbox
        // and show email details in a tooltip/preview
        if (source === 'gmail') {
          let finalLink = citation.url && citation.url !== '#' ? citation.url : null;
          
          // MOBILE: Just open Gmail inbox - deep linking doesn't work reliably
          if (isMobile) {
            // Simple inbox URL - always works
            if (citation.accountEmail) {
              finalLink = `https://mail.google.com/mail/u/0/?authuser=${encodeURIComponent(citation.accountEmail)}`;
            } else {
              finalLink = `https://mail.google.com/mail/u/0/`;
            }
            
            console.log('[Citation Mobile] Opening Gmail inbox (deep linking unreliable)');
          }
          
          const fallbackUrl = buildGmailInboxUrl(citation.accountEmail);

          const handleClick = (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const targetUrl = finalLink || fallbackUrl;
            
            // On mobile, show email details in toast before opening Gmail
            if (isMobile && citation.subject) {
              toast({
                title: citation.subject,
                description: `From: ${citation.fromName || 'Unknown'}\nDate: ${citation.dateISO || 'Unknown'}\n\nOpening Gmail inbox - search for this subject to find the email.`,
                duration: 8000,
              });
            }
            
            console.log('[Citation Click] Mobile:', isMobile, 'Opening:', targetUrl);
            
            // Open Gmail
            if (isMobile) {
              window.location.href = targetUrl;
            } else {
              window.open(targetUrl, '_blank', 'noopener,noreferrer');
            }
          };

          return (
            <a
              key={citation.id}
              href={finalLink || fallbackUrl}
              onClick={handleClick}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs',
                'bg-secondary/50 hover:bg-secondary border border-border/50',
                'transition-all duration-200 hover:border-primary/30 group cursor-pointer'
              )}
            >
              <span className={cn('p-0.5 rounded', colorClass)}>
                <Icon className="w-3 h-3" />
              </span>
              <span className="max-w-[120px] truncate text-muted-foreground group-hover:text-foreground transition-colors">
                {citation.title}
              </span>
              <ExternalLink className="w-2.5 h-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          );
        }

        // Non-Gmail: only render as link if URL exists
        if (citation.url && citation.url !== '#') {
          return (
            <a
              key={citation.id}
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs',
                'bg-secondary/50 hover:bg-secondary border border-border/50',
                'transition-all duration-200 hover:border-primary/30 group cursor-pointer'
              )}
            >
              <span className={cn('p-0.5 rounded', colorClass)}>
                <Icon className="w-3 h-3" />
              </span>
              <span className="max-w-[120px] truncate text-muted-foreground group-hover:text-foreground transition-colors">
                {citation.title}
              </span>
              <ExternalLink className="w-2.5 h-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          );
        }

        // Render as non-clickable badge if no URL
        return (
          <div
            key={citation.id}
            className={cn(
              'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs',
              'bg-secondary/50 border border-border/50'
            )}
          >
            <span className={cn('p-0.5 rounded', colorClass)}>
              <Icon className="w-3 h-3" />
            </span>
            <span className="max-w-[120px] truncate text-muted-foreground">
              {citation.title}
            </span>
          </div>
        );
      })}
    </div>
  );
}
