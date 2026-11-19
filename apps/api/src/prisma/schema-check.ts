import { Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Compares the Prisma models with the real database (the restored Rails tables) and logs
 * any table or column the app expects but the database lacks. Read-only.
 */
export async function checkSchema(prisma: PrismaClient, logger: Logger): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()`;
  const columns = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!columns.has(row.table_name)) columns.set(row.table_name, new Set());
    columns.get(row.table_name)!.add(row.column_name);
  }
  const problems: string[] = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    const table = model.dbName ?? model.name;
    const present = columns.get(table);
    if (!present) {
      problems.push(`table ${table} is missing`);
      continue;
    }
    for (const field of model.fields) {
      if (field.kind !== 'scalar') continue;
      const column = field.dbName ?? field.name;
      if (!present.has(column)) problems.push(`column ${table}.${column} is missing`);
    }
  }
  const total = Prisma.dmmf.datamodel.models.length;
  if (problems.length) logger.warn(`Schema check: ${problems.length} problem(s): ${problems.join('; ')}`);
  else logger.log(`Schema check: all ${total} tables the app uses match the database (${columns.size} tables in total)`);
  return problems;
}
