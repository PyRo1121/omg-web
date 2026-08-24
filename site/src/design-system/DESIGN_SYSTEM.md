# OMG Manifest interface

## Design read

OMG is a technical operations product for Linux developers and engineering teams. Its interface uses a Swiss-industrial “package manifest” language: rigid information grids, high-contrast typography, semantic tables, and one signal color. It must resemble a carefully typeset operations manual rather than a generic SaaS dashboard.

## Principles

1. **Information before containers.** Group related data with headings, rules, table semantics, and whitespace. Do not wrap every metric in a card.
2. **One visual language.** Paper (`--paper`), carbon (`--ink`), rules, and signal red (`--signal`) are the visual palette. Green, amber, and red are reserved for state.
3. **Data is tabular.** Numeric values use IBM Plex Mono with tabular figures. Customer and operational records use semantic tables, not responsive card duplicates.
4. **Geometry communicates structure.** Corners are square. Shadows, glass blur, gradients, and decorative glows are prohibited.
5. **Progressive disclosure.** Primary pages show summaries and tables. Kobalte dialogs, menus, and tabs handle focused interaction and keyboard behavior.
6. **Motion is feedback.** Only short transform/opacity transitions are allowed. Reduced-motion preferences disable them.

## Foundations

- Display/body: Archivo Variable, self-hosted with `font-display: swap`.
- Data/code: IBM Plex Mono, self-hosted at weights 400–600.
- Accessible primitives: Kobalte.
- Server state: TanStack Solid Query.
- Data grids: TanStack Solid Table v9 with reactive getters and semantic markup.
- Icons: the existing Lucide Solid set at 1.25–1.6 stroke width. Icons supplement labels; they never replace ambiguous text.

## Layout

- Maximum canvas: `96rem`, represented by `.manifest-shell`.
- Structural pages use a 12-column `.manifest-grid` and collapse to one column below 768px.
- Sections meet at visible 1px rules. Nested groups use `--rule`; major boundaries use `--ink`.
- Marketing sections alternate information structures: hero split, feature ledger, runtime catalog, benchmark table, install workbench, and plan matrix.
- Dashboard tabs form a single horizontal index. Data regions use lists, definitions, and tables before panels.

## Reusable classes

- `.manifest-shell`: constrained page canvas with side rules.
- `.manifest-section`: major top boundary.
- `.manifest-grid`: responsive 12-column structural grid.
- `.manifest-label`: 11px uppercase operational metadata.
- `.manifest-index`: signal-red section or record identifier.
- `.manifest-button`: square, high-contrast action.
- `.manifest-button--primary`: signal-red primary action.

These are structural vocabulary, not a substitute for semantic HTML.

## Interaction requirements

- Every icon-only control has an accessible name.
- Every input has a visible label.
- Tabs, menus, and dialogs use Kobalte unless native HTML provides the complete interaction.
- Tables include a caption (visible or screen-reader-only), scoped headers, and horizontal overflow on narrow screens.
- Loading states resemble the destination structure. Empty and error states explain the next action.
- Disabled controls retain readable contrast and expose the native `disabled` state.

## Prohibited patterns

- Gradient text or multicolor accents.
- Glass surfaces, backdrop blur on scrolling content, glow shadows, or floating color blobs.
- Equal-height feature cards, KPI card walls, and separate mobile card/table implementations.
- Decorative badges such as “Popular” or “Best value” without operational meaning.
- Fake activity, fake precision, placeholder companies, or invented trend lines.
- Manual focus traps when Kobalte provides the primitive.
- Continuous animation, confetti, or scroll listeners.

## Verification

Before shipping a UI change:

1. Run strict typecheck, lint, formatting, focused tests, and bundle budgets.
2. Inspect desktop at 1440px and mobile at 390px.
3. Exercise keyboard navigation, focus restoration, loading, empty, error, and overflow states.
4. Confirm body text meets WCAG AA and controls have visible focus.
5. Confirm the page contains no unintended gradients, blur, or rounded card stacks.

## References

- Kobalte component guidance: <https://kobalte.dev/docs/core/overview/introduction/>
- TanStack Solid Table: <https://tanstack.com/table/latest/docs/framework/solid>
- Carbon dashboard guidance: <https://carbondesignsystem.com/data-visualization/dashboards/>
- Carbon data-table guidance: <https://carbondesignsystem.com/components/data-table/usage/>
