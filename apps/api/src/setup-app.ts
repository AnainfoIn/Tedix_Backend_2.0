import { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { serveAdminPanel } from './admin-static';
import { enableBigIntJson } from './common/bigint-json';
import { loadEnv } from './config/env';

/** Shared by main.ts and the e2e tests so both run the same middleware. */
export function setupApp(app: INestApplication, options: { serveAdmin?: boolean } = {}): void {
  enableBigIntJson();
  const env = loadEnv();
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // MUI injects styles at runtime; the QR code is inline SVG.
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:'],
        },
      },
    }),
  );
  app.enableCors({
    origin: env.corsOrigins.length ? env.corsOrigins : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['Content-Range'],
  });
  if (options.serveAdmin !== false) serveAdminPanel(app);
  app.enableShutdownHooks();
}
