import AddBoxOutlinedIcon from '@mui/icons-material/AddBoxOutlined';
import FunctionsIcon from '@mui/icons-material/Functions';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { useRef, useState } from 'react';
import { FormulaDialog, insertFormula } from '../latex/FormulaDialog';
import { InsertDialog, PhonePreview } from '../latex/InsertDialog';
import { LatexPreview } from '../latex/LatexInput';

/**
 * A LaTeX content box outside a react-admin form: live preview above, the Insert pop-up,
 * and a monospace editor. Used for the original text and for each translation.
 */
export function LatexEditor(props: {
  value: string;
  onChange: (v: string) => void;
  imagesOf?: string;
  label: string;
  insertLabel?: string;
  languageName?: string;
  readOnly?: boolean;
  minRows?: number;
  /** Phone preview to the right of the editor instead of a preview above it. */
  phone?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [formula, setFormula] = useState(false);
  const formulaAt = useRef<number | null>(null);
  const cursor = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState({ current: '', cursor: null as number | null });
  const track = (e: React.SyntheticEvent) => {
    cursor.current = (e.target as HTMLTextAreaElement).selectionStart ?? null;
  };

  const editorBlock = (
    <>
      {!props.readOnly && (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button
            variant="outlined" size="small" startIcon={<AddBoxOutlinedIcon />}
            onClick={() => { setSnapshot({ current: props.value, cursor: cursor.current }); setOpen(true); }}
          >
            Insert
          </Button>
          <Button
            variant="outlined" size="small" startIcon={<FunctionsIcon />}
            onClick={() => { formulaAt.current = cursor.current; setFormula(true); }}
          >
            Formula
          </Button>
          <Typography variant="caption" color="text.secondary">Insert adds a file or pasted text as LaTeX. Formula adds one formula at the cursor.</Typography>
        </Stack>
      )}
      <TextField
        label={props.label} value={props.value} onChange={(e) => props.onChange(e.target.value)} multiline minRows={props.minRows ?? 6} fullWidth
        disabled={props.readOnly} onSelect={track} onKeyUp={track} onMouseUp={track}
        helperText={'LaTeX. Separate lines with \\\\, words go in \\text{...}.'}
        slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 14 } } }}
      />
    </>
  );
  const dialogs = (
    <>
      {open && (
        <InsertDialog
          open={open} onClose={() => setOpen(false)} current={snapshot.current} cursor={snapshot.cursor} imagesOf={props.imagesOf}
          languageName={props.languageName}
          onInsert={(next) => { props.onChange(next); cursor.current = null; setOpen(false); }}
        />
      )}
      {formula && (
        <FormulaDialog
          open={formula} onClose={() => setFormula(false)}
          onInsert={(f) => { props.onChange(insertFormula(props.value, formulaAt.current, f)); cursor.current = null; setFormula(false); }}
        />
      )}
    </>
  );

  if (props.phone) {
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 320px' }, gap: 3, alignItems: 'start' }}>
        <Stack spacing={1.25} sx={{ minWidth: 0 }}>
          {editorBlock}
        </Stack>
        <Stack spacing={1} alignItems="center" sx={{ position: { md: 'sticky' }, top: { md: 72 } }}>
          <Typography variant="caption" color="text.secondary">How it shows in the app</Typography>
          <PhonePreview device="phone" plan={{ before: props.value, after: '' }} addition="" imagesOf={props.imagesOf} title={props.title} />
        </Stack>
        {dialogs}
      </Box>
    );
  }

  return (
    <Stack spacing={1.25}>
      {props.value.trim() ? (
        <LatexPreview latex={props.value} imagesOf={props.imagesOf} />
      ) : (
        <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary">Nothing to preview yet.</Typography>
        </Box>
      )}
      {editorBlock}
      {dialogs}
    </Stack>
  );
}
