import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import {
  Alert, Box, Button, ButtonBase, CircularProgress, IconButton, Link as MuiLink, Stack, Tooltip, Typography,
} from '@mui/material';
import { Fragment, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Title, useCanAccess } from 'react-admin';
import { Link, useSearchParams } from 'react-router-dom';
import { C } from '../theme';
import { Curriculum, loadCurriculum, Named, Path, PATH_KEYS, PathKey, pathFromServer, setCountry, useCountry } from './api';
import { ItemDialog, LevelKey, MicroDialog, Parent } from './dialogs';
import { EditPanel } from './EditPanel';

const LEVEL_OF: Record<Exclude<PathKey, 'country' | 'micro'>, LevelKey> = {
  grade: 'grades', subject: 'subjects', master: 'masters', main: 'mains', unit: 'units', lesson: 'lessons',
};

const fmtDay = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const plural = (n: number | null | undefined, one: string, many = `${one}s`) => `${n ?? 0} ${n === 1 ? one : many}`;

type Dialog = { kind: 'item'; level: LevelKey; id?: number; parent: Parent } | { kind: 'micro'; id?: number; parent: Parent } | null;

/**
 * Curriculum: Grade, Subject and Master as chips, then Mains, Units, Lessons and Micro lessons as
 * columns. Every level can be added (+) and edited (pencil) here; the micro lesson opens its workspace.
 */
