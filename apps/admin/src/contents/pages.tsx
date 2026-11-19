import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import AddIcon from '@mui/icons-material/Add';
import {
  Alert, Box, Breadcrumbs, Card, CardContent, Chip, IconButton, Link as MuiLink, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import { useState } from 'react';
import {
  BooleanField, BooleanInput, Button, Create, Datagrid, DateField, DateInput, DeleteWithConfirmButton, Edit,
  EditButton, FunctionField, Labeled, List, ReferenceInput, AutocompleteInput, required, SaveButton, SearchInput, Show,
  SimpleForm, TextField, TextInput, Toolbar, TopToolbar, CreateButton, ExportButton, FilterButton, useCanAccess,
  useDataProvider, useNotify, useRecordContext, useRefresh,
} from 'react-admin';
import { Link } from 'react-router-dom';
import { CascadePickers, GradesPicker, MaterialInputs } from './inputs';
import { ANCESTORS, FIELD_LABEL, FIELD_LEVEL, IdField, Level, LevelKey, LEVELS } from './levels';

type Rec = Record<string, any>;

const nameOf = (field: IdField) => field.replace(/Id$/, 'Name');

// ------------------------------------------------------------------ list

function listFilters(level: Level) {
  const filters = [<SearchInput key="q" source="q" alwaysOn placeholder="Search by name" />];
  const fields: IdField[] = level.key === 'subjects' ? ['countryId', 'gradeId'] : ANCESTORS[level.key];
  for (const field of fields) {
    filters.push(
      <ReferenceInput key={field} source={field} reference={FIELD_LEVEL[field]} perPage={500} sort={{ field: 'name', order: 'ASC' }}>
        <AutocompleteInput label={FIELD_LABEL[field]} optionText="name" />
      </ReferenceInput>,
    );
  }
  return filters;
}

const ListActions = () => (
  <TopToolbar>
    <FilterButton />
    <CreateButton />
    <ExportButton />
  </TopToolbar>
);

function ancestorColumn(field: IdField) {
  return (
    <FunctionField
      key={field}
      label={FIELD_LABEL[field]}
      sortable={false}
      render={(record: Rec) =>
        record[field] ? (
          <MuiLink component={Link} to={`/${FIELD_LEVEL[field]}/${record[field]}/show`} onClick={(e) => e.stopPropagation()}>
            {record[nameOf(field)] ?? `#${record[field]}`}
          </MuiLink>
        ) : null
      }
    />
  );
}

export function makeList(level: Level) {
  const LevelList = () => (
    <List
      filters={listFilters(level)}
      actions={<ListActions />}
      sort={{ field: 'id', order: 'ASC' }}
      title={level.plural}
    >
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="id" />
        {ANCESTORS[level.key].map(ancestorColumn)}
        {level.key === 'subjects' && (
          <FunctionField label="Grades" render={(r: Rec) => (r.gradeNames ?? []).join(', ')} />
        )}
        <TextField source="name" />
        {level.key === 'countries' && <TextField source="alpha2" label="Alpha2" />}
        {level.key === 'countries' && <TextField source="alpha3" label="Alpha3" />}
        {level.key === 'countries' && <TextField source="countryCode" label="Code" />}
        {level.ordered && <TextField source="position" />}
        {level.key === 'lessons' && <DateField source="startDate" />}
        {level.key === 'lessons' && <DateField source="endDate" />}
        <EditButton />
      </Datagrid>
    </List>
  );
  return LevelList;
}

// ------------------------------------------------------------------ show

function PathCrumbs({ level }: { level: Level }) {
  const record = useRecordContext<Rec>();
  if (!record) return null;
  const fields = ANCESTORS[level.key];
  return (
    <Breadcrumbs sx={{ mb: 2 }}>
      <MuiLink component={Link} to="/contents">Contents</MuiLink>
      {fields.map((field) => (
        <MuiLink key={field} component={Link} to={`/${FIELD_LEVEL[field]}/${record[field]}/show`}>
          {record[nameOf(field)] ?? `#${record[field]}`}
        </MuiLink>
      ))}
      <Typography color="text.primary">{record.name}</Typography>
    </Breadcrumbs>
  );
}

function FileLink({ source, label }: { source: string; label: string }) {
  const record = useRecordContext<Rec>();
  const file = record?.[source];
  return (
    <Labeled label={label}>
      {file?.url ? (
        <MuiLink href={file.url} target="_blank" rel="noreferrer">{file.filename}</MuiLink>
      ) : file ? (
        <Typography variant="body2">{file.filename} (storage not connected)</Typography>
      ) : (
        <Typography variant="body2" color="text.secondary">None</Typography>
      )}
    </Labeled>
  );
}

function Icon() {
  const record = useRecordContext<Rec>();
  const image = record?.image;
  return (
    <Labeled label="Display icon">
      {image?.url ? (
        <Box component="img" src={image.url} alt={image.filename} sx={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 1 }} />
      ) : (
        <Typography variant="body2" color="text.secondary">{image ? `${image.filename} (storage not connected)` : 'None'}</Typography>
      )}
    </Labeled>
  );
}

