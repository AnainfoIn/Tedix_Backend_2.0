import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Alert, AlertTitle, Box, Button, Card, CardContent, CircularProgress, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { Title } from 'react-admin';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Cell as PieCell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { Block, Cell, Page, Section } from '../../../api/src/admin/analytics/pages';
import { apiFetch } from '../api';

/** Categorical slots, fixed order (same as the API's PALETTE). */
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const INK_MUTED = '#898781';
const GRID = '#e6e5e0';
const TONES = { good: '#0ca30c', warn: '#c98500', bad: '#d03b3b' } as const;
const EMPTY = 'No data for this period yet.';
const today = () => new Date().toISOString().slice(0, 10);

/** Menu entries of the Analytics group, in the old ActiveAdmin priority order. */
export const ANALYTICS_PAGES: Array<{ key: string; label: string }> = [
  { key: 'app-users', label: 'App Users' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'engagement', label: 'Engagement Overview' },
  { key: 'retention', label: 'Sign-ups & Retention' },
  { key: 'lessons', label: 'Lessons' },
  { key: 'puzzle-mix', label: 'Puzzle Mix' },
  { key: 'weekly-challenges', label: 'Weekly Challenges' },
  { key: 'competitions', label: 'Competitions' },
  { key: 'shadows-shields', label: 'Shadows & Shields' },
];

export function AnalyticsPage() {
  const { page = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = params.toString();

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    apiFetch<{ data: Page }>(`/analytics/${page}${query ? `?${query}` : ''}`)
      .then((res) => live && setData(res.data))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [page, query]);

  const apply = (next: Record<string, string | undefined>) => {
    const out = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) out.set(k, v);
    setParams(out);
  };
  const label = ANALYTICS_PAGES.find((p) => p.key === page)?.label ?? 'Analytics';

  return (
    <Box sx={{ py: 2, maxWidth: 1400 }}>
      <Title title={data?.title ?? label} />
      <Typography variant="h5" sx={{ mb: 2 }}>{data?.title ?? label}</Typography>
      {data && <Filters page={data} params={params} onApply={apply} />}
      {error && <Alert severity="error">{error}</Alert>}
      {!data && !error && <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>}
      {data?.unavailable && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <AlertTitle>{data.unavailable.title}</AlertTitle>
          {data.unavailable.message}
          {data.unavailable.detail && <Typography variant="caption" component="div" sx={{ mt: 1, opacity: 0.8 }}>{data.unavailable.detail}</Typography>}
        </Alert>
      )}
      {data?.sections.map((s, i) => <SectionView key={`${page}-${i}`} section={s} />)}
    </Box>
  );
}

// ------------------------------------------------------------------------------- filters

