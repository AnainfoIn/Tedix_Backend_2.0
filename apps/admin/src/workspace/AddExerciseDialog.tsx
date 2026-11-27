import { Box, CircularProgress, Dialog, Typography } from '@mui/material';
import { useState } from 'react';
import { ApiError } from '../api';
import { TYPES } from './exerciseModel';
import { Shown, X } from './exerciseUi';
import { createExercise, ImportItem, ImportPreview, ImportQuestion, previewImport, saveImport } from './types';

/** Types whose plain sums ("2+3=5") the generateQuestion module turns into a template with new numbers each time. */
const TEMPLATE_TYPES = [2, 7, 10];

const PLACEHOLDER: Record<number, string> = {
  1: '1/2 = 0.5\n1/4 = 0.25',
  2: 'Cat face 7 × 8? Answer: 56\nCapitala Frantei? a) Paris b) Lyon. Answer: Paris',
  7: '2+3=5\n12 - ? = 7',
  10: '2, 4, 6, ?\n3, 6, 12, 24',
};

/** The answer of a read question, for the review list. */
function answerOf(q: ImportQuestion): string[] {
  const opts = q.groups.flatMap((g) => g.options);
  switch (q.questionType) {
    case 7: return [`${q.groups.length} pairs`];
    case 4: return [`${q.groups[0]?.options.length ?? 0} rows to match`];
    case 3: return opts.filter((o) => o.sequenceNumber != null).sort((a, b) => a.sequenceNumber! - b.sequenceNumber!).map((o) => o.option);
    case 12: return [`${q.groups.length} example rows`];
    case 11: return [`${q.groups.length} shapes`];
    case 13: return opts.filter((o) => o.isCorrect).map((o) => `${o.option} at ${o.sequenceNumber}`);
    default: return opts.filter((o) => o.isCorrect).map((o) => o.option);
  }
}

/** What each type asks the student, and the answer fields the editor shows for it (design board 2). */
const ABOUT: Record<number, [string, string]> = {
  1: ['Students tap two cards that belong together.', 'Pairs of cards'],
  2: ['One correct answer among the options. Also used for True / False.', 'Options, one correct'],
  3: ['Students select every correct option.', 'Options, one or more correct'],
  4: ['A card with the question on the front and the answer on the back.', 'Back of the card'],
  5: ['Place or read labelled points on a number line.', 'Range, points and their ticks'],
  6: ['Match each item on the left with one on the right.', 'Rows of left and right items'],
  7: ['Drag tiles into the [Blank] slots of the question.', 'Mode, tiles and which blank each fills'],
  8: ['Tap the wrong part of an expression, then answer a cross question.', 'Expression parts, cross question'],
  9: ['Build the expression from pieces, in the right order.', 'Pieces and their build order'],
  10: ['Find the missing term of a sequence.', 'Terms, hidden term marked'],
  11: ['Find the missing number in a set of shapes.', 'Shapes and their vertex values'],
  12: ['Find the rule from input → output examples.', 'Example rows, hidden output marked'],
};

/** The next name in the micro lesson's own pattern: "M1: Exercitiu 6" is followed by "M1: Exercitiu 7". */
export function suggestName(names: string[]): string {
  let best: { prefix: string; n: number } | null = null;
  for (const name of names) {
    const m = /^(.*?)(\d+)\s*$/.exec(name.trim());
    if (m && (!best || Number(m[2]) >= best.n)) best = { prefix: m[1], n: Number(m[2]) };
  }
  const taken = new Set(names.map((n) => n.trim().toLowerCase()));
  let n = best ? best.n + 1 : names.length + 1;
  const make = (k: number) => (best ? `${best.prefix}${k}` : `Exercise ${k}`);
  while (taken.has(make(n).toLowerCase())) n += 1;
  return make(n);
}

/**
 * "Add exercise" (design board 2): name, AHA and one of the 12 types. Creating it adds the exercise
 * at the end of the micro lesson and opens the editor with that type's answer fields.
 */
