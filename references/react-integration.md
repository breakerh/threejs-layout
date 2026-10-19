# React Three Fiber and imported assets

Use this with the placement guide when a scene is managed by React or contains imported/animated models. It is not a requirement to add React to a plain Three.js scene.

- Wait for the relevant Suspense/asset state and actual scene entities before measuring. DOM HUD readiness does not prove the model exists.
- Use `precise: true` when a rotated model's loose bounds or a current deformation matters. Update animation/skeleton world transforms first; verify the installed Three.js implementation for skinned/instanced bounds. Bounds cannot prove a person rests on a mattress rather than an invisible wrapper.
- Select semantic entities with `filter`. Direct-child lights, debug helpers and broad building groups can pollute an otherwise useful report. Hidden descendants are not automatically excluded by Box3.
- Do not mount one cached GLTF scene twice. Use suitable clones; skinned models need independent skeleton bindings. Clone resources you intend to recolour, and dispose only resources the component owns.
- Static merged geometry is a snapshot: material/appearance changes must update or rebuild the baked colour/geometry. React keys alone cannot fix a cache unless its dependencies and ownership are correct.
- A demand frame loop needs invalidation after visual changes and while active animation continues. Do not turn the layout inspector into a production animation or per-snapshot React render loop.
- Create the DOM inspector in an effect, return `dispose()`, and scope any debug globals to the owner. Strict Mode effect replay should not accumulate panels or destroy shared assets. The inspector takes one snapshot; refresh on an explicit geometry/pose revision.
- Test actual raycasts and pointer propagation after batching or adding water/transparent overlays. A good AABB report does not prove an interaction still selects the right object.

Official references: [Box3](https://threejs.org/docs/pages/Box3.html), [Object3D](https://threejs.org/docs/pages/Object3D.html), [R3F scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance). Match the documentation to installed package versions.
