import { INestApplication, Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import express from 'express';

/**
 * Serves the built React admin panel at /admin from the same Node process, so the API
 * and the panel deploy as one site. /admin/api/* stays with the NestJS controllers.
 * The folder can be overridden with ADMIN_DIST_DIR.
 */
export function serveAdminPanel(app: INestApplication): void {
  const dir = resolve(process.env.ADMIN_DIST_DIR ?? join(__dirname, '..', '..', 'admin', 'dist'));
  const indexFile = join(dir, 'index.html');
  if (!existsSync(indexFile)) {
    Logger.warn(`Admin panel build not found at ${dir}; /admin is not served`, 'AdminPanel');
    return;
  }
  const isApi = (req: Request) => req.path === '/api' || req.path.startsWith('/api/');

  app.use('/admin', (req: Request, res: Response, next: NextFunction) => {
    if (isApi(req)) return next();
    return express.static(dir, { index: false, maxAge: '1h' })(req, res, next);
  });
  app.use('/admin', (req: Request, res: Response, next: NextFunction) => {
    if (isApi(req) || req.method !== 'GET') return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexFile);
  });
  Logger.log(`Serving admin panel from ${dir}`, 'AdminPanel');
}
