/** Reads and checks the environment once at startup. */
export interface AppEnv {
  port: number;
  adminJwtSecret: string;
  adminJwtTtlHours: number;
  corsOrigins: string[];
  admin2faIssuer: string;
}

let warnedNoDb = false;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  if (!source.ADMIN_JWT_SECRET) {
    throw new Error('Missing required environment variable: ADMIN_JWT_SECRET');
  }
  if (!source.DATABASE_URL && !warnedNoDb) {
    warnedNoDb = true;
    console.warn('DATABASE_URL is not set: the API starts, but every database request will fail until it is set.');
  }
  const secret = source.ADMIN_JWT_SECRET as string;
  if (source.NODE_ENV === 'production' && secret.length < 32) {
    throw new Error('ADMIN_JWT_SECRET must be at least 32 characters in production');
  }
  return {
    port: Number(source.PORT ?? 4000),
    adminJwtSecret: secret,
    adminJwtTtlHours: Number(source.ADMIN_JWT_TTL_HOURS ?? 12),
    corsOrigins: (source.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    admin2faIssuer: source.ADMIN_2FA_ISSUER ?? 'Tedix Admin',
  };
}
