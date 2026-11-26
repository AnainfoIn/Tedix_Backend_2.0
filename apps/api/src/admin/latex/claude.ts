import { Logger, ServiceUnavailableException } from '@nestjs/common';

const apiUrl = () => `${(process.env.ANTHROPIC_BASE_URL?.trim() || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`;
const DEFAULT_MODEL = 'claude-sonnet-5-5';
const logger = new Logger('ClaudeApi');

export const claudeConfigured = () => !!process.env.ANTHROPIC_API_KEY?.trim();

/** One Messages API call; returns the text of the answer. Errors become 503s the panel can show. */
export async function askClaude(system: string, user: string, opts: { maxTokens?: number; fetchImpl?: typeof fetch } = {}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new ServiceUnavailableException('AI is not set up on this server (ANTHROPIC_API_KEY is missing)');
  let response: Response;
  try {
    response = await (opts.fetchImpl ?? fetch)(apiUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
        max_tokens: opts.maxTokens ?? 4096,
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    logger.warn(`Claude API request failed: ${(e as Error).message}`);
    throw new ServiceUnavailableException('The AI service is not reachable right now. Try again in a moment.');
  }
  const body = (await response.json().catch(() => null)) as { content?: Array<{ type: string; text?: string }>; error?: { message?: string } } | null;
  if (!response.ok) {
    logger.warn(`Claude API answered ${response.status}: ${body?.error?.message ?? ''}`);
    throw new ServiceUnavailableException('The AI request failed. Try again.');
  }
  return (body?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
}
