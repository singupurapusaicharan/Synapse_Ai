import { Message } from '@/types';
import { CitationsList } from './CitationsList';
import { cn } from '@/lib/utils';
import { Pencil, Sparkles } from 'lucide-react';
import { memo, useMemo } from 'react';
import { formatChatTime } from '../../utils/time';

interface ChatMessageProps {
  message: Message;
  isLast?: boolean;
  canEdit?: boolean;
  onEdit?: (message: Message) => void;
  userInitial?: string;
}

function ChatMessageComponent({ message, isLast, canEdit = false, onEdit, userInitial }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex gap-4 animate-fade-up',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {/* AI Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-subtle">
          <Sparkles className="w-4 h-4 text-primary-foreground" />
        </div>
      )}

      {/* Message Content */}
      <div
        className={cn(
          'max-w-[80%] lg:max-w-[70%] space-y-3',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        <div
          className={cn(
            'text-sm leading-relaxed relative group',
            isUser
              ? 'message-user text-foreground'
              : 'message-ai'
          )}
        >
          <MessageContent content={message.content} />

          {/* Edit (user messages) */}
          {isUser && canEdit && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(message)}
              className={cn(
                'absolute -top-2 -left-2',
                'opacity-0 group-hover:opacity-100 transition-opacity',
                'w-7 h-7 rounded-lg border border-border/50 bg-background/60 backdrop-blur',
                'flex items-center justify-center hover:border-primary/40'
              )}
              aria-label="Edit message"
              title="Edit & resend"
            >
              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <CitationsList citations={message.citations} />
        )}

        {/* Timestamp */}
        <span className="text-[11px] text-muted-foreground/70 px-1 font-medium">
          {formatTime(message.timestamp)}
        </span>
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-secondary/80 border border-border/50 flex items-center justify-center text-xs font-semibold text-muted-foreground">
          {(userInitial || 'U').slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  const parts = useMemo(() => content.split(/(\*\*.*?\*\*)/g), [content]);

  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      })}
    </span>
  );
}

function formatTime(date: Date): string {
  return formatChatTime(date);
}

// Avoid re-rendering the entire message list on each keystroke in the input.
export const ChatMessage = memo(ChatMessageComponent);