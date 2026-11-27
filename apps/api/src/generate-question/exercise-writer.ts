import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ImportOutput, importSchema, importSystemPrompt } from './import';

export const IMPORT_MODEL = 'claude-opus-5-5';

/**
 * Reads pasted questions into exercises of one type with Claude (structured output, so the answer
 * always has the fields of that type). Needs ANTHROPIC_API_KEY on the API server.
 * Tests replace this provider with a fake.
 */
@Injectable()
export class ExerciseWriter {
  private client: Anthropic | null = null;

  async read(type: number, text: string): Promise<ImportOutput> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new ServiceUnavailableException('Reading pasted questions needs Claude: set ANTHROPIC_API_KEY on the API server');
    }
    this.client ??= new Anthropic();
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: IMPORT_MODEL,
        max_tokens: 16000,
        // If Claude declines (a safety refusal), the API retries on a fallback model in the same call.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: betaZodOutputFormat(importSchema(type)) },
        system: importSystemPrompt(type),
        messages: [{ role: 'user', content: `<pasted_questions>\n${text}\n</pasted_questions>` }],
      });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) throw new ServiceUnavailableException('Claude is busy: try again in a minute');
      if (e instanceof Anthropic.AuthenticationError) throw new ServiceUnavailableException('The Claude API key on the server is not valid');
      if (e instanceof Anthropic.APIError) throw new ServiceUnavailableException(`Claude could not read the questions (${e.status ?? 'network'}): try again`);
      throw e;
    }
    if (response.stop_reason === 'refusal') throw new BadRequestException('Claude declined to read this text');
    if (response.stop_reason === 'max_tokens') throw new BadRequestException('Too many questions at once: paste fewer (about 20) and try again');
    if (!response.parsed_output) throw new ServiceUnavailableException('Claude answered in an unexpected form: try again');
    return response.parsed_output as ImportOutput;
  }
}
