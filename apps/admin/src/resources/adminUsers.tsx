import { Box, Typography } from '@mui/material';
import {
  BooleanField,
  Button,
  Create,
  Datagrid,
  DateField,
  Edit,
  List,
  NullableBooleanInput,
  PasswordInput,
  ReferenceField,
  ReferenceInput,
  required,
  SearchInput,
  SelectInput,
  Show,
  SimpleForm,
  SimpleShowLayout,
  TextField,
  TextInput,
  TopToolbar,
  EditButton,
  DeleteButton,
  useCanAccess,
  useNotify,
  useRecordContext,
  useRefresh,
} from 'react-admin';
import { apiFetch } from '../api';

const filters = [
  <SearchInput key="q" source="q" alwaysOn />,
  <NullableBooleanInput key="2fa" source="twoFactorEnabled" label="2FA enabled" />,
];

export const AdminUserList = () => (
  <List filters={filters} sort={{ field: 'id', order: 'ASC' }}>
    <Datagrid rowClick="show">
      <TextField source="id" />
      <TextField source="role.name" label="Role" sortable={false} />
      <TextField source="email" />
      <BooleanField source="twoFactorEnabled" label="2FA enabled" />
    </Datagrid>
  </List>
);

interface AdminUserRecord {
  id: number;
  email: string;
  twoFactorEnabled: boolean;
  twoFactorSetup?: { secret: string; qrCodeSvg: string };
}

function TwoFactorButton() {
  const record = useRecordContext<AdminUserRecord>();
  const notify = useNotify();
  const refresh = useRefresh();
  const { canAccess } = useCanAccess({ action: 'edit', resource: 'admin_users' });
  if (!record || !canAccess) return null;
  const enabling = !record.twoFactorEnabled;

  async function toggle() {
    const prompt = enabling
      ? 'Enable 2FA for this admin user?'
      : 'Disable 2FA for this admin user? This removes their 2FA setup.';
    if (!window.confirm(prompt)) return;
    try {
      await apiFetch(`/admin_users/${record!.id}/${enabling ? 'enable_2fa' : 'disable_2fa'}`, { method: 'POST' });
      notify(enabling ? '2FA was enabled' : '2FA was disabled', { type: 'success' });
      refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed', { type: 'error' });
    }
  }

  return <Button label={enabling ? 'Enable 2FA' : 'Disable 2FA'} onClick={toggle} />;
}

function TwoFactorPanel() {
  const record = useRecordContext<AdminUserRecord>();
  if (!record?.twoFactorSetup) return null;
  return (
    <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
      <Typography variant="h6">Two-factor authentication</Typography>
      <Box sx={{ width: 180, my: 1 }} dangerouslySetInnerHTML={{ __html: record.twoFactorSetup.qrCodeSvg }} />
      <Typography variant="body2">Scan this QR code with an authenticator app (Google Authenticator, Authy, etc.).</Typography>
      <Typography variant="body2">
        Or enter this secret manually: <code>{record.twoFactorSetup.secret}</code>
      </Typography>
    </Box>
  );
}

const ShowActions = () => (
  <TopToolbar>
    <TwoFactorButton />
    <EditButton />
    <DeleteButton mutationMode="pessimistic" />
  </TopToolbar>
);

export const AdminUserShow = () => (
  <Show actions={<ShowActions />}>
    <SimpleShowLayout>
      <TextField source="id" />
      <ReferenceField source="roleId" reference="roles" label="Role" link={false} />
      <TextField source="email" />
      <BooleanField source="twoFactorEnabled" label="2FA enabled" />
      <DateField source="createdAt" showTime />
      <DateField source="updatedAt" showTime />
      <TwoFactorPanel />
    </SimpleShowLayout>
  </Show>
);

/** The Rails form only offers the Admin role. */
const roleFilter = { q: 'admin' };

function AdminUserForm({ isNew }: { isNew: boolean }) {
  return (
    <SimpleForm>
      <ReferenceInput source="roleId" reference="roles" filter={roleFilter}>
        <SelectInput optionText="name" validate={required()} label="Role" />
      </ReferenceInput>
      <TextInput source="email" type="email" validate={required()} />
      <PasswordInput
        source="password"
        validate={isNew ? required() : undefined}
        helperText={isNew ? '6 to 20 characters, no spaces' : 'Leave blank to keep the current password'}
      />
      <PasswordInput source="passwordConfirmation" validate={isNew ? required() : undefined} />
    </SimpleForm>
  );
}

export const AdminUserCreate = () => (
  <Create redirect="show">
    <AdminUserForm isNew />
  </Create>
);

export const AdminUserEdit = () => (
  <Edit mutationMode="pessimistic" redirect="show">
    <AdminUserForm isNew={false} />
  </Edit>
);
