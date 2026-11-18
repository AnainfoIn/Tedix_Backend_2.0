/** Reads and checks the environment once at startup. */
export interface AppEnv {
  port: number;
  adminJwtSecret: string;
  adminJwtTtlHours: number;
  corsOrigins: string[];
  admin2faIssuer: string;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const missing = ['DATABASE_URL', 'ADMIN_JWT_SECRET'].filter((key) => !source[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
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
