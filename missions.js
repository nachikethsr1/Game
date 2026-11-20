// ============================================================
// OPERATION INDIA — missions.js
// Cinematic director: abort-safe async timeline for Scenes 1–3.
// Shot list, blocking, exact dialogue, prop choreography.
// ============================================================
import * as THREE from 'three';
import { EYE_Y } from './player.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const easeIO = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const linear = (t) => t;
const ABORT = Symbol('abort');

// ---------- shot builders ----------
function dolly(p0, p1, t0, t1, o = {}) {
  return {
    dur: o.dur || 6, fov: o.fov || 45, fov1: o.fov1 !== undefined ? o.fov1 : (o.fov || 45),
    ease: o.ease || easeIO, cut: o.cut !== false, shake: o.shake !== undefined ? o.shake : 1,
    pos: (e, out) => out.lerpVectors(p0, p1, e),
    tgt: (e, out) => out.lerpVectors(t0, t1, e),
  };
}
function hold(p, t, o = {}) { return dolly(p, p, t, t, o); }
function track(char, off0, off1, o = {}) {
  const lookOff = o.lookOff || V(0, 0, 0);
  return {
    dur: o.dur || 5, fov: o.fov || 40, fov1: o.fov1 !== undefined ? o.fov1 : (o.fov || 40),
    ease: o.ease || linear, cut: o.cut !== false, shake: o.shake !== undefined ? o.shake : 0.8,
    pos: (e, out) => {
      out.copy(char.group.position);
      out.x += lerp(off0.x, off1.x, e); out.y += lerp(off0.y, off1.y, e); out.z += lerp(off0.z, off1.z, e);
    },
    tgt: (e, out) => { char.headWorld(out); out.add(lookOff); },
  };
}

// ---------- polyline path ----------
function makePath(points) {
  const segs = []; let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    segs.push({ a, b, len, start: total, yaw }); total += len;
  }
  return {
    total,
    at(s, out) {
      let seg = segs[segs.length - 1];
      for (const sg of segs) { if (s <= sg.start + sg.len) { seg = sg; break; } }
      const k = seg.len > 0 ? clamp((s - seg.start) / seg.len, 0, 1) : 1;
      out.lerpVectors(seg.a, seg.b, k);
      return seg.yaw;
    },
    endYaw: segs.length ? segs[segs.length - 1].yaw : 0,
  };
}

// ============================================================
export class Director {
  constructor(ctx) {
    this.ctx = ctx;               // {hero, keeper, world, rig, audio, ui, onEnd}
    this.token = 0;
    this.active = new Set();
    this.running = false;
    this._adv = false; this._sayReady = false;
    this._p = new THREE.Vector3(); this._h1 = new THREE.Vector3(); this._h2 = new THREE.Vector3();
  }

  // ---------- action plumbing ----------
  _act(updater, cancel) {
    return new Promise((resolve) => {
      const a = { cancel, resolve, update: null };
      a.update = (dt) => {
        let done = false;
        try { done = updater(dt); } catch (e) { console.error(e); done = true; }
        if (done) { this.active.delete(a); resolve(); }
      };
      this.active.add(a);
    });
  }
  wait(s) { let t = 0; return this._act((dt) => { t += dt; return t >= s; }); }

  stop() {
    this.token++;
    this.running = false;
    for (const a of this.active) { if (a.cancel) { try { a.cancel(); } catch (e) {} } a.resolve(); }
    this.active.clear();
    this._adv = false; this._sayReady = false;
  }
  update(dt) {
    if (!this.running || dt <= 0) return;
    for (const a of [...this.active]) a.update(dt);
  }
  advance() { if (this._sayReady) { this._adv = true; this._sayReady = false; } }

