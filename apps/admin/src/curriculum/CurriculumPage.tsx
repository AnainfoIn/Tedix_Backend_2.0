import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Alert, Box, Button, ButtonBase, CircularProgress, Divider, IconButton, ListItemIcon, Menu, MenuItem, Stack, Tooltip, Typography,
} from '@mui/material';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Title, useCanAccess } from 'react-admin';
import { Link, useSearchParams } from 'react-router-dom';
import { C } from '../theme';
import { Curriculum, loadCurriculum, Named, Path, PATH_KEYS, PathKey, pathFromServer, setCountry, useCountry } from './api';
import { ItemDialog, LevelKey, MicroDialog, Parent, SINGULAR } from './dialogs';

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
      if (settled.current !== key) setParams(toParams(resolved), { replace: true });
    }).catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(path), tick]);

  const go = useCallback((key: PathKey, id: number) => {
    const next: Path = {};
    for (const k of PATH_KEYS) {
      if (k === key) { next[k] = id; break; }
      next[k] = path[k];
    }
    setParams(toParams(next));
  }, [path, setParams]);

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
    if (key && id) go(key, id);
    else if (key && !id) {
      // deleted: drop it from the path so the first remaining item is picked
      const next = { ...path };
      let drop = false;
      for (const k of PATH_KEYS) { if (k === key) drop = true; if (drop) delete next[k]; }
      setParams(toParams(next));
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
  return (
    <Stack spacing={2} sx={{ py: 2.5, px: { xs: 0, sm: 1 }, maxWidth: 1400, minWidth: 0, width: '100%' }}>
      <Title title="Curriculum" />
      <Stack direction="row" spacing={1.25} alignItems="baseline" flexWrap="wrap" useFlexGap>
        <Typography component="h1" sx={{ fontSize: 22, fontWeight: 700 }}>Curriculum</Typography>
        <Typography sx={{ fontSize: 13, color: C.muted }}>Pick a grade, subject and master, then work through the columns. + adds, the pencil edits.</Typography>
      </Stack>
      {error && <Alert severity="error" action={<Button color="inherit" onClick={() => setTick((t) => t + 1)}>Try again</Button>}>{error}</Alert>}
      {!data && !error && <CircularProgress size={24} />}
      {ready && (
        <>
          <Stack component="nav" aria-label="Grade, subject and master" direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" useFlexGap>
            <ChipSelect label="Grade" items={data.grades} value={path.grade} onPick={(id) => go('grade', id)} onAdd={canEdit ? () => add('grade') : undefined} onEdit={canEdit ? (id) => edit('grade', id) : undefined} />
            {path.grade && <ChevronRightIcon sx={{ color: C.faint, fontSize: 18 }} />}
            {path.grade && <ChipSelect label="Subject" items={data.subjects} value={path.subject} onPick={(id) => go('subject', id)} onAdd={canEdit ? () => add('subject') : undefined} onEdit={canEdit ? (id) => edit('subject', id) : undefined} />}
            {path.subject && <ChevronRightIcon sx={{ color: C.faint, fontSize: 18 }} />}
            {path.subject && <ChipSelect label="Master" items={data.masters} value={path.master} onPick={(id) => go('master', id)} onAdd={canEdit ? () => add('master') : undefined} onEdit={canEdit ? (id) => edit('master', id) : undefined} />}
          </Stack>

          {path.master ? (
            <Box sx={{ overflowX: 'auto', bgcolor: C.panel, border: `1px solid ${C.line}`, borderRadius: 3 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))', minWidth: 900 }}>
                <Column title="Mains" add={canEdit ? () => add('main') : undefined} enabled>
                  {data.mains.map((r) => (
                    <Row key={r.id} selected={r.id === path.main} onClick={() => go('main', r.id)} onEdit={canEdit ? () => edit('main', r.id) : undefined} name={r.name} count={r.count} />
                  ))}
                </Column>
                <Column title="Units" add={canEdit && path.main ? () => add('unit') : undefined} enabled={!!path.main}>
                  {data.units.map((r) => (
                    <Row key={r.id} selected={r.id === path.unit} onClick={() => go('unit', r.id)} onEdit={canEdit ? () => edit('unit', r.id) : undefined} name={r.name} count={r.count} />
                  ))}
                </Column>
                <Column title="Lessons" add={canEdit && path.unit ? () => add('lesson') : undefined} enabled={!!path.unit}>
                  {data.lessons.map((r) => (
                    <Row key={r.id} selected={r.id === path.lesson} onClick={() => go('lesson', r.id)} onEdit={canEdit ? () => edit('lesson', r.id) : undefined} name={r.name}
                      sub={`${fmtDay(r.startDate)} – ${fmtDay(r.endDate)} · ${plural(r.count, 'micro lesson')}`} />
                  ))}
                </Column>
                <Column title="Micro lessons" add={canEdit && path.lesson ? () => add('micro') : undefined} enabled={!!path.lesson} last>
                  {data.microLessons.map((r) => (
                    <Row key={r.id} strong selected={r.id === path.micro} onClick={() => go('micro', r.id)} onEdit={canEdit ? () => edit('micro', r.id) : undefined} name={r.name}
                      sub={`${r.type === 0 ? 'Video' : 'Text'} · ${r.exercises ? `${plural(r.exercises, 'exercise')} · ${plural(r.questions, 'question')}` : 'No exercises yet'}`} />
                  ))}
                </Column>
              </Box>
            </Box>
          ) : (
            <Box sx={{ bgcolor: C.panel, border: `1px solid ${C.line}`, borderRadius: 3, p: 3 }}>
              <Typography color="text.secondary">
                {!data.grades.length ? 'This country has no grades yet. Add one with the Grade chip.'
                  : !path.subject ? 'This grade has no subjects yet. Add one with the Subject chip.'
                  : 'This subject has no masters in this grade yet. Add one with the Master chip.'}
              </Typography>
            </Box>
          )}

          {micro && <MicroCard micro={micro} onEdit={canEdit ? () => edit('micro', micro.id) : undefined} />}
        </>
      )}

      {dialog?.kind === 'item' && (
        <ItemDialog level={dialog.level} id={dialog.id} parent={dialog.parent} onClose={() => setDialog(null)} onSaved={saved(keyOfDialog)} />
      )}
      {dialog?.kind === 'micro' && <MicroDialog id={dialog.id} parent={dialog.parent} onClose={() => setDialog(null)} onSaved={saved('micro')} />}
    </Stack>
  );
}

