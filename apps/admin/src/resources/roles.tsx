import {
  Datagrid,
  DateField,
  Edit,
  List,
  required,
  SearchInput,
  Show,
  SimpleForm,
  SimpleShowLayout,
  TextField,
  TextInput,
} from 'react-admin';

const filters = [<SearchInput key="q" source="q" alwaysOn />];

/** Same as ActiveAdmin: list, show, edit, delete. Roles are not created from the panel. */
export const RoleList = () => (
  <List filters={filters} sort={{ field: 'id', order: 'ASC' }}>
    <Datagrid rowClick="show">
      <TextField source="id" />
      <TextField source="name" />
      <DateField source="createdAt" showTime />
    </Datagrid>
  </List>
);

export const RoleShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="id" />
      <TextField source="name" />
      <DateField source="createdAt" showTime />
      <DateField source="updatedAt" showTime />
    </SimpleShowLayout>
  </Show>
);

export const RoleEdit = () => (
  <Edit mutationMode="pessimistic">
    <SimpleForm>
      <TextInput source="name" validate={required()} helperText="2 to 20 letters and spaces" />
    </SimpleForm>
  </Edit>
);