export function CurriculumPage() {
  const [params, setParams] = useSearchParams();
  const globalCountry = useCountry();
  const { canAccess: canEdit } = useCanAccess({ resource: 'lessons', action: 'edit' });
  const path: Path = useMemo(() => {
    const p: Path = {};
    for (const k of PATH_KEYS) {
      const v = Number(params.get(k));
      if (v > 0) p[k] = v;
    }
    if (!p.country && globalCountry) p.country = globalCountry;
    return p;
  }, [params, globalCountry]);
  const [data, setData] = useState<Curriculum | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (path.country && path.country !== globalCountry) setCountry(path.country);
  }, [path.country, globalCountry]);

  const settled = useRef<string>('');
  const lastTick = useRef(0);
  useEffect(() => {
    const key = JSON.stringify(path);
    if (key === settled.current && tick === lastTick.current) return;
    lastTick.current = tick;
    let live = true;
    setError(null);
    loadCurriculum(path).then((d) => {
      if (!live) return;
      const resolved = pathFromServer(d.path);
      settled.current = JSON.stringify(resolved);
      setData(d);
      if (settled.current !== key) {
        const q = toParams(resolved);
        if (params.get('sel')) q.set('sel', params.get('sel')!);
        setParams(q, { replace: true });
      }
    }).catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(path), tick]);

  const go = useCallback((key: PathKey, id: number, selKey?: PathKey) => {
    const next: Path = {};
    for (const k of PATH_KEYS) {
      if (k === key) { next[k] = id; break; }
      next[k] = path[k];
    }
    const q = toParams(next);
    q.set('sel', selKey ?? params.get('sel') ?? key);
    setParams(q);
  }, [path, setParams, params]);

  const parent = (upTo: PathKey): Parent => {
    const ids: Parent = {};
    const map: Array<[PathKey, keyof Parent]> = [['country', 'countryId'], ['grade', 'gradeId'], ['subject', 'subjectId'], ['master', 'masterId'], ['main', 'mainId'], ['unit', 'unitId'], ['lesson', 'lessonId']];
    for (const [k, f] of map) {
      if (k === upTo) break;
      if (path[k]) ids[f] = path[k];
    }
    return ids;
  };
  const add = (key: Exclude<PathKey, 'country'>) =>
    setDialog(key === 'micro' ? { kind: 'micro', parent: parent('micro') } : { kind: 'item', level: LEVEL_OF[key], parent: parent(key) });
  const edit = (key: Exclude<PathKey, 'country'>, id: number) =>
    setDialog(key === 'micro' ? { kind: 'micro', id, parent: parent('micro') } : { kind: 'item', level: LEVEL_OF[key], id, parent: parent(key) });

  const saved = (key: PathKey | null) => (id: number | null) => {
    setDialog(null);
    if (key && id) go(key, id, key);
    else if (key && !id) {
      // deleted: drop it from the path so the first remaining item is picked
      const next = { ...path };
      let drop = false;
      for (const k of PATH_KEYS) { if (k === key) drop = true; if (drop) delete next[k]; }
      const q = toParams(next);
      q.set('sel', key);
      setParams(q);
    }
    setTick((t) => t + 1);
  };

  const keyOfDialog: PathKey | null = !dialog ? null : dialog.kind === 'micro' ? 'micro'
    : (Object.entries(LEVEL_OF).find(([, l]) => l === dialog.level)?.[0] as PathKey);

  if (!path.country) {
    return <Box sx={{ p: 3 }}><Title title="Curriculum" /><Typography color="text.secondary">Choose a country in the top bar.</Typography></Box>;
  }

  const ready = data && !error;
  const micro = data?.micro;
  const sel: Exclude<PathKey, 'country'> = (() => {
    const want = params.get('sel') as Exclude<PathKey, 'country'> | null;
    if (want && want in COLS && path[want]) return want;
    return path.grade ? 'grade' : 'grade';
  })();
  const select = (key: Exclude<PathKey, 'country'>, id: number) => go(key, id, key);
  const countryName = data?.countries.find((c) => c.id === path.country)?.name ?? '';

  // Breadcrumb: Romania / Grade 10 / Mathematics / … down to the selected column.
  const crumbs: Array<{ key: Exclude<PathKey, 'country'>; name: string }> = [];
  if (data) {
    for (const key of COL_ORDER) {
      const item = (data[COLS[key].list] as Named[]).find((x) => x.id === path[key]);
      if (!item) break;
      crumbs.push({ key, name: item.name });
      if (key === sel) break;
    }
  }

  const parentNameOf = (key: Exclude<PathKey, 'country'>) => {
    const i = COL_ORDER.indexOf(key);
    if (i === 0) return countryName;
    const up = COL_ORDER[i - 1];
    return (data?.[COLS[up].list] as Named[] | undefined)?.find((x) => x.id === path[up])?.name ?? '';
  };

  return (
    <Stack spacing={2} sx={{ py: 2.5, px: { xs: 0, sm: 1 }, maxWidth: 1600, minWidth: 0, width: '100%' }}>
      <Title title="Curriculum" />
      <Stack direction="row" spacing={1.5} alignItems="baseline" flexWrap="wrap" useFlexGap>
        <Typography component="h1" sx={{ fontSize: 22, fontWeight: 700 }}>Curriculum</Typography>
        <Box component="nav" aria-label="Breadcrumb" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, fontSize: 13, color: C.muted }}>
          <span>{countryName}</span>
          {crumbs.map((c, i) => (
            <Fragment key={c.key}>
              <span>/</span>
              {i === crumbs.length - 1 ? <Box component="span" sx={{ color: C.text, fontWeight: 600 }}>{c.name}</Box>
                : <MuiLink component="button" onClick={() => go(c.key, path[c.key]!, c.key)} sx={{ fontSize: 13 }}>{c.name}</MuiLink>}
            </Fragment>
          ))}
        </Box>
      </Stack>
      {error && <Alert severity="error" action={<Button color="inherit" onClick={() => setTick((t) => t + 1)}>Try again</Button>}>{error}</Alert>}
      {!data && !error && <CircularProgress size={24} />}
      {ready && (
        <>
          <Box sx={{ overflowX: 'auto', bgcolor: C.panel, border: `1px solid ${C.line}`, borderRadius: 3 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${COL_ORDER.length}, minmax(165px, 1fr))`, minWidth: COL_ORDER.length * 165 }}>
              {COL_ORDER.map((key, i) => {
                const col = COLS[key];
                const up = i ? COL_ORDER[i - 1] : null;
                const enabled = !up || !!path[up];
                const rows = data[col.list] as Array<Named & Record<string, any>>;
                return (
                  <Column key={key} title={col.title} singular={col.singular} enabled={enabled} last={i === COL_ORDER.length - 1}
                    waiting={up ? `Pick a ${COLS[up].singular} first` : undefined}
                    add={canEdit && enabled ? () => add(key) : undefined} note={key === 'subject' ? subjectNote(rows, path.subject) : undefined}>
                    {enabled ? rows.map((r) => (
                      <Row key={r.id} name={r.name} sub={col.sub?.(r)} count={col.sub ? undefined : r.count}
                        selected={r.id === path[key]} current={key === sel && r.id === path[key]} strong={key === 'micro'}
                        onClick={() => select(key, r.id)} />
                    )) : []}
                  </Column>
                );
              })}
            </Box>
          </Box>

          {sel === 'micro' && micro && <MicroCard micro={micro} onEdit={canEdit ? () => edit('micro', micro.id) : undefined} />}
          {sel !== 'micro' && path[sel] && (() => {
            const list = data[COLS[sel].list] as Array<Named & Record<string, any>>;
            const idx = list.findIndex((x) => x.id === path[sel]);
            const item = list[idx];
            if (!item) return null;
            const nextKey = COL_ORDER[COL_ORDER.indexOf(sel) + 1];
            const childCount = sel === 'lesson' ? (item.count ?? 0) : (item.count ?? 0);
            return (
              <EditPanel key={`${sel}-${item.id}`} level={LEVEL_OF[sel as keyof typeof LEVEL_OF]} id={item.id} position={idx + 1} siblings={list.length}
                parentName={parentNameOf(sel)} childCount={childCount} canEdit={!!canEdit}
                onOpenChildren={() => {
                  const first = (data[COLS[nextKey].list] as Named[])[0];
                  if (childCount && first) go(nextKey, path[nextKey] ?? first.id, nextKey);
                  else if (canEdit) add(nextKey);
                }}
                onChanged={(deleted) => (deleted ? saved(sel)(null) : setTick((t) => t + 1))} />
            );
          })()}
        </>
      )}

      {dialog?.kind === 'item' && (
        <ItemDialog level={dialog.level} id={dialog.id} parent={dialog.parent} onClose={() => setDialog(null)} onSaved={saved(keyOfDialog)} />
      )}
      {dialog?.kind === 'micro' && <MicroDialog id={dialog.id} parent={dialog.parent} onClose={() => setDialog(null)} onSaved={saved('micro')} />}
    </Stack>
  );
}

const subjectNote = (rows: Array<Record<string, any>>, id?: number) => {
  const also = rows.find((r) => r.id === id)?.also as string | null | undefined;
  return also ? `${rows.find((r) => r.id === id)?.name} is also in ${also}.` : undefined;
};

const fmtRange = (r: Record<string, any>) => `${fmtDay(r.startDate)} – ${fmtDay(r.endDate)} · ${plural(r.count, 'micro lesson')}`;

const COLS: Record<Exclude<PathKey, 'country'>, { title: string; singular: string; list: keyof Curriculum; sub?: (r: Record<string, any>) => string }> = {
  grade: { title: 'Grades', singular: 'grade', list: 'grades' },
  subject: { title: 'Subjects', singular: 'subject', list: 'subjects' },
  master: { title: 'Masters', singular: 'master', list: 'masters' },
  main: { title: 'Mains', singular: 'main', list: 'mains' },
  unit: { title: 'Units', singular: 'unit', list: 'units', sub: (r) => plural(r.count, 'lesson') },
  lesson: { title: 'Lessons', singular: 'lesson', list: 'lessons', sub: fmtRange },
  micro: {
    title: 'Micro lessons', singular: 'micro lesson', list: 'microLessons',
    sub: (r) => `${r.type === 0 ? 'Video' : 'Text'} · ${r.exercises ? `${plural(r.exercises, 'exercise')} · ${plural(r.questions, 'question')}` : 'No exercises yet'}`,
  },
};
const COL_ORDER = Object.keys(COLS) as Array<Exclude<PathKey, 'country'>>;

function toParams(p: Path) {
  const q = new URLSearchParams();
  for (const k of PATH_KEYS) if (p[k]) q.set(k, String(p[k]));
  return q;
}

function Column(props: {
  title: string; singular: string; add?: () => void; enabled: boolean; waiting?: string; last?: boolean; note?: string; children: ReactNode[];
}) {
  const count = props.children.length;
  return (
    <Box component="section" aria-label={props.title}
      sx={{ borderRight: props.last ? 0 : `1px solid ${C.line}`, minWidth: 0, display: 'flex', flexDirection: 'column', bgcolor: props.enabled ? C.panel : '#FAFBFC' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1.75, py: 1.25, borderBottom: `1px solid ${C.line}`, minHeight: 55 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: props.enabled ? C.text : C.muted }}>
          {props.title} {props.enabled && <Box component="span" sx={{ color: C.muted, fontWeight: 400 }}>{count}</Box>}
        </Typography>
        {props.add && (
          <Tooltip title={`Add ${props.singular}`}>
            <IconButton onClick={props.add} aria-label={`Add ${props.singular}`} size="small"
              sx={{ width: 30, height: 30, border: `1px solid ${C.line}`, borderRadius: 2, color: C.blue }}>
              <AddIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      <Stack spacing={0.25} sx={{ p: 0.75, height: { xs: 260, md: 320 }, overflowY: 'auto', scrollbarGutter: 'stable' }}>
        {props.children}
        {!props.enabled && props.waiting && <Typography sx={{ fontSize: 13, color: C.muted, px: 1.25, py: 1.25 }}>{props.waiting}</Typography>}
        {props.enabled && !count && (
          <Box sx={{ px: 1.25, py: 1.25 }}>
            <Typography sx={{ fontSize: 13, color: C.muted }}>No {props.singular}s yet.</Typography>
            {props.add && <Button size="small" startIcon={<AddIcon />} onClick={props.add} sx={{ mt: 0.5, ml: -0.5 }}>Add {props.singular}</Button>}
          </Box>
        )}
      </Stack>
      {props.note && <Typography sx={{ fontSize: 12, color: C.muted, px: 1.75, py: 1, borderTop: `1px solid ${C.line}` }}>{props.note}</Typography>}
    </Box>
  );
}

function Row(props: { name: string; sub?: string; count?: number | null; selected: boolean; current: boolean; strong?: boolean; onClick: () => void }) {
  const solid = props.current;
  return (
    <ButtonBase onClick={props.onClick} aria-current={props.current ? 'true' : undefined}
      sx={{
        width: '100%', textAlign: 'left', justifyContent: 'flex-start', display: 'flex', gap: 1, px: 1.25, py: 1.1, borderRadius: 2, fontSize: 14, flexShrink: 0,
        bgcolor: solid ? C.blue : props.selected ? C.blueSoft : 'transparent',
        color: solid ? '#fff' : props.selected ? C.blueDark : C.text,
        '&:hover': { bgcolor: solid ? C.blue : props.selected ? C.blueSoft : C.page },
      }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontWeight: props.selected ? 600 : 400, overflowWrap: 'anywhere' }}>{props.name}</Box>
        {props.sub && <Box sx={{ fontSize: 12, color: props.selected ? 'inherit' : C.muted, mt: 0.25 }}>{props.sub}</Box>}
      </Box>
      {props.count != null && <Box sx={{ fontSize: 12, color: props.selected ? 'inherit' : C.muted }}>{props.count}</Box>}
      <ChevronRightIcon sx={{ fontSize: 16, color: props.selected ? 'inherit' : C.faint, opacity: props.selected ? 1 : 0.7 }} />
    </ButtonBase>
  );
}

function Stat({ label, value, note, warn }: { label: string; value: number; note: string; warn?: boolean }) {
  return (
    <Box sx={{ border: `1px solid ${warn ? C.warnLine : C.line}`, bgcolor: warn ? C.warnBg : 'transparent', borderRadius: 2.5, p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography sx={{ fontSize: 12, color: warn ? C.warnText : C.muted }}>{label}</Typography>
      <Typography sx={{ fontSize: 20, fontWeight: 700, color: warn ? C.warnText : C.text }}>{value}</Typography>
      <Typography sx={{ fontSize: 12, color: warn ? C.warnText : C.muted }}>{note}</Typography>
    </Box>
  );
}

function MicroCard({ micro, onEdit }: { micro: NonNullable<Curriculum['micro']>; onEdit?: () => void }) {
  const pos = micro.position != null && micro.total ? ` · position ${micro.position} of ${micro.total}` : '';
  return (
    <Box component="section" aria-label="Selected micro lesson" sx={{ bgcolor: C.panel, border: `1px solid ${C.line}`, borderRadius: 3, p: '18px 20px', display: 'flex', flexDirection: 'column', gap: 1.75 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
        <Box component="span" sx={{ fontSize: 12, fontWeight: 600, px: 1, py: 0.4, borderRadius: 999, bgcolor: C.chip, color: '#3A404B' }}>Micro lesson</Box>
        <Typography component="h2" sx={{ fontSize: 20, fontWeight: 700 }}>{micro.name}</Typography>
        <Typography sx={{ fontSize: 13, color: C.muted }}>{micro.type === 0 ? 'Video content' : 'Text content'}{pos}</Typography>
        <Box sx={{ flex: 1 }} />
        {onEdit && <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={onEdit} sx={{ height: 38, borderColor: C.line }}>Quick edit</Button>}
        <Button component={Link} to={`/micro_lessons/${micro.id}/show`} variant="contained" endIcon={<ArrowForwardIcon />} sx={{ height: 38, px: 2 }}>
          Edit micro lesson
        </Button>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
        <Stat label="Exercises" value={micro.exercises} note={micro.exerciseNames.length ? micro.exerciseNames.slice(0, 3).join(', ') + (micro.exerciseNames.length > 3 ? '…' : '') : 'None yet'} />
        <Stat label="Questions" value={micro.questions} note={plural(micro.questionTypes, 'question type')} />
        <Stat label="Options" value={micro.options} note={`in ${plural(micro.optionGroups, 'option group')}`} />
        <Stat label="To check" value={micro.toCheck} note={micro.toCheck ? 'questions with no question text' : 'nothing to check'} warn={micro.toCheck > 0} />
      </Box>
      <Typography sx={{ fontSize: 13, color: C.muted }}>Edit micro lesson opens the full editor: the Romanian, English, German and Hungarian tabs, the text with Insert and Formula, Translate, files and exercises.</Typography>
    </Box>
  );
}
