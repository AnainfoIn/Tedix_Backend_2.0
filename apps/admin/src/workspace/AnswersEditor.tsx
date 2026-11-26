import { Box } from '@mui/material';
import { ReactNode } from 'react';
import {
  allOptions, blankCount, DGroup, DOpt, Draft, group, matchRows, opt, SHAPES, typeOf, withMatchRows, withOptions,
} from './exerciseModel';
import { AddLink, ContentField, FormRow, RemoveButton, Segmented, Shown, X } from './exerciseUi';

type Props = { d: Draft; set: (d: Draft) => void; readOnly: boolean; originalCode: string };

/** The Answers section of the editor: the inputs change with the exercise type (design board 6). */
export function AnswersEditor(props: Props) {
  const t = typeOf(props.d.questionType);
  switch (t.n) {
    case 1: return <PairRows {...props} a="Card A" b="Card B" sep="↔" add="+ Add pair" note="Each row is one pair of cards. Students tap both cards of a pair." />;
    case 2: return <Choices {...props} single />;
    case 3: return <Choices {...props} />;
    case 4: return <MemoryBack {...props} />;
    case 5: return <NumberLine {...props} />;
    case 6: return <MatchColumn {...props} />;
    case 7: return <Blanks {...props} />;
    case 8: return <FindMistake {...props} />;
    case 10: return <Pattern {...props} />;
    case 11: return <Shapes {...props} />;
    case 12: return <PairRows {...props} a="Input" b="Output" sep="→" add="+ Add example" hidden note="Example rows of input → output. Mark the output students must find." />;
    default: return <Box sx={{ color: X.muted, fontSize: 13 }}>This type has no answers in the app yet.</Box>;
  }
}

function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
        <Box component="span" sx={{ fontWeight: 600 }}>{title}</Box>
        {note && <Box component="span" sx={{ fontSize: 12, color: X.muted }}>{note}</Box>}
      </Box>
      {children}
    </Box>
  );
}

const upd = (list: DOpt[], i: number, patch: Partial<DOpt>) => list.map((o, j) => (j === i ? { ...o, ...patch } : o));
const filled = (s: string) => !!s.replace(/<[^>]+>/g, '').trim();

/** Single Choice (radio, True / False preset) and Multiple Choice (checkboxes). */
function Choices({ d, set, readOnly, single, originalCode }: Props & { single?: boolean }) {
  const opts = allOptions(d);
  const tf = originalCode === 'RO' ? ['Adevărat', 'Fals'] : originalCode === 'DE' ? ['Wahr', 'Falsch'] : originalCode === 'HU' ? ['Igaz', 'Hamis'] : ['True', 'False'];
  const isTf = single && opts.length === 2 && tf.includes(opts[0]?.option) && tf.includes(opts[1]?.option);
  const put = (list: DOpt[]) => set(withOptions(d, list));
  return (
    <Section title="Options" note={single ? 'Exactly one is correct' : 'Tick the correct ones'}>
      {single && !readOnly && (
        <Segmented label="Options" value={isTf ? 'tf' : 'own'} maxWidth={300}
          options={[['tf', 'True / False'], ['own', 'Own options']]}
          onChange={(v) => {
            if (v === 'tf' && !isTf) put([{ ...(opts[0] ?? opt()), option: tf[0], isCorrect: true, sequenceNumber: 1 }, { ...(opts[1] ?? opt()), option: tf[1], isCorrect: false, sequenceNumber: 2 }]);
            if (v === 'own' && isTf) put(opts.map((o) => ({ ...o, option: '' })));
          }} />
      )}
      {opts.map((o, i) => (
        <Box key={o.key} sx={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) 30px', gap: '10px', alignItems: 'start' }}>
          <Box sx={{ pt: '9px' }}>
            <input
              type={single ? 'radio' : 'checkbox'} name={`correct-${d.questionId ?? 'new'}`} checked={o.isCorrect} disabled={readOnly}
              aria-label={`Option ${i + 1} is correct`} style={{ width: 17, height: 17, accentColor: '#1E7D4F' }}
              onChange={(e) => put(single ? opts.map((x, j) => ({ ...x, isCorrect: j === i })) : upd(opts, i, { isCorrect: e.target.checked }))}
            />
          </Box>
          <ContentField id={`opt-${o.key}`} ariaLabel={`Option ${i + 1}`} single mono value={o.option} ok={o.isCorrect} readOnly={readOnly}
            onChange={(v) => put(upd(opts, i, { option: v }))} error={!readOnly && !filled(o.option) ? 'Type the option or remove it.' : null} />
          {!readOnly ? <RemoveButton label={`Remove option ${i + 1}`} onClick={() => put(opts.filter((_, j) => j !== i))} /> : <span />}
        </Box>
      ))}
      {!readOnly && <AddLink indent={38} onClick={() => put([...opts, opt('', false, opts.length + 1)])}>+ Add option</AddLink>}
    </Section>
  );
}

