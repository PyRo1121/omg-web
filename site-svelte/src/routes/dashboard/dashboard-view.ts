export interface DashboardUserData {
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
}

export interface DashboardSessionData {
  readonly expiresAt: string;
}

const EXPIRY_FORMAT = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

export function verificationLabel(emailVerified: boolean): 'verified' | 'unverified' {
  return emailVerified ? 'verified' : 'unverified';
}

export function formatExpiry(expiresAt: string): string {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return expiresAt;
  }
  return `${EXPIRY_FORMAT.format(date)} UTC`;
}
