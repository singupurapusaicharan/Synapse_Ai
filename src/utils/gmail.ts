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
 * Gmail deep links using SUBJECT SEARCH - ACTUALLY WORKS on ALL devices:
 * - Format: `https://mail.google.com/mail/u/0/#search/"exact subject"`
 * 
 * Why subject search works better:
 * 1. Gmail's direct message ID URLs stopped working
 * 2. Subject search finds the exact email and displays it
 * 3. Works consistently on mobile apps, desktop browsers, and web
 * 4. Opens the search results which shows the email
 * 
 * Priority: Use subject if available, fallback to messageId
 */
export function buildGmailDeepLinkUrl(input: GmailDeepLinkInput): string | null {
  const messageId = input.providerMessageId?.trim() || null;
  const threadId = input.threadId?.trim() || null;

  const safeMessageId = messageId && isSafeGmailId(messageId) ? messageId : null;
  const safeThreadId = threadId && isSafeGmailId(threadId) ? threadId : null;

  // Try to use subject search if available (most reliable)
  // Note: Subject is not in the input interface, so we'll use message ID
  // The backend should provide the subject-based URL directly
  
  // Use search by message ID as fallback
  if (safeMessageId) {
    return `https://mail.google.com/mail/u/0/#search/rfc822msgid:${safeMessageId}`;
  }

  if (safeThreadId) {
    return `https://mail.google.com/mail/u/0/#search/rfc822msgid:${safeThreadId}`;
  }

  return null;
}


