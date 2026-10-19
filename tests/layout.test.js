import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { measureLayout, snapToGround, stackOn, checkGrounding, analyzeLayout, serializeLayout } from '../assets/scene-layout.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const cube = () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());

test('measurement refreshes unrendered ancestor transforms and separates local/world origins', () => {
  const ancestor = new THREE.Group(), root = new THREE.Group(), object = cube();
  ancestor.add(root); root.add(object);
  ancestor.position.y = 4; ancestor.scale.y = 2; object.position.y = .5;
  const [entry] = measureLayout(THREE, root);
  close(entry.position.y, .5); close(entry.worldPosition.y, 5); close(entry.box.min.y, 4);
  assert.equal(checkGrounding([entry], { groundY: 4 })[0]?.likelyBug ?? false, false);
});

test('world-space ground correction survives rotated, nonuniformly scaled parents', () => {
  const parent = new THREE.Group(), object = cube();
  parent.rotation.set(.4, .2, .3); parent.scale.set(2, 3, .7); parent.position.set(1, 3, -2);
  parent.add(object); object.position.set(1, 2, 1);
  parent.updateWorldMatrix(true, true);
  const before = object.getWorldPosition(new THREE.Vector3());
  snapToGround(THREE, object, .25);
  const box = new THREE.Box3().setFromObject(object), after = object.getWorldPosition(new THREE.Vector3());
  close(box.min.y, .25); close(after.x, before.x); close(after.z, before.z);
});

test('stacking uses the targets world surface under a different parent', () => {
  const parent = new THREE.Group(), targetParent = new THREE.Group(), object = cube(), target = cube();
  parent.scale.y = 3; parent.rotation.z = .4; parent.add(object);
  targetParent.position.y = 5; targetParent.add(target);
  stackOn(THREE, object, target, .15);
  close(new THREE.Box3().setFromObject(object).min.y, new THREE.Box3().setFromObject(target).max.y + .15);
});

test('ground intent is interpreted in world space under translated parents', () => {
  const root = new THREE.Group(), object = cube();
  root.position.y = -.5; root.add(object);
  const [entry] = measureLayout(THREE, root);
  assert.equal(checkGrounding([entry])[0].placedOnGround, false);
});

test('precise bounds and explicit selection avoid oversized boxes and helper pollution', () => {
  const root = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BufferGeometry());
  mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 2, 0], 3));
  mesh.rotation.z = Math.PI / 4; root.add(mesh, cube());
  const coarse = measureLayout(THREE, root)[0];
  const precise = measureLayout(THREE, root, { precise: true, filter: object => object === mesh });
  assert.equal(precise.length, 1); assert.ok(precise[0].size.y < coarse.size.y);
});

test('serialized reports are JSON-safe and preserve duplicate-name identities', () => {
  const root = new THREE.Group(), a = cube(), b = cube();
  a.name = b.name = 'same'; root.add(a, b);
  const report = JSON.parse(JSON.stringify(serializeLayout(analyzeLayout(THREE, root))));
  assert.equal(report.entries.length, 2); assert.notEqual(report.entries[0].id, report.entries[1].id);
  assert.equal(report.overlaps[0].aId, a.uuid);
});

test('singular parent transforms fail without moving the object', () => {
  const parent = new THREE.Group(), object = cube(); parent.add(object); parent.scale.x = 0;
  const before = object.position.clone();
  assert.throws(() => snapToGround(THREE, object), /non-invertible/); assert.ok(object.position.equals(before));
});
