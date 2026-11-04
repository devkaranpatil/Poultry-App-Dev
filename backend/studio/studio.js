import * as THREE from "three";

const $ = (id) => document.getElementById(id);
const COLORS = { ok: 0x5ef0a8, warn: 0xffcf5a, bad: 0xff7a7a };

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1511);
scene.fog = new THREE.Fog(0x0b1511, 18, 40);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
const orbit = { theta: 0.6, phi: 1.1, radius: 17, auto: true };

scene.add(new THREE.HemisphereLight(0xcdeeff, 0x1b3a2a, 0.9));
const sunLight = new THREE.DirectionalLight(0xfff1c9, 1.6);
scene.add(sunLight);
const sun = new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 24), new THREE.MeshBasicMaterial({ color: 0xffd36b }));
scene.add(sun);

const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: 0x1f3d2e, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const grid = new THREE.GridHelper(28, 28, 0x2c5a43, 0x1d3a2b);
grid.position.y = 0.01;
scene.add(grid);

// ---- Broiler shed (open-sided, gable roof, matching the app's default shed) ----
const house = new THREE.Group();
house.position.set(-3, 0, 0);
scene.add(house);
const LENGTH = 8, WIDTH = 4, EAVES = 2.1, RIDGE = 3.1;
const frameMat = new THREE.MeshStandardMaterial({ color: 0xcfd8d3, metalness: 0.6, roughness: 0.35 });
const floor = new THREE.Mesh(new THREE.BoxGeometry(WIDTH, 0.12, LENGTH), new THREE.MeshStandardMaterial({ color: 0x8a7350, roughness: 1 }));
floor.position.y = 0.06;
house.add(floor);
// Posts and trusses every 1.6 m along the shed.
const BAYS = 5;
for (let i = 0; i <= BAYS; i++) {
  const z = -LENGTH / 2 + (i * LENGTH) / BAYS;
  [-WIDTH / 2, WIDTH / 2].forEach((x) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, EAVES, 0.08), frameMat);
    post.position.set(x, EAVES / 2, z);
    house.add(post);
  });
  const rafterLength = Math.hypot(WIDTH / 2, RIDGE - EAVES);
  const slope = Math.atan2(RIDGE - EAVES, WIDTH / 2);
  [-1, 1].forEach((side) => {
    const rafter = new THREE.Mesh(new THREE.BoxGeometry(rafterLength, 0.06, 0.06), frameMat);
    rafter.position.set((side * WIDTH) / 4, (EAVES + RIDGE) / 2, z);
    rafter.rotation.z = -side * slope;
    house.add(rafter);
  });
}
// Roof sheets, overhanging the walls a little.
const roofMat = new THREE.MeshStandardMaterial({ color: 0x9aa7a2, metalness: 0.5, roughness: 0.45, side: THREE.DoubleSide });
const sheetWidth = Math.hypot(WIDTH / 2, RIDGE - EAVES) + 0.4;
[-1, 1].forEach((side) => {
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(sheetWidth, 0.04, LENGTH + 0.6), roofMat);
  sheet.position.set((side * (WIDTH / 2 + 0.4)) / 2, (EAVES + RIDGE) / 2 - 0.05, 0);
  sheet.rotation.z = -side * Math.atan2(RIDGE - EAVES, WIDTH / 2);
  house.add(sheet);
});
// Low brick walls with mesh above, and curtains that roll up and down; the HUD button toggles them.
const wallMat = new THREE.MeshStandardMaterial({ color: 0xa4553c, roughness: 0.9 });
const meshMat = new THREE.MeshStandardMaterial({ color: 0xcfd8d3, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false });
const curtainMat = new THREE.MeshStandardMaterial({ color: 0x2f6fb5, roughness: 0.8, side: THREE.DoubleSide });
const CURTAIN = EAVES - 0.45;
const curtains = [];
[-WIDTH / 2, WIDTH / 2].forEach((x) => {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, LENGTH), wallMat);
  wall.position.set(x, 0.225, 0);
  house.add(wall);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(LENGTH, CURTAIN), meshMat);
  mesh.rotation.y = Math.PI / 2;
  mesh.position.set(x, 0.45 + CURTAIN / 2, 0);
  house.add(mesh);
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(LENGTH, CURTAIN), curtainMat);
  curtain.rotation.y = Math.PI / 2;
  curtain.position.set(x + Math.sign(x) * 0.03, 0.45 + CURTAIN / 2, 0);
  house.add(curtain);
  curtains.push(curtain);
});

