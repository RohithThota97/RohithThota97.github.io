// TrustGate - 3D hospital building (Wards page). Three.js r160, bundled next to this file.
// Python (worklist/app.py, _map_scene) sends the scene as JSON through the dcc.Store "map-data"; a clientside callback
// calls window.TG3D.render(). Clicking a machine sets the store "map-click", which opens the side panel.
// The building and its floor plans are made up for the demo; machines, levels and departments come from the data.
// Keep this file ASCII-only (dash-server on Windows writes app files with the cp1252 code page).

import * as THREE from 'three';                 // resolved by the import map in the page (assets/three.module.min.js)
import { loadPeople, populate, update as updatePeople } from './tg3d_people.js';

// ---------------------------------------------------------------- building dimensions (1 unit ~ 1 metre)
const W = 44, D = 28;                        // floor plate: x from -W/2..W/2, z from -D/2 (back)..D/2 (front)
const SLAB = 0.35, WALL_H = 3.3, FH = SLAB + WALL_H + 0.25;   // storey height
const ROOM_W = 10;                           // depth of the department rooms along the left and right facades
const CORR = 3;                              // corridor between rooms and lobby
const CORE_D = 6;                            // lift/service core at the back of the lobby
const STAIR_D = 6;                           // stair wells in the front corners
// DONE = every warning on the machine has a decision (green, the Done colour of the board)
const LEVEL_COLOR = { P1: 0xC62828, P2: 0xF08C00, P3: 0x636363, DONE: 0x2E7D32, P4: 0xBDBDBD };
const S = { container: null };               // renderer state, rebuilt when Dash replaces the container element

// ---------------------------------------------------------------- helpers
function mat(color, opts) {
  return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.85, metalness: 0.05 }, opts || {}));
}
function box(w, h, d, color, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.castShadow = true; m.receiveShadow = true; return m;
}
function cyl(rt, rb, h, color, seg) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 16), mat(color));
  m.castShadow = true; m.receiveShadow = true; return m;
}
function at(obj, x, y, z) { obj.position.set(x, y, z); return obj; }
function glass(w, h, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: 0xBFD9E6, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }));
  m.userData.glass = true; return m;
}

function canvasTexture(draw, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function tiles(color, line) {
  const t = canvasTexture(function (g, w, h) {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.strokeStyle = line; g.lineWidth = 2;
    for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
  }, 256, 256);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function textPlane(text, widthUnits, opts) {
  opts = opts || {};
  const px = 64, pad = 16, font = (opts.weight || '700') + ' ' + px + 'px Inter, "Segoe UI", system-ui, sans-serif';
  const probe = document.createElement('canvas').getContext('2d'); probe.font = font;
  const cw = Math.ceil(probe.measureText(text).width) + pad * 2, ch = px + pad * 2;
  const tex = canvasTexture(function (g) {
    if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(0, 0, cw, ch); }
    g.font = font; g.fillStyle = opts.color || '#3d3d3d'; g.textBaseline = 'middle'; g.fillText(text, pad, ch / 2 + 4);
  }, cw, ch);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(widthUnits, widthUnits * ch / cw),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.userData.isLabel = true; return m;
}

// a room sign that always faces the viewer (like hospital signage at the entrance)
function sign(text, widthUnits) {
  const px = 64, pad = 18, font = '700 ' + px + 'px Inter, "Segoe UI", system-ui, sans-serif';
  const probe = document.createElement('canvas').getContext('2d'); probe.font = font;
  const cw = Math.ceil(probe.measureText(text).width) + pad * 2, ch = px + pad * 2;
  const tex = canvasTexture(function (g) {
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, cw, ch);
    g.strokeStyle = '#9E9E9E'; g.lineWidth = 4; g.strokeRect(2, 2, cw - 4, ch - 4);
    g.font = font; g.fillStyle = '#3d3d3d'; g.textBaseline = 'middle'; g.fillText(text, pad, ch / 2 + 4);
  }, cw, ch);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: false }));   // always readable
  const w = cw / 58; sp.scale.set(w, w * ch / cw, 1);       // same text size for every sign
  sp.userData.isLabel = true; sp.renderOrder = 10; return sp;
}

