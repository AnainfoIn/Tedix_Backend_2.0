import { GAMIFICATION } from './gamification';
import { LEADERBOARD } from './leaderboard';
import { LEADERSHIP } from './leadership';
import { PEOPLE } from './people';
import { SUPPORT } from './support';
import { MenuGroup, ResourceDef } from './types';

export * from './types';

/** Every generic resource, in no particular order (the menu orders them). */
export const RESOURCES: ResourceDef[] = [...PEOPLE, ...GAMIFICATION, ...LEADERSHIP, ...LEADERBOARD, ...SUPPORT];

export const RESOURCE_BY_KEY: Record<string, ResourceDef> = Object.fromEntries(RESOURCES.map((r) => [r.key, r]));

/** Left menu groups in the order of the old ActiveAdmin menu (by `menu priority`). */
export const MENU_GROUPS: MenuGroup[] = [
  'User Management',
  'Cities and Schools',
  'Contents',
  'Gamification',
  'Analytics',
  'Subscription',
  'Notifications',
  'Leadership',
  'Leaderboard',
  'Languages',
  'Support and Legal',
];
