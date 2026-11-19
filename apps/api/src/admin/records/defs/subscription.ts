import { labelEnum, REF, ref, stringEnum } from './refs';
import { ResourceDef, timestamps } from './types';

export const SUBSCRIPTION: ResourceDef[] = [
  {
    key: 'subscription_plans',
    table: 'bx_block_stripe_integration_plans',
    label: 'Subscription Plans',
    singular: 'Subscription Plan',
    group: 'Subscription',
    priority: 1,
    permission: 'subscription_plans',
    // Plans are never deleted: they are deactivated (the Stripe price is switched off).
    actions: ['create', 'edit'],
    search: ['name'],
    representation: 'name',
    fields: [
      { name: 'name', type: 'string', required: true, min: 2, max: 100, normalize: 'squish', unique: { caseSensitive: false }, filter: true, form: 'create' },
      { name: 'interval', type: 'enum', choices: labelEnum({ Monthly: 0, Annual: 1 }), required: true, filter: true, form: 'create' },
      { name: 'intervalCount', type: 'integer', required: true, gt: 0, filter: true, form: 'create', defaultValue: 1 },
      { name: 'priceCents', label: 'Price (€)', type: 'integer', required: true, min: 0, filter: true, form: 'create' },
      { name: 'description', type: 'text', required: true, max: 255, list: false },
      { name: 'active', type: 'boolean', filter: true, form: 'edit', hint: 'Turning this off deactivates the plan price in Stripe' },
      { name: 'stripePriceId', label: 'Stripe price ID', type: 'string', form: false, list: false },
      { name: 'stripeProductId', label: 'Stripe product ID', type: 'string', form: false, list: false },
      ...timestamps(),
    ],
  },
  {
    key: 'user_subscriptions',
    table: 'bx_block_stripe_integration_subscriptions',
    joins: 'LEFT JOIN bx_block_profile_profiles p ON p.account_id = t.account_id',
    label: 'User Subscriptions',
    singular: 'User Subscription',
    group: 'Subscription',
    priority: 2,
    permission: 'user_subscriptions',
    actions: [],
    defaultSort: { field: 'id', order: 'DESC' },
    fields: [
      ref('accountId', REF.account, { label: 'Email' }),
      { name: 'userName', label: 'Username', expr: 'p.user_name', type: 'string', filter: true },
      ref('planId', REF.plan, { label: 'Plan' }),
      { name: 'paymentMethodId', type: 'string', list: false },
      { name: 'status', type: 'enum', choices: stringEnum('active', 'pending', 'failed', 'canceled'), filter: true },
      { name: 'autoRenewal', type: 'boolean', filter: true },
      { name: 'startDate', type: 'date', filter: true },
      { name: 'endDate', type: 'date', filter: true },
      { name: 'stripeId', label: 'Stripe ID', type: 'string', list: false },
      { name: 'cancelDate', type: 'datetime', list: false, hint: 'Empty when no cancellation is scheduled' },
      ...timestamps(),
    ],
  },
];
