import AutorenewIcon from '@mui/icons-material/Autorenew';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import UploadIcon from '@mui/icons-material/FileUploadOutlined';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Link, Stack,
  TextField, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRecordContext } from 'react-admin';
import { apiFetch, ApiError } from '../api';
import { contentLines, englishToLatex } from './englishToLatex';
import { checkLatex, planInsert } from './insertContent';
import { LatexLine, useContentImages } from './LatexInput';

type Rec = Record<string, any>;
type Converter = 'ai' | 'rules';

const TEXT_FILE = /\.(txt|md|tex)$/i;
const WORD_FILE = /\.docx$/i;
const LATER_FILE = /\.(pdf|png|jpe?g|webp|gif|heic|doc)$/i;

let aiStatus: Promise<boolean> | null = null;
const aiAvailable = () =>
  (aiStatus ??= apiFetch<{ data: { aiConversion: boolean } }>('/latex/status').then((r) => !!r.data.aiConversion).catch(() => false));

/**
 * Insert pop-up for the micro lesson's text content:
 * 1 add content (file or text) → Convert to LaTeX, 2 check and correct the LaTeX, 3 preview on a phone.
 */
export function InsertDialog(props: {
  open: boolean;
  onClose: () => void;
  current: string;
  cursor: number | null;
  imagesOf?: string;
  onInsert: (next: string) => void;
}) {
  const record = useRecordContext<Rec>();
  const [source, setSource] = useState('');
  const [latex, setLatex] = useState('');
  const [busy, setBusy] = useState(false);
  const [converter, setConverter] = useState<Converter | null>(null);
  const [notice, setNotice] = useState<{ severity: 'info' | 'warning' | 'error'; text: string } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [device, setDevice] = useState<'phone' | 'tablet'>('phone');
  const [ai, setAi] = useState<boolean | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'));

  useEffect(() => {
    if (!props.open) return;
    setSource(''); setLatex(''); setConverter(null); setNotice(null); setFileName(null);
    aiAvailable().then(setAi);
  }, [props.open]);

  const problems = useMemo(() => (latex.trim() ? checkLatex(latex) : []), [latex]);
  const plan = useMemo(() => planInsert(props.current, latex, props.cursor), [props.current, latex, props.cursor]);
  const lineCount = latex.trim() ? contentLines(latex).length : 0;
  const canInsert = !!latex.trim() && problems.length === 0 && !busy;

  const convert = async () => {
    const text = source.trim();
    if (!text) return;
    setBusy(true);
    setNotice(null);
    try {
      if (ai) {
        try {
          const r = await apiFetch<{ data: { latex: string } }>('/latex/convert', { method: 'POST', body: JSON.stringify({ text }) });
          setLatex(r.data.latex);
          setConverter('ai');
          return;
        } catch (e) {
          if (!(e instanceof ApiError) || e.status < 500) throw e;
          setNotice({ severity: 'warning', text: `${e.message} Used the built-in converter instead.` });
        }
      }
      setLatex(englishToLatex(text));
      setConverter('rules');
    } catch (e) {
      setNotice({ severity: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (file: File) => {
    setNotice(null);
    setFileName(file.name);
    try {
      if (TEXT_FILE.test(file.name) || file.type.startsWith('text/')) {
        const text = await file.text();
        if (/\.tex$/i.test(file.name)) {
          setLatex(text.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' \\\\ '));
          setConverter(null);
          setNotice({ severity: 'info', text: 'LaTeX file loaded straight into step 2.' });
        } else setSource(text);
      } else if (WORD_FILE.test(file.name)) {
        const mammoth = await import('mammoth');
        const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        setSource(value.replace(/\n{2,}/g, '\n').trim());
      } else if (LATER_FILE.test(file.name) || file.type.startsWith('image/')) {
        setFileName(null);
        setNotice({
          severity: 'warning',
          text: 'Reading PDFs and images of formulas needs a recognition service that is not set up yet. Copy the text out of the file and paste it below, or use a Word or text file.',
        });
      } else {
        setFileName(null);
        setNotice({ severity: 'warning', text: 'Use a Word (.docx), text (.txt) or LaTeX (.tex) file.' });
      }
    } catch (e) {
      setFileName(null);
      setNotice({ severity: 'error', text: `Could not read ${file.name}: ${(e as Error).message}` });
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void readFile(file);
  };

  const firstProblem = problems[0];

  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="lg" fullWidth fullScreen={fullScreen} scroll="paper" aria-labelledby="insert-content-title">
      <DialogTitle id="insert-content-title" sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, pr: 1.5 }}>
        <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
          <Typography variant="h6" component="span" sx={{ display: 'block', fontWeight: 500 }}>Insert content</Typography>
          <Typography variant="caption" color="text.secondary">
            Text content{record?.name ? ` · ${record.name}` : ''} · {props.cursor === null || !props.current.trim() ? 'added at the end' : 'inserted after the line with the cursor'}
          </Typography>
        </Box>
        <Chip label="Into Romanian (original)" color="primary" size="small" />
        <IconButton aria-label="Close" onClick={props.onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'flex-start' }}>
          <Stack spacing={3} sx={{ flex: '1 1 380px', minWidth: 0 }}>
            <Stack spacing={1}>
              <Step n={1}>Add the content</Step>
              <Box
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                sx={{
                  border: '1.5px dashed', borderColor: dragging ? 'primary.main' : 'grey.500', borderRadius: 1,
                  bgcolor: dragging ? 'action.selected' : 'action.hover', p: 1.5, textAlign: 'center',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
                }}
              >
                <UploadIcon color="action" />
                <Typography variant="body2">
                  Drop a file here, or{' '}
                  <Link component="button" type="button" onClick={() => fileInput.current?.click()}>choose a file</Link>
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {fileName ? `Loaded ${fileName}` : 'Word (.docx), text (.txt) or LaTeX (.tex). PDF and images: coming soon'}
                </Typography>
                <input
                  ref={fileInput} type="file" hidden accept=".docx,.txt,.md,.tex,.pdf,image/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ''; }}
                />
              </Box>
              <TextField
                label="Or type / paste the content" multiline minRows={4} fullWidth value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder={'Adună 1/3 și 1/6.\nRezultatul este 1/2, pentru că 2/6 + 1/6 = 3/6 = 1/2.'}
              />
              <Stack direction="row" alignItems="center" justifyContent="flex-end" flexWrap="wrap" useFlexGap gap={1}>
                <Typography variant="caption" color="text.secondary" sx={{ flex: '1 1 200px' }}>
                  {ai === null ? '' : ai ? 'Converted with Claude. Keeps the Romanian wording.' : 'Built-in converter (AI conversion is not set up on this server).'}
                </Typography>
                <Button
                  variant="outlined" onClick={convert} disabled={!source.trim() || busy}
                  startIcon={busy ? <CircularProgress size={16} /> : <AutorenewIcon />}
                >
                  Convert to LaTeX
                </Button>
              </Stack>
              {notice && <Alert severity={notice.severity} onClose={() => setNotice(null)}>{notice.text}</Alert>}
            </Stack>

            <Stack spacing={1}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                <Step n={2}>Check the LaTeX</Step>
                {latex.trim() && (
                  <Chip
                    size="small" color={problems.length ? 'warning' : 'success'} variant="outlined"
                    label={problems.length ? `${problems.length} ${problems.length === 1 ? 'error' : 'errors'}` : `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}, valid`}
                  />
                )}
              </Stack>
              <TextField
                label="LaTeX string" multiline minRows={4} fullWidth value={latex} onChange={(e) => setLatex(e.target.value)}
                helperText={`You can correct it, the preview updates as you type. Lines are separated by \\\\, words go in \\text{...}.${converter === 'rules' ? ' Check it: the built-in converter is best with simple maths.' : ''}`}
                slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 } } }}
              />
              {latex.trim() && (firstProblem ? (
                <Alert severity="error">
                  {firstProblem.line ? `Line ${firstProblem.line}: ` : ''}{firstProblem.message.replace(/\.?$/, '.')}
                  {problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''} Fix it to insert.
                </Alert>
              ) : (
                <Alert severity="success" icon={<CheckIcon fontSize="inherit" />}>The LaTeX is valid and renders.</Alert>
              ))}
            </Stack>
          </Stack>

          <Stack spacing={1.25} alignItems="center" sx={{ flex: '0 0 auto', width: { xs: '100%', sm: 'auto' } }}>
            <Box sx={{ alignSelf: 'flex-start' }}><Step n={3}>Preview on a {device}</Step></Box>
            <PhonePreview device={device} plan={plan} addition={latex} imagesOf={props.imagesOf} title={record?.name} />
            <ToggleButtonGroup size="small" exclusive value={device} onChange={(_, v) => v && setDevice(v)} aria-label="Preview device">
              <ToggleButton value="phone">Phone</ToggleButton>
              <ToggleButton value="tablet">Tablet</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 200 }}>
          Only the Romanian text content changes. Nothing is saved until you press Save on the micro lesson.
        </Typography>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button variant="contained" startIcon={<CheckIcon />} disabled={!canInsert} onClick={() => props.onInsert(plan.next)}>
          Insert into Romanian
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</Box>
      <Typography variant="subtitle2">{children}</Typography>
    </Stack>
  );
}

