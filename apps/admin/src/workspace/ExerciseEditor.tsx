import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useNotify } from 'react-admin';
import { ApiError } from '../api';
import { AnswersEditor } from './AnswersEditor';
import { ExercisePhone, PhoneContent } from './ExercisePhone';
import {
  blankCount, bodyOf, DGroup, Draft, draftOf, group, opt, problemsOf, sameDraft, TYPES, typeOf,
} from './exerciseModel';
import { ChipTone, ContentField, FormRow, LangCode, Segmented, Shown, StatusChip, X } from './exerciseUi';
import { shortCode } from './MicroLessonWorkspace';
import {
  deleteExercise, indexTranslations, ItemType, Language, QUESTION_FIELDS, saveExercise, saveTranslation, Status, statusOf, summarize,
  translateLesson, Workspace,
} from './types';

type Props = {
  ws: Workspace; exerciseId: number; language: Language | null; original: Language | null; isOriginal: boolean; canEdit: boolean;
  onSaved: () => Promise<void> | void; onClose: () => void; onLanguage: (id: number) => void;
  /** Type picked in "Add exercise" for an exercise that has no question yet. */
  initialType?: number;
};

/**
 * The screen that opens when an exercise is clicked on the micro lesson page (design board 3):
 * name, type and AHA in the header, language tabs, the content fields of its type with a mobile
 * preview, and the checks it must pass before saving (board 4).
 */
export function ExerciseEditor(props: Props) {
  const { ws, language, original, isOriginal } = props;
  const exercise = ws.exercises.find((e) => e.id === props.exerciseId);
  const index = ws.exercises.findIndex((e) => e.id === props.exerciseId);
  const [qIdx, setQIdx] = useState(0);
  if (!exercise) return null;
  const question = exercise.questions[Math.min(qIdx, Math.max(0, exercise.questions.length - 1))];

  const shell = (header: ReactNode, body: ReactNode) => (
    <Box component="section" aria-label={`Exercise ${index + 1}`} sx={{ bgcolor: '#fff', borderTop: `1px solid ${X.blueLine}`, borderBottom: `1px solid ${X.line}` }}>
      {header}
      <Tabs {...props} />
      {exercise.questions.length > 1 && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', px: '20px', pt: 1.5, flexWrap: 'wrap', fontSize: 13 }}>
          <Box component="span" sx={{ color: X.muted }}>This exercise has {exercise.questions.length} questions:</Box>
          {exercise.questions.map((q, i) => (
            <Box key={q.id} component="button" type="button" onClick={() => setQIdx(i)} aria-pressed={i === qIdx}
              sx={{ border: `1px solid ${i === qIdx ? X.blue : X.field}`, bgcolor: i === qIdx ? X.blueSoft : '#fff', color: i === qIdx ? X.blueDark : X.text, borderRadius: '8px', px: 1.25, height: 28, cursor: 'pointer', fontWeight: i === qIdx ? 600 : 400 }}>
              Question {i + 1} · {typeOf(q.questionType).name}
            </Box>
          ))}
        </Box>
      )}
      {body}
    </Box>
  );

  return isOriginal || !language ? (
    <OriginalEditor key={`${exercise.id}:${question?.id ?? 'new'}`} {...props} exercise={exercise} question={question} index={index} shell={shell} />
  ) : (
    <TranslationEditor key={`${exercise.id}:${language.id}:${question?.id ?? 'none'}`} {...props} exercise={exercise} question={question} index={index} shell={shell} />
  );
}

type Inner = Props & {
  exercise: Workspace['exercises'][number]; question: Workspace['exercises'][number]['questions'][number] | undefined; index: number;
  shell: (header: ReactNode, body: ReactNode) => JSX.Element;
};

/* ------------------------------------------------------------------ header + tabs */

