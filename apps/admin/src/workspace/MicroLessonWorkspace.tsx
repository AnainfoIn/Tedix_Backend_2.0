import AddIcon from '@mui/icons-material/Add';
import TranslateIcon from '@mui/icons-material/Translate';
import {
  Alert, Box, Breadcrumbs, Button as MuiButton, ButtonBase, Card, Chip, CircularProgress, Link as MuiLink, Paper, Stack, Typography,
} from '@mui/material';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DeleteWithConfirmButton, EditButton, Show, TopToolbar, useCanAccess, useNotify, useRecordContext, useSidebarState,
} from 'react-admin';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api';
import { ExerciseEditor } from './ExerciseEditor';
import { FilesPane } from './FilesPane';
import { TextPane } from './TextPane';
import { TranslateDialog } from './TranslateDialog';
import {
  CATEGORY_LABELS, Language, loadWorkspace, QUESTION_TYPE_LABELS, statusOf, summarize, Tone, TONES, Workspace,
} from './types';

type Rec = Record<string, any>;
export const MICRO_LESSON = 'BxBlockProfile::MicroLesson';

export function ToneChip({ tone, label, sx }: { tone: Tone; label: ReactNode; sx?: object }) {
  const c = TONES[tone];
  return <Chip size="small" label={label} sx={{ bgcolor: c.bg, color: c.fg, fontWeight: 500, height: 22, ...sx }} />;
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <Box component="span" sx={{ font: "500 11px 'Roboto Mono', ui-monospace, monospace", bgcolor: '#eceff1', color: '#263238', borderRadius: '3px', px: '5px', py: '1px' }}>
      {children}
    </Box>
  );
}

export const shortCode = (l: Language) => (l.code ?? '').slice(0, 2).toUpperCase();

const PATH: Array<[string, string]> = [
  ['countryId', 'country'], ['categoryId', 'grade'], ['subCategoryId', 'subject'], ['courseId', 'master'],
  ['mainId', 'main'], ['unitId', 'unit'], ['lessonId', 'lesson'],
];

/** The Curriculum screen opened at this record's path, down to `upTo` (a PATH field) or the micro lesson. */
const curriculumAt = (record: Rec, upTo?: string) => {
  const q = new URLSearchParams();
  for (const [field, key] of PATH) {
    if (record[field] != null) q.set(key, String(record[field]));
    if (field === upTo) return `/curriculum?${q}`;
  }
  q.set('micro', String(record.id));
  return `/curriculum?${q}`;
};

