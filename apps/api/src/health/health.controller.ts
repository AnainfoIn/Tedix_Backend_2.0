import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../common/public.decorator';

/** Same contract as the Rails `/healthcheck` route: plain text "Ok". */
@Controller()
export class HealthController {
  @Public()
  @Get('healthcheck')
  @Header('Content-Type', 'text/plain')
  check(): string {
    return 'Ok';
  }
}
