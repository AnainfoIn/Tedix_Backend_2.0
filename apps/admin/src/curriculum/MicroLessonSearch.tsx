import SearchIcon from '@mui/icons-material/Search';
import { Box, Button, CircularProgress, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Title, useDataProvider } from 'react-admin';
import { Link, useSearchParams } from 'react-router-dom';
import { C } from '../theme';

type Rec = Record<string, any>;

/** Menu > Micro lessons: type a name, open the micro lesson's editor or its translation review. */
export function MicroLessonSearch() {
  const dataProvider = useDataProvider();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const [rows, setRows] = useState<Rec[]>([]);
  const [paths, setPaths] = useState<Record<number, string>>({});
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = text.trim();
    let live = true;
    setLoading(true);
    const t = setTimeout(async () => {
      setParams(q ? { q } : {}, { replace: true });
      try {
        const r = await dataProvider.getList('micro_lessons', {
          filter: q ? { q } : {}, pagination: { page: 1, perPage: 50 }, sort: { field: q ? 'name' : 'updatedAt', order: q ? 'ASC' : 'DESC' },
        });
        if (!live) return;
        setRows(r.data);
        setTotal(r.total ?? r.data.length);
        setError(null);
        const ids = [...new Set(r.data.map((m: Rec) => m.lessonId).filter(Boolean))];
        if (ids.length) {
          const [lessons, units] = await Promise.all([
            dataProvider.getMany('lessons', { ids }).then((x) => x.data),
            dataProvider.getMany('units', { ids: [...new Set(r.data.map((m: Rec) => m.unitId).filter(Boolean))] }).then((x) => x.data).catch(() => []),
          ]);
          if (!live) return;
          const unitName = new Map(units.map((u: Rec) => [u.id, u.name]));
          setPaths(Object.fromEntries(lessons.map((l: Rec) => [l.id, [unitName.get(l.unitId), l.name].filter(Boolean).join(' / ')])));
        }
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        if (live) setLoading(false);
      }
    }, 250);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, dataProvider]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 1100 }}>
      <Title title="Micro lessons" />
      <Typography component="h1" sx={{ fontSize: 24, fontWeight: 700 }}>Micro lessons</Typography>
      <TextField
        autoFocus fullWidth value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a micro lesson name, e.g. Jumătăți"
        aria-label="Search micro lessons"
        sx={{ bgcolor: C.panel, maxWidth: 640 }}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>, endAdornment: loading ? <CircularProgress size={18} /> : null } }}
      />
      <Typography sx={{ fontSize: 13, color: C.muted }}>
        {error ? error : total == null ? '' : text.trim() ? `${total} match${total === 1 ? '' : 'es'}${total > rows.length ? `, showing the first ${rows.length}` : ''}` : 'Recently updated'}
      </Typography>
      <Box sx={{ bgcolor: C.panel, border: `1px solid ${C.line}`, borderRadius: 3, overflow: 'hidden' }}>
        {!loading && rows.length === 0 && !error && <Typography sx={{ p: 2.5, color: C.muted }}>No micro lesson has that name.</Typography>}
        {rows.map((m, i) => (
          <Stack key={m.id} direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} spacing={1.5}
            sx={{ px: 2.5, py: 1.5, borderTop: i ? `1px solid ${C.line}` : 'none', '&:hover': { bgcolor: C.page } }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography component={Link} to={`/micro_lessons/${m.id}/show`}
                sx={{ fontSize: 15, fontWeight: 600, color: C.text, textDecoration: 'none', '&:hover': { color: C.blue } }}>{m.name}</Typography>
              <Typography sx={{ fontSize: 12.5, color: C.muted }} noWrap>
                {[paths[m.lessonId], m.microLessonType != null ? (Number(m.microLessonType) === 0 ? 'Video' : 'Text') : null].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button component={Link} to={`/micro_lessons/${m.id}/show`} variant="contained" size="small">Open</Button>
              <Button component={Link} to={`/micro_lessons/${m.id}/review`} variant="outlined" size="small">Review</Button>
            </Stack>
          </Stack>
        ))}
      </Box>
    </Box>
  );
}
