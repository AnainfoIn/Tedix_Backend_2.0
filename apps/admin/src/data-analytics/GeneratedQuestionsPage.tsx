import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
  Alert, Box, Button, Card, Chip, CircularProgress, FormControlLabel, Link as MuiLink, Stack, Switch, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Title } from 'react-admin';
import { Link, useSearchParams } from 'react-router-dom';
import type { GeneratedCounts, GeneratedRow } from '../../../api/src/admin/data-analytics/data-analytics.service';
import { apiFetch } from '../api';
import { useCountry } from '../curriculum/api';
import { C } from '../theme';

/** Drill-down order. The country level is skipped when a country is picked in the top bar. */
const LEVELS = ['country', 'grade', 'subject', 'master', 'main', 'unit', 'lesson', 'microLesson'] as const;
type Level = (typeof LEVELS)[number];
const LABEL: Record<Level, { one: string; many: string }> = {
  country: { one: 'Country', many: 'Countries' }, grade: { one: 'Grade', many: 'Grades' }, subject: { one: 'Subject', many: 'Subjects' },
  master: { one: 'Master', many: 'Masters' }, main: { one: 'Main', many: 'Mains' }, unit: { one: 'Unit', many: 'Units' },
  lesson: { one: 'Lesson', many: 'Lessons' }, microLesson: { one: 'Micro lesson', many: 'Micro lessons' },
};
const GENERATED = '#6A1B9A';
const GENERATED_SOFT = '#F3E5F5';
const REGULAR = C.blue;
const EMPTY = '#C9CED6';

const zero = (): GeneratedCounts => ({ exercises: 0, template: 0, templateWithVariables: 0, regular: 0, noQuestion: 0 });
const add = (a: GeneratedCounts, b: GeneratedCounts) => {
  a.exercises += b.exercises; a.template += b.template; a.templateWithVariables += b.templateWithVariables;
  a.regular += b.regular; a.noQuestion += b.noQuestion;
};
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const fmt = (v: number) => v.toLocaleString('en-GB');

interface Group extends GeneratedCounts { id: number; name: string; position: number | null }
interface Exercise { id: number; name: string; questionType: number | null; kind: string | null; question: string | null; variables: number }

/**
 * DataAnalytics › Generated questions: how many exercises in each Grade → Subject → Master → Main →
 * Unit → Lesson → Micro lesson have generated (template) questions vs regular ones. Click a row to go
 * one level down; at a micro lesson the page lists its exercises. Read-only.
 */
