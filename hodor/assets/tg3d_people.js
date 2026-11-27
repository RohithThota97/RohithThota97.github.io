// TrustGate - people in the 3D hospital (doctors, nurses, patients, visitors, reception staff, biomed engineer).
// Bodies + hair: Quaternius Universal Base Characters (Standard, CC0 1.0). Motion: Quaternius Universal Animation
// Library (CC0), retargeted offline onto the base-character skeleton (7 clips). Files in people/ (single ASCII glTFs,
// textures embedded). Clothing is painted per body region at runtime (white lab coat, teal nurse dress / scrubs,
// patient gown, navy reception uniform, hi-vis vest, everyday clothes), plus a coat / dress / gown skirt that moves
// with the hips. Atmosphere only, except the biomed engineer (hi-vis vest), who walks from one P1 machine to the next
// on each floor and kneels at it: "what to fix first". Keep this file ASCII-only.

import * as THREE from 'three';
import { GLTFLoader } from './addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from './addons/utils/SkeletonUtils.js';

const BASE = new URL('./people/', import.meta.url).href;
const WALK_SPEED = 1.25;                       // metres per second

// ---------------------------------------------------------------- outfits: region -> colour (null = skin)
// regions: head, torso, hips, uarm, larm, hand, thigh, calf, foot
const SHOES_BLACK = 0x2B2B2B, SHOES_WHITE = 0xEDEDED, NAVY = 0x2F3E5C;
function outfit(role, gender, r) {
  switch (role) {
    case 'doctor': return { colors: { torso: 0xF7F7F7, hips: 0xF7F7F7, uarm: 0xF7F7F7, larm: 0xF7F7F7, thigh: 0xF7F7F7, calf: 0x3A4B6E, foot: SHOES_BLACK },
                            skirt: { color: 0xF7F7F7, length: 'knee', flare: 1.32 } };                   // white lab coat
    case 'nurse': return gender === 'f'
      ? { colors: { torso: 0x3E9C97, hips: 0x3E9C97, uarm: 0x3E9C97, thigh: 0x3E9C97, calf: 0xE9E2DA, foot: SHOES_WHITE },
          skirt: { color: 0x3E9C97, length: 'knee', flare: 1.22 } }                                         // nurse dress
      : { colors: { torso: 0x3E9C97, hips: 0x3E9C97, uarm: 0x3E9C97, thigh: 0x3E9C97, calf: 0x3E9C97, foot: SHOES_WHITE } }; // scrubs
    case 'patient': return { colors: { torso: 0xA9C8E8, hips: 0xA9C8E8, uarm: 0xA9C8E8, thigh: 0xA9C8E8 },
                             skirt: { color: 0xA9C8E8, length: 'knee', flare: 1.18 } };                   // hospital gown
    case 'staff': return { colors: { torso: NAVY, hips: NAVY, uarm: NAVY, larm: NAVY, thigh: 0x3B3B3B, calf: 0x3B3B3B, foot: SHOES_BLACK } };
    case 'engineer': return { colors: { torso: 0xE5D21A, hips: 0x4A4F57, uarm: 0x6B7280, larm: 0x6B7280, thigh: 0x2E3A4F, calf: 0x2E3A4F, foot: 0x3A2E24 } };
    default: {                                                                                                 // visitor
      const tops = [0x8D6E63, 0x5C6BC0, 0x78909C, 0xB0796B, 0x6D8F6D, 0xC9A66B, 0x9C4F5E, 0xE0E0E0];
      const bottoms = [0x34495E, 0x3B5A86, 0x4B4B4B, 0x6D5A45];
      const top = tops[Math.floor(r() * tops.length)], bottom = bottoms[Math.floor(r() * bottoms.length)];
      const longSleeves = r() < 0.5;
      return { colors: { torso: top, hips: bottom, uarm: top, larm: longSleeves ? top : null, thigh: bottom, calf: bottom, foot: SHOES_BLACK } };
    }
  }
}
// garment layers: regions covered by a separate cloth shell (thickness in metres)
function garments(role) {
  switch (role) {
    case 'doctor': return [{ regions: ['torso', 'hips', 'uarm', 'larm', 'thigh'], thick: 0.028, smooth: 6 }];   // lab coat
    case 'nurse': return [{ regions: ['torso', 'hips', 'uarm', 'thigh'], thick: 0.016, smooth: 5 }];            // dress / scrubs
    case 'patient': return [{ regions: ['torso', 'hips', 'uarm', 'thigh'], thick: 0.02, smooth: 6 }];           // gown
    case 'staff': return [{ regions: ['torso', 'hips', 'uarm', 'larm'], thick: 0.016, smooth: 5 }];             // uniform jacket
    case 'engineer': return [{ regions: ['torso'], thick: 0.03, smooth: 5 }];                                   // hi-vis vest
    default: return [{ regions: ['torso', 'uarm'], thick: 0.012, smooth: 4 }];                                  // shirt / top
  }
}
function regionOf(name) {
  if (/^(Head|neck)/.test(name)) return 'head';
  if (/^pelvis/.test(name)) return 'hips';
  if (/^(spine|clavicle)/.test(name)) return 'torso';
  if (/^upperarm/.test(name)) return 'uarm';
  if (/^lowerarm/.test(name)) return 'larm';
  if (/^(hand|index|middle|ring|pinky|thumb)/.test(name)) return 'hand';
  if (/^thigh/.test(name)) return 'thigh';
  if (/^calf/.test(name)) return 'calf';
  if (/^(foot|ball)/.test(name)) return 'foot';
  return 'torso';
}

