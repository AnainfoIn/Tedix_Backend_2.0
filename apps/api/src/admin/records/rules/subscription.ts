import { baseError } from '../../../common/validation-error';
import { registerHooks } from '../hooks';
import { fakeStripeId, StripeError, stripeConfigured, stripePost, stripeStubbed } from './stripe';

const INTERVALS = ['month', 'year'];

/** BxBlockStripeIntegration::Plan callbacks: Stripe product and price on create, product sync, price (de)activation. */
registerHooks('subscription_plans', {
  async beforeSave(_ctx, { data, values, current }) {
    try {
      if (!current) {
        // before_create :create_stripe_reference
        if (stripeStubbed()) {
          data.stripe_price_id = fakeStripeId('price');
          data.stripe_product_id = fakeStripeId('product');
          return;
        }
        if (!stripeConfigured()) baseError('Stripe is not configured. Please set STRIPE_SECRET_KEY before creating a subscription plan.');
        const product = await stripePost('products', { name: values.name, description: values.description || undefined });
        const price = await stripePost('prices', {
          unit_amount: values.priceCents,
          currency: 'eur',
          recurring: { interval: INTERVALS[Number(values.interval)], interval_count: values.intervalCount },
          product: product.id,
        });
        data.stripe_product_id = product.id;
        data.stripe_price_id = price.id;
        return;
      }
      if (stripeStubbed()) return;
      // after_update :sync_stripe_product
      const renamed = values.name !== current.name || values.description !== current.description;
      if (renamed && current.stripeProductId) {
        if (!stripeConfigured()) baseError('Stripe is not configured. Cannot sync subscription plan update.');
        await stripePost(`products/${current.stripeProductId}`, { name: values.name, description: values.description || undefined });
      }
      // member_action :toggle_status → Plan#activate / #deactivate
      if ('active' in data && !!data.active !== !!current.active && current.stripePriceId) {
        if (!stripeConfigured()) baseError(`Cannot ${data.active ? 'activate' : 'deactivate'}: Stripe is not configured`);
        await stripePost(`prices/${current.stripePriceId}`, { active: !!data.active });
      }
    } catch (e) {
      if (!(e instanceof StripeError)) throw e;
      baseError(current ? `Stripe product sync failed: ${e.message}` : `Stripe price-product creation failed: ${e.message}`);
    }
  },
});
