// ============================================================
// OPERATION INDIA — controls.js  (STAGE 2)
// PlayerController: camera-relative movement, gravity/jump,
// AABB collision, mission boundary, interaction framework.
// GameplayCamera: pointer-lock orbit rig with obstruction pull-in.
// Drives the EXISTING Stage 1 character — nothing is recreated.
// ============================================================
import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;
function dampAngle(a, b, l, dt) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-l * dt));
}
const easeIO = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ------------------------------------------------------------
// GameplayCamera — behind-and-above orbit with collision
// ------------------------------------------------------------
export class GameplayCamera {
  constructor(colliders) {
    this.colliders = colliders;
    this.yaw = 0; this.pitch = 0.18;
    this.tYaw = 0; this.tPitch = 0.18;
    this.dist = 3.0; this.tDist = 3.0;
    this.sensX = 0.0022; this.sensY = 0.0018;
    this.shoulder = 0.32;
    this.fov = 50;
    this.smoothPivot = new THREE.Vector3();
    this._origin = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._hit = new THREE.Vector3();
    this._ray = new THREE.Ray();
    this.initialized = false;
  }
  onMouse(dx, dy) {
    this.tYaw -= dx * this.sensX;
    this.tPitch = clamp(this.tPitch + dy * this.sensY, -0.35, 0.75);
  }
  onWheel(dy) { this.tDist = clamp(this.tDist + Math.sign(dy) * 0.35, 1.6, 4.5); }
  snapBehind(char) {
    this.tYaw = this.yaw = char.yaw + Math.PI;
    this.tPitch = this.pitch = 0.18;
    this.tDist = this.dist = 3.0;
    this.smoothPivot.set(char.group.position.x, char.group.position.y + 1.45, char.group.position.z);
    this.initialized = true;
  }
  computePose(char, dt, outPos, outTgt) {
    this.yaw = dampAngle(this.yaw, this.tYaw, 14, dt);
    this.pitch = damp(this.pitch, this.tPitch, 14, dt);
    this.dist = damp(this.dist, this.tDist, 8, dt);
    const p = char.group.position;
    this._origin.set(p.x, p.y + 1.45, p.z);
    if (!this.initialized) { this.smoothPivot.copy(this._origin); this.initialized = true; }
    this.smoothPivot.lerp(this._origin, 1 - Math.exp(-12 * dt));
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const ox = this.smoothPivot.x + rx * this.shoulder;
    const oy = this.smoothPivot.y;
    const oz = this.smoothPivot.z + rz * this.shoulder;
    this._origin.set(ox, oy, oz);
    this._d.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    let hit = this.dist;
    this._ray.set(this._origin, this._d);
    for (const c of this.colliders) {
      if (!c.enabled || !c.opaque) continue;
      if (this._ray.intersectBox(c.box, this._hit)) {
        const d = this._hit.distanceTo(this._origin);
        if (d < hit) hit = d;
      }
    }
    hit = Math.max(hit - 0.22, 0.55);
    outPos.copy(this._origin).addScaledVector(this._d, hit);
    outPos.y = Math.max(outPos.y, 0.3);
    outTgt.set(ox, oy + 0.12, oz);
  }
}

// ------------------------------------------------------------
// PlayerController
// ------------------------------------------------------------
export class PlayerController {
  constructor(char, world, cam, hooks) {
    this.char = char; this.world = world; this.cam = cam; this.hooks = hooks;
    this.enabled = false; this.locked = false;
    this.keys = Object.create(null);
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.grounded = true; this.coyote = 0; this.jumpBuf = 0;
    this.airK = 0; this._dt = 1 / 60;
    this.walkSpeed = 1.6; this.runSpeed = 3.4;
    this.accel = 8; this.decel = 12; this.runAccel = 10; this.runDecel = 14;
    this.gravity = 22; this.jumpV = 5.0;
    this.radius = 0.28; this.height = 1.80;
    this._prev = new THREE.Vector3();
    this.boundaryCooldown = 0;
    this.interactTarget = null; this._lastLabel = null;
    this.doorTweens = [];
    this._kd = (e) => this._key(e, true);
    this._ku = (e) => this._key(e, false);
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
  }
  dispose() {
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
  }
  _key(e, down) {
    if (!down) { this.keys[e.code] = false; return; }
    if (!this.enabled || !this.locked) return;
    this.keys[e.code] = true;
    if (e.code === 'Space') { this.jumpBuf = 0.12; e.preventDefault(); }
    if (e.code === 'KeyE') this.interact();
  }
  engage() {
    this.enabled = true;
    this.char.selfDrive = false;
    this.vx = this.vz = this.vy = 0;
    this.grounded = true; this.airK = 0;
    this.char.airK = 0; this.char.airRise = 0;
    this.char.setMotion(0, this.char.yaw);
    this.cam.snapBehind(this.char);
    for (const k in this.keys) this.keys[k] = false;
  }
  disengage() {
    this.enabled = false;
    this.char.setMotion(0, this.char.targetYaw);
    this.char.airK = 0; this.char.airRise = 0;
    for (const k in this.keys) this.keys[k] = false;
  }
  setLocked(b) {
    this.locked = b;
    if (!b) {
      for (const k in this.keys) this.keys[k] = false;
      this.vx = this.vz = 0;
      this.char.setMotion(0, this.char.targetYaw);
    }
  }