// ---------------------------------------------------------------- loading
let loaded = null;
export function loadPeople() {
  if (!loaded) {
    const L = new GLTFLoader();
    loaded = Promise.all([L.loadAsync(BASE + 'body_male.gltf'), L.loadAsync(BASE + 'body_female.gltf'),
                          L.loadAsync(BASE + 'hair.gltf'), fetch(BASE + 'skins.json').then(function (r) { return r.json(); })])
      .then(function (res) {
        const tl = new THREE.TextureLoader(), keys = Object.keys(res[3]);
        return Promise.all(keys.map(function (k) { return tl.loadAsync(res[3][k]); })).then(function (texs) {
          const skins = {};
          texs.forEach(function (t, i) { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; skins[keys[i]] = t; });
          const hair = {}; res[2].scene.updateMatrixWorld(true);
          res[2].scene.traverse(function (o) { if (o.isMesh) hair[o.name] = o; });   // keep each style's own transform (some are scaled 0.01)
          return { m: res[0], f: res[1], hair: hair, skins: skins, geoCache: {}, shellCache: {} };
        });
      });
  }
  return loaded;
}

function rng(seed) { let s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// per-vertex clothing colour (rgb + mask) from the bone each vertex follows most; cached per body + outfit
function clothedGeometry(lib, gender, mesh, out, key) {
  const ck = gender + '|' + key;
  if (lib.geoCache[ck]) return lib.geoCache[ck];
  const geo = mesh.geometry.clone(), j = geo.attributes.skinIndex, w = geo.attributes.skinWeight;
  const bones = mesh.skeleton.bones, n = j.count, arr = new Float32Array(n * 4), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const wk = w.getComponent(i, k); if (wk > bw) { bw = wk; best = j.getComponent(i, k); } }
    const col = out.colors[regionOf(bones[best].name)];
    if (col === undefined || col === null) { arr[i * 4 + 3] = 0; continue; }
    c.setHex(col); arr[i * 4] = c.r; arr[i * 4 + 1] = c.g; arr[i * 4 + 2] = c.b; arr[i * 4 + 3] = 1;
  }
  geo.setAttribute('aCloth', new THREE.BufferAttribute(arr, 4));
  lib.geoCache[ck] = geo; return geo;
}
// A skinned cloth layer: the body triangles of the given regions, pushed out along the normals and smoothed so the
// fabric hangs instead of following every muscle. Vertices split at UV seams are welded for the smoothing.
function clothShell(lib, gender, mesh, g, key) {
  const ck = gender + '|' + key;
  if (lib.shellCache[ck]) return lib.shellCache[ck];
  const src = mesh.geometry, pos = src.attributes.position, nrm = src.attributes.normal;
  const j = src.attributes.skinIndex, w = src.attributes.skinWeight, bones = mesh.skeleton.bones, n = pos.count;
  const inSet = new Uint8Array(n), want = {};
  g.regions.forEach(function (r) { want[r] = true; });
  for (let i = 0; i < n; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const wk = w.getComponent(i, k); if (wk > bw) { bw = wk; best = j.getComponent(i, k); } }
    inSet[i] = want[regionOf(bones[best].name)] ? 1 : 0;
  }
  const idx = src.index.array, tris = [];
  for (let t = 0; t < idx.length; t += 3) if (inSet[idx[t]] && inSet[idx[t + 1]] && inSet[idx[t + 2]]) tris.push(idx[t], idx[t + 1], idx[t + 2]);
  // weld by position
  const keyOf = function (i) { return Math.round(pos.getX(i) * 2000) + ',' + Math.round(pos.getY(i) * 2000) + ',' + Math.round(pos.getZ(i) * 2000); };
  const gid = new Int32Array(n).fill(-1), groups = {}; let ng = 0;
  for (let i = 0; i < n; i++) { if (!inSet[i]) continue; const k = keyOf(i); if (groups[k] === undefined) groups[k] = ng++; gid[i] = groups[k]; }
  const P = new Float32Array(ng * 3), N = new Float32Array(ng * 3), cnt = new Float32Array(ng);
  for (let i = 0; i < n; i++) { const q = gid[i]; if (q < 0) continue;
    P[q * 3] += pos.getX(i); P[q * 3 + 1] += pos.getY(i); P[q * 3 + 2] += pos.getZ(i);
    N[q * 3] += nrm.getX(i); N[q * 3 + 1] += nrm.getY(i); N[q * 3 + 2] += nrm.getZ(i); cnt[q]++; }
  for (let q = 0; q < ng; q++) {
    P[q * 3] /= cnt[q]; P[q * 3 + 1] /= cnt[q]; P[q * 3 + 2] /= cnt[q];
    const l = Math.hypot(N[q * 3], N[q * 3 + 1], N[q * 3 + 2]) || 1;
    for (let a = 0; a < 3; a++) P[q * 3 + a] += N[q * 3 + a] / l * g.thick;     // inflate
  }
  const nb = Array.from({ length: ng }, function () { return []; });
  for (let t = 0; t < tris.length; t += 3) for (let a = 0; a < 3; a++) {
    const u = gid[tris[t + a]], v = gid[tris[t + (a + 1) % 3]];
    if (u !== v) { nb[u].push(v); nb[v].push(u); }
  }
  let cur = P;
  for (let it = 0; it < g.smooth; it++) {                                        // Laplacian smoothing
    const nx = new Float32Array(cur);
    for (let q = 0; q < ng; q++) { const L = nb[q]; if (L.length < 3) continue;
      let x = 0, y = 0, z = 0; for (let m = 0; m < L.length; m++) { x += cur[L[m] * 3]; y += cur[L[m] * 3 + 1]; z += cur[L[m] * 3 + 2]; }
      nx[q * 3] = cur[q * 3] * 0.5 + x / L.length * 0.5; nx[q * 3 + 1] = cur[q * 3 + 1] * 0.5 + y / L.length * 0.5; nx[q * 3 + 2] = cur[q * 3 + 2] * 0.5 + z / L.length * 0.5; }
    cur = nx;
  }
  const geo = new THREE.BufferGeometry();
  const outPos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const q = gid[i]; if (q < 0) continue; outPos[i * 3] = cur[q * 3]; outPos[i * 3 + 1] = cur[q * 3 + 1]; outPos[i * 3 + 2] = cur[q * 3 + 2]; }
  geo.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  geo.setAttribute('skinIndex', src.attributes.skinIndex); geo.setAttribute('skinWeight', src.attributes.skinWeight);
  geo.setIndex(tris);
  geo.computeVertexNormals();
  lib.shellCache[ck] = geo; return geo;
}