// ---------------------------------------------------------------- furniture and equipment (simple shapes)
function bed() {
  const g = new THREE.Group();
  g.add(at(box(2.1, 0.45, 1.0, 0xE8E8E8), 0, 0.45, 0));
  g.add(at(box(1.9, 0.18, 0.9, 0xBFD3E6), 0, 0.76, 0));
  g.add(at(box(0.45, 0.12, 0.7, 0xFFFFFF), -0.7, 0.9, 0));
  g.add(at(box(0.08, 0.7, 1.0, 0xCFCFCF), -1.05, 0.6, 0));
  return g;
}
function curtain(w) { const m = box(w, 2.2, 0.04, 0x9FD3CF, { transparent: true, opacity: 0.55 }); m.castShadow = false; return m; }
function chairRow(n) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    g.add(at(box(0.5, 0.08, 0.5, 0x3F6FB5), i * 0.6, 0.45, 0));
    g.add(at(box(0.5, 0.5, 0.08, 0x3F6FB5), i * 0.6, 0.7, -0.22));
  }
  g.add(at(box(n * 0.6, 0.06, 0.4, 0x9E9E9E), (n - 1) * 0.3, 0.2, 0));
  return g;
}
function desk() {
  const g = new THREE.Group();
  g.add(at(box(1.8, 0.08, 0.8, 0xD9CBB5), 0, 0.78, 0));
  [-0.8, 0.8].forEach(function (x) { g.add(at(box(0.08, 0.78, 0.7, 0xBDBDBD), x, 0.39, 0)); });
  g.add(at(box(0.6, 0.4, 0.05, 0x2B2F36, { emissive: 0x1d3557, emissiveIntensity: 0.35 }), 0, 1.1, -0.2));
  return g;
}
function reception(r) {
  // curved front desk, like a hospital reception / nurse station
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.1, 40, 1, true, -Math.PI * 0.75, Math.PI * 1.5),
    mat(0xF3E7C1, { side: THREE.DoubleSide })); outer.castShadow = true; at(outer, 0, 0.55, 0); g.add(outer);
  const top = new THREE.Mesh(new THREE.RingGeometry(r - 0.6, r + 0.05, 40, 1, -Math.PI * 0.25, Math.PI * 1.5), mat(0xE8D49A, { side: THREE.DoubleSide }));
  top.rotation.x = -Math.PI / 2; at(top, 0, 1.12, 0); g.add(top);
  [-0.6, 0.6].forEach(function (x) { g.add(at(box(0.5, 0.35, 0.05, 0x2B2F36, { emissive: 0x1d3557, emissiveIntensity: 0.35 }), x, 1.35, -0.4)); });
  return g;
}
function stairs(w, d, up) {
  const g = new THREE.Group(), n = 10;
  for (let i = 0; i < n; i++) g.add(at(box(w * 0.45, (i + 1) * (WALL_H / n), d / n, 0xD9D9D9), -w * 0.25, (i + 1) * (WALL_H / n) / 2, (up ? 1 : -1) * (d / 2 - (i + 0.5) * d / n)));
  g.add(at(box(w * 0.45, 0.1, d * 0.35, 0xD9D9D9), w * 0.25, 0.05, 0));
  return g;
}
function screenOnPole(h) {
  const g = new THREE.Group();
  g.add(at(cyl(0.05, 0.05, h, 0xBDBDBD), 0, h / 2, 0));
  g.add(at(cyl(0.3, 0.3, 0.06, 0x9E9E9E), 0, 0.03, 0));
  g.add(at(box(0.6, 0.45, 0.1, 0x2B2F36, { emissive: 0x0d47a1, emissiveIntensity: 0.4 }), 0, h + 0.1, 0));
  return g;
}
function cart(w, h, d, color) {
  const g = new THREE.Group();
  g.add(at(box(w, h, d, color || 0xEEEEEE), 0, h / 2 + 0.12, 0));
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) { g.add(at(cyl(0.06, 0.06, 0.12, 0x424242, 8), p[0] * (w / 2 - 0.08), 0.06, p[1] * (d / 2 - 0.08))); });
  return g;
}
function cArm(scale) {
  const g = new THREE.Group();
  g.add(at(box(1.2, 0.5, 0.8, 0xD6D9DD), 0, 0.25, 0));
  g.add(at(cyl(0.12, 0.12, 1.0, 0xC8CCD2), 0, 1.0, 0));
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.12, 10, 32, Math.PI * 1.35), mat(0xE7EAEE));
  arc.rotation.z = Math.PI * 0.82; arc.castShadow = true; at(arc, 0.35, 1.55, 0); g.add(arc);
  g.add(at(box(0.3, 0.3, 0.3, 0x9AA3AD), 0.35, 2.35, 0));
  g.scale.setScalar(scale || 1); return g;
}
function scanner(big) {
  const g = new THREE.Group(), s = big ? 1.2 : 1.0;
  g.add(at(box(1.8 * s, 2.0 * s, 1.2 * s, 0xEEF1F4), 0, 1.0 * s, 0));
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * s, 0.55 * s, 1.25 * s, 28, 1, true), mat(0x5F6B78, { side: THREE.DoubleSide }));
  ring.rotation.x = Math.PI / 2; at(ring, 0, 1.05 * s, 0); g.add(ring);
  g.add(at(box(0.5, 0.55, 2.2 * s, 0xE0E0E0), 0, 0.55, 1.5 * s));
  g.add(at(box(0.45, 0.08, 2.0 * s, 0xBFD3E6), 0, 0.86, 1.5 * s));
  return g;
}
function rack() {
  const g = new THREE.Group();
  g.add(at(box(0.8, 2.0, 0.9, 0x2E3238), 0, 1.0, 0));
  for (let i = 0; i < 6; i++) g.add(at(box(0.6, 0.04, 0.02, 0x66BB6A, { emissive: 0x2E7D32, emissiveIntensity: 0.8 }), 0, 0.35 + i * 0.28, 0.46));
  return g;
}
function equipment(type) {
  switch (type) {
    case 'mobile_c_arm': return cArm(1);
    case 'interventional_xray': { const g = cArm(1.3); g.add(at(box(2.4, 0.9, 0.7, 0xE0E0E0), 0.6, 0.45, -1.2)); return g; }
    case 'ct': return scanner(false);
    case 'mri': return scanner(true);
    case 'ventilator': { const g = cart(0.6, 1.1, 0.5, 0xF2F2F2); g.add(at(box(0.5, 0.4, 0.08, 0x2B2F36, { emissive: 0x00695c, emissiveIntensity: 0.5 }), 0, 1.6, 0)); return g; }
    case 'patient_monitor': return screenOnPole(1.4);
    case 'patient_telemetry': { const g = cart(0.9, 0.9, 0.6, 0xE6E6E6); g.add(at(cyl(0.02, 0.02, 0.6, 0x757575, 6), 0.3, 1.4, 0)); g.add(at(box(0.5, 0.35, 0.08, 0x2B2F36, { emissive: 0x0d47a1, emissiveIntensity: 0.4 }), -0.1, 1.3, 0)); return g; }
    case 'infusion_pump':
    case 'infusion_gateway': { const g = screenOnPole(1.6); g.add(at(box(0.35, 0.3, 0.25, 0xF5F5F5), 0, 1.0, 0.1)); g.add(at(box(0.35, 0.3, 0.25, 0xF5F5F5), 0, 0.65, 0.1)); return g; }
    case 'ultrasound': { const g = cart(0.7, 0.9, 0.6, 0xF0F0F0); g.add(at(box(0.6, 0.45, 0.08, 0x2B2F36, { emissive: 0x0d47a1, emissiveIntensity: 0.4 }), 0, 1.45, -0.1)); return g; }
    case 'pharmacy_compounder': { const g = new THREE.Group(); g.add(at(box(1.6, 1.0, 0.8, 0xE8E8E8), 0, 0.5, 0)); g.add(at(box(1.6, 0.8, 0.8, 0xCFE8F3, { transparent: true, opacity: 0.55 }), 0, 1.4, 0)); return g; }
    case 'imaging_workstation': { const g = desk(); g.add(at(box(0.6, 0.4, 0.05, 0x2B2F36, { emissive: 0x1d3557, emissiveIntensity: 0.35 }), 0.65, 1.1, -0.2)); return g; }
    case 'pacs': return rack();
    default: return cart(0.8, 1.0, 0.6, 0xEEEEEE);
  }
}

