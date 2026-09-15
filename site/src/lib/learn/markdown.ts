import { SITE_ORIGIN } from '../../../../shared/public-site';
import type { DocsBlock } from '../docs/topic';
import { learningHref, type LearningPageMeta } from './catalog';
import type { LearningContent } from './page';

function codeBlock(lines: readonly string[]): string {
  return `\`\`\`sh\n${lines.join('\n')}\n\`\`\``;
}

function row(cells: readonly string[]): string {
  return `| ${cells.map(cell => cell.replaceAll('|', '\\|').replaceAll('\n', ' ')).join(' | ')} |`;
}

function absolute(href: string): string {
  return href.startsWith('/') ? `${SITE_ORIGIN}${href}` : href;
}

function blockMarkdown(block: DocsBlock): string {
  switch (block.kind) {
    case 'paragraphs':
      return block.paragraphs.join('\n\n');
    case 'commands':
      return `### ${block.title}\n\n${codeBlock(block.commands)}`;
    case 'bullets':
      return block.items.map(item => `- ${item}`).join('\n');
    case 'note':
      return `> ${block.text}`;
    case 'steps':
      return block.steps
        .map(
          (step, index) =>
            `${index + 1}. ${step.text}${
              step.command
                ? `\n\n${codeBlock([step.command])
                    .split('\n')
                    .map(line => `   ${line}`)
                    .join('\n')}`
                : ''
            }`
        )
        .join('\n\n');
    case 'table': {
      return `### ${block.title}\n\n${[row(block.columns), row(block.columns.map(() => '---')), ...block.rows.map(row)].join('\n')}`;
    }
  }
}

export function learningMarkdown(meta: LearningPageMeta, content: LearningContent): string {
  return [
    `# ${meta.title}`,
    meta.description,
    `Canonical: ${SITE_ORIGIN}${learningHref(meta)}\nUpdated: ${meta.modified}\nAuthor: OMG maintainers`,
    ...content.sections.map(
      section => `## ${section.heading}\n\n${section.blocks.map(blockMarkdown).join('\n\n')}`
    ),
    '## Sources and verification',
    'Source-reviewed guidance; not a claim of execution on every supported platform.',
    ...content.sources.map(source => `- [${source.title}](${absolute(source.href)})`),
    '## Related pages',
    ...content.related.map(href => `- ${absolute(href)}`),
    '',
  ].join('\n\n');
}
