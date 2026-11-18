/**
 * Rifle hold definition, shared by the procedural rifle model and the arm IK.
 * Coordinates are metres. Character space: faces -Z, character-right = +X.
 * "socket" is the rifle origin (receiver centre) in the Chest bone's local frame; grips are in rifle space.
 */
export const SPEC = Object.freeze({
  socket: Object.freeze({ body: [0.1, 0.1, -0.28], view: [0.09, 0.23, -0.3] }),
  grips: Object.freeze({ R: [0, -0.1, 0.07], L: [0, -0.045, -0.26] }),
  pole: Object.freeze({ R: [0.5, -1, 0.35], L: [-0.5, -1, 0.35] }), // elbow bend direction in chest space
  handEuler: Object.freeze({ R: [0, 0, 0], L: [1.3, 0, 0.8] }),     // hand orientation relative to the rifle
  viewAnchor: [0, -0.4, 0],                                         // chest joint position in camera space (first-person arms)
});