function StorageWarning() {
  const record = useRecordContext<Rec>();
  if (!record || record.storageConfigured !== false) return null;
  return (
    <Alert severity="info" sx={{ mb: 2 }}>
      File storage is not connected yet, so icons and materials can't be shown or uploaded.
    </Alert>
  );
}

/** The children table of the Rails show pages: View, Edit, Up, Down, and "Add". */
function ChildrenPanel({ level }: { level: Level }) {
  const record = useRecordContext<Rec>();
  const dataProvider = useDataProvider();
  const refresh = useRefresh();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const childKey = level.child;
  const { canAccess: canManage } = useCanAccess({ resource: childKey ?? level.key, action: 'create' });
  if (!record || !childKey) return null;
  const child = LEVELS[childKey];
  const rows: Rec[] = record.children?.data ?? [];

  const move = async (row: Rec, position: number) => {
    setBusy(true);
    try {
      await (dataProvider as any).move(childKey, { id: row.id, position });
      refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not move it', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const prefill: Rec = {};
  for (const field of ANCESTORS[level.key]) prefill[field] = record[field];
  if (level.idField) prefill[level.idField] = record.id;
  // A subject taught in one grade fills in that grade for its new master.
  if (level.key === 'subjects' && record.gradeIds?.length === 1) prefill.gradeId = record.gradeIds[0];
  if (childKey === 'subjects') {
    delete prefill.gradeId;
    prefill.gradeIds = [record.id];
  }

  return (
    <Card variant="outlined" sx={{ mt: 3 }}>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="h6">{child.plural}</Typography>
          {canManage && (
            <Button
              component={Link}
              to={`/${childKey}/create?source=${encodeURIComponent(JSON.stringify(prefill))}`}
              label={`Add ${child.singular}`}
            >
              <AddIcon />
            </Button>
          )}
        </Stack>
        {rows.length === 0 ? (
          <Typography color="text.secondary">No {child.plural.toLowerCase()} added yet.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Name</TableCell>
                {child.ordered && <TableCell>Position</TableCell>}
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.id}</TableCell>
                  <TableCell>
                    <MuiLink component={Link} to={`/${childKey}/${row.id}/show`}>{row.name}</MuiLink>
                  </TableCell>
                  {child.ordered && <TableCell>{row.position}</TableCell>}
                  <TableCell align="right">
                    {canManage && child.ordered && (
                      <>
                        <Tooltip title="Move up">
                          <span>
                            <IconButton size="small" aria-label="Move up" disabled={busy || index === 0} onClick={() => move(row, index)}>
                              <ArrowUpwardIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Move down">
                          <span>
                            <IconButton size="small" aria-label="Move down" disabled={busy || index === rows.length - 1} onClick={() => move(row, index + 2)}>
                              <ArrowDownwardIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </>
                    )}
                    {canManage && (
                      <Button component={Link} to={`/${childKey}/${row.id}`} label="Edit" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

const ShowActions = () => (
  <TopToolbar>
    <EditButton />
    <DeleteWithConfirmButton mutationMode="pessimistic" />
  </TopToolbar>
);

export function makeShow(level: Level) {
  const LevelShow = () => (
    <Show actions={<ShowActions />} title={<ShowTitle level={level} />}>
      <Box sx={{ p: 2 }}>
        <PathCrumbs level={level} />
        <StorageWarning />
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} flexWrap="wrap" useFlexGap>
          <Labeled label="ID"><TextField source="id" /></Labeled>
          <Labeled label="Name"><TextField source="name" /></Labeled>
          {level.key === 'countries' && <Labeled label="Alpha2"><TextField source="alpha2" /></Labeled>}
          {level.key === 'countries' && <Labeled label="Alpha3"><TextField source="alpha3" /></Labeled>}
          {level.key === 'countries' && <Labeled label="Code"><TextField source="countryCode" /></Labeled>}
          {level.key === 'subjects' && (
            <Labeled label="Grades">
              <FunctionField render={(r: Rec) => (
                <Stack direction="row" spacing={1}>{(r.gradeNames ?? []).map((n: string) => <Chip key={n} label={n} size="small" />)}</Stack>
              )} />
            </Labeled>
          )}
          {level.ordered && <Labeled label="Position"><TextField source="position" /></Labeled>}
          {level.key === 'lessons' && <Labeled label="Start date"><DateField source="startDate" /></Labeled>}
          {level.key === 'lessons' && <Labeled label="End date"><DateField source="endDate" /></Labeled>}
          {level.key === 'lessons' && <Labeled label="Upgraded"><BooleanField source="isUpgraded" /></Labeled>}
          <Labeled label="Created"><DateField source="createdAt" showTime /></Labeled>
          <Labeled label="Updated"><DateField source="updatedAt" showTime /></Labeled>
        </Stack>
        {level.hasFiles && (
          <Card variant="outlined" sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>{level.singular} materials</Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={4}>
                <Icon />
                <FileLink source="cheatsheetPdf" label="Cheatsheet (PDF)" />
                <FileLink source="summaryPdf" label="Summary (PDF)" />
                <FileLink source="summaryVideo" label="Summary (video)" />
              </Stack>
            </CardContent>
          </Card>
        )}
        <ChildrenPanel level={level} />
      </Box>
    </Show>
  );
  return LevelShow;
}

function ShowTitle({ level }: { level: Level }) {
  const record = useRecordContext<Rec>();
  return <span>{level.singular}{record ? `: ${record.name}` : ''}</span>;
}

// ------------------------------------------------------------------ forms

function LevelFields({ level }: { level: Level }) {
  return (
    <>
      {level.key === 'subjects' ? (
        <>
          <CascadePickers fields={['countryId']} />
          <GradesPicker />
        </>
      ) : (
        level.pickers.length > 0 && <CascadePickers fields={level.pickers} />
      )}
      <TextInput source="name" validate={required()} fullWidth helperText={level.key === 'grades' ? 'Up to 100 characters' : '2 to 100 characters'} />
      {level.key === 'countries' && (
        <>
          <TextInput source="alpha2" label="Alpha2" validate={required()} inputProps={{ maxLength: 2, style: { textTransform: 'uppercase' } }} helperText="2 letters, e.g. IN" />
          <TextInput source="alpha3" label="Alpha3" validate={required()} inputProps={{ maxLength: 3, style: { textTransform: 'uppercase' } }} helperText="3 letters, e.g. IND" />
          <TextInput source="countryCode" label="Code" validate={required()} inputProps={{ maxLength: 4 }} helperText="1 to 4 digits, e.g. 91" />
        </>
      )}
      {level.key === 'lessons' && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <DateInput source="startDate" validate={required()} />
          <DateInput source="endDate" validate={required()} />
          <BooleanInput source="isUpgraded" label="Upgraded" />
        </Stack>
      )}
      {level.hasFiles && (
        <Box sx={{ width: '100%', mt: 2 }}>
          <Typography variant="h6">{level.singular} materials</Typography>
          <MaterialInputs />
        </Box>
      )}
    </>
  );
}

const FormToolbar = () => (
  <Toolbar>
    <SaveButton />
  </Toolbar>
);

export function makeCreate(level: Level) {
  const LevelCreate = () => (
    <Create redirect="show" title={`Add ${level.singular}`}>
      <SimpleForm toolbar={<FormToolbar />} sx={{ maxWidth: 720 }}>
        <LevelFields level={level} />
      </SimpleForm>
    </Create>
  );
  return LevelCreate;
}

export function makeEdit(level: Level) {
  const LevelEdit = () => (
    <Edit mutationMode="pessimistic" redirect="show" title={`Edit ${level.singular}`}>
      <SimpleForm sx={{ maxWidth: 720 }}>
        <LevelFields level={level} />
      </SimpleForm>
    </Edit>
  );
  return LevelEdit;
}

export const CONTENT_PAGES = Object.fromEntries(
  (Object.keys(LEVELS) as LevelKey[]).map((key) => {
    const level = LEVELS[key];
    return [key, { list: makeList(level), show: makeShow(level), create: makeCreate(level), edit: makeEdit(level) }];
  }),
) as Record<LevelKey, { list: () => JSX.Element; show: () => JSX.Element; create: () => JSX.Element; edit: () => JSX.Element }>;