// Feeder pans down the middle, and birds pecking on the litter.
const panMat = new THREE.MeshStandardMaterial({ color: 0xd9b23a, roughness: 0.5 });
for (let i = 0; i < 5; i++) {
  const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.08, 20), panMat);
  pan.position.set(0, 0.16, -LENGTH / 2 + 1 + i * ((LENGTH - 2) / 4));
  house.add(pan);
}
const birds = [];
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.8 });
const combMat = new THREE.MeshStandardMaterial({ color: 0xc8322b });
for (let i = 0; i < 36; i++) {
  const bird = new THREE.Group();
  bird.position.set((Math.random() - 0.5) * (WIDTH - 0.6), 0.12, (Math.random() - 0.5) * (LENGTH - 0.6));
  bird.rotation.y = Math.random() * Math.PI * 2;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), bodyMat);
  body.scale.set(1, 0.85, 1.3);
  body.position.y = 0.13;
  bird.add(body);
  const head = new THREE.Group();
  head.position.set(0, 0.24, 0.14);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), bodyMat));
  const comb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.06), combMat);
  comb.position.y = 0.06;
  head.add(comb);
  bird.add(head);
  bird.userData = { head, phase: Math.random() * 10 };
  birds.push(bird);
  house.add(bird);
}
let curtainsDown = false;
$("curtains").addEventListener("click", () => { curtainsDown = !curtainsDown; });

// ---- API node (server rack) + database cylinder, linked to the shed by a pipe ----
const api = new THREE.Group();
api.position.set(5, 0, -1.5);
scene.add(api);
const rack = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3, 1.6), new THREE.MeshStandardMaterial({ color: 0x20352b, metalness: 0.5, roughness: 0.5 }));
rack.position.y = 1.5;
api.add(rack);
const bars = [];
for (let i = 0; i < 5; i++) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: COLORS.ok }));
  bar.position.set(0, 0.6 + i * 0.5, 0.83);
  api.add(bar);
  bars.push(bar);
}
const apiLamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), new THREE.MeshBasicMaterial({ color: COLORS.warn }));
apiLamp.position.set(0, 3.3, 0);
api.add(apiLamp);

const dbGroup = new THREE.Group();
dbGroup.position.set(5, 0, 2.5);
scene.add(dbGroup);
const dbBody = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 32), new THREE.MeshStandardMaterial({ color: 0x1f4a66, metalness: 0.4, roughness: 0.4 }));
dbBody.position.y = 0.8;
dbGroup.add(dbBody);
const dbRing = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.05, 8, 40), new THREE.MeshBasicMaterial({ color: COLORS.warn }));
dbRing.rotation.x = Math.PI / 2;
dbRing.position.y = 1.1;
dbGroup.add(dbRing);

// Pipe route: shed end -> API rack -> database. Pulses travel along it on each health check.
const route = new THREE.CatmullRomCurve3([new THREE.Vector3(-3, 0.25, 4.1), new THREE.Vector3(0, 0.25, 3.2), new THREE.Vector3(3.2, 0.25, -0.6), new THREE.Vector3(5, 0.25, -1.5)]);
scene.add(new THREE.Mesh(new THREE.TubeGeometry(route, 48, 0.07, 8), new THREE.MeshStandardMaterial({ color: 0x3a6a53, roughness: 0.6 })));
const dbRoute = new THREE.CatmullRomCurve3([new THREE.Vector3(5, 0.25, -1.5), new THREE.Vector3(5.8, 0.25, 0.5), new THREE.Vector3(5, 0.25, 2.5)]);
scene.add(new THREE.Mesh(new THREE.TubeGeometry(dbRoute, 24, 0.07, 8), new THREE.MeshStandardMaterial({ color: 0x3a6a53, roughness: 0.6 })));

