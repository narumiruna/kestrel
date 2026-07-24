# Radix Themes Web Rewrite Plan

## Goal

Rewrite Kestrel Web with `@radix-ui/themes` as the single UI component system and Radix Colors as its palette, while preserving authentication, library, map editing, sharing, remote-control, account-security, responsive, accessibility, and theme behavior.

## Context

- The implementation began as a Base UI rewrite. The user subsequently chose a complete Radix Themes switch rather than mixing Base UI and Radix.
- MapLibre remains the only map backend. Existing API contracts and feature state stay in their current components.
- Browser verification must use Chrome DevTools rather than Playwright automation for this task.

## Architecture

- Remove `@base-ui/react`; use `@radix-ui/themes` and its bundled Radix primitives as the only component system.
- Keep shared Kestrel compositions in `web/components/ui/`, backed exclusively by Radix Themes.
- Use Radix Theme, Button, TextField/TextArea, Checkbox, Select, Tabs, DropdownMenu, Popover, Dialog/AlertDialog, Tooltip, Collapsible, and ToggleGroup where applicable.
- Keep ordinary semantic structure and MapLibre canvas integration, but do not mix another UI/headless component library.
- Keep Map and Library on shared semantic workspace surface tokens in `web/app/workspace-theme.css`.

## Non-Goals

- Backend or Android changes.
- Replacing MapLibre.
- Removing existing product capabilities.

## Risks

- Radix Themes global styles can change existing control dimensions and CSS specificity.
- Portal stacking must remain correct over MapLibre.
- Replacing the in-progress Base UI wrappers can invalidate state attributes and test selectors.

## Plan

- [x] Replace the dependency direction in `web/package.json`: remove `@base-ui/react`, add `@radix-ui/themes`, retain `@radix-ui/colors`; verify installed package APIs. Evidence: `npm ls --depth=0` reports `@radix-ui/themes@3.3.0`, `@radix-ui/colors@3.0.0`, and `radix-ui@1.6.6`; Base UI is absent.
- [x] Map Kestrel semantic colors and shared Map/Library workspace surfaces to Radix Colors. Evidence: `web/app/globals.css` and `web/app/workspace-theme.css`; Chrome DevTools reported identical Map/Library panel, border, and chrome computed colors with zero desktop horizontal overflow.
- [x] Replace the Base UI provider/compositions with Radix Themes in `web/components/ui/radix-ui.tsx`, `web/components/ThemeProvider.tsx`, and `web/app/radix-ui.css`. Evidence: repository import search found no `@base-ui` import; typecheck passed.
- [x] Convert login, shell, library, sharing, remote-control, account-security, map, place, and route interactions to Radix compositions while preserving keyboard, focus, escape, and destructive-confirmation behavior. Evidence: Chrome DevTools verified Tabs, Select options, Collapsible state, waypoint DropdownMenu, Popover, Dialog, AlertDialog, Escape dismissal, and the unsaved-draft AlertDialog.
- [x] Apply Radix Themes to ordinary controls so ownership is not limited to composites. Evidence: all application buttons now render through Radix `Button`; text inputs and text areas render through Radix `TextField`/`TextArea`; native-interactive-tag search is empty.
- [x] Remove Base UI artifacts and update UI selectors to final Radix state semantics. Evidence: files are now `radix-ui.tsx`/`radix-ui.css`; tests use `data-state`; repository searches found no native dialogs/details/selects/checkboxes/browser confirms and no non-Radix UI imports.
- [x] Inspect Login, Library, Map, Account Security, and public Share in Chrome DevTools at desktop and constrained 390×844 mobile browsing contexts, including light/dark themes and horizontal overflow. Evidence: inspected `/login`, `/dashboard/library`, `/dashboard/map`, `/dashboard/account`, and `/share/9msdt2nozq3AA3xLZdr8t848`; desktop was 1200×792 and iframe mobile context was 390×844; observed overflow was 0. Reviewed light/dark screenshots and corrected dark Map token inheritance and mobile map-control contrast.
- [x] Run formatting and build gates. Evidence: `just web-format`, `just web-check`, `just web-lint`, `cd web && npm run typecheck`, and `cd web && npm run build -- --webpack` all passed.

## Completion Checklist

- [x] `@radix-ui/themes` is the only UI component system; its `radix-ui` primitives cover behavior absent from Themes, and Base UI/mixed-library imports are absent.
- [x] All directly affected Kestrel Web capabilities and recovery interactions remain available.
- [x] Map and Library use the same shared workspace color/surface treatment.
- [x] Required desktop/mobile, light/dark, accessible-name/label/duplicate-ID, and overflow checks were verified through Chrome DevTools.
- [x] Formatting, lint, typecheck, and production Webpack build pass.
- [x] Archive this completed plan under `docs/plans/archived/`.
