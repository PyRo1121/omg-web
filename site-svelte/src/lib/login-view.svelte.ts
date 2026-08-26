import { signIn } from './auth-client';

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCredentials(credentials: Credentials): string | null {
  if (!EMAIL_PATTERN.test(credentials.email)) {
    return 'Enter a valid email address.';
  }
  if (credentials.password.length === 0) {
    return 'Enter your password.';
  }
  return null;
}

export class LoginView {
  email = $state('');
  password = $state('');
  error = $state('');
  pending = $state(false);

  async submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const problem = validateCredentials({ email: this.email, password: this.password });
    if (problem !== null) {
      this.error = problem;
      return;
    }
    this.pending = true;
    this.error = '';
    try {
      const result = await signIn.email({ email: this.email, password: this.password });
      if (result.error) {
        this.error = result.error.message ?? 'Login failed';
        return;
      }
      window.location.assign('/');
    } catch {
      this.error = 'An unexpected error occurred';
    } finally {
      this.pending = false;
    }
  }

  async github(): Promise<void> {
    this.pending = true;
    this.error = '';
    try {
      const result = await signIn.social({ provider: 'github', callbackURL: '/dashboard/' });
      if (result?.error) {
        this.error = result.error.message ?? 'GitHub sign-in failed';
        this.pending = false;
      }
    } catch {
      this.error = 'GitHub sign-in failed';
      this.pending = false;
    }
  }
}
