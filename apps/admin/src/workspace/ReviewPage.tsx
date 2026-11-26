import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import {
  Alert, Box, Button, Card, CircularProgress, FormControl, InputLabel, MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Title, useCanAccess, useNotify } from 'react-admin';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { LatexPreview } from '../latex/LatexInput';
import { checkLatex } from '../latex/insertContent';
import { Code, MICRO_LESSON, shortCode, ToneChip } from './MicroLessonWorkspace';
import {
  indexTranslations, ItemType, loadWorkspace, QUESTION_FIELDS, saveTranslation, sourceFields, Status, STATUS_LABEL, STATUS_TONE,
  translateLesson, Workspace,
} from './types';

const plain = (s: string | null | undefined) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

interface Row {
  key: string;
  type: ItemType;
  id: number;
  field: string;
  label: string;
  source: string;
  latex?: boolean;
}

/** "Review translations": every field of a micro lesson, original next to one translation, corrected in place. */
export function ReviewPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const notify = useNotify();
  const { canAccess } = useCanAccess({ resource: 'micro_lessons', action: 'edit' });
  const canEdit = !!canAccess;
  const [ws, setWs] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setWs(await loadWorkspace(id!));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => { void reload(); }, [reload]);

  const original = ws?.languages.find((l) => l.id === ws.originalLanguageId);
  const others = ws?.languages.filter((l) => l.id !== original?.id) ?? [];
  const language = others.find((l) => l.id === Number(params.get('lang'))) ?? others[0];
  const only = params.get('show') ?? 'all';

  const rows: Row[] = useMemo(() => {
    if (!ws) return [];
    const exNo = new Map(ws.exercises.map((e, i) => [e.id, i + 1]));
    const qOwner = new Map(ws.exercises.flatMap((e) => e.questions.map((q, i) => [q.id, { ex: exNo.get(e.id)!, q: i + 1 }] as const)));
    const oOwner = new Map(ws.exercises.flatMap((e) => e.questions.flatMap((q) => q.options.map((o, j) => [o.id, { ex: exNo.get(e.id)!, q: qOwner.get(q.id)!.q, o: j + 1, v: o.option }] as const))));
    return sourceFields(ws).map(([type, itemId, field]) => {
      const key = `${type}:${itemId}:${field}`;
      if (type === 'micro_lesson') {
        return { key, type, id: itemId, field, label: field === 'name' ? 'Name' : 'Content', source: String(field === 'name' ? ws.lesson.name : ws.lesson.description), latex: field === 'description' };
      }
      if (type === 'exercise') return { key, type, id: itemId, field, label: `Exercise ${exNo.get(itemId)} · Name`, source: ws.exercises.find((e) => e.id === itemId)!.name };
      if (type === 'question') {
        const o = qOwner.get(itemId)!;
        const q = ws.exercises.flatMap((e) => e.questions).find((x) => x.id === itemId)!;
        const label = QUESTION_FIELDS.find((f) => f.field === field)?.label ?? field;
        return { key, type, id: itemId, field, label: `Exercise ${o.ex} · Question ${o.q} · ${label}`, source: String(q[field as 'question']) };
      }
      const o = oOwner.get(itemId)!;
      return { key, type, id: itemId, field, label: `Exercise ${o.ex} · Question ${o.q} · Option ${o.o}`, source: o.v };
    });
  }, [ws]);

  const get = ws ? indexTranslations(ws.translations) : null;
  useEffect(() => {
    if (!ws || !language || !get) return;
    setDraft(Object.fromEntries(rows.map((r) => [r.key, get(r.type, r.id, r.field, language.id)?.value ?? ''])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, language?.id, rows]);

  if (error) return <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>;
  if (!ws || !get) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  if (!language || !original) {
    return <Alert severity="info" sx={{ mt: 2 }}>Add at least two languages under Languages to review translations.</Alert>;
  }

  const visible = rows.filter((r) => {
    const t = get(r.type, r.id, r.field, language.id);
    if (only === 'open') return !t || t.outdated || t.status !== 'reviewed';
    if (only === 'outdated') return !!t?.outdated;
    return true;
  });
  const reviewed = rows.filter((r) => { const t = get(r.type, r.id, r.field, language.id); return t?.status === 'reviewed' && !t.outdated; }).length;

  const save = async (r: Row, status: Status) => {
    setBusy(r.key);
    try {
      await saveTranslation({ itemType: r.type, itemId: r.id, field: r.field, languageId: language.id, value: draft[r.key] ?? '', status });
      await reload();
    } catch (e) {
      notify((e as Error).message, { type: 'error' });
    } finally {
      setBusy(null);
    }
  };
  const retranslate = async (keys?: string[]) => {
    setBusy(keys ? keys[0] : 'all');
    try {
      const [res] = await translateLesson(ws.lesson.id, { languageIds: [language.id], include: { text: true, exercises: true }, replaceEdited: !!keys, only: keys, onlyMissing: !keys });
      if (res?.error) notify(res.error, { type: 'error' });
      await reload();
    } catch (e) {
      notify((e as Error).message, { type: 'error' });
    } finally {
      setBusy(null);
    }
  };
  const setParam = (k: string, v: string) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p, { replace: true }); };

  return (
    <Stack spacing={2} sx={{ mt: 1, mb: 4 }}>
      <Title title={`Review translations · ${ws.lesson.name}`} />
      <Card variant="outlined" sx={{ p: '16px 20px' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" useFlexGap gap={2}>
          <Box>
            <Button component={Link} to={`/micro_lessons/${ws.lesson.id}/show?lang=${language.id}`} startIcon={<ArrowBackIcon />} size="small" sx={{ ml: -1 }}>Back to micro lesson</Button>
            <Typography variant="caption" color="text.secondary" component="div">Review translations · Micro lesson</Typography>
            <Typography variant="h5" sx={{ fontWeight: 400 }}>{ws.lesson.name}</Typography>
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <Stack spacing={0.25}><Typography variant="caption" color="text.secondary">Original</Typography><Stack direction="row" spacing={1}><Code>{shortCode(original)}</Code><span>{original.name}</span></Stack></Stack>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="tr-lang">Translation</InputLabel>
              <Select labelId="tr-lang" label="Translation" value={language.id} onChange={(e) => setParam('lang', String(e.target.value))}>
                {others.map((l) => <MenuItem key={l.id} value={l.id}>{shortCode(l)} · {l.name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel id="tr-show">Show</InputLabel>
              <Select labelId="tr-show" label="Show" value={only} onChange={(e) => setParam('show', String(e.target.value))}>
                <MenuItem value="all">All fields</MenuItem>
                <MenuItem value="open">Not reviewed yet</MenuItem>
                <MenuItem value="outdated">Outdated only</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Stack>
      </Card>

      <Card variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 900, tableLayout: 'fixed', '& td': { verticalAlign: 'top', py: 1.5 } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 170 }}>Field</TableCell>
              <TableCell sx={{ width: '38%' }}><Code>{shortCode(original)}</Code> {original.name} <ToneChip tone="orig" label="Original" sx={{ ml: 1 }} /></TableCell>
              <TableCell><Code>{shortCode(language)}</Code> {language.name} · read and correct here</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.length === 0 && (
              <TableRow><TableCell colSpan={3}><Typography color="text.secondary">Nothing to show with this filter.</Typography></TableCell></TableRow>
            )}
            {visible.map((r) => {
              const t = get(r.type, r.id, r.field, language.id);
              const value = draft[r.key] ?? '';
              const dirty = value !== (t?.value ?? '');
              const bad = r.latex && value.trim() ? checkLatex(value) : [];
              return (
                <TableRow key={r.key} sx={{ bgcolor: t?.outdated ? '#fff8f2' : undefined }}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{r.label}</Typography>
                    <Box sx={{ mt: 0.5 }}>
                      {!t ? <ToneChip tone="miss" label="Missing" /> : t.outdated ? <ToneChip tone="old" label="Outdated" /> : <ToneChip tone={STATUS_TONE[t.status]} label={STATUS_LABEL[t.status]} />}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {r.latex ? <LatexPreview latex={r.source} imagesOf={MICRO_LESSON} /> : <Typography variant="body2">{plain(r.source)}</Typography>}
                    {r.latex && <Typography variant="caption" color="text.secondary">Formulas are copied from the original.</Typography>}
                  </TableCell>
                  <TableCell>
                    <Stack spacing={1}>
                      {r.latex && value.trim() && <LatexPreview latex={value} imagesOf={MICRO_LESSON} />}
                      <TextField
                        value={value} onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))} fullWidth size="small" multiline={r.latex || r.type === 'question'}
                        minRows={r.latex ? 4 : undefined} disabled={!canEdit} placeholder="Not translated yet"
                        slotProps={r.latex ? { htmlInput: { spellCheck: false, style: { fontFamily: 'ui-monospace, monospace', fontSize: 13 } } } : undefined}
                      />
                      {bad.length > 0 && <Alert severity="error" sx={{ py: 0 }}>Line {bad[0].line}: {bad[0].message}</Alert>}
                      {t?.outdated && <Typography variant="caption" sx={{ color: '#8a3200' }}>The {original.name} text changed after this was translated.</Typography>}
                      {canEdit && (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {ws.aiConfigured && (
                            <Button size="small" startIcon={busy === r.key ? <CircularProgress size={14} /> : <AutorenewIcon />} disabled={!!busy} onClick={() => retranslate([r.key])}>
                              {t ? 'Translate again' : 'Translate'}
                            </Button>
                          )}
                          {t?.outdated && !dirty && <Button size="small" disabled={!!busy} onClick={() => save(r, t.status === 'auto' ? 'reviewed' : t.status)}>Still correct</Button>}
                          {dirty && <Button size="small" color="inherit" disabled={!!busy} onClick={() => setDraft((d) => ({ ...d, [r.key]: t?.value ?? '' }))}>Discard</Button>}
                          {dirty && <Button size="small" variant="outlined" disabled={!!busy || bad.length > 0} onClick={() => save(r, 'edited')}>Save correction</Button>}
                          {(dirty || (t && t.status !== 'reviewed') || t?.outdated) && value.trim() && (
                            <Button size="small" variant="contained" disabled={!!busy || bad.length > 0} onClick={() => save(r, 'reviewed')}>
                              {dirty ? 'Save and mark reviewed' : 'Mark reviewed'}
                            </Button>
                          )}
                        </Stack>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Card variant="outlined" sx={{ p: '12px 20px' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap gap={1.5}>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            {canEdit && ws.aiConfigured && (
              <Button variant="outlined" startIcon={busy === 'all' ? <CircularProgress size={14} /> : <AutorenewIcon />} disabled={!!busy} onClick={() => retranslate()}>
                Translate missing and outdated {language.name}
              </Button>
            )}
            <Typography variant="body2" color="text.secondary">{reviewed} of {rows.length} {language.name} fields reviewed</Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="caption" color="text.secondary">Legend</Typography>
            <ToneChip tone="orig" label="Original" /><ToneChip tone="auto" label="Auto" /><ToneChip tone="edit" label="Edited" />
            <ToneChip tone="rev" label="Reviewed" /><ToneChip tone="old" label="Outdated" /><ToneChip tone="miss" label="Missing" />
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
}
