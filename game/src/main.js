// FJORDWING — Application entry point, fixed-timestep loop, UI overlay orchestration & DPR resize.

import { MISSIONS } from './missions.js';
import { FjordRenderer } from './renderer.js';
import { FlightWorld } from './world.js';
import { FlightCamera } from './camera.js';
import { FlightInput } from './input.js';
import { FlightAudio } from './audio.js';
import { drawCollimatedHud, formatMissionTime } from './hud.js';
import { drawGlassCockpit } from './cockpit.js';
import { parseShotParams, applyShotPreset } from './shots.js';

function boot() {
  const glCanvas = document.getElementById('gl-canvas');
  const hudCanvas = document.getElementById('hud-canvas');
  const hudCtx = hudCanvas.getContext('2d');

  const briefingOverlay = document.getElementById('briefing-overlay');
  const pauseOverlay = document.getElementById('pause-overlay');
  const debriefOverlay = document.getElementById('debrief-overlay');
  const missionCardsRoot = document.getElementById('mission-cards');

  const btnLaunch = document.getElementById('btn-launch');
  const btnResume = document.getElementById('btn-resume');
  const btnRestartPause = document.getElementById('btn-restart-pause');
  const btnMenuPause = document.getElementById('btn-menu-pause');
  const btnRetry = document.getElementById('btn-retry');
  const btnDebriefMenu = document.getElementById('btn-debrief-menu');
  const btnYokeToggle = document.getElementById('btn-yoke-toggle');

  const { shot, seed } = parseShotParams();
  const world = new FlightWorld(seed);
  const renderer = new FjordRenderer(glCanvas);
  const camera = new FlightCamera();
  const input = new FlightInput(hudCanvas);
  const audio = new FlightAudio();

  input.onUserGesture = () => audio.unlock();

  // Populate Mission Selector Cards dynamically from MISSIONS config
  function renderMissionCards() {
    missionCardsRoot.innerHTML = '';
    for (const m of MISSIONS) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `mission-card${m.id === world.selectedMissionId ? ' active' : ''}`;
      card.dataset.mission = m.id;
      card.innerHTML = `
        <div class="mission-card-top">
          <span class="mission-code">${m.code}</span>
          <span class="mission-diff">${m.difficulty}</span>
        </div>
        <div class="mission-name">${m.name}</div>
        <div class="mission-sub">${m.subtitle}</div>
        <p class="mission-desc">${m.description}</p>
        <div class="mission-meta">
          <span>FUEL ${m.fuelStart}%</span>
          <span>GATES ${m.rings.length}</span>
        </div>
      `;
      card.addEventListener('click', () => {
        audio.unlock();
        world.loadMission(m.id, 'briefing');
        camera.snap(world);
        renderMissionCards();
      });
      missionCardsRoot.appendChild(card);
    }
  }

  function syncOverlays() {
    briefingOverlay.classList.toggle('hidden', world.phase !== 'briefing');
    pauseOverlay.classList.toggle('hidden', !(world.phase === 'flying' && world.paused));
    debriefOverlay.classList.toggle('hidden', world.phase !== 'debrief');

    if (world.phase === 'debrief' && world.debrief) {
      const d = world.debrief;
      const titleEl = document.getElementById('debrief-title');
      titleEl.textContent = d.title;
      titleEl.className = `debrief-title ${d.success ? 'success' : 'failure'}`;
      document.getElementById('debrief-subtitle').textContent = d.subtitle;
      document.getElementById('stat-time').textContent = formatMissionTime(d.time);
      document.getElementById('stat-gates').textContent = `${d.ringsCleared} / ${d.totalRings}`;
      document.getElementById('stat-fuel').textContent = `${d.fuelRemaining}%`;
      document.getElementById('stat-hull').textContent = `${d.hullRemaining}%`;
      document.getElementById('stat-score').textContent = String(d.score);
    }
  }

  function startSelectedMission(missionId = world.selectedMissionId) {
    audio.unlock();
    world.loadMission(missionId, 'flying');
    camera.setMode(world.cameraMode);
    camera.snap(world);
    syncOverlays();
  }

  btnLaunch.addEventListener('click', () => startSelectedMission());
  btnResume.addEventListener('click', () => {
    world.paused = false;
    syncOverlays();
  });
  btnRestartPause.addEventListener('click', () => startSelectedMission());
  btnMenuPause.addEventListener('click', () => {
    world.loadMission(world.selectedMissionId, 'briefing');
    camera.snap(world);
    renderMissionCards();
    syncOverlays();
  });
  btnRetry.addEventListener('click', () => startSelectedMission());
  btnDebriefMenu.addEventListener('click', () => {
    world.loadMission(world.selectedMissionId, 'briefing');
    camera.snap(world);
    renderMissionCards();
    syncOverlays();
  });
  btnYokeToggle.addEventListener('click', () => {
    const on = input.toggleMouseYoke();
    btnYokeToggle.textContent = on ? 'MOUSE YOKE: ON' : 'MOUSE YOKE: OFF';
    btnYokeToggle.classList.toggle('active', on);
  });

  // Resize WebGL & HUD canvases cleanly for desktop & HiDPI displays
  let cssWidth = window.innerWidth || 1280;
  let cssHeight = window.innerHeight || 720;
  function handleResize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssWidth = window.innerWidth || 1280;
    cssHeight = window.innerHeight || 720;
    renderer.resize(Math.round(cssWidth * dpr), Math.round(cssHeight * dpr));
    hudCanvas.width = Math.round(cssWidth * dpr);
    hudCanvas.height = Math.round(cssHeight * dpr);
    hudCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', handleResize);
  handleResize();

  // Apply deterministic shot preset if requested via URL query
  const isShot = applyShotPreset(world, camera, shot);
  renderMissionCards();
  syncOverlays();

  function drawFrame() {
    renderer.render(world, camera);
    hudCtx.clearRect(0, 0, cssWidth, cssHeight);

    if (world.phase === 'flying') {
      if (camera.mode === 'cockpit') {
        drawGlassCockpit(hudCtx, cssWidth, cssHeight, world, renderer.viewProj);
      } else {
        drawCollimatedHud(hudCtx, cssWidth, cssHeight, world, renderer.viewProj);
      }
    }
  }

  // If deterministic screenshot mode is active, render cleanly and lock pose for reproducible capture
  if (isShot) {
    drawFrame();
    let frames = 0;
    const lockLoop = () => {
      drawFrame();
      frames++;
      if (frames < 12) requestAnimationFrame(lockLoop);
    };
    requestAnimationFrame(lockLoop);
    return;
  }

  // Standard interactive 60fps simulation loop
  let lastTs = performance.now();
  function frame(ts) {
    const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
    lastTs = ts;

    const controls = input.sample(dt);
    for (const act of controls.actions) {
      if (act === 'camera') {
        const mode = world.cycleCamera();
        camera.setMode(mode);
        camera.snap(world);
      } else if (act === 'pause' && world.phase === 'flying') {
        world.paused = !world.paused;
        syncOverlays();
      } else if (act === 'restart' && world.phase !== 'briefing') {
        startSelectedMission();
      } else if (act === 'mute') {
        audio.toggleMute();
      } else if (act === 'yoke') {
        btnYokeToggle.textContent = input.mouseYokeEnabled ? 'MOUSE YOKE: ON' : 'MOUSE YOKE: OFF';
        btnYokeToggle.classList.toggle('active', input.mouseYokeEnabled);
      } else if (act === 'mission_1') {
        startSelectedMission('rally');
      } else if (act === 'mission_2') {
        startSelectedMission('fuelrun');
      } else if (act === 'mission_3') {
        startSelectedMission('ils');
      } else if (act === 'mission_4') {
        startSelectedMission('free');
      }
    }

    const prevPhase = world.phase;
    world.step(controls, dt);
    if (world.phase !== prevPhase) {
      syncOverlays();
    }

    for (const ev of world.events) {
      if (ev.type === 'ring') audio.playRingChime(ev.isFuel);
      else if (ev.type === 'touchdown') audio.playTouchdown();
      else if (ev.type === 'crash') audio.playCrash();
    }

    camera.update(world, dt);
    audio.update(world);
    drawFrame();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

boot();
