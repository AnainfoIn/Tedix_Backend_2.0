import { Alert, Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useWatch } from 'react-hook-form';
import {
  AutocompleteArrayInput,
  BooleanField,
  BooleanInput,
  CheckboxGroupInput,
  Create,
  Datagrid,
  DateField,
  DateInput,
  DateTimeInput,
  DeleteWithConfirmButton,
  Edit,
  EditButton,
  FilterButton,
  FunctionField,
  ImageField,
  ImageInput,
  Labeled,
  List,
  NullableBooleanInput,
  NumberField,
  NumberInput,
  ReferenceArrayInput,
  SaveButton,
  SelectInput,
  Show,
  SimpleForm,
  SimpleShowLayout,
  TextField,
  TextInput,
  Toolbar,
  TopToolbar,
  CreateButton,
  ExportButton,
  required,
  useGetList,
  useRecordContext,
} from 'react-admin';
import { apiFetch } from '../api';

/**
 * Notifications (old ActiveAdmin "Notifications" page): one notification can go out as in-app,
 * push, email and SMS, on a schedule, to students picked by country and optional criteria.
 */
type Rec = Record<string, any>;

const SCHEDULE_CHOICES = [
  { id: 'now', name: 'Run Now' },
  { id: 'once', name: 'Schedule Once' },
  { id: 'daily', name: 'Daily' },
  { id: 'weekly', name: 'Weekly' },
  { id: 'monthly', name: 'Monthly' },
];
const WEEKDAYS = [
  { id: 1, name: 'Monday' },
  { id: 2, name: 'Tuesday' },
  { id: 3, name: 'Wednesday' },
  { id: 4, name: 'Thursday' },
  { id: 5, name: 'Friday' },
  { id: 6, name: 'Saturday' },
  { id: 0, name: 'Sunday' },
];
const plain = (values: string[]) => values.map((v) => ({ id: v, name: v.charAt(0).toUpperCase() + v.slice(1) }));
const ACCOUNT_TYPES = plain(['student', 'parent', 'teacher', 'admin']);
const AVATAR_HEALTH = plain(['healthy', 'unhealthy', 'neutral']);
const PREMIUM = plain(['premium', 'free']);

const filters = [
  <NullableBooleanInput key="inapp" source="inapp" label="In-App" />,
  <NullableBooleanInput key="push" source="push" label="Push" />,
  <NullableBooleanInput key="email" source="email" label="Email" />,
  <NullableBooleanInput key="sms" source="sms" label="SMS" />,
  <TextInput key="status" source="status" />,
  <SelectInput key="scheduleType" source="scheduleType" label="Schedule type" choices={SCHEDULE_CHOICES} />,
  <DateInput key="st_gte" source="scheduleTime_gte" label="Schedule time from" />,
  <DateInput key="st_lte" source="scheduleTime_lte" label="Schedule time to" />,
  <DateInput key="ca_gte" source="createdAt_gte" label="Created from" />,
  <DateInput key="ca_lte" source="createdAt_lte" label="Created to" />,
];

export const NotificationList = () => (
  <List
    filters={filters}
    sort={{ field: 'id', order: 'DESC' }}
    actions={
      <TopToolbar>
        <FilterButton />
        <CreateButton />
        <ExportButton />
      </TopToolbar>
    }
  >
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" label="ID" />
      <TextField source="types" label="Notification Types" sortable={false} />
      <TextField source="targetingSummary" label="Targeting Summary" sortable={false} />
      <TextField source="status" />
      <TextField source="scheduleText" label="Schedule" sortable={false} />
      <NumberField source="targetedAccountsCount" label="Targeted" sortable={false} />
      <NumberField source="manualAccountsCount" label="Manual" sortable={false} />
      <NumberField source="totalAccountsCount" label="Total" sortable={false} />
      <DateField source="createdAt" showTime />
      <EditButton />
    </Datagrid>
  </List>
);

function ChannelCard({ title, show, children }: { title: string; show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>{title}</Typography>
        <Stack spacing={1}>{children}</Stack>
      </CardContent>
    </Card>
  );
}

