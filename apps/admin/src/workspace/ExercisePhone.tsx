import { Box } from '@mui/material';
import { ReactNode, useState } from 'react';
import { DGroup, matchRows, SHAPES, typeOf } from './exerciseModel';
import { Shown, X } from './exerciseUi';

/** App labels of the phone preview, by language code (English for the others). */
const UI: Record<string, { progress: (i: number, n: number) => string; hint: string; solution: string; reveal: string; fallback: (lang: string) => string }> = {
  EN: { progress: (i, n) => `Exercise ${i} of ${n}`, hint: 'Hint', solution: 'Solution', reveal: 'Reveal answer', fallback: (l) => `Shown in ${l} until translated` },
  RO: { progress: (i, n) => `Exercițiul ${i} din ${n}`, hint: 'Indiciu', solution: 'Soluție', reveal: 'Arată răspunsul', fallback: (l) => `Shown in ${l} until translated` },
  DE: { progress: (i, n) => `Übung ${i} von ${n}`, hint: 'Hinweis', solution: 'Lösung', reveal: 'Antwort zeigen', fallback: (l) => `Shown in ${l} until translated` },
  HU: { progress: (i, n) => `${i}. feladat / ${n}`, hint: 'Tipp', solution: 'Megoldás', reveal: 'Válasz mutatása', fallback: (l) => `Shown in ${l} until translated` },
};

export interface PhoneContent {
  questionType: number;
  question: string;
  questionBody: string;
  hint: string;
  solution: string;
  groups: DGroup[];
  /** Fields still shown in the original language. */
  fallback: { question?: boolean; hint?: boolean; solution?: boolean };
}

/** Mobile preview of one exercise: follows the language tab; Hint and Solution open inside the same screen. */
export function ExercisePhone(props: { content: PhoneContent; langCode: string; langName: string; originalName: string; index: number; total: number; warning?: string | null }) {
  const [panel, setPanel] = useState<'hint' | 'solution' | null>('hint');
  const ui = UI[props.langCode] ?? UI.EN;
  const c = props.content;
  const t = typeOf(c.questionType);
  const note = (on?: boolean) => on && (
    <Box component="span" sx={{ fontSize: 11, color: X.warnText, bgcolor: X.warnBg, px: 1, py: '3px', borderRadius: '6px', alignSelf: 'flex-start' }}>{ui.fallback(props.originalName)}</Box>
  );
  const btn = (on: boolean) => ({
    flex: 1, height: 40, borderRadius: '10px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    ...(on ? { border: 0, bgcolor: X.blue, color: '#fff' } : { border: `1px solid ${X.field}`, bgcolor: '#fff', color: X.text }),
  });
  return (
    <Box component="aside" aria-label="Mobile preview" sx={{ flex: '1 1 320px', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: '10px', position: { lg: 'sticky' }, top: { lg: 72 } }}>
      <Box component="span" sx={{ fontWeight: 600 }}>Mobile preview · {props.langName}</Box>
      <Box sx={{ height: 640, border: `10px solid ${X.text}`, borderRadius: '34px', bgcolor: '#fff', p: '22px 16px 16px', display: 'flex', flexDirection: 'column', gap: '10px', boxSizing: 'border-box', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, fontSize: 11, color: X.muted }}>
          <span>{ui.progress(props.index, props.total)}</span><span style={{ textAlign: 'right' }}>{t.task}</span>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', pr: '2px' }}>
          <Box sx={{ fontWeight: 600, py: '4px' }}>{c.question ? <Shown value={c.question} size={16} block /> : <Box component="span" sx={{ color: X.muted, fontWeight: 400, fontSize: 13 }}>The question shows here.</Box>}</Box>
          {note(c.fallback.question)}
          <Answers c={c} reveal={ui.reveal} />
        </Box>
        {props.warning && <Box sx={{ px: 1.5, py: 1.25, borderRadius: '10px', bgcolor: X.warnBg, color: X.warnText, fontSize: 12 }}>{props.warning}</Box>}
        {panel === 'hint' && (
          <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: '#FFF8E6', border: '1px solid #F3DFA6', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: 170, overflowY: 'auto' }}>
            <strong style={{ fontSize: 13 }}>{ui.hint}</strong>
            {c.hint ? <Shown value={c.hint} size={13} block /> : <Box component="span" sx={{ fontSize: 12, color: X.muted }}>No hint yet.</Box>}
            {note(c.fallback.hint)}
          </Box>
        )}
        {panel === 'solution' && (
          <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: '#EEF8F1', border: '1px solid #B9DFC6', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: 170, overflowY: 'auto' }}>
            <strong style={{ fontSize: 13 }}>{ui.solution}</strong>
            {c.solution ? <Shown value={c.solution} size={14} block /> : <Box component="span" sx={{ fontSize: 12, color: X.muted }}>No solution yet.</Box>}
            {note(c.fallback.solution)}
          </Box>
        )}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Box component="button" type="button" aria-pressed={panel === 'hint'} onClick={() => setPanel(panel === 'hint' ? null : 'hint')} sx={btn(panel === 'hint')}>{ui.hint}</Box>
          <Box component="button" type="button" aria-pressed={panel === 'solution'} onClick={() => setPanel(panel === 'solution' ? null : 'solution')} sx={btn(panel === 'solution')}>{ui.solution}</Box>
        </Box>
      </Box>
      <Box component="span" sx={{ fontSize: 12, color: X.muted }}>Follows the language tab above. Hint and Solution show inside the same screen for every exercise type.</Box>
    </Box>
  );
}