// furniture inside a department room (atmosphere only, no data meaning). rw = along the facade (z), rd = depth (x)
function furnish(name, rw, rd, side, poi, cx, cz, door) {
  const n = name.toLowerCase(), g = new THREE.Group(), wallX = side * (rd / 2 - 1.3);
  if (/icu|ward|cardio|emergency/.test(n)) {
    const k = Math.max(1, Math.floor(rw / 3.2));
    for (let i = 0; i < k; i++) {
      const z = -rw / 2 + (i + 0.5) * rw / k, b = bed();
      b.rotation.y = side > 0 ? Math.PI : 0; g.add(at(b, wallX, 0, z));
      if (poi) {                                   // patient in this bed (head at the pillow, towards the facade)
        const head = side > 0 ? 1 : -1, bx = cx + wallX, bz = cz + z;
        poi.beds.push({ x: bx - head * 0.85, y: 1.0, z: bz, rotY: head < 0 ? Math.PI / 2 : -Math.PI / 2 });
        poi.stops.push({ x: bx - side * 1.6, z: bz, rotY: side < 0 ? -Math.PI / 2 : Math.PI / 2, side: side, door: door });
      }
      if (i > 0) { const c = curtain(2.2); c.rotation.y = 0; g.add(at(c, wallX, 1.1, z - rw / k / 2)); }
    }
  } else if (/^or |trauma|cath/.test(n)) {
    g.add(at(box(0.8, 0.9, 2.1, 0xD7DCE1), wallX * 0.2, 0.45, 0));
    if (poi) poi.beds.push({ x: cx + wallX * 0.2, y: 1.06, z: cz + 0.9, rotY: 0 });     // patient on the OR table
    g.add(at(cyl(0.6, 0.35, 0.18, 0xF5F5F5), wallX * 0.2, 2.9, 0));
    g.add(at(box(1.4, 1.8, 0.5, 0xC9D3DC), wallX, 0.9, rw / 2 - 0.6));
  } else if (/radiology/.test(n)) {
    const d1 = desk(); d1.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(at(d1, wallX, 0, rw / 2 - 1.5));
  } else if (/pharmacy/.test(n)) {
    for (let i = 0; i < 3; i++) g.add(at(box(0.5, 2.0, 1.8, 0xE3D9C6), wallX, 1.0, -rw / 2 + 1.6 + i * 2.2));
  }
  return g;
}

// ---------------------------------------------------------------- one storey: a full floor plan
function room(r, x0, x1, z0, z1, side, pickables, beacons, blink, poi) {
  // side: -1 = rooms along the left facade (door on the right), +1 = right facade (door on the left)
  const g = new THREE.Group(), rd = x1 - x0, rw = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  g.position.set(cx, 0, cz); g.userData.off = !!r.off;
  const fl = new THREE.Mesh(new THREE.BoxGeometry(rd - 0.15, 0.04, rw - 0.15), mat(r.color));   // (story: glows red on alarm)
  fl.receiveShadow = true; at(fl, 0, 0.02, 0); g.add(fl);
  // corridor wall with a door (gap) near the middle, and the wall to the next room (back side)
  const doorX = -side * rd / 2, door = 1.6, seg = (rw - door) / 2;
  g.add(at(box(0.15, WALL_H, seg, 0xF5F5F5), doorX, WALL_H / 2, -rw / 2 + seg / 2));
  g.add(at(box(0.15, WALL_H, seg, 0xF5F5F5), doorX, WALL_H / 2, rw / 2 - seg / 2));
  g.add(at(box(rd, WALL_H, 0.15, 0xF0F0F0), 0, WALL_H / 2, -rw / 2));
  // name on the floor near the door
  const lbl = sign(r.name, 4.2); at(lbl, -side * (rd / 2 - 1.0), WALL_H - 0.3, rw / 2 - 0.9); g.add(lbl);   // front corner, by the corridor
  const doorPt = { x: cx + doorX, z: cz };
  if (poi) poi.rooms.push({ name: r.name, x: cx, z: cz, group: g, floor: fl,
                            alarm: (r.machines || []).some(function (m) { return m.level === 'P1' && m.shown; }) });
  if (poi && !r.off) poi.stops.push({ x: cx - side * rd * 0.2, z: cz + rw * 0.22, side: side, door: doorPt });
  g.add(furnish(r.name, rw, rd, side, poi, cx, cz, doorPt));
  // machines in a column in the middle of the room, with their status light above
  const ms = r.machines || [];
  ms.forEach(function (m, j) {
    const mz = -rw / 2 + (j + 1) * rw / (ms.length + 1), mx = -side * rd * 0.05;
    const eq = equipment(m.type); eq.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; at(eq, mx, 0.04, mz);
    if (poi && m.level === 'P1' && m.shown) {      // where the biomed engineer kneels to work on it
      poi.p1Spots.push({ x: cx + mx - side * 1.9, z: cz + mz, rotY: side * Math.PI / 2, side: side, door: doorPt });
    }
    eq.visible = m.shown;
    eq.traverse(function (o) { if (o.isMesh) { o.userData.deviceId = m.id; o.userData.tip = m.tip; pickables.push(o); } });
    g.add(eq);
    const col = LEVEL_COLOR[m.level] || LEVEL_COLOR.P4;
    const bm = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: m.level === 'P4' ? 0.05 : 0.7, roughness: 0.4 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), bm);
    at(beacon, mx, WALL_H - 0.35, mz); beacon.visible = m.shown;
    beacon.userData.deviceId = m.id; beacon.userData.tip = m.tip; beacon.userData.pulse = (m.level === 'P1' && blink);
    pickables.push(beacon); beacons.push(beacon); g.add(beacon);
    const stem = cyl(0.03, 0.03, 0.7, col, 6); at(stem, mx, WALL_H - 0.9, mz); stem.visible = m.shown; g.add(stem);
    if (m.offline) {      // missed its hourly check-in with TrustGate: an orange ring around the light
      const rm = new THREE.MeshStandardMaterial({ color: 0xF08C00, emissive: 0xF08C00, emissiveIntensity: 0.6, roughness: 0.5 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.09, 10, 32), rm);
      ring.rotation.x = Math.PI / 2; at(ring, mx, WALL_H - 0.35, mz); ring.visible = m.shown;
      ring.userData.deviceId = m.id; ring.userData.tip = m.tip; pickables.push(ring); g.add(ring);
    }
  });
  return g;
}