export function GeneratedQuestionsPage() {
  const country = useCountry();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<{ rows: GeneratedRow[]; unplaced: GeneratedCounts } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onlyGenerated = params.get('only') === '1';

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    apiFetch<{ rows: GeneratedRow[]; unplaced: GeneratedCounts }>(`/data-analytics/generated-questions${country ? `?countryId=${country}` : ''}`)
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [country]);

  const levels = useMemo(() => (country ? LEVELS.slice(1) : LEVELS), [country]);
  // The drill-down path lives in the URL (?grade=3&subject=7...), so it survives reloads and links.
  const path = useMemo(() => {
    const p: Partial<Record<Level, number>> = {};
    for (const l of levels) {
      const v = Number(params.get(l));
      if (!(v > 0)) break;
      p[l] = v;
    }
    return p;
  }, [params, levels]);
  const depth = Object.keys(path).length;
  const level: Level | null = levels[depth] ?? null; // null: a micro lesson is open

  const inScope = useMemo(
    () => (data?.rows ?? []).filter((r) => Object.entries(path).every(([l, id]) => r[l as Level].id === id)),
    [data, path],
  );
  const total = useMemo(() => {
    const t = zero();
    inScope.forEach((r) => add(t, r));
    return t;
  }, [inScope]);
  const groups = useMemo(() => {
    if (!level) return [];
    const map = new Map<number, Group>();
    for (const r of inScope) {
      const node = r[level];
      let g = map.get(node.id);
      if (!g) map.set(node.id, (g = { id: node.id, name: node.name ?? `#${node.id} (missing)`, position: 'position' in node ? node.position : null, ...zero() }));
      add(g, r);
    }
    return [...map.values()].sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9) || a.name.localeCompare(b.name) || a.id - b.id);
  }, [inScope, level]);
  const shown = onlyGenerated ? groups.filter((g) => g.template > 0) : groups;

  const crumbs = levels.slice(0, depth).map((l) => {
    const row = inScope[0];
    return { level: l, id: path[l]!, name: row?.[l].name ?? `#${path[l]}` };
  });
  const goTo = (d: number, next?: { level: Level; id: number }) => {
    const q = new URLSearchParams();
    levels.slice(0, d).forEach((l) => q.set(l, String(path[l])));
    if (next) q.set(next.level, String(next.id));
    if (onlyGenerated) q.set('only', '1');
    setParams(q);
  };
  const toggleOnly = (on: boolean) => {
    const q = new URLSearchParams(params);
    if (on) q.set('only', '1'); else q.delete('only');
    setParams(q, { replace: true });
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
      <Title title="DataAnalytics" />
      <Typography variant="h5" sx={{ mb: 0.5 }}>Generated questions</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 820 }}>
        A <b>generated</b> question is an exercise whose question type is <b>Template</b>: it has variables (min, max, formula) and the
        app fills in new numbers each time. <b>Regular</b> questions have fixed values. Counts are per exercise (one question per exercise),
        {country ? ' for the country picked in the top bar.' : ' for all countries. Pick a country in the top bar to narrow it.'}
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!data && !error && <CircularProgress size={28} />}

      {data && (
        <>
          <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 2, gap: 0.25, fontSize: 14 }}>
            <Crumb label={country ? 'All grades' : 'All countries'} onClick={depth ? () => goTo(0) : undefined} />
            {crumbs.map((c, i) => (
              <Fragment key={c.level}>
                <ChevronRightIcon sx={{ fontSize: 18, color: C.faint }} />
                <Crumb label={`${LABEL[c.level].one}: ${c.name}`} onClick={i < crumbs.length - 1 ? () => goTo(i + 1) : undefined} />
              </Fragment>
            ))}
          </Stack>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5, mb: 2.5 }}>
            <Tile label="Exercises" value={fmt(total.exercises)} />
            <Tile label="Generated (template)" value={fmt(total.template)} sub={`${pct(total.template, total.exercises)}% of exercises${total.template > total.templateWithVariables ? ` · ${fmt(total.template - total.templateWithVariables)} without variables` : ''}`} color={GENERATED} />
            <Tile label="Regular" value={fmt(total.regular)} sub={`${pct(total.regular, total.exercises)}% of exercises`} color={REGULAR} />
            <Tile label="No question yet" value={fmt(total.noQuestion)} sub={`${pct(total.noQuestion, total.exercises)}% of exercises`} />
          </Box>

          {level ? (
            <Card>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider' }}>
                <Typography sx={{ fontWeight: 600 }}>
                  {LABEL[level].many} <Typography component="span" color="text.secondary">({shown.length}{onlyGenerated ? ` of ${groups.length}` : ''})</Typography>
                </Typography>
                <FormControlLabel control={<Switch size="small" checked={onlyGenerated} onChange={(e) => toggleOnly(e.target.checked)} />}
                  label={<Typography variant="body2">Only with generated questions</Typography>} />
              </Stack>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{LABEL[level].one}</TableCell>
                      <TableCell align="right">Exercises</TableCell>
                      <TableCell align="right">Generated</TableCell>
                      <TableCell align="right">Regular</TableCell>
                      <TableCell align="right">No question</TableCell>
                      <TableCell sx={{ width: 220 }}>Share generated</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {shown.length === 0 && (
                      <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">Nothing here{onlyGenerated ? ' has generated questions' : ''}.</Typography></TableCell></TableRow>
                    )}
                    {shown.map((g) => (
                      <TableRow key={g.id} hover onClick={() => goTo(depth, { level, id: g.id })} sx={{ cursor: 'pointer' }}>
                        <TableCell sx={{ fontWeight: 500 }}>{g.name}</TableCell>
                        <TableCell align="right">{fmt(g.exercises)}</TableCell>
                        <TableCell align="right" sx={{ color: g.template ? GENERATED : 'text.secondary', fontWeight: g.template ? 600 : 400 }}>{fmt(g.template)}</TableCell>
                        <TableCell align="right">{fmt(g.regular)}</TableCell>
                        <TableCell align="right" sx={{ color: 'text.secondary' }}>{fmt(g.noQuestion)}</TableCell>
                        <TableCell><Split counts={g} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          ) : (
            <MicroLessonExercises id={path.microLesson!} />
          )}

          {!country && data.unplaced.exercises > 0 && depth === 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {fmt(data.unplaced.exercises)} exercise(s) point at a micro lesson that no longer exists ({fmt(data.unplaced.template)} generated). They are not in the table above.
            </Alert>
          )}
        </>
      )}
    </Box>
  );
}

