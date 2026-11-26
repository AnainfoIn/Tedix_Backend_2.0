import TranslateIcon from '@mui/icons-material/Translate';
import { Alert, Box, Button, ButtonBase, CircularProgress, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { C } from '../theme';
import { Code, shortCode, ToneChip } from '../workspace/MicroLessonWorkspace';
import { Language, STATUS_LABEL, STATUS_TONE, Translation } from '../workspace/types';
import { LevelKey, SINGULAR } from './dialogs';

const TYPE: Record<LevelKey, string> = { grades: 'grade', subjects: 'subject', masters: 'master', mains: 'main', units: 'unit', lessons: 'lesson' };

export interface LevelLangs {
  item: { type: string; id: number; name: string };
  languages: Language[];
  originalLanguageId: number | null;
  aiConfigured: boolean;
  translations: Translation[];
}

export function useLevelLanguages(level: LevelKey, id: number) {
  const [data, setData] = useState<LevelLangs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = () =>
    apiFetch<{ data: LevelLangs }>(`/workspace/levels/${TYPE[level]}/${id}`)
      .then((r) => { setData(r.data); setError(null); })
      .catch((e) => setError((e as Error).message));
  useEffect(() => {
    setData(null);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, id]);
  return { data, error, reload, type: TYPE[level] };
}

const nameIn = (d: LevelLangs, languageId: number) => d.translations.find((t) => t.field === 'name' && t.languageId === languageId);

/** RO / EN / DE / HU tabs on top of the edit panel, same as the micro lesson workspace. `selected` null = the original. */
export function LevelLanguageTabs(props: {
  data: LevelLangs; selected: number | null; onSelect: (languageId: number | null) => void; canEdit: boolean; onTranslate: () => void; translating: boolean;
}) {
  const { data } = props;
  const original = data.languages.find((l) => l.id === data.originalLanguageId);
  const others = data.languages.filter((l) => l.id !== original?.id);
  const missing = others.filter((l) => !nameIn(data, l.id)).length;
  return (
    <Box role="tablist" aria-label="Language" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', borderBottom: `1px solid ${C.line}`, mx: '-20px', px: '8px' }}>
      {[...(original ? [original] : []), ...others].map((l) => {
        const isOrig = l.id === original?.id;
        const on = isOrig ? props.selected == null : props.selected === l.id;
        const t = isOrig ? null : nameIn(data, l.id);
        const label = isOrig ? 'Written in this language' : !t ? 'Missing' : t.outdated ? 'Outdated' : STATUS_LABEL[t.status];
        const warn = !isOrig && (!t || t.outdated);
        return (
          <ButtonBase key={l.id} role="tab" aria-selected={on} onClick={() => props.onSelect(isOrig ? null : l.id)}
            sx={{ flexDirection: 'column', alignItems: 'flex-start', gap: '2px', px: 2, py: 1, minWidth: 130, textAlign: 'left',
              borderBottom: 3, borderColor: on ? C.blue : 'transparent', bgcolor: on ? C.blueSoft : 'transparent', color: on ? C.blueDark : C.text }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ fontSize: 14, fontWeight: 500 }}>
              <Code>{shortCode(l)}</Code><span>{l.name}</span>{isOrig && <ToneChip tone="orig" label="Original" />}
            </Stack>
            <Typography sx={{ fontSize: 12, color: warn ? '#a33b00' : C.muted }}>{label}</Typography>
          </ButtonBase>
        );
      })}
      <Box sx={{ flex: 1 }} />
      {props.canEdit && others.length > 0 && (
        <Stack direction="row" alignItems="center" sx={{ px: 1.5 }}>
          <Tooltip title={data.aiConfigured ? '' : 'Translation needs the Claude key on the server.'}>
            <span>
              <Button variant="outlined" startIcon={props.translating ? <CircularProgress size={16} /> : <TranslateIcon />} onClick={props.onTranslate}
                disabled={!data.aiConfigured || props.translating}>
                {missing ? `Translate ${missing} missing` : 'Translate again'}
              </Button>
            </span>
          </Tooltip>
        </Stack>
      )}
    </Box>
  );
}

/** The name of a level in one translated language: edit, approve, or clear it. */
export function LevelTranslation(props: { level: LevelKey; data: LevelLangs; languageId: number; canEdit: boolean; onSaved: () => void; onOriginalChange: (id: number) => void }) {
  const { data, languageId } = props;
  const lang = data.languages.find((l) => l.id === languageId)!;
  const original = data.languages.find((l) => l.id === data.originalLanguageId);
  const t = nameIn(data, languageId);
  const [value, setValue] = useState(t?.value ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setValue(t?.value ?? ''); setError(null); }, [t?.value, languageId]);

  const save = async (status: 'edited' | 'reviewed', text = value) => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/workspace/levels/translations', { method: 'PUT', body: JSON.stringify({ itemType: data.item.type, itemId: data.item.id, field: 'name', languageId, value: text, status }) });
      props.onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const dirty = value.trim() !== (t?.value ?? '');
  return (
    <Stack spacing={1.5} sx={{ maxWidth: 720 }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography sx={{ fontSize: 13, color: C.muted }}>
          {SINGULAR[props.level]} name in {original?.name ?? 'the original'}:
        </Typography>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{data.item.name}</Typography>
      </Stack>
      <TextField label={`Name in ${lang.name}`} value={value} onChange={(e) => setValue(e.target.value)} disabled={!props.canEdit || busy} fullWidth
        placeholder={t ? '' : `No ${lang.name} name yet`} />
      {t?.outdated && <Alert severity="warning">The {original?.name ?? 'original'} name changed after this was translated. Check it, then save or approve it.</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      {props.canEdit && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
          {t && <ToneChip tone={t.outdated ? 'old' : STATUS_TONE[t.status]} label={`${lang.name}: ${t.outdated ? 'Outdated' : STATUS_LABEL[t.status]}`} />}
          <Button variant="contained" disabled={!dirty || !value.trim() || busy} onClick={() => save('edited')}>Save {lang.name} name</Button>
          {t && !dirty && t.status !== 'reviewed' && <Button variant="outlined" disabled={busy} onClick={() => save('reviewed')}>Approve</Button>}
          {dirty && <Button color="inherit" disabled={busy} onClick={() => setValue(t?.value ?? '')}>Discard</Button>}
          {t && !dirty && <Button color="error" disabled={busy} onClick={() => save('edited', '')}>Clear</Button>}
        </Stack>
      )}
      {props.canEdit && (
        <TextField select size="small" label="Original language" value={data.originalLanguageId ?? ''} sx={{ maxWidth: 260 }}
          onChange={(e) => props.onOriginalChange(Number(e.target.value))}
          helperText={`The language the ${SINGULAR[props.level].toLowerCase()} name above is written in.`}>
          {data.languages.map((l) => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}
        </TextField>
      )}
    </Stack>
  );
}
