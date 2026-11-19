import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { ListSubheader } from '@mui/material';
import { Menu, useCanAccess, useSidebarState } from 'react-admin';
import { LEVEL_ORDER } from './contents/levels';

/** Left menu with the "Contents" group of the old ActiveAdmin menu. */
export function AppMenu() {
  const [open] = useSidebarState();
  const { canAccess: canSeeContents } = useCanAccess({ resource: 'contents', action: 'list' });
  return (
    <Menu>
      <Menu.DashboardItem />
      {canSeeContents && open && <ListSubheader sx={{ lineHeight: '32px', bgcolor: 'transparent' }}>Contents</ListSubheader>}
      {canSeeContents && <Menu.Item to="/contents" primaryText="Contents tree" leftIcon={<AccountTreeIcon />} />}
      {LEVEL_ORDER.map((key) => (
        <Menu.ResourceItem key={key} name={key} />
      ))}
      {open && <ListSubheader sx={{ lineHeight: '32px', bgcolor: 'transparent' }}>Admin</ListSubheader>}
      <Menu.ResourceItem name="admin_users" />
      <Menu.ResourceItem name="roles" />
    </Menu>
  );
}

