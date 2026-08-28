/** Roles that can be assigned by an organization invitation. */
export type OrganizationInvitationEmailRole = 'admin' | 'member';

/** Payload sent from the Svelte BFF to the private invitation mail capability. */
export interface OrganizationInvitationEmailRequest {
  readonly email: string;
  readonly organizationName: string;
  readonly role: OrganizationInvitationEmailRole;
  readonly invitationUrl: string;
}

/** Minimal acknowledgement returned after Cloudflare accepts the email. */
export interface OrganizationInvitationEmailResponse {
  readonly sent: true;
}
