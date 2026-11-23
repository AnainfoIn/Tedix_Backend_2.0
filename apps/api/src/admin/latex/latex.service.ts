import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

/** Longest text the Insert pop-up may send for conversion (characters). */
export const MAX_CONVERT_CHARS = 8000;

const DEFAULT_MODEL = 'claude-sonnet-5-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

export const CONVERT_SYSTEM_PROMPT = String.raw`You convert lesson text for the Tedix maths app into the LaTeX format its content fields store.

The format:
- The whole content is one LaTeX math-mode string rendered with KaTeX. Lines are separated by " \\ " (space, two backslashes, space).
- Prose goes inside \text{...}. Maths is written directly between the \text{} parts, for example:
  \text{Adună }\frac{1}{3}\text{ și }\frac{1}{6}\text{.}
- Keep spaces at the start or end of \text{} where the words meet a formula, as in the example.
- Image placeholders such as tedimageone or tedimagetwo stay exactly as written, alone on their own line.
- Use only commands KaTeX supports: \frac, \sqrt, ^{}, _{}, \times, \div, \cdot, \pm, \leq, \geq, \neq, \approx, \pi, \infty, ^{\circ}, \%, Greek letters, \left( \right), and similar.
- Escape # $ % & _ { } inside \text{} with a backslash. Do not use $ delimiters, \[ \], \begin{...} environments or Markdown.

Rules:
- Keep the original language and wording exactly (for example Romanian stays Romanian, with its diacritics). Never translate, summarise, correct or add content.
- Turn every number expression, fraction (1/2, "3 over 4"), power, root, unit or symbol into proper LaTeX.
- Keep one output line per input line or paragraph; drop empty lines.
- Reply with the LaTeX string only: no explanation, no code fences.`;

/** Converts pasted or typed lesson text into the app's LaTeX content format with the Claude API. */
@Injectable()
export class LatexService {
  private readonly logger = new Logger(LatexService.name);

  private get apiKey(): string | undefined {
    return process.env.ANTHROPIC_API_KEY?.trim() || undefined;
  }

  status() {
    return { data: { aiConversion: !!this.apiKey, fileUpload: false } };
  }

  async convert(text: unknown, fetchImpl: typeof fetch = fetch): Promise<{ data: { latex: string; source: 'ai' } }> {
    if (typeof text !== 'string' || !text.trim()) throw new BadRequestException('Add some text to convert');
    if (text.length > MAX_CONVERT_CHARS) throw new BadRequestException(`Text is too long to convert (at most ${MAX_CONVERT_CHARS} characters)`);
    const key = this.apiKey;
    if (!key) throw new ServiceUnavailableException('AI conversion is not set up (ANTHROPIC_API_KEY is missing)');

    let response: Response;
    try {
      response = await fetchImpl(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
          max_tokens: 4096,
          system: CONVERT_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: text }],
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      this.logger.warn(`Claude API request failed: ${(e as Error).message}`);
      throw new ServiceUnavailableException('AI conversion is not reachable right now. Try again in a moment.');
    }
    const body = (await response.json().catch(() => null)) as { content?: Array<{ type: string; text?: string }>; error?: { message?: string } } | null;
    if (!response.ok) {
      this.logger.warn(`Claude API answered ${response.status}: ${body?.error?.message ?? ''}`);
      throw new ServiceUnavailableException('AI conversion failed. Try again, or write the LaTeX by hand.');
    }
    const out = (body?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
    const latex = cleanLatex(out);
    if (!latex) throw new ServiceUnavailableException('AI conversion returned nothing. Try again.');
    return { data: { latex, source: 'ai' } };
  }
}

/** Strips code fences, $ delimiters and stray blank lines a model may add around the answer. */
export function cleanLatex(raw: string): string {
  let s = raw.trim();
  const fence = /^```[a-z]*\s*\n?([\s\S]*?)\n?```$/i.exec(s);
  if (fence) s = fence[1].trim();
  if (/^\$\$[\s\S]*\$\$$/.test(s)) s = s.slice(2, -2).trim();
  else if (/^\$[^$]*\$$/.test(s)) s = s.slice(1, -1).trim();
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\\\\\s*|\s*\\\\$/g, ''))
    .filter(Boolean)
    .join(' \\\\ ');
}
