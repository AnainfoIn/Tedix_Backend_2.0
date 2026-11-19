import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import TranslateIcon from '@mui/icons-material/Translate';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useMemo, useState } from 'react';
import { TextInput, useGetList, useRecordContext } from 'react-admin';
import { useFormContext, useWatch } from 'react-hook-form';
import { contentLines, englishToLatex, IMAGE_KEY } from './englishToLatex';

type Rec = Record<string, any>;

/**
 * Content field written in LaTeX (lines joined with `\\`, image placeholders such as
 * tedimageone on their own line). Above the box: an English → LaTeX helper and a live preview.
 */
export function LatexInput(props: { source: string; label: string; helperText?: string; disabled?: boolean; imagesOf?: string }) {
  const { setValue, getValues } = useFormContext();
  const [english, setEnglish] = useState('');
  const converted = useMemo(() => englishToLatex(english), [english]);

  const insert = (mode: 'append' | 'replace') => {
    const current = String(getValues(props.source) ?? '').trim();
    const next = mode === 'append' && current ? `${current} \\\\ ${converted}` : converted;
    setValue(props.source, next, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <Box sx={{ width: '100%', mb: 1 }}>
      {!props.disabled && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <TranslateIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2">English to LaTeX</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Write in plain English, one line per line of content. Maths words become LaTeX, for example "x squared", "3 over 4",
            "square root of 16", "is less than or equal to", "pi", "90 degrees". Keep image keys such as tedimageone on their own line.
          </Typography>
          <TextField
            label="English" multiline minRows={3} fullWidth value={english} onChange={(e) => setEnglish(e.target.value)}
            placeholder={'tedimageone\nThe area of a circle is pi r squared.\nIf x = 5, then 2x + 3 = 13'}
          />
          {converted && (
            <>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5 }}>LaTeX</Typography>
              <Box component="pre" sx={{ m: 0, p: 1, bgcolor: 'action.hover', borderRadius: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13 }}>
                {converted}
              </Box>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5 }}>Preview</Typography>
              <LatexPreview latex={converted} />
              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
                <Button variant="contained" size="small" onClick={() => insert('append')}>Add to content</Button>
                <Button variant="outlined" size="small" onClick={() => insert('replace')}>Replace content</Button>
                <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => navigator.clipboard?.writeText(converted).catch(() => undefined)}>
                  Copy
                </Button>
              </Stack>
            </>
          )}
        </Paper>
      )}
      <ContentPreview source={props.source} imagesOf={props.imagesOf} />
      <TextInput
        source={props.source} label={props.label} helperText={props.helperText ?? 'LaTeX. Separate lines with \\\\; text goes in \\text{...}.'}
        disabled={props.disabled} fullWidth multiline minRows={8}
        sx={{ '& textarea': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 14 } }}
      />
    </Box>
  );
}

/** Live preview of the content box as it is typed. */
function ContentPreview({ source, imagesOf }: { source: string; imagesOf?: string }) {
  const value = useWatch({ name: source }) as string | undefined;
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>Content preview</Typography>
      {value?.trim() ? <LatexPreview latex={value} imagesOf={imagesOf} /> : (
        <Paper variant="outlined" sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">Nothing to preview yet.</Typography></Paper>
      )}
    </Box>
  );
}

/** Renders stored LaTeX content line by line; image keys show the matching content image. */
export function LatexPreview({ latex, imagesOf }: { latex: string; imagesOf?: string }) {
  const record = useRecordContext<Rec>();
  const { data: images } = useGetList(
    'content_images',
    { pagination: { page: 1, perPage: 100 }, sort: { field: 'id', order: 'ASC' }, filter: { contentableId: record?.id, contentableType: imagesOf } },
    { enabled: !!imagesOf && record?.id != null },
  );
  const byKey = new Map((images ?? []).map((i: Rec) => [String(i.keyName).toLowerCase(), i.image?.url as string | undefined]));

  return (
    <Paper variant="outlined" sx={{ p: 2, overflowX: 'auto' }}>
      <Stack spacing={1.5}>
        {contentLines(latex).map((line, i) => {
          if (IMAGE_KEY.test(line)) {
            const url = byKey.get(line.toLowerCase());
            return url ? (
              <Box key={i} component="img" src={url} alt={line} sx={{ maxWidth: 320, maxHeight: 220, objectFit: 'contain', alignSelf: 'flex-start' }} />
            ) : (
              <Box key={i} sx={{ px: 1.5, py: 1, border: 1, borderStyle: 'dashed', borderColor: 'divider', borderRadius: 1, alignSelf: 'flex-start' }}>
                <Typography variant="body2" color="text.secondary">Image: {line}{imagesOf ? ' (no content image with this key yet)' : ''}</Typography>
              </Box>
            );
          }
          return <Formula key={i} latex={line} />;
        })}
      </Stack>
    </Paper>
  );
}

function Formula({ latex }: { latex: string }) {
  const result = useMemo(() => {
    try {
      return { html: katex.renderToString(latex, { throwOnError: true, displayMode: false, strict: 'ignore' }) };
    } catch (e) {
      return { error: (e as Error).message.replace(/^KaTeX parse error: /, '') };
    }
  }, [latex]);
  if ('error' in result) {
    return (
      <Alert severity="warning" sx={{ py: 0 }}>
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{latex}</Typography>
        <Typography variant="caption">{result.error}</Typography>
      </Alert>
    );
  }
  return <Box sx={{ fontSize: 18 }} dangerouslySetInnerHTML={{ __html: result.html }} />;
}
