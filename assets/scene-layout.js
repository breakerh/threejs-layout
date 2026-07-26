// Layout measurement & validation for any Three.js scene graph.
//
// Zero dependencies: you pass your own THREE namespace in, so this works with
// importmaps, bundlers, CDN builds, any version — nothing here imports 'three'.
//
//   import { measureLayout, checkOverlaps, checkGrounding } from './scene-layout.js';
//   const entries = measureLayout(THREE, myGroup);
//   const overlaps = checkOverlaps(entries);
//   const grounding = checkGrounding(entries);

// ---------------------------------------------------------------- measuring

// World-space AABB of every direct child of `root`. One entry per object you
// actually placed — not per mesh — which is the level you reason about when
// positioning things.
export function measureLayout(THREE, root, { includeUnnamed = true } = {}) {
  root.updateMatrixWorld(true);
  const entries = [];
  root.children.forEach((child, i) => {
    const name = child.name || (includeUnnamed ? `${child.type}#${i}` : null);
    if (!name) return;
    const box = new THREE.Box3().setFromObject(child);
    if (box.isEmpty()) return;
    entries.push({
      name,
      object: child,
      position: child.position.clone(),
      rotationY: child.rotation.y,
      box,
      size: box.getSize(new THREE.Vector3()),
      center: box.getCenter(new THREE.Vector3()),
    });
  });
  return entries;
}

// ---------------------------------------------------------------- overlaps

function intersection(a, b) {
  const x = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const y = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
  const z = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  if (x <= 0 || y <= 0 || z <= 0) return null;
  return { x, y, z, volume: x * y * z };
}

const contains = (outer, inner, eps) =>
  outer.min.x - eps <= inner.min.x && outer.max.x + eps >= inner.max.x &&
  outer.min.y - eps <= inner.min.y && outer.max.y + eps >= inner.max.y &&
  outer.min.z - eps <= inner.min.z && outer.max.z + eps >= inner.max.z;

const containsXZ = (outer, inner, eps) =>
  outer.min.x - eps <= inner.min.x && outer.max.x + eps >= inner.max.x &&
  outer.min.z - eps <= inner.min.z && outer.max.z + eps >= inner.max.z;

// Pairwise AABB intersection between siblings, classified by *why* they most
// likely intersect. Raw overlap alone is a bad signal: composed models are full
// of parts that are supposed to touch. The classification is what makes the
// output readable.
//
//   'nested'      one box sits entirely inside the other — a recess, an inlay,
//                 a detail mesh inside its parent volume. Almost always meant.
//   'concentric'  one footprint sits entirely inside the other, so they share a
//                 column — a liner inside a basin, a post through a cap. Meant.
//   'stacked'     they meet at a face: the vertical intersection is a small
//                 fraction of the shorter object — a crate on a table. Meant.
//   'colliding'   they genuinely interpenetrate, or their footprints only
//                 partly intrude. Two things placed independently that now
//                 clash. Usually the bug.
//
// The vertical test is what separates "resting on" from "standing inside": a
// figure placed inside a stall has a small footprint fully inside the stall's,
// but its whole height is swallowed — that is a collision, not a stack.
export function checkOverlaps(entries, { epsilon = 0.02, stackedVerticalRatio = 0.5 } = {}) {
  const results = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i], b = entries[j];
      const overlap = intersection(a.box, b.box);
      if (!overlap) continue;
      if (overlap.x < epsilon || overlap.y < epsilon || overlap.z < epsilon) continue;

      const sharedFootprint = overlap.x * overlap.z;
      const footprintRatio = sharedFootprint /
        Math.max(Math.min(a.size.x * a.size.z, b.size.x * b.size.z), 1e-9);
      const verticalRatio = overlap.y / Math.max(Math.min(a.size.y, b.size.y), 1e-9);

      let kind;
      if (contains(a.box, b.box, epsilon) || contains(b.box, a.box, epsilon)) kind = 'nested';
      else if (verticalRatio <= stackedVerticalRatio) kind = 'stacked';
      else if (containsXZ(a.box, b.box, epsilon) || containsXZ(b.box, a.box, epsilon)) kind = 'concentric';
      else kind = 'colliding';

      results.push({
        a: a.name,
        b: b.name,
        kind,
        overlap,
        footprintRatio,
        verticalRatio,
        centerDistanceXZ: Math.hypot(a.center.x - b.center.x, a.center.z - b.center.z),
      });
    }
  }
  const rank = { colliding: 0, concentric: 1, stacked: 2, nested: 3 };
  return results.sort((p, q) => rank[p.kind] - rank[q.kind] || q.overlap.volume - p.overlap.volume);
}

// ---------------------------------------------------------------- grounding

// Does each object actually rest where it was placed?
//
// The key signal is the author's own intent: an object whose `position.y` is
// (about) groundY was *meant* to sit on the ground, so any gap between its
// lowest point and the ground is a bug. An object deliberately placed at
// y = 4.75 is supposed to be up in the air — not a finding.
//
// Caveat: geometry baked with .translate() carries an offset that position.y
// doesn't show, so a roof built that way reads as "placed at 0, floating at
// 5.6m". Large gaps are therefore reported as `likelyBug: false` — real
// placement mistakes are almost always small.
export function checkGrounding(entries, { groundY = 0, epsilon = 0.02, likelyBugGap = 0.5 } = {}) {
  const results = [];
  for (const e of entries) {
    const gap = e.box.min.y - groundY;
    if (Math.abs(gap) <= epsilon) continue;
    const placedOnGround = Math.abs(e.position.y - groundY) <= epsilon;
    const status = gap > 0 ? 'floating' : 'sunken';
    results.push({
      name: e.name,
      status,
      gap,
      placedOnGround,
      likelyBug: placedOnGround && (status === 'sunken' || gap <= likelyBugGap),
    });
  }
  return results.sort((p, q) => (q.likelyBug - p.likelyBug) || (Math.abs(q.gap) - Math.abs(p.gap)));
}

// ---------------------------------------------------------------- placement

// Free space between two objects on the ground plane. Negative means their
// footprints already intrude on each other.
export function clearanceXZ(a, b) {
  const x = Math.max(a.box.min.x - b.box.max.x, b.box.min.x - a.box.max.x);
  const z = Math.max(a.box.min.z - b.box.max.z, b.box.min.z - a.box.max.z);
  if (x >= 0 || z >= 0) return Math.max(x, z);
  return Math.max(x, z); // both negative -> overlapping, least-negative axis
}

// Drop an object so its lowest point rests exactly on groundY. Returns the
// correction applied, which is the number you fold back into the source
// literal rather than leaving this call in production code.
export function snapToGround(THREE, object, groundY = 0) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const delta = groundY - box.min.y;
  object.position.y += delta;
  return delta;
}

// Rest an object on top of another, with an optional gap.
export function stackOn(THREE, object, target, gap = 0) {
  object.updateMatrixWorld(true);
  target.updateMatrixWorld(true);
  const objBox = new THREE.Box3().setFromObject(object);
  const targetBox = new THREE.Box3().setFromObject(target);
  const delta = (targetBox.max.y + gap) - objBox.min.y;
  object.position.y += delta;
  return delta;
}

// Everything at once — handy when wiring this into a page or a test.
export function analyzeLayout(THREE, root, opts = {}) {
  const entries = measureLayout(THREE, root, opts);
  return {
    entries,
    overlaps: checkOverlaps(entries, opts),
    grounding: checkGrounding(entries, opts),
  };
}
