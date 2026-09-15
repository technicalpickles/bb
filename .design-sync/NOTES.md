# design-sync notes for bb

## Setup and build order

- The design system is `packages/shared-ui` (`@bb/shared-ui`), a source-only package with per-component subpath exports, no `dist/`, no barrel. `apps/app/src/components/ui/` holds Ladle stories and app wrappers, not the primitives.
- There's no Storybook; bb uses Ladle, so this runs in the `package` shape.
- Run the converter with `--node-modules apps/app/node_modules` and NO `--entry`. That dir has `@bb/shared-ui` symlinked in, so PKG_DIR resolves to the package and the converter builds its entry from `src/`. Passing `--entry packages/shared-ui/package.json` gets treated as a JS entry and finds zero components.
- Because PKG_DIR is the symlink path (`apps/app/node_modules/@bb/shared-ui`), every package-relative config path (`extraFonts`, `docsDir`) resolves lexically from there, not from `packages/shared-ui`. That's why `docsDir` is `../../../../../.design-sync/docs`.
- Type contracts: write `packages/shared-ui/index.d.ts` (gitignored) as `export * from "./src/components/ui/<file>"` for every non-test `.tsx` in `src/components/ui/`. Without it every `<Name>.d.ts` comes out `[key: string]: unknown`. The converter reads `<pkg>/index.d.ts` by default and ts-morph resolves through to the `.tsx` source.
- CSS is Tailwind v4 compiled from `apps/app/src/components/ui/theme.css` (which `@source`s `apps/app/src` and `shared-ui/src`). `cfg.buildCmd` compiles `.design-sync/tailwind.css` (imports theme.css, adds `@source` for `.design-sync/previews`) into `packages/shared-ui/.ds-css/bb.css`. `cssEntry` has to live under PKG_DIR, hence the package-local output. **Re-run buildCmd after editing any preview**, or new utility classes in the preview won't exist.
- `@tailwindcss/cli@4.3.3` and `tw-animate-css` get installed into `.ds-sync/` alongside the converter deps. The repo lockfile isn't touched.
- Fonts: `@fontsource-variable/inter` via `extraFonts` (`../../@fontsource-variable/inter/index.css`, relative to the symlinked PKG_DIR).

## Render check environment

- Playwright's Chromium download failed twice (sandbox blocked storage.googleapis.com, then the CDN connection dropped mid-zip). Use system Chrome instead: `DS_CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`.
- Chrome can't launch inside the Claude Code command sandbox (`browserType.launch: Target page, context or browser has been closed`). Run `package-validate.mjs` / `package-capture.mjs` with the sandbox disabled.

## Scope decisions (first sync, 2026-09-15)

- Pilot: authored previews for Button, Pill, Badge, Card, Input, Switch, Alert, Tooltip. Everything else ships on the floor card.
- Held back via `componentSrcMap: null` (render near-blank without props, need authored previews first): Avatar, BreadcrumbEllipsis, Checkbox, Icon, InputOTPSeparator, PaginationEllipsis, Progress, Slider, Textarea, ResourceActionButton, ResourceIconFrame, ResourceMultiSelectMenu, ResourceOptionMenu, ResourceOverflowMenu, ResourceRowDetailChevron. They're still in `_ds_bundle.js` (`window.BbUI.Icon` works); they just have no card or `.d.ts` in the project.
- Sections come from `.design-sync/docs/<Name>.md` stubs (`category` frontmatter + "Composes with" siblings from the same source file + an example for the authored 8). A stub replaces the synthesized prompt body, which is why the stubs carry the sibling list and examples themselves. They were generated from a file-to-section table; a new component needs its own stub or it lands ungrouped.
- `TooltipProvider` is the `cfg.provider`.

## Known render warns

- `[TOKENS_MISSING]` for `--bb-app-chrome-row-height`, `--bb-shell-height`, `--secondary-panel-width-mobile`, `--sidebar-width-mobile`, `--story-doc-width`, `--sidebar-width-icon`: set at runtime by app shell code, not in theme.css.
- `[FONT_MISSING] "Inter"`: it's only the fallback after `"Inter Variable"`, which ships.
- `[RENDER_THIN]` on ~20 `Resource*` domain composites (they render their own name through the component chrome with no data). Legit until authored.
- `PersistentResponsiveDrawerShell` floor card renders under the drawer's gray backdrop. Readable, leave it.

## Re-sync risks

- `.design-sync/docs/` is a snapshot of which components exist and which file they come from. Components added, renamed, or moved between files in `shared-ui` go stale silently (ungrouped, or a wrong "Composes with" list). The authored examples in `Button.md`, `Card.md`, etc. duplicate the preview `.tsx` and can drift from the component API.
- The held-back list was decided by the render check at this commit. A component that grows required props could start rendering blank and need adding.
- `packages/shared-ui/index.d.ts` must be regenerated when component files are added or removed; a stale one silently drops `.d.ts` contracts for new components.
- The compiled CSS only has classes the app uses at build time. If the app drops a utility, designs that relied on it lose styling on the next sync.
- Built against Tailwind 4.3.3, Node 22.19.0, system Chrome (not Playwright's pinned Chromium).