function TargetingChips() {
  const record = useRecordContext<Rec>();
  if (!record) return null;
  const rows: Array<[string, string]> = [
    ['targetCountry', 'Countries'], ['targetCity', 'Cities'], ['targetSchool', 'Schools'], ['targetGrade', 'Grades'],
    ['targetAccountType', 'Account Types'], ['targetAvatarHealth', 'Avatar Health'], ['targetPremiumStatus', 'Premium Status'],
    ['targetSponsor', 'Sponsors'], ['targetCampaign', 'Campaigns'],
  ];
  const set = rows.filter(([key]) => record[key]?.length);
  if (!set.length) return <Typography variant="body2">No targeting set</Typography>;
  return (
    <Stack spacing={0.5}>
      {set.map(([key, label]) => (
        <Box key={key}>
          <Typography variant="caption" color="text.secondary">{label}: </Typography>
          {record[key].map((v: string) => <Chip key={v} label={v} size="small" sx={{ mr: 0.5 }} />)}
        </Box>
      ))}
    </Stack>
  );
}

const Multiline = ({ source }: { source: string }) => (
  <FunctionField source={source} render={(r: Rec) => <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{r[source] || '—'}</Typography>} />
);

function ChannelDetails() {
  const r = useRecordContext<Rec>();
  if (!r) return null;
  return (
    <>
      <ChannelCard title="In-App Notification" show={r.inapp}>
        <Labeled label="Subject"><TextField source="inappSubject" /></Labeled>
        <Labeled label="Content"><Multiline source="inappContent" /></Labeled>
        <Labeled label="Only Informative"><BooleanField source="inappOnlyInformative" /></Labeled>
        <Labeled label="Has Button"><BooleanField source="inappIsButton" /></Labeled>
        <Labeled label="Button URL"><TextField source="inappButtonUrl" emptyText="—" /></Labeled>
        <Labeled label="Button Content"><TextField source="inappButtonContent" emptyText="—" /></Labeled>
        {r.inappImage?.url && <Labeled label="Notification Image"><ImageField source="inappImage.url" /></Labeled>}
      </ChannelCard>
      <ChannelCard title="Push Notification" show={r.push}>
        <Labeled label="Subject"><TextField source="pushSubject" /></Labeled>
        <Labeled label="Content"><Multiline source="pushContent" /></Labeled>
      </ChannelCard>
      <ChannelCard title="Email Notification" show={r.email}>
        <Labeled label="Subject"><TextField source="emailSubject" /></Labeled>
        <Labeled label="Content"><Multiline source="emailContent" /></Labeled>
      </ChannelCard>
      <ChannelCard title="SMS Notification" show={r.sms}>
        <Labeled label="Name"><TextField source="smsName" /></Labeled>
        <Labeled label="Body"><Multiline source="smsMainBody" /></Labeled>
        <Labeled label="Median Grade"><BooleanField source="smsMedianGrade" /></Labeled>
        <Labeled label="Sponsor Message"><BooleanField source="smsSponsorMessage" /></Labeled>
        {r.smsSponsorMessage && <Labeled label="Sponsor Body"><Multiline source="smsSponsorBody" /></Labeled>}
        <Labeled label="Footer"><TextField source="smsFooter" /></Labeled>
      </ChannelCard>
    </>
  );
}

const ShowActions = () => (
  <TopToolbar>
    <EditButton />
    <DeleteWithConfirmButton confirmTitle="Delete this notification?" />
  </TopToolbar>
);

export const NotificationShow = () => (
  <Show actions={<ShowActions />} title={<NotificationTitle />}>
    <SimpleShowLayout>
      <TextField source="id" label="ID" />
      <TextField source="types" label="Notification Types" />
      <FunctionField label="Targeting Settings" render={() => <TargetingChips />} />
      <TextField source="status" />
      <TextField source="scheduleText" label="Schedule" />
      <DateField source="endTime" label="End Time" showTime emptyText="—" />
      <NumberField source="targetedAccountsCount" label="Targeted accounts" />
      <NumberField source="manualAccountsCount" label="Manually added accounts" />
      <NumberField source="totalAccountsCount" label="Total accounts" />
      <DateField source="createdAt" showTime />
      <DateField source="updatedAt" showTime />
    </SimpleShowLayout>
    <Box sx={{ px: 2, pb: 2 }}>
      <ChannelDetails />
    </Box>
  </Show>
);

function NotificationTitle() {
  const r = useRecordContext<Rec>();
  return <span>Notification {r ? `#${r.id}` : ''}</span>;
}

