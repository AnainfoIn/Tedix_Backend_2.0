import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
  Alert, Box, Button, CircularProgress, IconButton, Link as MuiLink, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { RaRecord, useDataProvider, useNotify } from 'react-admin';
import { Link } from 'react-router-dom';
import { C } from '../theme';
import { LevelKey, SINGULAR } from './dialogs';

type Rec = Record<string, any>;
type FileKey = 'image' | 'cheatsheetPdf' | 'summaryPdf' | 'summaryVideo';
const FILES: Array<{ key: FileKey; label: string; accept: string; removable: boolean }> = [
  { key: 'image', label: 'Display icon', accept: 'image/png,image/jpeg', removable: false },
  { key: 'cheatsheetPdf', label: 'Cheatsheet (PDF)', accept: 'application/pdf', removable: true },
  { key: 'summaryPdf', label: 'Summary (PDF)', accept: 'application/pdf', removable: true },
  { key: 'summaryVideo', label: 'Summary (video)', accept: 'video/mp4,video/3gpp,video/x-flv', removable: true },
];
const ORDERED: Record<LevelKey, boolean> = { grades: true, subjects: false, masters: true, mains: true, units: true, lessons: true };
const CHILD: Record<LevelKey, string> = { grades: 'subject', subjects: 'master', masters: 'main', mains: 'unit', units: 'lesson', lessons: 'micro lesson' };

