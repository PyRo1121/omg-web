import githubIconUrl from 'simple-icons/icons/github.svg?url';
import type { Component } from 'solid-js';

interface BrandIconProps {
  readonly class?: string;
}

function createBrandIcon(iconUrl: string): Component<BrandIconProps> {
  return props => (
    <span
      aria-hidden="true"
      class={`inline-block shrink-0 bg-current ${props.class ?? ''}`}
      style={{
        mask: `url("${iconUrl}") center / contain no-repeat`,
        '-webkit-mask': `url("${iconUrl}") center / contain no-repeat`,
      }}
    />
  );
}

export const GitHubIcon = createBrandIcon(githubIconUrl);