function Header(props: { index: number; nameLabel: string; name: string; onName?: (v: string) => void; questionType: number | null; isAha: boolean; onAha?: (v: boolean) => void; badge?: ReactNode; onDelete?: () => void; onClose: () => void }) {
  const t = props.questionType == null ? null : typeOf(props.questionType);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: '20px', py: 1.5, bgcolor: X.blueSoft, borderBottom: `1px solid ${X.blueLine}`, flexWrap: 'wrap' }}>
      <Box component="span" sx={{ color: X.blueDark, fontWeight: 600 }}>{props.index + 1}.</Box>
      <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 12, color: X.muted, flex: '0 1 auto', minWidth: 0 }}>
        {props.nameLabel}
        <input type="text" value={props.name} readOnly={!props.onName} onChange={(e) => props.onName?.(e.target.value)}
          style={{ height: 34, width: 'min(380px, 60vw)', border: `1px solid ${X.blueLine}`, borderRadius: 8, padding: '0 10px', font: '600 15px Inter, sans-serif', color: X.text, background: '#fff' }} />
      </Box>
      {t && (
        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: '6px', px: 1.25, py: '5px', borderRadius: '8px', bgcolor: '#fff', border: `1px solid ${X.blueLine}`, color: X.blueDark, fontWeight: 600, fontSize: 13 }}>
          <Box component="span" sx={{ width: 20, height: 20, borderRadius: '5px', bgcolor: X.blue, color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.n}</Box>
          {t.name}
        </Box>
      )}
      <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 13 }}>
        <input type="checkbox" checked={props.isAha} disabled={!props.onAha} onChange={(e) => props.onAha?.(e.target.checked)} style={{ width: 16, height: 16, accentColor: X.blue }} />AHA
      </Box>
      {props.badge}
      <Box sx={{ flex: 1 }} />
      {props.onDelete && (
        <Box component="button" type="button" onClick={props.onDelete}
          sx={{ height: 32, px: 1.5, border: '1px solid #F0C2BE', borderRadius: '8px', bgcolor: '#fff', color: '#B3261E', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Delete</Box>
      )}
      <Box component="button" type="button" onClick={props.onClose}
        sx={{ height: 32, px: 1.75, border: 0, borderRadius: '8px', bgcolor: X.blue, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Close</Box>
    </Box>
  );
}

function exerciseFilter(e: Workspace['exercises'][number]) {
  const q = new Set(e.questions.map((x) => x.id));
  const o = new Set(e.questions.flatMap((x) => x.options.map((y) => y.id)));
  return (t: ItemType, id: number) => (t === 'exercise' && id === e.id) || (t === 'question' && q.has(id)) || (t === 'option' && o.has(id));
}

function Tabs(props: Props) {
  const { ws, language, original } = props;
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const exercise = ws.exercises.find((e) => e.id === props.exerciseId)!;
  const others = ws.languages.filter((l) => l.id !== original?.id);
  const list = [...(original ? [original] : []), ...others];
  if (!list.length) return null;
  const isOriginal = !language || language.id === original?.id;

  const translateMissing = async () => {
    if (!language) return;
    setBusy(true);
    try {
      const only: string[] = [`exercise:${exercise.id}:name`];
      for (const q of exercise.questions) {
        for (const { field } of QUESTION_FIELDS) if (q[field]?.trim()) only.push(`question:${q.id}:${field}`);
        for (const o of q.options) only.push(`option:${o.id}:option`);
      }
      const [r] = await translateLesson(ws.lesson.id, { languageIds: [language.id], include: { text: false, exercises: true }, replaceEdited: false, onlyMissing: true, only });
      if (r?.error) notify(r.error, { type: 'error' });
      else notify(`${r?.translated ?? 0} texts of this exercise translated into ${language.name}`, { type: 'info' });
      await props.onSaved();
    } catch (e) {
      notify((e as Error).message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box role="tablist" aria-label="Language" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', borderBottom: `1px solid ${X.line}` }}>
      {list.map((l) => {
        const on = l.id === (language?.id ?? original?.id);
        const isOrig = l.id === original?.id;
        const st = isOrig ? null : statusOf(summarize(ws, l.id, exerciseFilter(exercise)));
        const sub = isOrig ? 'Exercise written in this language' : st!.label === 'Not translated' ? 'Not translated' : st!.label;
        return (
          <Box key={l.id} component="button" type="button" role="tab" aria-selected={on} onClick={() => props.onLanguage(l.id)}
            sx={{
              border: 0, borderBottom: `3px solid ${on ? X.blue : 'transparent'}`, bgcolor: on ? '#F5F9FF' : 'transparent', color: on ? '#0D47A1' : X.text,
              px: 2.5, py: 1.25, minWidth: 150, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '2px', cursor: 'pointer', font: 'inherit',
            }}>
            <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center', fontSize: 15, fontWeight: 500 }}>
              <LangCode>{shortCode(l)}</LangCode>{l.name}
              {isOrig && <Box component="span" sx={{ fontSize: 11, px: '7px', py: '1px', borderRadius: 999, bgcolor: X.blue, color: '#fff' }}>Original</Box>}
            </Box>
            <Box component="span" sx={{ fontSize: 12, color: /missing|Not translated|Outdated/.test(sub) ? '#A33B00' : X.muted }}>{sub}</Box>
          </Box>
        );
      })}
      <Box sx={{ flex: 1 }} />
      {!isOriginal && props.canEdit && ws.aiConfigured && (
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2 }}>
          <Box component="button" type="button" onClick={translateMissing} disabled={busy}
            sx={{ height: 34, px: 1.75, border: `1px solid ${X.blueLine}`, borderRadius: '8px', bgcolor: '#fff', color: X.blue, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', gap: 1, alignItems: 'center' }}>
            {busy && <CircularProgress size={14} />}Translate missing with AI
          </Box>
        </Box>
      )}
    </Box>
  );
}

function Columns({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <Box sx={{ p: '18px 20px 22px', display: 'flex', flexWrap: 'wrap', gap: '28px', alignItems: 'flex-start' }}>
      <Box sx={{ flex: '999 1 600px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>{left}</Box>
      {right}
    </Box>
  );
}

function ContentHeading({ chip, original, intro }: { chip: string; original: boolean; intro: string }) {
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <Typography component="h3" sx={{ m: 0, fontSize: 18, fontWeight: 600 }}>Content</Typography>
        <Box component="span" sx={{ fontSize: 12, px: '9px', py: '2px', borderRadius: 999, fontWeight: 600, ...(original ? { bgcolor: X.blue, color: '#fff' } : { bgcolor: X.blueSoft, color: X.blueDark }) }}>{chip}</Box>
      </Box>
      <Box component="p" sx={{ m: '-6px 0 0', fontSize: 13, color: X.muted }}>{intro}</Box>
    </>
  );
}

function SaveBar({ note, children }: { note: ReactNode; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', pt: 1.5, borderTop: `1px solid ${X.line}`, flexWrap: 'wrap' }}>
      <Box component="span" sx={{ fontSize: 12, color: X.muted, flex: '1 1 240px' }}>{note}</Box>
      {children}
    </Box>
  );
}

const ghost = { height: 38, px: 2, border: 0, bgcolor: 'transparent', fontWeight: 600, fontSize: 14, color: X.text, borderRadius: '8px', cursor: 'pointer', '&:disabled': { color: '#9AA1AD', cursor: 'default' } };
const outline = { height: 38, px: 2, border: `1px solid ${X.blueLine}`, borderRadius: '8px', bgcolor: '#fff', color: X.blue, fontWeight: 600, fontSize: 14, cursor: 'pointer', '&:disabled': { color: '#9AA1AD', cursor: 'default' } };
const primary = { height: 38, px: 2.25, border: 0, borderRadius: '8px', bgcolor: X.blue, color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1, '&:disabled': { bgcolor: '#C9D6EE', cursor: 'not-allowed' } };

/* ------------------------------------------------------------------ original language */

function starter(questionType: number): DGroup[] {
  switch (typeOf(questionType).n) {
    case 1: return [group([opt('', false, 1), opt('', false, 2)]), group([opt('', false, 1), opt('', false, 2)])];
    case 2: return [group([opt('', true, 1), opt('', false, 2)])];
    case 3: return [group([opt('', true, 1), opt('', false, 2), opt('', false, 3)])];
    case 4: return [group([opt('', true, 1)])];
    case 5: return [group([opt('a', true, null), opt('b', true, null)])];
    case 6: return [group([opt('', false, 1), opt('', false, 2), opt('', false, 3), opt('', false, 4)])];
    case 7: return [group([opt('', true, 1), opt('', false, null)])];
    case 8: return [group([opt('', false, 1), opt('', true, 2), opt('', false, 3)]), group([opt('', true, 1), opt('', false, 2)])];
    case 10: return [group([opt('', false, 1), opt('', false, 2), opt('', false, 3), opt('', true, 4)])];
    case 11: return [group([opt('', false, 1), opt('', false, 2), opt('', true, 3)], 'triangle')];
    case 12: return [group([opt('', false, 1), opt('', false, 2)]), group([opt('', false, 1), opt('', true, 2)])];
    default: return [];
  }
}

function OriginalEditor(props: Inner) {
  const { exercise, question, original, canEdit } = props;
  const notify = useNotify();
  const initialType = question ? undefined : props.initialType;
  const base = useMemo(() => {
    const draft = draftOf(exercise, question);
    return initialType == null ? draft : { ...draft, questionType: initialType, groups: starter(initialType) };
  }, [exercise, question, initialType]);
  const [d, setD] = useState<Draft>(base);
  const [picked, setPicked] = useState<number | null>(question ? question.questionType : initialType ?? null);
  const [busy, setBusy] = useState<null | 'save' | 'delete'>(null);
  const [confirm, setConfirm] = useState<null | 'delete' | 'close'>(null);
  const [serverProblems, setServerProblems] = useState<string[]>([]);
  useEffect(() => setD(base), [base]);
  const readOnly = !canEdit;
  const dirty = !sameDraft(d, base);
  const problems = picked == null ? [] : problemsOf(d);
  const t = picked == null ? null : typeOf(d.questionType);
  const origName = original?.name ?? 'the original language';
  const origCode = original ? shortCode(original) : '';
  const set = (next: Draft) => { setD(next); setServerProblems([]); };

  const save = async () => {
    setBusy('save');
    try {
      await saveExercise(exercise.id, bodyOf(d));
      notify('Exercise saved', { type: 'info' });
      await props.onSaved();
    } catch (e) {
      const body = e instanceof ApiError ? (e.body as { problems?: string[] } | null) : null;
      setServerProblems(body?.problems ?? [(e as Error).message]);
      notify((e as Error).message, { type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('delete');
    try {
      await deleteExercise(exercise.id);
      notify('Exercise deleted', { type: 'info' });
      props.onClose();
      await props.onSaved();
    } catch (e) {
      notify((e as Error).message, { type: 'error' });
      setBusy(null);
      setConfirm(null);
    }
  };

  const close = () => (dirty ? setConfirm('close') : props.onClose());

  const header = (
    <Header index={props.index} nameLabel="Name" name={d.name} onName={readOnly ? undefined : (v) => set({ ...d, name: v })} questionType={picked == null ? null : d.questionType}
      isAha={d.isAha} onAha={readOnly ? undefined : (v) => set({ ...d, isAha: v })}
      badge={dirty ? <StatusChip tone="New">Not saved</StatusChip> : undefined}
      onDelete={canEdit ? () => setConfirm('delete') : undefined} onClose={close} />
  );

  // No question yet: choose its type first (design board 2).
  if (picked == null) {
    return props.shell(header, (
      <Box sx={{ p: '18px 20px 22px', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 18 }}>Pick the exercise type</Typography>
        <Typography sx={{ fontSize: 13, color: X.muted, mt: '-6px' }}>The type sets which answer fields the editor shows, and can't be changed later without clearing the answers.</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 1.25 }}>
          {TYPES.map((ty) => (
            <Box key={ty.n} component="button" type="button" disabled={!ty.legacy.length || readOnly}
              onClick={() => { const qt = ty.legacy[0]; setPicked(qt); set({ ...d, questionType: qt, groups: starter(qt) }); }}
              sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, textAlign: 'left', p: '14px 16px', borderRadius: '10px', border: `1px solid ${X.line}`, bgcolor: '#fff', cursor: 'pointer', font: 'inherit', color: X.text, '&:hover:not(:disabled)': { borderColor: X.blue, bgcolor: '#F5F9FF' }, '&:disabled': { opacity: 0.5, cursor: 'not-allowed' } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 600 }}>
                <Box component="span" sx={{ width: 26, height: 26, borderRadius: '7px', bgcolor: X.blueSoft, color: X.blueDark, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ty.n}</Box>
                {ty.name}
              </Box>
              <Box sx={{ fontSize: 12.5, color: X.muted }}>{ty.legacy.length ? ty.task : 'Not in the app yet'}</Box>
            </Box>
          ))}
        </Box>
      </Box>
    ));
  }

  const isBlank = t!.n === 7;
  const left = (
    <>
      <ContentHeading chip={`Original · ${origName}`} original
        intro="Copy and paste into each field on its own. Use LaTeX to turn maths in pasted text into LaTeX in that field. The phone on the right updates as you type." />
      {isBlank ? (
        <>
          <FormRow label="Mode">
            <Segmented label="Mode" value={d.questionType} maxWidth={440}
              options={[[-1, 'Drag & Drop', true], [5, 'Sequence', readOnly], [3, 'Fill in the Blank', readOnly]]}
              onChange={(v) => v >= 0 && set({ ...d, questionType: v })} />
          </FormRow>
          <FormRow label="Instruction" required note="Short line shown above the statement.">
            <ContentField id="q" single value={d.question} readOnly={readOnly} onChange={(v) => set({ ...d, question: v })} placeholder={`Paste or type the ${origName} instruction`}
              error={!d.question.trim() ? 'Instruction is required.' : null} />
          </FormRow>
          <FormRow label="Statement with blanks" required note="The app gets this line split at each blank.">
            <BlankStatement value={d.questionBody} readOnly={readOnly} onChange={(v) => set({ ...d, questionBody: v })} />
          </FormRow>
        </>
      ) : (
        <>
          <ContentField id="q" label={t!.n === 4 ? 'Question (front of the card)' : 'Question'} rows={2} value={d.question} readOnly={readOnly}
            onChange={(v) => set({ ...d, question: v })} placeholder={`Paste or type the ${origName} question`} error={!d.question.trim() ? 'Question is required.' : null} />
          {(base.questionBody || t!.n === 1) && (
            <ContentField id="qb" label={t!.n === 1 ? 'Instruction (optional)' : 'Question body'} rows={2} value={d.questionBody} readOnly={readOnly} onChange={(v) => set({ ...d, questionBody: v })} />
          )}
        </>
      )}
      <AnswersEditor d={d} set={set} readOnly={readOnly} originalCode={origCode} />
      <ContentField id="hint" label="Hint" rows={3} value={d.hint} readOnly={readOnly} onChange={(v) => set({ ...d, hint: v })}
        placeholder={`Paste or type the ${origName} hint`} error={!d.hint.trim() ? 'Hint is required.' : null} />
      <ContentField id="sol" label="Solution" rows={3} mono value={d.solution} readOnly={readOnly} onChange={(v) => set({ ...d, solution: v })}
        placeholder={`Paste or type the ${origName} solution`} error={!d.solution.trim() ? 'Solution is required.' : null} />
      {canEdit && (problems.length > 0 || serverProblems.length > 0) && (
        <Box role="alert" sx={{ border: `1px solid ${X.warnLine}`, bgcolor: X.warnBg, borderRadius: '10px', p: '12px 14px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          <strong style={{ color: X.warnText }}>
            {serverProblems.length && !problems.length ? 'The exercise was not saved' : `Fix ${problems.length} problem${problems.length === 1 ? '' : 's'} to save`}
          </strong>
          {[...problems, ...serverProblems].map((p, i) => (
            <Box key={i} component="span" sx={{ display: 'flex', gap: 1, fontSize: 13 }}><Box component="span" sx={{ color: X.red, fontWeight: 700 }}>✕</Box>{p}</Box>
          ))}
        </Box>
      )}
      {canEdit && (
        <SaveBar note={`Saving changes the ${origName} original; translations of changed fields become Out of date.`}>
          <Box component="button" type="button" sx={ghost} disabled={!dirty || !!busy} onClick={() => set(base)}>Discard</Box>
          <Box component="button" type="button" sx={primary} disabled={!dirty || problems.length > 0 || !!busy} onClick={save}>
            {busy === 'save' && <CircularProgress size={14} sx={{ color: '#fff' }} />}Save exercise
          </Box>
        </SaveBar>
      )}
    </>
  );

  const content: PhoneContent = { ...d, fallback: {} };
  const missingGap = isBlank && blankCount(d.questionBody) > 0 && Array.from({ length: blankCount(d.questionBody) }, (_, k) => k + 1).some((b) => !(d.groups[0]?.options ?? []).some((o) => o.sequenceNumber === b));

  return props.shell(header, (
    <>
      <Columns left={left} right={
        <ExercisePhone content={content} langCode={origCode} langName={origName} originalName={origName} index={props.index + 1} total={props.ws.exercises.length}
          warning={missingGap ? "Students can't finish this: a gap has no tile." : null} />
      } />
      <Dialog open={confirm === 'delete'} onClose={() => setConfirm(null)} aria-labelledby="del-title">
        <DialogTitle id="del-title">Delete this exercise?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">"{exercise.name}" is deleted with its question, answers and translations in every language. This can't be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)} color="inherit">Cancel</Button>
          <Button onClick={remove} color="error" variant="contained" disabled={busy === 'delete'}>Delete exercise</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={confirm === 'close'} onClose={() => setConfirm(null)} aria-labelledby="close-title">
        <DialogTitle id="close-title">Close without saving?</DialogTitle>
        <DialogContent><Typography variant="body2">Your changes to this exercise are lost.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)} color="inherit">Keep editing</Button>
          <Button onClick={() => { setConfirm(null); props.onClose(); }} color="error">Close without saving</Button>
        </DialogActions>
      </Dialog>
    </>
  ));
}

/** Statement with [Blank] slots: a preview with numbered blank chips, "+ Add blank" at the cursor, and the raw text. */
function BlankStatement({ value, onChange, readOnly }: { value: string; onChange: (v: string) => void; readOnly: boolean }) {
  const cursor = useRef<number | null>(null);
  let b = 0;
  const addBlank = () => {
    const at = cursor.current ?? value.length;
    const before = value.slice(0, at);
    const after = value.slice(at);
    onChange(`${before}${before && !/\s$/.test(before) ? ' ' : ''}[Blank]${after && !/^\s/.test(after) ? ' ' : ''}${after}`);
  };
  return (
    <>
      <Box sx={{ border: `1px solid ${blankCount(value) ? X.field : '#D9534F'}`, borderRadius: '8px', p: '9px 12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', minHeight: 44 }}>
        {value.split(/(\[Blank\])/).map((p, i) => {
          if (p !== '[Blank]') return p.trim() ? <Shown key={i} value={p} size={16} /> : null;
          b++;
          return <Box key={i} component="span" sx={{ fontSize: 11, px: 1, py: '3px', borderRadius: '6px', bgcolor: X.blue, color: '#fff' }}>Blank {b}</Box>;
        })}
        {!value.trim() && <Box component="span" sx={{ color: X.muted, fontSize: 13 }}>Type the statement below.</Box>}
        <Box sx={{ flex: 1 }} />
        {!readOnly && (
          <Box component="button" type="button" onClick={addBlank} sx={{ height: 26, px: 1, border: `1px solid ${X.line}`, borderRadius: '6px', bgcolor: '#fff', fontSize: 12, color: X.blue, cursor: 'pointer' }}>+ Add blank</Box>
        )}
      </Box>
      <textarea aria-label="Statement with blanks" rows={2} value={value} readOnly={readOnly}
        onChange={(e) => onChange(e.target.value.replace(/_{3,}/g, '[Blank]'))}
        onSelect={(e) => { cursor.current = (e.target as HTMLTextAreaElement).selectionStart; }}
        style={{ border: `1px solid ${X.field}`, borderRadius: 8, padding: '8px 12px', font: "13px/1.5 'JetBrains Mono', ui-monospace, monospace", resize: 'vertical' }} />
      <Box component="span" sx={{ fontSize: 12, color: blankCount(value) ? X.muted : X.red }}>
        {blankCount(value) ? 'Put the cursor where a gap goes and press Add blank (or type ___).' : 'The statement needs at least one blank: put the cursor where a gap goes and press Add blank (or type ___).'}
      </Box>
    </>
  );
}

/* ------------------------------------------------------------------ translations */

type Key = string;
const MATH_WORDS = new Set(['sin', 'cos', 'tan', 'cot', 'ctg', 'sec', 'csc', 'log', 'lim', 'max', 'min', 'exp', 'det', 'mod', 'gcd', 'arg', 'deg', 'dim', 'sup', 'inf']);
/** True when a text is only maths (formulas, numbers, symbols): it stays the same in every language. */
const isFormulaOnly = (s: string) => {
  if (/\\text\{\s*[^}\s]/.test(s)) return false;
  const rest = s.replace(/<[^>]+>/g, ' ').replace(/\\(operatorname|mathrm|mathbb|mathbf|mathit)\{[^}]*\}/g, ' ').replace(/\\[a-zA-Z]+/g, ' ');
  return !(rest.match(/[A-Za-zÀ-ɏ]{3,}/g) ?? []).some((w) => !MATH_WORDS.has(w.toLowerCase()));
};

function TranslationEditor(props: Inner) {
  const { ws, exercise, question, language, original, canEdit } = props;
  const notify = useNotify();
  const lang = language!;
  const get = indexTranslations(ws.translations);
  const origName = original?.name ?? 'the original language';
  const origCode = original ? shortCode(original) : '';
  const t = typeOf(question?.questionType ?? 6);

  const fields = useMemo(() => {
    const out: Array<{ key: Key; type: ItemType; id: number; field: string; source: string }> = [{ key: `exercise:${exercise.id}:name`, type: 'exercise', id: exercise.id, field: 'name', source: exercise.name }];
    if (question) {
      for (const { field } of QUESTION_FIELDS) if (question[field]?.trim()) out.push({ key: `question:${question.id}:${field}`, type: 'question', id: question.id, field, source: question[field]! });
      for (const o of question.options) if (o.option?.trim()) out.push({ key: `option:${o.id}:option`, type: 'option', id: o.id, field: 'option', source: o.option });
    }
    return out;
  }, [exercise, question]);
  const initial = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.key, get(f.type, f.id, f.field, lang.id)?.value ?? ''])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fields, ws.translations, lang.id],
  );
  const [draft, setDraft] = useState<Record<Key, string>>(initial);
  const [busy, setBusy] = useState<null | 'save' | 'review'>(null);
  useEffect(() => setDraft(initial), [initial]);
  const changed = fields.filter((f) => (draft[f.key] ?? '') !== (initial[f.key] ?? ''));
  const summary = summarize(ws, lang.id, exerciseFilter(exercise));

  const chipOf = (f: { type: ItemType; id: number; field: string; source: string }): ChipTone => {
    if (isFormulaOnly(f.source) && f.type === 'option') return 'Formulas';
    const tr = get(f.type, f.id, f.field, lang.id);
    if (!tr) return 'Missing';
    if (tr.outdated) return 'Outdated';
    return ({ auto: 'Auto', edited: 'Edited', reviewed: 'Reviewed' } as const)[tr.status];
  };

  const persist = async (status: Status) => {
    setBusy(status === 'reviewed' ? 'review' : 'save');
    try {
      const list = status === 'reviewed' ? fields.filter((f) => draft[f.key]?.trim()) : changed;
      for (const f of list) await saveTranslation({ itemType: f.type, itemId: f.id, field: f.field, languageId: lang.id, value: draft[f.key] ?? '', status });
      notify(status === 'reviewed' ? `${lang.name} exercise marked as reviewed` : `${lang.name} exercise saved`, { type: 'info' });
      await props.onSaved();
    } catch (e) {
      notify((e as Error).message, { type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const field = (key: Key, label: string, rows = 2, opts?: { mono?: boolean; single?: boolean }) => {
    const f = fields.find((x) => x.key === key);
    if (!f) return null;
    const formulas = isFormulaOnly(f.source);
    return (
      <ContentField key={key} id={key} label={label} rows={rows} mono={opts?.mono} single={opts?.single} chip={formulas ? 'Formulas' : chipOf(f)}
        value={formulas && !draft[key] ? f.source : draft[key] ?? ''} readOnly={!canEdit || formulas}
        onChange={formulas ? undefined : (v) => setDraft((x) => ({ ...x, [key]: v }))}
        placeholder={`Paste or type the ${lang.name} ${label.toLowerCase()}`} original={formulas ? null : { code: origCode, text: f.source }} />
    );
  };

  const optionFields = question ? fields.filter((f) => f.type === 'option') : [];
  const groupsOfQ = (() => {
    const m = new Map<number, typeof optionFields>();
    for (const o of question?.options ?? []) {
      const f = optionFields.find((x) => x.id === o.id);
      if (f) m.set(o.groupId, [...(m.get(o.groupId) ?? []), f]);
    }
    return [...m.values()];
  })();
  const translatable = optionFields.filter((f) => !isFormulaOnly(f.source));

  const qKey = question ? `question:${question.id}:question` : '';
  const val = (key: Key, src: string | null | undefined) => (draft[key]?.trim() ? draft[key] : src ?? '');
  const content: PhoneContent = {
    questionType: question?.questionType ?? 6,
    question: val(qKey, question?.question),
    questionBody: question ? val(`question:${question.id}:questionBody`, question.questionBody) : '',
    hint: question ? val(`question:${question.id}:hint`, question.hint) : '',
    solution: question ? val(`question:${question.id}:solution`, question.solution) : '',
    groups: question ? draftOf(exercise, { ...question, options: question.options.map((o) => ({ ...o, option: val(`option:${o.id}:option`, o.option) })) }).groups : [],
    fallback: {
      question: !!question?.question?.trim() && !draft[qKey]?.trim() && !isFormulaOnly(question.question ?? ''),
      hint: !!question?.hint?.trim() && !draft[`question:${question?.id}:hint`]?.trim() && !isFormulaOnly(question?.hint ?? ''),
      solution: !!question?.solution?.trim() && !draft[`question:${question?.id}:solution`]?.trim() && !isFormulaOnly(question?.solution ?? ''),
    },
  };

  const nameKey = `exercise:${exercise.id}:name`;
  const header = (
    <Header index={props.index} nameLabel={`Name · ${lang.name}`} name={draft[nameKey] ?? ''} onName={canEdit ? (v) => setDraft((x) => ({ ...x, [nameKey]: v })) : undefined}
      questionType={question?.questionType ?? null} isAha={!!exercise.isAha}
      badge={<Box component="span" sx={{ fontSize: 12, color: X.muted }}><LangCode small>{origCode}</LangCode> {exercise.name}</Box>}
      onClose={props.onClose} />
  );

  const left = (
    <>
      <ContentHeading chip={`Translation · ${lang.name}`} original={false}
        intro={`Type or paste the ${lang.name} text into each field. The ${origName} original is shown under it. Correct answers and formulas stay the same in every language.`} />
      {!question && <Box sx={{ color: X.muted, fontSize: 13 }}>This exercise has no question yet. Add it in {origName} first.</Box>}
      {question && (
        <>
          {field(qKey, t.n === 7 ? 'Instruction' : 'Question')}
          {field(`question:${question.id}:questionBody`, t.n === 7 ? 'Statement with blanks' : 'Question body')}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
              <Box component="span" sx={{ fontWeight: 600 }}>Answers</Box>
              <Box component="span" sx={{ fontSize: 12, color: X.muted }}>
                {translatable.length ? `Only words need ${lang.name}; formulas stay the same in every language` : 'Formulas only: same in every language'}
              </Box>
            </Box>
            {groupsOfQ.map((g, gi) => (
              <Box key={gi} sx={{ display: 'flex', flexDirection: 'column', gap: 1, ...(groupsOfQ.length > 1 ? { pl: 1.5, borderLeft: `2px solid ${X.line}` } : {}) }}>
                {groupsOfQ.length > 1 && <Box sx={{ fontSize: 12, color: X.muted }}>Group {gi + 1}</Box>}
                {g.map((f) => {
                  const o = question.options.find((x) => x.id === f.id)!;
                  const formulas = isFormulaOnly(f.source);
                  return (
                    <Box key={f.key} sx={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', gap: '10px', alignItems: 'start' }}>
                      <Box sx={{ pt: '9px' }}><input type="checkbox" checked={o.isCorrect} disabled aria-label="Correct (same in every language)" style={{ width: 17, height: 17, accentColor: '#1E7D4F' }} /></Box>
                      <ContentField id={f.key} ariaLabel={`Answer ${f.id}`} single mono ok={o.isCorrect} chip={null}
                        value={formulas ? f.source : draft[f.key] ?? ''} readOnly={!canEdit || formulas}
                        onChange={formulas ? undefined : (v) => setDraft((x) => ({ ...x, [f.key]: v }))}
                        placeholder={`${lang.name} text`} original={formulas ? null : { code: origCode, text: f.source }} />
                    </Box>
                  );
                })}
              </Box>
            ))}
            {!groupsOfQ.length && <Box sx={{ fontSize: 13, color: X.muted }}>No answers to translate.</Box>}
          </Box>
          {field(`question:${question.id}:hint`, 'Hint', 3)}
          {field(`question:${question.id}:solution`, 'Solution', 3, { mono: true })}
        </>
      )}
      {canEdit && (
        <SaveBar note={`Saves the ${lang.name} text only. Until a field is translated, the app shows it in ${origName}.`}>
          <Box component="button" type="button" sx={ghost} disabled={!changed.length || !!busy} onClick={() => setDraft(initial)}>Discard</Box>
          {!changed.length && summary.missing < summary.total && (
            <Box component="button" type="button" sx={outline} disabled={!!busy} onClick={() => persist('reviewed')}>Mark as reviewed</Box>
          )}
          <Box component="button" type="button" sx={primary} disabled={!changed.length || !!busy} onClick={() => persist('edited')}>
            {busy === 'save' && <CircularProgress size={14} sx={{ color: '#fff' }} />}Save {lang.name}
          </Box>
        </SaveBar>
      )}
    </>
  );

  return props.shell(header, (
    <Columns left={left} right={
      <ExercisePhone content={content} langCode={shortCode(lang)} langName={lang.name} originalName={origName} index={props.index + 1} total={ws.exercises.length} />
    } />
  ));
}