function storey(f, isGround, isTop, pickables, beacons, blink) {
  const g = new THREE.Group();
  const poi = { corridorX: [-W / 2 + ROOM_W + 1.5, W / 2 - ROOM_W - 1.5], crossZ: -D / 2 + CORE_D + 1.5,
                chairs: [], deskSeats: [], beds: [], stops: [], p1Spots: [], rooms: [], walkers: 3, visitorShare: isGround ? 0.45 : 0.25 };
  g.userData.poi = poi;
  g.position.y = f.index * FH; g.userData.floor = f.name; g.userData.index = f.index;
  const front = D / 2, back = -D / 2, xL = -W / 2, xR = W / 2;
  // slab with tiled public floor
  g.add(at(box(W + 0.4, SLAB, D + 0.4, 0xD8D8D8), 0, -SLAB / 2, 0));
  const tex = tiles('#E3ECF1', '#C9D6DE'); tex.repeat.set(W / 2, D / 2);
  const tf = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  tf.rotation.x = -Math.PI / 2; tf.receiveShadow = true; at(tf, 0, 0.005, 0); g.add(tf);

  // facade: glass panels with frames on all four sides (front has the entrance on the ground floor)
  const frame = 0x8C969E, mull = 2.75;
  function fr(m) { m.userData.frame = true; return m; }
  [[W, back, 0], [W, front, 0]].forEach(function (s) {
    g.add(at(glass(W, WALL_H, 0.06), 0, WALL_H / 2, s[1]));
    for (let x = xL; x <= xR + 0.01; x += mull) g.add(fr(at(box(0.08, WALL_H, 0.12, frame), x, WALL_H / 2, s[1])));
    g.add(fr(at(box(W, 0.12, 0.14, frame), 0, WALL_H, s[1])));
  });
  [xL, xR].forEach(function (x) {
    g.add(at(glass(0.06, WALL_H, D), x, WALL_H / 2, 0));
    for (let z = back; z <= front + 0.01; z += mull) g.add(fr(at(box(0.12, WALL_H, 0.08, frame), x, WALL_H / 2, z)));
    g.add(fr(at(box(0.14, 0.12, D, frame), x, WALL_H, 0)));
  });
  if (isGround) {
    g.add(at(box(6, 0.25, 3, 0xBFC7CE), 0, WALL_H + 0.1, front + 1.4));            // entrance canopy
    [-1.4, 1.4].forEach(function (x) { g.add(at(box(1.2, 2.4, 0.08, 0x9FC3D6, { transparent: true, opacity: 0.6 }), x, 1.2, front + 0.05)); });
  }

  // department rooms along the left and right facades
  const rooms = f.rooms || [], nl = Math.ceil(rooms.length / 2), nr = rooms.length - nl;
  const zTop = back, zBot = front - STAIR_D;                                       // rooms stop at the stair wells
  rooms.forEach(function (r, i) {
    const left = i < nl, k = left ? i : i - nl, n = left ? nl : Math.max(1, nr), span = (zBot - zTop) / n;
    const x0 = left ? xL : xR - ROOM_W, x1 = left ? xL + ROOM_W : xR;
    g.add(room(r, x0, x1, zTop + k * span, zTop + (k + 1) * span, left ? -1 : 1, pickables, beacons, blink, poi));
  });
  // closing wall of the room blocks towards the stair wells
  [[xL + ROOM_W / 2], [xR - ROOM_W / 2]].forEach(function (p) { g.add(at(box(ROOM_W, WALL_H, 0.15, 0xF0F0F0), p[0], WALL_H / 2, zBot)); });

  // stair wells in the front corners
  [[xL + ROOM_W / 2, 1], [xR - ROOM_W / 2, -1]].forEach(function (p) {
    const s = stairs(ROOM_W - 2, STAIR_D - 1, true); at(s, p[0], 0, front - STAIR_D / 2); g.add(s);
    g.add(at(box(0.15, WALL_H, STAIR_D, 0xF0F0F0), p[0] + p[1] * (ROOM_W / 2), WALL_H / 2, front - STAIR_D / 2));
  });

  // lift / service core at the back of the lobby
  const cx0 = xL + ROOM_W + CORR, cx1 = xR - ROOM_W - CORR, cw = cx1 - cx0;
  g.add(at(box(cw, WALL_H, 0.15, 0xEDEDED), 0, WALL_H / 2, back + CORE_D));
  for (let i = 1; i < 4; i++) g.add(at(box(0.15, WALL_H, CORE_D, 0xEDEDED), cx0 + i * cw / 4, WALL_H / 2, back + CORE_D / 2));
  [cx0 + cw / 8, cx0 + 3 * cw / 8].forEach(function (x) { g.add(at(box(1.6, 2.3, 0.06, 0xA7B1BA, { metalness: 0.6, roughness: 0.3 }), x, 1.15, back + CORE_D + 0.1)); });
  const lifts = textPlane('LIFTS', 3); at(lifts, cx0 + cw / 4, 0.06, back + CORE_D - 1.2); g.add(lifts);

  // lobby: reception (ground floor) or nurse station, waiting seats
  const rad = isGround ? 2.6 : 2.0;
  const rc = reception(rad); at(rc, 0, 0, front - 10); g.add(rc);
  [-0.7, 0.7].forEach(function (x) {               // stools for the reception / nurse station staff
    g.add(at(cyl(0.22, 0.22, 0.45, 0x5F6B78, 12), x, 0.225, front - 10 - 0.35));
    poi.deskSeats.push({ x: x, z: front - 10 - 0.25, rotY: 0 });
  });
  [-1, 1].forEach(function (sd) { poi.stops.push({ x: sd * (rad + 0.9), z: front - 10 + 0.4, rotY: -sd * Math.PI / 2, side: sd }); });
  [[-6.5, front - 5.5], [3.5, front - 5.5], [-6.5, front - 3.5], [3.5, front - 3.5]].forEach(function (p) {
    g.add(at(chairRow(5), p[0], 0, p[1]));
    for (let i = 0; i < 5; i++) poi.chairs.push({ x: p[0] + i * 0.6, z: p[1] - 0.05, rotY: 0 });
  });
  const lobby = textPlane(isGround ? 'RECEPTION' : 'NURSE STATION', 4.2, { color: '#6b6b6b' }); at(lobby, 0, 0.06, front - 6.8); g.add(lobby);

  // floor name on the slab edge (readable from the default view)
  const name = textPlane(f.name.toUpperCase(), 7, { color: '#494848' });
  name.rotation.x = 0; name.rotation.y = 0; at(name, xL + 4.2, -SLAB / 2, front + 0.25); g.add(name);

  if (isTop) {                                                                       // roof edge (parapet), glass roof
    g.add(at(box(W + 0.4, 0.5, 0.3, 0xCFCFCF), 0, WALL_H + 0.25 + 0.25, front));
    g.add(at(box(W + 0.4, 0.5, 0.3, 0xCFCFCF), 0, WALL_H + 0.25 + 0.25, back));
    g.add(at(box(0.3, 0.5, D, 0xCFCFCF), xL, WALL_H + 0.25 + 0.25, 0));
    g.add(at(box(0.3, 0.5, D, 0xCFCFCF), xR, WALL_H + 0.25 + 0.25, 0));
  }
  return g;
}

