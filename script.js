// ============================================================
// OPERATION INDIA — script.js
// Engine: renderer, cinematic camera rig, procedural audio +
// recorded-file support, state machine, UI, main loop.
// Stage 2 adds: gameplay state, pointer lock, blend rig modes.
// ============================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWorld } from './world.js';
import { createCharacter, EYE_Y } from './player.js';
import { Director } from './missions.js';
import { PlayerController, GameplayCamera } from './controls.js';

const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp, damp = THREE.MathUtils.damp, lerp = THREE.MathUtils.lerp;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeIOG = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ------------------------------------------------------------
// AUDIO — unchanged from Stage 1
// ------------------------------------------------------------
const AUDIO_FILES = {
  music: 'music_main.mp3', ambStreet: 'amb_street.mp3', ambStore: 'amb_store.mp3',
  stepConcrete: 'step_concrete.mp3', stepTile: 'step_tile.mp3',
  doorOpen: 'door_open.mp3', doorClose: 'door_close.mp3', chime: 'door_chime.mp3', paper: 'paper_hand.mp3',
  dlg_01: 'dlg_01.mp3', dlg_02: 'dlg_02.mp3', dlg_03: 'dlg_03.mp3', dlg_04: 'dlg_04.mp3',
  dlg_05: 'dlg_05.mp3', dlg_06: 'dlg_06.mp3', dlg_07: 'dlg_07.mp3',
};
class AudioManager {
  constructor() {
    this.ctx = null; this.muted = false; this.started = false;
    this.files = {}; this.buffers = {}; this._dlg = null; this._dlgKey = null;
    this.interior = false; this.chordT = 0; this.chordI = 0; this.sparkT = 4; this.hornT = 30;
    this._probeStreams();
  }
  _probeStreams() {
    for (const key of ['music', 'ambStreet', 'ambStore', 'dlg_01', 'dlg_02', 'dlg_03', 'dlg_04', 'dlg_05', 'dlg_06', 'dlg_07']) {
      try {
        const el = new Audio();
        el.preload = 'auto'; el.loop = (key === 'music' || key === 'ambStreet' || key === 'ambStore');
        el.addEventListener('canplaythrough', () => { this.files[key] = el; }, { once: true });
        el.addEventListener('error', () => {}, { once: true });
        el.src = './' + AUDIO_FILES[key];
      } catch (e) {}
    }
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9; this.master.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
      this.ambBus = c.createGain(); this.ambBus.gain.value = 0.9; this.ambBus.connect(this.master);
      this.musicDuck = c.createGain(); this.musicDuck.gain.value = 1;
      this.musicGain = c.createGain(); this.musicGain.gain.value = 0;
      this.musicDuck.connect(this.musicGain); this.musicGain.connect(this.master);
      const len = c.sampleRate * 2;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.brownBuf = c.createBuffer(1, len, c.sampleRate);
      const b = this.brownBuf.getChannelData(0); let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
      for (const key of ['stepConcrete', 'stepTile', 'doorOpen', 'doorClose', 'chime', 'paper']) {
        fetch('./' + AUDIO_FILES[key]).then((r) => { if (!r.ok) throw 0; return r.arrayBuffer(); })
          .then((ab) => c.decodeAudioData(ab)).then((buf) => { this.buffers[key] = buf; }).catch(() => {});
      }
      this._startAmbience(); this._startMusic();
      this.started = true;
    } catch (e) { console.warn('Audio unavailable:', e); }
  }
  _route(el, gainNode) {
    if (!el._src) { try { el._src = this.ctx.createMediaElementSource(el); } catch (e) { return false; } }
    try { el._src.disconnect(); } catch (e) {}
    el._src.connect(gainNode); return true;
  }
  _startAmbience() {
    const c = this.ctx;
    if (this.files.ambStreet && this._route(this.files.ambStreet, this.ambBus)) {
      this.files.ambStreet.volume = 0.5; this.files.ambStreet.play().catch(() => {});
      this.streetGain = null;
    } else {
      const src = c.createBufferSource(); src.buffer = this.brownBuf; src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 340;
      this.streetGain = c.createGain(); this.streetGain.gain.value = 0.05;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
      const lfoG = c.createGain(); lfoG.gain.value = 0.014;
      lfo.connect(lfoG); lfoG.connect(this.streetGain.gain);
      src.connect(lp); lp.connect(this.streetGain); this.streetGain.connect(this.ambBus);
      src.start(); lfo.start();
    }
    if (this.files.ambStore && this._route(this.files.ambStore, this.ambBus)) {
      this.files.ambStore.volume = 0; this.files.ambStore.play().catch(() => {});
      this.storeGain = null;
    } else {
      this.storeGain = c.createGain(); this.storeGain.gain.value = 0;
      const hum = c.createOscillator(); hum.type = 'triangle'; hum.frequency.value = 120;
      const humG = c.createGain(); humG.gain.value = 0.012;
      const fr = c.createBufferSource(); fr.buffer = this.noiseBuf; fr.loop = true;
      const frLp = c.createBiquadFilter(); frLp.type = 'lowpass'; frLp.frequency.value = 190;
      const frG = c.createGain(); frG.gain.value = 0.02;
      hum.connect(humG); humG.connect(this.storeGain);
      fr.connect(frLp); frLp.connect(frG); frG.connect(this.storeGain);
      this.storeGain.connect(this.ambBus);
      hum.start(); fr.start();
    }
  }
  _startMusic() {
    const c = this.ctx;
    if (this.files.music && this._route(this.files.music, this.musicDuck)) {
      this.files.music.volume = 0.55; this.files.music.play().catch(() => {});
      this.musicGain.gain.setTargetAtTime(1, c.currentTime, 1.5);
      this.synthMusic = false; return;
    }
    this.synthMusic = true;
    this.padFilter = c.createBiquadFilter(); this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 720;
    const flfo = c.createOscillator(); flfo.frequency.value = 0.06;
    const flfoG = c.createGain(); flfoG.gain.value = 240;
    flfo.connect(flfoG); flfoG.connect(this.padFilter.frequency); flfo.start();
    this.delay = c.createDelay(1); this.delay.delayTime.value = 0.45;
    const fb = c.createGain(); fb.gain.value = 0.34;
    const wet = c.createGain(); wet.gain.value = 0.25;
    this.delay.connect(fb); fb.connect(this.delay); this.delay.connect(wet); wet.connect(this.musicDuck);
    this.padFilter.connect(this.musicDuck); this.padFilter.connect(this.delay);
    this.musicGain.gain.setTargetAtTime(0.17, c.currentTime, 2.5);
    this.chordT = 99;
  }
  _chord() {
    if (!this.synthMusic || !this.ctx) return;
    const chords = [
      [110.0, 130.81, 164.81], [87.31, 110.0, 130.81],
      [130.81, 164.81, 196.0], [98.0, 123.47, 146.83],
    ];
    const c = this.ctx, t = c.currentTime;
    const notes = chords[this.chordI % 4]; this.chordI++;
    for (const f of notes) {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.055, t + 2.2);
      g.gain.setValueAtTime(0.055, t + 8.0);
      g.gain.linearRampToValueAtTime(0.0001, t + 11.5);
      o.connect(g); g.connect(this.padFilter);
      o.start(t); o.stop(t + 11.6);
      o.onended = () => { o.disconnect(); g.disconnect(); };
    }
  }
  _spark() {
    if (!this.synthMusic || !this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const notes = [440, 523.25, 587.33, 659.25, 783.99];
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = notes[(Math.random() * notes.length) | 0];
    const g = c.createGain();
    g.gain.setValueAtTime(0.028, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    o.connect(g); g.connect(this.delay); g.connect(this.padFilter);
    o.start(t); o.stop(t + 2.9);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  update(dt) {
    if (!this.ctx || !this.started) return;
    this.chordT += dt; this.sparkT += dt; this.hornT -= dt;
    if (this.chordT > 9) { this.chordT = 0; this._chord(); }
    if (this.sparkT > 6 + Math.random() * 4) { this.sparkT = 0; this._spark(); }
    if (this.hornT < 0) { this.hornT = 40 + Math.random() * 40; this._horn(); }
  }
  _env(chain, src, bus, t0, t1) {
    src.connect(chain[0]);
    for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
    chain[chain.length - 1].connect(bus);
    src.start(t0); src.stop(t1);
    src.onended = () => { src.disconnect(); chain.forEach((n) => n.disconnect()); };
  }
  _burst(freq, type, q, gain, dur, bus) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this._env([f, g], s, bus || this.sfx, t, t + dur + 0.05);
  }
  _tone(freq, type, gain, dur, bus, glideTo) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.linearRampToValueAtTime(glideTo, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this._env([g], o, bus || this.sfx, t, t + dur + 0.05);
  }
  _file(key, gain = 0.8) {
    const buf = this.buffers[key];
    if (!buf || !this.ctx) return false;
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = gain;
    this._env([g], s, this.sfx, this.ctx.currentTime, this.ctx.currentTime + buf.duration + 0.05);
    return true;
  }
  step(surface, gain) {
    if (!this.ctx || gain < 0.02) return;
    if (this._file(surface === 'tile' ? 'stepTile' : 'stepConcrete', gain)) return;
    const jitter = 0.9 + Math.random() * 0.2;
    if (surface === 'tile') { this._burst(1300 * jitter, 'bandpass', 1.4, 0.16 * gain, 0.055); this._tone(2000 * jitter, 'sine', 0.02 * gain, 0.02); }
    else { this._burst(650 * jitter, 'bandpass', 1.1, 0.22 * gain, 0.085); this._tone(88 * jitter, 'sine', 0.10 * gain, 0.05); }
  }
  chime() {
    if (this._file('chime', 0.7)) return;
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    [[1318.5, 0], [1760, 0.13]].forEach(([f, dt]) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.linearRampToValueAtTime(0.11, t + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.9);
      this._env([g], o, this.sfx, t + dt, t + dt + 1);
    });
  }
  doorOpen() { if (this._file('doorOpen', 0.7)) return; this._tone(165, 'sawtooth', 0.028, 0.3, null, 112); this._burst(500, 'bandpass', 3, 0.03, 0.22); }
  doorClose() { if (this._file('doorClose', 0.8)) return; this._burst(240, 'lowpass', 1, 0.3, 0.12); this._tone(180, 'sine', 0.12, 0.06); this._tone(1800, 'square', 0.03, 0.03); }
  paper() { if (this._file('paper', 0.7)) return; this._burst(1600, 'highpass', 0.8, 0.09, 0.13); setTimeout(() => this._burst(2000, 'highpass', 0.8, 0.06, 0.1), 140); }
  carPass() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(260, t); f.frequency.linearRampToValueAtTime(950, t + 1.6); f.frequency.linearRampToValueAtTime(240, t + 3.4);
    const g = c.createGain(); const peak = this.interior ? 0.035 : 0.1;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 1.5); g.gain.linearRampToValueAtTime(0.0001, t + 3.4);
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    if (pan) { pan.pan.setValueAtTime(-0.7, t); pan.pan.linearRampToValueAtTime(0.7, t + 3.4); this._env([f, g, pan], s, this.ambBus, t, t + 3.5); }
    else this._env([f, g], s, this.ambBus, t, t + 3.5);
  }
  _horn() {
    if (!this.ctx || this.interior) return;
    const c = this.ctx, t = c.currentTime;
    for (const dt of [0, 0.42]) {
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 370;
      const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 466;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g = c.createGain(); g.gain.setValueAtTime(0.016, t + dt); g.gain.linearRampToValueAtTime(0.0001, t + dt + 0.3);
      o.connect(f); o2.connect(f); this._env([f, g], o, this.ambBus, t + dt, t + dt + 0.32);
      o2.start(t + dt); o2.stop(t + dt + 0.32); o2.onended = () => o2.disconnect();
    }
  }
  setInterior(b) {
    this.interior = b;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.streetGain) this.streetGain.gain.setTargetAtTime(b ? 0.014 : 0.05, t, 0.6);
    if (this.storeGain) this.storeGain.gain.setTargetAtTime(b ? 1 : 0, t, 0.6);
    if (this.files.ambStreet) this.files.ambStreet.volume = b ? 0.14 : 0.5;
    if (this.files.ambStore) this.files.ambStore.volume = b ? 0.5 : 0;
  }
  duck(b) { if (this.ctx) this.musicDuck.gain.setTargetAtTime(b ? 0.35 : 1, this.ctx.currentTime, 0.25); }
  endSting() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    [261.63, 329.63, 392.0, 587.33].forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain(); const dt = i * 0.14;
      g.gain.setValueAtTime(0.05, t + dt); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 2.2);
      this._env([g], o, this.musicDuck, t + dt, t + dt + 2.3);
    });
  }
  playDlg(key) {
    this.stopDlg();
    const el = this.files[key];
    if (!el || !this.ctx) { this._dlg = null; return; }
    if (!this._route(el, this.sfx)) { this._dlg = null; return; }
    el.volume = 1; el.currentTime = 0;
    el.play().then(() => { this._dlg = el; this._dlgKey = key; }).catch(() => { this._dlg = null; });
    this._dlg = el; this._dlgKey = key;
  }
  stopDlg() { if (this._dlg) { try { this._dlg.pause(); this._dlg.currentTime = 0; } catch (e) {} } this._dlg = null; this._dlgKey = null; }
  dlgActive() { return !!this._dlg && !this._dlg.paused; }
  dlgFinished() { if (!this._dlg) return false; const d = this._dlg.duration; return this._dlg.ended || (d > 0 && this._dlg.currentTime >= d - 0.06); }
  setMuted(b) {
    this.muted = b;
    if (this.ctx) this.master.gain.setTargetAtTime(b ? 0 : 0.9, this.ctx.currentTime, 0.06);
  }
  sceneReset() { this.stopDlg(); this.duck(false); this.setInterior(false); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }
}

