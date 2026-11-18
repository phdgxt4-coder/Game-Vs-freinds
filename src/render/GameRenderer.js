import * as THREE from 'three';
import { CONFIG } from '../config.js';

const SHADOW_EXTENT = 38, SHADOW_MAP = 2048, TEXEL = (SHADOW_EXTENT * 2) / SHADOW_MAP;
const snap = (v) => Math.round(v / TEXEL) * TEXEL; // texel-snapped shadow frustum: no shimmering while moving

/** Owns the WebGL renderer, scene, camera and lighting. Everything else talks to it through `scene` and `applyPose`. */
export class GameRenderer {
  constructor(canvas) {
    const C = CONFIG.camera;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfdcf0);
    this.scene.fog = new THREE.Fog(0xbfdcf0, 60, 230);
    this.camera = new THREE.PerspectiveCamera(C.fov, 1, C.near, C.far);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x4a5a3a, 0.9));
    const sun = (this.sun = new THREE.DirectionalLight(0xfff1d6, 0.8));
    sun.castShadow = true; sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -SHADOW_EXTENT; sc.right = sc.top = SHADOW_EXTENT; sc.near = 1; sc.far = 200;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun, sun.target);
    this._resize = () => this.resize();
    window.addEventListener('resize', this._resize);
    window.visualViewport?.addEventListener('resize', this._resize);
    this.resize();
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  applyPose(p) {
    const c = this.camera;
    c.position.set(p.x, p.y, p.z);
    c.rotation.set(p.pitch, p.yaw, p.roll);
    if (Math.abs(c.fov - p.fov) > 0.01) { c.fov = p.fov; c.updateProjectionMatrix(); }
  }
  followSun(x, z) {
    const tx = snap(x), tz = snap(z);
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + 40, 70, tz + 25);
  }
  draw() { this.renderer.render(this.scene, this.camera); }
}
