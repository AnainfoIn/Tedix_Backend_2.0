import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import { Alert, Box, IconButton, Link as MuiLink, Tooltip } from '@mui/material';
import { ReactElement } from 'react';
import {
  AutocompleteInput, BooleanField, BooleanInput, Create, CreateButton, Datagrid, DateField, DateInput, DateTimeInput,
  DeleteWithConfirmButton, Edit, EditButton, ExportButton, FileField, FileInput, FilterButton, FunctionField, ImageField,
  ImageInput, Labeled, List, NullableBooleanInput, NumberField, NumberInput, ReferenceInput, SaveButton, SearchInput,
  SelectField, SelectInput, Show, SimpleForm, SimpleShowLayout, TextField, TextInput, Toolbar, TopToolbar,
  useCanAccess, useDataProvider, useNotify, useRecordContext, useRefresh, useResourceContext,
} from 'react-admin';
import { Link } from 'react-router-dom';
import { FieldDef, ResourceDef } from '../../../api/src/admin/records/defs/types';
import { RESOURCE_BY_KEY } from '../../../api/src/admin/records/defs';
import { CONTENT_RESOURCES } from './registry';

type Rec = Record<string, any>;

export const labelOf = (f: FieldDef) =>
  f.label ?? (f.name === 'id' ? 'ID' : f.name.replace(/Id$/, '').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim());

const isFile = (f: FieldDef) => f.type === 'image' || f.type === 'file';
/** A panel page exists for this resource, so a reference can link to it. */
const hasPage = (resource?: string) => !!resource && (resource in RESOURCE_BY_KEY || CONTENT_RESOURCES.has(resource));

// ------------------------------------------------------------------ display

function ReferenceLink({ field }: { field: FieldDef }) {
  const record = useRecordContext<Rec>();
  if (!record || record[field.name] == null) return null;
  const text = record[`${field.name}Label`] ?? `#${record[field.name]}`;
  const target = field.ref?.resource;
  if (!hasPage(target)) return <span>{text}</span>;
  return (
    <MuiLink component={Link} to={`/${target}/${record[field.name]}/show`} onClick={(e) => e.stopPropagation()}>
      {text}
    </MuiLink>
  );
}

function Html({ source }: { source: string }) {
  const record = useRecordContext<Rec>();
  const html = record?.[source];
  if (!html) return null;
  // Content written by admins in the old rich-text editor; scripts and handlers are stripped before showing it.
  const safe = String(html).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
  return <Box sx={{ '& p': { my: 0.5 }, maxWidth: 800 }} dangerouslySetInnerHTML={{ __html: safe }} />;
}

/** Read-only display of one field (list column or show row). */
export function fieldDisplay(f: FieldDef, inList = false): ReactElement {
  const label = labelOf(f);
  const sortable = f.sortable ?? !isFile(f);
  switch (f.type) {
    case 'boolean':
      return <BooleanField key={f.name} source={f.name} label={label} sortable={sortable} />;
    case 'integer':
    case 'decimal':
      return <NumberField key={f.name} source={f.name} label={label} sortable={sortable} />;
    case 'date':
      return <DateField key={f.name} source={f.name} label={label} sortable={sortable} />;
    case 'datetime':
      return <DateField key={f.name} source={f.name} label={label} showTime sortable={sortable} />;
    case 'enum':
      return <SelectField key={f.name} source={f.name} label={label} choices={f.choices ?? []} sortable={sortable} />;
    case 'reference':
      return <FunctionField key={f.name} label={label} sortBy={f.name} render={() => <ReferenceLink field={f} />} />;
    case 'duration':
      return <TextField key={f.name} source={`${f.name}Text`} label={label} sortBy={f.name} />;
    case 'image':
      return <ImageField key={f.name} source={`${f.name}.url`} label={label} sortable={false} sx={inList ? { '& img': { maxWidth: 60, maxHeight: 60 } } : { '& img': { maxWidth: 250 } }} />;
    case 'file':
      return <FileField key={f.name} source={`${f.name}.url`} title={`${f.name}.filename`} label={label} target="_blank" sortable={false} />;
    case 'html':
      return inList ? (
        <FunctionField key={f.name} label={label} sortable={false} render={(r: Rec) => String(r[f.name] ?? '').replace(/<[^>]+>/g, ' ').slice(0, 80)} />
      ) : (
        <FunctionField key={f.name} label={label} render={() => <Html source={f.name} />} />
      );
    case 'json':
      return <FunctionField key={f.name} label={label} sortable={false} render={(r: Rec) => (r[f.name] == null ? '' : <code>{JSON.stringify(r[f.name])}</code>)} />;
    case 'url':
      return <FunctionField key={f.name} label={label} sortBy={f.name} render={(r: Rec) => (r[f.name] ? <MuiLink href={r[f.name]} target="_blank" rel="noreferrer">{r[f.name]}</MuiLink> : null)} />;
    case 'text':
      return inList ? (
        <FunctionField key={f.name} label={label} sortBy={f.name} render={(r: Rec) => { const t = String(r[f.name] ?? ''); return t.length > 80 ? `${t.slice(0, 80)}…` : t; }} />
      ) : (
        <TextField key={f.name} source={f.name} label={label} sx={{ whiteSpace: 'pre-wrap' }} />
      );
    default:
      return <TextField key={f.name} source={f.name} label={label} sortable={sortable} />;
  }
}