// ------------------------------------------------------------
// CAMERA RIG — cinematic modes unchanged + gameplay/blend modes
// ------------------------------------------------------------
class CameraRig {
  constructor(camera, colliders) {
    this.camera = camera; this.colliders = colliders;
    this.mode = 'title'; this.shot = null; this.st = 0; this.tt = 0;
    this.pos = new THREE.Vector3(-14, 6, 14); this.tgt = new THREE.Vector3(0, 2, -7);
    this.dp = new THREE.Vector3(); this.dtg = new THREE.Vector3();
    this.dir = new THREE.Vector3(); this.tmp = new THREE.Vector3();
    this.ray = new THREE.Ray(); this.fov = 42; this.cutPending = true;
    this.gp = null; this.gpChar = null; this.gpSnap = true;
    this._gpPos = new THREE.Vector3(); this._gpTgt = new THREE.Vector3();
    this.bt = 0; this.bDur = 1.4;
    this.bFromPos = new THREE.Vector3(); this.bFromTgt = new THREE.Vector3(); this.bFromFov = 42;
  }
  setShot(def) { this.shot = def; this.st = 0; this.mode = def ? 'shot' : 'title'; this.cutPending = def ? def.cut !== false : false; }
  setTitle() { this.shot = null; this.mode = 'title'; this.cutPending = false; }
  beginBlend(gp, char, dur) {
    this.gp = gp; this.gpChar = char;
    this.bFromPos.copy(this.pos); this.bFromTgt.copy(this.tgt); this.bFromFov = this.fov;
    this.bt = 0; this.bDur = dur; this.mode = 'blend'; this.cutPending = false; this.gpSnap = true;
  }
  setGameplay(gp, char) { this.gp = gp; this.gpChar = char; this.mode = 'gameplay'; this.gpSnap = true; }
  _gpUpdate(dt) {
    this.gp.computePose(this.gpChar, dt, this._gpPos, this._gpTgt);
    const fovT = this.gp.fov;
    if (this.mode === 'blend') {
      this.bt += dt;
      const k = easeIOG(clamp(this.bt / this.bDur, 0, 1));
      this.pos.lerpVectors(this.bFromPos, this._gpPos, k);
      this.tgt.lerpVectors(this.bFromTgt, this._gpTgt, k);
      this.fov = this.bFromFov + (fovT - this.bFromFov) * k;
      if (this.bt >= this.bDur) this.mode = 'gameplay';
    } else {
      if (this.gpSnap) { this.pos.copy(this._gpPos); this.tgt.copy(this._gpTgt); this.fov = fovT; this.gpSnap = false; }
      else {
        this.pos.lerp(this._gpPos, 1 - Math.exp(-10 * dt));
        this.tgt.lerp(this._gpTgt, 1 - Math.exp(-12 * dt));
        this.fov = damp(this.fov, fovT, 6, dt);
      }
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.tgt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
  }
  update(dt) {
    if (this.mode === 'blend' || this.mode === 'gameplay') { this._gpUpdate(dt); return; }
    let fovT = 42, shake = 0;
    if (this.mode === 'title') {
      this.tt += dt;
      const a = 0.62 + Math.sin(this.tt * 0.05) * 0.34;
      this.dp.set(Math.sin(a) * 13 - 3, 5.2 + Math.sin(this.tt * 0.15) * 0.4, Math.cos(a) * 10 - 1.5);
      this.dtg.set(-0.5, 2.3, -7.5);
      fovT = 44; shake = 0.25;
    } else if (this.shot) {
      this.st += dt;
      const s = this.shot;
      const e = s.ease(clamp(this.st / s.dur, 0, 1));
      s.pos(e, this.dp); s.tgt(e, this.dtg);
      fovT = lerp(s.fov, s.fov1, e); shake = s.shake;
    }
    this.dir.subVectors(this.dp, this.dtg);
    const len = this.dir.length();
    if (len > 0.001) {
      this.dir.normalize();
      this.ray.set(this.dtg, this.dir);
      let hit = len;
      for (const c of this.colliders) {
        if (!c.enabled || !c.opaque) continue;
        if (this.ray.intersectBox(c.box, this.tmp)) {
          const d = this.tmp.distanceTo(this.dtg);
          if (d < hit) hit = d;
        }
      }
      hit = Math.max(hit - 0.24, 0.65);
      this.dp.copy(this.dtg).addScaledVector(this.dir, Math.min(len, hit));
    }
    this.dp.y = Math.max(this.dp.y, 0.32);
    if (!reducedMotion && shake > 0) {
      const t = this.mode === 'title' ? this.tt : this.st;
      this.dp.x += Math.sin(t * 1.31 + 2) * 0.018 * shake;
      this.dp.y += Math.sin(t * 1.73) * 0.013 * shake;
      this.dp.z += Math.cos(t * 1.09 + 1) * 0.018 * shake;
      this.dtg.x += Math.sin(t * 1.47) * 0.008 * shake;
      this.dtg.y += Math.cos(t * 1.91) * 0.006 * shake;
    }
    if (this.cutPending) {
      this.pos.copy(this.dp); this.tgt.copy(this.dtg); this.fov = fovT; this.cutPending = false;
    } else {
      const lp = 1 - Math.exp(-7 * dt), lt = 1 - Math.exp(-9 * dt);
      this.pos.lerp(this.dp, lp); this.tgt.lerp(this.dtg, lt);
      this.fov = damp(this.fov, fovT, 6, dt);
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.tgt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
  }
}

// ------------------------------------------------------------
// BOOT / STATE
// ------------------------------------------------------------
let renderer, scene, camera, rig, world, audio, director;
let hero, keeper, ped;
let gpCam = null, player = null, pausedFlag = false;
let tutorialTimer = null, toastTimer = null, talkTimer = null;
let state = 'boot';
let rafId = 0, elapsed = 0, lastCursorMove = 0;
const clock = new THREE.Clock();
const ui = {};
let subsOn = true, quality = 'high';
let fadeTimer = null;

function setBodyState(s) {
  document.body.classList.remove('state-boot', 'state-title', 'state-cinematic', 'state-paused', 'state-end', 'state-gameplay');
  document.body.classList.add('state-' + s);
}
function show(el, b) { el.classList.toggle('hidden', !b); }
function fadeTo(alpha, ms) {
  return new Promise((res) => {
    const f = $('fade');
    f.style.transition = `opacity ${ms}ms ease`;
    f.style.opacity = alpha;
    if (fadeTimer) clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => { fadeTimer = null; res(); }, ms + 40);
  });
}
function buildUI() {
  ui.subtitle = (speaker, text) => {
    const w = $('subWrap');
    if (!speaker) { w.classList.remove('show'); return; }
    $('subSpeaker').textContent = speaker;
    $('subText').textContent = text;
    w.classList.add('show');
  };
  ui.scene = (t) => { $('sceneTxt').textContent = t; };
  ui.location = (b) => $('locCard').classList.toggle('show', b);
  ui.advHint = (b) => $('advHint').classList.toggle('show', b);
  ui.interactHint = (label) => {
    const el = $('interactHint');
    if (!label) { el.classList.remove('show'); return; }
    $('interactTxt').textContent = label;
    el.classList.add('show');
  };
  ui.toast = (msg) => {
    const el = $('toast');
    if (!msg) { el.classList.remove('show'); return; }
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastTimer = null; el.classList.remove('show'); }, 2400);
  };
}
function fatal(msg) {
  $('fatalMsg').textContent = msg;
  show($('fatal'), true);
  if (rafId) cancelAnimationFrame(rafId);
}

