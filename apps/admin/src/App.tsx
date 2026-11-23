import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import BadgeIcon from '@mui/icons-material/Badge';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ListAltIcon from '@mui/icons-material/ListAlt';
import PublicIcon from '@mui/icons-material/Public';
import { Route } from 'react-router-dom';
import { AnalyticsPage } from './analytics/AnalyticsPage';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { NotificationCreate, NotificationEdit, NotificationList, NotificationShow } from './resources/notifications';
import { Admin, CustomRoutes, Layout, LayoutProps, Resource } from 'react-admin';
import { authProvider } from './authProvider';
import { ContentsTree } from './contents/ContentsTree';
import { LEVEL_ORDER, LEVELS } from './contents/levels';
import { CONTENT_PAGES } from './contents/pages';
import { Dashboard } from './Dashboard';
import { dataProvider } from './dataProvider';
import { LoginPage } from './LoginPage';
import { AppMenu } from './Menu';
import { RESOURCES } from '../../api/src/admin/records/defs';
import { pagesFor } from './records/pages';
import { MicroLessonShow } from './workspace/MicroLessonWorkspace';
import { AdminUserCreate, AdminUserEdit, AdminUserList, AdminUserShow } from './resources/adminUsers';
import { RoleEdit, RoleList, RoleShow } from './resources/roles';

const AppLayout = (props: LayoutProps) => <Layout {...props} menu={AppMenu} />;

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
      layout={AppLayout}
      requireAuth
      disableTelemetry
    >
      <CustomRoutes>
        <Route path="/contents" element={<ContentsTree />} />
        <Route path="/analytics/:page" element={<AnalyticsPage />} />
      </CustomRoutes>
      {LEVEL_ORDER.map((key) => (
        <Resource
          key={key}
          name={key}
          options={{ label: LEVELS[key].plural }}
          icon={key === 'countries' ? PublicIcon : FolderOpenIcon}
          {...CONTENT_PAGES[key]}
          recordRepresentation="name"
        />
      ))}
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
      <Resource
        name="notifications"
        icon={NotificationsIcon}
        list={NotificationList}
        show={NotificationShow}
        create={NotificationCreate}
        edit={NotificationEdit}
      />
      {RESOURCES.map((def) => (
        <Resource
          key={def.key}
          name={def.key}
          options={{ label: def.label }}
          icon={ListAltIcon}
          {...pagesFor(def)}
          {...(def.key === 'micro_lessons' ? { show: MicroLessonShow } : {})}
          recordRepresentation={def.representation ?? 'id'}
        />
      ))}
    </Admin>
  );
}
