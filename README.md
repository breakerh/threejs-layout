# Three.js Layout

Measure, visualize, and verify object placement in Three.js scenes without
guessing coordinates.

This repository contains an agent skill and a small, dependency-free inspection
toolkit. It uses real world-space `THREE.Box3` bounds to expose collisions,
ground-contact errors, spacing problems, and misleading object anchors.

## Why use it?

Perspective views make many layout mistakes hard to see. An object can look
correct while it clips into a neighbour, floats just above the floor, or is
half-buried because its geometry is centred around its origin.

Three.js Layout replaces guess-and-check placement with:

- orthographic top, front, and side diagrams;
- measured world-space bounds for direct children of a scene or group;
- classified overlap findings;
- grounding checks for floating and sunken objects;
- helpers for snapping, stacking, and measuring horizontal clearance;
- practical guidance for anchors, clearances, and derived coordinates.

## Repository contents

| Path | Purpose |
|---|---|
| [`SKILL.md`](SKILL.md) | Agent instructions and the recommended inspection workflow |
| [`references/placement-guide.md`](references/placement-guide.md) | Placement reasoning, anchor conventions, clearances, and debugging guidance |
| [`assets/scene-layout.js`](assets/scene-layout.js) | DOM-free measurement, validation, and placement helpers |
| [`assets/layout-inspector.js`](assets/layout-inspector.js) | Browser-based diagrams and a readable findings report |
| [`assets/layout-check.html`](assets/layout-check.html) | Standalone harness for exported scene-builder functions |

## Install the skill

For agents that support the shared skills directory:

```bash
git clone https://github.com/breakerh/threejs-layout.git ~/.agents/skills/threejs-layout
```

Clone the repository into your agent's skills directory. For Claude Code:

```bash
git clone https://github.com/breakerh/threejs-layout.git ~/.claude/skills/threejs-layout
```

Restart the agent if it does not discover new skills automatically. The skill
should trigger when a task involves positioning or assembling Three.js objects,
or diagnosing overlap, clipping, floating, sinking, and spacing problems.

## Quick start

Copy `scene-layout.js` and `layout-inspector.js` into your project, keeping them
next to each other because the inspector uses a relative import.

Call the inspector after the scene or group has been built:

```js
import { inspectLayout } from './layout-inspector.js';

const result = inspectLayout(THREE, scene);
```

By default, this adds a floating panel containing top, front, and side diagrams
plus a text report. To render it inside an existing element:

```js
inspectLayout(THREE, scene, {
  mount: document.querySelector('#layout-report'),
  groundY: 0,
  unit: 'm',
});
```

Pass the object whose **direct children** represent the items you want to
compare. Use a world group to inspect placement between independent objects, or
a single model to inspect its silhouette and proportions.

## Standalone harness

Copy all three files from `assets/` next to a module that exports a Three.js
builder. Serve the directory over HTTP; ES module imports will not work through
`file://`.

Open:

```text
layout-check.html?module=./house-builder.js&export=buildHouse
```

The harness calls builders as `fn(THREE, opts)`. If a builder accepts only an
options object, add `&style=opts`. JSON options can be passed with `&opts=...`.

For reusable scenes, create `layout-check.config.js` beside the harness:

```js
export const scenes = {
  house: {
    module: './house-builder.js',
    export: 'buildHouse',
    opts: { furnished: true },
  },
};

export const defaultScene = 'house';
```

Then open:

```text
layout-check.html?scene=house
```

The harness exposes structured results as `window.__layoutReport`, which makes
the report easy to read from browser automation or tests.

> The standalone HTML harness imports Three.js 0.184.0 from unpkg by default.
> Change its import map if the inspected project needs another version or a
> local build. The JavaScript inspection modules themselves do not import
> Three.js; they use the `THREE` namespace supplied by the caller.

## Recommended workflow

1. Read the [placement guide](references/placement-guide.md).
2. Build the scene and inspect the relevant scene or group.
3. Use the top view for spacing, alignment, and rotation.
4. Use the front and side views for height and ground contact.
5. Fix source coordinates using named constants and derived expressions.
6. Re-run the inspection until the report and diagrams are clean.

The red dashed outlines identify likely problems. Treat findings classified as
`colliding` and grounding findings marked `likelyBug` as the first things to
investigate.

## API overview

### Measurement and validation

