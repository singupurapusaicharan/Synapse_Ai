/**
 * NOTE:
 * We intentionally format dates using the **user's local timezone** (browser/device time).
 * A previous implementation forced all times to IST (Asia/Kolkata), which made chat
 * timestamps incorrect for users in other timezones.
 */

/**
 * Formats a date to a consistent local string format.
 * @param date Input date (can be string, number, or Date object)
 * @returns Formatted date string in "DD MMM YYYY, hh:mm AM/PM" format (localized)
 */
export function formatDateTime(date: string | number | Date): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/**
 * Gets the current timestamp in UTC
 * @returns Current timestamp in ISO format (UTC)
 */
export function getCurrentUTCTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Formats a date for display in chat messages
 * @param date Input date (can be string, number, or Date object)
 * @returns Formatted time string in local "hh:mm AM/PM" format
 */
export function formatChatTime(date: string | number | Date): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/**
 * Formats a relative time (e.g., "2h ago", "3d ago")
 * @param date Input date (can be string, number, or Date object)
 * @returns Relative time string
 */
export function formatRelativeTime(date: string | number | Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years}y ago`;
  if (months > 0) return `${months}mo ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

/**
 * Formats a date for display in the history list
 * @param date Input date (can be string, number, or Date object)
 * @returns Formatted date string (e.g., "Today", "Yesterday", or formatted date)
 */
export function formatHistoryDate(date: string | number | Date): string {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (d.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d);
  }
}
