import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material';
import katex from 'katex';
import { useMemo, useRef, useState } from 'react';

/** Palette groups: [label shown on the button, LaTeX inserted; `#` marks where the cursor lands]. */
const GROUPS: Array<{ name: string; items: Array<[string, string]> }> = [
  { name: 'Basic', items: [['a/b', '\\frac{#}{}'], ['√x', '\\sqrt{#}'], ['x²', '^{2}'], ['xⁿ', '^{#}'], ['xₙ', '_{#}'], ['±', '\\pm '], ['×', '\\times '], ['·', '\\cdot '], ['÷', '\\div '], ['≠', '\\neq '], ['≤', '\\leq '], ['≥', '\\geq '], ['≈', '\\approx '], ['π', '\\pi '], ['∞', '\\infty '], ['°', '^{\\circ}'], ['%', '\\%']] },
  { name: 'Fractions & roots', items: [['a/b', '\\frac{#}{}'], ['a b/c', '#\\frac{}{}'], ['√x', '\\sqrt{#}'], ['∛x', '\\sqrt[3]{#}'], ['ⁿ√x', '\\sqrt[#]{}'], ['(□)', '\\left(#\\right)'], ['|□|', '\\left|#\\right|']] },
  { name: 'Powers & indices', items: [['x²', '^{2}'], ['x³', '^{3}'], ['xⁿ', '^{#}'], ['xₙ', '_{#}'], ['10ⁿ', '10^{#}'], ['eˣ', 'e^{#}']] },
  { name: 'Relations', items: [['=', '='], ['≠', '\\neq '], ['<', '<'], ['>', '>'], ['≤', '\\leq '], ['≥', '\\geq '], ['≈', '\\approx '], ['≡', '\\equiv '], ['∼', '\\sim '], ['∝', '\\propto ']] },
  { name: 'Sets & logic', items: [['∈', '\\in '], ['∉', '\\notin '], ['⊂', '\\subset '], ['∪', '\\cup '], ['∩', '\\cap '], ['∅', '\\emptyset '], ['ℕ', '\\mathbb{N}'], ['ℤ', '\\mathbb{Z}'], ['ℚ', '\\mathbb{Q}'], ['ℝ', '\\mathbb{R}'], ['⇒', '\\Rightarrow '], ['⇔', '\\Leftrightarrow '], ['∀', '\\forall '], ['∃', '\\exists ']] },
  { name: 'Logs & trig', items: [['log', '\\log_{#}'], ['lg', '\\lg '], ['ln', '\\ln '], ['sin', '\\sin '], ['cos', '\\cos '], ['tan', '\\tan '], ['∠', '\\angle '], ['△', '\\triangle ']] },
  { name: 'Greek', items: [['α', '\\alpha '], ['β', '\\beta '], ['γ', '\\gamma '], ['δ', '\\delta '], ['Δ', '\\Delta '], ['θ', '\\theta '], ['λ', '\\lambda '], ['μ', '\\mu '], ['σ', '\\sigma '], ['φ', '\\varphi '], ['ω', '\\omega '], ['Ω', '\\Omega ']] },
];

