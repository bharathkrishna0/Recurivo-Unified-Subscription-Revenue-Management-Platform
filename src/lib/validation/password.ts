/**
 * Brief-specific rule (AUTH-02): longer than eight characters with an
 * uppercase letter, a lowercase letter and a special character. The minimum
 * length is configurable per organization.
 */
export interface PasswordCheck {
  ok: boolean;
  failures: string[];
}

export function checkPassword(password: string, minLength = 9): PasswordCheck {
  const failures: string[] = [];
  if (password.length < minLength) failures.push(`At least ${minLength} characters`);
  if (!/[A-Z]/.test(password)) failures.push("An uppercase letter");
  if (!/[a-z]/.test(password)) failures.push("A lowercase letter");
  if (!/[^A-Za-z0-9]/.test(password)) failures.push("A special character");
  if (password.length > 256) failures.push("At most 256 characters");
  return { ok: failures.length === 0, failures };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
