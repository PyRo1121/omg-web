# OMG command interface

## Design read

OMG is a developer tool for people who want fewer commands, fewer hidden state transitions, and less setup documentation. The interface is concise and command-led: graphite surfaces, bone typography, construction orange, sharp geometry, and large editorial statements supported by inspectable product evidence.

It must not resemble a floating-card SaaS template, a terminal-themed hacker page, or a documentation manual pasted onto the homepage.

## Principles

1. **Lead with the reduction.** Marketing pages explain the problem, show the changed workflow, prove the speed, state the price, and provide one installation path. Detailed capability coverage belongs in Docs.
2. **Typography is the image.** Archivo carries the visual identity. Diagrams and tables represent real product behavior; decorative fake terminals and abstract gradients are prohibited.
3. **One decisive signal.** Construction orange (`--signal`) identifies actions, active state, and the OMG control point. Green, amber, and red remain status-only colors.
4. **Rules create structure.** Hairlines connect related information into one composition. They must not turn independent prose into a wall of cards.
5. **Sharp means precise.** Marketing controls and tool surfaces use 2–6px corners. Pills are reserved for semantic chips that genuinely need them.
6. **Data stays inspectable.** IBM Plex Mono and tabular figures are used for commands, metrics, metadata, and tables.
7. **Motion establishes hierarchy.** A short first-view entrance is allowed. State changes use transform and opacity, respect reduced motion, and never become decoration.

## Foundations

- Display/body: Archivo Variable, self-hosted.
- Data/code: IBM Plex Mono, self-hosted at weights 400–600.
- Accessible primitives: Kobalte.
- Server state: TanStack Solid Query.
- Data grids: TanStack Solid Table v9.
- Icons: existing Lucide Solid icons at 1.25–1.6 stroke width, with accessible labels where meaning is not obvious.

## Layout

- `.manifest-shell` is retained as a compatibility name for an `82rem` canvas.
- The marketing page uses five chapters: reduction, workflow, evidence, plans, and install.
- Landing-page information is deliberately bounded; deep product explanations link to Docs.
- Dashboard navigation remains horizontal. Dense records use semantic tables and sparse rules rather than repeated KPI cards.
- Below 768px, asymmetric compositions become one column. Wide comparison tables use intentional horizontal overflow.

## Reusable classes

- `.manifest-shell`: constrained canvas.
- `.manifest-section`: subtle section boundary.
- `.manifest-grid`: responsive 12-column compatibility grid.
- `.manifest-label`: compact mono metadata.
- `.manifest-index`: signal-colored identifier.
- `.manifest-button`: sharp secondary action.
- `.manifest-button--primary`: orange primary action with dark text.

## Interaction requirements

- Every icon-only control has an accessible name.
- Every input has a visible label and readable error state.
- Tabs, menus, and dialogs use Kobalte unless native HTML provides the complete interaction.
- Tables include captions and scoped headers, with horizontal overflow where required.
- Loading, empty, and error states preserve the destination hierarchy.
- Focus indicators and text meet WCAG AA at minimum.

## Prohibited patterns

- Floating capsule navigation, pill-button systems, glass cards, and decorative fake terminals.
- Purple/blue mesh gradients, gradient headlines, glow shadows, or decorative blobs.
- Centered hero stacks, equal feature-card rows, pricing towers, and KPI card walls.
- Italic accent words, tiny labels above every heading, or invented product screenshots.
- Fake activity, fake precision, placeholder companies, or invented trend lines.
- More than one marketing accent, continuous decorative animation, or scroll event listeners.
- SEO copy written for crawlers; structured data must match visible content.

## Verification

1. Run strict typecheck, lint, formatting, focused tests, and bundle budgets.
2. Inspect desktop at 1440px and mobile at 390px.
3. Exercise keyboard navigation, focus restoration, loading, empty, error, and overflow states.
4. Validate metadata, canonical URLs, structured data, heading order, and meaningful internal links.
5. Confirm the landing page reads in one glance before asking the user to open Docs.