function MemoryBack({ d, set, readOnly }: Props) {
  const back = allOptions(d)[0] ?? opt('', true, 1);
  return (
    <Section title="Card" note="The question is the front of the card; the answer is its back.">
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
        <Box sx={{ border: `1px solid ${X.line}`, borderRadius: '10px', p: 1.5, bgcolor: X.soft, minHeight: 90 }}>
          <Box sx={{ fontSize: 11, fontWeight: 700, color: X.muted, mb: 0.5, letterSpacing: '.04em' }}>FRONT (question)</Box>
          {d.question ? <Shown value={d.question} size={14} /> : <Box component="span" sx={{ color: X.muted, fontSize: 13 }}>Type the question above.</Box>}
        </Box>
        <Box sx={{ border: `1px solid ${X.okLine}`, borderRadius: '10px', p: 1.5, bgcolor: X.okBg }}>
          <Box component="label" htmlFor="memory-back" sx={{ fontSize: 11, fontWeight: 700, color: '#1E6B3A', mb: 0.5, display: 'block', letterSpacing: '.04em' }}>BACK (answer)</Box>
          <ContentField id="memory-back" rows={2} value={back.option} readOnly={readOnly}
            onChange={(v) => set(withOptions(d, [{ ...back, option: v, isCorrect: true, sequenceNumber: back.sequenceNumber ?? 1 }]))} />
        </Box>
      </Box>
    </Section>
  );
}

/** Tap & Pair (group per pair, 2 cards) and Rule Discovery (group per row: input, output; one output hidden). */
function PairRows({ d, set, readOnly, a, b, sep, add, note, hidden }: Props & { a: string; b: string; sep: string; add: string; note: string; hidden?: boolean }) {
  const groups = d.groups;
  const put = (gs: DGroup[]) => set({ ...d, groups: gs });
  const cell = (g: DGroup, gi: number, oi: number, label: string) => {
    const o = g.options[oi] ?? opt('', false, oi + 1);
    return (
      <ContentField id={`pair-${g.key}-${oi}`} ariaLabel={`${label} ${gi + 1}`} single dense value={o.option} readOnly={readOnly} placeholder={label} ok={hidden && oi === 1 && o.isCorrect}
        onChange={(v) => {
          const options = [0, 1].map((k) => g.options[k] ?? opt('', false, k + 1));
          options[oi] = { ...options[oi], option: v, sequenceNumber: options[oi].sequenceNumber ?? oi + 1 };
          put(groups.map((x, j) => (j === gi ? { ...x, options } : x)));
        }} />
    );
  };
  return (
    <Section title={hidden ? 'Examples' : 'Pairs'} note={note}>
      <Box sx={{ display: 'grid', gridTemplateColumns: `24px minmax(0,1fr) 20px minmax(0,1fr)${hidden ? ' 56px' : ''} 30px`, gap: '8px', alignItems: 'center', fontSize: 12, color: X.muted }}>
        <span /><span>{a}</span><span /><span>{b}</span>{hidden && <span>Hidden</span>}<span />
        {groups.map((g, gi) => (
          <Box key={g.key} sx={{ display: 'contents' }}>
            <Box sx={{ color: X.muted, fontSize: 13, textAlign: 'right' }}>{gi + 1}</Box>
            {cell(g, gi, 0, a)}
            <Box sx={{ textAlign: 'center', color: X.muted, fontSize: 15 }}>{sep}</Box>
            {cell(g, gi, 1, b)}
            {hidden && (
              <Box sx={{ textAlign: 'center' }}>
                <input type="radio" name={`hidden-${d.questionId ?? 'new'}`} aria-label={`Output ${gi + 1} is hidden`} disabled={readOnly} checked={!!g.options[1]?.isCorrect}
                  style={{ width: 17, height: 17, accentColor: X.blue }}
                  onChange={() => put(groups.map((x, j) => ({ ...x, options: x.options.map((o, k) => ({ ...o, isCorrect: j === gi && k === 1 })) })))} />
              </Box>
            )}
            {!readOnly ? <RemoveButton label={`Remove row ${gi + 1}`} onClick={() => put(groups.filter((_, j) => j !== gi))} /> : <span />}
          </Box>
        ))}
      </Box>
      {!readOnly && <AddLink indent={32} onClick={() => put([...groups, group([opt('', false, 1), opt('', false, 2)])])}>{add}</AddLink>}
    </Section>
  );
}