const card = { p: '10px', border: `1px solid ${X.line}`, borderRadius: '12px', fontSize: 15 } as const;
const tile = { minWidth: 44, height: 40, px: 1, borderRadius: '10px', bgcolor: X.blueSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' } as const;
const gap = (bad?: boolean) => ({ display: 'inline-block', width: 44, height: 34, border: `2px dashed ${bad ? X.redLine : '#9AA1AD'}`, borderRadius: '8px', verticalAlign: 'middle', mx: '4px' });

function Answers({ c, reveal }: { c: PhoneContent; reveal: string }) {
  const t = typeOf(c.questionType);
  const opts = c.groups.flatMap((g) => g.options);
  const [shown, setShown] = useState(false);
  switch (t.n) {
    case 1: {
      const cards = c.groups.flatMap((g) => g.options.slice(0, 2));
      return <Grid>{cards.map((o) => <Box key={o.key} sx={{ ...card, textAlign: 'center' }}><Shown value={o.option || '…'} size={14} /></Box>)}</Grid>;
    }
    case 4: {
      const back = opts[0]?.option ?? '';
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'stretch' }}>
          <Box sx={{ ...card, minHeight: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: shown ? '#EEF8F1' : '#F5F9FF', fontSize: 22 }}>
            {shown ? <Shown value={back || '…'} size={22} /> : '?'}
          </Box>
          <Box component="button" type="button" onClick={() => setShown(!shown)} sx={{ height: 36, borderRadius: '10px', border: `1px solid ${X.blueLine}`, bgcolor: '#fff', color: X.blue, fontWeight: 600, cursor: 'pointer' }}>{reveal}</Box>
        </Box>
      );
    }
    case 5: {
      const max = Math.max(10, ...opts.map((o) => (o.sequenceNumber ?? 0) + 1));
      return (
        <Box sx={{ position: 'relative', height: 70, mx: 1, mt: 2 }}>
          <Box sx={{ position: 'absolute', left: 0, right: 0, top: 30, height: 2, bgcolor: X.text }} />
          {Array.from({ length: max + 1 }, (_, k) => <Box key={k} sx={{ position: 'absolute', left: `${(k / max) * 100}%`, top: 24, width: '1px', height: 14, bgcolor: X.text }} />)}
          <Box sx={{ position: 'absolute', left: -3, top: 44, fontSize: 11 }}>0</Box>
          <Box sx={{ position: 'absolute', right: -6, top: 44, fontSize: 11 }}>{max}</Box>
          {opts.filter((o) => o.sequenceNumber != null).map((o) => (
            <Box key={o.key} sx={{ position: 'absolute', left: `${(o.sequenceNumber! / max) * 100}%`, top: 2, transform: 'translateX(-50%)', fontSize: 12, fontWeight: 700, color: o.isCorrect ? X.blue : X.text }}>
              {o.isCorrect ? '?' : o.option}
            </Box>
          ))}
        </Box>
      );
    }
    case 6: {
      const rows = matchRows({ groups: c.groups } as never);
      return (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          {rows.map((r, i) => (
            <Box key={i} sx={{ display: 'contents' }}>
              <Box sx={{ ...card, textAlign: 'center' }}><Shown value={r.left?.option || '…'} size={14} /></Box>
              <Box sx={{ ...card, textAlign: 'center', bgcolor: X.soft }}><Shown value={r.right?.option || '…'} size={14} /></Box>
            </Box>
          ))}
        </Box>
      );
    }
    case 7: {
      const parts = c.questionBody.split(/(\[Blank\])/);
      const first = c.groups[0]?.options ?? [];
      let b = 0;
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ fontSize: 20, lineHeight: 2 }}>
            {parts.map((p, i) => {
              if (p !== '[Blank]') return p ? <Shown key={i} value={p} size={20} /> : null;
              b++;
              return <Box key={i} component="span" sx={gap(!first.some((o) => o.sequenceNumber === b))} />;
            })}
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>{first.map((o) => <Box key={o.key} sx={tile}><Shown value={o.option || '…'} size={18} /></Box>)}</Box>
        </Box>
      );
    }
    case 8: {
      const parts = c.groups[0]?.options ?? [];
      const answers = c.groups[1]?.options ?? [];
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>{parts.map((o) => <Box key={o.key} sx={tile}><Shown value={o.option || '…'} size={18} /></Box>)}</Box>
          {answers.length > 0 && <Box sx={{ fontSize: 12, color: X.muted }}>Then: why is it wrong?</Box>}
          {answers.map((o) => <Box key={o.key} sx={{ ...card, fontSize: 13 }}><Shown value={o.option || '…'} size={13} /></Box>)}
        </Box>
      );
    }
    case 10:
      return (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center', mt: 1 }}>
          {opts.map((o) => <Box key={o.key} sx={{ ...tile, minWidth: 48, fontWeight: 700, ...(o.isCorrect ? { bgcolor: '#fff', border: '2px dashed #9AA1AD' } : {}) }}>{o.isCorrect ? '?' : o.option}</Box>)}
        </Box>
      );
    case 11:
      return (
        <Grid>
          {c.groups.map((g) => (
            <Box key={g.key} sx={{ ...card, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Box sx={{ fontSize: 10.5, color: X.muted }}>{SHAPES.find((s) => s.value === g.shapeType)?.label ?? 'Shape'}</Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center', fontWeight: 700 }}>
                {g.options.map((o) => <span key={o.key} style={{ minWidth: 18, color: o.isCorrect ? X.blue : X.text }}>{o.isCorrect ? '?' : o.option}</span>)}
              </Box>
            </Box>
          ))}
        </Grid>
      );
    case 12:
      return (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr', gap: '6px', alignItems: 'center', textAlign: 'center' }}>
          {c.groups.map((g) => (
            <Box key={g.key} sx={{ display: 'contents' }}>
              <Box sx={{ ...card, p: '6px', fontWeight: 600 }}>{g.options[0]?.option}</Box>
              <span>→</span>
              <Box sx={{ ...card, p: '6px', fontWeight: 600, ...(g.options[1]?.isCorrect ? { border: '2px dashed #9AA1AD' } : {}) }}>{g.options[1]?.isCorrect ? '?' : g.options[1]?.option}</Box>
            </Box>
          ))}
        </Box>
      );
    default:
      return <>{opts.map((o) => <Box key={o.key} sx={card}><Shown value={o.option || '…'} size={15} /></Box>)}</>;
  }
}

function Grid({ children }: { children: ReactNode }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>{children}</Box>;
}
