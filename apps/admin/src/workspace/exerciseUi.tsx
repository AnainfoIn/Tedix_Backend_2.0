import { Box, CircularProgress } from '@mui/material';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { CSSProperties, ReactNode, useMemo, useRef, useState } from 'react';
import { useNotify } from 'react-admin';
import { FormulaDialog, insertFormula } from '../latex/FormulaDialog';
import { contentLines } from '../latex/englishToLatex';
import { convertText } from '../latex/InsertDialog';
import { splitText } from '../latex/LatexInput';

/** Colours of the exercise editor design. */
export const X = {
  text: '#1A1D23', muted: '#5B6270', line: '#E3E6EB', field: '#C5CAD3', blue: '#1F5FD1', blueDark: '#174AA6', blueSoft: '#EAF1FD',
  blueLine: '#C5D6F5', okLine: '#9FD3B1', okBg: '#F3FBF6', red: '#A42A1F', redLine: '#E2A59F', redBg: '#FFFBFA',
  warnLine: '#F3D2A6', warnBg: '#FFF8EF', warnText: '#8A4B00', soft: '#F8F9FB',
};

export type ChipTone = 'Auto' | 'Edited' | 'Reviewed' | 'Missing' | 'Formulas' | 'Outdated' | 'New';
const CHIP: Record<ChipTone, CSSProperties> = {
  Auto: { background: '#EAF1FD', color: '#174AA6' },
  Edited: { background: '#EEE8FB', color: '#5531A8' },
  Reviewed: { background: '#E8F5EC', color: '#1E6B3A' },
  Missing: { background: '#FDECEA', color: '#A42A1F' },
  Formulas: { background: '#F0F2F5', color: '#424242' },
  Outdated: { background: '#FFE0CC', color: '#8A3200' },
  New: { background: '#FDECEA', color: '#A42A1F' },
};

export function StatusChip({ tone, children }: { tone: ChipTone; children?: ReactNode }) {
  return (
    <Box component="span" sx={{ fontSize: 11, px: '8px', py: '1px', borderRadius: 999, fontWeight: 600, whiteSpace: 'nowrap', ...CHIP[tone] }}>
      {children ?? tone}
    </Box>
  );
}

export function LangCode({ children, small }: { children: ReactNode; small?: boolean }) {
  return (
    <Box component="span" sx={{ font: `500 ${small ? 10 : 11}px 'JetBrains Mono', ui-monospace, monospace`, bgcolor: '#ECEFF1', color: '#263238', px: small ? '4px' : '5px', py: '1px', borderRadius: '3px' }}>
      {children}
    </Box>
  );
}

