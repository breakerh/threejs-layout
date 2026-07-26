---
name: threejs-layout
description: Place and verify objects in any Three.js scene using measured bounding boxes instead of guessed coordinates. Use this skill whenever positioning, assembling, or combining 3D objects in Three.js — writing or editing position.set / rotation values, composing a model from parts, laying out a scene, or porting placement code — and whenever objects overlap, clip into each other, float above the ground, sink into the floor, or sit at wrong distances. Provides drop-in scripts that render orthographic top/front/side diagrams from the real scene graph plus a classified report of collisions and ground-contact errors, and a guide to anchors, clearances, and deriving coordinates rather than guessing them.
---

# Three.js layout & placement

Positioning by typing literal coordinates and checking them in a perspective
view does not work: perspective hides depth errors, and a coordinate is really a
consequence of an object's anchor, its actual size, and its neighbour's surface —
none of which are visible at the call site. The result is the familiar failure
mode of objects that overlap, float, or sit slightly wrong.

This skill replaces guess-and-look with measure-and-check: orthographic top,
front, and side diagrams drawn from real `Box3` measurements of the live scene
graph, plus a report that classifies what it finds.

## Use this when

- Writing or editing `position.set(...)` / `rotation.*` for objects in a scene.
- Composing a model out of parts, or assembling a scene out of models.
- The user reports things overlapping, clipping, floating, sinking, or spaced wrong.
- Before calling any scene-building work finished.

## Read first

**`references/placement-guide.md`** — anchor conventions (and why origin-at-base
is the right default), how to derive coordinates instead of guessing, clearance
values, how to read the three views, which findings matter, and how to fix a
collision without creating the next one. Read it before positioning anything;
most placement bugs are prevented there rather than found by the tool.

## Assets

Both scripts are dependency-free and take your `THREE` namespace as an argument,
so they work with importmaps, bundlers, or CDN builds, at any version.

| File | What it is |
|---|---|
| `assets/scene-layout.js` | Measurement and validation: `measureLayout`, `checkOverlaps`, `checkGrounding`, `analyzeLayout`, plus the placement helpers `snapToGround`, `stackOn`, `clearanceXZ`. No DOM. |
| `assets/layout-inspector.js` | `inspectLayout(THREE, object, opts)` — draws top/front/side views and the report into the page. Imports `scene-layout.js`. |
| `assets/layout-check.html` | Standalone harness for projects that export builder functions. Needs both scripts beside it. |

Copy what you need into the project (next to the scene modules, or a `dev/`
folder). Keep the filenames — the imports between them are relative.

## Two ways to run it

**Drop-in**, when a page already builds the scene — add two lines after the
object exists:

```js
import { inspectLayout } from './layout-inspector.js';
inspectLayout(THREE, scene);   // floating panel; or { mount: someDiv }
```

Pass the object whose **direct children** you want to check: the world group to
check placement between objects, or a single model to inspect its own parts.

**Standalone harness**, when scenes come from exported builder functions — copy
all three files in and open over HTTP (ES modules don't load from `file://`):

```
layout-check.html?module=./house-builder.js&export=buildPiazzaMercato
```

Builders are called as `fn(THREE, opts)`; add `&style=opts` if yours takes only
options, and `&opts={"json":true}` to pass them. For repeat use, define presets
in `layout-check.config.js` next to the harness and open `?scene=<name>`:

```js
export const scenes = {
  piazza: { module: './house-builder.js', export: 'buildPiazzaMercato', opts: {} },
};
export const defaultScene = 'piazza';
```

## Workflow

1. Wire up whichever of the two entry points fits, and serve the project over HTTP.
2. Open the page with a browser tool and read the report. It is text, so read the
   DOM or `window.__layoutReport` — no need to interpret pixels for this part.
3. Screenshot the diagrams. **Top** for spacing, alignment and rotation; **front
   and side** for the height story — the green ground line makes floating and
   sinking obvious. Flagged objects are outlined in dashed red.
4. Fix the source coordinates. Prefer an expression built from named constants
   over a new literal, and use `snapToGround` / `stackOn` to *find* a value, then
   fold the result back into the source.
5. Re-run. Fixing one collision routinely creates the next one, so iterate until
   the report is clean and the diagrams look right.

## Reading the report

Findings are classified, because a raw overlap count is meaningless on a composed
model — most parts of a building are supposed to touch.

- **colliding** — objects that genuinely interpenetrate, or whose footprints only
  partly intrude. Nearly always the real bug; fix these first.
- **stacked** / **concentric** / **nested** — meeting at a face, sharing a column,
  or one inside the other: a crate on a table, a liner in a basin, a recess in a
  wall. Expected; scan once for surprises.
- **floating / sunken, marked likely bug** — `position.y` says ground level but
  the geometry doesn't touch the ground. Real bug.
- **floating, not marked** — deliberately elevated, or geometry carrying a baked
  `translate` offset. Normally fine.

Two caveats worth remembering: boxes are axis-aligned, so a rotated object's box
is a slightly loose envelope — small overlaps there mean "check", not "broken".
And on a single composed model (a figure, a building) ignore the overlap list
entirely; read the views for silhouette, proportion, and symmetry instead.
