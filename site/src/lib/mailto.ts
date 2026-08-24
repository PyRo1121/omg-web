import * as Schema from 'effect/Schema';

const MailboxSchema = Schema.String.pipe(
  Schema.maxLength(254),
  Schema.pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/u)
);

/** Open a mail composer only for a strictly decoded mailbox value. */
export function openMailComposer(email: string): void {
  const decoded = Schema.decodeUnknownEither(MailboxSchema)(email);
  if (decoded._tag === 'Left') {
    return;
  }
  const link = document.createElement('a');
  link.href = `mailto:${encodeURIComponent(decoded.right)}`;
  link.rel = 'noopener noreferrer';
  link.click();
}
