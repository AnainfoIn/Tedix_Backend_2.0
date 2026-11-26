import katex from 'katex';
import { contentLines, IMAGE_KEY } from './englishToLatex';

const SEP = '\\\\';

export interface InsertPlan {
  /** Content after the insert. */
  next: string;
  /** Content lines before and after the inserted block (for the preview). */
  before: string;
  after: string;
}

/**
 * Inserts LaTeX content into stored content as whole lines: after the line the cursor is on,
 * at the start when the cursor is at 0, or at the end when there is no cursor.
 */
export function planInsert(current: string, addition: string, cursor: number | null): InsertPlan {
  const value = current.trim();
  const add = addition.trim();
  if (!value) return { next: add, before: '', after: '' };
  // Content written as one environment can't be split into lines.
  if (cursor === null || /\\begin\{/.test(value)) return { next: `${value} ${SEP} ${add}`, before: value, after: '' };

  const offset = current.length - current.trimStart().length;
  const pos = Math.max(0, Math.min(value.length, cursor - offset));
  if (pos === 0) return { next: `${add} ${SEP} ${value}`, before: '', after: value };

  const idx = value.indexOf(SEP, Math.max(0, pos - 1));
  if (idx < 0) return { next: `${value} ${SEP} ${add}`, before: value, after: '' };
  const before = value.slice(0, idx).trimEnd();
  const after = value.slice(idx + SEP.length).trimStart();
  if (!after) return { next: `${before} ${SEP} ${add}`, before, after: '' };
  return { next: `${before} ${SEP} ${add} ${SEP} ${after}`, before, after };
}

export interface LatexProblem {
  line: number;
  text: string;
  message: string;
}

/** KaTeX check of each content line; any problem blocks Insert. */
export function checkLatex(latex: string): LatexProblem[] {
  const problems: LatexProblem[] = [];
  contentLines(latex).forEach((text, i) => {
    if (IMAGE_KEY.test(text)) return;
    try {
      katex.renderToString(text, { throwOnError: true, displayMode: false, strict: 'ignore' });
    } catch (e) {
      problems.push({ line: i + 1, text, message: (e as Error).message.replace(/^KaTeX parse error: /, '') });
    }
  });
  if (/\$/.test(latex.replace(/\\\$/g, ''))) {
    problems.push({ line: 0, text: '$', message: 'Remove the $ signs: the whole content is already maths, put words in \\text{...}.' });
  }
  return problems;
}
