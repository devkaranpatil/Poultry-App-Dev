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

// ---- Polyhouse (tunnel type, matching the app's polyhouse model) ----
const house = new THREE.Group();
house.position.set(-3, 0, 0);
scene.add(house);
const LENGTH = 8, RADIUS = 2.2;
const frameMat = new THREE.MeshStandardMaterial({ color: 0xcfd8d3, metalness: 0.6, roughness: 0.35 });
for (let i = 0; i < 7; i++) {
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(RADIUS, 0.04, 8, 40, Math.PI), frameMat);
  hoop.position.z = -LENGTH / 2 + (i * LENGTH) / 6;
  house.add(hoop);
}
const film = new THREE.Mesh(
  new THREE.CylinderGeometry(RADIUS, RADIUS, LENGTH, 48, 1, true, Math.PI / 2, Math.PI),
  new THREE.MeshPhysicalMaterial({ color: 0xd6f5e4, transparent: true, opacity: 0.18, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
);
film.rotation.x = Math.PI / 2;
house.add(film);

const plants = [];
const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f9e6a, roughness: 0.7 });
const stemMat = new THREE.MeshStandardMaterial({ color: 0x1d6b46 });
[-1.1, 0, 1.1].forEach((x, row) => {
  const bed = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, LENGTH - 1), new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 1 }));
  bed.position.set(x, 0.08, 0);
  house.add(bed);
  for (let i = 0; i < 8; i++) {
    const plant = new THREE.Group();
    plant.position.set(x, 0.16, -LENGTH / 2 + 0.8 + (i * (LENGTH - 1.6)) / 7);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.5, 6), stemMat);
    stem.position.y = 0.25;
    plant.add(stem);
    for (let k = 0; k < 3; k++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16 - k * 0.02, 12, 8), leafMat);
      leaf.scale.y = 0.35;
      leaf.position.set(Math.cos(k * 2.1) * 0.12, 0.38 + k * 0.1, Math.sin(k * 2.1) * 0.12);
      plant.add(leaf);
    }
    plant.userData.phase = i * 0.7 + row * 1.9;
    plants.push(plant);
    house.add(plant);
  }
});

// Sprinkler droplets falling inside the polyhouse; the HUD button toggles them.
const DROPS = 220;
const dropPos = new Float32Array(DROPS * 3);
const dropState = Array.from({ length: DROPS }, () => ({ x: (Math.random() - 0.5) * 3.2, y: Math.random() * 2, z: (Math.random() - 0.5) * (LENGTH - 1), v: 1.2 + Math.random() }));
const dropGeo = new THREE.BufferGeometry();
dropGeo.setAttribute("position", new THREE.BufferAttribute(dropPos, 3));
const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({ color: 0x9fd8ff, size: 0.05, transparent: true, opacity: 0.85, depthWrite: false }));
house.add(drops);
let sprinklersOn = true;
$("sprinklers").addEventListener("click", () => { sprinklersOn = !sprinklersOn; drops.visible = sprinklersOn; });

// ---- API node (server rack) + database cylinder, linked to the polyhouse by a pipe ----
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

// Pipe route: polyhouse door -> API rack -> database. Pulses travel along it on each health check.
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

  if (!reduced) plants.forEach((p) => { p.rotation.z = Math.sin(t * 1.4 + p.userData.phase) * 0.06; p.rotation.x = Math.cos(t * 1.1 + p.userData.phase) * 0.04; });

  if (sprinklersOn && !reduced) {
    dropState.forEach((d, i) => {
      d.y -= d.v * dt;
      if (d.y < 0.2) d.y = 2.1;
      dropPos[i * 3] = d.x; dropPos[i * 3 + 1] = d.y; dropPos[i * 3 + 2] = d.z;
    });
    dropGeo.attributes.position.needsUpdate = true;
  }

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
