import InsightsIcon from '@mui/icons-material/Insights';
import { ANALYTICS_PAGES } from './analytics/AnalyticsPage';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import { Divider, Typography } from '@mui/material';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { Collapse, List, ListItemButton, ListItemText } from '@mui/material';
import { ReactNode, useState } from 'react';
import { Menu, useCanAccess, useSidebarState } from 'react-admin';
import { useLocation } from 'react-router-dom';
import { MENU_GROUPS, RESOURCES } from '../../api/src/admin/records/defs';
import { getSession } from './api';
import { canAccess } from './authProvider';
import { LEVEL_ORDER } from './contents/levels';

type Entry = { resource: string; priority: number } | { route: string; label: string; icon: ReactNode; permission: string; priority: number };

/** The old ActiveAdmin menu: groups in their old order, pages by their old priority. */
function menuEntries(): Map<string, Entry[]> {
  const groups = new Map<string, Entry[]>(MENU_GROUPS.map((g) => [g, []]));
  const add = (group: string, entry: Entry) => (groups.get(group) ?? groups.set(group, []).get(group)!).push(entry);
  add('User Management', { resource: 'roles', priority: 1 });
  add('User Management', { resource: 'admin_users', priority: 2 });
  add('Contents', { route: '/contents', label: 'Contents tree', icon: <AccountTreeIcon />, permission: 'contents', priority: 0 });
  LEVEL_ORDER.forEach((key, i) => add('Contents', { resource: key, priority: i + 1 }));
  add('Notifications', { resource: 'notifications', priority: 1 });
  ANALYTICS_PAGES.forEach((p, i) =>
    add('Analytics', { route: `/analytics/${p.key}`, label: p.label, icon: <InsightsIcon />, permission: 'analytics', priority: i + 1 }),
  );
  for (const def of RESOURCES) if (!def.hidden) add(def.group, { resource: def.key, priority: def.priority });
  for (const list of groups.values()) list.sort((a, b) => a.priority - b.priority);
  return groups;
}

const ENTRIES = menuEntries();
const OPEN_KEY = 'tedix_admin_menu_open';

function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function RouteItem({ entry }: { entry: Extract<Entry, { route: string }> }) {
  const { canAccess } = useCanAccess({ resource: entry.permission, action: 'list' });
  if (!canAccess) return null;
  return <Menu.Item to={entry.route} primaryText={entry.label} leftIcon={entry.icon} />;
}

/** One collapsible group; hidden when the admin's role can open none of its pages. */
function Group({ name, entries, open, onToggle }: { name: string; entries: Entry[]; open: boolean; onToggle: () => void }) {
  const [sidebarOpen] = useSidebarState();
  const session = getSession();
  if (!entries.some((e) => canAccess(session, 'list', 'resource' in e ? e.resource : e.permission))) return null;
  const items = entries.map((entry) =>
    'resource' in entry ? <Menu.ResourceItem key={entry.resource} name={entry.resource} /> : <RouteItem key={entry.route} entry={entry} />,
  );
  if (!sidebarOpen) return <>{items}</>;
  return (
    <>
      <ListItemButton onClick={onToggle} dense sx={{ pl: 2, color: 'text.secondary' }}>
        <ListItemText primary={name} primaryTypographyProps={{ variant: 'overline', lineHeight: 1.6 }} />
        {open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
      </ListItemButton>
      <Collapse in={open} timeout="auto">
        <List disablePadding>{items}</List>
      </Collapse>
    </>
  );
}

export function AppMenu() {
  const location = useLocation();
  const [open, setOpen] = useState<Record<string, boolean>>(readOpen);
  const activeGroup = [...ENTRIES].find(([, entries]) =>
    entries.some((e) => location.pathname.startsWith(`/${'resource' in e ? e.resource : e.route.slice(1)}`)),
  )?.[0];
  const toggle = (name: string) => {
    const next = { ...open, [name]: !(open[name] ?? name === activeGroup) };
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch {
      // Storage blocked: the menu just forgets which groups were open.
    }
  };
  return (
    <Menu>
      <Menu.DashboardItem />
      <PinnedSection title="Contents">
        <RouteItem entry={{ route: '/contents', label: 'Curriculum', icon: <MenuBookOutlinedIcon />, permission: 'contents', priority: 0 }} />
        <Menu.ResourceItem name="countries" />
      </PinnedSection>
      <PinnedSection title="Languages">
        <Menu.ResourceItem name="languages" />
      </PinnedSection>
      <Divider sx={{ my: 1 }} />
      {[...ENTRIES].filter(([name, entries]) => entries.length && !PINNED_GROUPS.has(name)).map(([name, entries]) => (
        <Group key={name} name={name} entries={entries} open={open[name] ?? name === activeGroup} onToggle={() => toggle(name)} />
      ))}
    </Menu>
  );
}

/** The groups the new design shows first, always open; their other pages are reached from Curriculum. */
const PINNED_GROUPS = new Set(['Contents', 'Languages']);

function PinnedSection({ title, children }: { title: string; children: ReactNode }) {
  const [sidebarOpen] = useSidebarState();
  return (
    <>
      {sidebarOpen && (
        <Typography variant="overline" color="text.secondary" sx={{ px: 2, pt: 1, display: 'block', letterSpacing: '.08em', lineHeight: 2 }}>{title}</Typography>
      )}
      {children}
    </>
  );
}
