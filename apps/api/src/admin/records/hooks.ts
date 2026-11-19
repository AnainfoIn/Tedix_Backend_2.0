import { PrismaService } from '../../prisma/prisma.service';
import type { Files } from './records.service';

export interface HookContext {
  prisma: PrismaService;
}

export interface ValidateArgs {
  /** Column → value about to be written. Hooks may add or change entries. */
  data: Record<string, unknown>;
  /** Field name → value after the change (new or current). */
  values: Record<string, unknown>;
  input: Record<string, unknown>;
  files: Files;
  /** The record before the change, or null when creating. */
  current: Record<string, unknown> | null;
  add: (field: string, message: string) => void;
}

/** Rules from the Rails models that the field definitions cannot express. */
export interface ResourceHooks {
  validate?(ctx: HookContext, args: ValidateArgs): Promise<void> | void;
  afterSave?(ctx: HookContext, id: bigint, data: Record<string, unknown>, before: Record<string, unknown> | null): Promise<void> | void;
  beforeDelete?(ctx: HookContext, id: bigint, current: Record<string, unknown>): Promise<void> | void;
}

export const HOOKS: Record<string, ResourceHooks> = {};

export function registerHooks(key: string, hooks: ResourceHooks): void {
  HOOKS[key] = hooks;
}
