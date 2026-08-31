# omg-web verification feature map

Use the feature file matching the changed user surface. The map covers the retained SvelteKit application; the Solid application remains production authority only until cutover.

| Feature                                                    | Entry points                                       | Harness                                           |
| ---------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| [Public site](public-site.md)                              | `/`, pricing controls, compact layout              | Playwright local or deployed                      |
| [Documentation and legal](documentation-and-legal.md)      | `/docs/`, `/privacy/`, `/terms/`, sitemap, robots  | Playwright local or deployed                      |
| [Billing fail-closed behavior](billing-fail-closed.md)     | Pricing Checkout controls and checkout status      | Playwright local; controlled deployed checks only |
| [Authentication](authentication.md)                        | `/login/`, `/signup/`, protected redirects, logout | Deployed Playwright                               |
| [Account and operator workspaces](account-and-operator.md) | `/dashboard/`, `/admin/`, CSV export               | Authenticated deployed Playwright                 |

A change spanning multiple rows requires each relevant drive. Local Vite cannot prove Cloudflare-bound authentication or private Service Binding behavior.
