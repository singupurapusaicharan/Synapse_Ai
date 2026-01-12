import { useRef, useEffect, useMemo, useState } from 'react';
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

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Messages Area */}
      <ScrollArea
        className="flex-1"
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
        <div className="p-4 lg:p-8 space-y-6 min-h-full max-w-4xl mx-auto">
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
                onEdit={(msg) => {
                  setDraft(msg.content);
                  requestAnimationFrame(() => {
                    inputRef.current?.focus();
                  });
                }}
              />
            ))
          )}

          {isLoading && <TypingIndicator />}
        </div>
      </ScrollArea>

      {/* Input */}
      <MessageInput
        onSend={(content) => {
          onSendMessage(content);
          setDraft('');
        }}
        disabled={isLoading || !hasSources}
        value={draft}
        onValueChange={setDraft}
        textareaRef={inputRef}
        userInitial={userInitial}
      />
    </div>
  );
}

function EmptyStateNoSources({ onNavigateToSources }: { onNavigateToSources?: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-4 py-20">
      <div className="relative mb-8 animate-float">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary via-primary/80 to-accent flex items-center justify-center glow-primary">
          <Database className="w-9 h-9 text-primary-foreground" />
        </div>
      </div>
      
      <h2 className="text-2xl font-semibold mb-3 animate-in">
        Connect Gmail/Drive to start asking questions
      </h2>
      <p className="text-muted-foreground text-sm max-w-md mb-10 animate-in-delayed">
        Connect your data sources to enable semantic search across your emails, documents, and notes.
      </p>
      
      {onNavigateToSources && (
        <Button
          size="lg"
          onClick={onNavigateToSources}
          className="rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 glow-subtle hover:glow-primary transition-all duration-500 group"
        >
          Go to Sources
          <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
        </Button>
      )}
    </div>
  );
}

function EmptyStateWithSources() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-4 py-20">
      <div className="relative mb-8 animate-float">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary via-primary/80 to-accent flex items-center justify-center glow-primary">
          <Sparkles className="w-9 h-9 text-primary-foreground" />
        </div>
      </div>
      
      <h2 className="text-2xl font-semibold mb-3 animate-in">
        How can I help you today?
      </h2>
      <p className="text-muted-foreground text-sm max-w-md mb-10 animate-in-delayed">
        Ask me anything about your emails, documents, and notes. 
        I'll search across all your connected sources.
      </p>
      
      <div className="flex flex-wrap justify-center gap-3 max-w-xl">
        {[
          { icon: MessageCircle, text: 'What meetings do I have this week?' },
          { icon: MessageCircle, text: 'Find the project proposal from last month' },
          { icon: MessageCircle, text: 'Summarize recent Slack discussions' },
        ].map((suggestion, i) => (
          <button
            key={i}
            className="flex items-center gap-2 px-4 py-2.5 text-sm rounded-xl bg-secondary/40 hover:bg-secondary/60 border border-border/40 hover:border-primary/30 transition-all duration-300 hover:glow-subtle group"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <suggestion.icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="text-muted-foreground group-hover:text-foreground transition-colors">
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