function clothMaterial(base, skinTex) {
  const m = base.clone();
  if (skinTex) m.map = skinTex;
  m.roughness = 0.8; m.metalness = 0;
  m.onBeforeCompile = function (sh) {
    sh.vertexShader = 'attribute vec4 aCloth;\nvarying vec4 vCloth;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCloth = aCloth;');
    sh.fragmentShader = 'varying vec4 vCloth;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\nfloat tgShade = 0.88 + 0.24 * dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));\n' +
      'diffuseColor.rgb = mix(diffuseColor.rgb, vCloth.rgb, vCloth.a);');
  };
  m.customProgramCacheKey = function () { return 'tg-cloth'; };
  return m;
}
// attach a mesh given in the character's rest (model) space to a bone, so it follows that bone
function attachToBone(root, bone, obj) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const boneInModel = new THREE.Matrix4().multiplyMatrices(inv, bone.matrixWorld);
  obj.applyMatrix4(new THREE.Matrix4().copy(boneInModel).invert());
  bone.add(obj);
}

function makePerson(lib, role, gender, r) {
  const gl = lib[gender], root = SkeletonUtils.clone(gl.scene), out = outfit(role, gender, r);
  const key = role + '|' + JSON.stringify(out.colors);
  const dark = r() < 0.35, skin = dark ? lib.skins[gender === 'm' ? 'male_dark' : 'female_dark'] : null;
  const hairTint = [0x3B2A20, 0x1E1A18, 0x6B4A2F, 0x8A6A44, 0x555555][Math.floor(r() * 5)];
  let body = null;
  root.traverse(function (o) {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; o.userData.isPerson = true;
    if (/Superhero|SuperHero/.test(o.name) || /Superhero/.test(o.material.name)) {
      body = o; o.geometry = clothedGeometry(lib, gender, o, out, key); o.material = clothMaterial(o.material, skin);
    } else {
      o.material = o.material.clone();
      if (/Hair/.test(o.material.name)) o.material.color.setHex(hairTint).multiplyScalar(2.4);   // eyebrows match the hair
    }
  });
  // real garment layers over the body (follow the same skeleton, so they move with walking / sitting / kneeling)
  if (body) garments(role).forEach(function (g, gi) {
    const firstColor = out.colors[g.regions[0]];
    if (firstColor === undefined || firstColor === null) return;
    const shell = new THREE.SkinnedMesh(clothShell(lib, gender, body, g, role + gi + g.regions.join('')),
      new THREE.MeshStandardMaterial({ color: firstColor, roughness: 0.88, metalness: 0, side: THREE.DoubleSide }));
    if (role === 'engineer') shell.material.emissive = new THREE.Color(0x3A3300);              // hi-vis glow
    shell.bind(body.skeleton, body.bindMatrix);
    shell.castShadow = true; shell.frustumCulled = false; shell.userData.isPerson = true;
    body.parent.add(shell);
  });
  // hair (and sometimes a beard), attached to the head
  const head = root.getObjectByName('Head');
  const styles = gender === 'm' ? ['Hair_Buzzed', 'Hair_SimpleParted', 'Hair_SimpleParted']
                                : (role === 'nurse' ? ['Hair_Buns'] : ['Hair_Long', 'Hair_Buns', 'Hair_BuzzedFemale']);
  const wanted = [styles[Math.floor(r() * styles.length)]];
  if (gender === 'm' && r() < 0.3) wanted.push('Hair_Beard');
  wanted.forEach(function (n) {
    const src = lib.hair[n]; if (!src || !head) return;
    const h = new THREE.Mesh(src.geometry, src.material.clone());
    h.applyMatrix4(src.matrixWorld);
    h.material.color.setHex(hairTint).multiplyScalar(2.4);
    h.castShadow = true; h.userData.isPerson = true; h.frustumCulled = false;
    attachToBone(root, head, h);
  });
  // coat / dress / gown skirt from the waist to the knees, moving with the hips
  if (out.skirt) {
    const pelvis = root.getObjectByName('pelvis'), knee = root.getObjectByName('calf_l');
    if (pelvis && knee) {
      root.updateMatrixWorld(true);
      const pw = new THREE.Vector3(), kw = new THREE.Vector3(); pelvis.getWorldPosition(pw); knee.getWorldPosition(kw);
      const top = pw.y + 0.07, bottom = kw.y - 0.02, h = top - bottom, rt = gender === 'm' ? 0.19 : 0.18;
      const g = new THREE.CylinderGeometry(rt, rt * out.skirt.flare, h, 28, 1, true);
      const sk = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: out.skirt.color, roughness: 0.85, side: THREE.DoubleSide }));
      sk.position.set(pw.x, bottom + h / 2, pw.z + 0.01); sk.castShadow = true; sk.userData.isPerson = true; sk.frustumCulled = false;
      attachToBone(root, pelvis, sk);
    }
  }
  const mixer = new THREE.AnimationMixer(root), actions = {};
  gl.animations.forEach(function (clip) { actions[clip.name] = mixer.clipAction(clip); });
  const holder = new THREE.Group(); holder.add(root);
  return { holder: holder, root: root, mixer: mixer, actions: actions, current: null };
}

