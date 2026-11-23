import AutorenewIcon from '@mui/icons-material/Autorenew';
import CheckIcon from '@mui/icons-material/Check';
import { Alert, Box, Button, CircularProgress, Divider, Stack, TextField, Typography } from '@mui/material';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNotify } from 'react-admin';
import { Link } from 'react-router-dom';
import { Code, shortCode, ToneChip } from './MicroLessonWorkspace';
import {
  CATEGORY_LABELS, indexTranslations, ItemType, Language, QUESTION_FIELDS, QUESTION_TYPE_LABELS, saveTranslation, Status, STATUS_LABEL,
  STATUS_TONE, statusOf, summarize, translateLesson, Workspace,
} from './types';

const plain = (s: string | null | undefined) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

type Key = string; // `${type}:${id}:${field}`

/** One exercise: its questions, hints, solutions and options, in the original or in a translation. */
export function ExercisePane(props: {
  ws: Workspace; exerciseId: number; language: Language | null; original: Language | null; isOriginal: boolean; canEdit: boolean; onSaved: () => Promise<void> | void;
}) {
  const { ws, language, original, isOriginal, canEdit } = props;
  const notify = useNotify();
  const exercise = ws.exercises.find((e) => e.id === props.exerciseId);
  const index = ws.exercises.findIndex((e) => e.id === props.exerciseId);

  // Source fields of this exercise, in display order.
  const fields = useMemo(() => {
    if (!exercise) return [] as Array<{ key: Key; type: ItemType; id: number; field: string; label: string; source: string; multiline?: boolean }>;
    const out: Array<{ key: Key; type: ItemType; id: number; field: string; label: string; source: string; multiline?: boolean }> = [
      { key: `exercise:${exercise.id}:name`, type: 'exercise', id: exercise.id, field: 'name', label: 'Exercise name', source: exercise.name },
    ];
    exercise.questions.forEach((q) => {
      for (const { field, label } of QUESTION_FIELDS) {
        if (q[field]?.trim()) out.push({ key: `question:${q.id}:${field}`, type: 'question', id: q.id, field, label, source: q[field]!, multiline: true });
      }
      const groups = groupsOf(q.options);
      groups.forEach(([, opts], g) => opts.forEach((o, j) => out.push({
        key: `option:${o.id}:option`, type: 'option', id: o.id, field: 'option',
        label: `${groups.length > 1 ? `Group ${g + 1} · ` : ''}Option ${j + 1}${o.isCorrect ? ' (correct)' : ''}`, source: o.option,
      })));
    });
    return out;
  }, [exercise]);

  const get = indexTranslations(ws.translations);
  const initial = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.key, language && !isOriginal ? get(f.type, f.id, f.field, language.id)?.value ?? '' : ''])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fields, ws.translations, language?.id, isOriginal],
  );
  const [draft, setDraft] = useState<Record<Key, string>>(initial);
  const [busy, setBusy] = useState<null | 'save' | 'review' | 'ai'>(null);
  useEffect(() => setDraft(initial), [initial]);

  if (!exercise) return <Alert severity="warning">This exercise no longer exists.</Alert>;
  const qIds = new Set(exercise.questions.map((q) => q.id));
  const oIds = new Set(exercise.questions.flatMap((q) => q.options.map((o) => o.id)));
  const summary = language && !isOriginal
    ? summarize(ws, language.id, (t, id) => (t === 'exercise' && id === exercise.id) || (t === 'question' && qIds.has(id)) || (t === 'option' && oIds.has(id)))
    : null;
  const st = summary ? statusOf(summary) : null;
  const changed = fields.filter((f) => (draft[f.key] ?? '') !== (initial[f.key] ?? ''));

  const persist = async (status: Status) => {
    if (!language) return;
    setBusy(status === 'reviewed' ? 'review' : 'save');
    try {
      const list = status === 'reviewed' ? fields.filter((f) => draft[f.key]?.trim()) : changed;
      for (const f of list) {
        await saveTranslation({ itemType: f.type, itemId: f.id, field: f.field, languageId: language.id, value: draft[f.key] ?? '', status });
      }
      notify(status === 'reviewed' ? `${language.name} exercise marked as reviewed` : `${language.name} exercise saved`, { type: 'info' });
      await props.onSaved();
    } catch (e) {
      notify((e as Error).message, { type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const retranslate = async () => {
    if (!language) return;
    setBusy('ai');
    try {
      const [r] = await translateLesson(ws.lesson.id, { languageIds: [language.id], include: { text: false, exercises: true }, replaceEdited: false, onlyMissing: true });
      if (r?.error) notify(r.error, { type: 'error' });
      else notify(`${r?.translated ?? 0} exercise texts translated into ${language.name}`, { type: 'info' });
      await props.onSaved();
    } catch (e) {
      notify((e as Error).message, { type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const translatedName = !isOriginal && language ? draft[`exercise:${exercise.id}:name`] : '';

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography sx={{ fontWeight: 600, fontSize: 16 }}>{index + 1}. {translatedName || exercise.name}</Typography>
        {isOriginal ? <ToneChip tone="orig" label={`Original · ${original?.name ?? ''}`} /> : st && <ToneChip tone={st.tone} label={st.label} />}
        <Box sx={{ flex: 1 }} />
        <Button component={Link} to={`/exercises/${exercise.id}/show`} size="small">{isOriginal ? 'Edit exercise' : `Change in ${original?.name}`}</Button>
      </Stack>

      <Box sx={{ bgcolor: '#f5f5f5', borderRadius: 1, px: 1.75, py: 1.25, display: 'flex', flexWrap: 'wrap', gap: '8px 20px', fontSize: 13.5, color: '#424242' }}>
        {!isOriginal && <span>Same in every language:</span>}
        <span>Type <b>{CATEGORY_LABELS[exercise.categoryType] ?? exercise.categoryType}</b></span>
        <span>AHA <b>{exercise.isAha ? 'Yes' : 'No'}</b></span>
        <span>Questions <b>{exercise.questions.length}</b></span>
        {exercise.questions.length > 0 && <span>Question types <b>{[...new Set(exercise.questions.map((q) => QUESTION_TYPE_LABELS[q.questionType] ?? q.questionType))].join(', ')}</b></span>}
      </Box>

      {isOriginal ? (
        <OriginalExercise exercise={exercise} />
      ) : (
        <>
          {summary && summary.missing === summary.total && (
            <Alert severity="info" action={canEdit && props.ws.aiConfigured ? (
              <Button color="inherit" size="small" onClick={retranslate} disabled={!!busy}>Translate with AI</Button>
            ) : undefined}>
              Not in {language?.name} yet. Translate it with AI or write it below.
            </Alert>
          )}
          {fields.map((f, i) => {
            const t = language ? get(f.type, f.id, f.field, language.id) : undefined;
            const firstOfQuestion = f.type === 'question' && f.field === QUESTION_FIELDS.find((q) => exercise.questions.find((x) => x.id === f.id)?.[q.field]?.trim())?.field;
            const qNo = exercise.questions.findIndex((q) => q.id === f.id) + 1;
            return (
              <Fragment key={f.key}>
                {firstOfQuestion && (
                  <>
                    {i > 1 && <Divider />}
                    <Typography variant="subtitle2">Question {qNo} · {QUESTION_TYPE_LABELS[exercise.questions[qNo - 1].questionType] ?? ''}</Typography>
                  </>
                )}
                <Box>
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <TextField
                      label={`${f.label} · ${language?.name}`} value={draft[f.key] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      fullWidth multiline={f.multiline} minRows={f.multiline ? 2 : undefined} disabled={!canEdit} size={f.type === 'option' ? 'small' : 'medium'}
                    />
                    {t && <ToneChip tone={t.outdated ? 'old' : STATUS_TONE[t.status]} label={t.outdated ? 'Outdated' : STATUS_LABEL[t.status]} sx={{ mt: 1.5 }} />}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, display: 'block' }}>
                    <Code>{original ? shortCode(original) : ''}</Code> {plain(f.source)}
                  </Typography>
                </Box>
              </Fragment>
            );
          })}
          {canEdit && (
            <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
              <Typography variant="caption" color="text.secondary" sx={{ flex: '1 1 240px', alignSelf: 'center' }}>
                Formulas are copied unchanged. Saving keeps your {language?.name} wording; the Auto label goes away.
              </Typography>
              {props.ws.aiConfigured && (
                <Button onClick={retranslate} disabled={!!busy} startIcon={busy === 'ai' ? <CircularProgress size={16} /> : <AutorenewIcon />}>Translate missing</Button>
              )}
              <Button color="inherit" disabled={!changed.length || !!busy} onClick={() => setDraft(initial)}>Discard</Button>
              {!changed.length && summary && summary.missing < summary.total && (
                <Button variant="outlined" disabled={!!busy} onClick={() => persist('reviewed')}>Mark reviewed</Button>
              )}
              <Button variant="contained" disabled={!changed.length || !!busy} onClick={() => persist('edited')}
                startIcon={busy === 'save' ? <CircularProgress size={16} /> : undefined}>
                Save {language?.name}
              </Button>
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}

function OriginalExercise({ exercise }: { exercise: Workspace['exercises'][number] }) {
  if (!exercise.questions.length) {
    return <Alert severity="info">No questions yet. Open the exercise to add question banks, option groups and options.</Alert>;
  }
  return (
    <Stack spacing={2} divider={<Divider />}>
      {exercise.questions.map((q, i) => (
        <Stack key={q.id} spacing={1}>
          <Typography variant="subtitle2">Question {i + 1} · {QUESTION_TYPE_LABELS[q.questionType] ?? q.questionType}</Typography>
          {QUESTION_FIELDS.filter(({ field }) => q[field]?.trim()).map(({ field, label }) => (
            <Box key={field}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="body2">{plain(q[field])}</Typography>
            </Box>
          ))}
          {q.options.length > 0 && (
            <Box>
              {groupsOf(q.options).map(([groupId, opts], g, all) => (
                <Box key={groupId} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 1.5, py: 1, mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">{all.length > 1 ? `Option group ${g + 1}` : 'Option group'} · {opts.length} option{opts.length === 1 ? '' : 's'}</Typography>
                  {opts.map((o, j) => (
                    <Stack key={o.id} direction="row" spacing={1} alignItems="center" sx={{ py: 0.5 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ width: 22 }}>{j + 1}.</Typography>
                      <Typography variant="body2" sx={{ flex: 1 }}>{plain(o.option)}</Typography>
                      {o.sequenceNumber != null && <Typography variant="caption" color="text.secondary">Order {o.sequenceNumber}</Typography>}
                      {o.isCorrect && <ToneChip tone="rev" label={<Stack direction="row" alignItems="center" gap={0.5}><CheckIcon sx={{ fontSize: 14 }} />Correct</Stack>} />}
                    </Stack>
                  ))}
                </Box>
              ))}
            </Box>
          )}
          <Button component={Link} to={`/question_banks/${q.id}/show`} size="small" sx={{ alignSelf: 'flex-start' }}>Open question, option groups and options</Button>
        </Stack>
      ))}
    </Stack>
  );
}

/** Options of a question in their option groups, in the order the groups come. */
function groupsOf<T extends { groupId: number }>(options: T[]): Array<[number, T[]]> {
  const m = new Map<number, T[]>();
  for (const o of options) m.set(o.groupId, [...(m.get(o.groupId) ?? []), o]);
  return [...m.entries()];
}
