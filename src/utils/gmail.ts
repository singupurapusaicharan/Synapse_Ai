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
 * Gmail deep links:
 * - Message: `https://mail.google.com/mail/u/{accountIndex}/#inbox/{messageId}`
 * - Thread:  `https://mail.google.com/mail/u/{accountIndex}/#all/{threadId}`
 *
 * If `accountIndex` is unknown, we use `/u/?authuser=...` to let Google route
 * to the right signed-in account based on `accountEmail`.
 */
export function buildGmailDeepLinkUrl(input: GmailDeepLinkInput): string | null {
  const messageId = input.providerMessageId?.trim() || null;
  const threadId = input.threadId?.trim() || null;

  const safeMessageId = messageId && isSafeGmailId(messageId) ? messageId : null;
  const safeThreadId = threadId && isSafeGmailId(threadId) ? threadId : null;

  const email = input.accountEmail ? normalizeEmail(input.accountEmail) : null;

  let base: string;
  if (typeof input.accountIndex === 'number' && Number.isInteger(input.accountIndex) && input.accountIndex >= 0) {
    base = `https://mail.google.com/mail/u/${input.accountIndex}/`;
  } else if (email) {
    // Most reliable multi-account routing without guessing accountIndex.
    base = `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}`;
  } else {
    base = 'https://mail.google.com/mail/';
  }

  if (safeThreadId) {
    return `${base}#all/${safeThreadId}`;
  }

  if (safeMessageId) {
    return `${base}#inbox/${safeMessageId}`;
  }

  return null;
}

