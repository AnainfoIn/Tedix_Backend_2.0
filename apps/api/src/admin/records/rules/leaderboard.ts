import { registerHooks, ResourceHooks } from '../hooks';

/**
 * Rails ClaimableReward + prevent_edit_when_finalized on the reward allocation models.
 * `finalized` are the statuses after which a claim can no longer change.
 */
function claimHooks(finalized: number[], closedCheck?: { table: string; column: string; message: string }): ResourceHooks {
  return {
    async validate({ prisma }, { values, current, add }) {
      if (!current) return;
      if (finalized.includes(Number(current.status))) {
        add('base', 'Reward has already been finalized and cannot be edited');
        return;
      }
      // claim_submitted?: moving to approved needs the student's shipping details.
      if (Number(values.status) === 1 && Number(current.status) !== 1) {
        const required: Array<[string, string]> = [
          ['fullName', 'Full name'], ['email', 'Email'], ['phone', 'Phone'], ['addressLine1', 'Address line1'],
          ['city', 'City'], ['country', 'Country'], ['postalCode', 'Postal code'],
        ];
        for (const [key, label] of required) {
          if (current[key] == null || String(current[key]).trim() === '') add('base', `${label} can't be blank`);
        }
        const email = current.email as string | null;
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) add('base', 'Email must be a valid email address');
      }
      if (closedCheck) {
        const id = current[closedCheck.column.replace(/_([a-z])/g, (_, x: string) => x.toUpperCase())];
        if (id != null) {
          const [row] = await prisma.$queryRawUnsafe<{ status: number }[]>(`SELECT status FROM ${closedCheck.table} WHERE id = $1`, BigInt(id as number));
          if (row && Number(row.status) !== 2) add('base', closedCheck.message);
        }
      }
    },
  };
}

registerHooks(
  'campaign_reward_claims',
  claimHooks([2, 3, 4], { table: 'campaigns', column: 'campaign_id', message: 'Rewards can only be allocated once the campaign is closed' }),
);
registerHooks('monthly_reward_claims', claimHooks([2]));
registerHooks(
  'tip_reward_claims',
  claimHooks([2, 3, 4], { table: 'tip_competitions', column: 'tip_competition_id', message: 'Rewards can only be assigned once the TIP competition is closed' }),
);
