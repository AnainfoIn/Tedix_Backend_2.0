import { FieldDef } from './types';

/** References used across many resources: the panel resource, table and column shown. */
export const REF = {
  account: { resource: 'app_users', table: 'accounts', labelColumn: 'email' },
  country: { resource: 'countries', table: 'account_block_countries', labelColumn: 'name' },
  city: { resource: 'cities', table: 'account_block_cities', labelColumn: 'name' },
  school: { resource: 'schools', table: 'account_block_schools', labelColumn: 'name' },
  grade: { resource: 'grades', table: 'categories', labelColumn: 'name' },
  subject: { resource: 'subjects', table: 'sub_categories', labelColumn: 'name' },
  master: { resource: 'masters', table: 'bx_block_profile_courses', labelColumn: 'course_name' },
  main: { resource: 'mains', table: 'bx_block_profile_mains', labelColumn: 'name' },
  unit: { resource: 'units', table: 'bx_block_profile_units', labelColumn: 'name' },
  lesson: { resource: 'lessons', table: 'bx_block_profile_lessons', labelColumn: 'name' },
  microLesson: { resource: 'micro_lessons', table: 'bx_block_profile_micro_lessons', labelColumn: 'name' },
  language: { resource: 'languages', table: 'bx_block_language_options_languages', labelColumn: 'name' },
  role: { resource: 'roles', table: 'roles', labelColumn: 'name' },
  rewardGift: { resource: 'reward_gifts', table: 'reward_gifts', labelColumn: 'name' },
  shield: { resource: 'shields', table: 'shields', labelColumn: 'name' },
  shadowCategory: { resource: 'shadow_categories', table: 'shadow_categories', labelColumn: 'name' },
  plan: { resource: 'subscription_plans', table: 'bx_block_stripe_integration_plans', labelColumn: 'name' },
  campaign: { resource: 'campaigns', table: 'campaigns', labelColumn: 'name' },
  tipCompetition: { resource: 'tip_competitions', table: 'tip_competitions', labelColumn: 'title' },
  monthlyRewardConfig: { resource: 'monthly_reward_configs', table: 'monthly_reward_configs', labelColumn: 'id' },
} satisfies Record<string, FieldDef['ref']>;

export const ref = (name: string, target: NonNullable<FieldDef['ref']>, extra: Partial<FieldDef> = {}): FieldDef => ({
  name,
  type: 'reference',
  ref: target,
  filter: true,
  ...extra,
});

/** Rails `enum x: %i[a b c]` (stored as 0, 1, 2) as choices with humanized labels. */
export const indexEnum = (...names: string[]) => names.map((n, i) => ({ id: i, name: titleize(n) }));
/** Rails `enum x: { a: 'a' }` or string columns with fixed values. */
export const stringEnum = (...names: string[]) => names.map((n) => ({ id: n, name: titleize(n) }));
/** Rails `enum x: { a: 3, b: 7 }`. */
export const mapEnum = (map: Record<string, number | string>) => Object.entries(map).map(([n, id]) => ({ id, name: titleize(n) }));

export function titleize(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** draft / published / closed (campaigns, weekly challenges, TIP competitions). */
export const STATUS_CHOICES = [
  { id: 0, name: 'Draft' },
  { id: 1, name: 'Published' },
  { id: 2, name: 'Closed' },
];

/** Image rules shared by many Rails models: JPEG or PNG, at most 5 MB. */
export const IMAGE_RULES = {
  accept: ['image/jpeg', 'image/jpg', 'image/png'],
  acceptMessage: 'must be a valid image format (jpeg, jpg, png)',
  maxMb: 5,
};

/** Choices from Rails `*_LABELS` constants: label → stored value, labels kept as written. */
export const labelEnum = (map: Record<string, number | string>) => Object.entries(map).map(([name, id]) => ({ id, name }));