function MatchColumn({ d, set, readOnly }: Props) {
  const rows = matchRows(d);
  const put = (r: typeof rows) => set(withMatchRows(d, r));
  return (
    <Section title="Rows" note="Each row holds a left item and the right item it matches. The app shuffles the right column.">
      <Box sx={{ display: 'grid', gridTemplateColumns: '24px minmax(0,1fr) 20px minmax(0,1fr) 30px', gap: '8px', alignItems: 'center', fontSize: 12, color: X.muted }}>
        <span /><span>Left</span><span /><span>Right</span><span />
        {rows.map((r, i) => (
          <Box key={(r.left?.key ?? '') + (r.right?.key ?? '') + i} sx={{ display: 'contents' }}>
            <Box sx={{ fontSize: 13, textAlign: 'right' }}>{i + 1}</Box>
            <ContentField id={`left-${i}`} ariaLabel={`Left ${i + 1}`} single dense value={r.left?.option ?? ''} readOnly={readOnly}
              onChange={(v) => put(rows.map((x, j) => (j === i ? { ...x, left: { ...(x.left ?? opt()), option: v } } : x)))} />
            <Box sx={{ textAlign: 'center', fontSize: 15 }}>→</Box>
            <ContentField id={`right-${i}`} ariaLabel={`Right ${i + 1}`} single dense value={r.right?.option ?? ''} readOnly={readOnly}
              onChange={(v) => put(rows.map((x, j) => (j === i ? { ...x, right: { ...(x.right ?? opt()), option: v } } : x)))} />
            {!readOnly ? <RemoveButton label={`Remove row ${i + 1}`} onClick={() => put(rows.filter((_, j) => j !== i))} /> : <span />}
          </Box>
        ))}
      </Box>
      {!readOnly && <AddLink indent={32} onClick={() => put([...rows, { left: opt(), right: opt() }])}>+ Add row</AddLink>}
    </Section>
  );
}

