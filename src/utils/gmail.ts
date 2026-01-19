export type GmailAccountIndex = number;

export interface GmailDeepLinkInput {
  providerMessageId?: string | null;
  threadId?: string | null;
  accountEmail?: string | null;
  /**
   * Optional hint. If provided, generates `/u/{accountIndex}/...` URLs.
   * If omitted, we'll use `/u/?authuser=...` to let Google route to the right signed-in account.
   */
  accountIndex?: GmailAccountIndex | null;
}

function isSafeGmailId(id: string): boolean {
  // Gmail message/thread IDs are typically URL-safe base64-like strings.
  // Guard against unsafe characters to avoid constructing surprising URLs.
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

function normalizeEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return null;
  // Light validation; we don't need perfect RFC compliance here.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

export function buildGmailInboxUrl(accountEmail?: string | null, accountIndex?: GmailAccountIndex | null): string {
  const email = accountEmail ? normalizeEmail(accountEmail) : null;
  if (typeof accountIndex === 'number' && Number.isInteger(accountIndex) && accountIndex >= 0) {
    return `https://mail.google.com/mail/u/${accountIndex}/#inbox`;
  }
  if (email) {
    // Most reliable multi-account routing without guessing accountIndex.
    return `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#inbox`;
  }
  return 'https://mail.google.com/mail/#inbox';
}

/**
 * Gmail deep links that work universally on ALL devices (mobile, desktop, web):
 * 
 * Uses the most reliable Gmail URL format that works across all platforms:
 * - Format: `https://mail.google.com/mail/u/0/#all/{messageId}`
 * 
 * Using #all/ instead of #inbox/ because:
 * 1. #all/ searches across ALL folders (inbox, sent, archive, etc.)
 * 2. More reliable for finding the specific message
 * 3. Works on mobile browsers and desktop
 * 4. Gmail app on mobile will intercept and open correctly
 * 
 * Priority: messageId > threadId (message is more specific)
 */
export function buildGmailDeepLinkUrl(input: GmailDeepLinkInput): string | null {
  const messageId = input.providerMessageId?.trim() || null;
  const threadId = input.threadId?.trim() || null;

  const safeMessageId = messageId && isSafeGmailId(messageId) ? messageId : null;
  const safeThreadId = threadId && isSafeGmailId(threadId) ? threadId : null;

  // Use #inbox/ - standard location for messages
  if (safeMessageId) {
    return `https://mail.google.com/mail/u/0/#inbox/${safeMessageId}`;
  }

  if (safeThreadId) {
    return `https://mail.google.com/mail/u/0/#inbox/${safeThreadId}`;
  }

  return null;
}