const TEMPLATES: Array<[string, string]> = [
  ['Fraction', '\\frac{1}{2}'],
  ['Mixed number', '2\\frac{1}{3}'],
  ['Square root', '\\sqrt{16} = 4'],
  ['Power', '2^{3} = 8'],
  ['System of 2 equations', '\\begin{cases} x + y = 5 \\\\ x - y = 1 \\end{cases}'],
  ['2×2 matrix', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'],
  ['Interval', 'x \\in [0, 1)'],
  ['Logarithm', '\\log_{2} 8 = 3'],
];

/** "Insert formula": palette, templates, the LaTeX and a live preview; a formula that doesn't render can't be inserted. */
export function FormulaDialog(props: { open: boolean; initial?: string; onClose: () => void; onInsert: (latex: string) => void }) {
  const [group, setGroup] = useState(0);
  const [latex, setLatex] = useState(props.initial ?? '');
  const box = useRef<HTMLTextAreaElement>(null);

  const result = useMemo(() => {
    if (!latex.trim()) return null;
    try {
      return { html: katex.renderToString(latex, { throwOnError: true, displayMode: true, strict: 'ignore' }) };
    } catch (e) {
      return { error: (e as Error).message.replace(/^KaTeX parse error: /, '') };
    }
  }, [latex]);

  const put = (snippet: string) => {
    const el = box.current;
    const start = el?.selectionStart ?? latex.length;
    const end = el?.selectionEnd ?? latex.length;
    const selected = latex.slice(start, end);
    const at = snippet.indexOf('#');
    const text = snippet.replace('#', selected);
    const next = latex.slice(0, start) + text + latex.slice(end);
    setLatex(next);
    const caret = start + (at >= 0 ? at + selected.length : text.length);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(caret, caret); });
  };

  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="md" fullWidth aria-labelledby="formula-title">
      <DialogTitle id="formula-title">Insert formula</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Tabs value={group} onChange={(_, v) => setGroup(v)} variant="scrollable" scrollButtons="auto" aria-label="Symbol groups">
            {GROUPS.map((g) => <Tab key={g.name} label={g.name} sx={{ textTransform: 'none', minHeight: 40 }} />)}
          </Tabs>
          <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.75}>
            {GROUPS[group].items.map(([label, snippet]) => (
              <Tooltip key={label + snippet} title={snippet.replace('#', '')}>
                <Button variant="outlined" size="small" onClick={() => put(snippet)} sx={{ minWidth: 44, textTransform: 'none', fontFamily: 'serif', fontSize: 16 }}>{label}</Button>
              </Tooltip>
            ))}
          </Stack>
          <Box>
            <Typography variant="caption" color="text.secondary">Templates</Typography>
            <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.75} sx={{ mt: 0.5 }}>
              {TEMPLATES.map(([name, t]) => <Button key={name} size="small" onClick={() => put(t)} sx={{ textTransform: 'none' }}>{name}</Button>)}
            </Stack>
          </Box>
          <TextField
            inputRef={box} label="LaTeX" value={latex} onChange={(e) => setLatex(e.target.value)} multiline minRows={2} fullWidth autoFocus
            slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } } }}
          />
          <Box>
            <Typography variant="caption" color="text.secondary">Live preview</Typography>
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2, minHeight: 64, fontSize: 20, overflowX: 'auto' }}>
              {result && 'html' in result && <Box dangerouslySetInnerHTML={{ __html: result.html! }} />}
              {!result && <Typography variant="body2" color="text.secondary">Pick a symbol or type LaTeX.</Typography>}
            </Box>
            {result && 'error' in result && <Alert severity="error" sx={{ mt: 1 }}>{result.error}. The formula is not inserted until it renders.</Alert>}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button variant="contained" disabled={!result || 'error' in result} onClick={() => props.onInsert(latex.trim())}>Insert</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Puts a formula into stored content at the cursor. Content is math mode with words in \text{...}:
 * inside a \text{} group the group is closed around the formula.
 */
export function insertFormula(content: string, cursor: number | null, formula: string): string {
  const pos = cursor ?? content.length;
  // Find whether pos is inside a \text{ ... } group.
  let i = 0;
  while (i < content.length) {
    const start = content.indexOf('\\text{', i);
    if (start < 0 || start >= pos) break;
    let depth = 1;
    let j = start + 6;
    for (; j < content.length && depth > 0; j++) {
      if (content[j] === '\\') { j++; continue; }
      if (content[j] === '{') depth++;
      else if (content[j] === '}') depth--;
    }
    if (pos > start + 5 && pos < j) {
      return `${content.slice(0, pos)}}${formula}\\text{${content.slice(pos)}`.replace(/\\text\{\}/g, '');
    }
    i = j;
  }
  const before = content.slice(0, pos);
  const after = content.slice(pos);
  const pad = (s: string) => (s && !/\s$/.test(s) ? ' ' : '');
  return `${before}${pad(before)}${formula}${after && !/^\s/.test(after) ? ' ' : ''}${after}`;
}
