import { validateLoginCredentials } from '../../../shared/login-credentials';
import { signIn } from './auth-client';

export class LoginView {
  constructor(private readonly destination: () => string = () => '/dashboard/') {}

  email = $state('');
  password = $state('');
  error = $state('');
  pending = $state(false);

  async submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const problem = validateLoginCredentials({ email: this.email, password: this.password });
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
      window.location.assign(this.destination());
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
      const result = await signIn.social({
        provider: 'github',
        callbackURL: this.destination(),
      });
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
