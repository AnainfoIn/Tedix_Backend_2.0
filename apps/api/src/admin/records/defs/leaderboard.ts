import { labelEnum, REF, ref } from './refs';
import { FieldDef, ResourceDef, timestamps } from './types';
import { PRIZE_CHOICES } from './leadership';

/** Claim statuses of campaign and TIP allocations (Rails `enum status`). */
const SHIPPING_STATUSES = labelEnum({ Pending: 0, Approved: 1, Shipped: 2, Delivered: 3, Credited: 4 });
const MONTHLY_STATUSES = labelEnum({ Pending: 0, Claimed: 1, Credited: 2 });

const METRIC_CHOICES = labelEnum({
  'Best Focused Student': 0, 'Improver of the Month': 1, 'Finest Weekly Challenger': 2, 'Best Puzzle Mixer': 3,
  'Training Champion': 4, 'Challenger of the Month': 5, 'Performer of the Month': 6, 'Best Achiever': 7, 'Best Shadow Finder': 8,
});

/** Filter "Email" (Rails `filter :account_email`). */
const accountEmail: FieldDef = { name: 'accountEmail', label: 'Email', expr: 'acc.email', type: 'string', filter: true, list: false, show: false, form: false };
const ACCOUNT_JOIN = 'LEFT JOIN accounts acc ON acc.id = t.account_id';

/** Shipping details filled in by the student when claiming, then the admin's status and tracking number. */
const claimFields = (statuses: typeof SHIPPING_STATUSES): FieldDef[] => [
  { name: 'fullName', type: 'string', form: false },
  { name: 'email', type: 'string', form: false },
  { name: 'phone', type: 'string', form: false },
  { name: 'addressLine1', label: 'Address line 1', type: 'string', form: false, list: false },
  { name: 'addressLine2', label: 'Address line 2', type: 'string', form: false, list: false },
  { name: 'city', type: 'string', form: false, list: false },
  { name: 'country', type: 'string', form: false, list: false },
  { name: 'postalCode', type: 'string', form: false, list: false },
  { name: 'status', type: 'enum', choices: statuses, required: true, filter: true },
  { name: 'trackingNumber', type: 'string' },
  { name: 'claimedAt', type: 'datetime', form: false, list: false },
  ...timestamps(),
];

const claims = (def: Omit<ResourceDef, 'group' | 'actions' | 'scope' | 'joins' | 'defaultSort'>): ResourceDef => ({
  group: 'Leaderboard',
  actions: ['edit'],
  // ActiveAdmin scoped_collection: pending (unclaimed) allocations are not listed.
  scope: 't.status <> 0',
  joins: ACCOUNT_JOIN,
  defaultSort: { field: 'id', order: 'DESC' },
  ...def,
});

export const LEADERBOARD: ResourceDef[] = [
  claims({
    key: 'campaign_reward_claims',
    table: 'campaign_reward_allocations',
    label: 'Campaign Reward Claims',
    singular: 'Campaign Reward Claim',
    priority: 1,
    permission: 'campaign_reward_allocations',
    railsClass: 'BxBlockEducationalGamification::CampaignRewardAllocation',
    fields: [
      accountEmail,
      ref('accountId', REF.account, { label: 'Account', form: false, filter: false }),
      ref('campaignId', REF.campaign, { label: 'Campaign', form: false, filter: false }),
      ref('campaignRewardId', { resource: 'campaign_rewards', table: 'campaign_rewards', labelColumn: 'id', labelExpr: `'Campaign reward #' || id` }, { label: 'Campaign reward', form: false, filter: false, list: false }),
      { name: 'rewardType', type: 'enum', choices: labelEnum({ 'XP Points Ranking': 0, 'Quick Solver': 1, 'Five in a Row': 2, 'Best per Minute': 3 }), form: false, filter: true },
      { name: 'prizeType', type: 'enum', choices: PRIZE_CHOICES, form: false, list: false },
      { name: 'rewardGiftName', type: 'string', form: false },
      ...claimFields(SHIPPING_STATUSES),
    ],
  }),
  claims({
    key: 'monthly_reward_claims',
    table: 'monthly_reward_allocations',
    label: 'Monthly Reward Claims',
    singular: 'Monthly Reward Claim',
    priority: 3,
    permission: 'monthly_reward_allocations',
    railsClass: 'BxBlockEducationalGamification::MonthlyRewardAllocation',
    fields: [
      accountEmail,
      ref('accountId', REF.account, { label: 'Account', form: false, filter: false }),
      { name: 'rewardGiftName', type: 'string', form: false },
      { name: 'metricType', label: 'Metric', type: 'enum', choices: METRIC_CHOICES, form: false, filter: true },
      { name: 'month', type: 'integer', form: false, list: false },
      { name: 'year', type: 'integer', form: false, list: false },
      { name: 'prizeType', type: 'enum', choices: PRIZE_CHOICES, form: false, list: false },
      ...claimFields(MONTHLY_STATUSES),
    ],
  }),
  claims({
    key: 'tip_reward_claims',
    table: 'tip_competition_reward_allocations',
    label: 'TIP Reward Claims',
    singular: 'TIP Reward Claim',
    priority: 3.1,
    permission: 'tip_competition_reward_allocations',
    railsClass: 'BxBlockEducationalGamification::TipCompetitionRewardAllocation',
    fields: [
      accountEmail,
      ref('accountId', REF.account, { label: 'Account', form: false, filter: false }),
      ref('tipCompetitionId', REF.tipCompetition, { label: 'TIP competition', form: false, filter: false }),
      ref('tipSubmissionId', { resource: 'tip_submissions', table: 'tip_submissions', labelColumn: 'id', labelExpr: `'Submission #' || id` }, { label: 'TIP submission', form: false, filter: false, list: false }),
      { name: 'rewardGiftName', type: 'string', form: false },
      { name: 'rank', type: 'integer', form: false, filter: true },
      { name: 'prizeType', type: 'enum', choices: PRIZE_CHOICES, form: false, list: false },
      ...claimFields(SHIPPING_STATUSES),
    ],
  }),
];
