import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Message } from '@/types';
import { ChatMessage } from './ChatMessage';
import { MessageInput } from './MessageInput';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, MessageCircle, Database, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatPanelProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isLoading?: boolean;
  hasSources?: boolean;
  userEmail?: string;
  onNewChat?: () => void;
  onNavigateToSources?: () => void;
}

export function ChatPanel({ 
  messages, 
  onSendMessage, 
  isLoading, 
  hasSources = false,
  userEmail,
  onNewChat,
  onNavigateToSources 
}: ChatPanelProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const bottomThresholdPx = 160;
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const userInitial = (userEmail?.trim()?.[0] || 'U').toUpperCase();

  const lastUserMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].id;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    // Only auto-scroll if user is already near the bottom (prevents "fighting" while reading older messages).
    if (!isNearBottomRef.current) return;

    // Defer until after layout so scrollHeight is correct.
    requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    });
  }, [messages]);

  const handleEdit = useCallback((msg: Message) => {
    setDraft(msg.content);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  return (
    <div className="flex-1 flex flex-col min-w-0 w-full min-h-0 h-full overflow-hidden">
      {/* Messages Area */}
      <ScrollArea
        className="flex-1 min-h-0"
        viewportRef={viewportRef}
        viewportClassName="smooth-scroll"
        viewportProps={{
          onScroll: (e) => {
            const el = e.currentTarget;
            const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            isNearBottomRef.current = distanceFromBottom <= bottomThresholdPx;
          },
        }}
      >
        <MessagesList
          messages={messages}
          hasSources={hasSources}
          isLoading={!!isLoading}
          lastUserMessageId={lastUserMessageId}
          userInitial={userInitial}
          onEdit={handleEdit}
          onNavigateToSources={onNavigateToSources}
        />
      </ScrollArea>

      {/* Input - Fixed at bottom */}
      <div className="flex-shrink-0 border-t border-border/30 bg-background">
        <MessageInput
          onSend={(content) => {
            onSendMessage(content);
            setDraft('');
          }}
          disabled={isLoading || !hasSources}
          value={draft}
          onValueChange={setDraft}
          textareaRef={inputRef}
        />
      </div>
    </div>
  );
}

const MessagesList = memo(function MessagesList({
  messages,
  hasSources,
  isLoading,
  lastUserMessageId,
  userInitial,
  onEdit,
  onNavigateToSources,
}: {
  messages: Message[];
  hasSources: boolean;
  isLoading: boolean;
  lastUserMessageId: string | null;
  userInitial: string;
  onEdit: (msg: Message) => void;
  onNavigateToSources?: () => void;
}) {
  return (
    <div className="p-3 sm:p-4 lg:p-8 space-y-4 sm:space-y-6 min-h-full max-w-4xl mx-auto">
      {messages.length === 0 ? (
        hasSources ? (
          <EmptyStateWithSources />
        ) : (
          <EmptyStateNoSources onNavigateToSources={onNavigateToSources} />
        )
      ) : (
        messages.map((message, index) => (
          <ChatMessage
            key={message.id}
            message={message}
            isLast={index === messages.length - 1}
            canEdit={!isLoading && message.role === 'user' && message.id === lastUserMessageId}
            userInitial={userInitial}
            onEdit={onEdit}
          />
        ))
      )}

      {isLoading && <TypingIndicator />}
    </div>
  );
});

function EmptyStateNoSources({ onNavigateToSources }: { onNavigateToSources?: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-4 py-12 sm:py-20">
      {/* Icon with glow */}
      <div className="relative mb-8 animate-float">
        <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full"></div>
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-accent flex items-center justify-center shadow-2xl">
          <Database className="w-10 h-10 sm:w-12 sm:h-12 text-primary-foreground" />
        </div>
      </div>
      
      {/* Headline */}
      <h2 className="text-2xl sm:text-3xl font-bold mb-3 animate-in">
        Connect Your Data Sources
      </h2>
      <p className="text-muted-foreground text-sm sm:text-base max-w-md mb-10 animate-in-delayed leading-relaxed px-4">
        Connect Gmail or Google Drive to start searching across your emails and documents with AI.
      </p>
      
      {/* CTA Button */}
      {onNavigateToSources && (
        <Button
          size="lg"
          onClick={onNavigateToSources}
          className="h-12 sm:h-14 px-8 sm:px-10 text-base font-semibold rounded-2xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg hover:shadow-xl transition-all duration-300 group"
        >
          Connect Sources
          <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
        </Button>
      )}
    </div>
  );
}

function EmptyStateWithSources() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-4 py-12 sm:py-20">
      {/* Icon with glow */}
      <div className="relative mb-8 animate-float">
        <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full"></div>
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-accent flex items-center justify-center shadow-2xl">
          <Sparkles className="w-10 h-10 sm:w-12 sm:h-12 text-primary-foreground" />
        </div>
      </div>
      
      {/* Headline */}
      <h2 className="text-2xl sm:text-3xl font-bold mb-3 animate-in">
        What can I help you find?
      </h2>
      <p className="text-muted-foreground text-sm sm:text-base max-w-md mb-10 animate-in-delayed leading-relaxed px-4">
        Ask questions in natural language. I'll search across all your connected sources instantly.
      </p>
      
      {/* Example Queries - Professional FAANG Style */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full px-4">
        {[
          { icon: MessageCircle, text: 'Emails from my manager this week' },
          { icon: MessageCircle, text: 'Find the Q4 budget document' },
          { icon: MessageCircle, text: 'Meeting notes about the project' },
          { icon: MessageCircle, text: 'Latest updates from the team' },
        ].map((suggestion, i) => (
          <button
            key={i}
            className="group flex items-start gap-3 p-4 text-left rounded-2xl bg-card/40 border border-border/40 hover:border-primary/50 hover:bg-card/60 backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/5 animate-in"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 group-hover:border-primary/30 transition-all">
              <suggestion.icon className="w-5 h-5 text-primary/80 group-hover:text-primary transition-colors" />
            </div>
            <span className="text-sm text-muted-foreground/80 group-hover:text-foreground transition-colors pt-2 leading-relaxed">
              {suggestion.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-4 animate-fade-up">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-subtle animate-pulse-slow">
        <Sparkles className="w-4 h-4 text-primary-foreground" />
      </div>
      <div className="message-ai flex items-center gap-2 px-5 py-4">
        <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}