/**
 * Turns plain English (with spoken or typed maths) into the LaTeX the app's content fields use:
 * one line per input line joined with `\\`, prose wrapped in \text{...}, maths written out,
 * and image placeholders (tedimage...) left as they are.
 *
 *   "The area is pi r squared"        → \text{The area is }\pi r^{2}
 *   "square root of 16 equals 4"      → \sqrt{16}=4
 *   "3 over 4 plus 1/2"               → \frac{3}{4}+\frac{1}{2}
 */
export const IMAGE_KEY = /^tedimage\w*$/i;

const GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu', 'pi', 'sigma', 'phi', 'omega'];

/** Phrase → LaTeX, longest phrases first so "less than or equal to" wins over "less than". */
const PHRASES: Array<[RegExp, string]> = [
  [/\bplus or minus\b/gi, ' \\pm '],
  [/\b(?:is )?less than or equal to\b/gi, ' \\leq '],
  [/\b(?:is )?greater than or equal to\b/gi, ' \\geq '],
  [/\b(?:is )?not equal to\b/gi, ' \\neq '],
  [/\b(?:is )?approximately equal to\b|\bapproximately\b/gi, ' \\approx '],
  [/\b(?:is )?less than\b/gi, ' < '],
  [/\b(?:is )?greater than\b/gi, ' > '],
  [/\b(?:is )?equal to\b|\bequals\b/gi, ' = '],
  [/\bmultiplied by\b|\btimes\b/gi, ' \\times '],
  [/\bplus\b/gi, ' + '],
  [/\bminus\b/gi, ' - '],
  [/\binfinity\b/gi, ' \\infty '],
  [/\bdegrees?\b/gi, '^{\\circ}'],
  [/\bpercent\b/gi, '\\%'],
  [/<=|≤/g, ' \\leq '],
  [/>=|≥/g, ' \\geq '],
  [/!=|≠/g, ' \\neq '],
  [/[×*]/g, ' \\times '],
  [/÷/g, ' \\div '],
  [/±/g, ' \\pm '],
  [/π/g, ' \\pi '],
  [/√\s*(\S+)/g, ' \\sqrt{$1} '],
  [/°/g, '^{\\circ}'],
];

/** A math operand: number, single variable, LaTeX command group or bracketed expression. */
const OPERAND = String.raw`(?:\d+(?:[.,]\d+)?|[a-zA-Z]|\\[a-zA-Z]+(?:\{[^{}]*\})*|\([^()]*\)|\{[^{}]*\})`;

const STRUCTURES: Array<[RegExp, string]> = [
  [new RegExp(String.raw`\b(?:the )?(?:square root|sqrt) of\s+(${OPERAND})`, 'gi'), '\\sqrt{$1}'],
  [new RegExp(String.raw`\b(?:the )?cube root of\s+(${OPERAND})`, 'gi'), '\\sqrt[3]{$1}'],
  [new RegExp(String.raw`(${OPERAND})\s+(?:to the power of|raised to(?: the power of)?)\s+(${OPERAND})`, 'gi'), '$1^{$2}'],
  [new RegExp(String.raw`(${OPERAND})\s+squared\b`, 'gi'), '$1^{2}'],
  [new RegExp(String.raw`(${OPERAND})\s+cubed\b`, 'gi'), '$1^{3}'],
  [new RegExp(String.raw`(${OPERAND})\s*\^\s*(?!\{)(${OPERAND})`, 'g'), '$1^{$2}'],
  [new RegExp(String.raw`(${OPERAND})\s+(?:over|divided by)\s+(${OPERAND})`, 'gi'), '\\frac{$1}{$2}'],
  [new RegExp(String.raw`(\d+(?:\.\d+)?|[a-zA-Z])\s*/\s*(\d+(?:\.\d+)?|[a-zA-Z])`, 'g'), '\\frac{$1}{$2}'],
];

const MATH_TOKEN = /^(?:\d+(?:[.,]\d+)*(?:[a-zA-Z]|\\?%)?|[-+=<>()[\]^_{}|!]+|\\[a-zA-Z]+.*|.*[\\^_{}].*|[a-zA-Z](?:\^.*)?)$/;
/** Single letters that are almost always words, not variables. */
const WORD_LETTERS = new Set(['a', 'A', 'I']);
const OPERATOR = /^(?:[-+=<>]|\\(?:times|div|pm|leq|geq|neq|approx))$/;

const escapeText = (s: string) => s.replace(/([#$%&_{}])/g, '\\$1').replace(/\\(?![#$%&_{}])/g, '\\textbackslash ');

function lineToLatex(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return '';
  if (IMAGE_KEY.test(trimmed)) return trimmed;

  let s = ` ${trimmed} `;
  for (const g of GREEK) s = s.replace(new RegExp(`\\b${g}\\b`, 'gi'), (m) => ` \\${m[0] === m[0].toUpperCase() && g !== 'pi' ? g[0].toUpperCase() + g.slice(1) : g} `);
  for (const [re, out] of PHRASES) s = s.replace(re, out);
  // Run the structural rules twice so nested forms like "square root of x squared" settle.
  for (let pass = 0; pass < 2; pass++) for (const [re, out] of STRUCTURES) s = s.replace(re, out);

  const tokens = s.trim().split(/\s+/);
  const isMath = (i: number): boolean => {
    const t = tokens[i].replace(/(?<=.)[.,;:?!]+$/, '');
    if (!MATH_TOKEN.test(t)) return false;
    if (WORD_LETTERS.has(t)) return OPERATOR.test(tokens[i - 1] ?? '') || OPERATOR.test(tokens[i + 1] ?? '');
    return true;
  };

  const out: string[] = [];
  let prose: string[] = [];
  const flush = (last: boolean) => {
    if (!prose.length) return;
    const lead = out.length ? ' ' : '';
    const trail = last ? '' : ' ';
    out.push(`\\text{${lead}${escapeText(prose.join(' '))}${trail}}`);
    prose = [];
  };
  tokens.forEach((t, i) => {
    if (IMAGE_KEY.test(t) || !isMath(i)) {
      prose.push(t);
      return;
    }
    flush(false);
    // Punctuation glued to maths (e.g. "4.") stays outside the formula as text.
    const m = /^(.*?)([.,;:?!]+)$/.exec(t);
    if (m && m[1] && !/^\d+$/.test(m[2])) {
      out.push(m[1], `\\text{${m[2]}}`);
    } else {
      out.push(t.replace(/(?<!\\)%/g, '\\%'));
    }
  });
  flush(true);
  return out.join(' ').trim();
}

export function englishToLatex(english: string): string {
  return english
    .replace(/\s*\b(tedimage\w*)\b\s*/gi, '\n$1\n')
    .split(/\r?\n/)
    .map(lineToLatex)
    .filter(Boolean)
    .join(' \\\\ ');
}

/** Splits stored content into its lines (`\\`), unless it uses an environment that needs `\\` itself. */
export function contentLines(latex: string): string[] {
  if (/\\begin\{/.test(latex)) return [latex];
  return latex.split(/\\\\/).map((l) => l.trim()).filter(Boolean);
}
