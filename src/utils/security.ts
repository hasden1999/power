/**
 * src/utils/security.ts
 * Small, dependency-free helpers for safe HTML rendering and CSV export.
 * User-provided values must never be interpolated into innerHTML without escaping.
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape a value before embedding it inside HTML text or a quoted attribute. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

/**
 * Neutralise CSV formula injection (Excel / LibreOffice) while keeping the
 * original value readable for normal cells.
 */
export function safeCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** Quote a CSV cell and escape embedded quotes. */
export function csvCell(value: unknown): string {
  return `"${safeCsvCell(value).replace(/"/g, '""')}"`;
}

/**
 * Constant-time comparison for short hex/base64 strings. Used for password
 * hash comparison so a local attacker cannot learn the hash through timing.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
