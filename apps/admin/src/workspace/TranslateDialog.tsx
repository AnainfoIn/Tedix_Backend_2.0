import TranslateIcon from '@mui/icons-material/Translate';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel,
  InputLabel, LinearProgress, MenuItem, Select, Stack, Typography,
} from '@mui/material';
import { useState } from 'react';
import { Code, shortCode } from './MicroLessonWorkspace';
import { Language, setOriginalLanguage, translateLesson, TranslateResult, Workspace } from './types';

/** "Translate “…”" pop-up: target languages, what to translate, then progress per language. */
export function TranslateDialog(props: {
  ws: Workspace; original: Language; preselect?: number; onClose: () => void; onDone: (message: string) => void; onOriginalChanged: (ws: Workspace) => void;
}) {
  const { ws } = props;
  const [from, setFrom] = useState(props.original.id);
  const others = ws.languages.filter((l) => l.id !== from);
  const [targets, setTargets] = useState<number[]>(props.preselect ? [props.preselect] : others.map((l) => l.id));
  const [text, setText] = useState(true);
  const [exercises, setExercises] = useState(ws.exercises.length > 0);
  const [replace, setReplace] = useState(false);
  const [running, setRunning] = useState<number[]>([]);
  const [results, setResults] = useState<TranslateResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const busy = running.length > 0;

  const changeFrom = async (id: number) => {
    setFrom(id);
    setTargets((t) => t.filter((x) => x !== id));
    try {
      props.onOriginalChanged(await setOriginalLanguage(ws.lesson.id, id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const go = async () => {
    setError(null);
    setResults([]);
    setRunning([...targets]);
    const all: TranslateResult[] = [];
    // One language per request, so progress shows and one failure doesn't stop the rest.
    for (const languageId of targets) {
      try {
        const [r] = await translateLesson(ws.lesson.id, { languageIds: [languageId], include: { text, exercises }, replaceEdited: replace });
        all.push(r ?? { languageId, translated: 0, kept: 0 });
      } catch (e) {
        all.push({ languageId, translated: 0, kept: 0, error: (e as Error).message });
      }
      setResults([...all]);
      setRunning((r) => r.filter((x) => x !== languageId));
    }
    const failed = all.filter((r) => r.error);
    if (!failed.length) props.onDone(`Translated into ${all.length} ${all.length === 1 ? 'language' : 'languages'}. Each item shows Auto until someone reviews it.`);
  };

  const name = (id: number) => ws.languages.find((l) => l.id === id)?.name ?? `#${id}`;

  return (
    <Dialog open onClose={busy ? undefined : props.onClose} maxWidth="md" fullWidth aria-labelledby="translate-title">
      <DialogTitle id="translate-title" sx={{ pb: 0.5 }}>Translate “{ws.lesson.name}”</DialogTitle>
      <Box sx={{ px: 3, pb: 1 }}>
        <Typography variant="caption" color="text.secondary">From {name(from)} (original). Nothing in {name(from)} changes.</Typography>
      </Box>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Stack spacing={2} sx={{ flex: '1 1 340px', minWidth: 0 }}>
            {!ws.aiConfigured && <Alert severity="warning">AI translation is not set up on this server (ANTHROPIC_API_KEY is missing).</Alert>}
            <FormControl size="small" sx={{ maxWidth: 280 }}>
              <InputLabel id="from-lang">Original language</InputLabel>
              <Select labelId="from-lang" label="Original language" value={from} onChange={(e) => void changeFrom(Number(e.target.value))} disabled={busy}>
                {ws.languages.map((l) => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Box>
              <Typography sx={{ fontWeight: 500, mb: 0.5 }}>Into</Typography>
              <Stack direction="row" flexWrap="wrap" useFlexGap sx={{ columnGap: 2.5 }}>
                {others.map((l) => (
                  <FormControlLabel
                    key={l.id} disabled={busy}
                    control={<Checkbox checked={targets.includes(l.id)} onChange={(e) => setTargets((t) => (e.target.checked ? [...t, l.id] : t.filter((x) => x !== l.id)))} />}
                    label={<Stack direction="row" spacing={1} alignItems="center"><Code>{shortCode(l)}</Code><span>{l.name}</span></Stack>}
                  />
                ))}
              </Stack>
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 500, mb: 0.5 }}>What to translate</Typography>
              <Option checked={text} onChange={setText} disabled={busy} title="Name and text content" sub="Formulas and image keys are copied unchanged. Seconds." />
              <Option
                checked={exercises} onChange={setExercises} disabled={busy || !ws.exercises.length}
                title={`${ws.exercises.length} ${ws.exercises.length === 1 ? 'exercise' : 'exercises'}`} sub="Names, questions, hints, solutions and options."
              />
              <Option checked={false} disabled title="Cheatsheet PDF and Summary PDF" sub="A translated PDF per language. Coming in a later update." />
              <Option checked={false} disabled title="Summary video: subtitles or AI voice-over" sub="Coming in a later update." />
              <Option checked={replace} onChange={setReplace} disabled={busy} title="Replace content you already corrected" sub="Off: your own wording (Edited or Reviewed) is kept." />
            </Box>
          </Stack>
          <Stack spacing={0.75} sx={{ flex: '0 1 300px', minWidth: 240 }}>
            <Typography sx={{ fontWeight: 500 }}>{busy || results.length ? 'Progress' : 'After you click Translate'}</Typography>
            {!busy && !results.length && (
              <Typography variant="caption" color="text.secondary">Each item appears in its language tab with Auto when ready. Review and correct it there.</Typography>
            )}
            {targets.filter((id) => running.includes(id) || results.some((r) => r.languageId === id)).map((id) => {
              const r = results.find((x) => x.languageId === id);
              return (
                <Box key={id} sx={{ py: 0.75, borderBottom: '1px solid #eee' }}>
                  <Stack direction="row" justifyContent="space-between">
                    <span>{name(id)}</span>
                    <Typography variant="caption" color={r?.error ? 'error' : 'text.secondary'}>
                      {r ? (r.error ? 'Failed' : `${r.translated} translated${r.kept ? `, ${r.kept} kept` : ''}`) : 'Translating…'}
                    </Typography>
                  </Stack>
                  <LinearProgress variant={r ? 'determinate' : 'indeterminate'} value={r ? 100 : undefined} color={r?.error ? 'error' : 'primary'} sx={{ mt: 0.5 }} />
                  {r?.error && <Typography variant="caption" color="error">{r.error}</Typography>}
                </Box>
              );
            })}
          </Stack>
        </Box>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose} disabled={busy}>{results.length ? 'Close' : 'Cancel'}</Button>
        <Button
          variant="contained" onClick={go} disabled={busy || !targets.length || (!text && !exercises) || !ws.aiConfigured}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <TranslateIcon />}
        >
          {results.some((r) => r.error) ? 'Try again' : 'Translate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Option(props: { checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; title: string; sub: string }) {
  return (
    <FormControlLabel
      disabled={props.disabled}
      sx={{ alignItems: 'flex-start', m: 0, py: 0.75, borderBottom: '1px solid #eee', width: '100%' }}
      control={<Checkbox checked={props.checked} onChange={(e) => props.onChange?.(e.target.checked)} sx={{ mt: -0.75 }} />}
      label={<Stack spacing={0.25}><span>{props.title}</span><Typography variant="caption" color="text.secondary">{props.sub}</Typography></Stack>}
    />
  );
}
