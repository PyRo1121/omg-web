const TIMESTAMP_FORMAT = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

export function verificationLabel(emailVerified: boolean): 'verified' | 'unverified' {
  return emailVerified ? 'verified' : 'unverified';
}

export function providerLabel(provider: string): string {
  if (provider === 'github') {
    return 'GitHub';
  }
  if (provider === 'credential') {
    return 'Password';
  }
  return provider;
}

export function formatProductLabel(value: string): string {
  return value
    .split(/[-_\s]+/u)
    .filter(part => part.length > 0)
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

export function machineAllowanceLabel(active: number, maximum: number): string {
  return `${active} of ${maximum}`;
}

export function formatTimestamp(value: string | null): string {
  if (value === null) {
    return 'Unavailable';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unavailable';
  }
  return `${TIMESTAMP_FORMAT.format(date)} UTC`;
}
