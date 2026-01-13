import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MessageInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
}

export function MessageInput({
  onSend,
  disabled = false,
  placeholder = 'Ask anything about your data...',
  value: controlledValue,
  onValueChange,
  textareaRef: textareaRefProp,
}: MessageInputProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState('');
  const innerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const value = controlledValue ?? uncontrolledValue;

  const setValue = (next: string) => {
    if (onValueChange) onValueChange(next);
    if (controlledValue === undefined) setUncontrolledValue(next);
  };

  const setMergedRef = (el: HTMLTextAreaElement | null) => {
    innerTextareaRef.current = el;
    if (!textareaRefProp) return;
    if (typeof textareaRefProp === 'function') {
      textareaRefProp(el);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (textareaRefProp as any).current = el;
    }
  };

  useEffect(() => {
    const textarea = innerTextareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
    }
  }, [value]);

  const handleSubmit = () => {
    if (value.trim() && !disabled) {
      onSend(value.trim());
      setValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-background/40 backdrop-blur-xl border-t border-border/30">
      <div className="max-w-4xl mx-auto">
        <div
          className={cn(
            'flex items-end gap-3 p-4 rounded-2xl',
            'bg-secondary/40 border border-border/40',
            'focus-within:border-primary/40 focus-within:glow-subtle',
            'transition-all duration-500'
          )}
        >
          <textarea
            ref={setMergedRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              'flex-1 bg-transparent resize-none outline-none',
              'text-sm placeholder:text-muted-foreground/60',
              'min-h-[28px] max-h-[140px]',
              'disabled:opacity-50'
            )}
          />

          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={!value.trim() || disabled}
            className={cn(
              'shrink-0 w-9 h-9 rounded-xl transition-all duration-500',
              'bg-primary/10 border border-primary/20 hover:bg-primary/15 hover:border-primary/30 text-primary',
              value.trim() && 'shadow-[0_0_15px_-6px_hsl(var(--primary)/0.2)]'
            )}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground/60 text-center mt-3 font-medium">
          Press Enter to send · Shift + Enter for new line
        </p>
      </div>
    </div>
  );
}