const plain = (s: string) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
/** True when the text holds LaTeX (commands, powers, groups) rather than plain words. */
export const hasLatex = (s: string | null | undefined) => /\\[a-zA-Z]|[\^_]\{?|\\\\/.test(String(s ?? ''));

/** Stored content as students see it: LaTeX through KaTeX (words in \text{} wrap), anything else as plain text. */
export function Shown({ value, size = 15, block }: { value: string | null | undefined; size?: number; block?: boolean }) {
  const html = useMemo(() => {
    const v = plain(String(value ?? '')).trim();
    if (!v) return '';
    if (!hasLatex(v)) return esc(v).replace(/\n/g, '<br>');
    return contentLines(v)
      .map((line) => {
        const parts = splitText(line);
        try {
          if (!parts) return katex.renderToString(line, { throwOnError: true, strict: 'ignore' });
          return parts.map((p) => (p.text !== undefined ? esc(p.text.replace(/\\ /g, ' ').replace(/~/g, ' ')) : katex.renderToString(p.math!, { throwOnError: true, strict: 'ignore' }))).join('');
        } catch {
          return `<code>${esc(line)}</code>`;
        }
      })
      .join('<br>');
  }, [value]);
  return (
    <Box component={block ? 'div' : 'span'} sx={{ fontSize: size, lineHeight: 1.6, wordBreak: 'break-word', '& .katex': { fontSize: '1.05em' }, '& code': { fontSize: 12, color: X.red } }}
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const toolBtn: CSSProperties = { height: 28, border: `1px solid ${X.line}`, borderRadius: 6, background: '#fff', fontSize: 12, color: X.muted, padding: '0 8px', cursor: 'pointer' };

/**
 * One content input of the design: text box with "Σ" (insert formula at the cursor) and "LaTeX"
 * (turn pasted text with maths into LaTeX), optional status chip, "Shows as" line and original text.
 */
export function ContentField(props: {
  id: string; label?: ReactNode; value: string; onChange?: (v: string) => void; rows?: number; single?: boolean; mono?: boolean;
  placeholder?: string; chip?: ChipTone | null; error?: string | null; original?: { code: string; text: string } | null;
  readOnly?: boolean; hideShown?: boolean; tools?: boolean; required?: boolean; ok?: boolean; ariaLabel?: string; dense?: boolean;
}) {
  const notify = useNotify();
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const [formula, setFormula] = useState(false);
  const [busy, setBusy] = useState(false);
  const at = useRef<number | null>(null);
  const editable = !props.readOnly && !!props.onChange;
  const tools = props.tools !== false && editable;

  const toLatex = async () => {
    if (!props.value.trim()) return;
    setBusy(true);
    try {
      const r = await convertText(plain(props.value));
      props.onChange?.(r.latex);
      if (r.warning) notify(r.warning, { type: 'warning' });
    } catch (e) {
      notify((e as Error).message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const border = props.error ? '#D9534F' : props.ok ? X.okLine : X.field;
  const bg = props.error ? X.redBg : props.ok ? X.okBg : props.readOnly ? X.soft : '#fff';
  const inputStyle: CSSProperties = {
    flex: 1, minWidth: 0, border: 0, outline: 0, resize: 'vertical', background: 'transparent', color: X.text, borderRadius: 8,
    padding: props.single ? (props.dense ? '7px 10px' : '8px 12px') : '9px 12px',
    font: props.mono ? "13px/1.5 'JetBrains Mono', ui-monospace, monospace" : '14px/1.5 Inter, system-ui, sans-serif',
  };
  const Tag = props.single ? 'input' : 'textarea';
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
      {(props.label || props.chip) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {props.label && <Box component="label" htmlFor={props.id} sx={{ fontWeight: 600, fontSize: 14 }}>{props.label}{props.required && <Box component="span" sx={{ color: X.red }}> *</Box>}</Box>}
          {props.chip && <StatusChip tone={props.chip} />}
        </Box>
      )}
      <Box sx={{ display: 'flex', alignItems: props.single ? 'center' : 'flex-start', border: `1px solid ${border}`, borderRadius: '8px', bgcolor: bg, '&:focus-within': { borderColor: X.blue, boxShadow: `0 0 0 1px ${X.blue}` } }}>
        <Tag
          id={props.id} ref={ref} aria-label={props.ariaLabel} value={props.value} readOnly={!editable} placeholder={props.placeholder}
          {...(props.single ? { type: 'text' } : { rows: props.rows ?? 2 })}
          onChange={(e) => props.onChange?.(e.target.value)} style={inputStyle}
          onSelect={(e) => { at.current = (e.target as HTMLTextAreaElement).selectionStart; }}
        />
        {tools && (
          <Box component="span" sx={{ display: 'flex', gap: '4px', p: props.single ? '4px' : '6px', flexShrink: 0 }}>
            <button type="button" aria-label="Insert formula" title="Insert formula" style={{ ...toolBtn, width: 28, padding: 0, color: X.blue, fontSize: 14 }} onClick={() => setFormula(true)}>Σ</button>
            <button type="button" title="Turn maths in this text into LaTeX" style={toolBtn} onClick={toLatex} disabled={busy}>
              {busy ? <CircularProgress size={12} /> : 'LaTeX'}
            </button>
          </Box>
        )}
      </Box>
      {props.error && <Box component="span" sx={{ fontSize: 12, color: X.red }}>{props.error}</Box>}
      {!props.hideShown && hasLatex(props.value) && (
        <Box component="span" sx={{ fontSize: 12, color: X.muted, pl: '2px', display: 'flex', gap: '6px', alignItems: 'baseline', flexWrap: 'wrap' }}>
          Shows as <Shown value={props.value} size={14} />
        </Box>
      )}
      {props.original && (
        <Box component="span" sx={{ fontSize: 12, color: X.muted, lineHeight: 1.5, display: 'flex', gap: '6px', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <LangCode small>{props.original.code}</LangCode>
          {props.original.text ? <Shown value={props.original.text} size={12.5} /> : <i>empty</i>}
        </Box>
      )}
      {formula && (
        <FormulaDialog open onClose={() => setFormula(false)}
          onInsert={(latex) => { props.onChange?.(insertFormula(props.value, at.current, latex)); setFormula(false); }} />
      )}
    </Box>
  );
}

/** Small text link button ("+ Add option"). */
export function AddLink({ onClick, children, indent }: { onClick: () => void; children: ReactNode; indent?: number }) {
  return (
    <Box component="button" type="button" onClick={onClick}
      sx={{ alignSelf: 'flex-start', border: 0, background: 'none', p: 0, pl: indent ? `${indent}px` : 0, color: X.blue, fontSize: 13, fontWeight: 500, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}>
      {children}
    </Box>
  );
}

export function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Box component="button" type="button" aria-label={label} title={label} onClick={onClick}
      sx={{ width: 30, height: 34, border: 0, background: 'transparent', color: X.muted, cursor: 'pointer', fontSize: 14, borderRadius: 1, flexShrink: 0, '&:hover': { bgcolor: '#F0F2F5', color: X.red } }}>
      ✕
    </Box>
  );
}

/** Segmented switch ("True / False | Own options", the Mode of type 7). */
export function Segmented<T extends string | number>(props: { label: string; value: T; options: Array<[T, string, boolean?]>; onChange: (v: T) => void; maxWidth?: number }) {
  return (
    <Box role="radiogroup" aria-label={props.label} sx={{ display: 'flex', border: `1px solid ${X.field}`, borderRadius: '8px', overflow: 'hidden', fontSize: 13, maxWidth: props.maxWidth ?? 440 }}>
      {props.options.map(([v, label, disabled], i) => {
        const on = v === props.value;
        return (
          <Box key={String(v)} component="button" type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => props.onChange(v)}
            title={disabled ? 'Not available in the app yet' : undefined}
            sx={{
              flex: 1, height: 32, border: 0, borderLeft: i ? `1px solid ${X.field}` : 0, px: 1.5, cursor: disabled ? 'not-allowed' : 'pointer',
              bgcolor: on ? X.blue : '#fff', color: on ? '#fff' : disabled ? '#9AA1AD' : X.text, fontWeight: on ? 600 : 400, fontSize: 13,
            }}>
            {label}
          </Box>
        );
      })}
    </Box>
  );
}

/** Two-column row of the Answers section: label on the left (with a note), input on the right. */
export function FormRow({ label, note, required, children }: { label: ReactNode; note?: ReactNode; required?: boolean; children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '150px minmax(0, 1fr)' }, gap: { xs: 1, md: '18px' } }}>
      <Box>
        <Box sx={{ fontWeight: 600, pt: '7px' }}>{label}{required && <Box component="span" sx={{ color: X.red }}> *</Box>}</Box>
        {note && <Box sx={{ fontSize: 12, color: X.muted, mt: '4px', lineHeight: 1.45 }}>{note}</Box>}
      </Box>
      <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>{children}</Box>
    </Box>
  );
}