function buildWorld(scene) {
  const world = new THREE.Group(), pickables = [], beacons = [];
  const floors = scene.floors || [], top = floors.length - 1;
  // ground: pavement + a little landscape so it reads as a building on a site
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 30, D + 30), new THREE.MeshStandardMaterial({ color: 0xEDEDED, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -SLAB - 0.01; ground.receiveShadow = true; world.add(ground);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(6, 14), new THREE.MeshStandardMaterial({ color: 0xD6D6D6, roughness: 1 }));
  path.rotation.x = -Math.PI / 2; at(path, 0, -SLAB, D / 2 + 7); world.add(path);
  [[-W / 2 - 5, D / 2 + 4], [W / 2 + 5, D / 2 + 4], [-W / 2 - 6, -D / 2 + 2], [W / 2 + 6, -4]].forEach(function (p) {
    const t = new THREE.Group(); t.add(at(cyl(0.18, 0.22, 1.6, 0x8D6E63, 8), 0, 0.8, 0));
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), mat(0xA5C9A1)); crown.castShadow = true; at(crown, 0, 2.4, 0); t.add(crown);
    at(t, p[0], -SLAB, p[1]); world.add(t);
  });
  const alarms = [];
  floors.forEach(function (f) {
    const st = storey(f, f.index === 0, f.index === top, pickables, beacons, scene.blink);
    world.add(st);
    if (scene.mode === 'story') st.userData.poi.rooms.forEach(function (rm) {
      if (!rm.alarm) return;
      const light = new THREE.PointLight(0xFF2A2A, 0, 14, 1.4); at(light, 0, WALL_H - 0.5, 0); rm.group.add(light);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.25), new THREE.MeshStandardMaterial({ color: 0x661111, emissive: 0xFF1A1A, emissiveIntensity: 0 }));
      at(lamp, 0, WALL_H - 0.08, 0); rm.group.add(lamp);
      rm.floor.material.emissive = new THREE.Color(0xFF1A1A);
      alarms.push({ light: light, lamp: lamp, floorMat: rm.floor.material, floorIndex: f.index });
    });
  });
  return { world: world, pickables: pickables, beacons: beacons, alarms: alarms };
}

// The selected floor is the open floor plan; floors ABOVE become faint ghosts (so you look into it), floors BELOW fade.
// Departments filtered out fade too. "All floors" = the whole glass building.
function applyFocus(world, scene) {
  const grey = new THREE.Color(0xDADADA);
  const sel = (scene.floors || []).find(function (f) { return f.name === scene.selected; });
  const openIndex = sel ? sel.index : (scene.floors || []).length - 1;     // the floor you look into
  world.children.forEach(function (fg) {
    if (fg.userData.index === undefined) return;
    const above = sel && fg.userData.index > sel.index, below = sel && fg.userData.index < sel.index;
    fg.traverse(function (o) {
      if (!o.isMesh && !o.isSprite) return;
      if (o.isSprite && fg.userData.index !== openIndex) { o.visible = false; return; }   // signs only on the open floor
      let roomOff = false, p = o;
      while (p) { if (p.userData && p.userData.off) { roomOff = true; break; } p = p.parent; }
      const m = o.material;
      if (!m.userData.base) m.userData.base = { color: m.color ? m.color.clone() : null, opacity: m.opacity, transparent: m.transparent };
      if (above && !o.userData.frame) { o.visible = false; return; }
      let fade = 1;
      if (above) fade = 0.18; else if (below) fade = 0.3; else if (roomOff) fade = 0.28;
      if (m.color && m.userData.base.color) { m.color.copy(m.userData.base.color); if (above || below) m.color.lerp(grey, 0.7); }
      m.opacity = (m.userData.base.opacity || 1) * fade;
      m.transparent = fade < 1 || m.userData.base.transparent || !!o.userData.isLabel;
      m.depthWrite = fade >= 1 && !m.userData.base.transparent && !o.userData.isLabel;
      o.castShadow = fade >= 1 && !o.userData.glass && !o.userData.isLabel;
      o.userData.faded = above || below;
      if (above && o.userData.isLabel) o.visible = false;
    });
  });
}

