import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG } from '../config.js';
import { Locomotion } from '../systems/Locomotion.js';

const C = CONFIG.character;
const WEAPONS = ['Revolver', 'Sniper', 'Revolver_Small', 'Pistol', 'SMG', 'GrenadeLauncher', 'ShortCannon', 'Shotgun', 'Sniper_2', 'RocketLauncher', 'AK', 'Shovel', 'Knife_1', 'Knife_2'];
const FALLBACK = { Walk_Shoot: 'Walk', Run_Shoot: 'Run_Gun', Run_Gun: 'Run', Walk: 'Run', Idle_Shoot: 'Idle' }; // for rigs missing a clip
const cache = new Map();
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), axis = new THREE.Vector3();

/** Rigged, animated character (Quaternius-style rig). Use `CharacterModel.load(url)` once, then `new CharacterModel(template)` per player. */
export class CharacterModel {
  static load(url) {
    if (!cache.has(url)) cache.set(url, new GLTFLoader().loadAsync(url));
    return cache.get(url);
  }
  constructor(gltf, weapon = C.weapon) {
    this.root = new THREE.Group();
    this.model = clone(gltf.scene);
    this.root.add(this.model);
    this.heads = []; this.bones = {};
    this.model.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (WEAPONS.includes(o.name)) o.visible = o.name === weapon;
      if (o.isMesh) {
        o.castShadow = true; o.frustumCulled = false; // skinned bounds are unreliable once animated
        if (/head/i.test(o.name)) this.heads.push(o);
      }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of gltf.animations) this.actions[clip.name.replace('CharacterArmature|', '')] = this.mixer.clipAction(clip);
    this.loco = new Locomotion(); this.current = null;
  }
  _resolve(name) { let n = name; while (n && !this.actions[n]) n = FALLBACK[n]; return n || 'Idle'; }
  _play(spec) {
    const name = this._resolve(spec.clip), next = this.actions[name];
    if (!next) return;
    if (name !== this.current) {
      next.reset().setLoop(spec.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      next.clampWhenFinished = true;
      next.fadeIn(C.fade).play();
      if (this.current) this.actions[this.current].fadeOut(C.fade);
      this.current = name;
    }
    next.setEffectiveTimeScale(spec.timeScale);
  }
  /** Rotates a bone around a world-space axis regardless of its local orientation. */
  _pitchBone(bone, angle, ax) {
    if (!bone || !bone.parent) return;
    bone.parent.getWorldQuaternion(q1);
    q2.setFromAxisAngle(ax, angle);
    bone.quaternion.premultiply(q1.clone().invert().multiply(q2).multiply(q1));
  }
  /**
   * @param m motion {speed, grounded, crouching, firing, dead}; state {x,y,z}; aim {yaw, pitch}; firstPerson hides the head so the camera can sit inside it.
   */
  update(dt, s, m, aim, firstPerson) {
    this.root.position.set(s.x, s.y, s.z);
    this.root.rotation.y = aim.yaw + C.yawOffset;
    this._play(this.loco.update(dt, m));
    this.mixer.update(dt);
    if (!m.dead) {
      this.root.updateMatrixWorld(true);
      axis.set(Math.cos(aim.yaw), 0, -Math.sin(aim.yaw)); // character-right in world space
      for (const [bone, k] of Object.entries(C.aim)) this._pitchBone(this.bones[bone], aim.pitch * k, axis);
    }
    for (const h of this.heads) h.visible = !firstPerson;
  }
}
