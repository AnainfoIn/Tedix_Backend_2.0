import { useFormContext, useWatch } from 'react-hook-form';
import {
  AutocompleteArrayInput,
  AutocompleteInput,
  FileField,
  FileInput,
  ImageField,
  ImageInput,
  ReferenceArrayInput,
  ReferenceInput,
  required,
} from 'react-admin';
import { FIELD_LABEL, FIELD_LEVEL, IdField } from './levels';

const PICK_PAGE = 500;

/**
 * Parent dropdowns that fill in step by step, like the Rails forms: pick a Country and its
 * Grades appear, pick a Grade and its Subjects appear, and so on. Changing one clears the ones below.
 */
export function CascadePickers({ fields }: { fields: IdField[] }) {
  const { setValue } = useFormContext();
  const values = useWatch({ name: fields }) as (number | null | undefined)[];
  return (
    <>
      {fields.map((field, index) => {
        const before = fields.slice(0, index);
        const filter = Object.fromEntries(before.map((f, i) => [f, values[i]]).filter(([, v]) => v != null));
        const ready = before.every((_, i) => values[i] != null);
        return (
          <ReferenceInput
            key={field}
            source={field}
            reference={FIELD_LEVEL[field]}
            filter={filter}
            perPage={PICK_PAGE}
            sort={{ field: 'name', order: 'ASC' }}
          >
            <AutocompleteInput
              label={FIELD_LABEL[field]}
              optionText="name"
              validate={required()}
              disabled={!ready}
              helperText={ready ? undefined : `Pick the ${FIELD_LABEL[fields[index - 1]].toLowerCase()} first`}
              onChange={() => fields.slice(index + 1).forEach((later) => setValue(later, null, { shouldDirty: true }))}
              fullWidth
            />
          </ReferenceInput>
        );
      })}
    </>
  );
}

/** Grades of a subject, limited to the chosen country. */
export function GradesPicker() {
  const countryId = useWatch({ name: 'countryId' });
  return (
    <ReferenceArrayInput
      source="gradeIds"
      reference="grades"
      filter={countryId ? { countryId } : {}}
      perPage={PICK_PAGE}
      sort={{ field: 'position', order: 'ASC' }}
    >
      <AutocompleteArrayInput
        label="Grades"
        optionText="name"
        validate={required()}
        disabled={!countryId}
        helperText={countryId ? undefined : 'Pick the country first'}
        fullWidth
      />
    </ReferenceArrayInput>
  );
}

/** Display icon and the three materials, with the Rails limits. */
export function MaterialInputs() {
  return (
    <>
      <ImageInput
        source="image"
        label="Display icon"
        accept={{ 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] }}
        maxSize={5 * 1024 * 1024}
        helperText="JPEG or PNG, up to 5 MB. A default icon is used if you leave it empty."
      >
        <ImageField source="src" title="title" />
      </ImageInput>
      <FileInput source="cheatsheetPdf" label="Cheatsheet (PDF)" accept={{ 'application/pdf': ['.pdf'] }} maxSize={10 * 1024 * 1024} helperText="PDF, up to 10 MB">
        <FileField source="src" title="title" target="_blank" />
      </FileInput>
      <FileInput source="summaryPdf" label="Summary (PDF)" accept={{ 'application/pdf': ['.pdf'] }} maxSize={10 * 1024 * 1024} helperText="PDF, up to 10 MB">
        <FileField source="src" title="title" target="_blank" />
      </FileInput>
      <FileInput
        source="summaryVideo"
        label="Summary (video)"
        accept={{ 'video/mp4': ['.mp4'], 'video/3gpp': ['.3gp'], 'video/x-flv': ['.flv'] }}
        maxSize={50 * 1024 * 1024}
        helperText="MP4, 3GP or FLV, up to 50 MB"
      >
        <FileField source="src" title="title" target="_blank" />
      </FileInput>
    </>
  );
}