// ---------------------------------------------------------------- camera (iso start, drag to rotate, wheel to zoom)
function viewFor(scene) {
  const floors = scene.floors || [];
  const sel = floors.find(function (f) { return f.name === scene.selected; });
  if (sel) return { target: new THREE.Vector3(0, sel.index * FH + 1.2, 1), zoom: 1.35 };
  return { target: new THREE.Vector3(0, (floors.length * FH) / 2 - 2, 2), zoom: 0.92 };
}
function placeCamera() {
  const c = S.cam, r = 140;
  c.position.set(S.target.x + r * Math.cos(S.el) * Math.sin(S.az), S.target.y + r * Math.sin(S.el), S.target.z + r * Math.cos(S.el) * Math.cos(S.az));
  c.lookAt(S.target); c.zoom = S.zoom; c.updateProjectionMatrix();
}
function resize() {
  const w = S.container.clientWidth, h = S.container.clientHeight, half = 24;
  S.renderer.setSize(w, h, false);
  const aspect = w / Math.max(1, h);
  S.cam.left = -half * aspect; S.cam.right = half * aspect; S.cam.top = half; S.cam.bottom = -half;
  S.cam.updateProjectionMatrix();
}
const HOME_AZ = -Math.PI / 6, HOME_EL = 0.72;

function init(container, story) {
  if (S.renderer) { S.renderer.dispose(); S.renderer.domElement.remove(); }
  S.container = container;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(story ? 0x15181D : 0xFFFFFF, 1);
  container.appendChild(renderer.domElement);
  S.renderer = renderer;
  S.three = new THREE.Scene();
  S.three.add(new THREE.HemisphereLight(0xFFFFFF, 0xD0D0D0, story ? 0.75 : 1.5));
  const sun = new THREE.DirectionalLight(story ? 0xDDE6FF : 0xFFFFFF, story ? 1.0 : 1.8);
  sun.position.set(-40, 70, 50); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 40, bottom: -40, near: 1, far: 250 });
  S.three.add(sun);
  S.cam = new THREE.OrthographicCamera(-40, 40, 40, -40, 0.1, 600);
  S.az = HOME_AZ; S.el = HOME_EL; S.target = new THREE.Vector3(); S.zoom = 1;
  S.tip = document.createElement('div'); S.tip.className = 'tg3d-tip'; container.appendChild(S.tip);
  S.isStory = !!story;
  if (story) { storyOverlays(container); bindStoryResize(container); S.clock = new THREE.Clock(); loop(); return; }
  const reset = document.createElement('button'); reset.className = 'tg3d-reset'; reset.textContent = 'Reset view';
  reset.addEventListener('click', function () { S.az = HOME_AZ; S.el = HOME_EL; const v = viewFor(S.scene || {}); S.target.copy(v.target); S.zoom = v.zoom; placeCamera(); });
  container.appendChild(reset);
  const hint = document.createElement('div'); hint.className = 'tg3d-hint'; hint.textContent = 'Drag to rotate - scroll to zoom - click a machine for details';
  container.appendChild(hint);
  bindInput(renderer.domElement);
  new ResizeObserver(function () { if (S.container === container) resize(); }).observe(container);
  resize();
  S.clock = new THREE.Clock();
  loop();
}

function pick(ev) {
  const rect = S.renderer.domElement.getBoundingClientRect();
  const v = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  const ray = new THREE.Raycaster(); ray.setFromCamera(v, S.cam);
  const hits = ray.intersectObjects(S.pickables || [], false).filter(function (h) {
    let o = h.object; while (o) { if (!o.visible) return false; o = o.parent; } return !h.object.userData.faded;
  });
  return hits.length ? hits[0].object : null;
}

function bindInput(el) {
  let drag = null, moved = false;
  el.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, az: S.az, el: S.el }; moved = false; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', function (e) {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      S.az = drag.az - dx * 0.006; S.el = Math.min(1.45, Math.max(0.2, drag.el + dy * 0.004)); placeCamera();
      return;
    }
    const hit = pick(e);
    el.style.cursor = hit ? 'pointer' : 'grab';
    if (hit) {
      const rect = S.container.getBoundingClientRect();
      S.tip.textContent = hit.userData.tip; S.tip.style.display = 'block';
      S.tip.style.left = (e.clientX - rect.left + 14) + 'px'; S.tip.style.top = (e.clientY - rect.top + 10) + 'px';
    } else { S.tip.style.display = 'none'; }
  });
  el.addEventListener('pointerup', function (e) {
    const wasDrag = moved; drag = null;
    if (wasDrag) return;
    const hit = pick(e);
    if (hit && window.dash_clientside && window.dash_clientside.set_props) {
      window.dash_clientside.set_props('map-click', { data: { id: hit.userData.deviceId, t: Date.now() } });
    }
  });
  el.addEventListener('pointerleave', function () { S.tip.style.display = 'none'; });
  el.addEventListener('wheel', function (e) { e.preventDefault(); S.zoom = Math.min(5, Math.max(0.5, S.zoom * (e.deltaY > 0 ? 0.9 : 1.1))); placeCamera(); }, { passive: false });
}

