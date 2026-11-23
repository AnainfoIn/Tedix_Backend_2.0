import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { cleanLatex, LatexService } from './latex.service';

describe('cleanLatex', () => {
  it('joins lines with \\\\ and strips fences and dollar signs', () => {
    expect(cleanLatex('```latex\n\\text{A }x\n\n\\text{B}\n```')).toBe('\\text{A }x \\\\ \\text{B}');
    expect(cleanLatex('$\\frac{1}{2}$')).toBe('\\frac{1}{2}');
    expect(cleanLatex('\\text{A} \\\\\n\\text{B}')).toBe('\\text{A} \\\\ \\text{B}');
  });
});

describe('LatexService.convert', () => {
  const service = new LatexService();
  const old = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    if (old === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = old;
  });

  it('rejects empty text', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    await expect(service.convert('  ')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('answers 503 without an API key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(service.status().data.aiConversion).toBe(false);
    await expect(service.convert('Adună 1/3 și 1/6.')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('sends the text to Claude and returns the cleaned LaTeX', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: 'text', text: '\\text{Adună }\\frac{1}{3}\n\\text{Gata.}' }] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const result = await service.convert('Adună 1/3\nGata.', fetchMock);
    expect(result.data.latex).toBe('\\text{Adună }\\frac{1}{3} \\\\ \\text{Gata.}');
    const [, init] = (fetchMock as unknown as jest.Mock).mock.calls[0];
    expect(init.headers['x-api-key']).toBe('k');
    expect(JSON.parse(init.body).messages[0].content).toBe('Adună 1/3\nGata.');
  });

  it('maps API errors to 503', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    const fetchMock = jest.fn(async () => new Response(JSON.stringify({ error: { message: 'bad' } }), { status: 401 })) as unknown as typeof fetch;
    await expect(service.convert('x', fetchMock)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
