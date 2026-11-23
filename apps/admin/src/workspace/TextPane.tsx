import AutorenewIcon from '@mui/icons-material/Autorenew';
import { Alert, Box, Button, CircularProgress, Collapse, Link as MuiLink, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useDataProvider, useNotify, useRefresh } from 'react-admin';
import { LatexPreview } from '../latex/LatexInput';
import { checkLatex } from '../latex/insertContent';
import { LatexEditor } from './LatexEditor';
import { Code, MICRO_LESSON, shortCode, ToneChip } from './MicroLessonWorkspace';
import { indexTranslations, Language, saveTranslation, Status, STATUS_LABEL, STATUS_TONE, summarize, translateLesson, Workspace } from './types';

type Rec = Record<string, any>;

export function TextPane(props: {
  ws: Workspace; record: Rec; language: Language | null; original: Language | null; isOriginal: boolean; canEdit: boolean;
  onSaved: () => Promise<void> | void; onGoLanguage: (id: number) => void;
}) {
  return props.isOriginal ? <OriginalText {...props} /> : <TranslatedText {...props} language={props.language!} />;
}

function OriginalText({ ws, record, original, canEdit, onSaved, onGoLanguage }: Parameters<typeof TextPane>[0]) {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const isVideo = Number(record.microLessonType) === 0;
  const saved = String(record.description ?? '');
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(saved), [saved]);
  const dirty = draft !== saved;
  const problems = draft.trim() ? checkLatex(draft) : [];
  const others = ws.languages.filter((l) => l.id !== original?.id);
  const outdated = others.filter((l) => summarize(ws, l.id, (t) => t === 'micro_lesson').outdated > 0);

  const save = async () => {
    setBusy(true);
    try {
      await dataProvider.update('micro_lessons', { id: record.id, data: { description: draft }, previousData: record });
      notify('Text content saved', { type: 'info' });
      refresh();
      await onSaved();
    } catch (e) {
      notify((e as Error).message || 'Could not save', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="h6" sx={{ fontWeight: 500 }}>{isVideo ? 'Video content' : 'Text content'}</Typography>
        <ToneChip tone="orig" label={`Original · ${original?.name ?? 'original language'}`} />
      </Stack>
      {isVideo ? (
        <VideoBlock record={record} />
      ) : (
        <>
          <LatexEditor
            value={draft} onChange={setDraft} imagesOf={MICRO_LESSON} label="Content (Text)" readOnly={!canEdit} minRows={8}
            languageName={`${original?.name ?? 'the original'} (original)`}
          />
          {outdated.length > 0 && !dirty && (
            <Alert severity="info">
              You changed the {original?.name} text. <b>{outdated.map((l) => l.name).join(', ')}</b> still {outdated.length === 1 ? 'shows' : 'show'} the previous
              version.{' '}
              <MuiLink component="button" onClick={() => onGoLanguage(outdated[0].id)}>Update their translations</MuiLink>
            </Alert>
          )}
          {dirty && others.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              Saving changes the {original?.name} original. Translations of the text become <b>Outdated</b> and can be translated again.
            </Typography>
          )}
          {canEdit && (
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button disabled={!dirty || busy} onClick={() => setDraft(saved)} color="inherit">Discard</Button>
              <Button variant="contained" disabled={!dirty || busy || problems.length > 0 || !draft.trim()} onClick={save}
                startIcon={busy ? <CircularProgress size={16} /> : undefined}>
                Save
              </Button>
            </Stack>
          )}
          {problems.length > 0 && <Alert severity="error">Line {problems[0].line}: {problems[0].message}. Fix it to save.</Alert>}
        </>
      )}
    </Stack>
  );
}

export function VideoBlock({ record, note }: { record: Rec; note?: string }) {
  const url = record.summaryVideo?.url as string | undefined;
  return (
    <Stack spacing={1}>
      {url ? (
        <Box component="video" src={url} controls sx={{ width: '100%', maxWidth: 560, borderRadius: 1, bgcolor: '#263238' }} />
      ) : (
        <Alert severity="warning">No video uploaded yet. Upload it on the Edit page.</Alert>
      )}
      {record.summaryVideo?.filename && <Typography variant="caption" color="text.secondary">{record.summaryVideo.filename}</Typography>}
      {note && <Typography variant="body2" color="text.secondary">{note}</Typography>}
    </Stack>
  );
}