/** Number Line: points named like "a", placed at a value (sequence number); "To find" = students place it. */
function NumberLine({ d, set, readOnly }: Props) {
  const opts = allOptions(d);
  const put = (list: DOpt[]) => set(withOptions(d, list));
  const at = opts.map((o) => o.sequenceNumber).filter((n): n is number => n != null);
  const max = Math.max(10, ...at.map((n) => n + 1));
  return (
    <Section title="Points" note="Each point has a label and its position on the line. Tick the points students must place.">
      <Box sx={{ position: 'relative', height: 54, mx: 2, mt: 1 }} aria-hidden>
        <Box sx={{ position: 'absolute', left: 0, right: 0, top: 22, height: 2, bgcolor: X.text }} />
        {Array.from({ length: max + 1 }, (_, k) => (
          <Box key={k} sx={{ position: 'absolute', left: `${(k / max) * 100}%`, top: 16, width: '1px', height: 14, bgcolor: X.text, '&::after': k === 0 || k === max ? { content: `"${k}"`, position: 'absolute', top: 16, left: -4, fontSize: 11, color: X.muted } : undefined }} />
        ))}
        {opts.filter((o) => o.sequenceNumber != null).map((o) => (
          <Box key={o.key} sx={{ position: 'absolute', left: `${(o.sequenceNumber! / max) * 100}%`, top: 0, transform: 'translateX(-50%)', fontSize: 12, fontWeight: 700, color: o.isCorrect ? X.blue : X.text }}>
            {o.option || '?'}
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: o.isCorrect ? X.blue : X.text, mx: 'auto', mt: '4px' }} />
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 110px 70px 30px', gap: '8px', alignItems: 'center', fontSize: 12, color: X.muted }}>
        <span>Point label</span><span>At</span><span>To find</span><span />
        {opts.map((o, i) => (
          <Box key={o.key} sx={{ display: 'contents' }}>
            <ContentField id={`pt-${o.key}`} ariaLabel={`Point ${i + 1} label`} single dense tools={false} hideShown value={o.option} readOnly={readOnly} onChange={(v) => put(upd(opts, i, { option: v }))} />
            <input type="number" aria-label={`Point ${i + 1} position`} value={o.sequenceNumber ?? ''} readOnly={readOnly}
              onChange={(e) => put(upd(opts, i, { sequenceNumber: e.target.value === '' ? null : Math.round(Number(e.target.value)) }))}
              style={{ height: 34, border: `1px solid ${X.field}`, borderRadius: 8, padding: '0 10px', font: '14px Inter, sans-serif', minWidth: 0, width: '100%', boxSizing: 'border-box' }} />
            <Box sx={{ textAlign: 'center' }}>
              <input type="checkbox" aria-label={`Point ${i + 1} is to find`} checked={o.isCorrect} disabled={readOnly} onChange={(e) => put(upd(opts, i, { isCorrect: e.target.checked }))} style={{ width: 17, height: 17, accentColor: X.blue }} />
            </Box>
            {!readOnly ? <RemoveButton label={`Remove point ${i + 1}`} onClick={() => put(opts.filter((_, j) => j !== i))} /> : <span />}
          </Box>
        ))}
      </Box>
      {!readOnly && <AddLink onClick={() => put([...opts, opt(String.fromCharCode(97 + opts.length), true, null)])}>+ Add point</AddLink>}
    </Section>
  );
}

/** Drag & Drop / Sequence / Fill in the Blank: statement with [Blank] slots, tiles that fill them, extra answer sets. */
function Blanks({ d, set, readOnly }: Props) {
  const blanks = blankCount(d.questionBody);
  const groups = d.groups.length ? d.groups : [group()];
  const put = (gs: DGroup[]) => set({ ...d, groups: gs });
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
      <FormRow label="Tiles" note="Pick the blank each tile fills. Others are distractors.">
        {groups.map((g, gi) => {
          const missing = Array.from({ length: blanks }, (_, k) => k + 1).filter((b) => !g.options.some((o) => o.sequenceNumber === b));
          return (
            <Box key={g.key} sx={{ display: 'flex', flexDirection: 'column', gap: 1, ...(groups.length > 1 ? { border: `1px dashed ${X.line}`, borderRadius: '10px', p: 1.25 } : {}) }}>
              {groups.length > 1 && (
                <Box sx={{ display: 'flex', alignItems: 'center', fontSize: 12, color: X.muted, fontWeight: 600 }}>
                  <Box sx={{ flex: 1 }}>Valid answer set {gi + 1}</Box>
                  {!readOnly && <RemoveButton label={`Remove answer set ${gi + 1}`} onClick={() => put(groups.filter((_, j) => j !== gi))} />}
                </Box>
              )}
              {g.options.map((o, i) => {
                const fills = o.sequenceNumber != null && o.sequenceNumber >= 1;
                const empty = !filled(o.option);
                return (
                  <Box key={o.key}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', pl: '10px', pr: '4px', py: '3px', borderRadius: '8px',
                      border: `1px solid ${empty ? X.redLine : fills ? X.okLine : X.line}`, bgcolor: empty ? X.redBg : fills ? X.okBg : '#fff' }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <input type="text" aria-label={`Tile ${i + 1}`} placeholder="Tile text" value={o.option} readOnly={readOnly}
                          onChange={(e) => put(groups.map((x, j) => (j === gi ? { ...x, options: upd(x.options, i, { option: e.target.value }) } : x)))}
                          style={{ width: '100%', border: 0, outline: 0, background: 'transparent', font: "15px 'JetBrains Mono', ui-monospace, monospace", padding: '5px 0' }} />
                      </Box>
                      {filled(o.option) && /\\/.test(o.option) && <Shown value={o.option} size={15} />}
                      <select aria-label={`Tile ${i + 1} fills`} disabled={readOnly} value={o.sequenceNumber ?? 0}
                        onChange={(e) => { const v = Number(e.target.value); put(groups.map((x, j) => (j === gi ? { ...x, options: upd(x.options, i, { sequenceNumber: v || null, isCorrect: !!v }) } : x))); }}
                        style={{ fontSize: 13, border: `1px solid ${X.field}`, borderRadius: 6, padding: '4px', background: '#fff' }}>
                        <option value={0}>Distractor</option>
                        {Array.from({ length: Math.max(blanks, o.sequenceNumber ?? 0) }, (_, k) => <option key={k} value={k + 1}>Fills Blank {k + 1}</option>)}
                      </select>
                      {!readOnly && <RemoveButton label={`Remove tile ${i + 1}`} onClick={() => put(groups.map((x, j) => (j === gi ? { ...x, options: x.options.filter((_, k) => k !== i) } : x)))} />}
                    </Box>
                    {empty && !readOnly && <Box sx={{ fontSize: 12, color: X.red, mt: '4px' }}>Tile {i + 1} is empty: type its text or remove it.</Box>}
                  </Box>
                );
              })}
              {missing.map((b) => (
                <Box key={b} sx={{ fontSize: 12, color: X.red }}>Blank {b} has no tile that fills it: choose "Fills Blank {b}" on a tile.</Box>
              ))}
              {!readOnly && <AddLink onClick={() => put(groups.map((x, j) => (j === gi ? { ...x, options: [...x.options, opt('', false, null)] } : x)))}>+ Add tile</AddLink>}
            </Box>
          );
        })}
        {!readOnly && (
          <AddLink onClick={() => put([...groups, group(groups[groups.length - 1].options.map((o) => opt(o.option, o.isCorrect, o.sequenceNumber)))])}>+ Another valid answer set</AddLink>
        )}
      </FormRow>
    </Box>
  );
}

