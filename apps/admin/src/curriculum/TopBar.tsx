import SearchIcon from '@mui/icons-material/Search';
import { Autocomplete, Box, Button, InputBase, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { AppBar, useDataProvider } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { C } from '../theme';
import { loadCurriculum, Named, setCountry, useCountry } from './api';

type Rec = Record<string, any>;
interface Hit { key: string; kind: string; label: string; to: string }

const curriculumUrl = (r: Rec, extra: Record<string, unknown> = {}) => {
  const q = new URLSearchParams();
  const pick: Array<[string, unknown]> = [
    ['country', r.countryId], ['grade', r.gradeId ?? r.categoryId], ['subject', r.subjectId ?? r.subCategoryId], ['master', r.masterId ?? r.courseId],
    ['main', r.mainId], ['unit', r.unitId], ['lesson', r.lessonId], ...Object.entries(extra),
  ];
  for (const [k, v] of pick) if (v != null && v !== '') q.set(k, String(v));
  return `/curriculum?${q}`;
};

const plain = (s: unknown) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\\text\{([^}]*)\}/g, '$1').replace(/\s+/g, ' ').trim();

/** "Find any item, exercise or question text": searches the curriculum by name and questions by text. */
function Search() {
  const dataProvider = useDataProvider();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) { setHits([]); return; }
    let live = true;
    setLoading(true);
    const t = setTimeout(async () => {
      const get = (resource: string) =>
        dataProvider.getList(resource, { filter: { q }, pagination: { page: 1, perPage: 5 }, sort: { field: 'id', order: 'ASC' } })
          .then((r) => r.data as Rec[]).catch(() => [] as Rec[]);
      const [mains, units, lessons, micros, exercises, questions] = await Promise.all(
        ['mains', 'units', 'lessons', 'micro_lessons', 'exercises', 'question_banks'].map(get),
      );
      if (!live) return;
      setHits([
        ...mains.map((r) => ({ key: `m${r.id}`, kind: 'Main', label: r.name, to: curriculumUrl({ ...r, mainId: r.id }) })),
        ...units.map((r) => ({ key: `u${r.id}`, kind: 'Unit', label: r.name, to: curriculumUrl({ ...r, unitId: r.id }) })),
        ...lessons.map((r) => ({ key: `l${r.id}`, kind: 'Lesson', label: r.name, to: curriculumUrl({ ...r, lessonId: r.id }) })),
        ...micros.map((r) => ({ key: `ml${r.id}`, kind: 'Micro lesson', label: r.name, to: curriculumUrl(r, { micro: r.id }) })),
        ...exercises.map((r) => ({ key: `e${r.id}`, kind: 'Exercise', label: r.name, to: `/micro_lessons/${r.microLessonId}/show?item=exercise-${r.id}` })),
        ...questions.map((r) => ({ key: `q${r.id}`, kind: 'Question', label: plain(r.question).slice(0, 90), to: `/question_banks/${r.id}/show` })),
      ]);
      setLoading(false);
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [text, dataProvider]);

  return (
    <Autocomplete<Hit, false, false, true>
      freeSolo options={hits} loading={loading} filterOptions={(o) => o} inputValue={text}
      onInputChange={(_, v, reason) => { if (reason !== 'reset') setText(v); }}
      getOptionLabel={(o) => (typeof o === 'string' ? o : o.label)}
      groupBy={(o) => o.kind}
      onChange={(_, v) => { if (v && typeof v !== 'string') { navigate(v.to); setText(''); } }}
      renderOption={(props, o) => <li {...props} key={o.key}><ListItemText primary={o.label} /></li>}
      sx={{ flex: '0 1 420px', ml: { xs: 1, md: 3 }, minWidth: 0 }}
      renderInput={(params) => (
        <Box ref={params.InputProps.ref} sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 36, px: 1.5, border: `1px solid ${C.line}`, borderRadius: 2, bgcolor: C.page, color: C.muted }}>
          <SearchIcon sx={{ fontSize: 18 }} />
          <InputBase inputProps={{ ...params.inputProps, 'aria-label': 'Search' }} placeholder="Find any item, exercise or question text" sx={{ flex: 1, fontSize: 14, color: C.text }} />
        </Box>
      )}
    />
  );
}

/** Country in the top bar: the Curriculum screen shows this country's grades. */
function CountryButton() {
  const country = useCountry();
  const navigate = useNavigate();
  const [countries, setCountries] = useState<Named[]>([]);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  useEffect(() => {
    loadCurriculum({}).then((c) => {
      setCountries(c.countries);
      if (!country && c.countries.length) {
        const ro = c.countries.find((x) => /^roman/i.test(x.name));
        setCountry((ro ?? c.countries[0]).id);
      }
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const name = useMemo(() => countries.find((c) => c.id === country)?.name, [countries, country]);
  return (
    <>
      <Button onClick={(e) => setAnchor(e.currentTarget)} variant="outlined" color="inherit"
        sx={{ height: 36, borderColor: C.line, fontWeight: 400, fontSize: 14, gap: 1, whiteSpace: 'nowrap' }}>
        <Box component="span" sx={{ color: C.muted, display: { xs: 'none', sm: 'inline' } }}>Country</Box><strong>{name ?? 'Choose'}</strong>
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {countries.map((c) => (
          <MenuItem key={c.id} selected={c.id === country} onClick={() => { setCountry(c.id); setAnchor(null); navigate(`/curriculum?country=${c.id}`); }}>
            {c.name}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

export function TopBar() {
  return (
    <AppBar color="inherit" toolbar={<CountryButton />} sx={{ '& .RaAppBar-toolbar': { gap: 1.5, minHeight: 56 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, fontWeight: 700, fontSize: 17, whiteSpace: 'nowrap' }}>
        <Box component="span" sx={{ width: 28, height: 28, borderRadius: 2, bgcolor: C.blue, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>T</Box>
        <Typography component="span" sx={{ fontWeight: 700, fontSize: 17, display: { xs: 'none', sm: 'inline' } }}>Tedix Admin</Typography>
      </Box>
      <Search />
      <Box sx={{ flex: 1 }} />
    </AppBar>
  );
}