async function boot() {
  const steps = [
    ['Waking the renderer…', () => {
      renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 500);
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.42;
      pmrem.dispose();
    }],
    ['Pouring concrete, laying brick…', () => { world = buildWorld(scene, renderer); }],
    ['Stocking the market…', () => {}],
    ['Casting the evening…', () => {
      const opts = { colliders: world.colliders, isInside: world.isInside };
      hero = createCharacter({
        ...opts,
        palette: { skin: '#b97f5e', skinDark: '#a56e4e', hair: '#241a14', eye: '#241a12', top: '#d9d4c8', sleeve: '#5a6b46', forearm: '#5a6b46', pants: '#3a4a63', shoe: '#e8e6e0', sole: '#c9c5bc', jacket: '#5a6b46', hood: '#6d7683', hoodIn: '#4a5058' },
        features: { hairStyle: 'short', jacket: true, hood: true },
      });
      keeper = createCharacter({
        ...opts,
        palette: { skin: '#8a5a3c', skinDark: '#7a4e32', hair: '#6e6a63', eye: '#1e1610', top: '#e3d9c2', sleeve: '#e3d9c2', forearm: '#8a5a3c', pants: '#3d3a35', shoe: '#2a2723', sole: '#1e1c1a', apron: '#1f6e4a', apronPocket: '#175539' },
        features: { hairStyle: 'flat', apron: true, glasses: true, mustache: true },
      });
      ped = createCharacter({
        ...opts,
        palette: { skin: '#e0b090', skinDark: '#cf9f7f', hair: '#3a2a1e', eye: '#2a1e14', top: '#c98a2e', sleeve: '#c98a2e', forearm: '#c98a2e', pants: '#2e2e34', shoe: '#4a3628', sole: '#3a2a1e', coat: '#c98a2e', scarf: '#b03a3a' },
        features: { hairStyle: 'bun', coat: true, scarf: true },
      });
      scene.add(hero.group, keeper.group, ped.group);
      hero.teleport(world.spots.heroStart.x, world.spots.heroStart.z, Math.PI / 2);
      keeper.teleport(world.spots.keeper.x, world.spots.keeper.z, 0);
      keeper.setLoop('wipe'); keeper.setExpression('warm');
      ped.teleport(world.spots.pedA.x, world.spots.pedA.z, Math.PI / 2);
      ped.selfDrive = true; ped.setExpression('neutral');
    }],
    ['Rolling cameras…', () => {
      rig = new CameraRig(camera, world.colliders);
      audio = new AudioManager();
      buildUI();
      director = new Director({ hero, keeper, world, rig, audio, ui, onEnd: onCinematicEnd, onGameplay });
      buildGameplay();
      wireAudioHooks();
      wireInput();
    }],
  ];
  for (let i = 0; i < steps.length; i++) {
    $('bootStep').textContent = steps[i][0];
    $('bootBar').style.width = ((i + 1) / steps.length * 100) + '%';
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    steps[i][1]();
  }
  await new Promise((r) => setTimeout(r, 250));
  show($('boot'), false);
  enterTitle(true);
  clock.getDelta();
  loop();
}

