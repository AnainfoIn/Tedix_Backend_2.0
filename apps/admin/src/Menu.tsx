import InsightsIcon from '@mui/icons-material/Insights';
import { ANALYTICS_PAGES } from './analytics/AnalyticsPage';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import { Typography } from '@mui/material';
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
/** Only Curriculum and Micro lessons are shown for now; the other pages still open by their links. */
const SHOW_OTHER_MENUS = false;
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
      <ListItemButton onClick={onToggle} dense sx={{ mx: 1.25, px: 1.5, borderRadius: 2, color: 'text.primary' }}>
        <ListItemText primary={name} primaryTypographyProps={{ fontSize: 14 }} />
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
      <PinnedSection title="Contents">
        <RouteItem entry={{ route: '/curriculum', label: 'Curriculum', icon: <MenuBookOutlinedIcon />, permission: 'lessons', priority: 0 }} />
        <RouteItem entry={{ route: '/micro-lessons', label: 'Micro lessons', icon: <ArticleOutlinedIcon />, permission: 'micro_lessons', priority: 1 }} />
        <CurriculumNote />
      </PinnedSection>
      <PinnedSection title="DataAnalytics" keepCase>
        <RouteItem entry={{ route: '/data-analytics/generated-questions', label: 'Generated', icon: <QueryStatsIcon />, permission: 'lessons', priority: 0 }} />
      </PinnedSection>
      {SHOW_OTHER_MENUS && (
        <PinnedSection title="More">
          {[...ENTRIES].filter(([, entries]) => entries.length).map(([name, entries]) => (
            <Group key={name} name={name} entries={entries} open={open[name] ?? name === activeGroup} onToggle={() => toggle(name)} />
          ))}
        </PinnedSection>
      )}
    </Menu>
  );
}

function CurriculumNote() {
  const [sidebarOpen] = useSidebarState();
  if (!sidebarOpen) return null;
  return (
    <Typography sx={{ px: 2.5, pb: 1, fontSize: 12, color: 'text.secondary', lineHeight: 1.5 }}>
      Grade → Micro Lesson. Exercises, questions and options are managed inside each micro lesson.
    </Typography>
  );
}

/** keepCase: show the title as written (DataAnalytics is a name the team uses), not in capitals. */
function PinnedSection({ title, children, keepCase }: { title: string; children: ReactNode; keepCase?: boolean }) {
  const [sidebarOpen] = useSidebarState();
  return (
    <>
      {sidebarOpen && (
        <Typography color="text.secondary" sx={{ px: 2.5, pt: 1.75, pb: 0.75, display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: keepCase ? '.02em' : '.06em', textTransform: keepCase ? 'none' : 'uppercase' }}>{title}</Typography>
      )}
      {children}
    </>
  );
}
