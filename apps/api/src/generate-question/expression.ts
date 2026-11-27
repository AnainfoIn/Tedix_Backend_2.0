/**
 * A small, safe arithmetic expression language for question templates (no `eval`).
 *
 *   numbers 2  3.5      variables a  b  start
 *   + - * / % ^         ( )        unary minus
 *   < <= > >= == !=     (constraints, true = 1, false = 0)
 *   min(a, b) max() abs() round() floor() ceil() sqrt()
 *
 * Also accepts the signs people type: × · for *, ÷ : for /, − for -.
 */

export type Node =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'neg'; e: Node }
  | { k: 'bin'; op: string; l: Node; r: Node }
  | { k: 'call'; fn: string; args: Node[] };

export class ExpressionError extends Error {}

const FUNCTIONS: Record<string, (...xs: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sqrt: Math.sqrt,
};
export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

/** Replaces the typed signs (×, ÷, −, ...) with the ones the parser reads. */
export const normalizeSigns = (s: string) =>
  s.replace(/[×·⋅]/g, '*').replace(/[÷:]/g, '/').replace(/[−–]/g, '-').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=');

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const s = normalizeSigns(src);
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const num = /^\d+(?:\.\d+)?/.exec(s.slice(i));
    if (num) {
      out.push({ t: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (id) {
      out.push({ t: 'id', v: id[0] });
      i += id[0].length;
      continue;
    }
    const op = /^(<=|>=|==|!=|[-+*/%^()<>,])/.exec(s.slice(i));
    if (op) {
      out.push({ t: 'op', v: op[0] });
      i += op[0].length;
      continue;
    }
    throw new ExpressionError(`Unexpected "${c}" in "${src}"`);
  }
  return out;
}

/** Parses an expression; throws ExpressionError when it is not one. */
export function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExpressionError(`Expected "${v}" in "${src}"`);
    p++;
  };

  const cmp = (): Node => {
    const l = add();
    const t = peek();
    if (t?.t === 'op' && ['<', '<=', '>', '>=', '==', '!='].includes(t.v)) {
      p++;
      return { k: 'bin', op: t.v, l, r: add() };
    }
    return l;
  };
  const add = (): Node => {
    let l = mul();
    while (isOp('+') || isOp('-')) {
      const op = toks[p++].v as string;
      l = { k: 'bin', op, l, r: mul() };
    }
    return l;
  };
  const mul = (): Node => {
    let l = unary();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = toks[p++].v as string;
      l = { k: 'bin', op, l, r: unary() };
    }
    return l;
  };
  const unary = (): Node => {
    if (isOp('-')) {
      p++;
      return { k: 'neg', e: unary() };
    }
    if (isOp('+')) {
      p++;
      return unary();
    }
    return pow();
  };
  const pow = (): Node => {
    const base = atom();
    if (isOp('^')) {
      p++;
      return { k: 'bin', op: '^', l: base, r: unary() };
    }
    return base;
  };
  const atom = (): Node => {
    const t = peek();
    if (!t) throw new ExpressionError(`"${src}" ends too early`);
    if (t.t === 'num') {
      p++;
      return { k: 'num', v: t.v };
    }
    if (t.t === 'id') {
      p++;
      if (isOp('(')) {
        if (!FUNCTIONS[t.v]) throw new ExpressionError(`Unknown function "${t.v}"`);
        p++;
        const args: Node[] = [];
        if (!isOp(')')) {
          args.push(cmp());
          while (isOp(',')) {
            p++;
            args.push(cmp());
          }
        }
        expect(')');
        return { k: 'call', fn: t.v, args };
      }
      return { k: 'var', name: t.v };
    }
    if (t.v === '(') {
      p++;
      const e = cmp();
      expect(')');
      return e;
    }
    throw new ExpressionError(`Unexpected "${t.v}" in "${src}"`);
  };

  if (!toks.length) throw new ExpressionError('Empty expression');
  const node = cmp();
  if (p < toks.length) throw new ExpressionError(`Unexpected "${String(toks[p].v)}" in "${src}"`);
  return node;
}

/** The variable names an expression uses. */
export function variablesOf(node: Node, out = new Set<string>()): Set<string> {
  switch (node.k) {
    case 'var':
      out.add(node.name);
      break;
    case 'neg':
      variablesOf(node.e, out);
      break;
    case 'bin':
      variablesOf(node.l, out);
      variablesOf(node.r, out);
      break;
    case 'call':
      node.args.forEach((a) => variablesOf(a, out));
      break;
  }
  return out;
}

/** Evaluates; division by zero and unknown variables give NaN (the caller rejects the values). */
export function evaluate(node: Node, vars: Record<string, number>): number {
  switch (node.k) {
    case 'num':
      return node.v;
    case 'var':
      return node.name in vars ? vars[node.name] : NaN;
    case 'neg':
      return -evaluate(node.e, vars);
    case 'call':
      return FUNCTIONS[node.fn](...node.args.map((a) => evaluate(a, vars)));
    case 'bin': {
      const l = evaluate(node.l, vars);
      const r = evaluate(node.r, vars);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return r === 0 ? NaN : l / r;
        case '%': return r === 0 ? NaN : l % r;
        case '^': return l ** r;
        case '<': return +(l < r);
        case '<=': return +(l <= r);
        case '>': return +(l > r);
        case '>=': return +(l >= r);
        case '==': return +(Math.abs(l - r) < 1e-9);
        case '!=': return +(Math.abs(l - r) >= 1e-9);
      }
    }
  }
  return NaN;
}

/** Parses and evaluates in one go. */
export const calc = (src: string, vars: Record<string, number> = {}) => evaluate(parse(src), vars);