// ------------------------------------------------------------
// STAGE 2 — gameplay construction & handoff
// ------------------------------------------------------------
function buildGameplay() {
  gpCam = new GameplayCamera(world.colliders);
  player = new PlayerController(hero, world, gpCam, {
    onJump: () => audio.step(hero.surface(), 0.22),
    onLand: (s) => audio.step(s, 0.5),
    onBoundary: () => ui.toast('You cannot leave the mission area right now.'),
    onInteractHint: (label) => ui.interactHint(label),
    onDoorBlocked: () => ui.toast('Step clear of the doorway first.'),
  });
  world.interactables.push(
    { id: 'entry', kind: 'door', door: world.doors.entry, pos: new THREE.Vector3(2.2, 0, -8.55),
      radius: 1.5, hingeX: 1.72, width: 0.96,
      enabled: () => state === 'gameplay',
      label: () => world.doors.entry.t > 0.5 ? 'Close door' : 'Open door',
      action: (pc) => pc.toggleDoor(world.doors.entry, () => audio.doorOpen(), () => audio.doorClose(), () => audio.chime()) },
    { id: 'washroom', kind: 'door', door: world.doors.washroom, pos: new THREE.Vector3(4.6, 0, -16.5),
      radius: 1.4, hingeX: 4.17, width: 0.86,
      enabled: () => state === 'gameplay',
      label: () => world.doors.washroom.t > 0.5 ? 'Close door' : 'Open door',
      action: (pc) => pc.toggleDoor(world.doors.washroom, () => audio.doorOpen(), () => audio.doorClose(), null) },
    { id: 'keeper', kind: 'talk', pos: world.spots.keeper.clone(), radius: 1.9,
      enabled: () => state === 'gameplay',
      label: () => 'Talk to the shopkeeper',
      action: () => {
        keeper.lookAt(hero.headWorld(new THREE.Vector3()));
        keeper.setExpression('happy'); keeper.playClip('wave');
        ui.toast('The shopkeeper gives you a friendly wave.');
        if (talkTimer) clearTimeout(talkTimer);
        talkTimer = setTimeout(() => { talkTimer = null; keeper.lookAt(null); keeper.setExpression('warm'); }, 2600);
      } },
    { id: 'register', kind: 'inspect', pos: new THREE.Vector3(-4.6, 0, -10.6), radius: 1.3,
      enabled: () => state === 'gameplay',
      label: () => 'Check the register',
      action: () => { hero.playClip('reach'); ui.toast('The register drawer is locked.'); } },
  );
}
function onGameplay() {
  state = 'gameplay'; setBodyState('gameplay'); pausedFlag = false;
  show($('hud'), false); show($('topRight'), true); show($('pause'), false);
  hero.externalCollision = true;
  player.engage();
  rig.beginBlend(gpCam, hero, 1.4);
  show($('veil'), true);
  ui.interactHint(null);
  document.body.classList.remove('cursor-hide');
}
function requestLock() {
  const el = renderer.domElement;
  try {
    const p = el.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { try { el.requestPointerLock(); } catch (e) {} });
  } catch (e) { try { el.requestPointerLock(); } catch (e2) {} }
}
function onLockChange() {
  const locked = document.pointerLockElement === renderer.domElement;
  document.body.classList.toggle('locked', locked && state === 'gameplay');
  if (state !== 'gameplay') { if (locked) document.exitPointerLock(); return; }
  player.setLocked(locked);
  if (locked) {
    show($('veil'), false); show($('pause'), false);
    if (pausedFlag) { pausedFlag = false; audio.resume(); }
    showTutorial();
    document.body.classList.add('cursor-hide');
  } else if (!pausedFlag) {
    pauseGame();
  }
}
function showTutorial() {
  const t = $('tutorial');
  t.classList.add('show');
  if (tutorialTimer) clearTimeout(tutorialTimer);
  tutorialTimer = setTimeout(() => { tutorialTimer = null; t.classList.remove('show'); }, 9000);
}
function gameplayPause() {
  pausedFlag = true;
  show($('pause'), true);
  audio.suspend();
  document.body.classList.remove('cursor-hide', 'locked');
  if (document.pointerLockElement) document.exitPointerLock();
}
function gameplayResume() {
  show($('pause'), false);
  pausedFlag = false;
  audio.resume();
  requestLock();
}

