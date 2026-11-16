# Battle Zone — Foundation (Phase 1: Movement & Camera)

src/config.js            all tunables (speeds, camera, input)
src/core/                math, fixed-timestep Loop
src/input/               InputState (device-agnostic), TouchControls (dynamic stick, multi-touch), KeyboardMouse (dev), stickMath
src/world/               World (AABB collision + raycast, grid-indexed), Level (movement test range)
src/systems/             CharacterController (pure sim), CameraRig (pure camera math)
src/render/              GameRenderer (three.js), Avatar (swap for GLTF later: `root` + `update(state,yaw)`)
tests/                   `npm test` -> import/export check + 19 logic tests (no browser needed)

Serve over HTTP(S) (GitHub Pages works). ES modules + import map: Chrome 89+/Safari 16.4+.
