---
target: workspace (src/pages/Index.tsx)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Development\\Poultry-App-Dev\\src\\pages\\Index.tsx"
target_fingerprint: "sha256:86855b1b48dd2c703f7b787d73d03365a0c65e2f1009a07a046bc749f76c20f9"
target_path: "C:\\Development\\Poultry-App-Dev\\src\\pages\\Index.tsx"
timestamp: 2026-11-07T18-48-26Z
slug: src-pages-index-tsx
---
Method: dual-agent (A: design review · B: detector + browser), plus web-design-guidelines, ui-ux-pro-max (rules only; its data folder is empty) and Mobbin (blocked on sign-in; references from memory, unverified).

## Design health (before the changes): 27/40, Acceptable
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Status | 3 | Header pill ₹3.97 L vs strip "Project cost ₹5.88 L", unlabelled |
| 2 | Real world | 2 | CAD vocabulary in the 3D viewer (gizmo, View/Edit, "Deccan plateau AUTO") |
| 3 | Control | 3 | Step not in the URL; Android back leaves the workspace |
| 4 | Consistency | 2 | AI is both step 7 and a floating bubble; "New shed"/"Open designer"/"Design" |
| 5 | Error prevention | 3 | Good locks, clamps, validation |
| 6 | Recognition | 3 | Phase labels hidden below 1280 px; 10.5 px tab labels |
| 7 | Flexibility | 3 | Expert tools always visible |
| 8 | Minimalist | 2 | Four layers of chrome plus a floating button |
| 9 | Error recovery | 3 | StepError with retry; FinishDesignFirst lists what is missing |
| 10 | Help | 3 | "?" explanations, guide, In short |

Cognitive load: 4 of 8 failed (high).

## Priority issues
- [P1] 8-step tab bar in a second header row: congested, clipped on phones ("3 Co"). FIXED: journey rail on laptop (phases, collapsible), one-line step bar + bottom sheet on phone/tablet, step in ?step=, sticky Back/Next on phones.
- [P1] Floating chat on every step incl. Design, covering Next on phones. FIXED: removed; "Ask advisor" in the More options menu (not on Design); docked non-modal panel on laptop, side sheet on tablet, full page on phone closed by the back button; unread mark on the menu.
- [P1] Design step shows expert 3D tools by default; 10 part tabs. OPEN (Simple/Advanced 3D, merge into 4 sections).
- [P2] Duplicated/conflicting figures. PARTLY FIXED: header pill removed, rail/bar shows status only. "You pay" before/after scheme still unlabelled.
- [P2] Phone chrome ~27% of the screen. PARTLY FIXED: one header row + one step bar; figures strip still 2x2.

## Detector (B)
Fixed: sub-12px text (part tabs, Auto badge, hints) raised to 12px; amber warning text 3.6:1 -> ~5.5:1 (--warning 34 90% 30%); nested export cards on Report; 130ch scheme notes capped at 72ch; bounce easing gone with the old widget. False positives: disabled-row contrast on Report.

## Persona red flags still open
- First-time farmer: "Break-even" and "Payback" in the figures strip have no "?".
- Dashboard: "New shed" twice plus "Open designer"; saved cards show no verdict.