// ------------------------------------------------------------
// ambient life + audio hooks (unchanged)
// ------------------------------------------------------------
let pedState = 'walk', pedTimer = 0, pedDir = 1;
function pedestrianBrain(dt) {
  if (pedState === 'walk') {
    const target = pedDir > 0 ? world.spots.pedB : world.spots.pedA;
    const dx = target.x - ped.group.position.x;
    if (Math.abs(dx) < 0.2) { pedState = 'pause'; pedTimer = 1.2 + Math.random(); ped.setMotion(0, pedDir > 0 ? -Math.PI / 2 : Math.PI / 2); }
    else ped.setMotion(1.05, pedDir > 0 ? Math.PI / 2 : -Math.PI / 2);
  } else {
    pedTimer -= dt;
    if (pedTimer <= 0) { pedDir *= -1; pedState = 'walk'; }
  }
}
function wireAudioHooks() {
  world.hooks.onCarPass = () => audio.carPass();
  const hook = (ch, base) => (foot, surface) => {
    const d = camera.position.distanceTo(ch.group.position);
    const fade = clamp(1 - d / 26, 0, 1);
    audio.step(surface, base * fade);
  };
  hero.onStep = hook(hero, 0.55);
  keeper.onStep = hook(keeper, 0.4);
  ped.onStep = hook(ped, 0.3);
}

