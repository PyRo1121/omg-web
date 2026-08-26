import { signIn } from './auth-client';

export interface SocialSignupRequest {
  readonly provider: string;
}

const PUBLIC_SIGNUP_PROVIDER = 'github';

export function validateSignupRequest(request: SocialSignupRequest): string | null {
  if (request.provider !== PUBLIC_SIGNUP_PROVIDER) {
    return 'Public sign-up is limited to verified GitHub identities.';
  }
  return null;
}

export class SignupView {
  error = $state('');
  pending = $state(false);

  async github(): Promise<void> {
    const problem = validateSignupRequest({ provider: PUBLIC_SIGNUP_PROVIDER });
    if (problem !== null) {
      this.error = problem;
      return;
    }
    this.pending = true;
    this.error = '';
    try {
      const result = await signIn.social({ provider: 'github', callbackURL: '/' });
      if (result?.error) {
        this.error = result.error.message ?? 'GitHub sign-up failed';
        this.pending = false;
      }
    } catch {
      this.error = 'GitHub sign-up failed';
      this.pending = false;
    }
  }
}
