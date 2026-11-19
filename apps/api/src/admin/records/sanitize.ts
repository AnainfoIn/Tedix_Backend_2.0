/**
 * Port of the ActiveAdmin controllers' `sanitize_html`: keeps only simple formatting tags
 * (p br strong em b i u ul ol li span) with a style attribute, and drops everything else.
 */
const ALLOWED = new Set(['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li', 'span']);

export function sanitizeHtml(input: string): string {
  if (!input) return input;
  return input
    .replace(/<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (tag, name: string, attrs: string) => {
      const lower = name.toLowerCase();
      if (!ALLOWED.has(lower)) return '';
      if (tag.startsWith('</')) return `</${lower}>`;
      const style = /\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
      const css = style ? (style[2] ?? style[3] ?? '') : '';
      const safe = css && !/expression|url\s*\(|javascript:/i.test(css) ? ` style="${css.replace(/"/g, '&quot;')}"` : '';
      return `<${lower}${safe}${/\/\s*$/.test(attrs) ? ' /' : ''}>`;
    });
}