  update(dt) {
    for (let i = this.doorTweens.length - 1; i >= 0; i--) {
      const tw = this.doorTweens[i];
      tw.t += dt;
      const k = easeIO(clamp(tw.t / tw.dur, 0, 1));
      tw.door.set(tw.from + (tw.to - tw.from) * k);
      if (tw.t >= tw.dur) {
        tw.door.set(tw.to);
        if (tw.onDone) tw.onDone();
        this.doorTweens.splice(i, 1);
      }
    }
    if (!this.enabled || dt <= 0) return;
    this._dt = dt;
    const ch = this.char, p = ch.group.position;
    this._prev.copy(p);
    this.boundaryCooldown = Math.max(0, this.boundaryCooldown - dt);

    // ---- input → camera-relative intent ----
    let ix = 0, iz = 0;
    if (this.locked) {
      if (this.keys['KeyW']) iz += 1;
      if (this.keys['KeyS']) iz -= 1;
      if (this.keys['KeyA']) ix -= 1;
      if (this.keys['KeyD']) ix += 1;
    }
    const run = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    const mag = Math.hypot(ix, iz);
    const yaw = this.cam.yaw;
    let tx = 0, tz = 0;
    if (mag > 0) {
      const nx = ix / mag, nz = iz / mag;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const vmax = run ? this.runSpeed : this.walkSpeed;
      tx = (fx * nz + rx * nx) * vmax;
      tz = (fz * nz + rz * nx) * vmax;
    }
    const acc = run ? this.runAccel : this.accel;
    const dec = run ? this.runDecel : this.decel;
    if (mag > 0) {
      const ax = tx - this.vx, az = tz - this.vz;
      const al = Math.hypot(ax, az);
      const step = Math.min(al, acc * dt);
      if (al > 1e-6) { this.vx += ax / al * step; this.vz += az / al * step; }
    } else {
      const sp = Math.hypot(this.vx, this.vz);
      const step = Math.min(sp, dec * dt);
      if (sp > 1e-6) { this.vx -= this.vx / sp * step; this.vz -= this.vz / sp * step; }
    }

    // ---- integrate XZ + solids + boundary ----
    p.x += this.vx * dt;
    p.z += this.vz * dt;
    this.resolveSolids(p);
    this.clampBoundary(p, mag);

    // ---- gravity / jump / ceiling ----
    this.coyote = this.grounded ? 0.08 : Math.max(0, this.coyote - dt);
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (this.jumpBuf > 0 && (this.grounded || this.coyote > 0)) {
      this.vy = this.jumpV; this.grounded = false; this.coyote = 0; this.jumpBuf = 0;
      ch.playClip('jump');
      if (this.hooks.onJump) this.hooks.onJump();
    }
    if (!this.grounded) {
      this.vy -= this.gravity * dt;
      let ny = p.y + this.vy * dt;
      if (this.vy > 0) ny = this.capCeiling(p, ny);
      if (ny <= 0) {
        ny = 0; this.vy = 0; this.grounded = true;
        ch.playClip('land');
        if (this.hooks.onLand) this.hooks.onLand(ch.surface());
      }
      p.y = ny;
    } else {
      p.y = 0;
    }
    this.airK = damp(this.airK, this.grounded ? 0 : 1, 8, dt);
    ch.airK = this.airK;
    ch.airRise = clamp(this.vy / this.jumpV, -1, 1);

    // ---- feed the Stage 1 animation system ----
    const speed = Math.hypot(this.vx, this.vz);
    const moveYaw = speed > 0.05 ? Math.atan2(this.vx, this.vz) : ch.targetYaw;
    ch.setMotion(this.grounded ? speed : speed * 0.35, moveYaw);

    this.scanInteractables();
  }