function loop() {
  if (!S.container || !document.body.contains(S.container)) { S.running = false; return; }
  S.running = true;
  requestAnimationFrame(loop);
  if (S.capture) return;                                      // video capture: frames are stepped from outside
  const t = S.clock.getElapsedTime();
  const dt = Math.min(0.1, S.lastT === undefined ? 0 : t - S.lastT); S.lastT = t;
  frame(dt, t);
}

function frame(dt, t) {
  if (S.goal) {                                               // time-based glide (same speed at any frame rate)
    const k = 1 - Math.pow(0.0005, dt);
    S.target.lerp(S.goal.target, k); S.zoom += (S.goal.zoom - S.zoom) * k;
    if (S.target.distanceTo(S.goal.target) < 0.01 && Math.abs(S.zoom - S.goal.zoom) < 0.005) S.goal = null;
    placeCamera();
  }
  const reduce = !S.capture && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  updatePeople(S.agents || [], dt, !reduce);
  if (S.isStory) { storyTick(dt, t, reduce); }
  (S.beacons || []).forEach(function (b) {
    b.scale.setScalar((b.userData.pulse && !b.userData.faded && !reduce) ? 1 + 0.3 * (0.5 + 0.5 * Math.sin(t * 4)) : 1);
  });
  S.renderer.render(S.three, S.cam);
}

// ?page=story&capture=1 : deterministic stepping for recording the MP4 (tools drive window.TGCapture)
if (new URLSearchParams(window.location.search).get('capture') === '1') {
  S.capture = true; S.capT = 0;
  window.TGCapture = {
    ready: function () { return !!(S.story && S.story.shots.length > 2 && S.agents && S.agents.length); },
    length: function () { return S.story.shots.reduce(function (a, sh) { return a + sh.dur; }, 0); },
    shots: function () { return S.story.shots.map(function (sh) { return { kind: sh.kind, dur: sh.dur }; }); },
    step: function (dt) { S.capT += dt; frame(dt, S.capT); return S.capT; },
  };
}

