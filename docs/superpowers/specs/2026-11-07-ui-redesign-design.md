# UI redesign: design spec

Date: 2026-11-07. Status: agreed in conversation; the owner reviews the finished work, not each layer.

## Intent

A new look and a smoother journey for the whole app, for two readers: Indian poultry farmers planning a shed, and the
bank or subsidy officers who read their reports. It must feel trustworthy and grounded, not like a generic SaaS
template. The backend and its API do not change.

Decisions made with the owner:

| Question | Decision |
|---|---|
| Feel | Warm and grounded: forest palette, photo-style images of Indian farms, a serif for headings, calm motion |
| Depth | Flows may change, not only the look; UX is improved alongside the UI |
| Journey | Estimate first, then refine: the no-account estimate carries into the workspace as the same project |
| Brand | Keep the name "Poultry Planner" (`shared/app.json`); new logo and wordmark |
| Method | Restyle in place, layer by layer; the app keeps working after each layer |

Design read: trust-first product for farmers and lenders. Dials (taste skill): public pages variance 6, motion 5,
density 4; workspace and dashboard variance 3, motion 4, density 6.

## Design system (layer 1)

**Colour (one palette, CSS variables, light and dark).** Forest family, not the beige-and-brass default.

| Token | Light | Use |
|---|---|---|
| background | cool off-white with a faint green cast (hsl 100 14% 97%) | page |
| foreground | deep green-black (hsl 160 22% 9%) | text |
| primary | forest green (hsl 158 52% 24%) | the one action colour |
| straw (accent) | maize/straw (hsl 42 78% 52%), used sparingly | highlights on the landing page, the logo, chart emphasis; never a second button colour |
| soil | warm grey-brown neutral (hsl 30 10% 40%) | secondary text on imagery, dividers in illustrations |
| success / warning / destructive | green / amber / brick red | profit, caution, loss |

Dark mode: deep forest night (hsl 160 18% 7%) with a lighter primary. Losses always read as losses in both modes.

**Type.** Martel (serif, Devanagari and Latin, Indian Type Foundry) for headings; Mukta (sans, Devanagari and
Latin) for body and UI. Both cover Hindi and Marathi, so all three languages share one look. Self-hosted through
`@fontsource`, replacing the Google Fonts link (Inter and Plus Jakarta Sans). Numbers use tabular figures.

**Shape.** One radius rule: controls 10 px, cards and panels 16 px, pills full. Shadows tinted green, never black.

**Motion.** framer-motion only (already a dependency). Every animation is motivated: entry of the hero, reveal of
sections once, feedback on press, value changes that count up, step transitions. Content is never left invisible:
reveals are pure CSS (scroll-driven), so they never wait on JavaScript. (The blank sections first seen in a full-page
screenshot of the old landing page were a capture artifact: scroll animations below the fold had not run.) `prefers-reduced-motion` turns all motion off.

**Icons.** Keep lucide-react (the project depends on it), one stroke width.

**Primitives.** Restyle the shadcn components in `src/components/ui` to the tokens (button, input, select, card,
dialog, sheet, tabs, accordion, badge, tooltip, toast, slider, switch, progress, skeleton). New shared pieces:
`Stat` (label, value, note), `Field` (label above input, help and error below), `PageHeader`, `Money` (formatted
rupees, a loss in red with a minus), loading skeletons shaped like the content.

**Brand.** A new mark: a simple geometric hen-under-a-roofline monogram in primary with a straw accent, plus the
wordmark set in Martel. Light and dark versions; favicon from the same mark.

## Imagery

Generated with the Cloudinary image tool (Higgsfield is not connected), downloaded into `public/images` and served
as optimised WebP with width and height set (no layout shift). Photo-style, warm daylight, real Indian context, no
text in images, no faces as the focus. Planned set:

1. Hero: an open-sided broiler shed in rural Maharashtra at golden hour, curtains half raised.
2. Inside a clean deep-litter shed with feeders and drinkers in rows.
3. Hands with printed project papers and a calculator on a farm office table.
4. Layer cages in a well-lit shed.
5. Desi birds in a village yard.
6. Paddy straw texture for empty states.

The existing SVG illustrations are retired.

## Journey and UX (layers 2 to 4)

**Estimate first.** Landing -> `/estimate` (no account) -> "Save and refine". The estimate writes its setup and edited
prices to a hand-off record (`sessionStorage`), asks for sign-up if needed, and opens the workspace with that setup
and those prices loaded and a notice "Carried over from your estimate". No re-typing.

**Landing (layer 2).** Asymmetric hero (message and one action left, hero photo with the live example estimate
right), then sections of different shapes: the questions it answers, how it works (estimate, refine, report), what
the bank sees, the assistant, FAQ, closing action. One label per intent: "Try a free estimate" everywhere for the
start action. No blank sections.

**Estimate (layer 2).** Inputs as a short form on the left (state, district, bird, shed size), results on the right
that update live: a verdict line (makes money or loses money at today's prices), the three cases, the cost build-up,
and the editable prices with their sources. Sticky "Save and refine" bar on mobile.

**Auth, support, legal, 404 (layer 2).** Same system; auth as a split screen with an image on large screens.

**Workspace (layer 3).** The eight steps keep their ids but are grouped into three phases the farmer understands:
*Plan the shed* (design, site), *Check the money* (cost, earnings, loan, risk), *Share it* (summary, report). A
phase-and-step navigator replaces the long step bar; on mobile it becomes a bottom bar. A persistent "project
figures" strip (project cost, profit a year, payback, break-even) sits on every money step and counts up on change,
so the effect of an edit is always visible. Each step page gets a clear header (the question this step answers), the
content, and one "Next" action. The 3D design view keeps its docked sidebar, restyled.

**Dashboard and account (layer 4).** Saved projects as cards with their key figures and last edit, an empty state
that points to the estimate, and account settings in the same system.

## What must not break

- Backend API and every service in `src/services`.
- All `data-testid` values used by `e2e/`; roles and accessible names stay meaningful. Specs whose text or flow
  changes are updated, not deleted.
- English, Hindi and Marathi: every new or changed string is added to `src/i18n/messages.ts` in all three; new Hindi
  and Marathi wording joins the native review (`docs/remaining/10`).
- Light and dark mode, keyboard use, focus rings, reduced motion, mobile at 360 px.

## Checks per layer

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, the affected e2e specs, and screenshots of the
changed screens in light and dark at 1440 px and 390 px.
