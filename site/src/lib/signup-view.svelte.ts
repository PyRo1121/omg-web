import { githubSignInError, type GitHubSocialSignIn } from './github-sign-in';
import { signIn } from './auth-client';

export class SignupView {
  constructor(
    private readonly destination: () => string = () => '/dashboard/',
    private readonly socialSignIn: GitHubSocialSignIn = signIn.social
  ) {}

  error = $state('');
  pending = $state(false);

  async github(): Promise<void> {
    this.pending = true;
    this.error = '';
    this.error = await githubSignInError(
      this.destination,
      'GitHub sign-up failed',
      this.socialSignIn
    );
    if (this.error !== '') {
      this.pending = false;
    }
  }
}
