# ADR 0006 — An assistant for first-time users

| | |
|---|---|
| Status | **Proposed** (13 November 2026); the recommended option taken on each point under the owner's rule, open to change |
| Decided by | the owner asked for a wizard for lay users (13 November 2026): simple questions that set up the whole scenario — what is identified and what for, such as "a product to sell on a marketplace", "a QR code with my website on a product sold in shops", "a UDI label" — suggesting and explaining rules such as two barcodes side by side and the bars' size. The tool serves mainly lay people; experienced users keep the editor |

## 1. Context

The editor asks in three steps what the code identifies (the key and its data), where it is scanned (the General
Specifications' decision tree, figure 5-68) and how the label looks. Each step speaks GS1's language: a lay person must
already know that a product is a GTIN, that its lot is AI (10), that a till needs an EAN-13. Step 2's questions follow
the tree's own wording ("Is it scanned at a general retail point of sale?") and leave out what a seller thinks of
first: the website a QR code should open, how the label will be printed, what goes on each unit.

The owner also asked to be told when a request outgrows an offline tool with no back end or database.

## 2. Decision

1. **Form (A of three):** a dialog, one question per screen (full screen on a phone), with large cards and a short
   *Why we ask* that teaches the rule when it matters; it ends with a summary of what was set up, what the user still
   has to type and the rules for the artwork, then fills steps 1, 2 and 3. A card above step 1 says what the assistant
   set up, with *See the rules again* and *Start the answers again*. (B: a step 0 above step 1 with every question in
   sight; C: ready-made templates only, 6.5.)
2. **Free text (A of three):** an optional field, *or describe it in your own words*, read offline by keywords in the
   six languages: the words choose the scenario and pre-answer the questions they can ("QR code", "website", "shop"),
   for the user to check on the following screens. (B: cards only; C: an AI reading any sentence, which needs a
   service — a server or the user's API key — and sends what is typed out of the browser, against principle 5 of ADR
   0003: not recommended.)
3. **When it opens (A of three):** by itself on a first visit, and from an *Assistant* button in the header (the *More*
   menu on a phone); closing it leaves the editor as it is today. (B: only from the button; C: on every visit.)
4. **What it changes:** nothing in the steps, which stay for those who know. The assistant's answers are given to step 2,
   which applies the decision tree as today, so the symbol recommended still comes from the symbol specification table,
   never from a rule of the assistant's own. The templates by segment (6.5) become the assistant's scenarios; the tour
   (6.4) follows on this screen.

## 3. What stays out, and why

| Request | Offline? | What the assistant does |
|---|---|---|
| Questions, scenarios, rules, suggestions | yes | in the core, tested like the rest |
| A need written in one's own words | yes, by keywords | a sentence with no known word falls back to the cards |
| Any sentence understood, as an AI would | no | not offered: a service and data leaving the browser |
| Whether a GTIN belongs to the company (Verified by GS1) | no | says where to check; GS1's API needs a key |
| A GS1 Company Prefix | no | explains that the GS1 office of the country licenses it; an example GTIN until then |

## 4. Rules the assistant explains (General Specifications 26.0)

Each only in the scenario it applies to: two barcodes for the same application placed adjacent, keeping their quiet
zones (4.15.1, 5); the whole 2D symbol within 50 mm of the linear barcode's centre at a retail point of sale (6.3.3.1);
the same GTIN and attribute values in every carrier (4.15.1, 2, 3 and 8); a barcode for another application placed
apart (4.15.1, 6); the back's lower right quadrant, 8 to 100 mm from the edge (6.3.3.1, 6.3.3.3); cases on their sides,
the barcode's bottom 32 mm from the base, 19 mm from vertical edges (6.7.1, 6.7.1.2); pallets between 400 and 800 mm
from the base, 50 mm from vertical edges (6.7.1.1); sizes within the table's range, bars never truncated (5.12.3); the
GTIN from the company's own prefix (1.2.3, 1.5).

## 5. Consequences

- A catalogue of scenarios and questions in the core (`assistant.ts`), each answer mapped to the identification, step 2's
  answers and the label's settings, tested like the decision tree; every scenario's symbol read back by ZXing.
- The texts in the six languages, as everywhere (principle 7 of ADR 0003); the keywords per language in the core.
- Effort L, in deliveries: the core; the dialog on three devices; more scenarios (cases, pallets, healthcare, the other
  keys); the documents and screenshots. Mock-ups (A recommended, B) in a doc for the owner, its link in the handover.