function toParams(p: Path) {
  const q = new URLSearchParams();
  for (const k of PATH_KEYS) if (p[k]) q.set(k, String(p[k]));
  return q;
}

function ChipSelect(props: { label: string; items: Named[]; value?: number; onPick: (id: number) => void; onAdd?: () => void; onEdit?: (id: number) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = props.items.find((i) => i.id === props.value);
  const close = (then?: () => void) => { setAnchor(null); then?.(); };
  return (
    <>
      <ButtonBase onClick={(e) => setAnchor(e.currentTarget)} aria-haspopup="menu"
        sx={{ height: 30, px: 1.25, border: `1px solid ${C.line}`, borderRadius: 999, bgcolor: C.panel, fontSize: 13, gap: 0.75, color: C.text, '&:hover': { borderColor: C.faint } }}>
        <Box component="span" sx={{ color: C.muted }}>{props.label}</Box>
        <span>{current?.name ?? `No ${props.label.toLowerCase()}`}</span>
        <ExpandMoreIcon sx={{ fontSize: 16, color: C.faint }} />
      </ButtonBase>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => close()} slotProps={{ paper: { sx: { minWidth: 220, maxHeight: 420 } } }}>
        {props.items.map((i) => (
          <MenuItem key={i.id} selected={i.id === props.value} onClick={() => close(() => props.onPick(i.id))}>{i.name}</MenuItem>
        ))}
        {!props.items.length && <MenuItem disabled>No {props.label.toLowerCase()}s yet</MenuItem>}
        {(props.onAdd || (props.onEdit && current)) && <Divider />}
        {props.onEdit && current && (
          <MenuItem onClick={() => close(() => props.onEdit!(current.id))}>
            <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>Edit {current.name}
          </MenuItem>
        )}
        {props.onAdd && (
          <MenuItem onClick={() => close(props.onAdd)} sx={{ color: C.blue }}>
            <ListItemIcon><AddIcon fontSize="small" sx={{ color: C.blue }} /></ListItemIcon>Add {props.label.toLowerCase()}
          </MenuItem>
        )}
      </Menu>
    </>
  );
}

