# Changelog

## Unreleased

- Project set up: pnpm monorepo (`packages/core`, `apps/web`), TypeScript, Vitest, CI and GitHub Pages workflows.
- Core: GS1 check digit; encoding of EAN-13, EAN-8, UPC-A, UPC-E, ITF-14, GS1-128, GS1 DataMatrix, GS1 QR Code and
  QR / Data Matrix with a GS1 Digital Link URI through bwip-js; printer dot-grid snapping; rasteriser; SVG at real size;
  ZPL II graphic field. Every symbol read back by ZXing in the tests.
- Web: one symbol, preview, X-dimension at the printer's resolution, SVG and ZPL downloads.
- Development indicators from day one: `scripts/metrics.mjs`, `docs/metrics/` (sessions, the owner's hours, snapshots).
- Decisions: ADR 0001 (browser-first architecture), ADR 0002 (printer output), ADR 0003 (scope and user experience).