/** Micro lesson page: one language bar for the whole lesson, its content, files and exercises. */
export function MicroLessonShow() {
  // The micro lesson uses the full width: the side menu is hidden here (the menu button still opens it).
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const wasOpen = useRef(sidebarOpen);
  useEffect(() => {
    setSidebarOpen(false);
    return () => setSidebarOpen(wasOpen.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Show actions={<Actions />} title={<Title />} component="div" sx={{ '& .RaShow-card': { bgcolor: 'transparent', boxShadow: 'none' } }}>
      <WorkspaceBody />
    </Show>
  );
}

function Title() {
  const record = useRecordContext<Rec>();
  return <span>Micro Lesson{record?.name ? ` · ${record.name}` : ''}</span>;
}

function Actions() {
  return (
    <TopToolbar>
      <EditButton />
      <DeleteWithConfirmButton />
    </TopToolbar>
  );
}

export type Selection = { kind: 'text' } | { kind: 'files' } | { kind: 'exercise'; id: number };

function WorkspaceBody() {
  const record = useRecordContext<Rec>();
  const notify = useNotify();
  const [params, setParams] = useSearchParams();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [translateOpen, setTranslateOpen] = useState(false);
  const { canAccess } = useCanAccess({ resource: "micro_lessons", action: "edit" });
  const canEdit = !!canAccess;

  const reload = useCallback(async () => {
    if (record?.id == null) return;
    try {
      setWs(await loadWorkspace(record.id));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    }
  }, [record?.id]);
  useEffect(() => { void reload(); }, [reload, record?.updatedAt]);

  const languageId = Number(params.get('lang')) || ws?.originalLanguageId || null;
  const sel: Selection = useMemo(() => {
    const s = params.get('item') ?? 'text';
    if (s.startsWith('exercise-')) return { kind: 'exercise', id: Number(s.slice(9)) };
    if (s === 'files') return { kind: 'files' };
    return { kind: 'text' };
  }, [params]);
  const go = (next: { lang?: number; item?: string }) => {
    const p = new URLSearchParams(params);
    if (next.lang !== undefined) p.set('lang', String(next.lang));
    if (next.item !== undefined) p.set('item', next.item);
    setParams(p, { replace: true });
  };

  if (!record) return null;
  if (error) return <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>;
  if (!ws) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

  const original = ws.languages.find((l) => l.id === ws.originalLanguageId) ?? null;
  const language = ws.languages.find((l) => l.id === languageId) ?? original;
  const isOriginal = !language || language.id === original?.id;
  const others = ws.languages.filter((l) => l.id !== original?.id);
  const done = others.filter((l) => { const s = summarize(ws, l.id); return s.total > 0 && !s.missing; }).length;

  return (
    <Stack spacing={2} sx={{ mt: 1 }}>
      <Paper variant="outlined" sx={{ p: '16px 20px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Breadcrumbs separator="/" maxItems={20} sx={{ fontSize: 15 }} aria-label="Breadcrumb">
          <MuiLink component={Link} to={curriculumAt(record)}>Curriculum</MuiLink>
          {PATH.map(([field]) =>
            record[field] != null ? (
              <MuiLink key={field} component={Link} to={curriculumAt(record, field)}>{record[`${field}Label`] ?? `#${record[field]}`}</MuiLink>
            ) : null,
          )}
          <Typography color="text.primary" sx={{ fontSize: 15 }}>{record.name}</Typography>
        </Breadcrumbs>
        <Stack direction="row" flexWrap="wrap" useFlexGap sx={{ gap: '12px 40px' }} alignItems="flex-start">
          <Detail label="ID">{record.id}</Detail>
          <Detail label="Name">{record.name}</Detail>
          <Detail label="Position">{ws.lesson.position ?? '—'}</Detail>
          <Detail label="Content Type">{Number(record.microLessonType) === 0 ? 'Video' : 'Text'}</Detail>
          <Detail label="Exercises">{ws.exercises.length}</Detail>
          <Detail label="Translations">
            {others.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No other languages</Typography>
            ) : (
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                <ToneChip tone={done === others.length ? 'rev' : 'pend'} label={`${done} of ${others.length} complete`} />
                {others.map((l) => {
                  const s = summarize(ws, l.id);
                  if (!s.missing && !s.outdated) return null;
                  return <ToneChip key={l.id} tone="old" label={`${shortCode(l)} ${s.missing ? `${s.missing} missing` : 'outdated'}`} />;
                })}
              </Stack>
            )}
          </Detail>
          <Detail label="Updated">{record.updatedAt ? new Date(record.updatedAt).toLocaleString() : '—'}</Detail>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', borderRadius: '4px 4px 0 0' }} role="tablist" aria-label="Language">
        {ws.languages.length === 0 && (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              No languages yet. Add them under <MuiLink component={Link} to="/languages">Languages</MuiLink> to translate this lesson.
            </Typography>
          </Box>
        )}
        {[...(original ? [original] : []), ...others].map((l) => {
          const on = l.id === language?.id;
          const s = summarize(ws, l.id);
          const st = statusOf(s);
          return (
            <ButtonBase
              key={l.id} role="tab" aria-selected={on} onClick={() => go({ lang: l.id })}
              sx={{
                flexDirection: 'column', alignItems: 'flex-start', gap: '2px', px: 2.5, py: 1.25, minWidth: 150, textAlign: 'left',
                borderBottom: 3, borderColor: on ? 'primary.main' : 'transparent', bgcolor: on ? '#f5f9ff' : 'transparent', color: on ? '#0d47a1' : 'text.primary',
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ fontSize: 15, fontWeight: 500 }}>
                <Code>{shortCode(l)}</Code><span>{l.name}</span>{l.id === original?.id && <ToneChip tone="orig" label="Original" />}
              </Stack>
              <Typography variant="caption" sx={{ fontSize: 12.5, color: st.tone === 'old' ? '#a33b00' : 'text.secondary' }}>
                {l.id === original?.id ? 'Lesson written in this language' : st.label}
              </Typography>
            </ButtonBase>
          );
        })}
        <Box sx={{ flex: 1 }} />
        {canEdit && others.length > 0 && (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2 }}>
            <MuiButton component={Link} to={`/micro_lessons/${record.id}/review?lang=${isOriginal ? others[0].id : language?.id}`}>Review all</MuiButton>
            <MuiButton variant="outlined" startIcon={<TranslateIcon />} onClick={() => setTranslateOpen(true)}>Translate…</MuiButton>
          </Stack>
        )}
      </Paper>

      <Card variant="outlined" sx={{ p: '18px 20px' }}>
        <TextPane ws={ws} record={record} language={language} original={original} isOriginal={isOriginal} canEdit={canEdit} onSaved={reload}
          onGoLanguage={(id) => go({ lang: id })} />
      </Card>

      <Card variant="outlined" sx={{ p: '18px 20px' }}>
        <FilesPane record={record} language={language} original={original} isOriginal={isOriginal} />
      </Card>

      <ExerciseList ws={ws} record={record} language={language} original={original} isOriginal={isOriginal} canEdit={canEdit}
        open={sel.kind === 'exercise' ? sel.id : null} onOpen={(id) => go({ item: id ? `exercise-${id}` : 'text' })} onSaved={reload}
        onLanguage={(id) => go({ lang: id })} />

      {translateOpen && original && (
        <TranslateDialog
          ws={ws} original={original} preselect={isOriginal ? undefined : language?.id}
          onClose={() => setTranslateOpen(false)}
          onDone={(msg) => { setTranslateOpen(false); notify(msg, { type: 'info' }); void reload(); }}
          onOriginalChanged={setWs}
        />
      )}
    </Stack>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack spacing="2px">
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Box sx={{ fontSize: 15 }}>{children}</Box>
    </Stack>
  );
}

/** Exercises under the content: one row each with its type, questions and status; Edit opens it below the row. */
function ExerciseList(props: {
  ws: Workspace; record: Rec; language: Language | null; original: Language | null; isOriginal: boolean; canEdit: boolean;
  open: number | null; onOpen: (id: number | null) => void; onSaved: () => Promise<void> | void; onLanguage: (id: number) => void;
}) {
  const { ws, record, language, isOriginal } = props;
  const statusFor = (id: number) => {
    if (isOriginal || !language) return null;
    const e = ws.exercises.find((x) => x.id === id)!;
    const q = new Set(e.questions.map((x) => x.id));
    const o = new Set(e.questions.flatMap((x) => x.options.map((y) => y.id)));
    const st = statusOf(summarize(ws, language.id, (t, i) => (t === 'exercise' && i === id) || (t === 'question' && q.has(i)) || (t === 'option' && o.has(i))));
    return st.label === 'Nothing to translate' ? null : <ToneChip tone={st.tone} label={st.label.replace(' · complete', '')} sx={{ height: 20, fontSize: 11 }} />;
  };
  return (
    <Card variant="outlined" sx={{ p: 0, overflow: 'hidden' }}>
      <Stack direction="row" alignItems="center" sx={{ px: '20px', py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>Exercises <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>{ws.exercises.length}</Box></Typography>
        {props.canEdit && (
          <MuiButton variant="outlined" size="small" startIcon={<AddIcon />} component={Link}
            to={`/exercises/create?source=${encodeURIComponent(JSON.stringify({ microLessonId: record.id }))}`}>
            Add exercise
          </MuiButton>
        )}
      </Stack>
      {ws.exercises.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ px: '20px', py: 2 }}>No exercises yet.</Typography>}
      {ws.exercises.map((e, i) => {
        const tr = !isOriginal && language ? ws.translations.find((t) => t.itemType === 'exercise' && t.itemId === e.id && t.field === 'name' && t.languageId === language.id) : null;
        const types = [...new Set(e.questions.map((q) => QUESTION_TYPE(q.questionType)))];
        const isOpen = props.open === e.id;
        if (isOpen) {
          return (
            <ExerciseEditor key={e.id} ws={ws} exerciseId={e.id} language={language} original={props.original} isOriginal={isOriginal} canEdit={props.canEdit}
              onSaved={props.onSaved} onClose={() => props.onOpen(null)} onLanguage={props.onLanguage} />
          );
        }
        return (
          <Box key={e.id} sx={{ borderBottom: i < ws.exercises.length - 1 ? 1 : 0, borderColor: 'divider' }}>
            <Stack direction="row" alignItems="center" spacing={2} sx={{ px: '20px', py: 1.25, flexWrap: 'wrap', rowGap: 0.5 }}>
              <Typography sx={{ width: 24, color: 'text.secondary', fontSize: 14 }}>{i + 1}.</Typography>
              <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 500 }} noWrap>{tr?.value ?? e.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {CATEGORY_LABELS[e.categoryType] ?? 'Exercise'}{e.isAha ? ' · AHA' : ''} · {e.questions.length} question{e.questions.length === 1 ? '' : 's'}{types.length ? ` · ${types.join(', ')}` : ''}
                </Typography>
              </Box>
              {statusFor(e.id)}
              <MuiButton size="small" variant="outlined" onClick={() => props.onOpen(e.id)}>
                {props.canEdit ? 'Edit' : 'View'}
              </MuiButton>
            </Stack>
          </Box>
        );
      })}
    </Card>
  );
}

const QUESTION_TYPE = (t: number) => QUESTION_TYPE_LABELS[t] ?? `Type ${t}`;