const pulses = [];
function sendPulse(ok) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), new THREE.MeshBasicMaterial({ color: ok ? COLORS.ok : COLORS.bad }));
  scene.add(mesh);
  pulses.push({ mesh, t: 0 });
}

// ---- Interaction: drag to orbit, wheel to zoom ----
let dragging = false, lastX = 0, lastY = 0;
const el = renderer.domElement;
el.addEventListener("pointerdown", (e) => { dragging = true; orbit.auto = false; lastX = e.clientX; lastY = e.clientY; el.setPointerCapture(e.pointerId); });
el.addEventListener("pointerup", () => { dragging = false; });
el.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  orbit.theta -= (e.clientX - lastX) * 0.006;
  orbit.phi = Math.min(1.5, Math.max(0.3, orbit.phi - (e.clientY - lastY) * 0.006));
  lastX = e.clientX; lastY = e.clientY;
});
el.addEventListener("wheel", (e) => { e.preventDefault(); orbit.radius = Math.min(28, Math.max(8, orbit.radius + e.deltaY * 0.01)); }, { passive: false });
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---- Live health data ----
let apiState = "warn", dbState = "warn";
const setStatus = (id, state, label) => { const n = $(id); n.className = state; n.innerHTML = `<span class="dot"></span>${label}`; };
const fmtUptime = (s) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;

async function poll() {
  const started = performance.now();
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    const body = await res.json();
    const ms = Math.round(performance.now() - started);
    apiState = res.ok ? "ok" : "bad";
    const state = String(body.database?.state || "unknown");
    dbState = state === "connected" ? "ok" : state === "unknown" ? "warn" : "bad";
    setStatus("api", apiState, res.ok ? "healthy" : "error");
    setStatus("db", dbState, state);
    $("uptime").textContent = fmtUptime(body.uptimeSeconds ?? 0);
    $("latency").textContent = `${ms} ms`;
    $("node").textContent = body.nodeVersion ?? "–";
    $("env").textContent = body.env ?? "–";
    sendPulse(res.ok);
  } catch {
    apiState = "bad"; dbState = "warn";
    setStatus("api", "bad", "unreachable");
    sendPulse(false);
  }
}
poll();
setInterval(poll, 5000);

// ---- Animation loop ----
const clock = new THREE.Clock();
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (orbit.auto && !reduced) orbit.theta += dt * 0.12;
  camera.position.set(
    Math.sin(orbit.theta) * Math.sin(orbit.phi) * orbit.radius,
    Math.cos(orbit.phi) * orbit.radius,
    Math.cos(orbit.theta) * Math.sin(orbit.phi) * orbit.radius,
  );
  camera.lookAt(1, 1, 0);

  const sa = t * 0.15 + 0.5;
  sun.position.set(Math.cos(sa) * 11, 5 + Math.sin(sa) * 3, -8);
  sunLight.position.copy(sun.position);

  if (!reduced) birds.forEach((b) => { b.userData.head.rotation.x = Math.max(0, Math.sin(t * 2.4 + b.userData.phase)) * 0.9; });

  // Curtains roll from the eaves down to the wall top (open) or cover the mesh (closed).
  curtains.forEach((c) => {
    const target = curtainsDown ? 1 : 0.08;
    c.scale.y += (target - c.scale.y) * (reduced ? 1 : Math.min(1, dt * 3));
    c.position.y = 0.45 + (CURTAIN * c.scale.y) / 2;
  });

  apiLamp.material.color.setHex(COLORS[apiState]);
  apiLamp.scale.setScalar(1 + (0.6 + Math.sin(t * 3) * 0.4) * 0.25);
  dbRing.material.color.setHex(COLORS[dbState]);
  dbRing.scale.setScalar(1 + Math.sin(t * 2) * 0.03);
  bars.forEach((b, i) => { b.material.color.setHex(COLORS[apiState]); b.scale.x = 0.55 + 0.45 * Math.abs(Math.sin(t * 2.2 + i * 1.3)); });

  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i];
    p.t += dt * 0.35;
    if (p.t >= 1) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); pulses.splice(i, 1); continue; }
    p.mesh.position.copy(route.getPoint(p.t));
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