function PhonePreview(props: { device: 'phone' | 'tablet'; plan: { before: string; after: string }; addition: string; imagesOf?: string; title?: string }) {
  const byKey = useContentImages(props.imagesOf);
  const lines = (s: string) => (s.trim() ? contentLines(s) : []);
  const before = lines(props.plan.before);
  const added = lines(props.addition);
  const after = lines(props.plan.after);
  const tablet = props.device === 'tablet';
  const render = (l: string, i: number) => <LatexLine key={i} line={l} byKey={byKey} compact />;

  return (
    <Box
      role="img" aria-label={`${props.device} preview of the lesson text with the inserted content`}
      sx={{
        width: tablet ? 460 : 300, maxWidth: '100%', height: tablet ? 620 : 600, border: '10px solid #202124', borderRadius: tablet ? '24px' : '36px',
        bgcolor: '#fff', color: '#212121', boxSizing: 'border-box', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}
    >
      {!tablet && (
        <Box sx={{ height: 22, display: 'flex', justifyContent: 'center', flex: '0 0 auto' }}>
          <Box sx={{ width: 90, height: 16, bgcolor: '#202124', borderRadius: '0 0 10px 10px' }} />
        </Box>
      )}
      <Box sx={{ px: 1.75, py: 1, borderBottom: '1px solid #eee', flex: '0 0 auto' }}>
        <Typography sx={{ fontSize: 15, fontWeight: 500 }} noWrap>{props.title || 'Micro lesson'}</Typography>
      </Box>
      <Stack spacing={1.25} sx={{ p: 1.75, overflowY: 'auto', flex: 1 }}>
        {before.map(render)}
        {added.length > 0 && (
          <Stack spacing={1} sx={{ bgcolor: '#e3f2fd', borderRadius: 1.5, p: 1.25 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 500, color: '#0d47a1', letterSpacing: '.04em', textTransform: 'uppercase' }}>New content</Typography>
            {added.map(render)}
          </Stack>
        )}
        {after.map(render)}
        {!before.length && !added.length && !after.length && (
          <Typography variant="body2" sx={{ color: '#757575' }}>Convert some content to see it here.</Typography>
        )}
      </Stack>
    </Box>
  );
}
