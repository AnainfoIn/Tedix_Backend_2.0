import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import BadgeIcon from '@mui/icons-material/Badge';
import { Admin, Resource } from 'react-admin';
import { authProvider } from './authProvider';
import { Dashboard } from './Dashboard';
import { dataProvider } from './dataProvider';
import { LoginPage } from './LoginPage';
import { AdminUserCreate, AdminUserEdit, AdminUserList, AdminUserShow } from './resources/adminUsers';
import { RoleEdit, RoleList, RoleShow } from './resources/roles';

/**
 * Tedix admin panel. Each module migrated from ActiveAdmin adds its <Resource> here.
 * Served at /admin (see vite.config.ts `base`) with hash routes, e.g. /admin/#/roles.
 */
export function App() {
  return (
    <Admin
      title="Tedix Admin"
      authProvider={authProvider}
      dataProvider={dataProvider}
      loginPage={LoginPage}
      dashboard={Dashboard}
      requireAuth
      disableTelemetry
    >
      <Resource
        name="admin_users"
        options={{ label: 'Admin Users' }}
        icon={AdminPanelSettingsIcon}
        list={AdminUserList}
        show={AdminUserShow}
        create={AdminUserCreate}
        edit={AdminUserEdit}
        recordRepresentation="email"
      />
      <Resource
        name="roles"
        icon={BadgeIcon}
        list={RoleList}
        show={RoleShow}
        edit={RoleEdit}
        recordRepresentation="name"
      />
    </Admin>
  );
}