const kb = (bytes?: number) => (bytes == null ? '' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

function errorFields(e: unknown) {
  const body = (e as { body?: Rec | null })?.body;
  const errs = (body && typeof body === 'object' ? body.errors : null) as Record<string, string[] | string> | null;
  const fields: Record<string, string> = {};
  if (errs) for (const [k, v] of Object.entries(errs)) if (k !== 'root') fields[k] = Array.isArray(v) ? v.join(', ') : String(v);
  return { message: Object.values(fields)[0] ?? ((e as Error)?.message || 'Could not save'), fields };
}

/**
 * The panel under the columns: the selected Grade, Subject, Master, Main, Unit or Lesson,
 * edited in place (name, lesson dates, icon and files), moved up or down, or deleted.
 */
export function EditPanel(props: {
  level: LevelKey; id: number; position: number; siblings: number; parentName: string; childCount: number;
  canEdit: boolean; onOpenChildren: () => void; onChanged: (deleted?: boolean) => void;
}) {
  const { level, id } = props;
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [record, setRecord] = useState<RaRecord | null>(null);
  const [name, setName] = useState('');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [files, setFiles] = useState<Partial<Record<FileKey, File | null>>>({});
  const [busy, setBusy] = useState<null | 'save' | 'move' | 'delete'>(null);
  const [error, setError] = useState<{ message: string; fields: Record<string, string> } | null>(null);

  const reset = (data: RaRecord) => {
    setRecord(data);
    setName(String(data.name ?? ''));
    setStart(String(data.startDate ?? '').slice(0, 10));
    setEnd(String(data.endDate ?? '').slice(0, 10));
    setFiles({});
    setError(null);
  };
  useEffect(() => {
    let live = true;
    setRecord(null);
    dataProvider.getOne(level, { id }).then(({ data }) => live && reset(data)).catch((e) => live && setError(errorFields(e)));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, id]);

  const dirty = !!record && (
    name !== String(record.name ?? '') ||
    (level === 'lessons' && (startDate !== String(record.startDate ?? '').slice(0, 10) || endDate !== String(record.endDate ?? '').slice(0, 10))) ||
    Object.keys(files).length > 0
  );

  const save = async () => {
    if (!record) return;
    setBusy('save');
    setError(null);
    try {
      const data: Rec = { name: name.trim() };
      if (level === 'lessons') Object.assign(data, { startDate, endDate });
      for (const [k, f] of Object.entries(files)) data[k] = f ? { rawFile: f, title: f.name } : null;
      const previousData = { ...record };
      const { data: saved } = await dataProvider.update(level, { id, data, previousData });
      reset(saved);
      notify(`${SINGULAR[level]} saved`, { type: 'info' });
      props.onChanged();
    } catch (e) {
      setError(errorFields(e));
    } finally {
      setBusy(null);
    }
  };

  const move = async (delta: number) => {
    setBusy('move');
    try {
      await (dataProvider as any).move(level, { id, position: props.position + delta });
      props.onChanged();
    } catch (e) {
      notify((e as Error).message, { type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${SINGULAR[level].toLowerCase()} "${record?.name}"? This can't be undone.`)) return;
    setBusy('delete');
    try {
      await dataProvider.delete(level, { id, previousData: record ?? undefined });
      notify(`${SINGULAR[level]} deleted`, { type: 'info' });
      props.onChanged(true);
    } catch (e) {
      setError(errorFields(e));
    } finally {
      setBusy(null);
    }
  };

  const child = CHILD[level];
  const where = props.parentName ? ` in ${props.parentName}` : '';
  return (
    <Box component="section" aria-label={`Selected ${SINGULAR[level].toLowerCase()}`}
      sx={{ bgcolor: C.panel, border: `1px solid ${C.line}`, borderRadius: 3, p: '18px 20px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
        <Box component="span" sx={{ fontSize: 12, fontWeight: 600, px: 1, py: 0.4, borderRadius: 999, bgcolor: C.chip, color: '#3A404B' }}>{SINGULAR[level]}</Box>
        <Typography component="h2" sx={{ fontSize: 20, fontWeight: 700 }}>{record?.name ?? '…'}</Typography>
        <Typography sx={{ fontSize: 13, color: C.muted }}>
          {ORDERED[level] ? `Position ${props.position} of ${props.siblings}${where}` : `${props.siblings} subject${props.siblings === 1 ? '' : 's'}${where}`}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" endIcon={<ChevronRightIcon />} onClick={props.onOpenChildren} sx={{ borderColor: C.line }}>
          {props.childCount ? `Open its ${props.childCount} ${child}${props.childCount === 1 ? '' : 's'}` : `Add its first ${child}`}
        </Button>
        {props.canEdit && ORDERED[level] && (
          <>
            <Tooltip title="Move up"><span>
              <IconButton aria-label="Move up" disabled={props.position <= 1 || !!busy} onClick={() => move(-1)} sx={{ border: `1px solid ${C.line}`, borderRadius: 2 }}><ArrowUpwardIcon fontSize="small" /></IconButton>
            </span></Tooltip>
            <Tooltip title="Move down"><span>
              <IconButton aria-label="Move down" disabled={props.position >= props.siblings || !!busy} onClick={() => move(1)} sx={{ border: `1px solid ${C.line}`, borderRadius: 2 }}><ArrowDownwardIcon fontSize="small" /></IconButton>
            </span></Tooltip>
          </>
        )}
        <Button component={Link} to={`/${level}/${id}`} variant="outlined" color="inherit" sx={{ borderColor: C.line }}>More settings</Button>
        {props.canEdit && <Button variant="outlined" color="error" onClick={remove} disabled={!!busy}>Delete</Button>}
      </Stack>

      {!record && !error && <CircularProgress size={20} />}
      {record && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(240px, 1.6fr) repeat(4, minmax(0, 1fr))' }, gap: 1.5, alignItems: 'start' }}>
            <Stack spacing={1.5}>
              <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} disabled={!props.canEdit} fullWidth
                error={!!error?.fields.name} helperText={error?.fields.name} />
              {level === 'lessons' && (
                <Stack direction="row" spacing={1.5}>
                  <TextField label="Start date" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} fullWidth disabled={!props.canEdit}
                    slotProps={{ inputLabel: { shrink: true } }} error={!!error?.fields.startDate} helperText={error?.fields.startDate} />
                  <TextField label="End date" type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} fullWidth disabled={!props.canEdit}
                    slotProps={{ inputLabel: { shrink: true } }} error={!!error?.fields.endDate} helperText={error?.fields.endDate} />
                </Stack>
              )}
              {level === 'subjects' && Array.isArray(record.gradeNames) && record.gradeNames.length > 1 && (
                <Typography sx={{ fontSize: 12, color: C.muted }}>Taught in {record.gradeNames.join(', ')}. Change the grades under More settings.</Typography>
              )}
            </Stack>
            {FILES.map((f) => (
              <FileCard key={f.key} label={f.label} accept={f.accept} current={record[f.key]} staged={files[f.key]} removable={f.removable}
                disabled={!props.canEdit} error={error?.fields[f.key]}
                onPick={(file) => setFiles((s) => ({ ...s, [f.key]: file }))}
                onUndo={() => setFiles((s) => { const n = { ...s }; delete n[f.key]; return n; })} />
            ))}
          </Box>
          {record.storageConfigured === false && (
            <Typography sx={{ fontSize: 12, color: C.muted }}>File storage isn't set up on this server, so uploads can't be saved yet.</Typography>
          )}
        </>
      )}
      {error && !Object.keys(error.fields).length && <Alert severity="error">{error.message}</Alert>}
      {props.canEdit && record && (
        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={save} disabled={!dirty || !!busy || !name.trim()}
            startIcon={busy === 'save' ? <CircularProgress size={16} color="inherit" /> : undefined}>Save changes</Button>
          <Button variant="outlined" color="inherit" onClick={() => reset(record)} disabled={!dirty || !!busy} sx={{ borderColor: C.line }}>Discard</Button>
        </Stack>
      )}
    </Box>
  );
}

function FileCard(props: {
  label: string; accept: string; current?: { url?: string; filename?: string; byteSize?: number } | null; staged?: File | null;
  removable: boolean; disabled: boolean; error?: string; onPick: (f: File | null) => void; onUndo: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const has = !!props.current?.url;
  const removing = props.staged === null;
  const picked = props.staged instanceof File ? props.staged : null;
  const solid = has || picked;
  return (
    <Box sx={{ border: `1px ${solid ? 'solid' : 'dashed'} ${props.error ? '#d32f2f' : solid ? C.line : '#C5CAD3'}`, borderRadius: 2.5, p: 1.5, minHeight: 58, display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
      <Typography sx={{ fontSize: 12, color: C.muted }}>{props.label}{has && props.current?.byteSize ? ` · ${kb(props.current.byteSize)}` : ''}</Typography>
      {picked ? (
        <>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.blueDark }}>New file, save to upload</Typography>
          <Typography noWrap sx={{ fontSize: 12 }}>{picked.name}</Typography>
          <MuiLink component="button" onClick={props.onUndo} sx={{ fontSize: 12, alignSelf: 'flex-start' }}>Undo</MuiLink>
        </>
      ) : removing ? (
        <>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#b71c1c' }}>Removed when you save</Typography>
          <MuiLink component="button" onClick={props.onUndo} sx={{ fontSize: 12, alignSelf: 'flex-start' }}>Undo</MuiLink>
        </>
      ) : has ? (
        <>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#1b7a3a' }}>Uploaded</Typography>
          <MuiLink href={props.current!.url} target="_blank" rel="noreferrer" noWrap sx={{ fontSize: 12, display: 'block' }}>{props.current!.filename ?? 'Open file'}</MuiLink>
          {!props.disabled && (
            <Stack direction="row" spacing={1.5}>
              <MuiLink component="button" onClick={() => input.current?.click()} sx={{ fontSize: 12 }}>Replace</MuiLink>
              {props.removable && <MuiLink component="button" color="error" onClick={() => props.onPick(null)} sx={{ fontSize: 12 }}>Remove</MuiLink>}
            </Stack>
          )}
        </>
      ) : props.disabled ? (
        <Typography sx={{ fontSize: 13, color: C.muted }}>None</Typography>
      ) : (
        <MuiLink component="button" onClick={() => input.current?.click()} sx={{ fontSize: 13, fontWeight: 600, alignSelf: 'flex-start' }}>Upload</MuiLink>
      )}
      {props.error && <Typography sx={{ fontSize: 12, color: '#d32f2f' }}>{props.error}</Typography>}
      <input ref={input} hidden type="file" accept={props.accept} onChange={(e) => { const f = e.target.files?.[0]; if (f) props.onPick(f); e.target.value = ''; }} />
    </Box>
  );
}
