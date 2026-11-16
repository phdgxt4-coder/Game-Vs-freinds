import { Loop } from './core/Loop.js';
import { World } from './world/World.js';
import { buildTestLevel } from './world/Level.js';
import { CharacterController } from './systems/CharacterController.js';
import { CameraRig } from './systems/CameraRig.js';
import { InputState } from './input/InputState.js';
import { TouchControls } from './input/TouchControls.js';
import { KeyboardMouse } from './input/KeyboardMouse.js';
import { GameRenderer } from './render/GameRenderer.js';
import { Avatar } from './render/Avatar.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');

const renderer = new GameRenderer(canvas);
const world = new World();
buildTestLevel(renderer.scene, world);

const input = new InputState();
new TouchControls(input, {
  moveZone: $('moveZone'), lookZone: $('lookZone'), ring: $('ring'), knob: $('knob'), jumpBtn: $('jumpBtn'), crouchBtn: $('crouchBtn'),
});
new KeyboardMouse(input, canvas);
$('camBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); input.queueCamToggle(); });

const player = new CharacterController(world, { x: 0, y: 0, z: 4 });
const rig = new CameraRig(world);
const avatar = new Avatar();
renderer.scene.add(avatar.root);

const cmd = { moveX: 0, moveY: 0, yaw: 0, sprint: false, jump: false, crouch: false };
const look = { x: 0, y: 0 };
const rs = { x: 0, y: 0, z: 0, eye: 0 };

function fixedUpdate(dt) {
  cmd.moveX = input.moveX; cmd.moveY = input.moveY; cmd.sprint = input.sprint;
  cmd.yaw = rig.yaw; cmd.jump = input.takeJump(); cmd.crouch = input.takeCrouch();
  player.update(dt, cmd);
  const ev = player.takeEvents();
  if (ev.landImpact > 0) rig.onLand(ev.landImpact);
}

let frames = 0, acc = 0, fps = 0;
function render(alpha, dt) {
  input.takeLook(look); rig.look(look.x, look.y);
  if (input.takeCamToggle()) rig.toggleMode();
  player.getRenderState(alpha, rs);
  rig.update(dt, rs, player);
  avatar.root.visible = rig.mode === 'tps';
  if (avatar.root.visible) avatar.update(rs, rig.yaw);
  renderer.applyPose(rig.pose);
  renderer.followSun(rs.x, rs.z);
  renderer.draw();

  frames++; acc += dt;
  if (acc >= 0.5) {
    fps = Math.round(frames / acc); frames = 0; acc = 0;
    $('dbg').textContent = `${fps} fps · ${player.speed.toFixed(1)} m/s · ${rig.mode.toUpperCase()}${player.sprinting ? ' · جري' : ''}${player.crouching ? ' · انحناء' : ''}${player.grounded ? '' : ' · في الهوا'}`;
  }
}

new Loop(fixedUpdate, render).start();