  // ---------- blocking helpers ----------
  walk(char, points, vmax = 1.35) {
    const path = makePath(points);
    let s = 0, v = 0;
    char.selfDrive = false;
    return this._act((dt) => {
      const remaining = path.total - s;
      const vAllow = Math.min(vmax, Math.sqrt(2 * 2.6 * Math.max(0.001, remaining)));
      v = Math.min(v + 2.4 * dt, vAllow);
      s += v * dt;
      if (s >= path.total) {
        path.at(path.total, this._p);
        char.group.position.set(this._p.x, 0, this._p.z);
        char.setMotion(0, path.endYaw);
        return true;
      }
      const yaw = path.at(s, this._p);
      char.group.position.set(this._p.x, 0, this._p.z);
      char.setMotion(v, yaw);
      return false;
    }, () => char.setMotion(0, char.targetYaw));
  }
  turn(char, yaw) {
    char.setMotion(0, yaw);
    return this._act(() => {
      let d = (yaw - char.yaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
      return Math.abs(d) < 0.04;
    }, () => {});
  }
  door(door, target, dur) {
    const from = door.t; let t = 0;
    const { audio } = this.ctx;
    if (target > from) audio.doorOpen(); else if (target < from) { /* close sound at end */ }
    return this._act((dt) => {
      t += dt;
      const k = easeIO(clamp(t / dur, 0, 1));
      door.set(lerp(from, target, k));
      if (t >= dur) { door.set(target); if (target < from) audio.doorClose(); return true; }
      return false;
    }, () => {});
  }
  say(who, text, o = {}) {
    const { hero, keeper, ui, audio } = this.ctx;
    const sp = who === 'hero' ? hero : keeper;
    const li = who === 'hero' ? keeper : hero;
    sp.setExpression(o.expr || 'neutral');
    li.setExpression(o.liExpr || 'neutral');
    sp.headWorld(this._h1); li.headWorld(this._h2);
    sp.lookAt(this._h2); li.lookAt(this._h1);
    if (o.clip) sp.playClip(o.clip);
    if (o.liClip) li.playClip(o.liClip);
    sp.setTalking(true);
    ui.subtitle(who === 'hero' ? 'YOUNG MAN' : 'SHOPKEEPER', text);
    ui.advHint(true);
    audio.duck(true);
    if (o.key) audio.playDlg(o.key);
    const dur = o.dur || clamp(text.length / 13.5, 1.8, 6.5) + 0.35;
    let el = 0, finished = false;
    const fin = () => {
      if (finished) return; finished = true;
      sp.setTalking(false); ui.subtitle(null); ui.advHint(false);
      audio.duck(false); audio.stopDlg();
      this._sayReady = false;
    };
    return this._act((dt) => {
      el += dt;
      if (el > 0.45) this._sayReady = true;
      const fileDone = o.key && audio.dlgActive() && audio.dlgFinished();
      if (el >= dur || this._adv || fileDone) { this._adv = false; fin(); return true; }
      return false;
    }, fin);
  }
  shot(def) { this.ctx.rig.setShot(def); }
  async _check(tk) { if (tk !== this.token) throw ABORT; }

  // ============================================================
  start() {
    this.stop();
    const tk = this.token;
    this.running = true;
    this._run(tk).catch((e) => { if (e !== ABORT) console.error(e); });
  }

  async _run(tk) {
    const { hero, keeper, world, ui, audio, rig, onEnd } = this.ctx;
    const W = world.spots;
    const H = () => hero.headWorld(this._h1);
    const K = () => keeper.headWorld(this._h2);
    const step = async (p) => { await p; await this._check(tk); };

    keeper.setLoop('wipe'); keeper.setExpression('warm');
    hero.setExpression('neutral'); hero.setLoop('idle');

    // ================= SCENE 1 — THE STREET =================
    ui.scene('SCENE 1 — THE STREET');
    audio.setInterior(false);

    // Shot A — crane establishing
    this.shot(dolly(V(-36, 18, 6), V(-24, 7.5, 4.6), V(-6, 2.5, -7.5), V(-1, 2.2, -7.5), { dur: 6.6, fov: 48, fov1: 44, shake: 0.5 }));
    const locBeat = (async () => { await this.wait(0.9); ui.location(true); await this.wait(4.2); ui.location(false); })();
    await step(Promise.all([
      this.walk(hero, [W.heroStart, V(-17.4, 0, -6.4)], 1.35),
      locBeat,
    ]));

    // Shot B — front three-quarter tracking
    this.shot(track(hero, V(2.4, 1.5, -1.6), V(2.2, 1.52, -1.55), { dur: 5.6, fov: 40 }));
    hero.playClip('lookAround', 3.0);
    await step(this.walk(hero, [hero.group.position.clone(), V(-10.6, 0, -6.4)], 1.35));

    // Shot C — close-up; he notices the hiring poster
    this.shot(track(hero, V(1.3, EYE_Y + 0.02, 0.55), V(1.22, EYE_Y, 0.5), { dur: 5.0, fov: 30, shake: 0.55 }));
    const glance = (async () => {
      await this.wait(1.1);
      hero.lookAt(W.poster);
      await this.wait(1.15);
      hero.setExpression('disappointed'); hero.playClip('sigh');
      await this.wait(1.6);
      hero.setExpression('neutral'); hero.lookAt(null);
    })();
    await step(Promise.all([
      this.walk(hero, [hero.group.position.clone(), V(-4.9, 0, -6.4)], 1.2),
      glance,
    ]));

    // Shot D — wide reveal of the market (aim routed clear of the door pier)
    const doorPt = V(2.2, 1.5, -8.5), doorWp = V(2.2, 1.6, -7.2);
    this.shot({
      dur: 5.9, fov: 42, fov1: 40, ease: easeIO, cut: true, shake: 0.6,
      pos: (e, out) => out.lerpVectors(V(-2, 2.0, 4.8), V(3.2, 1.9, 4.2), e),
      tgt: (e, out) => {
        H();
        const k = clamp((e - 0.45) / 0.55, 0, 1);
        if (k < 0.6) out.lerpVectors(this._h1, doorWp, k / 0.6);
        else out.lerpVectors(doorWp, doorPt, (k - 0.6) / 0.4);
      },
    });
    await step(this.walk(hero, [hero.group.position.clone(), W.doorFront], 1.35));

    // Shot E — over-shoulder at the glass door
    this.shot(hold(V(3.9, 1.75, -5.6), W.doorLook, { dur: 6.0, fov: 38, shake: 0.7 }));
    ui.scene('SCENE 2 — THE MARKET');
    await step(this.turn(hero, Math.PI));            // face the door (−z)
    hero.playClip('reach');
    await step(this.wait(0.55));
    const doorOpen = this.door(world.doors.entry, 1, 0.9);
    audio.chime();
    await step(this.walk(hero, [W.doorFront, W.doorIn], 1.0));
    audio.setInterior(true);
    const doorClose = this.door(world.doors.entry, 0, 0.8);
    await step(Promise.all([doorOpen, doorClose, this.wait(0.2)]));

    // ================= SCENE 3 — BREAD & EGGS =================
    ui.scene('SCENE 3 — BREAD & EGGS');
    keeper.setLoop('idle'); keeper.setExpression('happy'); keeper.playClip('wave');
    // Shot F — interior wide as he walks to the counter
    this.shot(hold(V(4.9, 2.3, -9.2), V(-2.5, 1.2, -11.2), { dur: 4.6, fov: 50, shake: 0.5 }));
    await step(this.walk(hero, [W.doorIn, V(0.6, 0, -9.5), W.counterHero], 1.3));
    await step(this.turn(hero, Math.PI));
    K(); keeper.lookAt(this._h1.copy(hero.group.position).setY(EYE_Y));

    // line 1 — shopkeeper
    await step(this.say('keeper', 'Hey, how can I help you? What do you need?', { key: 'dlg_01', expr: 'happy', liExpr: 'neutral' }));
    await step(this.wait(0.2));

    // line 2 — hero (OTS from behind the keeper)
    this.shot({
      dur: 4.5, fov: 36, ease: linear, cut: true, shake: 0.6,
      pos: (e, out) => out.lerpVectors(V(-4.5, 1.55, -11.3), V(-4.35, 1.57, -11.15), e),
      tgt: (e, out) => { H(); out.copy(this._h1); },
    });
    await step(this.say('hero', 'Just some bread and eggs.', { key: 'dlg_02', expr: 'smile', liExpr: 'warm' }));
    await step(this.wait(0.2));

    // line 3 — reverse OTS
    this.shot({
      dur: 4.5, fov: 36, ease: linear, cut: true, shake: 0.6,
      pos: (e, out) => out.lerpVectors(V(-2.3, 1.5, -9.0), V(-2.4, 1.52, -9.1), e),
      tgt: (e, out) => { K(); out.copy(this._h2); },
    });
    await step(this.say('keeper', 'Did you get the job?', { key: 'dlg_03', expr: 'concerned', liExpr: 'neutral' }));
    await step(this.wait(0.25));

    // line 4 — hero close-up, disappointed
    this.shot(hold(V(-2.5, EYE_Y + 0.02, -8.75), V(-3.4, EYE_Y - 0.01, -9.5), { dur: 7.2, fov: 32, shake: 0.5 }));
    const beat4 = (async () => {
      await this.wait(1.4);
      hero.setExpression('disappointed'); hero.playClip('shakeHead');
      hero.lookAt(V(-3.4, 0.6, -10.2));
      await this.wait(2.4);
      K(); hero.lookAt(this._h2);
    })();
    await step(Promise.all([
      this.say('hero', "No. The boss is still annoyed with me. I don't even know what I did wrong.", { key: 'dlg_04', expr: 'neutral', liExpr: 'concerned' }),
      beat4,
    ]));
    hero.setExpression('disappointed');
    await step(this.wait(0.3));

    // line 5 — keeper medium, sympathetic shrug
    this.shot(hold(V(-1.2, 1.5, -9.8), V(-3.6, 1.35, -11.8), { dur: 4.0, fov: 40, shake: 0.6 }));
    await step(this.say('keeper', "Well, that's rough.", { key: 'dlg_05', expr: 'concerned', clip: 'shrug', liExpr: 'disappointed' }));
    keeper.playClip('nod');
    await step(this.wait(0.5));

    // — the hand-over: step, pick up, carry back, place on the counter, hero collects —
    this.shot(dolly(V(-1.2, 1.5, -9.8), V(-0.6, 1.6, -10.4), V(-3.6, 1.35, -11.8), V(-3.7, 1.3, -12.0), { dur: 4.6, fov: 42, cut: false, shake: 0.6 }));
    await step(this.turn(keeper, Math.PI));
    keeper.setExpression('neutral');
    await step(this.walk(keeper, [W.keeper, W.keeperPick], 0.8));
    keeper.playClip('pickShelf');
    await step(this.wait(0.75));
    audio.paper();
    keeper.attachHand('R', world.props.groceries, 0, -0.04, 0.05, 0.2);
    await step(this.wait(0.8));
    await step(this.walk(keeper, [W.keeperPick, W.keeperOffer], 0.8));
    await step(this.turn(keeper, 0));
    keeper.setExpression('warm');
    this.shot(hold(V(-1.5, 1.55, -9.6), V(-3.4, 1.28, -10.55), { dur: 6.4, fov: 40, cut: true, shake: 0.6 }));
    keeper.playClip('place');
    await step(this.wait(0.85));
    audio.paper();
    world.props.counterAnchor.add(world.props.groceries);
    world.props.groceries.position.set(0, 0, 0);
    world.props.groceries.rotation.set(0, 0.15, 0);
    await step(this.wait(0.7));
    keeper.setExpression('happy');
    hero.setExpression('smile');
    await step(this.walk(hero, [W.counterHero, W.heroReceive], 0.7));
    hero.playClip('pickup');
    await step(this.wait(0.75));
    audio.paper();
    hero.attachHand('R', world.props.groceries, 0, -0.04, 0.05, -0.2);
    await step(this.wait(0.75));
    hero.attachHand('L', world.props.groceries, 0, -0.03, 0.04, 0.15);
    hero.setLoop('carry');
    hero.playClip('nod');
    await step(this.walk(hero, [W.heroReceive, W.counterHero], 0.7));
    await step(this.turn(hero, Math.PI));
    await step(this.wait(0.4));

    // lines 6 & 7 — two-shot
    this.shot(hold(V(0.6, 1.7, -9.0), V(-3.3, 1.35, -10.6), { dur: 9.0, fov: 44, shake: 0.6 }));
    await step(this.say('hero', 'Can I use the washroom?', { key: 'dlg_06', expr: 'awkward', liExpr: 'warm' }));
    await step(this.wait(0.2));
    await step(this.say('keeper', "Come on, man. You don't have to ask.", { key: 'dlg_07', expr: 'happy', clip: 'chuckle', liExpr: 'smile' }));
    keeper.playClip('point');
    keeper.lookAt(W.washDoorLook);
    await step(this.wait(1.1));
    K(); keeper.lookAt(null);

    // — walk to the washroom, tracked over the shelves —
    this.shot({
      dur: 15.2, fov: 42, ease: linear, cut: true, shake: 0.6,
      pos: (e, out) => {
        const b = clamp((e - 0.30) / 0.30, 0, 1);
        const p = hero.group.position;
        out.set(
          Math.max(p.x + lerp(-0.55, -1.8, b), 1.95),
          lerp(1.95, 2.02, b),
          Math.min(p.z + lerp(1.95, 1.65, b), -8.95)
        );
      },
      tgt: (e, out) => { hero.headWorld(out); },
    });
    await step(this.walk(hero, [W.counterHero, V(1.2, 0, -9.6), V(5.15, 0, -10.6), V(5.15, 0, -15.3), W.washFront], 1.3));
    await step(this.turn(hero, Math.PI));
    hero.lookAt(W.washDoorLook);
    hero.playClip('reach');
    await step(this.wait(0.5));
    const washOpen = this.door(world.doors.washroom, 1, 0.8);
    await step(this.walk(hero, [W.washFront, W.washIn], 0.9));
    hero.lookAt(null);
    const washClose = this.door(world.doors.washroom, 0, 0.9);
    await step(Promise.all([washOpen, washClose]));

    // — hold on the shopkeeper; the city hums; fade —
    ui.scene('SCENE 3 — BREAD & EGGS');
    keeper.setLoop('wipe'); keeper.setExpression('warm');
    this.shot(dolly(V(4.95, 2.0, -9.3), V(4.7, 1.9, -9.6), V(-3.4, 1.35, -11.35), V(-3.4, 1.35, -11.35), { dur: 4.4, fov: 46, cut: true, shake: 0.5 }));
    await step(this.wait(3.6));

    this.running = false;
    onEnd();
  }
}