function render(containerId, scene) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const fresh = S.container !== container;
  if (S.capture && !fresh && S.story && S.story.shots.length > 2) return;      // recording: ignore 5-minute data refreshes
  if (fresh) init(container, scene.mode === 'story');
  if (S.world) {
    S.three.remove(S.world);
    S.world.traverse(function (o) { if ((o.isMesh || o.isSprite) && !o.userData.isPerson) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
  }
  const built = buildWorld(scene);
  S.world = built.world; S.pickables = built.pickables; S.beacons = built.beacons; S.alarms = built.alarms;
  S.three.add(S.world);
  applyFocus(S.world, scene);
  S.agents = [];
  const gen = (S.gen = (S.gen || 0) + 1);
  if (scene.people) {
    loadPeople().then(function (gltf) {
      if (gen !== S.gen) return;                   // a newer render replaced this building
      S.world.children.forEach(function (fg) {
        if (fg.userData.poi) S.agents = S.agents.concat(populate(gltf, fg, fg.userData.poi, 7919 * (fg.userData.index + 1), { panic: scene.mode === 'story' }));
      });
      applyFocus(S.world, scene);
      const kinds = S.agents.reduce(function (o, a) { const k = a.walker ? (a.walker.engineer ? 'engineers' : 'walkers') : 'still'; o[k] = (o[k] || 0) + 1; return o; }, {});
      console.info('TrustGate people: ' + S.agents.length + ' ' + JSON.stringify(kinds));
    }).catch(function (e) { console.warn('TrustGate: people model could not be loaded', e); });
  }
  const v = viewFor(scene);
  const floorChanged = !S.scene || S.scene.selected !== scene.selected;
  S.scene = scene;
  if (scene.mode === 'story') { startStory(scene, fresh); }
  else if (fresh) { S.target.copy(v.target); S.zoom = v.zoom; placeCamera(); }
  else if (floorChanged) { S.goal = v; }
  if (!S.running) loop();
}

// ---------------------------------------------------------------- story mode (?page=story): scripted camera, alarms, captions
function el(tag, cls, parent) { const e = document.createElement(tag); if (cls) e.className = cls; parent.appendChild(e); return e; }
function storyOverlays(container) {
  const brand = el('div', 'tgs-brand', container); brand.innerHTML = 'Hodor<span>medical device warnings</span>';
  S.caption = el('div', 'tgs-caption', container);
  S.numbers = el('div', 'tgs-numbers', container);
  if (S.capture) {                                            // recording: no buttons in the video
    const ex = document.querySelector('.tg-story-exit'); if (ex) ex.style.display = 'none';
    return;
  }
  const snd = el('button', 'tgs-sound', container); snd.textContent = 'Click for sound';
  snd.addEventListener('click', function () {
    if (!S.audio) { S.audio = new (window.AudioContext || window.webkitAudioContext)(); }
    S.audioOn = !S.audioOn; if (S.audio.state === 'suspended') S.audio.resume();
    snd.textContent = S.audioOn ? 'Sound on' : 'Click for sound';
  });
}
function bindStoryResize(container) { new ResizeObserver(function () { if (S.container === container) resize(); }).observe(container); resize(); }
function setCaption(t, lines, alarm) {
  if (!S.caption) return;
  S.caption.style.opacity = 0;
  setTimeout(function () {
    S.caption.innerHTML = '';
    const a = el('div', 't' + (alarm ? ' alarm' : ''), S.caption); a.textContent = t;
    (lines || []).forEach(function (l) { el('div', 'l', S.caption).textContent = l; });
    S.caption.style.opacity = 1;
  }, 350);
}
function startStory(scene, fresh) {
  const st = scene.story || { shots: [], numbers: [] };
  // numbers panel (live data)
  if (S.numbers) {
    S.numbers.innerHTML = '';
    st.numbers.forEach(function (nv, i) {
      el('div', 'n' + (i < 2 ? ' red' : ''), S.numbers).textContent = nv[1];
      el('div', 'k', S.numbers).textContent = nv[0];
    });
    el('div', 'src', S.numbers).textContent = st.source || '';
  }
  // where every room is, in world coordinates
  S.roomPos = {};
  S.world.children.forEach(function (fg) {
    if (!fg.userData.poi) return;
    fg.userData.poi.rooms.forEach(function (rm) { S.roomPos[rm.name] = new THREE.Vector3(rm.x, fg.position.y + 1.0, rm.z); });
  });
  const floorIndex = {}; (scene.floors || []).forEach(function (f) { floorIndex[f.name] = f.index; });
  const shots = [{ kind: 'ext', dur: 7, t: st.intro, lines: ['Three floors, 19 connected medical devices'] }];
  let lastFloor = null;
  st.shots.forEach(function (sh) {
    if (sh.floor !== lastFloor) {
      const n = st.shots.filter(function (x) { return x.floor === sh.floor; }).length;
      shots.push({ kind: 'floor', floor: sh.floor, dur: 3.5, t: sh.floor, lines: [n + ' room' + (n === 1 ? '' : 's') + ' with an exploitable device'] });
      lastFloor = sh.floor;
    }
    shots.push({ kind: 'room', floor: sh.floor, room: sh.room, dur: 6.5, t: sh.title, lines: sh.lines, alarm: true });
  });
  shots.push({ kind: 'out', dur: 8, t: st.outro, lines: [], alarm: true });
  const keep = !fresh && S.story && S.story.i >= 0 && S.story.shots.length === shots.length;
  const prev = keep ? { i: S.story.i, left: S.story.left } : null;
  S.story = { scene: scene, shots: shots, i: -1, left: 0, floorIndex: floorIndex, beepT: 0 };
  if (prev) {                                                 // data refresh: continue the current scene
    S.story.i = prev.i; S.story.left = prev.left;
    applyFocus(S.world, { floors: scene.floors, selected: shots[prev.i].floor || 'ALL' });
    S.world.traverse(function (o) { if (o.isSprite) o.visible = false; });
    return;
  }
  if (fresh) { S.az = HOME_AZ; S.el = 0.62; const v = viewFor({ floors: scene.floors, selected: 'ALL' }); S.target.copy(v.target); S.zoom = 0.75; placeCamera(); }
  // ?page=story&shot=N starts at scene N (for rehearsing a moment of the pitch, and for checks)
  const want = parseInt(new URLSearchParams(window.location.search).get('shot') || '', 10);
  if (!S.shotParamUsed && want >= 0 && want < shots.length) { S.shotParamUsed = true; goShot(want); S.target.copy(S.goal.target); S.zoom = S.goal.zoom; S.goal = null; placeCamera(); }
}
function goShot(i) {
  const st = S.story, sh = st.shots[i], scene = st.scene;
  st.i = i; st.left = sh.dur;
  st.azBase = HOME_AZ + (sh.kind === 'room' ? (i % 2 ? 0.18 : -0.18) : 0);   // stay on the open (front) side
  const sel = sh.floor || 'ALL';
  applyFocus(S.world, { floors: scene.floors, selected: sel });
  S.world.traverse(function (o) { if (o.isSprite) o.visible = false; });     // the caption names the room; signs get huge up close
  if (sh.kind === 'room' && S.roomPos[sh.room]) S.goal = { target: S.roomPos[sh.room].clone(), zoom: 3.1 };
  else if (sh.kind === 'floor') S.goal = viewFor({ floors: scene.floors, selected: sh.floor });
  else { const v = viewFor({ floors: scene.floors, selected: 'ALL' }); S.goal = { target: v.target, zoom: sh.kind === 'ext' ? 0.8 : 0.9 }; }
  setCaption(sh.t, sh.lines, sh.alarm);
}
function beep() {
  if (!S.audioOn || !S.audio) return;
  [[880, 0], [660, 0.22]].forEach(function (b) {
    const o = S.audio.createOscillator(), g = S.audio.createGain(), t0 = S.audio.currentTime + b[1];
    o.type = 'sine'; o.frequency.value = b[0]; g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    o.connect(g).connect(S.audio.destination); o.start(t0); o.stop(t0 + 0.2);
  });
}
function storyTick(dt, t, reduce) {
  const st = S.story; if (!st) return;
  st.left -= dt;
  if (st.i < 0 || st.left <= 0) goShot((st.i + 1) % st.shots.length);
  const sh = st.shots[st.i];
  if (!reduce) {
    const rate = sh.kind === 'ext' || sh.kind === 'out' ? 0.06 : 0.03, elapsed = sh.dur - st.left;
    const want = st.azBase + rate * (elapsed - sh.dur / 2);  // gentle drift around the shot's own angle
    S.az += (want - S.az) * (1 - Math.pow(0.02, dt));
    if (!S.goal) placeCamera();
  }
  // alarms: flashing red, only on the floor in view (and below it); all of them in the outside shots
  const selIdx = sh.floor ? st.floorIndex[sh.floor] : 99;
  const pulse = reduce ? 0.7 : 0.5 + 0.5 * Math.max(0, Math.sin(t * 7));
  (S.alarms || []).forEach(function (a) {
    const on = a.floorIndex <= selIdx;
    a.light.intensity = on ? 45 * pulse : 0;
    a.lamp.material.emissiveIntensity = on ? 2.5 * pulse : 0;
    a.floorMat.emissiveIntensity = on ? 0.35 * pulse : 0;
  });
  if (sh.kind === 'room' || sh.kind === 'out') { st.beepT -= dt; if (st.beepT <= 0) { beep(); st.beepT = 1.1; } }
}

window.TG3D = { render: render };
if (window.__tg3dPending) { const p = window.__tg3dPending; window.__tg3dPending = null; render(p.id, p.scene); }
