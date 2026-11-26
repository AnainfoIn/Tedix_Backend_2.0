import { Box, CircularProgress, Dialog, Typography } from '@mui/material';
import { useState } from 'react';
import { ApiError } from '../api';
import { TYPES } from './exerciseModel';
import { X } from './exerciseUi';
import { createExercise } from './types';

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
    <Dialog open onClose={busy ? undefined : props.onClose} maxWidth={false} aria-labelledby="add-exercise-title"
      PaperProps={{ sx: { width: '100%', maxWidth: 1040, borderRadius: '14px', fontFamily: 'Inter, system-ui, sans-serif', color: X.text } }}>
      <Box sx={{ p: '20px 24px 12px', display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box sx={{ flex: 1 }}>
          <Typography id="add-exercise-title" component="h2" sx={{ m: 0, fontSize: 20, fontWeight: 700 }}>Add an exercise to {props.microLessonName}</Typography>
          <Typography sx={{ mt: 0.5, color: X.muted, fontSize: 14 }}>
            Pick its type. The type sets which answer fields the editor shows, and can't be changed later without clearing the answers.
          </Typography>
        </Box>
        <Box component="button" type="button" aria-label="Close" onClick={props.onClose} disabled={busy}
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
              onClick={() => setPicked(t.n)}
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

      <Box sx={{ p: '14px 24px', borderTop: `1px solid ${X.line}`, display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
        <Box component="span" sx={{ color: X.muted, fontSize: 13 }}>Selected: <Box component="strong" sx={{ color: X.text }}>{type.name}</Box></Box>
        {error && <Box component="span" role="alert" sx={{ color: '#B3261E', fontSize: 13 }}>{error}</Box>}
        <Box sx={{ flex: 1 }} />
        <Box component="button" type="button" onClick={props.onClose} disabled={busy}
          sx={{ height: 38, px: 2, border: 0, bgcolor: 'transparent', color: X.text, fontWeight: 600, fontSize: 14, cursor: 'pointer', borderRadius: '8px' }}>Cancel</Box>
        <Box component="button" type="button" onClick={create} disabled={busy || name.trim().length < 2}
          sx={{ height: 38, px: 2.25, border: 0, borderRadius: '8px', bgcolor: X.blue, color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1, '&:disabled': { opacity: 0.6, cursor: 'default' } }}>
          {busy && <CircularProgress size={14} sx={{ color: '#fff' }} />}Create and open editor
        </Box>
      </Box>
    </Dialog>
  );
}
