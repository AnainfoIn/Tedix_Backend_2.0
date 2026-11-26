import { Body, Get, HttpCode, Post } from '@nestjs/common';
import { AdminController } from '../admin-controller.decorator';
import { RequirePermission } from '../ability/require-permission.decorator';
import { LatexService } from './latex.service';

/** LaTeX helpers for content editors: /admin/api/latex. */
@AdminController('latex')
export class LatexController {
  constructor(private readonly latex: LatexService) {}

  /** Which conversions are available on this server. */
  @Get('status')
  @RequirePermission('read', 'micro_lessons')
  status() {
    return this.latex.status();
  }

  /** Text (any language) → the app's LaTeX content string. */
  @Post('convert')
  @HttpCode(200)
  @RequirePermission('manage', 'micro_lessons')
  convert(@Body() body: { text?: unknown }) {
    return this.latex.convert(body?.text);
  }
}
