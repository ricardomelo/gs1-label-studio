# History

How the project grew, session by session, with the decisions taken on the way. The indicators of each session are in
`docs/metrics/sessions.csv`.

## Session 1 — 28 October 2026: kick-off

Started from the label studio of the GS1 Digital Link Resolver CE Expansion Pack (its ADR 0010), to offer the barcode
generator on its own. The owner chose a browser-first TypeScript application (ADR 0001), the name `gs1-label-studio`,
a public repository under Apache-2.0, and — beyond PDF and ZPL — PPLA/PPLB, TSPL/TSPL2, EPL2 and DPL (ADR 0002). Asked
during the session to record development and management indicators from the start, for a closing report like the
resolver's ("Resolver CE em números"): `docs/metrics/`. Walking skeleton delivered: encoding through bwip-js, every
symbol read back by ZXing, the printer dot grid, SVG and a ZPL graphic.