  resolveSolids(p) {
    const r = this.radius, head = p.y + this.height;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const c of this.world.colliders) {
        if (!c.enabled) continue;
        const b = c.box;
        if (b.max.y <= p.y + 0.05 || b.min.y >= head - 0.001) continue;
        if (p.x > b.min.x - r && p.x < b.max.x + r && p.z > b.min.z - r && p.z < b.max.z + r) {
          const dxl = p.x - (b.min.x - r), dxr = (b.max.x + r) - p.x;
          const dzl = p.z - (b.min.z - r), dzr = (b.max.z + r) - p.z;
          const m = Math.min(dxl, dxr, dzl, dzr);
          if (m === dxl) { p.x = b.min.x - r; if (this.vx < 0) this.vx = 0; }
          else if (m === dxr) { p.x = b.max.x + r; if (this.vx > 0) this.vx = 0; }
          else if (m === dzl) { p.z = b.min.z - r; if (this.vz < 0) this.vz = 0; }
          else { p.z = b.max.z + r; if (this.vz > 0) this.vz = 0; }
          moved = true;
        }
      }
      if (!moved) break;
    }
  }
  capCeiling(p, ny) {
    const head = ny + this.height, r = this.radius * 0.7;
    for (const c of this.world.colliders) {
      if (!c.enabled) continue;
      const b = c.box;
      if (b.min.y < p.y + this.height - 0.001 || b.min.y > head) continue;
      if (p.x > b.min.x - r && p.x < b.max.x + r && p.z > b.min.z - r && p.z < b.max.z + r) {
        ny = b.min.y - this.height;
        this.vy = 0;
      }
    }
    return ny;
  }
  clampBoundary(p, intentMag) {
    const Z = this.world.missionZones;
    const inZone = (z) => p.x >= z.x0 && p.x <= z.x1 && p.z >= z.z0 && p.z <= z.z1;
    if (inZone(Z.main) || inZone(Z.wash)) {
      if (intentMag > 0 && this.boundaryCooldown <= 0 && this.world.isPerimeter(p.x, p.z)) {
        const disp = Math.hypot(p.x - this._prev.x, p.z - this._prev.z);
        if (disp < 0.25 * intentMag * this.walkSpeed * this._dt) this.boundaryMessage();
      }
      return;
    }
    const near = (z) => {
      const cx = clamp(p.x, z.x0, z.x1), cz = clamp(p.z, z.z0, z.z1);
      return { d: Math.hypot(p.x - cx, p.z - cz), cx, cz };
    };
    const a = near(Z.main), b = near(Z.wash);
    const best = a.d <= b.d ? a : b;
    p.x = best.cx; p.z = best.cz;
    this.vx *= 0.2; this.vz *= 0.2;
    this.boundaryMessage();
  }
  boundaryMessage() {
    if (this.boundaryCooldown > 0) return;
    this.boundaryCooldown = 2.6;
    if (this.hooks.onBoundary) this.hooks.onBoundary();
  }

  scanInteractables() {
    const p = this.char.group.position;
    let best = null, bestD = 1e9;
    for (const it of this.world.interactables) {
      if (!it.enabled()) continue;
      const d = Math.hypot(p.x - it.pos.x, p.z - it.pos.z);
      if (d < it.radius && d < bestD && Math.abs(p.y - it.pos.y) < 1.7) { best = it; bestD = d; }
    }
    const label = best ? best.label() : null;
    if (best !== this.interactTarget || label !== this._lastLabel) {
      this.interactTarget = best; this._lastLabel = label;
      if (this.hooks.onInteractHint) this.hooks.onInteractHint(label);
    }
  }
  interact() {
    const it = this.interactTarget;
    if (!it) return;
    if (it.kind === 'door' && it.door.t > 0.5) {
      const p = this.char.group.position;
      if (Math.abs(p.z - it.pos.z) < 0.45 && p.x > it.hingeX - 0.1 && p.x < it.hingeX + it.width + 0.1) {
        if (this.hooks.onDoorBlocked) this.hooks.onDoorBlocked();
        return;
      }
    }
    it.action(this);
  }
  toggleDoor(door, openSound, closeSound, chime) {
    const to = door.t > 0.5 ? 0 : 1;
    this.doorTweens = this.doorTweens.filter((t) => t.door !== door);
    this.doorTweens.push({ door, from: door.t, to, t: 0, dur: 0.8, onDone: to === 0 ? closeSound : null });
    if (to === 1) { openSound(); if (chime) chime(); }
    this.char.playClip('reach');
  }
}