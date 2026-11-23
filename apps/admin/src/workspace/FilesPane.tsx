import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { Alert, Box, Button, Link as MuiLink, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { ToneChip } from './MicroLessonWorkspace';
import { Language } from './types';

type Rec = Record<string, any>;

const FILES: Array<{ key: string; label: string; video?: boolean }> = [
  { key: 'cheatsheetPdf', label: 'Cheatsheet PDF' },
  { key: 'summaryPdf', label: 'Summary PDF' },
  { key: 'summaryVideo', label: 'Summary video', video: true },
];

/** Micro lesson materials. Originals are replaced on the Edit page; files per language come later. */
export function FilesPane({ record, language, original, isOriginal }: { record: Rec; language: Language | null; original: Language | null; isOriginal: boolean }) {
  const files = FILES.filter((f) => !(f.video && Number(record.microLessonType) === 0));
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="h6" sx={{ fontWeight: 500 }}>Files{language ? ` · ${language.name}` : ''}</Typography>
        <Typography variant="caption" color="text.secondary">The {original?.name ?? 'original'} files are never changed by translation</Typography>
      </Stack>
      {!isOriginal && (
        <Alert severity="info">
          The app shows the {original?.name} files to {language?.name} learners. Translated PDFs, video subtitles and uploads per language come in a later update.
        </Alert>
      )}
      {files.map((f) => {
        const file = record[f.key] as { url?: string; filename?: string } | undefined;
        return (
          <Box key={f.key} sx={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) auto', gap: 2, alignItems: 'center', py: 1.5, borderBottom: '1px solid #eee' }}>
            <Box sx={{ color: 'text.secondary', display: 'flex', justifyContent: 'center' }}>
              {f.video ? <PlayCircleOutlineIcon fontSize="large" /> : <PictureAsPdfOutlinedIcon fontSize="large" />}
            </Box>
            <Stack spacing={0.25} sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography sx={{ fontWeight: 500 }}>{f.label}</Typography>
                {file?.url ? <ToneChip tone={isOriginal ? 'orig' : 'miss'} label={isOriginal ? 'Original' : `${original?.name ?? 'Original'} file`} /> : <ToneChip tone="miss" label="Missing" />}
              </Stack>
              {file?.url ? (
                <MuiLink href={file.url} target="_blank" rel="noreferrer" noWrap>{file.filename ?? 'Open file'}</MuiLink>
              ) : (
                <Typography variant="body2" color="text.secondary">No file uploaded yet.</Typography>
              )}
            </Stack>
            {isOriginal && (
              <Button component={Link} to={`/micro_lessons/${record.id}`} size="small">{file?.url ? 'Replace' : 'Upload'}</Button>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}
