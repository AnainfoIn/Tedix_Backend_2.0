import { baseError } from '../../../common/validation-error';
import { registerHooks } from '../hooks';
import { imageSize } from './image-size';
import { lifecycleHooks } from './lifecycle';

const PROMO_COLUMNS = [
  'logo_on_general_page', 'logo_on_dedicated_space', 'selected_main_pages', 'all_pages_support_promo', 'notifications_enabled',
  'puzzle_mix', 'weekly_challenge', 'training_arena', 'periodic_arena', 'special_arena',
];
const PROMO_FIELDS = PROMO_COLUMNS.map((c) => c.replace(/_([a-z])/g, (_, x: string) => x.toUpperCase()));

registerHooks('sponsors', {
  async validate({ prisma }, { values, files, current, input, add }) {
    const from = values.fromDateOfContract as Date | null;
    const to = values.toDateOfContract as Date | null;
    if (from && to && new Date(to) < new Date(from)) add('toDateOfContract', 'Contract end date must be after start date');
    const mobile = values.mobileNumber as string | null;
    // Rails uses Phonelib; this accepts international numbers of 8 to 15 digits.
    if (mobile && !/^\+?[0-9 ()-]{8,20}$/.test(mobile.trim())) add('mobileNumber', 'Mobile number must be a valid mobile number');
    const banner = files.bannerImage?.[0];
    if (banner && ['image/jpeg', 'image/png', 'image/jpg'].includes(banner.mimetype) && banner.size <= 5 * 1024 * 1024) {
      const size = imageSize(banner.buffer);
      if (!size) add('bannerImage', 'Banner image could not be processed. Please upload a valid image');
      else if (size.width < 225 || size.width > 275 || size.height < 45 || size.height > 55) {
        add('bannerImage', `Banner image must be approximately 250×50 pixels (accepted range: 225–275 × 45–55). Uploaded image: ${size.width}×${size.height} pixels`);
      }
    }
    if (PROMO_FIELDS.some((f) => values[f] === true)) {
      const removing = input.removeBannerImage === true || input.removeBannerImage === 'true';
      let attached = !!banner;
      if (!attached && current && !removing) {
        const rows = await prisma.$queryRawUnsafe<unknown[]>(
          `SELECT 1 FROM active_storage_attachments WHERE record_type = 'BxBlockEducationalGamification::Sponsor' AND record_id = $1 AND name = 'banner_image' LIMIT 1`,
          BigInt(current.id as number),
        );
        attached = rows.length > 0;
      }
      if (!attached) add('bannerImage', 'Banner image must be attached when promo options are enabled');
    }
  },
});

const campaignLifecycle = lifecycleHooks({
  noun: 'campaign',
  table: 'campaigns',
  start: 'fromDate',
  end: 'toDate',
  startByDay: true,
  locked: ['name', 'arenaType', 'sponsorIds', 'lessonSelectionMode', 'countryIds', 'cityIds', 'schoolIds', 'gradeIds', 'subjectIds', 'masterIds', 'mainIds', 'unitIds', 'lessonIds', 'audience', 'fromDate'],
  activity: [{ table: 'arena_sessions', column: 'campaign_id' }],
});

const REWARD_TYPES: Array<[number, string]> = [[0, 'XP Points Ranking'], [1, 'Quick Solver'], [2, 'Five in a Row'], [3, 'Best per Minute']];

registerHooks('campaigns', {
  async validate(ctx, args) {
    await campaignLifecycle.validate!(ctx, args);
    const { values, current, input, add } = args;
    const publishing = Number(values.status) === 1 && (current === null || ('status' in input && Number(current.status) !== 1));
    if (publishing) {
      const rows = current
        ? await ctx.prisma.$queryRawUnsafe<{ reward_type: number }[]>('SELECT DISTINCT reward_type FROM campaign_rewards WHERE campaign_id = $1', BigInt(current.id as number))
        : [];
      for (const [type, label] of REWARD_TYPES) {
        if (!rows.some((r) => Number(r.reward_type) === type)) add('base', `At least one reward must be added for ${label}.`);
      }
    }
  },
  beforeDelete: campaignLifecycle.beforeDelete,
});

/** Rewards of a closed or ended campaign cannot change (restrict_reward_changes_after_lock). */
async function guardCampaignRewards(prisma: any, campaignId: unknown) {
  if (campaignId == null) return;
  const [c] = await prisma.$queryRawUnsafe('SELECT status, to_date FROM campaigns WHERE id = $1', BigInt(campaignId as number));
  if (c && (Number(c.status) === 2 || (c.to_date && new Date(c.to_date) <= new Date()))) {
    baseError('Campaign rewards cannot be changed once the campaign is closed or has ended');
  }
}

registerHooks('campaign_rewards', {
  async validate({ prisma }, { values }) {
    await guardCampaignRewards(prisma, values.campaignId);
  },
  async beforeDelete({ prisma }, _id, current) {
    await guardCampaignRewards(prisma, current.campaignId);
  },
});

registerHooks(
  'weekly_challenges',
  lifecycleHooks({
    noun: 'weekly challenge',
    table: 'weekly_challenges',
    start: 'weekStartDate',
    end: 'weekEndDate',
    locked: ['title', 'categoryId', 'subCategoryId', 'courseId', 'mainId', 'unitId', 'lessonId', 'countryId', 'weekStartDate'],
    activity: [{ table: 'weekly_challenge_sessions', column: 'weekly_challenge_id' }],
  }),
);

const tipLifecycle = lifecycleHooks({
  noun: 'TIP competition',
  table: 'tip_competitions',
  start: 'startDate',
  end: 'endDate',
  locked: ['title', 'contentType', 'contentText', 'startDate'],
  activity: [{ table: 'tip_submissions', column: 'tip_competition_id' }],
  liveWords: 'visible to students',
});

registerHooks('tip_competitions', {
  async validate(ctx, args) {
    await tipLifecycle.validate!(ctx, args);
    const { values, files, add, current } = args;
    const file = files.contentFile?.[0];
    const type = Number(values.contentType);
    if (file && type === 1) {
      if (!['video/3gpp', 'video/mp4', 'video/x-flv'].includes(file.mimetype)) add('contentFile', 'Content file must be a valid video format (3gp, mp4, flv)');
      else if (file.size > 50 * 1024 * 1024) add('contentFile', 'Content file size must be less than 50MB');
    }
    if (file && type === 2) {
      if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.mimetype)) add('contentFile', 'Content file must be a valid image format (jpeg, jpg, png)');
      else if (file.size > 5 * 1024 * 1024) add('contentFile', 'Content file size must be less than 5MB');
    }
    if (file && current) {
      const start = current.startDate ? new Date(current.startDate as string) : null;
      if (Number(current.status) === 1 && start && start <= new Date()) add('contentFile', 'Content file cannot be changed once the TIP competition is visible to students');
    }
  },
  beforeDelete: tipLifecycle.beforeDelete,
});

registerHooks('monthly_reward_configs', {
  validate(_ctx, { current, add }) {
    if (current?.processing) add('base', 'Config is currently being processed for this cycle and cannot be edited');
  },
});
