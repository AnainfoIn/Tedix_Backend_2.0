import { PrismaService } from '../prisma/prisma.service';

/**
 * Which db/changes the connected database has (see docs/DB_CHANGES.md), so the same code runs
 * before and after a change is applied. A change, once seen, is remembered for the process.
 */
const seen = new Set<string>();

const CHECKS: Record<string, string> = {
  // 001: exercises table (old exercise/question tables became views)
  exercises: `SELECT to_regclass('exercises') IS NOT NULL AS ok`,
  // 003: exercises.position / needs_review
  exerciseOrder: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'exercises' AND column_name = 'position') AS ok`,
};

export type DbChange = keyof typeof CHECKS;

export async function hasDbChange(prisma: Pick<PrismaService, '$queryRawUnsafe'>, change: DbChange): Promise<boolean> {
  if (seen.has(change)) return true;
  const [row] = await prisma.$queryRawUnsafe<{ ok: boolean }[]>(CHECKS[change]);
  if (row?.ok) seen.add(change);
  return !!row?.ok;
}
