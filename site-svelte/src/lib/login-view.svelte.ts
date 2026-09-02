import { validateLoginCredentials } from '../../../shared/login-credentials';
import { githubSignInError } from './github-sign-in';
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
    this.error = await githubSignInError(this.destination, 'GitHub sign-in failed');
    if (this.error !== '') {
      this.pending = false;
    }
  }
}
