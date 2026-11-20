// ============================================================
// OPERATION INDIA — player.js
// Voxel character factory + fully procedural animation system.
// Every mesh, face part and animation is generated in code.
// ============================================================
import * as THREE from 'three';

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const matCache = new Map();
function mat(color, rough = 0.85, metal = 0.0) {
  const key = color + '|' + rough + '|' + metal;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  }
  return matCache.get(key);
}
function box(w, h, d, m, cast = true) {
  const mesh = new THREE.Mesh(UNIT, m);
  mesh.scale.set(w, h, d);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}
function dampAngle(a, b, l, dt) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-l * dt));
}
const clamp = THREE.MathUtils.clamp, damp = THREE.MathUtils.damp, lerp = THREE.MathUtils.lerp;

// ---- proportions (identical for every character) ----
const LEG = 0.78, THIGH = 0.40, SHIN = 0.38, TORSO = 0.54, NECK = 0.04;
const HEAD_W = 0.38, HEAD_H = 0.40, HEAD_D = 0.36;
const BODY_W = 0.42, BODY_D = 0.22, ARM_W = 0.13, UPPER = 0.30, FORE = 0.28;
const HEAD_Y = LEG + TORSO + NECK + HEAD_H * 0.5;   // 1.56
export const EYE_Y = HEAD_Y + 0.025;                // 1.585

// ---- expression library ----
// bL/bR brow tilt (inner-up positive on left), bY brow lift, lid baseline,
// curve mouth corners (+ smile / − frown), open jaw, pY pupil drift
const EXPR = {
  neutral:      { bL: 0.00, bR: 0.00, bY: 0.000, lid: 0.06, curve: 0.00, open: 0.00, pY: 0.000 },
  smile:        { bL: 0.04, bR:-0.04, bY: 0.005, lid: 0.20, curve: 0.55, open: 0.05, pY: 0.002 },
  happy:        { bL: 0.06, bR:-0.06, bY: 0.007, lid: 0.30, curve: 0.80, open: 0.14, pY: 0.003 },
  warm:         { bL: 0.03, bR:-0.03, bY: 0.003, lid: 0.22, curve: 0.38, open: 0.02, pY: 0.001 },
  confused:     { bL: 0.24, bR:-0.08, bY: 0.006, lid: 0.10, curve:-0.08, open: 0.06, pY: 0.002 },
  disappointed: { bL: 0.18, bR:-0.18, bY:-0.003, lid: 0.34, curve:-0.42, open: 0.00, pY:-0.012 },
  concerned:    { bL: 0.14, bR:-0.14, bY: 0.001, lid: 0.16, curve:-0.16, open: 0.02, pY: 0.000 },
  serious:      { bL:-0.12, bR: 0.12, bY:-0.002, lid: 0.12, curve:-0.10, open: 0.00, pY: 0.000 },
  awkward:      { bL: 0.10, bR:-0.16, bY: 0.004, lid: 0.14, curve: 0.22, open: 0.04, pY: 0.004 },
};