// ------------------------------------------------------------
// state machine
// ------------------------------------------------------------
function resetScene() {
  director.stop();
  if (player) player.disengage();
  hero.externalCollision = false;
  pausedFlag = false;
  document.body.classList.remove('locked');
  show($('veil'), false);
  $('tutorial').classList.remove('show');
  ui.interactHint(null); ui.toast(null);
  hero.clearHands(); keeper.clearHands();
  world.props.groceryHome.add(world.props.groceries);
  world.props.groceries.position.set(0, 0, 0);
  world.props.groceries.rotation.set(0, 0.3, 0);
  world.doors.entry.set(0); world.doors.washroom.set(0);
  hero.teleport(world.spots.heroStart.x, world.spots.heroStart.z, Math.PI / 2);
  hero.setLoop('idle'); hero.setExpression('neutral'); hero.setTalking(false); hero.lookAt(null); hero.selfDrive = false;
  keeper.teleport(world.spots.keeper.x, world.spots.keeper.z, 0);
  keeper.setLoop('wipe'); keeper.setExpression('warm'); keeper.setTalking(false); keeper.lookAt(null); keeper.selfDrive = false;
  audio.sceneReset();
  ui.subtitle(null); ui.location(false); ui.advHint(false);
  ui.scene('SCENE 1 — THE STREET');
}
function enterTitle(first = false) {
  state = 'title'; setBodyState('title');
  resetScene();
  rig.setTitle();
  show($('title'), true); show($('hud'), false); show($('end'), false); show($('pause'), false);
  show($('topRight'), true);
  document.body.classList.remove('cursor-hide');
  if (first) fadeTo(0, 1200); else fadeTo(0, 700);
}
async function startCinematic() {
  if (state !== 'title') return;
  audio.init(); audio.resume();
  state = 'cinematic'; setBodyState('cinematic');
  show($('title'), false); show($('hud'), true); show($('topRight'), true);
  await fadeTo(1, 500);
  resetScene();
  director.start();
  lastCursorMove = performance.now();
  fadeTo(0, 1100);
}
function pauseGame() {
  if (state === 'gameplay') { gameplayPause(); return; }
  if (state !== 'cinematic') return;
  state = 'paused'; setBodyState('paused');
  show($('pause'), true);
  audio.suspend();
  document.body.classList.remove('cursor-hide');
}
function resumeGame() {
  if (state === 'gameplay') { gameplayResume(); return; }
  if (state !== 'paused') return;
  state = 'cinematic'; setBodyState('cinematic');
  show($('pause'), false);
  audio.resume();
  lastCursorMove = performance.now();
}
async function replayCinematic() {
  const from = state;
  if (from !== 'paused' && from !== 'end' && !(from === 'gameplay' && pausedFlag)) return;
  show($('pause'), false); show($('end'), false); show($('veil'), false);
  pausedFlag = false;
  if (document.pointerLockElement) document.exitPointerLock();
  state = 'cinematic'; setBodyState('cinematic');
  audio.resume();
  await fadeTo(1, 450);
  resetScene();
  show($('hud'), true);
  director.start();
  lastCursorMove = performance.now();
  fadeTo(0, 900);
}
async function quitToTitle() {
  const from = state;
  if (from !== 'paused' && from !== 'end' && !(from === 'gameplay' && pausedFlag)) return;
  show($('pause'), false); show($('end'), false); show($('veil'), false);
  pausedFlag = false;
  if (document.pointerLockElement) document.exitPointerLock();
  await fadeTo(1, 450);
  audio.resume();
  enterTitle();
}
async function skipCinematic() {
  if (state !== 'cinematic') return;
  await fadeTo(1, 380);
  onCinematicEnd(true);
}
async function onCinematicEnd(skipped = false) {
  director.stop();
  audio.stopDlg(); audio.duck(false);
  ui.subtitle(null); ui.advHint(false); ui.location(false);
  if (!skipped) { audio.endSting(); await fadeTo(1, 1600); }
  state = 'end'; setBodyState('end');
  show($('hud'), false); show($('end'), true); show($('topRight'), true);
  document.body.classList.remove('cursor-hide');
  fadeTo(0, 900);
}