function Column(props: { title: string; add?: () => void; enabled: boolean; last?: boolean; children: ReactNode[] }) {
  const count = props.children.length;
  const singular = props.title === 'Micro lessons' ? 'micro lesson' : props.title.slice(0, -1).toLowerCase();
  return (
    <Box component="section" aria-label={props.title} sx={{ borderRight: props.last ? 0 : `1px solid ${C.line}`, minWidth: 0 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1.75, py: 1.25, borderBottom: `1px solid ${C.line}`, minHeight: 55 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
          {props.title} {props.enabled && <Box component="span" sx={{ color: C.muted, fontWeight: 400 }}>{count}</Box>}
        </Typography>
        {props.add && (
          <Tooltip title={`Add ${singular}`}>
            <IconButton onClick={props.add} aria-label={`Add ${singular}`} size="small"
              sx={{ width: 30, height: 30, border: `1px solid ${C.line}`, borderRadius: 2, color: C.blue }}>
              <AddIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      <Stack spacing={0.25} sx={{ p: 0.75 }}>
        {props.children}
        {props.enabled && !count && (
          <Box sx={{ px: 1.25, py: 1.5 }}>
            <Typography sx={{ fontSize: 13, color: C.muted }}>No {singular}s yet.</Typography>
            {props.add && <Button size="small" startIcon={<AddIcon />} onClick={props.add} sx={{ mt: 0.5, ml: -0.5 }}>Add {singular}</Button>}
          </Box>
        )}
      </Stack>
    </Box>
  );
}

function Row(props: { name: string; sub?: string; count?: number | null; selected: boolean; strong?: boolean; onClick: () => void; onEdit?: () => void }) {
  const solid = props.selected && props.strong;
  return (
    <Box sx={{
      position: 'relative', borderRadius: 2,
      bgcolor: solid ? C.blue : props.selected ? C.blueSoft : 'transparent',
      color: solid ? '#fff' : props.selected ? C.blueDark : C.text,
      '&:hover': { bgcolor: solid ? C.blue : props.selected ? C.blueSoft : C.page },
      '&:hover .edit, &:focus-within .edit': { opacity: 1 },
    }}>
      <ButtonBase onClick={props.onClick} aria-current={props.selected ? 'true' : undefined}
        sx={{ width: '100%', textAlign: 'left', justifyContent: 'flex-start', display: 'flex', gap: 1, px: 1.25, py: 1.1, pr: props.onEdit ? 5 : 1.25, borderRadius: 2, fontSize: 14 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontWeight: props.selected ? 600 : 400, overflowWrap: 'anywhere' }}>{props.name}</Box>
          {props.sub && <Box sx={{ fontSize: 12, color: props.selected ? 'inherit' : C.muted, mt: 0.25 }}>{props.sub}</Box>}
        </Box>
        {props.count != null && <Box sx={{ fontSize: 12, color: props.selected ? 'inherit' : C.muted }}>{props.count}</Box>}
      </ButtonBase>
      {props.onEdit && (
        <IconButton className="edit" aria-label={`Edit ${props.name}`} onClick={props.onEdit} size="small"
          sx={{ position: 'absolute', right: 4, top: 6, opacity: { xs: 1, md: props.selected ? 1 : 0 }, color: 'inherit', transition: 'opacity .15s' }}>
          <EditOutlinedIcon sx={{ fontSize: 17 }} />
        </IconButton>
      )}
    </Box>
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
        {onEdit && <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={onEdit} sx={{ height: 38, borderColor: C.line }}>Edit content</Button>}
        <Button component={Link} to={`/micro_lessons/${micro.id}/show`} variant="contained" endIcon={<ArrowForwardIcon />} sx={{ height: 38, px: 2 }}>
          Open micro lesson workspace
        </Button>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
        <Stat label="Exercises" value={micro.exercises} note={micro.exerciseNames.length ? micro.exerciseNames.slice(0, 3).join(', ') + (micro.exerciseNames.length > 3 ? '…' : '') : 'None yet'} />
        <Stat label="Questions" value={micro.questions} note={plural(micro.questionTypes, 'question type')} />
        <Stat label="Options" value={micro.options} note={`in ${plural(micro.optionGroups, 'option group')}`} />
        <Stat label="To check" value={micro.toCheck} note={micro.toCheck ? 'questions with no question text' : 'nothing to check'} warn={micro.toCheck > 0} />
      </Box>
      <Typography sx={{ fontSize: 13, color: C.muted }}>Exercises, questions, option groups and options are managed in the micro lesson workspace.</Typography>
    </Box>
  );
}
