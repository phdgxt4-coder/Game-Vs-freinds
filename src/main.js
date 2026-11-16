import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Loop } from './core/Loop.js';
import { World } from './world/World.js';
import { buildLevel } from './world/Level.js';
import { CharacterController } from './systems/CharacterController.js';
import { CameraRig } from './systems/CameraRig.js';
import { InputState } from './input/InputState.js';
import { TouchControls } from './input/TouchControls.js';
import { KeyboardMouse } from './input/KeyboardMouse.js';
import { GameRenderer } from './render/GameRenderer.js';
import { Avatar } from './render/Avatar.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const loaderEl = $('loader');
const barEl = $('bar');
const statusEl = $('status');

const renderer = new GameRenderer(canvas);
const world = new World();
const input = new InputState();
new TouchControls(input, {
  moveZone: $('moveZone'),
  lookZone: $('lookZone'),
  ring: $('ring'),
  knob: $('knob'),
  jumpBtn: $('jumpBtn'),
  crouchBtn: $('crouchBtn'),
});
new KeyboardMouse(input, canvas);
$('camBtn').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  input.queueCamToggle();
});

const avatar = new Avatar();
renderer.scene.add(avatar.root);

const player = new CharacterController(world, { x: 0, y: 0, z: 8 });
const rig = new CameraRig(world);

const cmd = { moveX: 0, moveY: 0, yaw: 0, sprint: false, jump: false, crouch: false };
const look = { x: 0, y: 0 };
const rs = { x: 0, y: 0, z: 0, eye: 0 };

function setProgress(p, msg) {
  if (barEl) barEl.style.width = `${Math.round(p * 100)}%`;
  if (statusEl) statusEl.textContent = msg;
}

async function boot() {
  const loader = new GLTFLoader();

  setProgress(0.05, 'تحميل الخريطة…');
  let mapScene = null;
  try {
    const mapGltf = await loader.loadAsync('./assets/map.glb');
    mapScene = mapGltf.scene;
    setProgress(0.5, 'تحميل الشخصية…');
  } catch (e) {
    console.warn('Map load failed', e);
    setProgress(0.5, 'الخريطة فشلت — وضع الاختبار');
  }

  try {
    const charGltf = await loader.loadAsync('./assets/android.glb');
    avatar.setModel(charGltf.scene);
    setProgress(0.9, 'تجهيز العالم…');
  } catch (e) {
    console.warn('Character load failed', e);
    setProgress(0.9, 'الشخصية فشلت — كبسولة');
  }

  buildLevel(renderer.scene, world, mapScene);
  // Force atmosphere after map (some exports include dark sky)
  renderer.scene.background = new THREE.Color(0x87a0b8);
  renderer.scene.fog = new THREE.Fog(0x87a0b8, 35, 140);
  setProgress(1, 'جاهز!');

  await new Promise((r) => setTimeout(r, 300));
  if (loaderEl) {
    loaderEl.style.opacity = '0';
    setTimeout(() => (loaderEl.style.display = 'none'), 400);
  }

  let frames = 0,
    acc = 0,
    fps = 0;
  function fixedUpdate(dt) {
    cmd.moveX = input.moveX;
    cmd.moveY = input.moveY;
    cmd.sprint = input.sprint;
    cmd.yaw = rig.yaw;
    cmd.jump = input.takeJump();
    cmd.crouch = input.takeCrouch();
    player.update(dt, cmd);
    const ev = player.takeEvents();
    if (ev.landImpact > 0) rig.onLand(ev.landImpact);
  }

  function render(alpha, dt) {
    input.takeLook(look);
    rig.look(look.x, look.y);
    if (input.takeCamToggle()) rig.toggleMode();
    player.getRenderState(alpha, rs);
    rig.update(dt, rs, player);
    avatar.root.visible = rig.mode === 'tps';
    if (avatar.root.visible) avatar.update(rs, rig.yaw);
    renderer.applyPose(rig.pose);
    renderer.followSun(rs.x, rs.z);
    renderer.draw();

    frames++;
    acc += dt;
    if (acc >= 0.5) {
      fps = Math.round(frames / acc);
      frames = 0;
      acc = 0;
      const mode = rig.mode.toUpperCase();
      const flags = [
        player.sprinting ? 'جري' : '',
        player.crouching ? 'انحناء' : '',
        player.grounded ? '' : 'في الهوا',
      ]
        .filter(Boolean)
        .join(' · ');
      $('dbg').textContent = `${fps} fps · ${player.speed.toFixed(1)} m/s · ${mode}${flags ? ' · ' + flags : ''}`;
    }
  }

  new Loop(fixedUpdate, render).start();
}

boot().catch((e) => {
  console.error(e);
  if (statusEl) statusEl.textContent = 'خطأ في التحميل — أعد المحاولة';
});