// ------------------------------------------------------------------ inputs

function referenceInput(f: FieldDef, extra: Rec = {}) {
  const target = f.ref!.resource!;
  const optionText = f.ref!.labelColumn === 'course_name' ? 'name' : camel(f.ref!.labelColumn);
  return (
    <ReferenceInput key={f.name} source={f.name} reference={target} perPage={100} sort={{ field: optionText === 'id' ? 'id' : optionText, order: 'ASC' }} {...extra}>
      <AutocompleteInput label={labelOf(f)} optionText={optionText} filterToQuery={(q: string) => ({ q })} helperText={f.hint} {...(extra.validate ? { validate: extra.validate } : {})} />
    </ReferenceInput>
  );
}

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Form input for one field. */
export function fieldInput(f: FieldDef, mode: 'create' | 'edit'): ReactElement | null {
  if (f.expr || f.form === false || (f.form === 'create' && mode === 'edit')) return null;
  const disabled = f.form === 'readonly';
  if (disabled && mode === 'create') return null;
  const common = { key: f.name, source: f.name, label: labelOf(f), helperText: f.hint, disabled, fullWidth: true };
  switch (f.type) {
    case 'boolean':
      return <BooleanInput {...common} fullWidth={false} />;
    case 'integer':
      return <NumberInput {...common} step={1} />;
    case 'decimal':
      return <NumberInput {...common} />;
    case 'date':
      return <DateInput {...common} />;
    case 'datetime':
      return <DateTimeInput {...common} />;
    case 'enum':
      return <SelectInput {...common} choices={f.choices ?? []} emptyText="" />;
    case 'reference':
      if (!hasPage(f.ref?.resource)) return <NumberInput {...common} label={`${labelOf(f)} (ID)`} />;
      return disabled ? <TextInput {...common} source={`${f.name}Label`} /> : referenceInput(f);
    case 'duration':
      return <TextInput {...common} source={mode === 'edit' ? `${f.name}Text` : f.name} />;
    case 'text':
    case 'html':
    case 'json':
      return <TextInput {...common} multiline minRows={f.type === 'html' ? 8 : 4} />;
    case 'image':
      return (
        <ImageInput {...common} accept={f.accept ? Object.fromEntries(f.accept.map((t) => [t, []])) : { 'image/*': [] }}>
          <ImageField source="src" title="title" />
        </ImageInput>
      );
    case 'file':
      return (
        <FileInput {...common} accept={f.accept ? Object.fromEntries(f.accept.map((t) => [t, []])) : undefined}>
          <FileField source="src" title="title" target="_blank" />
        </FileInput>
      );
    default:
      return <TextInput {...common} />;
  }
}

// ------------------------------------------------------------------ pages

function filtersFor(def: ResourceDef) {
  const filters: ReactElement[] = [];
  if (def.search?.length) filters.push(<SearchInput key="q" source="q" alwaysOn placeholder="Search" />);
  for (const f of def.fields.filter((x) => x.filter)) {
    const label = labelOf(f);
    switch (f.type) {
      case 'reference':
        if (hasPage(f.ref?.resource)) filters.push(referenceInput(f, { key: f.name }));
        break;
      case 'enum':
        filters.push(<SelectInput key={f.name} source={f.name} label={label} choices={f.choices ?? []} />);
        break;
      case 'boolean':
        filters.push(<NullableBooleanInput key={f.name} source={f.name} label={label} />);
        break;
      case 'date':
      case 'datetime':
        filters.push(<DateInput key={`${f.name}_gte`} source={`${f.name}_gte`} label={`${label} from`} />);
        filters.push(<DateInput key={`${f.name}_lte`} source={`${f.name}_lte`} label={`${label} to`} />);
        break;
      case 'integer':
      case 'decimal':
      case 'duration':
        filters.push(<NumberInput key={f.name} source={f.name} label={label} />);
        break;
      case 'image':
      case 'file':
        break;
      default:
        filters.push(<TextInput key={f.name} source={f.name} label={label} />);
    }
  }
  return filters;
}

function ListActions({ def }: { def: ResourceDef }) {
  return (
    <TopToolbar>
      <FilterButton />
      {def.actions.includes('create') && <CreateButton />}
      <ExportButton />
    </TopToolbar>
  );
}

