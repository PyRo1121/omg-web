import { githubSignInError } from './github-sign-in';

export class SignupView {
  constructor(private readonly destination: () => string = () => '/dashboard/') {}

  error = $state('');
  pending = $state(false);

  async github(): Promise<void> {
    this.pending = true;
    this.error = '';
    this.error = await githubSignInError(this.destination, 'GitHub sign-up failed');
    if (this.error !== '') {
      this.pending = false;
    }
  }
}