function play(p, name, fade, timeScale) {
  const next = p.actions[name]; if (!next || p.current === next) return;
  next.reset(); next.timeScale = timeScale || 1; next.setEffectiveWeight(1); next.play();
  if (p.current) p.current.crossFadeTo(next, fade === undefined ? 0.3 : fade, false);
  p.current = next;
}

// ---------------------------------------------------------------- routes along the corridors (floor-local coords)
function route(poi, from, to) {
  const pts = [];
  const cx = function (side) { return side < 0 ? poi.corridorX[0] : poi.corridorX[1]; };
  const sideA = from.side || (from.x < 0 ? -1 : 1), sideB = to.side || (to.x < 0 ? -1 : 1);
  if (from.door) pts.push({ x: from.door.x, z: from.door.z });
  pts.push({ x: cx(sideA), z: from.door ? from.door.z : from.z });
  if (sideA !== sideB) { pts.push({ x: cx(sideA), z: poi.crossZ }); pts.push({ x: cx(sideB), z: poi.crossZ }); }
  pts.push({ x: cx(sideB), z: to.door ? to.door.z : to.z });
  if (to.door) pts.push({ x: to.door.x, z: to.door.z });
  pts.push({ x: to.x, z: to.z });
  return pts;
}

// ---------------------------------------------------------------- populate one floor
export function populate(lib, floorGroup, poi, seed, opts) {
  const r = rng(seed), agents = [], panic = !!(opts && opts.panic);
  function add(role, gender, x, y, z, rotY) {
    const p = makePerson(lib, role, gender, r); p.holder.position.set(x, y, z); p.holder.rotation.y = rotY || 0;
    floorGroup.add(p.holder); agents.push(p); return p;
  }
  const g = function () { return r() < 0.5 ? 'm' : 'f'; };
  poi.deskSeats.forEach(function (s, i) {                       // reception / nurse station staff, seated
    const p = add('staff', g(), s.x, 0, s.z, s.rotY);
    play(p, i % 2 ? 'Sitting_Talking_Loop' : 'Sitting_Idle_Loop', 0); p.mixer.update(r() * 3);
  });
  poi.chairs.forEach(function (c) {                              // visitors on the waiting chairs
    if (r() > poi.visitorShare) return;
    const p = add('visitor', g(), c.x, 0, c.z, c.rotY);
    play(p, r() < 0.35 ? 'Sitting_Talking_Loop' : 'Sitting_Idle_Loop', 0); p.mixer.update(r() * 3);
  });
  poi.beds.forEach(function (b) {                                // patients lying in beds / on OR tables
    if (r() > 0.75) return;
    const p = makePerson(lib, 'patient', g(), r);
    p.root.rotation.x = -Math.PI / 2;
    p.holder.position.set(b.x, b.y, b.z); p.holder.rotation.y = b.rotY;
    floorGroup.add(p.holder); agents.push(p);
    play(p, 'Idle_Loop', 0, 0.3); p.mixer.update(r() * 3);
  });
  const walkers = panic ? poi.walkers + 3 : poi.walkers;
  for (let i = 0; i < walkers; i++) {                            // doctors and nurses walking (story: rushing)
    const role = i % 3 === 0 ? 'doctor' : 'nurse', gender = role === 'nurse' ? (r() < 0.75 ? 'f' : 'm') : g();
    const start = poi.stops[Math.floor(r() * poi.stops.length)];
    const p = add(role, gender, start.x, 0, start.z, 0);
    p.walker = { poi: poi, r: r, stop: start, path: [], wait: panic ? r() * 1.5 : 1 + r() * 4, formal: role === 'doctor', panic: panic };
    if (panic) { const sprint = r() < 0.35; p.walker.clip = sprint ? 'Sprint_Loop' : 'Jog_Fwd_Loop'; p.walker.speed = sprint ? 4.2 : 2.7; }
    play(p, 'Idle_Talking_Loop', 0); p.mixer.update(r() * 3);
  }
  if (poi.p1Spots.length && !panic) {                                      // the biomed engineer at the P1 machines
    const s0 = poi.p1Spots[0];
    const p = add('engineer', 'm', s0.x, 0, s0.z, s0.rotY);
    p.walker = { poi: poi, r: r, stop: s0, path: [], wait: 2, engineer: true, k: 0 };
    play(p, 'Fixing_Kneeling', 0); p.mixer.update(r() * 4);
  }
  return agents;
}

