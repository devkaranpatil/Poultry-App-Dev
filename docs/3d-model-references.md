# 3D model references

What real Indian polyhouses, net houses and their fittings look like, and how the 3D model follows it.
Collected before the models were rebuilt; each fact below is used in `src/components/greenhouse/scene/`.

## Naturally ventilated polyhouse (NVPH)

- Hot-dip galvanised round pipe, bolted (no welding). Typical NHB-style sizes: columns 76 mm OD, bottom
  chord 60 mm, arches 42 mm, top purlins 48 mm, gutter purlins 43 mm, bracing 33 mm, curtain runner 42 mm.
  Columns sit in concrete footings 1:2:4, about 1.2 m deep (the model shows the pad at ground level).
- Grid 8 m (span) x 4 m (bay). Gutter height 4 to 4.5 m, ridge 5 to 6.5 m. Spans join at 500 mm wide
  galvanised sheet gutters; wider houses are multi-span, not one wide arch.
- Roof: gothic (pointed) arch or gable truss. A top (ridge) vent runs along every span: one half of the
  arch stops below the ridge and the other half overlaps it, and the gap is covered with 40-mesh insect net.
- Film: 200 micron UV polyfilm, held in aluminium profiles with zigzag spring wire along gutters, end arches
  and curtain rails.
- Side walls: a low apron/skirt at the base, then a roll-up curtain on a 27 mm curtain shaft, raised by a
  hand crank gear box (or a 24 V gear motor), with insect net fixed behind it so the opening stays screened.
- End wall with an aluminium double door, usually through a small antechamber (double-door entry) to keep
  insects out. Cross bracing in the end bays.

Model: `structureLayout.ts` splits the width into spans near 8 m and the length into bays near 4 m. Columns,
arch hoops, bottom-chord trusses, purlins, gutters and bracing are separate instanced parts under
`frame-*` groups. NVPH gable/gothic roofs get the overlapping ridge vent with insect net.

## Climate-controlled polyhouse (fan and pad)

- Exhaust fans in one end wall, a wet cellulose cooling pad (brown honeycomb) in the opposite end wall,
  with a water pipe over the pad and a collecting gutter below it.
- Horizontal airflow (circulation) fans hang under the trusses; an internal shade/thermal screen (30 to
  50 %) runs at gutter height; a control panel near the entry.

Model: pad wall on the back end wall, fans either side of the entry, HAF fans in a row under the trusses,
a part-drawn screen, and the controller.

## Shade-net house

- GI posts 60 to 75 mm in concrete, about 4 m apart round the perimeter and 5 m inside; 3 to 3.5 m clear.
- GI wire cables along the perimeter and across the grid, tightened with turnbuckles; HDPE knitted net
  (35 or 50 %, green or black) clipped every 50 cm. Perimeter posts are held by anchor (guy) cables to
  ground anchors outside the house. The top is flat.

Model: flat shade-net houses are posts plus a cable grid, a taut net and guy wires to anchors; with a
gable or gothic roof the hoop frame is covered with net instead.

## Covers and frames

- Insect net: fine white/grey mesh, see-through. Shade net: dark green/black knitted mesh. Glass: clear
  panes in aluminium glazing bars. UV film: milky, slightly green.
- Bamboo: thicker poles with nodes, joints lashed with cord or wire. Aluminium: bright box profiles.

## Crops as grown in a polyhouse

- Tomato and cucumber: on raised beds with mulch film, one plant per string hung from a high wire with
  hooks; wires run along each row under the trusses.
- Capsicum: double rows on raised beds, silver-black mulch, trained up strings or stakes.
- Lettuce: low beds or NFT channels. Strawberry: raised beds or troughs on black mulch, fruit hanging over
  the edge. Gerbera: raised beds about 30 to 45 cm high, 3 rows per 1 m bed, flower heads on long stalks.

## Irrigation

- Drip: laterals along each bed from a sub-main header, with screen/disc filter and a venturi injector
  near the pump. Sprinklers/micro-sprinklers on risers. Foggers: lines hanging below the trusses, nozzles
  every 1 to 3 m. NFT: channels on stands at 1 to 3 % slope, pump from a reservoir tank, return to it.

## Doors and vents

- Doors: single or double sliding leaves on a top track, roll-up film door, or a strip/net curtain.
- Vents: manual roll-up (crank), motorized roll-up (gear motor), louvre windows.

## Sources

- NHB-style NVPH specifications (pipe sizes, 8 x 4 m grid, gutter 4 to 4.5 m, 200 micron film, 500 mm gutter, double doors): https://www.tradeindia.com/products/natural-ventilated-6005052.html
- NVPH tender (multi-span 8 x 4 m, gutter 4.5 m, top vents, insect net): https://www.iimshillong.ac.in/wp-content/uploads/2026/05/NIQ-for-Construction-Installation-of-Ventilated-Polyhouse.pdf
- Bamboo polyhouse tender: https://old.dbskkv.org/pdf/2020-21/Tenders/Dapoli/Dapoli_Bamboo_Polyhouse%20Building.pdf
- Zigzag wire and lock channel: https://griffins.com/product/09-16501
- Roll-up curtain with manual or 24 V crank: https://www.nurserymag.com/news/atlas-ez-roll-up-curtain-system
- Shade net house (posts, cable grid, turnbuckles, clips): https://www.organicmandya.com/farming/methods/shade-net-farming
- Shade house with anchor cables (flat roof on tensioned cables): https://patents.google.com/patent/US5311699
- Fan and pad cooling: https://www.umass.edu/agriculture-food-environment/greenhouse-floriculture/fact-sheets/fan-pad-evaporative-cooling-systems
- Horizontal airflow fans: https://bluelab.com/blogs/articles/greenhouse-horizontal-airflow-fans-and-exhaust-fans
- High-wire hooks for tomato and cucumber: https://royalbrinkman.com/crop-rotation/high-wire-hooks/
- Gerbera raised beds: https://www.kiran.nic.in/pdf/Agri-Kaleidoscope/Horticulture-resources/GERBERA.pdf
- Fogger installation (spacing, drop lines): https://senninger.com/node/65551
- NFT channels and slope: https://greenhouse-management.com/greenhouse_management/greenhouse_production_systems/nutrient_film_technique.htm
