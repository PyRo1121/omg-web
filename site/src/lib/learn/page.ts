import type { DocsTopic } from '../docs/topic';

export interface LearningContent {
  readonly sections: DocsTopic['sections'];
  readonly sources: readonly { readonly title: string; readonly href: string }[];
  readonly related: readonly string[];
}
