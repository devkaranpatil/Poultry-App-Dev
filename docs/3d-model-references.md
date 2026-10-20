# 3D model references

What real Indian poultry sheds and their fittings look like, and how the 3D model follows it. Collected before the
shed models were built (Phase 5 of [migration/implementation-plan.md](migration/implementation-plan.md)); each fact
below is used in `src/components/farm/scene/`. Sources marked **verify** are secondary and need checking before they are
quoted as figures.

## Open-sided broiler shed (the common shed)

- Long axis east-west. Width 22 to 25 ft (6.7 to 7.6 m); eaves 6 to 7 ft (1.8 to 2.1 m), centre 10 to 12 ft (3 to
  3.7 m). Roof overhang at least 3.5 ft (1.07 m) so rain and sun stay off the litter. Source: IS 2732:1985 (via the TNAU
  expert system and the ICAR housing pages; the full text needs a BIS copy, **verify** the clauses).
- Foundation 1 to 1.5 ft above ground; the floor runs 1.5 ft outside the walls.
- Side walls: a brick wall 1 to 1.5 ft high, then welded or chicken wire mesh to the roof. HDPE tarpaulin curtains
  (usually yellow or blue) hang outside the mesh and are let down in winter, at night and in rain.
- Frame: steel posts or RCC/brick pillars about every 10 ft (3 m) with mild-steel angle trusses; small farms use
  bamboo or wood. GI or galvalume corrugated sheets; fibre cement (asbestos-free) in hot areas; thatch on backyard sheds.
- Door in the end wall, with a disinfectant footbath (potassium permanganate pink, or lime) at the door. Larger farms
  add an anteroom to change boots and clothes.

Model: `shedLayout.ts` puts a truss about every 3 m (`BAY_TARGET`), a 1.07 m overhang (`OVERHANG`), a 0.45 m low wall
(`LOW_WALL`) and a plinth 0.45 m wider than the walls (`PLINTH_APRON`). Curtains are drawn yellow and 40% let down. The
recommended shed is 14 x 7 m, 2.1 m to the eaves and 3.5 m at the ridge (`DEFAULT_POULTRY_CONFIG`).

## Roofs

- Gable: two slopes meeting at the ridge, with a ridge cap.
- Monitor: the upper part of the roof is raised over an open band at the ridge, covered with mesh, so hot air escapes
  at the top. Common on wide open sheds in hot districts.
- Lean-to: one slope, the higher wall on one side; small and backyard sheds.

Model: the monitor's band is a fifth of the width (`MONITOR_SHARE`), its cap overlaps the band by 0.3 m and is lifted
25 to 50 cm (`monitorLift`).

## Environment-controlled (tunnel) shed

- Width 40 ft or more (12 m+); closed side walls; tunnel ventilation: wet cellulose pads (brown honeycomb) at one end
  draw air in, and large box fans (about 50 inch) at the other end pull it the length of the shed. Example: a
  280 x 42 x 8.5 ft house needs 612 sq ft of pad and 10 fans of 21,500 CFM (secondary source, **verify**).
- A standby diesel generator: a power cut in a closed shed kills birds within the hour.

Model: pads on both side walls at the entry end, fans across the back end wall (`tunnelFans`), a generator beside the
back corner. The controlled preset in the tests is 12 m wide.

## Layer cages (A-type)

- Stepped "A-type" cages in rows, 2 to 4 tiers; 3 is common. Lower tiers stand further out so droppings fall clear of the birds below; troughs run along the
  front of each tier; nipple lines run inside. 4 birds in an 18 x 15 inch cage (0.46 sq ft each); the NABARD layer house
  uses 0.85 sq ft of shed floor per bird.
- Aisles about 3 ft between rows for the egg trolley.

Model: `CAGE` in `shedLayout.ts`: cages 0.4 m deep and 0.38 m high, each tier stepped 0.2 m, 0.8 m aisles; a 7 m shed
fits two rows. Birds face out over the troughs.

## Feeding and drinking

- Manual (NABARD broiler model): round tube feeders and bell drinkers hung from the roof, set out across the floor;
  4 to 5 round 18 inch feeders per 100 birds.
- Semi-automatic: pan feeders in rows and nipple drinker lines with a pressure regulator.
- Automatic: pan feeders on an auger line fed from a hopper at the end of the line and a bulk silo outside; nipple lines.
- Cages: a trough along each tier (filled by hand, or by a feed trolley running along the row when automatic).

Model: manual fittings about 2.4 m apart in a checkerboard; lines about 1.5 m apart alternating pan and nipple; pans
every 0.75 m and nipples every 0.3 m (0.45 m in cages); the silo stands beside the back corner.

## Birds

- Commercial broilers and cage layers in India are white; floor layers are often brown; improved desi birds (Vanaraja,
  Gramapriya, Kuroiler) are mixed brown, black, golden and speckled, and smaller.
- Chicks are brooded under hovers (gas or electric) for the first two weeks.

Model: one low-poly hen (body, head, tail, red comb and wattle, yellow beak and legs) drawn as two instanced meshes;
`PLUMAGE` and `BIRD_SCALE` in `shedLayout.ts` set the colours and sizes. Broiler and desi sheds get a few hover
brooders, about one per 40 m².

## Checking screenshots against these references

Run `npx playwright test e2e/scene-options.spec.ts` and look at `test-results/scene/`: `bird-*` (inside views),
`shed-*` (each shed type and roof), `frame-*`, `sheet-*`, `walls-*`, `entry-*`, `feeding-*` and `tunnel-fans`. Check
each against the descriptions above at the quality level the test sets (balanced); the quality test covers lite and high.
