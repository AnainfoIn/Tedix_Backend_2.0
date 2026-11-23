import AddIcon from '@mui/icons-material/Add';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import TranslateIcon from '@mui/icons-material/Translate';
import {
  Alert, Box, Breadcrumbs, Button as MuiButton, ButtonBase, Card, Chip, CircularProgress, Link as MuiLink, Paper, Stack, Typography,
} from '@mui/material';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  DeleteWithConfirmButton, EditButton, Show, TopToolbar, useCanAccess, useNotify, useRecordContext,
} from 'react-admin';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api';
import { ExercisePane } from './ExercisePane';
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
  ['countryId', 'countries'], ['categoryId', 'grades'], ['subCategoryId', 'subjects'], ['courseId', 'masters'],
  ['mainId', 'mains'], ['unitId', 'units'], ['lessonId', 'lessons'],
];

/** Micro lesson page: one language bar for the whole lesson, its content, files and exercises. */
export function MicroLessonShow() {
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
          <MuiLink component={Link} to="/contents">Contents</MuiLink>
          {PATH.map(([field, resource]) =>
            record[field] != null ? (
              <MuiLink key={field} component={Link} to={`/${resource}/${record[field]}/show`}>{record[`${field}Label`] ?? `#${record[field]}`}</MuiLink>
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
          <Stack direction="row" alignItems="center" sx={{ px: 2 }}>
            <MuiButton variant="outlined" startIcon={<TranslateIcon />} onClick={() => setTranslateOpen(true)}>Translate…</MuiButton>
          </Stack>
        )}
      </Paper>

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Outline ws={ws} record={record} language={language} isOriginal={isOriginal} sel={sel} onSelect={(item) => go({ item })} canEdit={canEdit} />
        <Card variant="outlined" sx={{ flex: '999 1 520px', minWidth: 0, p: '18px 20px' }}>
          {sel.kind === 'text' && (
            <TextPane ws={ws} record={record} language={language} original={original} isOriginal={isOriginal} canEdit={canEdit} onSaved={reload}
              onGoLanguage={(id) => go({ lang: id })} />
          )}
          {sel.kind === 'files' && <FilesPane record={record} language={language} original={original} isOriginal={isOriginal} />}
          {sel.kind === 'exercise' && (
            <ExercisePane ws={ws} exerciseId={sel.id} language={language} original={original} isOriginal={isOriginal} canEdit={canEdit} onSaved={reload} />
          )}
        </Card>
      </Box>

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

function Outline(props: {
  ws: Workspace; record: Rec; language: Language | null; isOriginal: boolean; sel: Selection; onSelect: (item: string) => void; canEdit: boolean;
}) {
  const { ws, record, language, isOriginal, sel } = props;
  const isVideo = Number(record.microLessonType) === 0;
  const statusFor = (filter: (t: string, id: number) => boolean) => {
    if (isOriginal || !language) return null;
    const st = statusOf(summarize(ws, language.id, filter));
    return st.tone === 'miss' && st.label === 'Nothing to translate' ? null : <ToneChip tone={st.tone === 'miss' ? 'miss' : st.tone} label={st.label.replace(' · complete', '')} sx={{ height: 20, fontSize: 11 }} />;
  };
  const exerciseIds = (id: number) => {
    const e = ws.exercises.find((x) => x.id === id)!;
    const q = new Set(e.questions.map((x) => x.id));
    const o = new Set(e.questions.flatMap((x) => x.options.map((y) => y.id)));
    return (t: string, i: number) => (t === 'exercise' && i === id) || (t === 'question' && q.has(i)) || (t === 'option' && o.has(i));
  };
  const files = [record.cheatsheetPdf?.filename, record.summaryPdf?.filename, !isVideo && record.summaryVideo?.filename].filter(Boolean);

  return (
    <Paper variant="outlined" component="nav" aria-label="Micro lesson content" sx={{ flex: '0 0 280px', maxWidth: '100%', display: 'flex', flexDirection: 'column', pb: 1 }}>
      <Section>Content</Section>
      <OutlineItem
        on={sel.kind === 'text'} onClick={() => props.onSelect('text')} icon={isVideo ? <PlayCircleOutlineIcon fontSize="small" /> : <ArticleOutlinedIcon fontSize="small" />}
        title={isVideo ? 'Video content' : 'Text content'}
        sub={isOriginal ? (isVideo ? record.summaryVideo?.filename ?? 'No video yet' : `${String(ws.lesson.description ?? '').length} characters`) : 'Name and text'}
        status={statusFor((t) => t === 'micro_lesson')}
      />
      <Section>Files</Section>
      <OutlineItem
        on={sel.kind === 'files'} onClick={() => props.onSelect('files')} icon={<PictureAsPdfOutlinedIcon fontSize="small" />}
        title="Cheatsheet, summary PDF and video" sub={files.length ? `${files.length} ${files.length === 1 ? 'file' : 'files'}` : 'No files yet'}
      />
      <Section
        action={props.canEdit ? (
          <MuiButton size="small" startIcon={<AddIcon />} component={Link}
            to={`/exercises/create?source=${encodeURIComponent(JSON.stringify({ microLessonId: record.id }))}`}>
            Add
          </MuiButton>
        ) : undefined}
      >
        Exercises · {ws.exercises.length}
      </Section>
      {ws.exercises.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ px: 1.75, py: 1 }}>No exercises yet.</Typography>}
      {ws.exercises.map((e, i) => {
        const tr = !isOriginal && language ? ws.translations.find((t) => t.itemType === 'exercise' && t.itemId === e.id && t.field === 'name' && t.languageId === language.id) : null;
        const types = [...new Set(e.questions.map((q) => q.questionType))];
        return (
          <OutlineItem
            key={e.id} on={sel.kind === 'exercise' && sel.id === e.id} onClick={() => props.onSelect(`exercise-${e.id}`)}
            title={`${i + 1}. ${tr?.value ?? e.name}`}
            sub={types.length === 1 ? QUESTION_TYPE(types[0]) : `${CATEGORY_LABELS[e.categoryType] ?? 'Exercise'} · ${e.questions.length} questions`}
            status={statusFor(exerciseIds(e.id))}
          />
        );
      })}
    </Paper>
  );
}

const QUESTION_TYPE = (t: number) => QUESTION_TYPE_LABELS[t] ?? `Type ${t}`;

function Section({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 1.75, pt: 1.5, pb: 0.75, minHeight: 32 }}>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, letterSpacing: '.06em' }}>{children}</Typography>
      {action}
    </Stack>
  );
}

function OutlineItem(props: { on: boolean; onClick: () => void; title: string; sub?: string; status?: ReactNode; icon?: ReactNode }) {
  return (
    <ButtonBase
      onClick={props.onClick}
      sx={{
        justifyContent: 'flex-start', textAlign: 'left', gap: 1.25, px: 1.75, py: 1.1, width: '100%',
        bgcolor: props.on ? '#e3f2fd' : 'transparent', color: props.on ? '#0d47a1' : 'text.primary', '&:hover': { bgcolor: props.on ? '#e3f2fd' : 'action.hover' },
      }}
    >
      {props.icon && <Box sx={{ color: 'text.secondary', display: 'flex' }}>{props.icon}</Box>}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 14, fontWeight: props.on ? 500 : 400 }}>{props.title}</Typography>
        {props.sub && <Typography noWrap variant="caption" color="text.secondary" component="div">{props.sub}</Typography>}
      </Box>
      {props.status}
    </ButtonBase>
  );
}
