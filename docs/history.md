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

The owner then created the repository (with a licence commit, identical to the local one; the work was rebased onto
it), and decided: every document in English and the tool fixed in English. The resolver had no ZPL (PNG and SVG
only); the reference is Zebra's ZPL II programming guide. With no printer at hand the owner uses Labelary's viewer, so
the CI sends the studio's ZPL to Labelary and reads the rendered symbol back (the sandbox's network does not reach
labelary.com or zebra.com).

The owner then gave the environment full internet access and put the ZPL guide in the Drive folder. The guide's
99 999-byte limit on `^GF` led to stripes. Asked whether ZPL would be an image or commands, the owner decided: the
printer's commands always, images only for images such as a logo — for the size and so that systems can use the ZPL as
a template with placeholders. Testing every command through Labelary found three traps a manual alone would not show:
GS1-128's mode D joins element strings without FNC1, `^BQ` cannot make a GS1 QR Code, and the Data Matrix escape
character changed between firmware versions (ADR 0002).
