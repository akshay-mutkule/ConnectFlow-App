/**
 * Lightweight HTML sanitizer for email templates and preview rendering.
 * Strips executable tags, inline event handlers, and unsafe URL schemes.
 */
export function sanitizeEmailHtml(rawHtml: string): string {
  if (!rawHtml) return '';
  return rawHtml
    .replace(/<\s*(script|iframe|object|embed|applet|form|meta|link|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed|applet|form|meta|link|base)[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(?:"\s*(?:javascript|vbscript|data:text\/html)[^"]*"|'\s*(?:javascript|vbscript|data:text\/html)[^']*')/gi, '$1="#"');
}
