import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Link as MuiLink, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { ReactNode, useEffect, useState } from 'react';
import { RaRecord, RecordContextProvider, useDataProvider } from 'react-admin';
import { Link } from 'react-router-dom';
import { checkLatex } from '../latex/insertContent';
import { LatexEditor } from '../workspace/LatexEditor';
import { MICRO_LESSON } from '../workspace/MicroLessonWorkspace';

type Rec = Record<string, any>;
export type LevelKey = 'grades' | 'subjects' | 'masters' | 'mains' | 'units' | 'lessons';
export const SINGULAR: Record<LevelKey | 'micro_lessons', string> = {
  grades: 'Grade', subjects: 'Subject', masters: 'Master', mains: 'Main', units: 'Unit', lessons: 'Lesson', micro_lessons: 'Micro lesson',
};

/** The ids above the item: countryId, gradeId, subjectId, masterId, mainId, unitId, lessonId. */
export type Parent = Partial<Record<'countryId' | 'gradeId' | 'subjectId' | 'masterId' | 'mainId' | 'unitId' | 'lessonId', number>>;

function errorText(e: unknown): { message: string; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const body = (e as { body?: Rec | null })?.body;
  const errs = (body && typeof body === 'object' ? body.errors : null) as Record<string, string[] | string> | null;
  if (errs && typeof errs === 'object') for (const [k, v] of Object.entries(errs)) if (k !== 'root') fields[k] = Array.isArray(v) ? v.join(', ') : String(v);
  return { message: Object.values(fields)[0] ?? ((e as Error)?.message || 'Could not save'), fields };
}

