# G.A.S. Signal Glass — distinct product identity and dark-first operator UX

**Status:** REVIEW CANDIDATE ONLY; not a semantic G.A.S. release, public customer SaaS, deployment, brand-kit replacement, or Product acceptance.

**Owner refinement (2026-11-12 ET):** All LDW applications should share a polished, accessible *liquid-glass-ish quality bar* **without all looking like the same brand-color website**. Every product can use a differentiated visual identity and palette. **Dark mode is the default**, with a visible usable light-mode switch. LDW logo(s) may be adapted in authorized palette/contrast variants for the product, while retaining truthful LDW provenance. The accepted corporate [BRAND-001](https://github.com/LowcountryDigitalWorks/business-operations/issues/213) still governs the corporate website, stationery and canonical logo **source**; it is not a mandatory UI color scheme for every product.

## G.A.S. identity — Signal Intelligence

G.A.S. is the LDW source-preserving Search / SEO / AI Visibility evidence workbench. It should feel like a deep-night observatory with clear signals, *not* a second replica of the LDW public marketing site.

| Role | Dark default | Optional light |
| --- | --- | --- |
| Application canvas | Deep night `#0B101B` | Cool mist `#EFF3FA` |
| Navigation | Midnight `#0E1726` | Periwinkle mist `#E4E8F7` |
| Evidence surface | Blue charcoal `#162235` | White `#FFFFFF` |
| Text | Ice `#F1F5FB` | Blue-black `#17213B` |
| Secondary text | Quiet cloud `#B4C3D9` | Slate `#3D4C69` |
| Active control | Spectral lilac `#A59BFF` | Deep violet `#5146BE` |
| Secondary signal | Cool cyan accent, future extension only | Product-specific, not Tidal teal |
| Typography | Manrope when locally installed; system fallback; NO remote font | Same |

All these are **candidate product tokens**, not a new corporate logo/palette or an implied company-wide palette mandate. The local workbench uses textual `G.A.S. / Signal Intelligence` identification. Adapting or adding actual LDW logo image/vector variants requires the owning authorized brand assets and Product visual acceptance; **no novel or altered corporate logo was inserted** in this implementation.

## Implementation boundary

Files: `src/operator/workspace-html.ts` appearance layer, a small *presentation-only* mode-switch handler inside its existing hashed inline script, `tests/operator/workspace-glass-style.test.ts` and this spec. This is an extension of accepted Release 0.17 local `renderOperatorWorkspaceHtml`, not a new network listener, provider, schema, sensor, scoring model, tenant authority, customer portal or editorial action.

- Initial DOM explicitly declares `data-theme="dark"` regardless of OS/browser settings, as directed by the LDW owner. `:root { color-scheme: dark }` enables browser-native dark form controls.
- Existing local operator sidebar gets a keyboard-operable labeled `Light mode` switch (`role=switch`, `aria-checked`), switching `data-theme` and `color-scheme:light` along with visible `on/off` text.
- The choice is **in-memory for the current HTML document only**. No cookies, `localStorage`, tracking, saved preferences, hidden provider calls, external images, remote fonts, CSS imports or network. Reload defaults to dark; preservation across sessions is **not** promised, and would require a future privacy/storage and UX decision.
- Existing script content hash is deterministically recomputed by `renderOperatorWorkspaceHtml`. Keep the strict `default-src 'none'`, `connect-src 'none'`, `form-action 'none'` CSP. No new script file, API endpoint, upstream dependency or deployment.
- Dark and light use **opaque** tables, metrics, forms and reports. Glass blur is allowed on functional navigation/header chrome only; explicit solid fallbacks for browsers without support and users preferring reduced transparency/increased contrast.
- Existing six-item mobile sidebar navigation changes to a compact **horizontally scrollable** row at <=800px instead of taking six vertically stacked rows. It remains six real native buttons, visible labels, >=44px height, focus outlines and accessible overflow. The existing tables retain a separate horizontal overflow wrapper; test small screens for navigation and table scroll independently.
- Native printer output uses light text/surfaces and hides interactive controls regardless of selected screen mode. Source and consent/decision-state semantics remain unchanged.

## UX quality and evidence integrity

The primary G.A.S. job is: **what evidence exists, what changed, what is uncertain, who decides, what happened after review?** Do not use neon glow, gradients, provider heatmap colors, decorative glass or a universal proprietary score to claim evidence that does not exist. Observed numeric zero is not missing/not-measured, unranked review attention is not business priority, and a human-entered recommendation is not an executed action.

Accessibility requires more than source string checks. The approved **solid sample pairs** for both themes were checked by deterministic luminance test against **WCAG 2.2 AA 4.5:1** (not a whole-screen WCAG or mobile guarantee). Actual browser visual QA must still check states/background blending and discoverability. Respect focus-visible, >=44px nav/control heights, named switch, type contrast, reduced transparency, reduced motion and increased contrast. Browser-native control appearance follows [MDN color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color-scheme); normal text contrast follows [W3C WCAG 2.2 Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum). Material 3 uses [tonal elevation](https://developer.android.com/develop/ui/compose/designsystems/material3) to distinguish dark surfaces rather than stacking transparent content cards.

## Non-overlap / next QA gate

This is **only the G.A.S. operator shell**. It does not redesign Website R5 #160/#162, site-audit widget #124, geo-grid #126, WQT scanner HTML, Clarity privacy #132, topical opportunity #104, R&I alt-text proof, and external/client reports. Each retains its owner and may adopt a *distinct* identity at its own acceptance gate. The shared company-wide design criteria are fluid treatment, usability, trust, accessibility, performance and brand provenance, **not identical hex colors or logos**.

Before release verify a real synthetic fixture in browsers at **375×667, 320, 360, 390, 768, 1440**, both modes, keyboard tab/scroll/focus, input appearance, legibility of evidence tables/fields/error states, no obstructed content or unexpected page width, reduced-transparency/contrast/motion, browser `backdrop-filter` support/fallback, print and a correct CSP hash. Source tests and hosted Contracts/Security are necessary but do not substitute for screenshots/browser AXE. An independent author-excluded review and distinct G.A.S. Product acceptance are required, and the source author cannot self-merge.

Incremental budget: **$0 included**. No change to canonical evidence schema, persistence, cloud runtime, customer data, credentials or production configuration.