export function AddExerciseDialog(props: {
  microLessonId: number; microLessonName: string; names: string[];
  onClose: () => void; onCreated: (id: number, questionType: number) => Promise<void> | void;
}) {
  const [name, setName] = useState(() => suggestName(props.names));
  const [isAha, setIsAha] = useState(false);
  const [picked, setPicked] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const type = TYPES.find((t) => t.n === picked)!;
  // Paste questions with their answers: read into exercises of the picked type, reviewed before saving.
  const [text, setText] = useState('');
  const [makeTemplates, setMakeTemplates] = useState(true);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [firstMade, setFirstMade] = useState<number | null>(null);
  const pasting = !!text.trim();
  const kept = preview ? preview.items.filter((_, i) => keep[i]) : [];

  const failText = (e: unknown) => {
    const body = e instanceof ApiError ? (e.body as { problems?: string[]; message?: string } | null) : null;
    return [body?.message, ...(body?.problems ?? [])].filter(Boolean).join('. ') || (e as Error).message;
  };

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await previewImport({ type: picked, text, generate: makeTemplates });
      setPreview(p);
      setKeep(p.items.map((it) => it.kind === 'template' || !it.problems.length));
    } catch (e) {
      setError(failText(e));
    } finally {
      setBusy(false);
    }
  };

  const saveAll = async () => {
    setBusy(true);
    setError(null);
    try {
      const used = [...props.names];
      const items = kept.map((it, i) => {
        const n = i === 0 ? name.trim() : suggestName(used);
        used.push(n);
        return { ...it, name: n };
      });
      const r = await saveImport({ microLessonId: props.microLessonId, isAha, items });
      const first = firstMade ?? r.created[0]?.exerciseId ?? null;
      if (!r.failed.length && first != null) {
        await props.onCreated(first, type.legacy[0]);
        return;
      }
      // Keep only what could not be saved, with why; the rest is already in the micro lesson.
      const failedAt = new Set(r.failed.map((f) => f.index));
      const left = kept.filter((_, i) => failedAt.has(i));
      setFirstMade(first);
      setPreview(preview && { ...preview, items: left });
      setKeep(left.map(() => true));
      setError(`${r.created.length} created. Not saved: ${r.failed.map((f) => `${f.name}: ${f.problems.join(', ')}`).join('; ')}`);
      setBusy(false);
    } catch (e) {
      setError(failText(e));
      setBusy(false);
    }
  };

  const close = () => (firstMade != null ? props.onCreated(firstMade, type.legacy[0]) : props.onClose());

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await createExercise({ microLessonId: props.microLessonId, name, isAha });
      await props.onCreated(data.id, type.legacy[0]);
    } catch (e) {
      const body = e instanceof ApiError ? (e.body as { problems?: string[] } | null) : null;
      setError(body?.problems?.join('. ') ?? (e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : close} maxWidth={false} aria-labelledby="add-exercise-title"
      PaperProps={{ sx: { width: '100%', maxWidth: 1040, borderRadius: '14px', fontFamily: 'Inter, system-ui, sans-serif', color: X.text } }}>
      <Box sx={{ p: '20px 24px 12px', display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box sx={{ flex: 1 }}>
          <Typography id="add-exercise-title" component="h2" sx={{ m: 0, fontSize: 20, fontWeight: 700 }}>Add an exercise to {props.microLessonName}</Typography>
          <Typography sx={{ mt: 0.5, color: X.muted, fontSize: 14 }}>
            Pick its type. The type sets which answer fields the editor shows, and can't be changed later without clearing the answers.
          </Typography>
        </Box>
        <Box component="button" type="button" aria-label="Close" onClick={close} disabled={busy}
          sx={{ width: 36, height: 36, border: 0, bgcolor: 'transparent', borderRadius: '8px', color: X.muted, cursor: 'pointer', fontSize: 18 }}>✕</Box>
      </Box>

      <Box sx={{ p: '8px 24px 0', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 2fr) minmax(0, 1fr)' }, gap: 2 }}>
        <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: 13, fontWeight: 600 }}>
          Name
          <input type="text" value={name} onChange={(e) => { setName(e.target.value); setError(null); }} maxLength={100} autoFocus
            style={{ height: 38, border: '1px solid #C5CAD3', borderRadius: 8, padding: '0 12px', font: '400 14px Inter, sans-serif', color: X.text }} />
        </Box>
        <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, fontSize: 14, pt: { xs: 0, sm: '22px' } }}>
          <input type="checkbox" checked={isAha} onChange={(e) => setIsAha(e.target.checked)} style={{ width: 18, height: 18, accentColor: X.blue }} />AHA exercise
        </Box>
      </Box>

      <Box role="radiogroup" aria-label="Exercise type"
        sx={{ p: '18px 24px', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
        {TYPES.map((t) => {
          const on = t.n === picked;
          const off = !t.legacy.length;
          const [desc, fields] = ABOUT[t.n];
          return (
            <Box key={t.n} component="button" type="button" role="radio" aria-checked={on} disabled={off}
              title={off ? 'Not available yet: the student app does not support this type' : undefined}
              onClick={() => { setPicked(t.n); setPreview(null); }}
              sx={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, textAlign: 'left', p: '14px 16px', borderRadius: '10px', minHeight: 124,
                font: 'inherit', color: X.text, cursor: 'pointer',
                ...(on ? { border: `2px solid ${X.blue}`, bgcolor: '#F5F9FF' } : { border: `1px solid ${X.line}`, bgcolor: '#fff', m: '1px' }),
                '&:hover:not(:disabled)': { borderColor: X.blue },
                '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
              }}>
              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Box component="span" sx={{ width: 28, height: 28, borderRadius: '7px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', ...(on ? { bgcolor: X.blue, color: '#fff' } : { bgcolor: '#EAF1FD', color: '#174AA6' }) }}>{t.n}</Box>
                <Box component="span" sx={{ fontSize: 15, fontWeight: 600 }}>{t.name}</Box>
              </Box>
              <Box component="span" sx={{ fontSize: 13, color: X.muted, lineHeight: 1.45 }}>{desc}</Box>
              <Box component="span" sx={{ fontSize: 12, color: '#174AA6' }}>{off ? 'Not available yet in the student app' : `Answers: ${fields}`}</Box>
            </Box>
          );
        })}
      </Box>

      <Box sx={{ p: '0 24px 18px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box component="label" htmlFor="paste-questions" sx={{ fontSize: 13, fontWeight: 600 }}>
          Paste questions with their answers <Box component="span" sx={{ fontWeight: 400, color: X.muted }}>(optional: one exercise is made for each question, as {type.name})</Box>
        </Box>
        <textarea id="paste-questions" rows={4} value={text} disabled={busy}
          placeholder={PLACEHOLDER[picked] ?? 'One question per line or paragraph, with its answer'}
          onChange={(e) => { setText(e.target.value); setPreview(null); setError(null); }}
          style={{ border: '1px solid #C5CAD3', borderRadius: 8, padding: '8px 12px', font: '400 14px Inter, sans-serif', color: X.text, resize: 'vertical' }} />
        {pasting && TEMPLATE_TYPES.includes(picked) && (
          <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 13, color: X.muted }}>
            <input type="checkbox" checked={makeTemplates} disabled={busy} onChange={(e) => { setMakeTemplates(e.target.checked); setPreview(null); }} style={{ accentColor: X.blue }} />
            Turn plain sums like 2+3=5 into a template that gives new numbers each time
          </Box>
        )}
        {preview && (
          <Box role="list" aria-label="Questions read" sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 340, overflow: 'auto', border: `1px solid ${X.line}`, borderRadius: '10px', p: 1.25 }}>
            <Box sx={{ fontSize: 12, color: X.muted }}>
              {preview.source === 'template' ? 'Read as templates: each one gives new numbers every time it is opened.' : 'Read by Claude. Check each one; you can edit them in the editor after saving.'}
            </Box>
            {preview.items.map((it: ImportItem, i) => (
              <Box role="listitem" key={i} component="label" sx={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr)', gap: 1, alignItems: 'start', p: 1, borderRadius: '8px', bgcolor: keep[i] ? '#F5F9FF' : '#fff', border: `1px solid ${X.line}` }}>
                <input type="checkbox" checked={!!keep[i]} disabled={busy} aria-label={`Create exercise ${i + 1}`}
                  onChange={(e) => setKeep(keep.map((k, j) => (j === i ? e.target.checked : k)))} style={{ marginTop: 4, accentColor: X.blue }} />
                {it.kind === 'template' ? (
                  <Box sx={{ minWidth: 0, fontSize: 13 }}>
                    <Box sx={{ fontWeight: 600 }}>Template: {it.pattern}</Box>
                    <Box sx={{ color: X.muted }}>{it.variables.join('; ')}</Box>
                    {it.questions.map((q, k) => <Box key={k} sx={{ color: X.muted }}>Example: {q.questionBody ?? q.question} → {q.answer}</Box>)}
                  </Box>
                ) : (
                  <Box sx={{ minWidth: 0, fontSize: 13, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <Shown value={it.question.question} size={14} />
                    {it.question.questionBody && <Shown value={it.question.questionBody} size={14} />}
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', color: '#1E7D4F' }}>
                      Answer: {answerOf(it.question).map((a, k) => <Shown key={k} value={a} size={13} />)}
                    </Box>
                    {!!it.problems.length && <Box sx={{ color: '#B3261E', fontSize: 12 }}>To fix before it can be saved: {it.problems.join('; ')}</Box>}
                  </Box>
                )}
              </Box>
            ))}
            {preview.skipped.map((sk, i) => (
              <Box key={`s${i}`} sx={{ fontSize: 12, color: X.muted }}>Not used: “{sk.text}” ({sk.reason})</Box>
            ))}
          </Box>
        )}
      </Box>

      <Box sx={{ p: '14px 24px', borderTop: `1px solid ${X.line}`, display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
        <Box component="span" sx={{ color: X.muted, fontSize: 13 }}>Selected: <Box component="strong" sx={{ color: X.text }}>{type.name}</Box></Box>
        {error && <Box component="span" role="alert" sx={{ color: '#B3261E', fontSize: 13 }}>{error}</Box>}
        <Box sx={{ flex: 1 }} />
        <Box component="button" type="button" onClick={close} disabled={busy}
          sx={{ height: 38, px: 2, border: 0, bgcolor: 'transparent', color: X.text, fontWeight: 600, fontSize: 14, cursor: 'pointer', borderRadius: '8px' }}>Cancel</Box>
        <Box component="button" type="button" onClick={!pasting ? create : preview ? saveAll : read}
          disabled={busy || name.trim().length < 2 || (!!preview && !kept.length)}
          sx={{ height: 38, px: 2.25, border: 0, borderRadius: '8px', bgcolor: X.blue, color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1, '&:disabled': { opacity: 0.6, cursor: 'default' } }}>
          {busy && <CircularProgress size={14} sx={{ color: '#fff' }} />}
          {!pasting ? 'Create and open editor' : !preview ? (busy ? 'Reading…' : 'Read questions') : `Create ${kept.length} exercise${kept.length === 1 ? '' : 's'}`}
        </Box>
      </Box>
    </Dialog>
  );
}