function Shell(props: {
  title: string; open: boolean; busy: boolean; error: string | null; onClose: () => void; onSave: () => void; saveDisabled?: boolean;
  onDelete?: () => void; footer?: ReactNode; children: ReactNode; wide?: boolean;
}) {
  const theme = useTheme();
  const small = useMediaQuery(theme.breakpoints.down('sm'));
  return (
    <Dialog open={props.open} onClose={props.busy ? undefined : props.onClose} fullWidth maxWidth={props.wide ? 'md' : 'xs'} fullScreen={small && props.wide}>
      <DialogTitle sx={{ fontWeight: 700 }}>{props.title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {props.children}
          {props.error && <Alert severity="error">{props.error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        {props.onDelete && <Button color="error" onClick={props.onDelete} disabled={props.busy}>Delete</Button>}
        {props.footer}
        <Box sx={{ flex: 1 }} />
        <Button color="inherit" onClick={props.onClose} disabled={props.busy}>Cancel</Button>
        <Button variant="contained" onClick={props.onSave} disabled={props.busy || props.saveDisabled}
          startIcon={props.busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function useConfirmDelete() {
  return (what: string) => window.confirm(`Delete ${what}? This can't be undone.`);
}

/** Add or edit a Grade, Subject, Master, Main, Unit or Lesson: name (and dates for a lesson). */
export function ItemDialog(props: { level: LevelKey; id?: number; parent: Parent; onClose: () => void; onSaved: (id: number | null) => void }) {
  const { level, id, parent } = props;
  const dataProvider = useDataProvider();
  const confirm = useConfirmDelete();
  const [record, setRecord] = useState<RaRecord | null>(null);
  const [name, setName] = useState('');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; fields: Record<string, string> } | null>(null);

  useEffect(() => {
    if (!id) return;
    dataProvider.getOne(level, { id }).then(({ data }) => {
      setRecord(data);
      setName(data.name ?? '');
      setStart(String(data.startDate ?? '').slice(0, 10));
      setEnd(String(data.endDate ?? '').slice(0, 10));
    }).catch((e) => setError(errorText(e)));
  }, [id, level, dataProvider]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const data: Rec = { name: name.trim() };
      if (level === 'lessons') Object.assign(data, { startDate, endDate });
      if (id) {
        await dataProvider.update(level, { id, data, previousData: record ?? {} });
        props.onSaved(id);
      } else {
        const p = parent;
        if (level === 'grades') data.countryId = p.countryId;
        if (level === 'subjects') Object.assign(data, { countryId: p.countryId, gradeIds: p.gradeId ? [p.gradeId] : [] });
        if (level === 'masters') Object.assign(data, { countryId: p.countryId, gradeId: p.gradeId, subjectId: p.subjectId });
        if (level === 'mains') data.masterId = p.masterId;
        if (level === 'units') data.mainId = p.mainId;
        if (level === 'lessons') data.unitId = p.unitId;
        const { data: made } = await dataProvider.create(level, { data });
        props.onSaved(Number(made.id));
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id || !confirm(`${SINGULAR[level].toLowerCase()} "${name}"`)) return;
    setBusy(true);
    setError(null);
    try {
      await dataProvider.delete(level, { id, previousData: record ?? undefined });
      props.onSaved(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const loading = !!id && !record && !error;
  return (
    <Shell
      title={`${id ? 'Edit' : 'Add'} ${SINGULAR[level].toLowerCase()}`} open busy={busy} error={error?.message ?? null}
      onClose={props.onClose} onSave={save} onDelete={id ? remove : undefined}
      saveDisabled={loading || !name.trim() || (level === 'lessons' && (!startDate || !endDate))}
      footer={id ? <MuiLink component={Link} to={`/${level}/${id}`} sx={{ fontSize: 14 }}>Icon and files</MuiLink> : undefined}
    >
      {loading ? <CircularProgress size={20} /> : (
        <>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus fullWidth
            error={!!error?.fields.name} helperText={error?.fields.name} onKeyDown={(e) => { if (e.key === 'Enter' && level !== 'lessons') void save(); }} />
          {level === 'lessons' && (
            <Stack direction="row" spacing={1.5}>
              <TextField label="Start date" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} fullWidth
                slotProps={{ inputLabel: { shrink: true } }} error={!!error?.fields.startDate} helperText={error?.fields.startDate} />
              <TextField label="End date" type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} fullWidth
                slotProps={{ inputLabel: { shrink: true } }} error={!!error?.fields.endDate} helperText={error?.fields.endDate} />
            </Stack>
          )}
          {level === 'subjects' && !id && <Typography variant="caption" color="text.secondary">The subject is added to the selected grade.</Typography>}
        </>
      )}
    </Shell>
  );
}

/** Add or edit a micro lesson: name, Text or Video, and the LaTeX content with Insert and Formula. */
export function MicroDialog(props: { id?: number; parent: Parent; onClose: () => void; onSaved: (id: number | null) => void }) {
  const { id, parent } = props;
  const dataProvider = useDataProvider();
  const confirm = useConfirmDelete();
  const [record, setRecord] = useState<RaRecord | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<0 | 1>(1);
  const [text, setText] = useState('');
  const [video, setVideo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; fields: Record<string, string> } | null>(null);

  useEffect(() => {
    if (!id) return;
    dataProvider.getOne('micro_lessons', { id }).then(({ data }) => {
      setRecord(data);
      setName(data.name ?? '');
      setType(Number(data.microLessonType) === 0 ? 0 : 1);
      setText(String(data.description ?? ''));
    }).catch((e) => setError(errorText(e)));
  }, [id, dataProvider]);

  const problems = type === 1 && text.trim() ? checkLatex(text) : [];
  const hasVideo = !!video || !!record?.summaryVideo?.url;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const data: Rec = { name: name.trim(), microLessonType: type };
      if (type === 1) data.description = text;
      if (type === 0 && video) data.summaryVideo = { rawFile: video, title: video.name };
      if (id) {
        await dataProvider.update('micro_lessons', { id, data, previousData: record ?? {} });
        props.onSaved(id);
      } else {
        const p = parent;
        Object.assign(data, {
          countryId: p.countryId, categoryId: p.gradeId, subCategoryId: p.subjectId, courseId: p.masterId,
          mainId: p.mainId, unitId: p.unitId, lessonId: p.lessonId,
        });
        const { data: made } = await dataProvider.create('micro_lessons', { data });
        props.onSaved(Number(made.id));
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id || !confirm(`micro lesson "${name}"`)) return;
    setBusy(true);
    setError(null);
    try {
      await dataProvider.delete('micro_lessons', { id, previousData: record ?? undefined });
      props.onSaved(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const loading = !!id && !record && !error;
  return (
    <Shell
      wide title={`${id ? 'Edit' : 'Add'} micro lesson`} open busy={busy} error={error?.message ?? null}
      onClose={props.onClose} onSave={save} onDelete={id ? remove : undefined}
      saveDisabled={loading || !name.trim() || (type === 1 ? !text.trim() || problems.length > 0 : !hasVideo)}
    >
      {loading ? <CircularProgress size={20} /> : (
        <RecordContextProvider value={record ?? undefined}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus fullWidth error={!!error?.fields.name} helperText={error?.fields.name} />
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="body2" color="text.secondary">Content</Typography>
            <ToggleButtonGroup size="small" exclusive value={type} onChange={(_, v) => v != null && setType(v)}>
              <ToggleButton value={1} sx={{ px: 2 }}>Text</ToggleButton>
              <ToggleButton value={0} sx={{ px: 2 }}>Video</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          {type === 1 ? (
            <>
              <LatexEditor value={text} onChange={setText} imagesOf={MICRO_LESSON} label="Content (Text)" minRows={6} languageName="this micro lesson" />
              {problems.length > 0 && <Alert severity="error">Line {problems[0].line}: {problems[0].message}. Fix it to save.</Alert>}
            </>
          ) : (
            <Stack spacing={1}>
              {record?.summaryVideo?.url && !video && <Typography variant="body2">Current video: {record.summaryVideo.filename ?? 'uploaded'}</Typography>}
              <Button component="label" variant="outlined" sx={{ alignSelf: 'flex-start' }}>
                {hasVideo ? 'Replace video' : 'Choose video'}
                <input hidden type="file" accept="video/mp4,video/3gpp,video/x-flv" onChange={(e) => setVideo(e.target.files?.[0] ?? null)} />
              </Button>
              {video && <Typography variant="body2">{video.name}</Typography>}
              <Typography variant="caption" color="text.secondary">MP4, 3GP or FLV, up to 50 MB.</Typography>
            </Stack>
          )}
        </RecordContextProvider>
      )}
    </Shell>
  );
}
