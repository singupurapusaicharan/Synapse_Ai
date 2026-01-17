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
 * - Format: `https://mail.google.com/mail/u/0/#inbox/{messageId}`
 * 
 * Using /u/0/ is the most reliable approach because:
 * 1. Gmail automatically redirects to the correct account if user is signed in
 * 2. Works consistently on mobile apps, desktop browsers, and web
 * 3. More reliable than ?authuser= which can fail on mobile devices
 * 4. Simpler than trying to guess account index
 * 
 * Priority: messageId > threadId (message is more specific)
 */
export function buildGmailDeepLinkUrl(input: GmailDeepLinkInput): string | null {
  const messageId = input.providerMessageId?.trim() || null;
  const threadId = input.threadId?.trim() || null;

  const safeMessageId = messageId && isSafeGmailId(messageId) ? messageId : null;
  const safeThreadId = threadId && isSafeGmailId(threadId) ? threadId : null;

  // Use universal format with /u/0/ - works on all devices
  if (safeMessageId) {
    return `https://mail.google.com/mail/u/0/#inbox/${safeMessageId}`;
  }

  if (safeThreadId) {
    return `https://mail.google.com/mail/u/0/#inbox/${safeThreadId}`;
  }

  return null;
}