// ---- one-shot gesture clips: fn(char, t, k) with blend envelope k ----
const CLIPS = {
  wave:      { dur: 1.6, fn(c, t, k) {
    c.j.shR.rotation.x = lerp(c.j.shR.rotation.x, -2.35, k);
    c.j.shR.rotation.z = Math.sin(t * 9) * 0.30 * k;
    c.j.elR.rotation.x = lerp(c.j.elR.rotation.x, -0.45, k);
    c.fx.headYaw += 0.06 * k; } },
  shrug:     { dur: 1.5, fn(c, t, k) {
    c.j.shL.rotation.z = lerp(c.j.shL.rotation.z,  0.42, k);
    c.j.shR.rotation.z = lerp(c.j.shR.rotation.z, -0.42, k);
    c.j.elL.rotation.x = lerp(c.j.elL.rotation.x, -0.55, k);
    c.j.elR.rotation.x = lerp(c.j.elR.rotation.x, -0.55, k);
    c.fx.headTilt += 0.10 * k; } },
  point:     { dur: 1.8, fn(c, t, k) {
    c.j.shR.rotation.x = lerp(c.j.shR.rotation.x, -1.45, k);
    c.j.elR.rotation.x = lerp(c.j.elR.rotation.x, -0.12, k);
    c.fx.torsoYaw += -0.34 * k; c.fx.headYaw += -0.30 * k; } },
  chuckle:   { dur: 1.4, fn(c, t, k) {
    c.j.torso.rotation.x += Math.sin(t * 10) * 0.045 * k;
    c.j.shL.rotation.x += Math.sin(t * 10 + 1) * 0.05 * k;
    c.j.shR.rotation.x += Math.sin(t * 10) * 0.05 * k;
    c.fx.mouthOpen += 0.10 * k; } },
  nod:       { dur: 1.3, fn(c, t, k) { c.fx.headPitch += Math.sin(t * 4.8) * 0.14 * k; } },
  shakeHead: { dur: 1.6, fn(c, t, k) { c.fx.headYaw += Math.sin(t * 5.2) * 0.20 * k; } },
  sigh:      { dur: 2.0, fn(c, t, k) {
    c.j.torso.rotation.x += 0.07 * k;
    c.j.shL.rotation.x += -0.10 * Math.sin(Math.min(1, t / 1.1) * Math.PI) * k;
    c.j.shR.rotation.x += -0.10 * Math.sin(Math.min(1, t / 1.1) * Math.PI) * k;
    c.fx.headPitch += 0.12 * k; c.fx.mouthOpen += 0.10 * Math.sin(Math.min(1, t / 1.4) * Math.PI) * k; } },
  reach:     { dur: 1.25, fn(c, t, k) {
    c.j.shR.rotation.x = lerp(c.j.shR.rotation.x, -1.28, k);
    c.j.elR.rotation.x = lerp(c.j.elR.rotation.x, -0.22, k);
    c.j.torso.rotation.x += 0.08 * k; } },
  pickup:    { dur: 1.6, fn(c, t, k) {
    c.j.torso.rotation.x = lerp(c.j.torso.rotation.x, 0.40, k);
    c.j.shR.rotation.x = lerp(c.j.shR.rotation.x, -0.80, k);
    c.j.elR.rotation.x = lerp(c.j.elR.rotation.x, -0.35, k);
    c.fx.headPitch += 0.34 * k; } },
  offer:     { dur: 2.1, fn(c, t, k) {
    c.j.shR.rotation.x = lerp(c.j.shR.rotation.x, -1.38, k);
    c.j.elR.rotation.x = lerp(c.j.elR.rotation.x, -0.32, k);
    c.j.torso.rotation.x += 0.10 * k; } },
  receive:   { dur: 1.7, fn(c, t, k) {
    c.j.shR.rotation.x = lerp(c.j.shR.rotation.x, -1.30, k);
    c.j.elR.rotation.x = lerp(c.j.elR.rotation.x, -0.30, k);
    c.j.torso.rotation.x += 0.07 * k; } },
  lookAround:{ dur: 3.2, fn(c, t, k) { c.fx.headYaw += Math.sin(t * 1.35) * 0.42 * k; } },
};

