declare global {
  interface Navigator {
    readonly globalPrivacyControl?: boolean;
  }
}

interface BrowserPrivacySignals {
  readonly globalPrivacyControl?: boolean;
  readonly doNotTrack?: string | null;
}

export function browserPrivacySignalEnabled(signals: BrowserPrivacySignals | undefined): boolean {
  return signals?.globalPrivacyControl === true || signals?.doNotTrack === '1';
}
