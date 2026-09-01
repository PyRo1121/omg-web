declare global {
  interface Navigator {
    readonly globalPrivacyControl?: boolean;
  }
}

export function browserPrivacySignalEnabled(): boolean {
  if (!('navigator' in globalThis)) {
    return false;
  }
  return (
    globalThis.navigator.globalPrivacyControl === true || globalThis.navigator.doNotTrack === '1'
  );
}