function Filters({ page, params, onApply }: { page: Page; params: URLSearchParams; onApply: (p: Record<string, string | undefined>) => void }) {
  const range = page.range;
  const [preset, setPreset] = useState(range?.preset ?? '');
  const [from, setFrom] = useState(range?.from ?? '');
  const [to, setTo] = useState(range?.to ?? '');
  useEffect(() => {
    setPreset(range?.preset ?? '');
    setFrom(range?.from ?? '');
    setTo(range?.to ?? '');
  }, [range?.preset, range?.from, range?.to]);

  const custom = () => onApply({ preset: 'custom', from, to });
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
        {range && (
          <>
            <TextField
              select size="small" label="Period" value={preset} fullWidth={false} sx={{ width: 200 }}
              onChange={(e) => {
                setPreset(e.target.value);
                if (e.target.value !== 'custom') onApply({ preset: e.target.value });
              }}
            >
              {range.presets.map(([value, text]) => <MenuItem key={value} value={value}>{text}</MenuItem>)}
            </TextField>
            <TextField size="small" type="date" label="From" fullWidth={false} sx={{ width: 170 }} value={from} InputLabelProps={{ shrink: true }} inputProps={{ max: today() }}
              onChange={(e) => { setFrom(e.target.value); setPreset('custom'); }} />
            <TextField size="small" type="date" label="To" fullWidth={false} sx={{ width: 170 }} value={to} InputLabelProps={{ shrink: true }} inputProps={{ max: today() }}
              onChange={(e) => { setTo(e.target.value); setPreset('custom'); }} />
            <Button variant="contained" onClick={custom}>Apply</Button>
            <Button
              variant="outlined" startIcon={<RefreshIcon />}
              title="Fetch the latest numbers from Google Analytics instead of the 30-minute cache"
              onClick={() => onApply({ preset: range.preset, from: range.preset === 'custom' ? range.from : undefined, to: range.preset === 'custom' ? range.to : undefined, refresh: String(Date.now()) })}
            >
              Refresh data
            </Button>
          </>
        )}
        {page.countries && (
          <TextField
            select size="small" label="Country" value={params.get('country') || 'All'} fullWidth={false} sx={{ width: 260 }}
            onChange={(e) => onApply({ country: e.target.value === 'All' ? undefined : e.target.value })}
          >
            <MenuItem value="All">All countries</MenuItem>
            {page.countries.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        {range
          ? <>Showing <strong>{range.label}</strong> ({range.days} days) · Source: Google Analytics 4 · Numbers are cached for up to 30 minutes</>
          : 'Source: app database (live data)'}
      </Typography>
    </Paper>
  );
}

// ------------------------------------------------------------------------------- blocks

function SectionView({ section }: { section: Section }) {
  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6" sx={{ mb: section.description ? 0.5 : 1.5 }}>{section.title}</Typography>
        {section.description && <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{section.description}</Typography>}
        <Stack spacing={2}>{section.blocks.map((b, i) => <BlockView key={i} block={b} />)}</Stack>
      </CardContent>
    </Card>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'kpis':
      return (
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
          {block.items.map((k) => (
            <Paper key={k.label} variant="outlined" sx={{ p: 1.5, borderLeft: 4, borderLeftColor: k.tone ? TONES[k.tone] : 'divider' }}>
              <Typography variant="caption" color="text.secondary">{k.label}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 600, color: k.tone ? TONES[k.tone] : 'text.primary' }}>{k.value}</Typography>
              {k.hint !== undefined && <Typography variant="caption" color="text.secondary">{k.hint}</Typography>}
            </Paper>
          ))}
        </Box>
      );
    case 'grid':
      return (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: `repeat(${block.columns}, minmax(0, 1fr))` } }}>
          {block.cards.map((c, i) => <BlockView key={i} block={c} />)}
        </Box>
      );
    case 'card':
      return (
        <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{block.title}</Typography>
          {block.description && <Typography variant="body2" color="text.secondary">{block.description}</Typography>}
          <Stack spacing={1.5} sx={{ mt: 1 }}>{block.blocks.map((b, i) => <BlockView key={i} block={b} />)}</Stack>
        </Paper>
      );
    case 'chart':
      return <ChartView block={block} />;
    case 'funnel':
      return <FunnelView block={block} />;
    case 'table':
      return <TableView block={block} />;
    case 'definitions':
      return (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>{block.title}</Typography>
          <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '220px 1fr' }, columnGap: 2, rowGap: 1 }}>
            {block.items.map(([term, text]) => (
              <Box key={term} sx={{ display: 'contents' }}>
                <Typography component="dt" variant="body2" sx={{ fontWeight: 600 }}>{term}</Typography>
                <Typography component="dd" variant="body2" color="text.secondary" sx={{ m: 0 }}>{text}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      );
  }
}

const formatValue = (v: number, suffix = '') => `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })}${suffix}`;

