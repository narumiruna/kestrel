# Cross-platform icon alignment plan

## Goal

Give Kestrel one centrally managed brand icon across Web and Android, and make UI glyph sizing and alignment consistent through one icon catalog and renderer per platform.

## Context

- Android launcher foreground and monochrome resources and the new Web favicon currently duplicate the same four path shapes.
- The Web brand mark duplicates those paths again, while Web controls mix Radix Icons with locally drawn SVG glyphs and scattered size rules.
- Android Compose screens import Material icons directly and rely on a mix of default and hard-coded sizes.
- Kestrel requires Radix Icons on Web and Material icons on Android; this change should centralize their use rather than introduce another icon library.

## Architecture

- `branding/kestrel-icon.json` is the source of truth for brand geometry and colors.
- `scripts/generate-kestrel-icons.mjs` deterministically generates the Web favicon and Android adaptive-icon layers, and supports a read-only `--check` mode.
- `web/components/ui/icons.tsx` is the only Web UI glyph catalog and applies the shared `.ui-icon` class to Radix Icons.
- `app/src/main/java/dev/narumi/kestrel/ui/components/KestrelIcons.kt` is the Android Material icon catalog and provides the standard Compose icon renderer and size tokens.
- Generated files remain committed so normal Web and Android builds do not require generation as a hidden side effect.

## Non-Goals

- Do not add a second icon library on either platform.
- Do not redesign navigation, labels, or control behavior.
- Do not commit generated preview images or screenshot binaries.

## Plan

- [x] Add the brand manifest, deterministic generator, `just icons` / `just icons-check` recipes, and CI path coverage; `just icons-check` reports that generated assets are current.
- [x] Generate aligned Web and Android brand assets, use the generated Web icon in `BrandMark`, and use the generated monochrome mark for Android notifications; file and reference inspection confirms all brand surfaces resolve to generated assets.
- [x] Add the shared Web Radix icon catalog and base sizing rule, replace local SVG glyphs and direct Radix imports, and remove redundant per-component icon geometry; `rg` confirms only `web/components/ui/icons.tsx` imports `@radix-ui/react-icons` and no TSX file contains inline SVG.
- [x] Add the shared Android Material icon catalog, renderer, and size tokens, then replace direct Material icon imports and direct `Icon` calls; `rg` confirms only `KestrelIcons.kt` imports Material icons or calls `Icon` directly.
- [ ] Run generation drift checks, Web formatting/lint/tests/typecheck/build, and Android formatting/lint/unit tests/build; use PR CI for SDK-dependent Android checks because no local Android SDK is configured, and record pre-existing warnings without broad unrelated fixes.
- [ ] Move this completed plan to `docs/plans/archived/` after every completion check passes.

## Risks

- Replacing bespoke Web glyphs with Radix equivalents can change silhouettes; retain labels, tooltips, and pressed/expanded state so meaning does not depend on shape alone.
- Explicit Android size tokens can affect rendering; keep the Material default at 24 dp and preserve existing badge and empty-state sizes. Screenshot validation is not a usable gate because the repository intentionally excludes binary reference images.
- Generated brand files can drift if edited directly; mark them generated and enforce `--check` in local and CI quality gates.

## Completion Checklist

- [ ] One manifest owns brand paths and colors, and generated Web/Android assets pass `just icons-check`.
- [ ] Web favicon, in-product brand marks, Android launcher layers, themed icon, and notification small icon use the aligned Kestrel mark.
- [ ] Web UI glyphs come from the central Radix catalog and share one default size/alignment rule.
- [ ] Android UI glyphs come from the central Material catalog and renderer with named size tokens.
- [ ] No image binary is added or staged.
- [ ] All affected Web and Android checks pass.
