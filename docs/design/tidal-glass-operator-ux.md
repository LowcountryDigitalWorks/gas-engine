# Tidal glass — G.A.S. Operator Workspace design candidate

**Status:** SOURCE-ONLY, NON-PRODUCTION VISUAL CANDIDATE. Not a G.A.S. semantic release, release approval, public SaaS, owner acceptance, or company-wide implementation authority.

**Date:** 2026-11-12 ET
**Scope:** Release 0.17's existing, self-contained `renderOperatorWorkspaceHtml` read-only/local workbench. No new screen, data/model schema, provider, runtime service, account, customer workflow, source polling or deployment.
**Implementation:** `src/operator/workspace-html.ts` CSS only; `tests/operator/workspace-glass-style.test.ts` guards core visual/security constraints.

## Governing LDW direction and identity

Eddie directed that LDW product surfaces adopt a premium, approachable **liquid-glass-ish** visual language. This is a visual evolution, **not a rebrand**. Preserve the locked Tidal Framework identity in [business-operations BRAND-001](https://github.com/LowcountryDigitalWorks/business-operations/issues/213):

| Design token | Color |
| --- | --- |
| Estuary Navy | `#102A3A` |
| Cypress Teal | `#2F766F` |
| Warm Oyster | `#F3EFE6` |
| Soft White | `#F7F8F6` |
| Type family | `Manrope`, local/system fallback, no bundled font file or remote import |

Do not adopt different website concept palette variants as global GAS brand truth. Coordinate any broader token standard with the owning Brand/GM/Product workstreams; this implementation does not update other repositories.

## Design semantics, not decorative effects

1. **Functional glass only:** navigation/rail and workspace heading can use a shallow translucent frosted material with a distinct solid fallback. Avoid stacking translucent cards behind tables, text-heavy findings, forms, human decisions, reports, or customer evidence.
2. **Bubbly but credible:** rounded navigation pills, 16–24px card corners, soft low-elevation shadows, generously sized 44px controls. Keep labels descriptive and visible; avoid glowing pseudo-buttons, fake controls or novelty cursor effects.
3. **Evidence-first:** maintain source/provider, observation window, coverage, reason codes, unknown vs observed zero, and separate human-approved decisions. Never encode `unknown` as visual good/green, invent a universal health/SEO/AI score, or interpolate absent geographic/keyword evidence.
4. **Readable with effects disabled:** solid navy sidebar, warm-oyster header, opaque white evidence cards/tables/forms; 3px visible focus; high-contrast override, reduced-transparency override, reduced-motion override, print stylesheet. Status and action owner remain explicit text, not color only.
5. **Mobile and keyboard:** retain the existing <=800px stacked layout, native keyboard controls and semantic table structure; keep horizontal scroll within existing `.table-wrap`, not a clipped or hidden table. Test at 320/360/375/390px and desktop 1440px in the separate visual/AXE review.
6. **Static-first privacy:** no remote fonts, tracking, network, images, API, CSS `url()` or `@import`, external JS or credentials. Existing CSP and hashed script remain unchanged; do not ship a new analytics, scanner, dashboard, framework, customer profile or cloud runtime.

## Research grounding / limits

- Apple [HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials) and [Adopting Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass): material treatment establishes hierarchy of navigation/controls over content; use it sparingly and validate reduced transparency/motion/increased contrast. The G.A.S. proof uses ordinary CSS progressively, **not** Apple's native material implementation or a copy of its visual code.
- The existing Website R5 work at [Website #160](https://github.com/LowcountryDigitalWorks/lowcountrydigitalworks.com/issues/160) is the visual-fidelity owner for the public marketing site. This G.A.S. workbench is an internal evidence product, not a new Website #162 writer or reuse of the marketing landing page.
- [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) supports useful existing-page organization, not a blanket auto-page or arbitrary topic score. Future G.A.S. keyword/topical operator modules must inherit the same evidence/claim and visual conventions only after their own Product freeze.
- The SellSEO-inspired static Website Check, historical local geo-grid, Clarity tracking, R&I alt-text evaluation and reporting factory remain **distinct owner-controlled products**, not visually or semantically blended into this workbench.

## Acceptance gates / limitations

This source candidate changes **only CSS** of one existing offline operator interface. It does not establish actual browser contrast ratios, screenshot fidelity, touch usability or screen-reader satisfaction. A responsible owning Product actor must verify the exact main/head/tree, required hosted Contracts/Security, independently authored review, visual screenshots and keyboard/mobile/contrast/print cases before any accepted source release.

**Visual QA matrix:** 320, 360, 375x667, 390, 768, 1440 pixels; standard + reduced transparency + increased contrast + reduced motion; native keyboard tab/focus, wrapped table evidence, no obstructed text or sticky overlap; no unsupported content hidden by styling; print plain content. Verify both opaque fallback and supported `backdrop-filter` behavior; do not mark this complete from static source assertions alone.

Release 0.17 application authority, human decision authorization, tenant isolation and existing source/API contracts remain unchanged. Source author cannot accept or merge the branch. `$0` incremental; no owner production approval is implied.
