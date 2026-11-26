import AddBoxOutlinedIcon from '@mui/icons-material/AddBoxOutlined';
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useMemo, useRef, useState } from 'react';
import { TextInput, useGetList, useNotify, useRecordContext } from 'react-admin';
import { useFormContext, useWatch } from 'react-hook-form';
import { contentLines, IMAGE_KEY } from './englishToLatex';
import { InsertDialog } from './InsertDialog';

type Rec = Record<string, any>;

/**
 * Content field written in LaTeX (lines joined with `\\`, image placeholders such as
 * tedimageone on their own line). Above the box: a live preview and the Insert pop-up
 * (file or text → LaTeX → check → phone preview).
 */
export function LatexInput(props: { source: string; label: string; helperText?: string; disabled?: boolean; imagesOf?: string }) {
  const { setValue, getValues } = useFormContext();
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const cursor = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState({ current: '', cursor: null as number | null });

  const trackCursor = (e: React.SyntheticEvent) => {
    const t = e.target as HTMLTextAreaElement;
    if (t.tagName === 'TEXTAREA' && t.name === props.source) cursor.current = t.selectionStart;
  };

  const openInsert = () => {
    setSnapshot({ current: String(getValues(props.source) ?? ''), cursor: cursor.current });
    setOpen(true);
  };

  const insert = (next: string) => {
    setValue(props.source, next, { shouldDirty: true, shouldValidate: true, shouldTouch: true });
    cursor.current = null;
    setOpen(false);
    notify('Content inserted. Save the micro lesson to keep it.', { type: 'info' });
  };

  return (
    <Box sx={{ width: '100%', mb: 1 }}>
      <ContentPreview source={props.source} imagesOf={props.imagesOf} />
      {!props.disabled && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Button variant="outlined" size="small" startIcon={<AddBoxOutlinedIcon />} onClick={openInsert}>Insert</Button>
          <Typography variant="caption" color="text.secondary">
            Add content from a file or pasted text, converted to LaTeX and previewed on a phone. It goes after the line with the cursor.
          </Typography>
        </Stack>
      )}
      <Box onSelect={trackCursor} onKeyUp={trackCursor} onMouseUp={trackCursor}>
        <TextInput
          source={props.source} label={props.label} helperText={props.helperText ?? 'LaTeX. Separate lines with \\\; text goes in \\text{...}.'}
          disabled={props.disabled} fullWidth multiline minRows={8}
          sx={{ '& textarea': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 14 } }}
        />
      </Box>
      {open && (
        <InsertDialog
          open={open} onClose={() => setOpen(false)} current={snapshot.current} cursor={snapshot.cursor}
          imagesOf={props.imagesOf} onInsert={insert}
        />
      )}
    </Box>
  );
}

/** Live preview of the content box as it is typed. */
function ContentPreview({ source, imagesOf }: { source: string; imagesOf?: string }) {
  const value = useWatch({ name: source }) as string | undefined;
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>Content preview</Typography>
      {value?.trim() ? <LatexPreview latex={value} imagesOf={imagesOf} /> : (
        <Paper variant="outlined" sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">Nothing to preview yet.</Typography></Paper>
      )}
    </Box>
  );
}

/** Content images of the record being edited, by key (tedimageone → url). */
export function useContentImages(imagesOf?: string): Map<string, string | undefined> {
  const record = useRecordContext<Rec>();
  const { data: images } = useGetList(
    'content_images',
    { pagination: { page: 1, perPage: 100 }, sort: { field: 'id', order: 'ASC' }, filter: { contentableId: record?.id, contentableType: imagesOf } },
    { enabled: !!imagesOf && record?.id != null },
  );
  return useMemo(() => new Map((images ?? []).map((i: Rec) => [String(i.keyName).toLowerCase(), i.image?.url as string | undefined])), [images]);
}

/** Renders stored LaTeX content line by line; image keys show the matching content image. */
export function LatexPreview({ latex, imagesOf }: { latex: string; imagesOf?: string }) {
  const byKey = useContentImages(imagesOf);
  return (
    <Paper variant="outlined" sx={{ p: 2, overflowX: 'auto' }}>
      <Stack spacing={1.5}>
        {contentLines(latex).map((line, i) => <LatexLine key={i} line={line} byKey={byKey} missingNote={!!imagesOf} />)}
      </Stack>
    </Paper>
  );
}

