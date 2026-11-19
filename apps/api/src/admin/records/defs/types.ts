/**
 * Declarative descriptions of the admin resources migrated from ActiveAdmin.
 * Shared by the API (generic list/show/create/update/delete over the Rails tables) and the
 * admin panel (generic pages). Pure data: no Nest or React imports here.
 */

export type FieldType =
  | 'string'
  | 'text'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'reference'
  /** Several references: an array column, or a join table (`through`). */
  | 'references'
  | 'enum'
  | 'json'
  | 'duration'
  | 'image'
  | 'file'
  | 'url'
  /** Rich text (HTML), edited as text and shown rendered. */
  | 'html';

export interface Choice {
  id: string | number;
  name: string;
}

export interface FieldDef {
  /** Key in the API record (camelCase). */
  name: string;
  /** Database column. Defaults to the snake_case of `name`. Not set for computed fields. */
  column?: string;
  /** Read-only SQL expression over the resource's FROM (alias `t` is the main table). */
  expr?: string;
  label?: string;
  type: FieldType;
  /** For references: the panel resource it points at, its table and the column shown. */
  ref?: { resource?: string; table: string; labelColumn: string; labelExpr?: string };
  /** For `references` kept in a join table: its name, the column pointing here and the one pointing at `ref`. */
  through?: { table: string; ownColumn: string; otherColumn: string };
  /** For enums: stored value and label. */
  choices?: Choice[];
  /** Enum stored as an array column (several values). */
  multiple?: boolean;
  /** Shown in the list (default true for the first columns). */
  list?: boolean;
  /** Shown on the detail page (default true). */
  show?: boolean;
  /** In the form: true (editable), 'readonly' (shown but disabled), 'create' (only on create), false. */
  form?: boolean | 'readonly' | 'create';
  /** Offered as a list filter. */
  filter?: boolean;
  sortable?: boolean;
  required?: boolean;
  /** Length for text, value for numbers. */
  min?: number;
  max?: number;
  /** Numbers: strictly greater than. */
  gt?: number;
  pattern?: { regex: string; message: string };
  unique?: { scope?: string[]; caseSensitive?: boolean; message?: string };
  normalize?: 'squish' | 'upcase' | 'downcase' | 'strip';
  hint?: string;
  /** Files: Active Storage attachment name (defaults to the column-style name), accepted types, size. */
  attachment?: string;
  accept?: string[];
  /** Message when the file type is not accepted (after the label). */
  acceptMessage?: string;
  maxMb?: number;
  /** Default value for new records. */
  defaultValue?: unknown;
  /** Only shown, required and saved while another field has one of these values. */
  when?: { field: string; in: Array<string | number | boolean> };
}

/** Records of another resource listed on this one's detail page, with an "Add" button. */
export interface ChildList {
  resource: string;
  /** Field on the child that points at this record. */
  field: string;
  label: string;
  /** Child fields shown as columns. */
  columns: string[];
}

export type MenuGroup =
  | 'User Management'
  | 'Cities and Schools'
  | 'Contents'
  | 'Gamification'
  | 'Analytics'
  | 'Subscription'
  | 'Notifications'
  | 'Leadership'
  | 'Leaderboard'
  | 'Languages'
  | 'Support and Legal'
  | 'Terms and Conditions'
  | 'Evaluation';

export interface Dependent {
  table: string;
  column: string;
  label: string;
  /** Polymorphic: the type column and the Rails class name stored in it. */
  typeColumn?: string;
  typeValue?: string;
}

export interface ResourceDef {
  /** Panel resource and URL: /admin/api/<key>. */
  key: string;
  table: string;
  /** Extra joins after `FROM <table> t` for computed fields. */
  joins?: string;
  /** ActiveAdmin `scoped_collection`: fixed SQL condition on alias `t`; other records are not reachable. */
  scope?: string;
  label: string;
  singular: string;
  group: MenuGroup;
  priority: number;
  /** Permission key from the Rails CanCan rules (see ability.ts). */
  permission: string;
  /** Rails class name, for Active Storage attachments. */
  railsClass?: string;
  /** Actions beyond list and show. */
  actions: Array<'create' | 'edit' | 'delete'>;
  fields: FieldDef[];
  defaultSort?: { field: string; order: 'ASC' | 'DESC' };
  /** Columns the search box looks in. */
  search?: string[];
  /** Field shown when another page refers to a record of this resource. */
  representation?: string;
  /** acts_as_list: records can be moved up and down within the scope column. */
  position?: { scope?: string };
  /** Rails `dependent: :restrict_with_error`: delete is refused while any exists. */
  restrictDependents?: Dependent[];
  /** Rails `dependent: :destroy` / `:delete_all`: removed together with the record. */
  destroyDependents?: Dependent[];
  /** Only one record may exist (Rails validation on create); the message shown otherwise. */
  singleton?: string;
  /** Short note shown above the list (for example what is still to migrate). */
  note?: string;
  /** Not in the left menu (ActiveAdmin `menu false`): reached from links on other pages. */
  hidden?: boolean;
  children?: ChildList[];
}

/** Column name for a field. */
export function columnOf(field: FieldDef): string {
  return field.column ?? field.name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export const timestamps = (): FieldDef[] => [
  { name: 'createdAt', type: 'datetime', form: false, list: false, filter: true },
  { name: 'updatedAt', type: 'datetime', form: false, list: false, filter: true },
];
