# Reasoning about placement in a Three.js scene

Reference for the `threejs-layout` skill. The tooling tells you *what* is wrong;
this is how to think about placement so you produce fewer problems to begin with.

## The core problem

Positioning by typing literals into `position.set(x, y, z)` fails because you are
guessing at a number that is really a *consequence* of three things you can't see
from the call site:

1. Where the object's origin sits inside its own geometry (its anchor).
2. How tall/wide the object actually turned out to be.
3. Where the neighbouring object's surface actually is.

Every "it floats" / "it sinks" / "it clips into the wall" bug is one of these
three being different from what you assumed. So don't guess the number — derive
it, then check it.

## Anchors: know where your object's origin is

A `BoxGeometry(w, h, d)` is centred on its origin. So a 2-unit-tall box placed at
`y = 0` is half-buried: its bottom is at `-1`. To make it rest on the ground you
need `y = h / 2`.

Three anchor conventions are common. Pick one per project and stay with it:

| Convention | Rest on ground | Good for |
|---|---|---|
| Origin at base (feet/footprint centre) | `position.y = 0` | Scene objects placed on a floor: buildings, props, characters |
| Origin at centre | `position.y = height / 2` | Single primitives, physics bodies |
| Origin at a joint/pivot | n/a | Limbs, doors, anything that rotates about a point |

**Origin-at-base is the right default for anything you place in a world.** It
makes `position.set(x, 0, z)` mean exactly "standing here", it makes the ground
check meaningful, and it survives resizing the object.

Watch out for two things that silently break the anchor:

- `geometry.translate(...)` bakes an offset into the vertices. `position.y` then
  no longer tells you where the object is — the diagrams and `Box3` do.
- `ExtrudeGeometry` extrudes along +Z from the XY plane, so it usually needs a
  `rotateX(-PI/2)` plus a translate before it sits where you expect.

## Derive the number, don't guess it

Anywhere you're about to type a literal, there's usually an expression that says
what you actually mean:

```js
// bad: a guess that breaks the moment WALL_H changes
sign.position.set(0, 3.15, 2.53);

// good: says what you mean, stays correct
sign.position.set(0, WALL_H * 0.5, wallFaceZ + 0.02);
```

Name the shared numbers (`WALL_H`, `TABLE_H`, `GROUND_Y`) and build positions out
of them. When a value must be measured rather than computed, measure it:

```js
import { snapToGround, stackOn } from './scene-layout.js';
const dy = stackOn(THREE, lamp, table, 0.001); // returns the correction
```

Use those helpers to *find* the right value during development, then fold the
result back into a literal or an expression. Leaving measurement calls in the
build path makes the scene's layout depend on evaluation order.

## Clearance: too close is a bug too

Zero overlap is not the same as good placement. Decide the minimum clearances
your scene needs and apply them consistently — for a human-scale scene:

- **0.6–0.9** between a person and a thing they use (a counter, a stall).
- **1.2+** for a path people walk along.
- **0.05–0.15** deliberate gap where two built objects meet, so shading and
  shadows read as separate objects rather than one fused mass.

`clearanceXZ(a, b)` in `scene-layout.js` gives you the actual figure. A negative
number means the footprints already intrude on each other.

## Reading the three views

- **Top (X/Z)** — spacing, alignment, and rotation. This is where you see
  footprints clash and where you check that things which should line up on a
  street or a square actually do.
- **Front (X/Y)** and **Side (Z/Y)** — the height story. The ground line makes
  floating and sinking obvious at a glance, and lets you compare heights between
  objects that a top view cannot distinguish at all.

Boxes are drawn from real world-space AABBs, so what you see is what the renderer
will do. An AABB is axis-aligned, though: a rotated object's box is its
*envelope*, slightly larger than the object. Treat small overlaps on rotated
objects as "check it", not "definitely broken".

## Which findings actually matter

The report classifies rather than dumps, because raw overlap counts are useless
on a composed model:

- **colliding** — two objects that genuinely interpenetrate, or whose footprints
  only partly intrude. Almost always a real bug. Fix these first.
- **stacked** — they meet at a face (a crate on a table). **concentric** — one
  footprint sits inside the other, sharing a column (a liner in a basin, a post
  through a cap). **nested** — one is entirely inside the other (a recess in a
  wall). All expected; scan them once for anything surprising.

The distinction between *resting on* and *standing inside* is vertical, not
horizontal: a figure placed inside a stall has a small footprint entirely within
the stall's, but its whole height is swallowed. That is a collision, not a stack —
which is exactly the case a footprint-only check gets wrong.
- **floating / sunken, `likelyBug`** — the object's `position.y` says ground
  level but its geometry doesn't touch the ground. Real bug.
- **floating, not `likelyBug`** — deliberately elevated (a roof, a hanging sign)
  or geometry with a baked offset. Normally fine.

## Fixing an overlap

When two things collide, decide which one is wrong before moving either:

1. Is one of them anchored to something else (a vendor belonging to a stall, a
   sign belonging to a wall)? Move the dependent one.
2. Is the collision caused by *size* rather than position — did the object turn
   out bigger than the space you left it? Then the spacing constant is wrong, not
   the position, and fixing one instance will just move the problem.
3. Re-run the check after each change. Fixing one collision by hand very often
   creates the next one.

## Compositions vs. worlds

Two different jobs, both worth checking:

- **A world** (a square, a street, a room): objects are independent, so
  collisions and ground contact are meaningful signals. Inspect the world group.
- **A composition** (a figure, a building): parts are *supposed* to interpenetrate
  — a window recessed into a wall, a hat on a head. Collisions are noise here.
  Inspect it anyway, but read the views for silhouette, proportion, and symmetry
  rather than reading the overlap list.

For a composition, the useful questions are: is the overall height right, is it
symmetric where it should be, does the silhouette read as the thing it's meant to
be, and do the parts that should touch the ground touch it.
