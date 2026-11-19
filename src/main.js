import { ASSETS } from './assets.js';
import { CONFIG } from './config.js';
import { Loop } from './core/Loop.js';
import { World } from './world/World.js';
import { MeshWorld } from './world/MeshWorld.js';
import { buildTestLevel } from './world/Level.js';
import { CharacterController } from './systems/CharacterController.js';
import { CameraRig } from './systems/CameraRig.js';
import { FootstepSystem } from './systems/FootstepSystem.js';
import { InputState } from './input/InputState.js';
import { TouchControls } from './input/TouchControls.js';
import { KeyboardMouse } from './input/KeyboardMouse.js';
import { GameRenderer } from './render/GameRenderer.js';
import { loadMapVisual } from './render/MapVisual.js';
import { Avatar } from './render/Avatar.js';
import { CharacterModel } from './render/CharacterModel.js';
import { AudioManager } from './audio/AudioManager.js';
import { SOUNDS } from './audio/manifest.js';

const $ = (id) => document.getElementById(id);
const status = (t) => { $('loading').textContent = t; };

/** Returns { world, spawn } for the arena map, or for the movement test range with ?level=test. */
async function loadLevel(renderer) {
  if (new URLSearchParams(location.search).get('level') === 'test') {
    const world = new World(); buildTestLevel(renderer.scene, world);
    return { world, spawn: { x: 0, y: 0, z: 4, yaw: 0 } };
  }
  status('جاري تحميل الساحة…');
  const [data] = await Promise.all([
    fetch(ASSETS.map.collision).then((r) => { if (!r.ok) throw new Error('collision ' + r.status); return r.json(); }),
    loadMapVisual(renderer, ASSETS.map.glb, (e) => e.total && status(`جاري تحميل الساحة… ${Math.round((e.loaded / e.total) * 100)}%`)),
  ]);
  const world = MeshWorld.fromData(data);
  const pads = world.spawns.filter((s) => s.team === 0);
  const pad = pads[Math.floor(Math.random() * pads.length)];
  return { world, spawn: { x: pad.x, y: pad.y, z: pad.z, yaw: Math.PI } }; // team 0 starts at -z facing +z
}

/** Loads the animated character; falls back to the capsule placeholder if the model cannot be loaded. */
async function loadCharacter(scene) {
  try {
    status('جاري تحميل الشخصية…');
    const model = new CharacterModel(await CharacterModel.load(CONFIG.character.model));
    scene.add(model.root);
    return { model, fallback: null };
  } catch (e) {
    console.warn('character model unavailable, using placeholder', e);
    const fallback = new Avatar(); scene.add(fallback.root);
    return { model: null, fallback };
  }
}

/** Audio is created at boot but can only start after a user gesture (iOS needs touchend/click). */
function setupAudio() {
  const audio = new AudioManager(), gestures = ['pointerdown', 'touchend', 'click', 'keydown'];
  let loaded = false;
  const unlock = () => {
    if (!audio.unlock()) return;
    if (!loaded) { loaded = true; audio.load(SOUNDS); }
    if (audio.ctx.state === 'running') gestures.forEach((t) => removeEventListener(t, unlock));
  };
  gestures.forEach((t) => addEventListener(t, unlock, { passive: true }));
  return audio;
}

async function boot() {
  const renderer = new GameRenderer($('game'));
  $('credit').textContent = ASSETS.map.credit;
  const { world, spawn } = await loadLevel(renderer);
  const { model: character, fallback } = await loadCharacter(renderer.scene);
  const audio = setupAudio(), steps = new FootstepSystem();

  const input = new InputState();
  new TouchControls(input, { moveZone: $('moveZone'), lookZone: $('lookZone'), ring: $('ring'), knob: $('knob'), jumpBtn: $('jumpBtn'), crouchBtn: $('crouchBtn') });
  new KeyboardMouse(input, $('game'));
  $('camBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); input.queueCamToggle(); });

  const player = new CharacterController(world, spawn);
  const rig = new CameraRig(world);
  rig.yaw = spawn.yaw;

  const cmd = { moveX: 0, moveY: 0, yaw: 0, sprint: false, jump: false, crouch: false };
  const look = { x: 0, y: 0 }, rs = { x: 0, y: 0, z: 0, eye: 0 };
  const motion = { speed: 0, grounded: true, crouching: false, firing: false, dead: false }, aim = { yaw: 0, pitch: 0 };

  const fixedUpdate = (dt) => {
    cmd.moveX = input.moveX; cmd.moveY = input.moveY; cmd.sprint = input.sprint;
    cmd.yaw = rig.yaw; cmd.jump = input.takeJump(); cmd.crouch = input.takeCrouch();
    player.update(dt, cmd);
    const ev = player.takeEvents();
    if (ev.landImpact > 0) { rig.onLand(ev.landImpact); audio.play('land', { volume: Math.min(1, 0.3 + ev.landImpact / 14) }); }
    if (ev.jumped) audio.play('jump', { volume: 0.5 });
    steps.update(player, (kind, vol) => audio.play(kind, { volume: vol }));
  };

  let frames = 0, acc = 0;
  const render = (alpha, dt) => {
    input.takeLook(look); rig.look(look.x, look.y);
    if (input.takeCamToggle()) rig.toggleMode();
    player.getRenderState(alpha, rs);
    rig.update(dt, rs, player);

    const fps = rig.mode === 'fps';
    motion.speed = player.speed; motion.grounded = player.grounded; motion.crouching = player.crouching;
    aim.yaw = rig.yaw; aim.pitch = rig.pitch;
    if (character) character.update(dt, rs, motion, aim, fps);
    else { fallback.root.visible = !fps; if (!fps) fallback.update(rs, rig.yaw); }

    renderer.applyPose(rig.pose);
    renderer.followSun(rs.x, rs.z);
    renderer.draw();
    frames++; acc += dt;
    if (acc >= 0.5) {
      $('dbg').textContent = `${Math.round(frames / acc)} fps · ${player.speed.toFixed(1)} m/s · ${rig.mode.toUpperCase()}${player.sprinting ? ' · جري' : ''}${player.crouching ? ' · انحناء' : ''}${player.grounded ? '' : ' · في الهوا'}`;
      frames = 0; acc = 0;
    }
  };

  $('loading').style.display = 'none';
  new Loop(fixedUpdate, render).start();
}

boot().catch((e) => { console.error(e); status('تعذر التحميل: ' + e.message); });