function MicroLessonExercises({ id }: { id: number }) {
  const [rows, setRows] = useState<Exercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setRows(null);
    apiFetch<Exercise[]>(`/data-analytics/generated-questions/micro-lessons/${id}`).then((r) => live && setRows(r)).catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [id]);
  return (
    <Card>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider' }}>
        <Typography sx={{ fontWeight: 600 }}>Exercises</Typography>
        <Button component={Link} to={`/micro_lessons/${id}/show`} size="small" variant="outlined">Open micro lesson</Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {!rows && !error && <Box sx={{ p: 2 }}><CircularProgress size={22} /></Box>}
      {rows && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell><TableCell>Exercise</TableCell><TableCell>Question</TableCell><TableCell align="right">Variables</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((e, i) => (
                <TableRow key={e.id} hover>
                  <TableCell sx={{ color: 'text.secondary' }}>{i + 1}.</TableCell>
                  <TableCell>
                    <MuiLink component={Link} to={`/micro_lessons/${id}/show?item=exercise-${e.id}`} underline="hover" sx={{ fontWeight: 500 }}>{e.name}</MuiLink>
                    {e.question && <Typography variant="caption" color="text.secondary" component="div" noWrap sx={{ maxWidth: 560 }}>{e.question}</Typography>}
                  </TableCell>
                  <TableCell><Kind kind={e.kind} /></TableCell>
                  <TableCell align="right">{e.variables || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Card>
  );
}

function Kind({ kind }: { kind: string | null }) {
  if (kind === 'template') return <Chip size="small" label="Generated" sx={{ bgcolor: GENERATED_SOFT, color: GENERATED, fontWeight: 600 }} />;
  if (kind === 'regular') return <Chip size="small" label="Regular" sx={{ bgcolor: C.blueSoft, color: C.blueDark, fontWeight: 600 }} />;
  return <Typography variant="body2" color="text.secondary">No question yet</Typography>;
}

/** Stacked bar: generated | regular | no question, with the generated share as text. */
function Split({ counts }: { counts: GeneratedCounts }) {
  const t = counts.exercises || 1;
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Box sx={{ display: 'flex', flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', bgcolor: C.chip }}
        title={`Generated ${counts.template}, regular ${counts.regular}, no question ${counts.noQuestion}`}>
        <Box sx={{ width: `${(counts.template / t) * 100}%`, bgcolor: GENERATED }} />
        <Box sx={{ width: `${(counts.regular / t) * 100}%`, bgcolor: REGULAR, opacity: 0.55 }} />
        <Box sx={{ width: `${(counts.noQuestion / t) * 100}%`, bgcolor: EMPTY }} />
      </Box>
      <Typography variant="body2" sx={{ width: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct(counts.template, counts.exercises)}%</Typography>
    </Stack>
  );
}

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card sx={{ px: 2, py: 1.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>{label}</Typography>
      <Typography sx={{ fontSize: 26, fontWeight: 700, color: color ?? 'text.primary', lineHeight: 1.3 }}>{value}</Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Card>
  );
}

function Crumb({ label, onClick }: { label: string; onClick?: () => void }) {
  if (!onClick) return <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{label}</Typography>;
  return <MuiLink component="button" underline="hover" onClick={onClick} sx={{ fontSize: 14 }}>{label}</MuiLink>;
}
