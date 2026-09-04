import { authClient } from './auth-client';

export class SignOutView {
  pending = $state(false);

  async signOut(): Promise<void> {
    this.pending = true;
    try {
      await authClient.signOut();
    } finally {
      window.location.assign('/');
    }
  }
}
