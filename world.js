// ============================================================
// OPERATION INDIA — world.js
// The entire New York block + grocery interior, built in code.
// Canvas textures, instanced products, living city updaters.
// ============================================================
import * as THREE from 'three';

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const matCache = new Map();
function mat(color, rough = 0.85, metal = 0, extra = {}) {
  const key = color + '|' + rough + '|' + metal + '|' + JSON.stringify(extra);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));
  return matCache.get(key);
}
function box(w, h, d, m, cast = true, recv = true) {
  const mesh = new THREE.Mesh(UNIT, m);
  mesh.scale.set(w, h, d); mesh.castShadow = cast; mesh.receiveShadow = recv;
  return mesh;
}
function canvasTex(w, h, draw, repeat = null) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  if (repeat) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(repeat[0], repeat[1]); }
  return tx;
}
function rnd(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

// ---------------- texture painters ----------------
function paintBrick(ctx, w, h, base, mortar, seed) {
  const R = rnd(seed);
  ctx.fillStyle = mortar; ctx.fillRect(0, 0, w, h);
  const bh = 16, bw = 42;
  for (let y = 0, row = 0; y < h; y += bh, row++) {
    for (let x = (row % 2) * -bw / 2; x < w; x += bw) {
      const v = (R() - 0.5) * 26;
      ctx.fillStyle = shift(base, v);
      ctx.fillRect(x + 2, y + 2, bw - 3, bh - 3);
      if (R() < 0.06) { ctx.fillStyle = 'rgba(20,14,10,0.35)'; ctx.fillRect(x + 2, y + 2, bw - 3, bh - 3); }
    }
  }
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(15,10,8,0.28)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
function shift(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r|0},${g|0},${b|0})`;
}
function paintFacade(ctx, w, h, opts) {
  const { base, mortar, floors, cols, lit, seed, bands } = opts;
  const R = rnd(seed);
  if (bands) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 22) { ctx.fillStyle = shift(base, (R() - 0.5) * 14); ctx.fillRect(0, y, w, 20); ctx.fillStyle = 'rgba(30,20,14,0.25)'; ctx.fillRect(0, y + 20, w, 2); }
  } else paintBrick(ctx, w, h, base, mortar, seed);
  const em = document.createElement('canvas'); em.width = w; em.height = h;
  const ex = em.getContext('2d'); ex.fillStyle = '#000'; ex.fillRect(0, 0, w, h);
  const fh = h / floors, cw = w / cols;
  for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
    const wx = c * cw + cw * 0.22, wy = f * fh + fh * 0.20, ww = cw * 0.56, wh = fh * 0.58;
    ctx.fillStyle = '#1b1e24'; ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);       // frame
    ctx.fillStyle = shift(base, 22); ctx.fillRect(wx - 7, wy + wh + 4, ww + 14, 5); // sill
    const isLit = R() < lit;
    if (isLit) {
      const warm = R() < 0.8 ? '#ffb45e' : '#d8ecff';
      const g = ctx.createLinearGradient(wx, wy, wx, wy + wh);
      g.addColorStop(0, warm); g.addColorStop(1, shift(warm, -50));
      ctx.fillStyle = g; ctx.fillRect(wx, wy, ww, wh);
      ex.fillStyle = warm; ex.fillRect(wx, wy, ww, wh);
      if (R() < 0.5) { ctx.fillStyle = 'rgba(40,25,10,0.5)'; ctx.fillRect(wx, wy + wh * (0.3 + R() * 0.4), ww, wh * 0.16); }
    } else {
      const g = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
      g.addColorStop(0, '#3d5570'); g.addColorStop(0.5, '#22303f'); g.addColorStop(1, '#141c26');
      ctx.fillStyle = g; ctx.fillRect(wx, wy, ww, wh);
      ctx.fillStyle = 'rgba(240,190,140,0.14)'; ctx.fillRect(wx, wy, ww, wh * 0.22);
    }
    ctx.fillStyle = '#10131a'; ctx.fillRect(wx + ww / 2 - 2, wy, 4, wh); ctx.fillRect(wx, wy + wh / 2 - 2, ww, 4);
  }
  return em;
}
function paintConcrete(ctx, w, h, seed, slabs) {
  const R = rnd(seed);
  ctx.fillStyle = '#9a958c'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) { ctx.fillStyle = `rgba(${40 + R() * 60 | 0},${38 + R() * 55 | 0},${34 + R() * 50 | 0},${0.05 + R() * 0.08})`; ctx.fillRect(R() * w, R() * h, 2 + R() * 3, 2 + R() * 3); }
  ctx.strokeStyle = 'rgba(45,42,38,0.55)'; ctx.lineWidth = 3;
  for (let i = 1; i < slabs; i++) { ctx.beginPath(); ctx.moveTo(i * w / slabs, 0); ctx.lineTo(i * w / slabs, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * h / slabs); ctx.lineTo(w, i * h / slabs); ctx.stroke(); }
  for (let i = 0; i < 8; i++) { ctx.fillStyle = 'rgba(35,32,28,0.16)'; ctx.beginPath(); ctx.ellipse(R() * w, R() * h, 14 + R() * 40, 8 + R() * 24, R() * 3, 0, 7); ctx.fill(); }
}
function paintAsphalt(ctx, w, h, seed) {
  const R = rnd(seed);
  ctx.fillStyle = '#33383f'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 3200; i++) { const v = 30 + R() * 55 | 0; ctx.fillStyle = `rgba(${v},${v + 3},${v + 8},${0.10 + R() * 0.16})`; ctx.fillRect(R() * w, R() * h, 2, 2); }
  ctx.strokeStyle = 'rgba(18,20,24,0.5)'; ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) { ctx.beginPath(); let x = R() * w, y = R() * h; ctx.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 90; y += (R() - 0.5) * 90; ctx.lineTo(x, y); } ctx.stroke(); }
}
function paintTile(ctx, w, h) {
  const R = rnd(77);
  const n = 8, s = w / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#c9c2b2' : '#ddd6c6';
    ctx.fillRect(x * s, y * s, s, s);
    ctx.fillStyle = `rgba(70,62,50,${0.03 + R() * 0.09})`; ctx.fillRect(x * s, y * s, s, s);
  }
  ctx.strokeStyle = 'rgba(90,82,68,0.6)'; ctx.lineWidth = 2;
  for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(w, i * s); ctx.stroke(); }
}
function textSign(txt, sub, bg, fg, w = 1024, h = 256, font = 'bold 130px Impact, Arial Narrow, sans-serif') {
  return canvasTex(w, h, (ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg; ctx.lineWidth = 8; ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.fillStyle = fg; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, w / 2, sub ? h * 0.40 : h * 0.52);
    if (sub) { ctx.font = 'bold 52px Arial, sans-serif'; ctx.fillText(sub, w / 2, h * 0.78); }
  });
}

// ============================================================
export function buildWorld(scene, renderer) {
  const colliders = [];
  const updaters = [];
  const hooks = { onCarPass: null };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  function solid(x0, y0, z0, x1, y1, z1, opaque = true) {
    const c = { box: new THREE.Box3(V(x0, y0, z0), V(x1, y1, z1)), enabled: true, opaque };
    colliders.push(c); return c;
  }

  // ---------------- sky, fog, light ----------------
  const skyTx = canvasTex(64, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#26406e'); g.addColorStop(0.42, '#5d84b8'); g.addColorStop(0.66, '#c98d6b');
    g.addColorStop(0.78, '#f0b078'); g.addColorStop(0.9, '#e8a06a'); g.addColorStop(1, '#b98a68');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 24, 16), new THREE.MeshBasicMaterial({ map: skyTx, side: THREE.BackSide, fog: false }));
  scene.add(sky);
  scene.fog = new THREE.Fog(0xd9b294, 55, 235);

  const hemi = new THREE.HemisphereLight(0x8fa8c9, 0x4a3f36, 0.55); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb168, 3.0);
  sun.position.set(-55, 26, 14); sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -50, right: 32, top: 30, bottom: -26, near: 5, far: 150 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);

  // sun glow sprite
  const glowTx = canvasTex(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,240,210,1)'); g.addColorStop(0.25, 'rgba(255,190,110,0.55)'); g.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  const sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTx, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sunSpr.position.set(-262, 118, 66); sunSpr.scale.set(90, 90, 1); scene.add(sunSpr);

  // clouds
  const cloudM = new THREE.MeshBasicMaterial({ color: 0xf6e3d0, fog: true, transparent: true, opacity: 0.92 });
  const clouds = [];
  const RC = rnd(41);
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const n = 3 + (RC() * 3 | 0);
    for (let k = 0; k < n; k++) {
      const b = box(10 + RC() * 16, 2.4 + RC() * 2, 5 + RC() * 6, cloudM, false, false);
      b.position.set((RC() - 0.5) * 18, (RC() - 0.5) * 2.4, (RC() - 0.5) * 8); g.add(b);
    }
    g.position.set(-240 + RC() * 480, 58 + RC() * 34, -140 + RC() * 240);
    scene.add(g); clouds.push(g);
  }
  updaters.push((dt) => { for (const c of clouds) { c.position.x += dt * 0.55; if (c.position.x > 260) c.position.x = -260; } });

  // ---------------- ground / roads ----------------
  const asphaltTx = canvasTex(512, 512, paintAsphalt ? (c, w, h) => paintAsphalt(c, w, h, 9) : null, [14, 1]);
  const concreteTx = canvasTex(512, 512, (c, w, h) => paintConcrete(c, w, h, 23, 4), [24, 1]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), mat('#26292f', 0.95));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.15; ground.receiveShadow = true; scene.add(ground);

  const road = new THREE.Mesh(new THREE.PlaneGeometry(140, 9), new THREE.MeshStandardMaterial({ map: asphaltTx, roughness: 0.94 }));
  road.rotation.x = -Math.PI / 2; road.position.set(-10, -0.12, 0); road.receiveShadow = true; scene.add(road);
  const crossRoadTx = asphaltTx.clone(); crossRoadTx.repeat.set(1, 9); crossRoadTx.needsUpdate = true;
  const crossRoad = new THREE.Mesh(new THREE.PlaneGeometry(9, 90), new THREE.MeshStandardMaterial({ map: crossRoadTx, roughness: 0.94 }));
  crossRoad.rotation.x = -Math.PI / 2; crossRoad.position.set(20, -0.121, 0); crossRoad.receiveShadow = true; scene.add(crossRoad);

  const yellowM = mat('#c9a23a', 0.8);
  for (const zz of [-0.12, 0.12]) { const ln = box(120, 0.006, 0.09, yellowM, false); ln.position.set(-16, -0.114, zz); scene.add(ln); }
  const whiteM = mat('#cfc9ba', 0.8);
  for (let i = 0; i < 7; i++) { const st = box(0.55, 0.006, 8.4, whiteM, false); st.position.set(14.2 + i * 0.95, -0.113, 0); scene.add(st); }
  const stopLn = box(0.35, 0.006, 4.2, whiteM, false); stopLn.position.set(13.4, -0.113, 2.2); scene.add(stopLn);

  // sidewalks (top at y=0) + curbs
  const sideM = new THREE.MeshStandardMaterial({ map: concreteTx, roughness: 0.92 });
  function sidewalk(x, z, w, d) {
    const s = box(w, 0.14, d, sideM, false); s.position.set(x, -0.07, z); scene.add(s);
    const curb = box(w, 0.14, 0.12, mat('#7d786f', 0.9), false);
    curb.position.set(x, -0.07, z + (z < 0 ? d / 2 : -d / 2)); scene.add(curb);
  }
  sidewalk(-11, -6.5, 50, 4); sidewalk(-11, 6.5, 50, 4);
  sidewalk(28.5, -6.5, 15, 4); sidewalk(28.5, 6.5, 15, 4);
  sidewalk(20, -27.5, 9, 38); sidewalk(20, 27.5, 9, 38);

  // manholes + steam
  const mhM = mat('#1e2126', 0.6, 0.5);
  for (const [mx, mz] of [[-3, 1.2], [8, -2], [-24, 2.4]]) {
    const mh = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.015, 18), mhM);
    mh.position.set(mx, -0.112, mz); mh.receiveShadow = true; scene.add(mh);
  }
  const steamTx = canvasTex(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(230,225,215,0.5)'); g.addColorStop(1, 'rgba(230,225,215,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  const steams = [];
  for (let i = 0; i < 4; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTx, transparent: true, opacity: 0, depthWrite: false }));
    sp.position.set(-3, 0, 1.2); sp.scale.set(1, 1, 1); scene.add(sp);
    steams.push({ sp, t: i * 0.9 });
  }
  updaters.push((dt) => {
    for (const s of steams) {
      s.t += dt * 0.35; if (s.t > 3.6) s.t = 0;
      const k = s.t / 3.6;
      s.sp.position.set(-3 + Math.sin(s.t * 2) * 0.25, -0.05 + k * 2.4, 1.2);
      const sc = 0.6 + k * 1.9; s.sp.scale.set(sc, sc, 1);
      s.sp.material.opacity = Math.sin(k * Math.PI) * 0.16;
    }
  });

  // ---------------- buildings ----------------
  const roofM = mat('#2b2e34', 0.95);
  function building(x0, x1, zFront, h, opts, faceSouth = true) {
    const w = x1 - x0, depth = 9, cx = (x0 + x1) / 2;
    const zC = zFront + (faceSouth ? -depth / 2 : depth / 2);
    const body = box(w, h, depth, mat(opts.bodyColor || '#6e4434', 0.92));
    body.position.set(cx, h / 2, zC); scene.add(body);
    solid(x0, 0, zC - depth / 2, x1, h, zC + depth / 2);
    const facTx = canvasTex(512, Math.max(256, opts.floors * 160), (c, cw, ch) => {
      const em = paintFacade(c, cw, ch, opts);
      body.userData.em = em;
    });
    // rebuild emissive from painter (painter returns em canvas)
    const emCanvas = body.userData.em;
    const emTx = new THREE.CanvasTexture(emCanvas); emTx.colorSpace = THREE.SRGBColorSpace;
    const fac = new THREE.Mesh(new THREE.PlaneGeometry(w, h - (opts.groundH || 0)),
      new THREE.MeshStandardMaterial({ map: facTx, emissiveMap: emTx, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.9 }));
    fac.position.set(cx, (opts.groundH || 0) + (h - (opts.groundH || 0)) / 2, zFront + (faceSouth ? 0.03 : -0.03));
    if (!faceSouth) fac.rotation.y = Math.PI;
    fac.receiveShadow = true; scene.add(fac);
    const parapet = box(w + 0.3, 0.5, depth + 0.3, mat(opts.bodyColor || '#6e4434', 0.92));
    parapet.position.set(cx, h + 0.2, zC); scene.add(parapet);
    const roof = box(w - 0.2, 0.1, depth - 0.2, roofM, false); roof.position.set(cx, h + 0.02, zC); scene.add(roof);
    // rooftop clutter
    const R = rnd(opts.seed + 5);
    for (let i = 0; i < 2; i++) {
      const ac = box(1.1, 0.7, 0.9, mat('#7c828a', 0.6, 0.4));
      ac.position.set(x0 + 1.5 + R() * (w - 3), h + 0.45, zC + (R() - 0.5) * 5); scene.add(ac);
    }
    return { cx, zC, h, w };
  }

  const northRow = [
    building(-40, -26, -8.5, 15, { base: '#8a4a36', mortar: '#5a352a', floors: 4, cols: 5, lit: 0.42, seed: 11, bodyColor: '#7c4230' }),
    building(-26, -16, -8.5, 11, { base: '#7a5a44', mortar: '#4a3628', floors: 3, cols: 4, lit: 0.5, seed: 12, bands: true, bodyColor: '#6e503c' }),
    building(-16, -6, -8.5, 9, { base: '#5f6a72', mortar: '#3c444a', floors: 2, cols: 4, lit: 0.6, seed: 13, groundH: 3.2, bodyColor: '#525c64' }),
  ];
  const southRow = [
    building(-40, -24, 8.5, 12, { base: '#7a5a44', mortar: '#4a3628', floors: 3, cols: 6, lit: 0.45, seed: 21, bands: true, bodyColor: '#6e503c' }, false),
    building(-24, -10, 8.5, 10.5, { base: '#96543c', mortar: '#5f3428', floors: 3, cols: 5, lit: 0.5, seed: 22, bodyColor: '#84482f' }, false),
    building(-10, 2, 8.5, 13, { base: '#6e5a4a', mortar: '#463a30', floors: 4, cols: 4, lit: 0.4, seed: 23, bands: true, bodyColor: '#61503f' }, false),
    building(2, 14, 8.5, 11, { base: '#8a4a36', mortar: '#5a352a', floors: 3, cols: 4, lit: 0.55, seed: 24, bodyColor: '#7c4230' }, false),
  ];
  building(24, 40, -8.5, 12, { base: '#96543c', mortar: '#5f3428', floors: 3, cols: 6, lit: 0.45, seed: 31, bodyColor: '#84482f' });
  building(24, 40, 8.5, 16, { base: '#5f6a72', mortar: '#3c444a', floors: 5, cols: 6, lit: 0.4, seed: 32, bodyColor: '#525c64' }, false);

  // stoops on two south brownstones
  const stoopM = mat('#7d6a58', 0.9);
  for (const sx of [-18, -4]) {
    for (let i = 0; i < 5; i++) { const st = box(2.2, 0.24, 0.42, stoopM); st.position.set(sx, 0.12 + i * 0.24, 8.1 - i * 0.4); scene.add(st); }
    const door = box(1.1, 2.1, 0.1, mat('#3a2a1e', 0.7)); door.position.set(sx, 2.2, 8.46); scene.add(door);
    for (const s of [-1, 1]) { const rail = box(0.06, 0.8, 2.2, mat('#22252b', 0.5, 0.5)); rail.position.set(sx + s * 1.1, 1.35, 7.2); rail.rotation.x = 0.42; scene.add(rail); }
    solid(sx - 1.2, 0, 6.4, sx + 1.2, 1.4, 8.5);
  }

  // fire escape (north apartment)
  const ironM = mat('#1c1f24', 0.55, 0.55);
  for (let f = 0; f < 3; f++) {
    const y = 4.6 + f * 3.1;
    const plat = box(9, 0.08, 1.0, ironM); plat.position.set(-33, y, -7.95); scene.add(plat);
    const rail = box(9, 0.06, 0.05, ironM); rail.position.set(-33, y + 0.85, -7.48); scene.add(rail);
    for (let i = 0; i < 7; i++) { const bal = box(0.04, 0.85, 0.04, ironM, false); bal.position.set(-37 + i * 1.33, y + 0.43, -7.48); scene.add(bal); }
    if (f < 2) { const lad = box(0.7, 3.4, 0.06, ironM); lad.position.set(-30.4 + f * -4, y + 1.6, -7.7); lad.rotation.z = 0.62; scene.add(lad); }
  }
  const dropLad = box(0.6, 3.4, 0.06, ironM); dropLad.position.set(-35.5, 2.9, -7.6); scene.add(dropLad);

  // water towers
  function waterTower(x, y, z) {
    const g = new THREE.Group();
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 2.5, 10), mat('#6b4a33', 0.9));
    tank.position.y = 2.6; tank.castShadow = true; g.add(tank);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.0, 10), mat('#4a3626', 0.9)); cone.position.y = 4.35; cone.castShadow = true; g.add(cone);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; const leg = box(0.14, 1.5, 0.14, ironM); leg.position.set(Math.cos(a) * 1.2, 0.75, Math.sin(a) * 1.2); g.add(leg); }
    g.position.set(x, y, z); scene.add(g);
  }
  waterTower(-33, 15.1, -13); waterTower(-4, 13.1, 13);

  // antenna with blinking beacon
  const ant = box(0.08, 4.5, 0.08, ironM); ant.position.set(30, 18.2, 12); scene.add(ant);
  const beaconM = new THREE.MeshStandardMaterial({ color: '#4a1512', emissive: '#ff2a1e', emissiveIntensity: 0.4 });
  const beacon = box(0.16, 0.16, 0.16, beaconM, false); beacon.position.set(30, 20.5, 12); scene.add(beacon);
  updaters.push((dt, t) => { beaconM.emissiveIntensity = 0.3 + Math.max(0, Math.sin(t * 2.4)) * 2.4; });

  // scaffolding (south sidewalk)
  const scaffM = mat('#5a6068', 0.5, 0.6);
  for (let i = 0; i < 7; i++) {
    const x = -22 + i * 3;
    for (const z of [5.1, 7.9]) { const pole = box(0.09, 3.1, 0.09, scaffM); pole.position.set(x, 1.55, z); scene.add(pole); solid(x - 0.09, 0, z - 0.09, x + 0.09, 3.1, z + 0.09, false); }
    if (i < 6) { const brace = box(3.1, 0.05, 0.05, scaffM, false); brace.position.set(x + 1.5, 1.6, 5.1); brace.rotation.z = i % 2 ? 0.72 : -0.72; scene.add(brace); }
  }
  const deck = box(19, 0.12, 3.2, mat('#7a6a52', 0.9)); deck.position.set(-13, 3.18, 6.5); scene.add(deck);
  solid(-22.5, 3.05, 4.9, -3.5, 3.3, 8.1);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(19, 1.15), new THREE.MeshStandardMaterial({ color: '#2e6e4a', transparent: true, opacity: 0.34, side: THREE.DoubleSide, roughness: 0.9 }));
  net.position.set(-13, 2.5, 5.05); scene.add(net);

  // distant skyline + empire silhouette
  const farTx = canvasTex(256, 512, (c, w, h) => { const em = paintFacade(c, w, h, { base: '#3c4250', mortar: '#2a2f3a', floors: 12, cols: 6, lit: 0.5, seed: 55 }); c.canvas._em = em; });
  const farEm = new THREE.CanvasTexture(farTx.image._em); farEm.colorSpace = THREE.SRGBColorSpace;
  const farM = new THREE.MeshStandardMaterial({ map: farTx, emissiveMap: farEm, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.95 });
  const RF = rnd(66);
  for (let i = 0; i < 16; i++) {
    const w = 10 + RF() * 16, h = 22 + RF() * 34;
    const side = i % 2 ? 1 : -1;
    const b = box(w, h, 12, farM, false, false);
    b.position.set(-120 + RF() * 240, h / 2 - 0.2, side * (42 + RF() * 55));
    scene.add(b);
  }
  const empM = mat('#4a4f5c', 0.95);
  const emp = new THREE.Group();
  [[16, 24], [12, 14], [8, 10], [4.5, 7]].reduce((y, [w, h]) => { const b = box(w, h, w, empM, false, false); b.position.y = y + h / 2; emp.add(b); return y + h; }, 0);
  const spire = box(0.7, 9, 0.7, empM, false, false); spire.position.y = 59; emp.add(spire);
  emp.position.set(-78, 0, -62); scene.add(emp);

  // ---------------- street furniture ----------------
  // streetlights
  const lampLensM = new THREE.MeshStandardMaterial({ color: '#3a3428', emissive: '#ffc98a', emissiveIntensity: 2.6 });
  function lamp(x, z, withLight) {
    const g = new THREE.Group();
    const pole = box(0.14, 5.4, 0.14, mat('#22262c', 0.5, 0.6)); pole.position.y = 2.7; g.add(pole);
    const base = box(0.3, 0.5, 0.3, mat('#22262c', 0.5, 0.6)); base.position.y = 0.25; g.add(base);
    const arm = box(0.1, 0.1, 1.6, mat('#22262c', 0.5, 0.6)); arm.position.set(0, 5.3, z < 0 ? 0.8 : -0.8); g.add(arm);
    const headB = box(0.34, 0.16, 0.6, mat('#22262c', 0.5, 0.6)); headB.position.set(0, 5.28, z < 0 ? 1.5 : -1.5); g.add(headB);
    const lens = box(0.26, 0.05, 0.46, lampLensM, false); lens.position.set(0, 5.19, z < 0 ? 1.5 : -1.5); g.add(lens);
    if (withLight) { const pl = new THREE.PointLight(0xffc98a, 16, 13, 2); pl.position.set(0, 5.0, z < 0 ? 1.5 : -1.5); g.add(pl); }
    g.position.set(x, 0, z); scene.add(g);
    solid(x - 0.12, 0, z - 0.12, x + 0.12, 5.4, z + 0.12, false);
  }
  lamp(-22, -4.9, false); lamp(-6, -4.9, true); lamp(10, -4.9, true); lamp(-14, 4.9, false); lamp(2, 4.9, false);

  // traffic light + street blades
  const tlG = new THREE.Group();
  const tlPole = box(0.12, 3.4, 0.12, mat('#22262c', 0.5, 0.6)); tlPole.position.y = 1.7; tlG.add(tlPole);
  const tlHead = box(0.28, 0.95, 0.3, mat('#1a1d22', 0.6)); tlHead.position.set(0, 3.5, 0); tlG.add(tlHead);
  const lensMats = ['#ff3b30', '#ffb020', '#35d06a'].map(c => new THREE.MeshStandardMaterial({ color: '#181a1e', emissive: c, emissiveIntensity: 0.08 }));
  lensMats.forEach((m, i) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 12), m); l.rotation.z = Math.PI / 2; l.position.set(-0.16, 3.8 - i * 0.3, 0); tlG.add(l); });
  tlG.position.set(14.2, 0, -4.7); scene.add(tlG);
  updaters.push((dt, t) => {
    const c = t % 24; const active = c < 12 ? 2 : c < 15 ? 1 : 0;
    lensMats.forEach((m, i) => m.emissiveIntensity = i === active ? 2.6 : 0.08);
  });
  const bladePole = box(0.09, 3.0, 0.09, mat('#22262c', 0.5, 0.6)); bladePole.position.set(15.3, 1.5, -4.7); scene.add(bladePole);
  const bladeTx1 = textSign('HUDSON ST', null, '#1f6e4a', '#f3e9d2', 512, 110, 'bold 72px Arial');
  const bladeTx2 = textSign('GREENE AVE', null, '#1f6e4a', '#f3e9d2', 512, 110, 'bold 72px Arial');
  const b1 = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.28), new THREE.MeshStandardMaterial({ map: bladeTx1, side: THREE.DoubleSide })); b1.position.set(15.3, 2.85, -4.7); scene.add(b1);
  const b2 = b1.clone(); b2.material = new THREE.MeshStandardMaterial({ map: bladeTx2, side: THREE.DoubleSide }); b2.rotation.y = Math.PI / 2; b2.position.y = 2.52; scene.add(b2);

  // bus stop (the ending's bus ticket, planted early)
  const busPole = box(0.08, 2.7, 0.08, mat('#22262c', 0.5, 0.6)); busPole.position.set(8.6, 1.35, -5.0); scene.add(busPole);
  const busTx = textSign('BUS STOP', 'M14 · DOWNTOWN', '#1c4f8a', '#f3e9d2', 512, 384, 'bold 92px Arial');
  const busSign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.48), new THREE.MeshStandardMaterial({ map: busTx, side: THREE.DoubleSide }));
  busSign.position.set(8.6, 2.45, -5.0); scene.add(busSign);
  solid(8.5, 0, -5.1, 8.7, 2.7, -4.9, false);
  const benchM = mat('#4a5560', 0.6, 0.4);
  for (const dz of [0, 0.28]) { const slat = box(1.6, 0.05, 0.2, benchM); slat.position.set(9.8, 0.45, -7.1 + dz); scene.add(slat); }
  for (const dx of [-0.65, 0.65]) { const leg = box(0.07, 0.45, 0.4, benchM); leg.position.set(9.8 + dx, 0.22, -7.0); scene.add(leg); }
  const backrest = box(1.6, 0.3, 0.05, benchM); backrest.position.set(9.8, 0.75, -7.28); scene.add(backrest);
  solid(9.0, 0, -7.35, 10.6, 0.9, -6.8);

  // hydrant, mailbox, trash, posters
  const hyG = new THREE.Group();
  const hyB = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.55, 10), mat('#c23a2e', 0.55)); hyB.position.y = 0.3; hyB.castShadow = true; hyG.add(hyB);
  const hyD = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), mat('#c23a2e', 0.55)); hyD.position.y = 0.6; hyD.castShadow = true; hyG.add(hyD);
  for (const s of [-1, 1]) { const cap = box(0.09, 0.09, 0.09, mat('#8a2820', 0.5)); cap.position.set(s * 0.17, 0.38, 0); hyG.add(cap); }
  hyG.position.set(-16, 0, -5.2); scene.add(hyG); solid(-16.2, 0, -5.4, -15.8, 0.7, -5.0, false);
  const mb = box(0.55, 1.05, 0.5, mat('#1c4f8a', 0.6)); mb.position.set(-20.5, 0.62, -5.4); scene.add(mb);
  const mbTop = box(0.6, 0.18, 0.55, mat('#163f70', 0.6)); mbTop.position.set(-20.5, 1.22, -5.4); scene.add(mbTop);
  for (const dx of [-0.2, 0.2]) { const leg = box(0.07, 0.14, 0.4, mat('#163f70', 0.6)); leg.position.set(-20.5 + dx, 0.07, -5.4); scene.add(leg); }
  solid(-20.85, 0, -5.7, -20.15, 1.3, -5.1, false);
  const bagM = mat('#20261e', 0.95);
  for (let i = 0; i < 4; i++) {
    const bag = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), bagM);
    bag.scale.set(1, 0.75 + (i % 2) * 0.2, 0.9); bag.castShadow = true;
    bag.position.set(-17.7 + (i % 2) * 0.55, 0.26, -7.7 + (i >> 1) * 0.5); bag.rotation.y = i * 1.3; scene.add(bag);
  }
  solid(-18.1, 0, -8.0, -16.9, 0.6, -7.1, false);

  function poster(x, y, z, tex, w, h, rot = 0) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    p.position.set(x, y, z); p.rotation.z = rot; scene.add(p);
  }
  const hiringTx = canvasTex(256, 340, (ctx, w, h) => {
    ctx.fillStyle = '#f3e9d2'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#b0503a'; ctx.fillRect(0, 0, w, 84);
    ctx.fillStyle = '#f3e9d2'; ctx.font = 'bold 44px Arial'; ctx.textAlign = 'center'; ctx.fillText('NOW', w / 2, 40); ctx.fillText('HIRING', w / 2, 76);
    ctx.fillStyle = '#2a2620'; ctx.font = 'bold 22px Arial';
    ctx.fillText('LINE COOK · DISHWASHER', w / 2, 130); ctx.fillText('APPLY WITHIN', w / 2, 168);
    ctx.font = '17px Arial'; ctx.fillText('No experience? No problem.', w / 2, 210); ctx.fillText('Ask for Manny.', w / 2, 238);
    ctx.strokeStyle = '#8a8272'; ctx.lineWidth = 3; ctx.strokeRect(6, 6, w - 12, h - 12);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = '#2a2620'; ctx.fillRect(22 + i * 36, 285, 3, 40); }
  });
  poster(-7.5, 1.65, -8.46, hiringTx, 0.5, 0.66, 0.025);
  const gigTx = canvasTex(256, 340, (ctx, w, h) => {
    ctx.fillStyle = '#173a4a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f2a541'; ctx.font = 'bold 40px Impact, Arial'; ctx.textAlign = 'center';
    ctx.fillText('LIVE TONIGHT', w / 2, 70); ctx.fillStyle = '#f3e9d2'; ctx.font = 'bold 30px Impact, Arial';
    ctx.fillText('THE HUDSON', w / 2, 130); ctx.fillText('HOWL', w / 2, 168);
    ctx.font = '19px Arial'; ctx.fillText('doors 9pm · $10', w / 2, 220);
    ctx.strokeStyle = '#f2a541'; ctx.lineWidth = 4; ctx.strokeRect(8, 8, w - 16, h - 16);
  });
  poster(-13.5, 1.6, -8.46, gigTx, 0.48, 0.64, -0.03);

  // trees
  function tree(x, z) {
    const g = new THREE.Group();
    const trunk = box(0.24, 1.7, 0.24, mat('#4a3626', 0.95)); trunk.position.y = 0.85; g.add(trunk);
    const fm1 = mat('#3f7a44', 0.9), fm2 = mat('#356b3c', 0.9);
    const blobs = [[0, 2.2, 0, 1.0, fm1], [0.5, 2.6, 0.2, 0.7, fm2], [-0.45, 2.7, -0.15, 0.65, fm2]];
    for (const [bx, by, bz, r, m] of blobs) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), m); f.position.set(bx, by, bz); f.castShadow = true; g.add(f); }
    const planter = box(1.1, 0.3, 1.1, mat('#7d786f', 0.9)); planter.position.y = 0.15; g.add(planter);
    g.position.set(x, 0, z); scene.add(g); solid(x - 0.55, 0, z - 0.55, x + 0.55, 2.0, z + 0.55, false);
  }
  tree(-30, -6.9); tree(5.5, 6.9);

  // ---------------- parked vehicles + taxi ----------------
  const glassCarM = new THREE.MeshPhysicalMaterial({ color: '#1c2830', roughness: 0.08, metalness: 0.4, envMapIntensity: 1.4 });
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14);
  const wheelM = mat('#15171a', 0.85);
  function car(paintColor, opts = {}) {
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: paintColor, roughness: 0.32, metalness: 0.55, envMapIntensity: 1.1 });
    const body = box(4.3, 0.55, 1.8, paint); body.position.y = 0.62; g.add(body);
    const hood = box(1.1, 0.16, 1.7, paint); hood.position.set(1.5, 0.95, 0); g.add(hood);
    const trunk = box(0.9, 0.18, 1.7, paint); trunk.position.set(-1.6, 0.96, 0); g.add(trunk);
    const cabin = box(2.1, 0.52, 1.62, glassCarM); cabin.position.set(-0.15, 1.16, 0); g.add(cabin);
    const roof = box(2.0, 0.07, 1.6, paint); roof.position.set(-0.15, 1.45, 0); g.add(roof);
    for (const s of [-1, 1]) {
      const bumper = box(0.25, 0.22, 1.82, mat('#22262c', 0.5, 0.4)); bumper.position.set(s * 2.15, 0.42, 0); g.add(bumper);
      const hl = box(0.06, 0.12, 0.34, new THREE.MeshStandardMaterial({ color: '#3a3a30', emissive: opts.lightsOn ? '#ffe9c0' : '#4a4a3a', emissiveIntensity: opts.lightsOn ? 2.2 : 0.2 }), false);
      hl.position.set(2.28, 0.72, s * 0.6); g.add(hl);
      const tl = box(0.06, 0.12, 0.3, new THREE.MeshStandardMaterial({ color: '#3a1512', emissive: '#ff2a1e', emissiveIntensity: opts.lightsOn ? 1.8 : 0.35 }), false);
      tl.position.set(-2.28, 0.72, s * 0.6); g.add(tl);
    }
    const wheels = [];
    for (const [wx, wz] of [[1.45, 0.85], [1.45, -0.85], [-1.45, 0.85], [-1.45, -0.85]]) {
      const wg = new THREE.Group();
      const wh = new THREE.Mesh(wheelGeo, wheelM); wh.rotation.x = Math.PI / 2; wh.castShadow = true; wg.add(wh);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.24, 8), mat('#8a9096', 0.4, 0.7)); hub.rotation.x = Math.PI / 2; wg.add(hub);
      wg.position.set(wx, 0.32, wz); g.add(wg); wheels.push(wg);
    }
    if (opts.taxi) {
      const bandTx = canvasTex(256, 32, (ctx, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#1a1a1a' : '#f2c53a'; ctx.fillRect(i * 16, j * 16, 16, 16); } });
      const band = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.22), new THREE.MeshStandardMaterial({ map: bandTx }));
      band.position.set(0, 0.62, 0.916); g.add(band);
      const band2 = band.clone(); band2.rotation.y = Math.PI; band2.position.z = -0.916; g.add(band2);
      const roofSign = box(0.7, 0.22, 0.3, new THREE.MeshStandardMaterial({ color: '#2a2a20', emissive: '#ffd97a', emissiveIntensity: 1.1 }));
      roofSign.position.set(-0.15, 1.62, 0); g.add(roofSign);
    }
    g.userData.wheels = wheels;
    return g;
  }
  const taxi = car('#e8b32a', { taxi: true }); taxi.position.set(-12, -0.12, -3.75); scene.add(taxi);
  solid(-14.3, 0, -4.7, -9.7, 1.6, -2.8);
  const sedan = car('#5a6e8a'); sedan.position.set(-2, -0.12, -3.75); sedan.rotation.y = Math.PI; scene.add(sedan);
  solid(-4.3, 0, -4.7, 0.3, 1.6, -2.8);
  const van = car('#7a4a3a'); van.scale.set(1.08, 1.14, 1.02); van.position.set(6.5, -0.12, 3.75); scene.add(van);
  solid(4.0, 0, 2.75, 9.0, 1.8, 4.75);
  const hatch = car('#3f6e52'); hatch.position.set(-19, -0.12, 3.75); hatch.rotation.y = Math.PI; scene.add(hatch);
  solid(-21.3, 0, 2.75, -16.7, 1.6, 4.75);

  // moving car — the street breathes
  const mover = car('#8a3a4a', { lightsOn: true });
  mover.position.set(-80, -0.12, 2.1); scene.add(mover);
  let moverWait = 4;
  updaters.push((dt) => {
    if (moverWait > 0) { moverWait -= dt; mover.position.x = -80; return; }
    const prev = mover.position.x;
    mover.position.x += 7.6 * dt;
    for (const wh of mover.userData.wheels) wh.rotation.z -= 7.6 / 0.32 * dt;
    if (prev < 0 && mover.position.x >= 0 && hooks.onCarPass) hooks.onCarPass();
    if (mover.position.x > 80) { mover.position.x = -80; moverWait = 8 + Math.random() * 12; }
  });

  // pigeons
  const pigeons = [];
  const pigM = mat('#8a8f96', 0.9), pigHeadM = mat('#5a6470', 0.9);
  for (const [px, pz, seed] of [[-9, -5.6, 1], [-8.1, -5.95, 2], [3.4, 5.8, 3]]) {
    const g = new THREE.Group();
    const body = box(0.13, 0.09, 0.17, pigM); body.position.y = 0.09; g.add(body);
    const tail = box(0.06, 0.02, 0.09, pigHeadM); tail.position.set(0, 0.11, -0.11); tail.rotation.x = -0.4; g.add(tail);
    const hg = new THREE.Group(); hg.position.set(0, 0.13, 0.08); g.add(hg);
    const hd = box(0.06, 0.06, 0.06, pigHeadM); hd.position.y = 0.03; hg.add(hd);
    const beak = box(0.02, 0.015, 0.035, mat('#d8a03a', 0.6)); beak.position.set(0, 0.02, 0.045); hg.add(beak);
    for (const s of [-1, 1]) { const ft = box(0.015, 0.05, 0.02, mat('#c9722e', 0.6), false); ft.position.set(s * 0.03, 0.025, 0); g.add(ft); }
    g.position.set(px, 0, pz); g.rotation.y = seed * 2.1; scene.add(g);
    pigeons.push({ g, hg, t: seed, next: 1 + seed * 0.7 });
  }
  updaters.push((dt) => {
    for (const p of pigeons) {
      p.t += dt;
      if (p.t > p.next) { p.t = 0; p.next = 0.8 + Math.random() * 2.4; }
      p.hg.rotation.x = p.t < 0.3 ? Math.sin(p.t / 0.3 * Math.PI) * 0.9 : 0;
    }
  });

  // ============================================================
  // GREENPOINT MARKET — storefront + interior
  // ============================================================
  const store = new THREE.Group(); scene.add(store);
  const S = { x0: -6, x1: 6, zf: -8.5, zb: -16.5, h: 3.4 };

  // building above the store
  const aboveH = 13;
  const above = box(12, aboveH - 4.0, 8, mat('#6e503c', 0.92));
  above.position.set(0, 4.0 + (aboveH - 4.0) / 2, -12.5); store.add(above);
  solid(-6, 4.0, -16.5, 6, aboveH, -8.5);
  const aboveFacTx = canvasTex(512, 480, (c, w, h) => { const em = paintFacade(c, w, h, { base: '#7a5a44', mortar: '#4a3628', floors: 3, cols: 4, lit: 0.55, seed: 8, bands: true }); c.canvas._em = em; });
  const aboveEm = new THREE.CanvasTexture(aboveFacTx.image._em); aboveEm.colorSpace = THREE.SRGBColorSpace;
  const aboveFac = new THREE.Mesh(new THREE.PlaneGeometry(12, aboveH - 4.1),
    new THREE.MeshStandardMaterial({ map: aboveFacTx, emissiveMap: aboveEm, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.9 }));
  aboveFac.position.set(0, 4.05 + (aboveH - 4.1) / 2, -8.47); store.add(aboveFac);
  const storeParapet = box(12.3, 0.5, 8.3, mat('#6e503c', 0.92)); storeParapet.position.set(0, aboveH + 0.2, -12.5); store.add(storeParapet);
  waterTower(2.5, aboveH + 0.05, -13);

  // interior shell
  const tileTx = canvasTex(512, 512, paintTile, [6, 4]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), new THREE.MeshStandardMaterial({ map: tileTx, roughness: 0.55, envMapIntensity: 0.5 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.005, -12.5); floor.receiveShadow = true; store.add(floor);
  const plasterM = mat('#e6dfcf', 0.92), plasterBackM = mat('#dcd4c2', 0.92);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), mat('#efeae0', 0.95));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, S.h, -12.5); store.add(ceil);

  function wall(x0, z0, x1, z1, h = S.h, m = plasterM, opaque = true) {
    const w = Math.max(0.15, x1 - x0), d = Math.max(0.15, z1 - z0);
    const wl = box(w, h, d, m); wl.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2); store.add(wl);
    return solid(x0, 0, z0, x1, h, z1, opaque);
  }
  wall(-6.15, -16.5, -6.0, -8.5);           // left
  wall(6.0, -16.5, 6.15, -8.5);             // right
  wall(-6.15, -16.65, 4.15, -16.5, S.h, plasterBackM); // back (left of washroom)
  wall(5.05, -16.65, 6.15, -16.5, S.h, plasterBackM);  // back (right)
  wall(4.15, -16.65, 5.05, -16.5, S.h, plasterBackM).enabled = false; // lintel zone handled below
  const lintel = box(0.9, S.h - 2.15, 0.15, plasterBackM); lintel.position.set(4.6, 2.15 + (S.h - 2.15) / 2, -16.575); store.add(lintel);

  // front wall: piers, knee wall, transom, sign band
  const pierM = mat('#28303a', 0.6, 0.35);
  for (const [px0, px1] of [[-6.15, -5.7], [1.5, 1.7], [2.7, 2.9], [5.7, 6.15]]) {
    const pier = box(px1 - px0, S.h, 0.18, pierM); pier.position.set((px0 + px1) / 2, S.h / 2, -8.5); store.add(pier);
    solid(px0, 0, -8.62, px1, S.h, -8.38);
  }
  const knee = box(7.2, 0.42, 0.16, mat('#2e3a34', 0.7)); knee.position.set(-2.1, 0.21, -8.5); store.add(knee);
  solid(-5.7, 0, -8.6, 1.5, 0.42, -8.4, false);
  const transom = box(12.3, 0.5, 0.2, pierM); transom.position.set(0, 2.85, -8.5); store.add(transom);
  const signBand = box(12.3, 0.95, 0.3, mat('#143526', 0.8)); signBand.position.set(0, 3.55, -8.48); store.add(signBand);
  solid(-6.15, 2.6, -8.65, 6.15, 4.05, -8.35);

  // glass (shared physical material — cheap, reflective, see-through)
  const glassM = new THREE.MeshPhysicalMaterial({
    color: '#cfe6e2', roughness: 0.06, metalness: 0, transparent: true, opacity: 0.16,
    envMapIntensity: 1.5, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide, depthWrite: false,
  });
  function pane(w, h, x, y, z) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassM);
    p.position.set(x, y, z); p.renderOrder = 5; store.add(p); return p;
  }
  pane(3.5, 2.18, -3.95, 1.51, -8.5);
  pane(3.7, 2.18, -0.35, 1.51, -8.5);
  pane(2.8, 2.18, 4.3, 1.51, -8.5);
  solid(-5.7, 0, -8.56, 1.5, 2.6, -8.44, false);  // characters can't walk through glass
  solid(2.9, 0, -8.56, 5.7, 2.6, -8.44, false);

  // market sign + awning + neon
  const signTx = textSign('GREENPOINT MARKET', 'FRESH DAILY · EST. 1987', '#14532d', '#f3e9d2');
  const signM2 = new THREE.MeshStandardMaterial({ map: signTx, emissiveMap: signTx, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.7 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 0.85), signM2);
  sign.position.set(0, 3.55, -8.31); store.add(sign);
  const awnTx = canvasTex(512, 128, (ctx, w, h) => { for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? '#f3e9d2' : '#1f6e4a'; ctx.fillRect(i * w / 12, 0, w / 12, h); } ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, h - 14, w, 14); });
  const awn = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 1.35), new THREE.MeshStandardMaterial({ map: awnTx, side: THREE.DoubleSide, roughness: 0.85 }));
  awn.position.set(0, 2.95, -7.85); awn.rotation.x = -0.62; awn.castShadow = true; store.add(awn);
  const neonTx = canvasTex(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#0a0c10'; ctx.fillRect(0, 0, w, h);
    ctx.font = 'bold 74px Impact, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff4b3e'; ctx.shadowBlur = 26; ctx.fillStyle = '#ff6a55'; ctx.fillText('OPEN', w / 2, h / 2 - 4);
    ctx.shadowBlur = 0; ctx.strokeStyle = '#ff8a70'; ctx.lineWidth = 3; ctx.strokeRect(10, 10, w - 20, h - 20);
  });
  const neonM = new THREE.MeshStandardMaterial({ map: neonTx, emissiveMap: neonTx, emissive: 0xffffff, emissiveIntensity: 2.3, transparent: true });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), neonM);
  neon.position.set(-0.4, 2.15, -8.42); neon.renderOrder = 6; store.add(neon);
  const neonLight = new THREE.PointLight(0xff5a3c, 7, 5, 2); neonLight.position.set(-0.4, 2.2, -7.9); store.add(neonLight);
  let flickT = 5;
  updaters.push((dt) => {
    flickT -= dt;
    if (flickT < 0) flickT = 6 + Math.random() * 8;
    const dip = flickT < 0.09 ? 0.5 : 1;
    neonM.emissiveIntensity = 2.3 * dip; neonLight.intensity = 7 * dip;
  });

  // ---- glass entrance door (hinged pivot) ----
  function makeDoor(hingeX, z, width, height, inward = true) {
    const pivot = new THREE.Group(); pivot.position.set(hingeX, 0, z); store.add(pivot);
    const frameM = mat('#8a9096', 0.35, 0.7);
    const dg = new THREE.Group(); dg.position.x = width / 2; pivot.add(dg);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.12, height - 0.24), glassM);
    gl.position.y = height / 2 + 0.02; gl.renderOrder = 5; dg.add(gl);
    for (const [fx, fy, fw, fh] of [[0, height - 0.05, width, 0.1], [0, 0.09, width, 0.18], [-width / 2 + 0.04, height / 2, 0.08, height], [width / 2 - 0.04, height / 2, 0.08, height]]) {
      const fr = box(fw, fh, 0.06, frameM); fr.position.set(fx, fy, 0); dg.add(fr);
    }
    const bar = box(width - 0.2, 0.06, 0.07, frameM); bar.position.set(0, 1.05, 0.06); dg.add(bar);
    const pushTx = textSign('PUSH', null, '#f3e9d2', '#1a1d22', 128, 64, 'bold 40px Arial');
    const push = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.09), new THREE.MeshStandardMaterial({ map: pushTx }));
    push.position.set(0.18, 1.32, 0.045); dg.add(push);
    const collider = solid(hingeX, 0, z - 0.08, hingeX + width, height, z + 0.08, false);
    const door = { t: 0, pivot, collider, max: inward ? 1.75 : -1.75 };
    door.set = (t) => { door.t = t; pivot.rotation.y = door.max * t; collider.enabled = t < 0.25; };
    door.set(0);
    return door;
  }
  const entryDoor = makeDoor(1.72, -8.5, 0.96, 2.2);
  const chimeBox = box(0.12, 0.1, 0.08, mat('#c9a23a', 0.4, 0.7)); chimeBox.position.set(2.2, 2.32, -8.62); store.add(chimeBox);

  // ---- washroom ----
  const washDoor = makeDoor(4.17, -16.5, 0.86, 2.1);
  const washDoorPanel = box(0.80, 2.04, 0.045, mat('#7a6a52', 0.8));
  washDoorPanel.position.set(0.43, 1.05, 0); washDoor.pivot.add(washDoorPanel);
  const restTx = textSign('RESTROOM', null, '#2e3a34', '#f3e9d2', 256, 80, 'bold 44px Arial');
  const restSign = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.125), new THREE.MeshStandardMaterial({ map: restTx }));
  restSign.position.set(0.43, 1.72, 0.03); washDoor.pivot.add(restSign);
  const knob = box(0.05, 0.05, 0.06, mat('#c9a23a', 0.35, 0.8)); knob.position.set(0.76, 1.02, 0.05); washDoor.pivot.add(knob);
  // washroom shell
  wall(3.4, -18.5, 3.55, -16.5, 2.6); wall(5.9, -18.5, 6.05, -16.5, 2.6);
  wall(3.4, -18.65, 6.05, -18.5, 2.6);
  const washCeil = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.0), mat('#efeae0', 0.95));
  washCeil.rotation.x = Math.PI / 2; washCeil.position.set(4.7, 2.6, -17.5); store.add(washCeil);
  const washFloor = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.0), new THREE.MeshStandardMaterial({ map: tileTx.clone(), roughness: 0.5 }));
  washFloor.material.map.repeat.set(2, 2); washFloor.material.map.needsUpdate = true;
  washFloor.rotation.x = -Math.PI / 2; washFloor.position.set(4.7, 0.006, -17.5); store.add(washFloor);
  const toilM = mat('#e8e6e0', 0.35);
  const tBase = box(0.4, 0.42, 0.5, toilM); tBase.position.set(5.45, 0.21, -17.9); store.add(tBase);
  const tTank = box(0.44, 0.5, 0.18, toilM); tTank.position.set(5.45, 0.65, -18.3); store.add(tTank);
  const tSeat = box(0.42, 0.05, 0.44, toilM); tSeat.position.set(5.45, 0.45, -17.82); store.add(tSeat);
  const pedestal = box(0.16, 0.78, 0.16, toilM); pedestal.position.set(3.95, 0.39, -18.15); store.add(pedestal);
  const basin = box(0.46, 0.12, 0.36, toilM); basin.position.set(3.95, 0.82, -18.15); store.add(basin);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.5), new THREE.MeshStandardMaterial({ color: '#bcd6e4', roughness: 0.03, metalness: 0.9, envMapIntensity: 1.6 }));
  mirror.position.set(3.95, 1.5, -18.42); store.add(mirror);
  solid(5.15, 0, -18.45, 5.75, 1.0, -17.5, false); solid(3.65, 0, -18.4, 4.25, 1.0, -17.9, false);

  // ---- counter + register ----
  const counterM = mat('#5a4632', 0.7), counterTopM = mat('#8a7050', 0.5);
  const counter = box(3.6, 0.92, 0.7, counterM); counter.position.set(-3.4, 0.46, -10.55); store.add(counter);
  const cTop = box(3.75, 0.06, 0.82, counterTopM); cTop.position.set(-3.4, 0.95, -10.55); store.add(cTop);
  solid(-5.25, 0, -10.95, -1.55, 1.0, -10.15);
  const reg = box(0.4, 0.28, 0.34, mat('#22262c', 0.5)); reg.position.set(-4.6, 1.12, -10.6); store.add(reg);
  const regScr = box(0.26, 0.16, 0.02, new THREE.MeshStandardMaterial({ color: '#12202c', emissive: '#7fc4e8', emissiveIntensity: 1.4 }), false);
  regScr.position.set(-4.6, 1.3, -10.42); regScr.rotation.x = -0.25; store.add(regScr);
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.22, 10), glassM); jar.position.set(-2.3, 1.09, -10.5); jar.renderOrder = 5; store.add(jar);
  const candyCols = ['#ff4b3e', '#f2a541', '#2e8f63', '#7fb2e5', '#c95a9a'];
  for (let i = 0; i < 6; i++) { const cd = box(0.045, 0.045, 0.045, mat(candyCols[i % 5], 0.5), false); cd.position.set(-2.3 + Math.sin(i * 2.4) * 0.05, 1.02 + (i % 3) * 0.05, -10.5 + Math.cos(i * 2.4) * 0.05); cd.rotation.y = i; store.add(cd); }
  const cloth = box(0.16, 0.025, 0.14, mat('#d9c27a', 0.95), false); cloth.position.set(-3.3, 0.99, -10.45); store.add(cloth);
  const cardTx = textSign('WE CARD', 'LOTTO · ATM INSIDE', '#1c4f8a', '#f3e9d2', 256, 160, 'bold 52px Arial');
  const cardSign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshStandardMaterial({ map: cardTx }));
  cardSign.position.set(-5.96, 1.8, -10.4); cardSign.rotation.y = Math.PI / 2; store.add(cardSign);

  // ---- back-bar shelf (groceries live here) ----
  const backBar = box(2.8, 1.08, 0.42, counterM); backBar.position.set(-3.8, 0.54, -12.55); store.add(backBar);
  const bbTop = box(2.9, 0.05, 0.5, counterTopM); bbTop.position.set(-3.8, 1.10, -12.55); store.add(bbTop);
  solid(-5.25, 0, -12.8, -2.35, 1.15, -12.3);
  const bbShelf = box(2.8, 0.05, 0.3, counterTopM); bbShelf.position.set(-3.8, 1.9, -12.7); store.add(bbShelf);
  for (let i = 0; i < 7; i++) { const bx = box(0.16, 0.24, 0.1, mat(candyCols[i % 5], 0.7)); bx.position.set(-4.9 + i * 0.36, 2.05, -12.7); store.add(bx); }

  // ---- gondola shelves + instanced products ----
  const gondolaBaseM = mat('#2a2e33', 0.7), boardM = mat('#d9d4c8', 0.75);
  const shelfRows = [{ z: -11.9 }, { z: -13.9 }];
  const boardYs = [0.32, 0.82, 1.32];
  for (const row of shelfRows) {
    const base = box(5.2, 0.16, 0.55, gondolaBaseM); base.position.set(2.0, 0.08, row.z); store.add(base);
    const spine = box(5.2, 1.62, 0.08, gondolaBaseM); spine.position.set(2.0, 0.81, row.z); store.add(spine);
    for (const y of boardYs) for (const s of [-1, 1]) {
      const bd = box(5.2, 0.045, 0.26, boardM); bd.position.set(2.0, y, row.z + s * 0.17); store.add(bd);
      const strip = box(5.2, 0.05, 0.012, mat('#f3e9d2', 0.6), false); strip.position.set(2.0, y + 0.01, row.z + s * 0.30); store.add(strip);
    }
    const cap1 = box(0.08, 1.62, 0.55, gondolaBaseM); cap1.position.set(-0.6, 0.81, row.z); store.add(cap1);
    const cap2 = cap1.clone(); cap2.position.x = 4.6; store.add(cap2);
    solid(-0.65, 0, row.z - 0.31, 4.65, 1.65, row.z + 0.31);
  }
  const prodCols = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#2980b9', '#8e44ad', '#ecf0f1', '#d35400'];
  const RP = rnd(99);
  const prodXf = [];
  for (const row of shelfRows) for (const y of boardYs) for (const s of [-1, 1]) {
    for (let x = -0.42; x < 4.5; x += 0.175) {
      if (RP() < 0.14) continue;
      prodXf.push({ x: x + (RP() - 0.5) * 0.03, y: y + 0.135, z: row.z + s * 0.17, h: 0.17 + RP() * 0.12, c: prodCols[(RP() * prodCols.length) | 0], r: (RP() - 0.5) * 0.14 });
    }
  }
  const prodMesh = new THREE.InstancedMesh(UNIT, new THREE.MeshStandardMaterial({ roughness: 0.6 }), prodXf.length);
  const dummy = new THREE.Object3D(); const colTmp = new THREE.Color();
  prodXf.forEach((p, i) => {
    dummy.position.set(p.x, p.y + (p.h - 0.2) / 2, p.z); dummy.rotation.set(0, p.r, 0); dummy.scale.set(0.13, p.h, 0.1);
    dummy.updateMatrix(); prodMesh.setMatrixAt(i, dummy.matrix); prodMesh.setColorAt(i, colTmp.set(p.c));
  });
  prodMesh.castShadow = true; prodMesh.receiveShadow = true;
  prodMesh.instanceMatrix.needsUpdate = true; if (prodMesh.instanceColor) prodMesh.instanceColor.needsUpdate = true;
  store.add(prodMesh);
  // cans on top boards
  const canGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.12, 10);
  const canXf = [];
  for (const row of shelfRows) for (const s of [-1, 1]) for (let x = -0.4; x < 4.5; x += 0.12) { if (RP() < 0.2) continue; canXf.push({ x, z: row.z + s * 0.17, c: prodCols[(RP() * prodCols.length) | 0] }); }
  const canMesh = new THREE.InstancedMesh(canGeo, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 }), canXf.length);
  canXf.forEach((p, i) => { dummy.position.set(p.x, 1.32 + 0.085, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); canMesh.setMatrixAt(i, dummy.matrix); canMesh.setColorAt(i, colTmp.set(p.c)); });
  canMesh.castShadow = true; canMesh.instanceMatrix.needsUpdate = true; if (canMesh.instanceColor) canMesh.instanceColor.needsUpdate = true;
  store.add(canMesh);

  // hanging aisle signs
  for (const [txt, z] of [['SNACKS', -11.9], ['CANNED GOODS', -13.9]]) {
    const tx = textSign(txt, null, '#143526', '#f3e9d2', 512, 110, 'bold 64px Arial');
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.28), new THREE.MeshStandardMaterial({ map: tx, side: THREE.DoubleSide }));
    sg.position.set(2.0, 2.75, z); store.add(sg);
    for (const dx of [-0.5, 0.5]) { const wire = box(0.015, 0.5, 0.015, mat('#5a6068', 0.5), false); wire.position.set(2.0 + dx, 3.1, z); store.add(wire); }
  }

  // ---- fridge (glowing) ----
  const fridge = box(5.2, 2.2, 0.5, mat('#cfd4d8', 0.4, 0.3)); fridge.position.set(0.8, 1.1, -16.25); store.add(fridge);
  const fridgeGlow = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 1.8), new THREE.MeshStandardMaterial({ color: '#dff3ff', emissive: '#cfeaff', emissiveIntensity: 1.5 }), false);
  fridgeGlow.position.set(0.8, 1.15, -15.99); store.add(fridgeGlow);
  for (let i = 0; i < 4; i++) { const fr = box(0.05, 1.9, 0.06, mat('#8a9096', 0.35, 0.7)); fr.position.set(-1.2 + i * 1.33, 1.15, -15.96); store.add(fr); }
  const fridgeGlass = pane(5.0, 1.9, 0.8, 1.15, -15.95);
  const bottleGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.24, 8);
  const bottleCols = ['#2e8f63', '#c9722e', '#2980b9', '#c0392b'];
  const botMesh = new THREE.InstancedMesh(bottleGeo, new THREE.MeshStandardMaterial({ roughness: 0.25 }), 48);
  let bi = 0;
  for (let sh = 0; sh < 3; sh++) for (let i = 0; i < 16; i++) {
    dummy.position.set(-1.45 + i * 0.30, 0.55 + sh * 0.6, -16.15); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
    dummy.updateMatrix(); botMesh.setMatrixAt(bi, dummy.matrix); botMesh.setColorAt(bi, colTmp.set(bottleCols[(i + sh) % 4])); bi++;
  }
  botMesh.instanceMatrix.needsUpdate = true; if (botMesh.instanceColor) botMesh.instanceColor.needsUpdate = true;
  store.add(botMesh);
  solid(-1.85, 0, -16.55, 3.45, 2.2, -15.9);

  // wall clock — 6:47
  const clockTx = canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#f3e9d2'; ctx.beginPath(); ctx.arc(64, 64, 60, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2a2620'; ctx.lineWidth = 5; ctx.stroke();
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; ctx.beginPath(); ctx.moveTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50); ctx.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); ctx.lineWidth = 3; ctx.stroke(); }
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(64, 64); const ha = (6.78 / 12) * Math.PI * 2 - Math.PI / 2; ctx.lineTo(64 + Math.cos(ha) * 28, 64 + Math.sin(ha) * 28); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(64, 64); const ma = (47 / 60) * Math.PI * 2 - Math.PI / 2; ctx.lineTo(64 + Math.cos(ma) * 44, 64 + Math.sin(ma) * 44); ctx.stroke();
  });
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), new THREE.MeshStandardMaterial({ map: clockTx }));
  clock.position.set(-5.96, 2.5, -13.5); clock.rotation.y = Math.PI / 2; store.add(clock);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#bcd6e4', roughness: 0.05, metalness: 0.9, envMapIntensity: 1.6 }));
  dome.position.set(-5.8, 3.1, -9.0); dome.rotation.z = -Math.PI / 4; store.add(dome);

  // ceiling fixtures + interior lights
  const fixM = new THREE.MeshStandardMaterial({ color: '#e8e6e0', emissive: '#fff2d8', emissiveIntensity: 1.9 });
  for (const [fx, fz] of [[-3, -10.8], [2.5, -12.8], [-2, -15.2]]) {
    const fix = box(1.5, 0.07, 0.4, fixM, false); fix.position.set(fx, S.h - 0.05, fz); store.add(fix);
  }
  const int1 = new THREE.PointLight(0xffe2b8, 24, 12, 2); int1.position.set(-3, 3.0, -11.3); store.add(int1);
  const int2 = new THREE.PointLight(0xffe2b8, 22, 12, 2); store.add(int2); int2.position.set(3, 3.0, -13.6);

  // ---- groceries prop (paper bag + baguette + eggs) ----
  const groceries = new THREE.Group();
  const groceryBagM = mat('#c9a06a', 0.9), groceryBagFoldM = mat('#b08a52', 0.9);
  const bagBody = box(0.26, 0.30, 0.16, groceryBagM); bagBody.position.y = -0.15; groceries.add(bagBody);
  const fold = box(0.27, 0.045, 0.17, groceryBagFoldM); fold.position.y = -0.02; groceries.add(fold);
  const baguette = box(0.085, 0.36, 0.085, mat('#d8a35c', 0.8)); baguette.position.set(-0.05, 0.10, 0); baguette.rotation.z = 0.16; groceries.add(baguette);
  for (let i = 0; i < 3; i++) { const score = box(0.09, 0.014, 0.02, mat('#b07a3a', 0.85), false); score.position.set(-0.05 - 0.028 * (i - 1), 0.05 + i * 0.09, 0.043); score.rotation.z = 0.5; groceries.add(score); }
  const carton = box(0.19, 0.065, 0.11, mat('#b7ab97', 0.9)); carton.position.set(0.055, 0.02, 0); carton.rotation.z = -0.1; groceries.add(carton);
  const groceryHome = new THREE.Group(); groceryHome.position.set(-3.9, 1.43, -12.55); store.add(groceryHome);
  groceryHome.add(groceries); groceries.rotation.y = 0.3;
  groceries.userData.prop = true;

  // ---------------- helpers / exports ----------------
  const insideBounds = new THREE.Box3(V(-6, -0.5, -18.6), V(6, 4, -8.4));
  const isInside = (p) => insideBounds.containsPoint(p);

  const spots = {
    heroStart: V(-25.5, 0, -6.4),
    doorFront: V(2.2, 0, -7.05),
    doorIn: V(2.2, 0, -9.6),
    counterHero: V(-3.4, 0, -9.5),
    keeper: V(-3.4, 0, -11.6),
    washFront: V(4.6, 0, -15.75),
    washIn: V(4.6, 0, -17.4),
    poster: V(-7.5, 1.65, -8.45),
    doorLook: V(2.2, 1.45, -8.55),
    washDoorLook: V(4.6, 1.3, -16.5),
    pedA: V(-28, 0, 6.4), pedB: V(8, 0, 6.4),
  };

  return {
    colliders, updaters, hooks, sun, spots, isInside,
    doors: { entry: entryDoor, washroom: washDoor },
    props: { groceries, groceryHome, cloth },
  };
}
