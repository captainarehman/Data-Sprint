/* ===================================================================
   DATA SPRINT — main.js
   Sections: utilities, audio engine, orbit engine, sequence control,
   screen switching, init.
   =================================================================== */

(() => {
  'use strict';

  /* ---------------- utilities ---------------- */
  const lerp = (a, b, t) => a + (b - a) * t;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const debounce = (fn, wait) => {
    let id;
    return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), wait); };
  };

  const Easing = {
    linear: (t) => t,
    easeInCubic: (t) => t * t * t,
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  };

  /** Runs update(progress) on every frame for `duration` ms, resolves when done. */
  function tween(duration, update, easing = Easing.linear) {
    return new Promise((resolve) => {
      if (duration <= 0) { update(1, 1); resolve(); return; }
      const start = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        update(easing(t), t);
        if (t < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- audio engine (fully synthesized — no audio files needed) ---------------- */
  const AudioEngine = (() => {
    let ctx = null;
    let master = null;
    let muted = false;

    function ensureCtx() {
      if (!ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        ctx = new Ctx();
        master = ctx.createGain();
        master.gain.value = 0.35;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    // soft, low ambient pad — sits quietly under the orbit screen
    function startAmbient() {
      const c = ensureCtx();
      if (!c) return;
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(master);

      const osc1 = c.createOscillator();
      osc1.type = 'sine'; osc1.frequency.value = 55;
      const osc2 = c.createOscillator();
      osc2.type = 'sine'; osc2.frequency.value = 55 * 1.5;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 380;

      osc1.connect(filter); osc2.connect(filter); filter.connect(g);

      const lfo = c.createOscillator();
      lfo.frequency.value = 0.06;
      const lfoGain = c.createGain();
      lfoGain.gain.value = 0.008;
      lfo.connect(lfoGain); lfoGain.connect(g.gain);

      osc1.start(); osc2.start(); lfo.start();
      g.gain.linearRampToValueAtTime(0.018, c.currentTime + 3);
    }

    function tone({ freq = 440, to = null, duration = 0.4, type = 'sine', gain = 0.22, attack = 0.01, release = 0.16 }) {
      const c = ensureCtx();
      if (!c) return;
      const t0 = c.currentTime;
      const osc = c.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + duration);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + release);
      osc.connect(g); g.connect(master);
      osc.start(t0);
      osc.stop(t0 + duration + release + 0.05);
    }

    function playActivate() { tone({ freq: 220, to: 900, duration: 0.9, type: 'sine', gain: 0.2, release: 0.3 }); }
    function playGlitch() {
      tone({ freq: 900, to: 140, duration: 0.16, type: 'square', gain: 0.08, release: 0.05 });
      setTimeout(() => tone({ freq: 1200, to: 60, duration: 0.1, type: 'sawtooth', gain: 0.05, release: 0.05 }), 55);
    }
    function playChime() {
      tone({ freq: 660, duration: 0.5, type: 'sine', gain: 0.16, release: 0.4 });
      setTimeout(() => tone({ freq: 880, duration: 0.6, type: 'sine', gain: 0.12, release: 0.5 }), 90);
    }

    function toggleMute() {
      const c = ensureCtx();
      muted = !muted;
      if (c) master.gain.linearRampToValueAtTime(muted ? 0 : 0.35, c.currentTime + 0.15);
      return muted;
    }

    function init() {
      // Browsers block audible autoplay before any user gesture — we start
      // as early as the platform allows, then unlock instantly on the
      // first interaction anywhere on the page (which happens naturally
      // when the visitor taps the core button).
      const c = ensureCtx();
      if (c) startAmbient();
      const unlock = () => ensureCtx();
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
    }

    return { init, playActivate, playGlitch, playChime, toggleMute };
  })();

  /* ---------------- DOM ---------------- */
  const appEl = document.getElementById('app');
  const screenOrbitEl = document.getElementById('screen-orbit');
  const screenButtonEl = document.getElementById('screen-button');
  const screenRegisterEl = document.getElementById('screen-register');
  const orbitStageEl = document.querySelector('.orbit-stage');
  const itemEls = Array.from(document.querySelectorAll('.orbit-item'));
  const trailLayerEl = document.getElementById('trail-layer');
  const coreButtonEl = document.getElementById('core-button');
  const dsButtonEl = document.getElementById('datasprint-button');
  const plasmaOverlayEl = document.getElementById('plasma-overlay');
  const muteToggleEl = document.getElementById('mute-toggle');

  const screens = [
    { name: 'orbit', el: screenOrbitEl },
    { name: 'button', el: screenButtonEl },
    { name: 'register', el: screenRegisterEl },
  ];

  function setActiveScreen(name) {
    screens.forEach((s) => s.el.classList.toggle('is-active', s.name === name));
    appEl.dataset.screen = name;
  }

  function setPlasma(radiusPercent) {
    plasmaOverlayEl.style.setProperty('--r', radiusPercent.toFixed(2));
  }

  /* ---------------- orbit engine ---------------- */
  const N = itemEls.length;
  const IDLE_SPEED = REDUCED_MOTION ? 0 : 0.12;   // rad/s, slow ambient drift
  const FAST_SPEED = REDUCED_MOTION ? 0 : 3.2;    // rad/s, during activation
  const DEPTH_RATIO = 0.55;                       // ellipse squash for a subtle 3D orbit feel
  const MAX_GHOSTS = 70;

  const baseAngles = Array.from({ length: N }, (_, i) => -Math.PI / 2 + i * (2 * Math.PI / N));
  const cache = Array.from({ length: N }, () => ({ x: 0, y: 0, scale: 1 }));

  let baseRadiusX = 200;
  let baseRadiusY = baseRadiusX * DEPTH_RATIO;
  let rotationOffset = 0;
  let activeGhostCount = 0;
  let ghostAccumulator = 0;

  const orbit = { speed: IDLE_SPEED, radiusScale: 1, mode: 'running' };
  let trailIntensity = 0;
  let globalOpacity = 1;

  function measureStage() {
    const rect = orbitStageEl.getBoundingClientRect();
    baseRadiusX = (rect.width / 2) * 0.84;
    baseRadiusY = baseRadiusX * DEPTH_RATIO;
  }

  function renderOrbitItems() {
    for (let i = 0; i < N; i++) {
      const angle = baseAngles[i] + rotationOffset;
      const rx = baseRadiusX * orbit.radiusScale;
      const ry = baseRadiusY * orbit.radiusScale;
      const x = Math.cos(angle) * rx;
      const y = Math.sin(angle) * ry;
      const depth = (Math.sin(angle) + 1) / 2; // 0 = far side, 1 = near side
      const scale = lerp(0.72, 1.08, depth);
      const glowPx = lerp(5, 22, trailIntensity);
      const glowA = lerp(0.3, 0.85, trailIntensity);
      const opacity = lerp(0.55, 1, depth) * globalOpacity;

      const el = itemEls[i];
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(3)})`;
      el.style.opacity = opacity.toFixed(3);
      el.style.zIndex = String(Math.round(depth * 100));
      el.style.filter = `drop-shadow(0 0 ${glowPx.toFixed(1)}px rgba(79,215,255,${glowA.toFixed(2)}))`;

      cache[i].x = x; cache[i].y = y; cache[i].scale = scale;
    }
  }

  function spawnGhost(i) {
    if (activeGhostCount >= MAX_GHOSTS) return;
    const item = itemEls[i];
    const img = item.querySelector('img');
    const size = item.offsetWidth * cache[i].scale;

    const ghost = document.createElement('div');
    ghost.className = 'trail-ghost';
    ghost.style.width = size + 'px';
    ghost.style.transform = `translate(calc(-50% + ${cache[i].x.toFixed(1)}px), calc(-50% + ${cache[i].y.toFixed(1)}px))`;
    ghost.style.opacity = Math.min(0.6, trailIntensity).toFixed(2);

    const gImg = document.createElement('img');
    gImg.src = img.src;
    gImg.style.width = size + 'px';
    ghost.appendChild(gImg);

    trailLayerEl.appendChild(ghost);
    activeGhostCount++;
    ghost.addEventListener('animationend', () => { ghost.remove(); activeGhostCount--; });
  }

  function maybeSpawnTrails(dt) {
    if (REDUCED_MOTION || trailIntensity <= 0.02) return;
    ghostAccumulator += dt;
    const interval = lerp(0.1, 0.015, trailIntensity);
    if (ghostAccumulator < interval) return;
    ghostAccumulator = 0;
    for (let i = 0; i < N; i++) {
      if (Math.random() > trailIntensity * 0.9 + 0.1) continue;
      spawnGhost(i);
    }
  }

  let lastFrameTime = performance.now();
  function frameLoop(now) {
    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;
    if (orbit.mode === 'running') {
      rotationOffset += orbit.speed * dt;
      renderOrbitItems();
      maybeSpawnTrails(dt);
    }
    requestAnimationFrame(frameLoop);
  }

  /* ---------------- sequence: orbit → converge → plasma → Data Sprint button ---------------- */
  const TIMING = REDUCED_MOTION
    ? { spinUp: 200, fastHold: 100, converge: 900, plasmaExpand: 350, plasmaHold: 80, plasmaContract: 350 }
    : { spinUp: 900, fastHold: 500, converge: 3400, plasmaExpand: 700, plasmaHold: 150, plasmaContract: 650 };

  let sequenceLocked = false;

  async function runActivationSequence() {
    if (sequenceLocked) return;
    sequenceLocked = true;
    coreButtonEl.disabled = true;
    coreButtonEl.classList.add('is-armed');
    AudioEngine.playActivate();

    if (!REDUCED_MOTION) {
      await tween(TIMING.spinUp, (p) => {
        orbit.speed = lerp(IDLE_SPEED, FAST_SPEED, p);
        trailIntensity = p;
      }, Easing.easeInOutCubic);
      await sleep(TIMING.fastHold);
    }

    await tween(TIMING.converge, (p) => {
      orbit.radiusScale = 1 - Easing.easeInCubic(p);
      trailIntensity = REDUCED_MOTION ? 0 : 1;
      if (p > 0.7) globalOpacity = Math.max(0, 1 - (p - 0.7) / 0.3);
    }, Easing.linear);

    orbit.mode = 'stopped';

    // plasma covers the screen — this is what hides the moment the icons merge
    await tween(TIMING.plasmaExpand, (p) => setPlasma(Easing.easeOutCubic(p) * 150));
    await sleep(TIMING.plasmaHold);

    setActiveScreen('button');

    // plasma withdraws, revealing the Data Sprint button underneath
    await tween(TIMING.plasmaContract, (p) => setPlasma(150 - Easing.easeInCubic(p) * 150));

    sequenceLocked = false;
  }

  async function runRegisterTransition() {
    if (sequenceLocked) return;
    sequenceLocked = true;
    dsButtonEl.disabled = true;
    dsButtonEl.classList.add('is-glitching');
    AudioEngine.playGlitch();
    await sleep(320);
    dsButtonEl.classList.remove('is-glitching');

    await tween(REDUCED_MOTION ? 250 : 480, (p) => setPlasma(Easing.easeInCubic(p) * 150));
    await sleep(100);

    setActiveScreen('register');
    AudioEngine.playChime();

    await tween(REDUCED_MOTION ? 250 : 600, (p) => setPlasma(150 - Easing.easeOutCubic(p) * 150));
    sequenceLocked = false;
  }

  /* ---------------- init ---------------- */
  function bindEvents() {
    coreButtonEl.addEventListener('click', runActivationSequence);
    dsButtonEl.addEventListener('click', runRegisterTransition);
    muteToggleEl.addEventListener('click', () => {
      const isMuted = AudioEngine.toggleMute();
      muteToggleEl.setAttribute('aria-pressed', String(isMuted));
    });
    window.addEventListener('resize', debounce(measureStage, 150));
  }

  function init() {
    measureStage();
    renderOrbitItems();
    requestAnimationFrame(frameLoop);
    bindEvents();
    AudioEngine.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