// ---------------------------------------------------------------- per-frame update
export function update(agents, dt, animate) {
  agents.forEach(function (p) {
    if (!animate) return;
    p.mixer.update(dt);
    const w = p.walker; if (!w) return;
    if (w.path.length) {
      const target = w.path[0], pos = p.holder.position;
      const dx = target.x - pos.x, dz = target.z - pos.z, d = Math.hypot(dx, dz), step = (w.speed || WALK_SPEED) * dt;
      if (d > 0.001) {
        const want = Math.atan2(dx, dz);
        let diff = want - p.holder.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        p.holder.rotation.y += diff * Math.min(1, dt * 8);
      }
      if (d <= step) { pos.x = target.x; pos.z = target.z; w.path.shift(); }
      else { pos.x += dx / d * step; pos.z += dz / d * step; }
      if (!w.path.length) {
        if (w.stop.rotY !== undefined) p.holder.rotation.y = w.stop.rotY;
        if (w.engineer) { play(p, 'Fixing_Kneeling', 0.35); w.wait = 5.0; }
        else if (w.panic) { play(p, w.r() < 0.7 ? 'Idle_Talking_Loop' : 'Idle_Loop', 0.2); w.wait = 0.4 + w.r() * 1.4; }   // stop, look around, rush on
        else { play(p, w.r() < 0.6 ? 'Idle_Talking_Loop' : 'Idle_Loop', 0.3); w.wait = 3 + w.r() * 6; }
      }
      return;
    }
    w.wait -= dt;
    if (w.wait > 0) return;
    let next;
    if (w.engineer) {
      const spots = w.poi.p1Spots; if (spots.length < 2) { w.wait = 5; return; }
      w.k = (w.k + 1) % spots.length; next = spots[w.k];
    } else {
      const stops = w.poi.stops; next = stops[Math.floor(w.r() * stops.length)];
      if (next === w.stop) { w.wait = 2; return; }
    }
    w.path = route(w.poi, w.stop, next); w.stop = next;
    play(p, w.clip || (w.formal ? 'Walk_Formal_Loop' : 'Walk_Loop'), 0.25);
  });
}

// for visual checks of single people (tests / tooling)
export { makePerson, play };