function ChartView({ block }: { block: Extract<Block, { kind: 'chart' }> }) {
  const o = block.options ?? {};
  const height = o.height ?? 280;
  const colors = o.colors ?? PALETTE;
  const series = block.series;
  const hasData = series.some((s) => s.points.some(([, v]) => Number(v) !== 0));
  if (!hasData) {
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover', borderRadius: 1 }}>
        <Typography variant="body2" color="text.secondary">{EMPTY}</Typography>
      </Box>
    );
  }
  const multi = series.length > 1;
  const tooltip = <Tooltip formatter={(v: number) => formatValue(Number(v), o.suffix)} />;
  const legend = multi ? <Legend verticalAlign="bottom" iconType="plainline" /> : null;

  if (block.chart === 'pie') {
    const rows = series[0].points.map(([name, value]) => ({ name, value: Number(value) }));
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius={o.donut ? '55%' : 0} outerRadius="85%" stroke="#fff" strokeWidth={2} isAnimationActive={false}>
            {rows.map((_, i) => <PieCell key={i} fill={colors[i % colors.length]} />)}
          </Pie>
          {tooltip}
          <Legend verticalAlign="bottom" />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // One row per category label, one key per series.
  const labels = series[0].points.map(([l]) => l);
  const keys = series.map((s, i) => s.name || `s${i}`);
  const rows = labels.map((label, r) => Object.fromEntries([['label', label], ...series.map((s, i) => [keys[i], Number(s.points[r]?.[1] ?? 0)])]));
  const axisProps = { tick: { fill: INK_MUTED, fontSize: 12 }, stroke: GRID, tickLine: false };
  const yAxis = (
    <YAxis {...axisProps} width={56} domain={o.max ? [0, o.max] : undefined} tickFormatter={(v: number) => formatValue(v, o.suffix)}
      label={o.ytitle ? { value: o.ytitle, angle: -90, position: 'insideLeft', fill: INK_MUTED, fontSize: 12 } : undefined} allowDecimals={false} />
  );

  if (block.chart === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={Math.max(height, labels.length * 32)}>
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" {...axisProps} domain={o.max ? [0, o.max] : undefined} tickFormatter={(v: number) => formatValue(v, o.suffix)} />
          <YAxis type="category" dataKey="label" {...axisProps} width={130} />
          {tooltip}
          {legend}
          {keys.map((k, i) => <Bar key={k} dataKey={k} name={series[i].name || 'Value'} fill={colors[i % colors.length]} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (block.chart === 'column') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} barGap={2}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" {...axisProps} minTickGap={8} />
          {yAxis}
          {tooltip}
          {legend}
          {keys.map((k, i) => <Bar key={k} dataKey={k} name={series[i].name || 'Value'} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" {...axisProps} minTickGap={16} />
        {yAxis}
        {tooltip}
        {legend}
        {keys.map((k, i) => (
          <Line key={k} type="linear" dataKey={k} name={series[i].name || 'Value'} stroke={colors[i % colors.length]} strokeWidth={2}
            dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function FunnelView({ block }: { block: Extract<Block, { kind: 'funnel' }> }) {
  return (
    <Box>
      {block.steps.map((s) => (
        <Box key={s.label} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(120px, 1fr) 2fr auto', md: 'minmax(160px, 240px) minmax(80px, 1fr) 64px 56px 110px' }, gap: 1.5, alignItems: 'center', py: 0.75 }}>
          <Typography variant="body2">{s.label}</Typography>
          <Box sx={{ height: 14, minWidth: 60, bgcolor: '#efeee9', borderRadius: 1 }}>
            <Box sx={{ height: '100%', width: `${s.width}%`, bgcolor: PALETTE[0], borderRadius: 1 }} />
          </Box>
          <Typography variant="body2" sx={{ textAlign: 'right', fontWeight: 600 }}>{s.value}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'right', display: { xs: 'none', md: 'block' } }} title="Share of the first step">{s.share}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }} title="Conversion from the previous step">{s.fromPrevious}</Typography>
        </Box>
      ))}
      {block.empty && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{EMPTY}</Typography>}
    </Box>
  );
}

function CellView({ cell }: { cell: Cell }) {
  if (typeof cell === 'string') return <>{cell}</>;
  const color = cell.tone === 'none' ? undefined : TONES[cell.tone as keyof typeof TONES];
  return <Box component="span" sx={{ fontWeight: 600, color }}>{cell.text}</Box>;
}

function TableView({ block }: { block: Extract<Block, { kind: 'table' }> }) {
  if (!block.rows.length) return <Typography variant="body2" color="text.secondary">{EMPTY}</Typography>;
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>{block.columns.map((c) => <TableCell key={c.title} align={c.numeric ? 'right' : 'left'} sx={{ fontWeight: 600 }}>{c.title}</TableCell>)}</TableRow>
        </TableHead>
        <TableBody>
          {block.rows.map((row, r) => (
            <TableRow key={r} hover>
              {row.map((cell, c) => <TableCell key={c} align={block.columns[c].numeric ? 'right' : 'left'}><CellView cell={cell} /></TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