/** Cities, schools or grades of students in the chosen countries (and cities/schools above). */
function useTargetingOptions(type: 'cities' | 'schools' | 'grades') {
  const [country, city, school] = useWatch({ name: ['targetCountry', 'targetCity', 'targetSchool'] }) as (string[] | undefined)[];
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const key = JSON.stringify([type, country, type !== 'cities' ? city : null, type === 'grades' ? school : null]);
  useEffect(() => {
    if (!country?.length) {
      setOptions([]);
      return;
    }
    const params = new URLSearchParams({ type, country: country.join(',') });
    if (type !== 'cities' && city?.length) params.set('city', city.join(','));
    if (type === 'grades' && school?.length) params.set('school', school.join(','));
    let live = true;
    apiFetch<{ data: string[] }>(`/notifications/targeting-options?${params}`)
      .then((res) => live && setOptions(res.data.map((v) => ({ id: v, name: v }))))
      .catch(() => live && setOptions([]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { options, ready: !!country?.length };
}

function DependentTargeting({ source, label, type, hint }: { source: string; label: string; type: 'cities' | 'schools' | 'grades'; hint: string }) {
  const { options, ready } = useTargetingOptions(type);
  const current = (useWatch({ name: source }) as string[] | undefined) ?? [];
  // Keep already saved values selectable even when no student has them any more.
  const choices = [...options, ...current.filter((v) => !options.some((o) => o.id === v)).map((v) => ({ id: v, name: v }))];
  return <AutocompleteArrayInput source={source} label={label} choices={choices} disabled={!ready} helperText={ready ? hint : 'Pick the countries first'} fullWidth />;
}

/** Choices from another list by name (countries, sponsors, campaigns), as the Rails form stores names. */
function NameChoices({ source, label, resource, hint, validate }: { source: string; label: string; resource: string; hint: string; validate?: any }) {
  const { data } = useGetList(resource, { pagination: { page: 1, perPage: 500 }, sort: { field: 'name', order: 'ASC' } });
  const choices = (data ?? []).map((r) => ({ id: r.name, name: r.name }));
  return <AutocompleteArrayInput source={source} label={label} choices={choices} helperText={hint} validate={validate} fullWidth />;
}

function ScheduleInputs() {
  const type = useWatch({ name: 'scheduleType' }) as string | undefined;
  const recurring = ['daily', 'weekly', 'monthly'].includes(type ?? '');
  return (
    <>
      <SelectInput source="scheduleType" label="Schedule type" choices={SCHEDULE_CHOICES} validate={required()} helperText="Choose when and how often this notification should be sent" />
      {type === 'once' && <DateTimeInput source="scheduleTime" label="Schedule Time" helperText="When to send the notification" />}
      {recurring && <DateTimeInput source="scheduleTime" label="Time of Day" helperText="The time of day to send (the date part is ignored)" />}
      {(type === 'daily' || type === 'monthly') && (
        <NumberInput source="recurrenceInterval" label="Recurrence Interval" min={1} helperText="How often to repeat (1 = every day/month, 2 = every 2 days/months)" />
      )}
      {type === 'weekly' && <CheckboxGroupInput source="recurrenceWeekday" label="Days of Week" choices={WEEKDAYS} helperText="Select which days of the week to send" />}
      {type === 'monthly' && <NumberInput source="recurrenceDayOfMonth" label="Day of Month" min={1} max={31} helperText="Which day of the month to send (1-31)" />}
      {recurring && <DateTimeInput source="endTime" label="End Time (Optional)" helperText="When to stop sending recurring notifications (leave blank for indefinite)" />}
    </>
  );
}

function ChannelInputs() {
  const [inapp, push, email, sms, sponsor] = useWatch({ name: ['inapp', 'push', 'email', 'sms', 'smsSponsorMessage'] }) as boolean[];
  return (
    <>
      <ChannelCard title="In-App Notification Details" show={!!inapp}>
        <TextInput source="inappSubject" label="Subject" validate={required()} fullWidth />
        <TextInput source="inappContent" label="Content" multiline minRows={5} helperText="Enter your in-app notification content here" fullWidth />
        <Stack direction="row" spacing={3}>
          <BooleanInput source="inappOnlyInformative" label="Only Informative" />
          <BooleanInput source="inappIsButton" label="Has Button" />
        </Stack>
        <TextInput source="inappButtonUrl" label="Button URL" fullWidth />
        <TextInput source="inappButtonContent" label="Button Content" fullWidth />
        <ImageInput source="inappImage" label="Notification Image" accept={{ 'image/png': [], 'image/jpeg': [], 'image/svg+xml': [], 'image/webp': [] }}>
          <ImageField source="src" title="title" />
        </ImageInput>
      </ChannelCard>
      <ChannelCard title="Push Notification Details" show={!!push}>
        <TextInput source="pushSubject" label="Subject" validate={required()} fullWidth />
        <TextInput source="pushContent" label="Content" multiline minRows={5} helperText="Enter your push notification content here" fullWidth />
      </ChannelCard>
      <ChannelCard title="Email Notification Details" show={!!email}>
        <TextInput source="emailSubject" label="Subject" validate={required()} fullWidth />
        <TextInput source="emailContent" label="Content" multiline minRows={5} helperText="Enter your email notification content here" fullWidth />
      </ChannelCard>
      <ChannelCard title="SMS Notification Details" show={!!sms}>
        <TextInput source="smsName" label="Name" validate={required()} fullWidth />
        <TextInput source="smsMainBody" label="Body" multiline minRows={3} validate={required()} fullWidth />
        <Stack direction="row" spacing={3}>
          <BooleanInput source="smsMedianGrade" label="Median Grade" />
          <BooleanInput source="smsSponsorMessage" label="Sponsor Message" />
        </Stack>
        {sponsor && <TextInput source="smsSponsorBody" label="Sponsor Body" multiline minRows={2} validate={required()} fullWidth />}
        <TextInput source="smsFooter" label="Footer" validate={required()} fullWidth />
      </ChannelCard>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mt: 3, width: '100%' }}>
      <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
      {children}
    </Box>
  );
}

function NotificationForm() {
  return (
    <Box sx={{ width: '100%', maxWidth: 760 }}>
      <Section title="Notification Types">
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <BooleanInput source="inapp" label="In-App Notification" />
          <BooleanInput source="push" label="Push Notification" />
          <BooleanInput source="email" label="Email Notification" />
          <BooleanInput source="sms" label="SMS Notification" />
        </Stack>
        <ChannelInputs />
      </Section>
      <Section title="Schedule Settings">
        <ScheduleInputs />
      </Section>
      <Section title="Targeting Settings">
        <NameChoices source="targetCountry" label="Countries" resource="countries" validate={required()} hint="Country selection is mandatory for targeting. You can select multiple countries." />
        <DependentTargeting source="targetCity" label="Cities" type="cities" hint="Optional: Select specific cities within the selected countries." />
        <DependentTargeting source="targetSchool" label="Schools" type="schools" hint="Optional: Select specific schools within the selected cities." />
        <DependentTargeting source="targetGrade" label="Grades" type="grades" hint="Optional: Select specific grades within the selected schools." />
        <AutocompleteArrayInput source="targetAccountType" label="Account Types" choices={ACCOUNT_TYPES} helperText="Optional: Filter by account types." fullWidth />
        <AutocompleteArrayInput source="targetAvatarHealth" label="Avatar Health" choices={AVATAR_HEALTH} helperText="Optional: Filter by avatar health status." fullWidth />
        <AutocompleteArrayInput source="targetPremiumStatus" label="Premium Status" choices={PREMIUM} helperText="Optional: Filter by premium subscription status." fullWidth />
        <NameChoices source="targetSponsor" label="Sponsors" resource="sponsors" hint="Optional: Filter by sponsors (saved, not yet used for targeting, as in the old admin)." />
        <NameChoices source="targetCampaign" label="Campaigns" resource="campaigns" hint="Optional: Filter by campaigns (saved, not yet used for targeting, as in the old admin)." />
        <ReferenceArrayInput source="accountIds" reference="app_users" perPage={50}>
          <AutocompleteArrayInput label="Additional accounts" optionText="email" filterToQuery={(q: string) => ({ q })} helperText="Optional: Add specific accounts or exceptions to the targeting criteria." fullWidth />
        </ReferenceArrayInput>
      </Section>
    </Box>
  );
}

const FormToolbar = () => (
  <Toolbar>
    <SaveButton />
  </Toolbar>
);

const SendingNote = () => (
  <Alert severity="info" sx={{ mb: 2 }}>
    This saves the notification with its schedule and targeting. Sending (in-app, push, email, SMS) has not been
    moved to the new backend yet, so nothing is sent from here for now.
  </Alert>
);

export const NotificationCreate = () => (
  <Create redirect="show" title="New Notification">
    <SimpleForm toolbar={<FormToolbar />} defaultValues={{ scheduleType: 'now', recurrenceInterval: 1, inapp: false, push: false, email: false, sms: false }}>
      <SendingNote />
      <NotificationForm />
    </SimpleForm>
  </Create>
);

export const NotificationEdit = () => (
  <Edit redirect="show" mutationMode="pessimistic" title={<NotificationTitle />}>
    <SimpleForm toolbar={<FormToolbar />}>
      <NotificationForm />
    </SimpleForm>
  </Edit>
);