```js
import {
  measureLayout,
  checkOverlaps,
  checkGrounding,
  analyzeLayout,
} from './scene-layout.js';
```

| Function | Description |
|---|---|
| `measureLayout(THREE, root, opts)` | Measures the world-space bounds of every direct child |
| `checkOverlaps(entries, opts)` | Classifies sibling intersections |
| `checkGrounding(entries, opts)` | Finds floating and sunken objects |
| `analyzeLayout(THREE, root, opts)` | Runs measurement and both checks at once |

### Placement helpers

```js
import {
  clearanceXZ,
  snapToGround,
  stackOn,
} from './scene-layout.js';
```

| Function | Description |
|---|---|
| `clearanceXZ(a, b)` | Returns horizontal clearance; a negative value means intrusion |
| `snapToGround(THREE, object, groundY)` | Moves an object so its lowest point meets the ground |
| `stackOn(THREE, object, target, gap)` | Places an object on top of another object |

Use placement helpers to determine the correct value during development, then
fold the result back into the source. Leaving measurement-based mutations in the
build path can make layout depend on evaluation order.

## Understanding findings

- **colliding**: objects genuinely interpenetrate or partially intrude;
- **stacked**: objects meet at a face, such as a crate resting on a table;
- **concentric**: one footprint sits inside another in the same column;
- **nested**: one object is contained inside another;
- **floating / sunken with `likelyBug`**: intended ground-level placement does
  not match the measured geometry.

Composed models naturally contain intersecting parts, so their overlap list is
often noisy. For a model, prioritize silhouette, proportion, symmetry, and
ground contact. For a world or room, collision and clearance findings are much
more meaningful.

## Limitations

- Bounds are axis-aligned, so rotated objects receive a slightly loose envelope.
- Checks operate on direct children of the inspected root.
- Geometry modified with `geometry.translate(...)` can make `position.y`
  misleading; the measured diagrams remain authoritative.
- The tools diagnose layout but do not replace visual review of the rendered
  scene.

## Transforms, precise bounds and automation

Measurements refresh ancestor transforms, retain the original local `position`, and additionally expose `worldPosition` and object UUID `id`. Ground height and helper corrections are in **world space**. `snapToGround` and `stackOn` convert the correction through the parent's transform, including rotated/nonuniformly scaled parents; a singular parent is rejected instead of silently moving the object incorrectly.

```js
const report = analyzeLayout(THREE, root, {
  precise: true,
  filter: child => child.userData.layoutEntity === true,
});
const data = serializeLayout(report); // JSON-safe; no live Object3D references
```

Import `serializeLayout` from `scene-layout.js`. `precise` uses Three.js's precise vertex measurement when supported by the object's type. It costs more and still does not establish triangle-level collision, walkability, support contact or cavity boundaries. The filter selects direct children; hidden descendants remain part of Three.js bounds. Skeleton/animation matrices and instance bounds must reflect the pose being inspected.

Classification and grounding are heuristics. `nested`, `concentric` or a low `likelyBug` score do not prove an intersection or elevation is intended. Use identity (`id`, `aId`, `bId`) when objects have duplicate names. `clearanceXZ` is a signed axis clearance between AABBs, not an exact Euclidean distance between meshes.

## React Three Fiber lifecycle

Run the inspector after an entity/asset is ready and clean up its panel on unmount or diagnostic refresh:

```jsx
useEffect(() => {
  if (!ref.current) return;
  const inspector = inspectLayout(THREE, ref.current, { precise: true });
  const report = inspector.toJSON();
  window.__layoutReport = report;
  return () => {
    inspector.dispose();
    if (window.__layoutReport === report) delete window.__layoutReport;
  };
}, [assetReady, diagnosticRevision]);
```

`dispose()` removes only the inspector's panel; it does not dispose the scene's shared geometries, materials or textures. React owns its scene objects: use inspection helpers to derive source transforms rather than mutating R3F-owned objects during render. Reinspect when the relevant pose/geometry revision changes, not on every simulation snapshot. Read [the React/asset integration notes](references/react-integration.md).

## Tests

```sh
npm ci
npm test
```

The runtime modules still receive `THREE` from the caller and have no package dependency. The pinned Three.js development dependency exercises ancestor updates, rotated/scaled placement, different-parent stacking, world grounding, precise selection, JSON serialization and singular-transform failures.