function MoveButtons({ def }: { def: ResourceDef }) {
  const record = useRecordContext<Rec>();
  const resource = useResourceContext();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const { canAccess } = useCanAccess({ resource: def.key, action: 'edit' });
  if (!record || !canAccess || record.position == null) return null;
  const move = (position: number) =>
    dataProvider
      .move(resource!, { id: record.id, position })
      .then(() => refresh())
      .catch((e: Error) => notify(e.message, { type: 'error' }));
  return (
    <Box sx={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
      <Tooltip title="Move up"><span><IconButton size="small" aria-label="Move up" disabled={record.position <= 1} onClick={() => move(record.position - 1)}><ArrowUpwardIcon fontSize="small" /></IconButton></span></Tooltip>
      <Tooltip title="Move down"><IconButton size="small" aria-label="Move down" onClick={() => move(record.position + 1)}><ArrowDownwardIcon fontSize="small" /></IconButton></Tooltip>
    </Box>
  );
}

/** Which fields are list columns: `list: true`, or by default every simple field except long text. */
const listFields = (def: ResourceDef) =>
  def.fields.filter((f) => f.list ?? !['text', 'html', 'json'].includes(f.type));

export function makeList(def: ResourceDef) {
  const RecordList = () => (
    <List
      filters={filtersFor(def)}
      actions={<ListActions def={def} />}
      sort={def.defaultSort ?? (def.position ? { field: 'position', order: 'ASC' } : { field: 'id', order: 'ASC' })}
      title={def.label}
      empty={false}
    >
      {def.note && <Alert severity="info" sx={{ m: 1 }}>{def.note}</Alert>}
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="id" label="ID" />
        {listFields(def).map((f) => fieldDisplay(f, true))}
        {def.position && <TextField source="position" />}
        {def.position && <FunctionField label="Order" render={() => <MoveButtons def={def} />} />}
        {def.actions.includes('edit') && <EditButton />}
      </Datagrid>
    </List>
  );
  return RecordList;
}

function ShowActions({ def }: { def: ResourceDef }) {
  return (
    <TopToolbar>
      {def.actions.includes('edit') && <EditButton />}
      {def.actions.includes('delete') && <DeleteWithConfirmButton confirmTitle={`Delete this ${def.singular.toLowerCase()}?`} />}
    </TopToolbar>
  );
}

export function makeShow(def: ResourceDef) {
  const RecordShow = () => (
    <Show actions={<ShowActions def={def} />} title={<RecordTitle def={def} />}>
      <SimpleShowLayout>
        <TextField source="id" label="ID" />
        {def.fields.filter((f) => f.show !== false).map((f) => fieldDisplay(f))}
        {def.position && <TextField source="position" />}
      </SimpleShowLayout>
    </Show>
  );
  return RecordShow;
}

function RecordTitle({ def }: { def: ResourceDef }) {
  const record = useRecordContext<Rec>();
  const text = record ? record[def.representation ?? 'id'] ?? `#${record.id}` : '';
  return <span>{def.singular} {text ? `· ${text}` : ''}</span>;
}

const FormToolbar = ({ def, mode }: { def: ResourceDef; mode: 'create' | 'edit' }) => (
  <Toolbar sx={{ justifyContent: 'space-between' }}>
    <SaveButton />
    {mode === 'edit' && def.actions.includes('delete') && <DeleteWithConfirmButton confirmTitle={`Delete this ${def.singular.toLowerCase()}?`} />}
  </Toolbar>
);

function ReadOnlyRows({ def }: { def: ResourceDef }) {
  const fields = def.fields.filter((f) => f.expr && f.show !== false);
  if (!fields.length) return null;
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 2 }}>
      {fields.map((f) => (
        <Labeled key={f.name} label={labelOf(f)}>{fieldDisplay(f)}</Labeled>
      ))}
    </Box>
  );
}

const defaults = (def: ResourceDef) =>
  Object.fromEntries(def.fields.filter((f) => f.defaultValue !== undefined).map((f) => [f.name, f.defaultValue]));

export function makeCreate(def: ResourceDef) {
  const RecordCreate = () => (
    <Create redirect="show" title={`Add ${def.singular}`}>
      <SimpleForm toolbar={<FormToolbar def={def} mode="create" />} defaultValues={defaults(def)} sx={{ maxWidth: 720 }}>
        {def.fields.map((f) => fieldInput(f, 'create'))}
      </SimpleForm>
    </Create>
  );
  return RecordCreate;
}

/** Edit form: duration fields are edited as text ("2 days, 3 hours") and sent under their own name. */
const transformEdit = (def: ResourceDef) => (data: Rec) => {
  const out = { ...data };
  for (const f of def.fields.filter((x) => x.type === 'duration')) {
    if (`${f.name}Text` in out) out[f.name] = out[`${f.name}Text`];
  }
  return out;
};

export function makeEdit(def: ResourceDef) {
  const RecordEdit = () => (
    <Edit redirect="show" mutationMode="pessimistic" title={<RecordTitle def={def} />} transform={transformEdit(def)}>
      <SimpleForm toolbar={<FormToolbar def={def} mode="edit" />} sx={{ maxWidth: 720 }}>
        <ReadOnlyRows def={def} />
        {def.fields.map((f) => fieldInput(f, 'edit'))}
      </SimpleForm>
    </Edit>
  );
  return RecordEdit;
}

export function pagesFor(def: ResourceDef) {
  return {
    list: makeList(def),
    show: makeShow(def),
    create: def.actions.includes('create') ? makeCreate(def) : undefined,
    edit: def.actions.includes('edit') ? makeEdit(def) : undefined,
  };
}