/** Find the Mistake: group 1 = expression parts (one is the mistake), group 2 = answers to "why is it wrong" (one correct). */
function FindMistake({ d, set, readOnly }: Props) {
  const parts = d.groups[0] ?? group();
  const answers = d.groups[1] ?? group();
  const put = (p: DGroup, a: DGroup) => set({ ...d, groups: [p, a, ...d.groups.slice(2)] });
  const list = (g: DGroup, which: 'part' | 'answer') => g.options.map((o, i) => (
    <Box key={o.key} sx={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) 30px', gap: '10px', alignItems: 'center' }}>
      <input type="radio" name={`${which}-${d.questionId ?? 'new'}`} aria-label={which === 'part' ? `Part ${i + 1} is the mistake` : `Answer ${i + 1} is correct`} checked={o.isCorrect} disabled={readOnly}
        style={{ width: 17, height: 17, accentColor: which === 'part' ? X.red : '#1E7D4F' }}
        onChange={() => { const next = { ...g, options: g.options.map((x, j) => ({ ...x, isCorrect: j === i })) }; which === 'part' ? put(next, answers) : put(parts, next); }} />
      <ContentField id={`${which}-${o.key}`} ariaLabel={`${which === 'part' ? 'Part' : 'Answer'} ${i + 1}`} single dense value={o.option} readOnly={readOnly} ok={which === 'answer' && o.isCorrect}
        onChange={(v) => { const next = { ...g, options: upd(g.options, i, { option: v }) }; which === 'part' ? put(next, answers) : put(parts, next); }} />
      {!readOnly ? <RemoveButton label={`Remove ${which} ${i + 1}`} onClick={() => { const next = { ...g, options: g.options.filter((_, j) => j !== i) }; which === 'part' ? put(next, answers) : put(parts, next); }} /> : <span />}
    </Box>
  ));
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Section title="Expression parts (step 1)" note="In order. Mark the wrong part.">
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px', p: 1, border: `1px solid ${X.line}`, borderRadius: '8px', bgcolor: X.soft, minHeight: 40, alignItems: 'center' }}>
          {parts.options.map((o) => (
            <Box key={o.key} sx={{ px: 1, py: '4px', borderRadius: '6px', border: `1px solid ${o.isCorrect ? X.red : X.line}`, bgcolor: '#fff', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <Shown value={o.option || '…'} size={15} />
              {o.isCorrect && <Box component="span" sx={{ fontSize: 9, fontWeight: 700, color: X.red }}>MISTAKE</Box>}
            </Box>
          ))}
        </Box>
        {list(parts, 'part')}
        {!readOnly && <AddLink indent={38} onClick={() => put({ ...parts, options: [...parts.options, opt('', false, parts.options.length + 1)] }, answers)}>+ Add part</AddLink>}
      </Section>
      <Section title="Cross question (step 2)" note="Why is this wrong? One answer is correct.">
        {list(answers, 'answer')}
        {!readOnly && <AddLink indent={38} onClick={() => put(parts, { ...answers, options: [...answers.options, opt('', false, answers.options.length + 1)] })}>+ Add answer</AddLink>}
      </Section>
    </Box>
  );
}

/** Number Pattern: terms in order, one hidden (is_correct). */
function Pattern({ d, set, readOnly }: Props) {
  const opts = allOptions(d);
  const put = (list: DOpt[]) => set(withOptions(d, list.map((o, i) => ({ ...o, sequenceNumber: i + 1 }))));
  return (
    <Section title="Terms" note="In order. Choose the term students must find.">
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'flex-start' }}>
        {opts.map((o, i) => (
          <Box key={o.key} sx={{ width: 116, display: 'flex', flexDirection: 'column', gap: '4px', p: '6px', borderRadius: '10px', border: `1px solid ${o.isCorrect ? X.blue : X.line}`, bgcolor: o.isCorrect ? '#F5F9FF' : '#fff' }}>
            <input type="text" aria-label={`Term ${i + 1}`} value={o.option} readOnly={readOnly} onChange={(e) => put(upd(opts, i, { option: e.target.value }))}
              style={{ height: 32, border: `1px solid ${filled(o.option) ? X.field : '#D9534F'}`, borderRadius: 6, padding: '0 8px', font: '600 15px Inter, sans-serif', textAlign: 'center', minWidth: 0, width: '100%', boxSizing: 'border-box' }} />
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: o.isCorrect ? X.blueDark : X.muted }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: o.isCorrect ? 700 : 400 }}>
                <input type="radio" name={`hidden-${d.questionId ?? 'new'}`} checked={o.isCorrect} disabled={readOnly} onChange={() => put(opts.map((x, j) => ({ ...x, isCorrect: j === i })))} style={{ accentColor: X.blue }} />
                {o.isCorrect ? 'HIDDEN' : 'Hide'}
              </label>
              {!readOnly && <Box component="button" type="button" aria-label={`Remove term ${i + 1}`} onClick={() => put(opts.filter((_, j) => j !== i))} sx={{ border: 0, background: 'none', color: X.muted, cursor: 'pointer' }}>✕</Box>}
            </Box>
          </Box>
        ))}
        {!readOnly && <Box sx={{ pt: '12px' }}><AddLink onClick={() => put([...opts, opt('')])}>+ Term</AddLink></Box>}
      </Box>
    </Section>
  );
}

