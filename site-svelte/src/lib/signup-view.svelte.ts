import { signIn } from './auth-client';

export class SignupView {
  constructor(private readonly destination: () => string = () => '/dashboard/') {}

  error = $state('');
  pending = $state(false);

  async github(): Promise<void> {
    this.pending = true;
    this.error = '';
    try {
      const result = await signIn.social({
        provider: 'github',
        callbackURL: this.destination(),
      });
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
