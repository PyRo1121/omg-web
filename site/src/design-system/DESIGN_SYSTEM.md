# OMG Nightshift interface

## Design read

OMG is a developer tool for people who care about speed, control, and knowing what changed on their machine. The interface is dark, spatial, and product-led: open composition, oversized but disciplined typography, precise command surfaces, and a single chartreuse signal color. It must not resemble a brutalist manual, purple SaaS template, or wall of dashboard cards.

## Principles

1. **Space groups information.** Prefer semantic sections, lists, tables, and typography over nested containers.
2. **One dark world.** Cool off-black surfaces, soft white text, and chartreuse (`--signal`) define the brand. Green, amber, and red remain state-only colors.
3. **Tools may have surfaces.** Terminals, forms, menus, and dialogs can use soft containers because their boundaries communicate interaction. Marketing copy and metrics should remain open.
4. **One radius rule.** Interactive surfaces use 12–24px corners; action buttons are pills; data rows and prose have no surrounding card.
5. **Data stays legible.** IBM Plex Mono and tabular figures are used for metrics, commands, and tables. Dense records use semantic tables rather than responsive card duplicates.
6. **Motion explains state.** Short transform and opacity transitions communicate entry, hover, and completion. Reduced-motion preferences collapse them.

## Foundations

- Display/body: Archivo Variable, self-hosted.
- Data/code: IBM Plex Mono, self-hosted at weights 400–600.
- Accessible primitives: Kobalte.
- Server state: TanStack Solid Query.
- Data grids: TanStack Solid Table v9.
- Icons: existing Lucide Solid icons at 1.25–1.6 stroke width, always paired with accessible labels when meaning is not obvious.

## Layout

- `.manifest-shell` is retained as the compatibility name for an open `88rem` canvas. It does not draw a box around the page.
- Marketing layouts alternate asymmetric hero, editorial rows, flowing runtime type, an open benchmark table, one installation workbench, and plan rows.
- Dashboard navigation is horizontal. KPIs may use columns and rules; repeated bordered cards are prohibited.
- Below 768px, asymmetric compositions become a strict single column with reduced type scale and no overlap or rotation.

## Reusable classes

- `.manifest-shell`: constrained open canvas.
- `.manifest-section`: subtle section boundary.
- `.manifest-grid`: responsive 12-column compatibility grid.
- `.manifest-label`: compact mono metadata.
- `.manifest-index`: signal-colored identifier.
- `.manifest-button`: soft pill action.
- `.manifest-button--primary`: chartreuse primary action with dark text.

The compatibility names avoid a broad class migration; they no longer imply the former manifest aesthetic.

## Interaction requirements

- Every icon-only control has an accessible name.
- Every input has a visible label and readable error state.
- Tabs, menus, and dialogs use Kobalte unless native HTML provides the complete interaction.
- Tables include captions and scoped headers, with horizontal overflow where required.
- Loading, empty, and error states preserve the destination hierarchy.
- Focus indicators and text meet WCAG AA at minimum.

## Prohibited patterns

- Brutalist grids, square button systems, paper backgrounds, and borders around every region.
- Purple/blue mesh gradients, gradient headlines, glow shadows, or decorative floating blobs.
- Equal feature-card rows, KPI card walls, and nested container stacks.
- Fake activity, fake precision, placeholder companies, or invented trend lines.
- More than one accent color, continuous decorative animation, or scroll event listeners.
- SEO copy written for crawlers instead of people; structured data must match visible content.

## Verification

1. Run strict typecheck, lint, formatting, focused tests, and bundle budgets.
2. Inspect desktop at 1440px and mobile at 390px.
3. Exercise keyboard navigation, focus restoration, loading, empty, error, and overflow states.
4. Validate metadata, canonical URLs, structured data, heading order, and meaningful internal links.
5. Confirm the interface contains no unintended light sections, brutalist border cages, or card stacks.