/** One content line: an image key or a formula. `compact` wraps prose like the app does on a phone. */
export function LatexLine({ line, byKey, compact, missingNote }: { line: string; byKey: Map<string, string | undefined>; compact?: boolean; missingNote?: boolean }) {
  if (IMAGE_KEY.test(line)) {
    const url = byKey.get(line.toLowerCase());
    return url ? (
      <Box component="img" src={url} alt={line} sx={{ maxWidth: compact ? '100%' : 320, maxHeight: 220, objectFit: 'contain', alignSelf: 'flex-start' }} />
    ) : (
      <Box sx={{ px: 1.5, py: 1, border: 1, borderStyle: 'dashed', borderColor: 'divider', borderRadius: 1, alignSelf: 'flex-start' }}>
        <Typography variant="body2" color="text.secondary">Image: {line}{missingNote ? ' (no content image with this key yet)' : ''}</Typography>
      </Box>
    );
  }
  return compact ? <WrappedLine latex={line} /> : <Formula latex={line} />;
}

function Formula({ latex }: { latex: string }) {
  const result = useMemo(() => {
    try {
      return { html: katex.renderToString(latex, { throwOnError: true, displayMode: false, strict: 'ignore' }) };
    } catch (e) {
      return { error: (e as Error).message.replace(/^KaTeX parse error: /, '') };
    }
  }, [latex]);
  if ('error' in result) {
    return (
      <Alert severity="warning" sx={{ py: 0 }}>
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{latex}</Typography>
        <Typography variant="caption">{result.error}</Typography>
      </Alert>
    );
  }
  return <Box sx={{ fontSize: 18 }} dangerouslySetInnerHTML={{ __html: result.html }} />;
}

/**
 * A line split into its top-level \text{...} parts (plain, wrapping text) and maths (KaTeX),
 * so long sentences wrap inside the phone frame. Falls back to one formula if it can't be split.
 */
function WrappedLine({ latex }: { latex: string }) {
  const html = useMemo(() => {
    const parts = splitText(latex);
    if (!parts) return null;
    try {
      return parts
        .map((p) => (p.text !== undefined ? escapeHtml(unescapeText(p.text)) : katex.renderToString(p.math!, { throwOnError: true, displayMode: false, strict: 'ignore' })))
        .join('');
    } catch {
      return null;
    }
  }, [latex]);
  if (html === null) return <Box sx={{ overflowX: 'auto' }}><Formula latex={latex} /></Box>;
  return <Box sx={{ fontSize: 14, lineHeight: 1.7, wordBreak: 'break-word', '& .katex': { fontSize: '1.15em' } }} dangerouslySetInnerHTML={{ __html: html }} />;
}

type Part = { text?: string; math?: string };

export function splitText(latex: string): Part[] | null {
  const parts: Part[] = [];
  let i = 0;
  let math = '';
  const pushMath = () => { if (math.trim()) parts.push({ math: math.trim() }); math = ''; };
  while (i < latex.length) {
    if (latex.startsWith('\\text{', i)) {
      let depth = 1;
      let j = i + 6;
      for (; j < latex.length && depth > 0; j++) {
        if (latex[j] === '\\') { j++; continue; }
        if (latex[j] === '{') depth++;
        else if (latex[j] === '}') depth--;
      }
      if (depth !== 0) return null;
      pushMath();
      parts.push({ text: latex.slice(i + 6, j - 1) });
      i = j;
    } else {
      math += latex[i];
      i++;
    }
  }
  pushMath();
  // Text nested in a group (e.g. \frac{\text{a}}{b}) stays in one formula.
  if (parts.some((p) => p.math !== undefined && !balanced(p.math))) return null;
  return parts;
}

const balanced = (s: string) => {
  let d = 0;
  for (let k = 0; k < s.length; k++) {
    if (s[k] === '\\') { k++; continue; }
    if (s[k] === '{') d++;
    else if (s[k] === '}' && --d < 0) return false;
  }
  return d === 0;
};

const unescapeText = (s: string) => s.replace(/\\textbackslash\s?/g, '\\').replace(/\\([#$%&_{}])/g, '$1').replace(/\\ /g, ' ').replace(/~/g, ' ');
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