function TranslatedText({ ws, record, language, original, canEdit, onSaved }: Parameters<typeof TextPane>[0] & { language: Language }) {
  const notify = useNotify();
  const isVideo = Number(record.microLessonType) === 0;
  const get = indexTranslations(ws.translations);
  const nameT = get('micro_lesson', ws.lesson.id, 'name', language.id);
  const textT = get('micro_lesson', ws.lesson.id, 'description', language.id);
  const [name, setName] = useState(nameT?.value ?? '');
  const [text, setText] = useState(textT?.value ?? '');
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'review' | 'ai'>(null);
  useEffect(() => { setName(nameT?.value ?? ''); setText(textT?.value ?? ''); }, [nameT?.value, textT?.value, language.id]);

  const dirty = name !== (nameT?.value ?? '') || text !== (textT?.value ?? '');
  const problems = text.trim() ? checkLatex(text) : [];
  const missing = !nameT && !textT;
  const status: Status | null = textT?.status ?? nameT?.status ?? null;
  const outdated = !!(textT?.outdated || nameT?.outdated);

  const persist = async (st: Status) => {
    setBusy(st === 'reviewed' ? 'review' : 'save');
    try {
      const base = { itemType: 'micro_lesson' as const, itemId: ws.lesson.id, languageId: language.id, status: st };
      await saveTranslation({ ...base, field: 'name', value: name });
      if (!isVideo) await saveTranslation({ ...base, field: 'description', value: text });
      notify(st === 'reviewed' ? `${language.name} marked as reviewed` : `${language.name} saved`, { type: 'info' });
      await onSaved();
    } catch (e) {
      notify((e as Error).message, { type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const retranslate = async () => {
    setBusy('ai');
    try {
      const [r] = await translateLesson(ws.lesson.id, { languageIds: [language.id], include: { text: true, exercises: false }, replaceEdited: true });
      if (r?.error) notify(r.error, { type: 'error' });
      else notify(`${language.name} translated`, { type: 'info' });
      await onSaved();
    } catch (e) {
      notify((e as Error).message, { type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="h6" sx={{ fontWeight: 500 }}>{isVideo ? 'Video content' : 'Text content'} · {language.name}</Typography>
        {status && <ToneChip tone={STATUS_TONE[status]} label={STATUS_LABEL[status]} />}
        {outdated && <ToneChip tone="old" label="Outdated" />}
        {missing && <ToneChip tone="miss" label="Missing" />}
        <Box sx={{ flex: 1 }} />
        {!isVideo && <Button size="small" onClick={() => setShowOriginal((v) => !v)}>{showOriginal ? 'Hide' : 'Show'} {original?.name}</Button>}
      </Stack>
      {missing && (
        <Alert severity="info" action={canEdit && ws.aiConfigured ? (
          <Button color="inherit" size="small" onClick={retranslate} disabled={!!busy}>Translate with AI</Button>
        ) : undefined}>
          Not in {language.name} yet. The app shows the {original?.name} version until a translation exists. Translate it with AI or write it below.
        </Alert>
      )}
      {outdated && !missing && (
        <Alert severity="warning">The {original?.name} text changed after this was translated. Translate it again or update it by hand.</Alert>
      )}
      {textT?.updatedBy && (
        <Typography variant="caption" color="text.secondary">
          {textT.status === 'auto' ? 'Translated by AI, requested by' : `${STATUS_LABEL[textT.status]} by`} {textT.updatedBy} · {new Date(textT.updatedAt).toLocaleString()}
        </Typography>
      )}

      <Box>
        <TextField label={<>Name · {language.name}</>} value={name} onChange={(e) => setName(e.target.value)} fullWidth disabled={!canEdit} />
        <Typography variant="caption" color="text.secondary" sx={{ px: 1.5 }}>
          <Code>{original ? shortCode(original) : ''}</Code> {ws.lesson.name}
        </Typography>
      </Box>

      {isVideo ? (
        <VideoBlock record={record} note={`${language.name} learners see the ${original?.name} video for now. Subtitles, an AI voice-over or an own ${language.name} video per language come in a later update.`} />
      ) : (
        <>
          <Collapse in={showOriginal}>
            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary">{original?.name} original</Typography>
              {ws.lesson.description ? <LatexPreview latex={ws.lesson.description} imagesOf={MICRO_LESSON} /> : <Typography variant="body2">Empty</Typography>}
            </Stack>
          </Collapse>
          <LatexEditor value={text} onChange={setText} imagesOf={MICRO_LESSON} label={`Content (Text) · ${language.name}`} readOnly={!canEdit} languageName={language.name} minRows={8} />
          {problems.length > 0 && <Alert severity="error">Line {problems[0].line}: {problems[0].message}. Fix it to save.</Alert>}
        </>
      )}

      {canEdit && (
        <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
          <Typography variant="caption" color="text.secondary" sx={{ flex: '1 1 240px', alignSelf: 'center' }}>
            Saving keeps your {language.name} wording; the Auto label goes away.
          </Typography>
          {ws.aiConfigured && !missing && (
            <Button onClick={retranslate} disabled={!!busy} startIcon={busy === 'ai' ? <CircularProgress size={16} /> : <AutorenewIcon />}>Translate again</Button>
          )}
          <Button disabled={!dirty || !!busy} color="inherit" onClick={() => { setName(nameT?.value ?? ''); setText(textT?.value ?? ''); }}>Discard</Button>
          {!dirty && !missing && status !== 'reviewed' && (
            <Button variant="outlined" disabled={!!busy || problems.length > 0} onClick={() => persist('reviewed')}>Mark reviewed</Button>
          )}
          <Button variant="contained" disabled={!dirty || !!busy || problems.length > 0} onClick={() => persist('edited')}
            startIcon={busy === 'save' ? <CircularProgress size={16} /> : undefined}>
            Save {language.name}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