// ------------------------------------------------------------
// input & settings
// ------------------------------------------------------------
function setMuted(b) {
  audio.setMuted(b);
  $('muteBtn').classList.toggle('muted', b);
  $('muteBtn').setAttribute('aria-pressed', String(b));
  $('soundRow').textContent = b ? 'OFF' : 'ON';
  $('soundRow').setAttribute('aria-pressed', String(!b));
}
function setSubs(b) {
  subsOn = b;
  document.body.classList.toggle('subs-off', !b);
  $('subsRow').textContent = b ? 'ON' : 'OFF';
  $('subsRow').setAttribute('aria-pressed', String(b));
}
function setQuality(q) {
  quality = q;
  $('qHigh').classList.toggle('on', q === 'high');
  $('qLow').classList.toggle('on', q === 'low');
  if (!renderer) return;
  renderer.setPixelRatio(q === 'high' ? Math.min(window.devicePixelRatio, 2) : 1);
  const sh = world.sun.shadow;
  sh.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
  if (sh.map) { sh.map.dispose(); sh.map = null; }
  document.body.classList.toggle('fx-grain', q === 'high' && !reducedMotion);
  onResize();
}
function wireInput() {
  $('startBtn').addEventListener('click', startCinematic);
  $('pauseBtn').addEventListener('click', () => {
    if (state === 'gameplay') { pausedFlag ? gameplayResume() : gameplayPause(); return; }
    state === 'cinematic' ? pauseGame() : resumeGame();
  });
  $('resumeBtn').addEventListener('click', resumeGame);
  $('replayBtn').addEventListener('click', replayCinematic);
  $('quitBtn').addEventListener('click', quitToTitle);
  $('skipBtn').addEventListener('click', skipCinematic);
  $('endReplay').addEventListener('click', replayCinematic);
  $('endQuit').addEventListener('click', quitToTitle);
  $('muteBtn').addEventListener('click', () => setMuted(!audio.muted));
  $('soundRow').addEventListener('click', () => setMuted(!audio.muted));
  $('subsRow').addEventListener('click', () => setSubs(!subsOn));
  $('qHigh').addEventListener('click', () => setQuality('high'));
  $('qLow').addEventListener('click', () => setQuality('low'));
  $('reloadBtn').addEventListener('click', () => location.reload());

  // ---- Stage 2: pointer lock + gameplay camera input ----
  $('veil').addEventListener('click', () => { if (state === 'gameplay') requestLock(); });
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', () => { if (state === 'gameplay') show($('veil'), true); });
  window.addEventListener('mousemove', (e) => {
    if (state === 'gameplay' && document.pointerLockElement === renderer.domElement && !pausedFlag) {
      gpCam.onMouse(e.movementX || 0, e.movementY || 0);
    }
  });
  renderer.domElement.addEventListener('wheel', (e) => {
    if (state === 'gameplay') { e.preventDefault(); gpCam.onWheel(e.deltaY); }
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && (state === 'cinematic' || state === 'gameplay')) e.preventDefault();
    if (state === 'boot' || state === 'fatal') return;
    switch (e.code) {
      case 'Enter':
        if (state === 'title') startCinematic();
        else if (state === 'cinematic') director.advance();
        else if (state === 'end') replayCinematic();
        else if (state === 'gameplay' && !document.pointerLockElement && !pausedFlag) requestLock();
        break;
      case 'Space':
        if (state === 'cinematic') director.advance();
        else if (state === 'title') startCinematic();
        break;
      case 'Escape':
        if (state === 'gameplay') {
          if (document.pointerLockElement) { /* browser unlocks; lockchange opens pause */ }
          else if (pausedFlag) gameplayResume();
          else gameplayPause();
        }
        else if (state === 'cinematic') pauseGame();
        else if (state === 'paused') resumeGame();
        break;
      case 'KeyM': setMuted(!audio.muted); break;
      case 'KeyS': if (state === 'cinematic') skipCinematic(); break;
      case 'KeyC': setSubs(!subsOn); break;
    }
  });
  $('game').addEventListener('pointerdown', () => {
    if (state === 'cinematic') director.advance();
  });
  $('game').addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousemove', () => {
    lastCursorMove = performance.now();
    if (state !== 'gameplay') document.body.classList.remove('cursor-hide');
  });
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state === 'cinematic' || state === 'gameplay') pauseGame();
      else audio.suspend();
    } else if (state !== 'paused' && !pausedFlag) audio.resume();
  });
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    fatal('The graphics context was lost. Reload to restart the evening.');
  });
}
function onResize() {
  if (!renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ------------------------------------------------------------
// main loop — one rAF, delta-timed, pause-safe
// ------------------------------------------------------------
function loop() {
  rafId = requestAnimationFrame(loop);
  const raw = Math.min(clock.getDelta(), 0.05);
  const sim = (state === 'paused' || pausedFlag) ? 0 : raw;
  elapsed += sim;

  if (state === 'cinematic') director.update(sim);
  if (state === 'gameplay') player.update(sim);
  hero.update(sim); keeper.update(sim); ped.update(sim);
  pedestrianBrain(sim);
  for (const u of world.updaters) u(sim, elapsed);
  rig.update(state === 'title' ? raw : sim);
  audio.update(raw);

  if (state === 'cinematic' && performance.now() - lastCursorMove > 2500) {
    document.body.classList.add('cursor-hide');
  }
  renderer.render(scene, camera);
}

try {
  boot().catch((e) => { console.error(e); fatal('The projector failed to start: ' + (e && e.message ? e.message : e)); });
} catch (e) {
  fatal('This browser could not start WebGL. Try a recent Chrome, Edge or Firefox with hardware acceleration enabled.');
}
window.addEventListener('error', (e) => { console.error('[OperationIndia]', e.message); });
