import { UnprocessableEntityException } from '@nestjs/common';

export type FieldErrors = Record<string, string[]>;

/** 422 with field errors, the shape the admin panel shows next to form inputs. */
export function throwIfErrors(errors: FieldErrors): void {
  const clean = Object.fromEntries(Object.entries(errors).filter(([, list]) => list.length));
  if (Object.keys(clean).length) {
    throw new UnprocessableEntityException({
      statusCode: 422,
      message: Object.values(clean).flat().join(', '),
      errors: clean,
    });
  }
}

export function baseError(message: string): never {
  throw new UnprocessableEntityException({ statusCode: 422, message, errors: { base: [message] } });
}
