import * as bcrypt from 'bcryptjs';

/**
 * Devise stores bcrypt hashes ("$2a$12$...") in `encrypted_password` with no pepper,
 * so bcryptjs can check and create them. Passwords set here still work in Rails.
 */
export const BCRYPT_COST = 12;

export async function verifyPassword(password: string, encrypted: string | null | undefined): Promise<boolean> {
  if (!password || !encrypted || !encrypted.startsWith('$2')) return false;
  try {
    return await bcrypt.compare(password, encrypted);
  } catch {
    return false;
  }
}

export function hashPassword(password: string, cost = BCRYPT_COST): Promise<string> {
  return bcrypt.hash(password, cost);
}

/** Same rules as the Rails AdminUser model: 6 to 20 characters, no spaces, confirmed. */
export function passwordErrors(password: unknown, confirmation: unknown): string[] {
  const errors: string[] = [];
  if (typeof password !== 'string' || password.length === 0) {
    errors.push("Password can't be blank");
    return errors;
  }
  if (password.length < 6) errors.push('Password is too short (minimum is 6 characters)');
  if (password.length > 20) errors.push('Password is too long (maximum is 20 characters)');
  if (/\s/.test(password)) errors.push('Password must not contain spaces');
  if (confirmation === undefined || confirmation === null || confirmation === '') {
    errors.push("Password confirmation can't be blank");
  } else if (confirmation !== password) {
    errors.push("Password confirmation doesn't match with password");
  }
  return errors;
}