/** Shape Pattern: one card per shape (shape type, a value per vertex in order); one value overall is missing. */
function Shapes({ d, set, readOnly }: Props) {
  const put = (gs: DGroup[]) => set({ ...d, groups: gs });
  const all = d.groups;
  const setMissing = (gi: number, values: DOpt[], oi: number) =>
    put(all.map((g, j) => ({ ...g, options: (j === gi ? values : g.options).map((o, k) => ({ ...o, isCorrect: j === gi && k === oi })) })));
  return (
    <Section title="Shapes" note="One card per shape: pick the shape, fill each vertex in order, mark the missing value.">
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 1.25 }}>
        {all.map((g, gi) => {
          const spec = SHAPES.find((s) => s.value === g.shapeType);
          const n = Math.max(spec?.vertices ?? 3, g.options.length);
          const values = Array.from({ length: n }, (_, k) => g.options[k] ?? opt('', false, k + 1));
          const sum = values.filter((o) => !o.isCorrect).reduce((s, o) => s + (Number(o.option) || 0), 0);
          return (
            <Box key={g.key} sx={{ border: `1px solid ${g.shapeType ? X.line : '#D9534F'}`, borderRadius: '10px', p: 1.25, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <select aria-label={`Shape ${gi + 1}`} value={g.shapeType ?? ''} disabled={readOnly}
                  onChange={(e) => put(all.map((x, j) => (j === gi ? { ...x, shapeType: e.target.value || null } : x)))}
                  style={{ flex: 1, fontSize: 13, border: `1px solid ${X.field}`, borderRadius: 6, padding: '5px', background: '#fff' }}>
                  <option value="">Choose shape…</option>
                  {SHAPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                {!readOnly && <RemoveButton label={`Remove shape ${gi + 1}`} onClick={() => put(all.filter((_, j) => j !== gi))} />}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {values.map((o, k) => (
                  <Box key={o.key} sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <input type="text" aria-label={`Shape ${gi + 1} vertex ${k + 1}`} value={o.option} readOnly={readOnly}
                      onChange={(e) => { const opts = values.map((x, i) => (i === k ? { ...x, option: e.target.value, sequenceNumber: k + 1 } : { ...x, sequenceNumber: i + 1 })); put(all.map((x, j) => (j === gi ? { ...x, options: opts } : x))); }}
                      style={{ height: 30, border: `1px solid ${o.isCorrect ? X.blue : X.field}`, background: o.isCorrect ? '#F5F9FF' : '#fff', borderRadius: 6, textAlign: 'center', font: '600 14px Inter, sans-serif', minWidth: 0, width: '100%', boxSizing: 'border-box' }} />
                    <label style={{ fontSize: 10.5, color: o.isCorrect ? X.blueDark : X.muted, display: 'flex', gap: 3, alignItems: 'center', justifyContent: 'center' }}>
                      <input type="radio" name={`missing-${d.questionId ?? 'new'}`} checked={o.isCorrect} disabled={readOnly}
                        onChange={() => setMissing(gi, values, k)} style={{ accentColor: X.blue, margin: 0 }} />
                      {k + 1}{o.isCorrect ? ' · missing' : ''}
                    </label>
                  </Box>
                ))}
              </Box>
              <Box sx={{ fontSize: 11.5, color: X.muted }}>{values.some((o) => o.isCorrect) ? `missing: ${values.find((o) => o.isCorrect)?.option || '?'}` : `sum ${sum}`}</Box>
            </Box>
          );
        })}
      </Box>
      {!readOnly && <AddLink onClick={() => put([...all, group([opt('', false, 1), opt('', false, 2), opt('', false, 3)], 'triangle')])}>+ Add shape</AddLink>}
    </Section>
  );
}