export function createCharacter(opts) {
  const P = opts.palette, F = opts.features || {};
  const colliders = opts.colliders || [];
  const isInside = opts.isInside || (() => false);

  const skin = mat(P.skin, 0.72), skinDark = mat(P.skinDark || P.skin, 0.75);
  const hairM = mat(P.hair, 0.92);
  const topM = mat(P.top, 0.82), sleeveM = mat(P.sleeve || P.top, 0.82);
  const foreM = mat(P.forearm || P.sleeve || P.top, 0.82);
  const pantsM = mat(P.pants, 0.86), shoeM = mat(P.shoe, 0.55), soleM = mat(P.sole || '#c9c5bc', 0.6);

  const group = new THREE.Group();
  const j = {}; // joints

  // ---------- legs ----------
  function makeLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.10, LEG, 0);
    const thigh = box(0.165, THIGH, 0.185, pantsM); thigh.position.y = -THIGH / 2; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -THIGH; hip.add(knee);
    const shin = box(0.155, SHIN, 0.17, pantsM); shin.position.y = -SHIN / 2; knee.add(shin);
    const shoe = box(0.17, 0.10, 0.27, shoeM); shoe.position.set(0, -SHIN - 0.045, 0.045); knee.add(shoe);
    const sole = box(0.18, 0.035, 0.285, soleM); sole.position.set(0, -SHIN - 0.105, 0.045); knee.add(sole);
    group.add(hip);
    return { hip, knee };
  }
  const legL = makeLeg(-1), legR = makeLeg(1);
  j.hipL = legL.hip; j.hipR = legR.hip; j.kneeL = legL.knee; j.kneeR = legR.knee;

  // ---------- hips / torso ----------
  const hips = new THREE.Group(); hips.position.y = LEG; group.add(hips); j.hips = hips;
  const belt = box(BODY_W, 0.09, BODY_D, mat(P.pants, 0.86)); belt.position.y = 0.02; hips.add(belt);
  const torso = new THREE.Group(); torso.position.y = 0.06; hips.add(torso); j.torso = torso;
  const chest = box(BODY_W, TORSO - 0.06, BODY_D, topM); chest.position.y = (TORSO - 0.06) / 2; torso.add(chest);

  // outfit detailing
  if (F.jacket) {
    const jm = mat(P.jacket, 0.8);
    const back = box(BODY_W + 0.03, TORSO - 0.10, 0.035, jm); back.position.set(0, (TORSO - 0.06) / 2, -BODY_D / 2 - 0.012); torso.add(back);
    for (const s of [-1, 1]) {
      const panel = box(0.15, TORSO - 0.10, 0.035, jm); panel.position.set(s * 0.145, (TORSO - 0.06) / 2, BODY_D / 2 + 0.012); torso.add(panel);
      const collar = box(0.13, 0.06, 0.06, jm); collar.position.set(s * 0.12, TORSO - 0.08, BODY_D / 2 - 0.01); collar.rotation.x = 0.35; torso.add(collar);
      const sideP = box(0.035, TORSO - 0.10, BODY_D + 0.02, jm); sideP.position.set(s * (BODY_W / 2 + 0.012), (TORSO - 0.06) / 2, 0); torso.add(sideP);
    }
    const zip = box(0.02, TORSO - 0.16, 0.02, mat('#8a8f96', 0.4, 0.6)); zip.position.set(0, (TORSO - 0.06) / 2, BODY_D / 2 + 0.02); torso.add(zip);
  }
  if (F.hood) {
    const hood = box(0.30, 0.17, 0.13, mat(P.hood, 0.88)); hood.position.set(0, TORSO - 0.03, -BODY_D / 2 - 0.07); torso.add(hood);
    const hoodIn = box(0.22, 0.10, 0.05, mat(P.hoodIn || '#4a5058', 0.9)); hoodIn.position.set(0, TORSO + 0.01, -BODY_D / 2 - 0.10); torso.add(hoodIn);
  }
  if (F.apron) {
    const am = mat(P.apron, 0.88);
    const front = box(0.34, 0.42, 0.025, am); front.position.set(0, 0.20, BODY_D / 2 + 0.018); torso.add(front);
    const bib = box(0.24, 0.16, 0.025, am); bib.position.set(0, 0.47, BODY_D / 2 + 0.018); torso.add(bib);
    for (const s of [-1, 1]) { const strap = box(0.035, 0.16, 0.02, am); strap.position.set(s * 0.10, 0.55, BODY_D / 2 - 0.02); strap.rotation.x = -0.5; torso.add(strap); }
    const pocket = box(0.20, 0.10, 0.02, mat(P.apronPocket || '#175539', 0.9)); pocket.position.set(0, 0.14, BODY_D / 2 + 0.032); torso.add(pocket);
    const tag = box(0.055, 0.022, 0.012, mat('#f3e9d2', 0.5)); tag.position.set(0.09, 0.47, BODY_D / 2 + 0.034); torso.add(tag);
  }
  if (F.coat) {
    const cm = mat(P.coat, 0.84);
    const skirt = box(BODY_W + 0.05, 0.26, BODY_D + 0.04, cm); skirt.position.y = -0.06; hips.add(skirt);
    for (const s of [-1, 1]) { const lapel = box(0.11, 0.20, 0.03, cm); lapel.position.set(s * 0.11, TORSO - 0.16, BODY_D / 2 + 0.015); lapel.rotation.z = s * -0.18; torso.add(lapel); }
  }
  if (F.scarf) {
    const sm = mat(P.scarf, 0.9);
    const wrap = box(BODY_W - 0.06, 0.09, BODY_D - 0.02, sm); wrap.position.y = TORSO - 0.02; torso.add(wrap);
    const tail = box(0.09, 0.24, 0.03, sm); tail.position.set(0.10, TORSO - 0.18, BODY_D / 2 + 0.02); torso.add(tail);
  }

  // ---------- arms ----------
  function makeArm(side) {
    const sh = new THREE.Group();
    sh.position.set(side * (BODY_W / 2 + ARM_W / 2 + 0.005), TORSO - 0.10, 0); torso.add(sh);
    const upper = box(ARM_W, UPPER, ARM_W + 0.01, sleeveM); upper.position.y = -UPPER / 2; sh.add(upper);
    const el = new THREE.Group(); el.position.y = -UPPER; sh.add(el);
    const fore = box(ARM_W - 0.01, FORE, ARM_W, foreM); fore.position.y = -FORE / 2; el.add(fore);
    const hand = new THREE.Group(); hand.position.y = -FORE; el.add(hand);
    const palm = box(ARM_W - 0.015, 0.095, ARM_W - 0.01, skin); palm.position.y = -0.045; hand.add(palm);
    return { sh, el, hand };
  }
  const armL = makeArm(-1), armR = makeArm(1);
  j.shL = armL.sh; j.shR = armR.sh; j.elL = armL.el; j.elR = armR.el;

  // ---------- head ----------
  const neck = new THREE.Group(); neck.position.y = TORSO; torso.add(neck); j.neck = neck;
  const neckM = box(0.12, NECK + 0.03, 0.12, skin); neckM.position.y = NECK / 2; neck.add(neckM);
  const head = new THREE.Group(); head.position.y = NECK; neck.add(head); j.head = head;
  const skull = box(HEAD_W, HEAD_H, HEAD_D, skin); skull.position.y = HEAD_H / 2; head.add(skull);
  const fz = HEAD_D / 2; // face plane

  // ears
  for (const s of [-1, 1]) { const ear = box(0.025, 0.06, 0.045, skinDark, false); ear.position.set(s * (HEAD_W / 2 + 0.01), HEAD_H * 0.48, 0); head.add(ear); }

  // hair styles
  if (F.hairStyle === 'short') {
    const top = box(HEAD_W + 0.03, 0.09, HEAD_D + 0.03, hairM); top.position.y = HEAD_H + 0.035; head.add(top);
    const fringe = box(HEAD_W + 0.03, 0.07, 0.06, hairM); fringe.position.set(0, HEAD_H - 0.03, fz - 0.015); head.add(fringe);
    const backH = box(HEAD_W + 0.03, 0.22, 0.05, hairM); backH.position.set(0, HEAD_H - 0.12, -fz + 0.01); head.add(backH);
    for (const s of [-1, 1]) { const sideH = box(0.045, 0.13, HEAD_D - 0.06, hairM); sideH.position.set(s * (HEAD_W / 2 + 0.008), HEAD_H - 0.07, -0.02); head.add(sideH); }
    const tuft = box(0.14, 0.05, 0.12, hairM); tuft.position.set(-0.08, HEAD_H + 0.09, 0.05); tuft.rotation.z = 0.12; head.add(tuft);
  } else if (F.hairStyle === 'flat') {
    const top = box(HEAD_W + 0.02, 0.055, HEAD_D + 0.02, hairM); top.position.y = HEAD_H + 0.02; head.add(top);
    for (const s of [-1, 1]) { const sideH = box(0.04, 0.15, HEAD_D - 0.08, hairM); sideH.position.set(s * (HEAD_W / 2 + 0.006), HEAD_H - 0.10, -0.03); head.add(sideH); }
    const backH = box(HEAD_W + 0.02, 0.15, 0.045, hairM); backH.position.set(0, HEAD_H - 0.10, -fz + 0.008); head.add(backH);
  } else if (F.hairStyle === 'bun') {
    const top = box(HEAD_W + 0.03, 0.08, HEAD_D + 0.03, hairM); top.position.y = HEAD_H + 0.03; head.add(top);
    const backH = box(HEAD_W + 0.03, 0.26, 0.06, hairM); backH.position.set(0, HEAD_H - 0.13, -fz + 0.015); head.add(backH);
    for (const s of [-1, 1]) { const sideH = box(0.04, 0.18, 0.10, hairM); sideH.position.set(s * (HEAD_W / 2 + 0.006), HEAD_H - 0.09, 0.06); head.add(sideH); }
    const bun = box(0.15, 0.14, 0.13, hairM); bun.position.set(0, HEAD_H + 0.05, -fz - 0.05); head.add(bun);
  }

  // ---- face: separate animated components ----
  const eyeY = HEAD_H * 0.55, eyeX = 0.088;
  const whiteM = mat('#f6f2e8', 0.35), pupilM = mat(P.eye || '#241a12', 0.3);
  const lidGeo = new THREE.BoxGeometry(1, 1, 1); lidGeo.translate(0, -0.5, 0); // origin at top edge
  const face = { eyes: [], pupils: [], lids: [], brows: [] };
  for (const s of [-1, 1]) {
    const white = box(0.078, 0.056, 0.012, whiteM, false); white.position.set(s * eyeX, eyeY, fz + 0.004); head.add(white);
    const pupil = box(0.030, 0.034, 0.010, pupilM, false); pupil.position.set(s * eyeX, eyeY, fz + 0.012); head.add(pupil);
    const lid = new THREE.Mesh(lidGeo, skin); lid.scale.set(0.084, 0.004, 0.016);
    lid.position.set(s * eyeX, eyeY + 0.030, fz + 0.006); lid.castShadow = false; head.add(lid);
    const brow = box(0.085, 0.018, 0.014, hairM, false); brow.position.set(s * eyeX, eyeY + 0.062, fz + 0.008); head.add(brow);
    face.eyes.push(white); face.pupils.push(pupil); face.lids.push(lid); face.brows.push(brow);
  }
  const nose = box(0.032, 0.05, 0.026, skinDark, false); nose.position.set(0, eyeY - 0.055, fz + 0.010); head.add(nose);
  const mouthY = eyeY - 0.135;
  const cavity = box(0.092, 0.020, 0.012, mat('#5a2e26', 0.6), false); cavity.position.set(0, mouthY, fz + 0.006); head.add(cavity);
  const corners = [];
  for (const s of [-1, 1]) { const cn = box(0.022, 0.015, 0.012, mat('#7a4438', 0.6), false); cn.position.set(s * 0.056, mouthY, fz + 0.006); head.add(cn); corners.push(cn); }
  if (F.mustache) { const mu = box(0.115, 0.028, 0.016, hairM, false); mu.position.set(0, mouthY + 0.045, fz + 0.010); head.add(mu); }
  if (F.glasses) {
    const gm = mat('#22252b', 0.35, 0.6);
    const bridge = box(0.05, 0.012, 0.012, gm, false); bridge.position.set(0, eyeY + 0.01, fz + 0.018); head.add(bridge);
    for (const s of [-1, 1]) {
      const topR = box(0.095, 0.011, 0.012, gm, false); topR.position.set(s * eyeX, eyeY + 0.034, fz + 0.018); head.add(topR);
      const botR = box(0.095, 0.009, 0.012, gm, false); botR.position.set(s * eyeX, eyeY - 0.032, fz + 0.018); head.add(botR);
      const temple = box(0.012, 0.010, HEAD_D * 0.55, gm, false); temple.position.set(s * (HEAD_W / 2 + 0.004), eyeY + 0.02, -HEAD_D * 0.20); head.add(temple);
      const lens = new THREE.Mesh(UNIT, new THREE.MeshPhysicalMaterial({ color: '#bcd6e4', transparent: true, opacity: 0.18, roughness: 0.05 }));
      lens.scale.set(0.082, 0.052, 0.004); lens.position.set(s * eyeX, eyeY, fz + 0.016); head.add(lens);
    }
  }

  // ---------- state ----------
  const ch = {
    group, j, fx: { headYaw: 0, headPitch: 0, headTilt: 0, torsoYaw: 0, mouthOpen: 0 },
    handL: armL.hand, handR: armR.hand,
    yaw: 0, targetYaw: 0, speed: 0, selfDrive: false, onStep: null,
    talking: false, loop: 'idle', clip: null,
    t: Math.random() * 20, phase: 0, stepIndex: 0, walkK: 0,
    exprName: 'neutral', expr: { ...EXPR.neutral }, exprT: { ...EXPR.neutral },
    blinkTimer: 1.5 + Math.random() * 2, blinkT: 99,
    lookTarget: null, headYawCur: 0, headPitchCur: 0, mouthOpenCur: 0,
    _tmp: new THREE.Vector3(), _tmp2: new THREE.Vector3(),
  };

  ch.setMotion = (speed, yaw) => { ch.speed = speed; if (yaw !== undefined && yaw !== null) ch.targetYaw = yaw; };
  ch.setLoop = (name) => { ch.loop = name; };
  ch.playClip = (name, dur) => { const c = CLIPS[name]; if (c) ch.clip = { name, t: 0, dur: dur || c.dur, fn: c.fn }; };
  ch.setExpression = (name) => { if (EXPR[name]) { ch.exprName = name; ch.exprT = { ...EXPR[name] }; } };
  ch.setTalking = (b) => { ch.talking = b; };
  ch.lookAt = (v) => { ch.lookTarget = v ? (v.isVector3 ? v.clone() : new THREE.Vector3(v.x, v.y, v.z)) : null; };
  ch.teleport = (x, z, yaw) => {
    group.position.set(x, 0, z); ch.yaw = ch.targetYaw = yaw; group.rotation.y = yaw;
    ch.speed = 0; ch.phase = 0; ch.walkK = 0; ch.clip = null; ch.talking = false; ch.lookTarget = null;
  };
  ch.headWorld = (out) => out.set(group.position.x + Math.sin(ch.yaw) * 0.03, EYE_Y, group.position.z + Math.cos(ch.yaw) * 0.03);
  ch.clearHands = () => { for (const h of [armL.hand, armR.hand]) { for (let i = h.children.length - 1; i >= 0; i--) { if (h.children[i] !== undefined && h.children[i].userData.prop) h.remove(h.children[i]); } } };
  ch.attachHand = (side, obj, px, py, pz, ry = 0) => {
    const h = side === 'L' ? armL.hand : armR.hand;
    obj.userData.prop = true; h.add(obj); obj.position.set(px, py, pz); obj.rotation.set(0, ry, 0);
  };
  ch.surface = () => isInside(group.position) ? 'tile' : 'concrete';

  ch.resolveCollisions = () => {
    const p = group.position, r = 0.28;
    for (let pass = 0; pass < 2; pass++) {
      for (const c of colliders) {
        if (!c.enabled) continue;
        const b = c.box;
        if (p.x > b.min.x - r && p.x < b.max.x + r && p.z > b.min.z - r && p.z < b.max.z + r && b.max.y > 0.25) {
          const dxl = p.x - (b.min.x - r), dxr = (b.max.x + r) - p.x;
          const dzl = p.z - (b.min.z - r), dzr = (b.max.z + r) - p.z;
          const m = Math.min(dxl, dxr, dzl, dzr);
          if (m === dxl) p.x = b.min.x - r; else if (m === dxr) p.x = b.max.x + r;
          else if (m === dzl) p.z = b.min.z - r; else p.z = b.max.z + r;
        }
      }
    }
  };

  ch.update = (dt) => {
    if (dt <= 0) return;
    ch.t += dt;
    const t = ch.t;

    // orientation & locomotion
    ch.yaw = dampAngle(ch.yaw, ch.targetYaw, 9, dt);
    group.rotation.y = ch.yaw;
    const stride = ch.speed > 2 ? 0.95 : 0.62;
    ch.phase += (ch.speed / stride) * Math.PI * dt;
    const si = Math.floor(ch.phase / Math.PI);
    if (si !== ch.stepIndex) {
      ch.stepIndex = si;
      if (ch.speed > 0.35 && ch.onStep) ch.onStep(si % 2, ch.surface());
    }
    ch.walkK = damp(ch.walkK, clamp(ch.speed / 1.15, 0, 1), 7, dt);
    if (ch.selfDrive && ch.speed > 0) {
      group.position.x += Math.sin(ch.yaw) * ch.speed * dt;
      group.position.z += Math.cos(ch.yaw) * ch.speed * dt;
    }
    ch.resolveCollisions();

    // ---- base pose ----
    const w = ch.walkK, p = ch.phase, s = Math.sin(p), c = Math.cos(p);
    const run = ch.speed > 2 ? 1.25 : 1;
    const A = 0.38 * w * run;
    const fx = ch.fx; fx.headYaw = 0; fx.headPitch = 0; fx.headTilt = 0; fx.torsoYaw = 0; fx.mouthOpen = 0;

    j.hipL.rotation.set(A * s, 0, 0);
    j.hipR.rotation.set(-A * s, 0, 0);
    j.kneeL.rotation.set(Math.max(0, Math.sin(p + 1.9)) * 0.8 * w * run, 0, 0);
    j.kneeR.rotation.set(Math.max(0, Math.sin(p + 1.9 + Math.PI)) * 0.8 * w * run, 0, 0);
    j.shL.rotation.set(-A * 0.75 * s, 0, 0.06 + 0.02 * Math.sin(t * 1.4));
    j.shR.rotation.set(A * 0.75 * s, 0, -0.06 - 0.02 * Math.sin(t * 1.4 + 1));
    j.elL.rotation.set(-0.14 - Math.max(0, s) * 0.28 * w, 0, 0);
    j.elR.rotation.set(-0.14 - Math.max(0, -s) * 0.28 * w, 0, 0);

    const breath = Math.sin(t * 1.35) * 0.5 + 0.5;
    j.hips.position.y = LEG + (Math.abs(c) * 0.045 - 0.02) * w;
    j.hips.position.x = Math.sin(t * 0.4) * 0.012 * (1 - w);
    j.hips.rotation.set(0, s * 0.06 * w, Math.sin(t * 0.4) * 0.028 * (1 - w));
    j.torso.rotation.set(
      0.05 * w * run + Math.sin(t * 1.35) * 0.013 * (1 - w),
      -s * 0.08 * w,
      Math.sin(t * 0.5) * 0.02 * (1 - w) + clamp((ch.targetYaw - ch.yaw), -0.5, 0.5) * 0.12
    );
    j.shL.position.y = TORSO - 0.10 + breath * 0.006 * (1 - w);
    j.shR.position.y = TORSO - 0.10 + breath * 0.006 * (1 - w);

    // ---- loops ----
    if (ch.loop === 'wipe' && w < 0.3) {
      j.shR.rotation.x = -1.02 + Math.sin(t * 2.3) * 0.10;
      j.shR.rotation.z = -0.28 + Math.cos(t * 2.3) * 0.20;
      j.elR.rotation.x = -0.55;
      j.torso.rotation.x += 0.14;
      fx.headPitch += 0.38; fx.headYaw += Math.sin(t * 0.3) * 0.05;
    } else if (ch.loop === 'carry') {
      j.shL.rotation.x = -0.50; j.shL.rotation.z = 0.08; j.elL.rotation.x = -1.25;
    }

    // ---- one-shot clip ----
    if (ch.clip) {
      ch.clip.t += dt;
      const ct = ch.clip.t, cd = ch.clip.dur;
      const att = Math.min(1, ct / (cd * 0.25)), rel = Math.min(1, (cd - ct) / (cd * 0.25));
      const k = att * att * (3 - 2 * att) * rel * rel * (3 - 2 * rel);
      ch.clip.fn(ch, ct, Math.max(0, k));
      if (ct >= cd) ch.clip = null;
    }
    j.torso.rotation.y += fx.torsoYaw;

    // ---- head look ----
    let wantYaw, wantPitch;
    if (ch.lookTarget) {
      ch.headWorld(ch._tmp);
      ch._tmp2.subVectors(ch.lookTarget, ch._tmp);
      const local = Math.atan2(ch._tmp2.x, ch._tmp2.z) - ch.yaw;
      let d = local % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
      wantYaw = clamp(d, -0.75, 0.75);
      wantPitch = clamp(Math.atan2(ch._tmp2.y, Math.hypot(ch._tmp2.x, ch._tmp2.z)), -0.35, 0.35);
    } else {
      wantYaw = Math.sin(t * 0.35) * 0.16 + Math.sin(t * 0.13) * 0.09;
      wantPitch = Math.sin(t * 0.27) * 0.05;
    }
    wantYaw += fx.headYaw; wantPitch += fx.headPitch;
    ch.headYawCur = damp(ch.headYawCur, clamp(wantYaw, -0.85, 0.85), 6, dt);
    ch.headPitchCur = damp(ch.headPitchCur, clamp(wantPitch, -0.5, 0.5), 6, dt);
    j.head.rotation.set(-ch.headPitchCur, ch.headYawCur, fx.headTilt);
    j.neck.rotation.y = ch.headYawCur * 0.25;

    // ---- expression blending ----
    const e = ch.expr, et = ch.exprT;
    for (const key in e) e[key] = damp(e[key], et[key], 8, dt);

    // blink
    ch.blinkTimer -= dt;
    if (ch.blinkTimer <= 0) { ch.blinkT = 0; ch.blinkTimer = 2.2 + Math.random() * 3.4 + (ch.talking ? -0.6 : 0); }
    ch.blinkT += dt;
    const blink = ch.blinkT < 0.16 ? Math.sin(Math.PI * ch.blinkT / 0.16) : 0;
    const lid = Math.max(e.lid, blink);
    face.lids[0].scale.y = 0.004 + lid * 0.062;
    face.lids[1].scale.y = 0.004 + lid * 0.062;

    // brows (micro-life so faces are never frozen)
    const micro = Math.sin(t * 0.9) * 0.0012;
    face.brows[0].rotation.z = e.bL; face.brows[1].rotation.z = e.bR;
    face.brows[0].position.y = eyeY + 0.062 + e.bY + micro;
    face.brows[1].position.y = eyeY + 0.062 + e.bY - micro;

    // pupils follow look + expression drift
    const px = clamp(ch.headYawCur * 0.02, -0.018, 0.018);
    const py = clamp(ch.headPitchCur * 0.014, -0.012, 0.012) + e.pY;
    face.pupils[0].position.set(-eyeX + px, eyeY + py, fz + 0.012);
    face.pupils[1].position.set(eyeX + px, eyeY + py, fz + 0.012);

    // mouth: talk oscillation + expression curve
    const talkOpen = ch.talking
      ? clamp(0.14 + 0.42 * (0.5 + 0.5 * Math.sin(t * 11.3) + 0.28 * Math.sin(t * 17.7)), 0, 0.72)
      : 0;
    const openT = Math.max(e.open, talkOpen) + fx.mouthOpen;
    ch.mouthOpenCur = damp(ch.mouthOpenCur, openT, 18, dt);
    cavity.scale.y = 0.020 * (0.35 + ch.mouthOpenCur * 2.4);
    cavity.position.y = mouthY - ch.mouthOpenCur * 0.014;
    corners[0].rotation.z = e.curve * 0.65; corners[1].rotation.z = -e.curve * 0.65;
    corners[0].position.y = mouthY + e.curve * 0.013; corners[1].position.y = mouthY + e.curve * 0.013;
  };

  return ch;
}
