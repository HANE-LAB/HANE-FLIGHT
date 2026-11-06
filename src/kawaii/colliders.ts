import * as THREE from 'three';

// Collision shapes, after KawaiiPhysics' limits (AnimNode_KawaiiPhysicsCollision.cpp, AdjustBy*Collision).
// Each shape hangs on a bone and is given in that bone's local units; every frame it is placed in the simulation
// space from the bone's animated pose, once, before the substeps (as UpdateSphericalLimits & co. do).

export interface SphereShape { type: 'sphere'; offset: THREE.Vector3; radius: number; inside?: boolean }
export interface CapsuleShape { type: 'capsule'; offset: THREE.Vector3; tail: THREE.Vector3; radius: number }
export interface BoxShape { type: 'box'; offset: THREE.Vector3; rotation: THREE.Quaternion; extent: THREE.Vector3 }
/** a half-space: points are kept on the normal's side */
export interface PlaneShape { type: 'plane'; offset: THREE.Vector3; normal: THREE.Vector3 }
export type ColliderShape = SphereShape | CapsuleShape | BoxShape | PlaneShape;

export interface ColliderDef {
  /** the bone (or any object) it moves with; null: fixed in the simulation space */
  bone: THREE.Object3D | null;
  shape: ColliderShape;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();

/** A collider placed in the simulation space for the current frame. */
export class Collider {
  readonly def: ColliderDef;
  enabled = true;
  /** sphere: centre; capsule: start; plane: a point on it */
  readonly a = new THREE.Vector3();
  /** capsule: end */
  readonly b = new THREE.Vector3();
  /** plane: unit normal; capsule: unit axis or a fallback push direction */
  readonly n = new THREE.Vector3();
  radius = 0;
  /** box: simulation space to the box's own frame and back, and the box's scale */
  readonly toBox = new THREE.Matrix4();
  readonly fromBox = new THREE.Matrix4();
  boxScale = 1;

  constructor(def: ColliderDef) { this.def = def; }

  /** Place it from its bone's current world matrix; simFromWorld takes world space to the simulation space. */
  update(simFromWorld: THREE.Matrix4): void {
    const { bone, shape } = this.def;
    if (bone) _m.multiplyMatrices(simFromWorld, bone.matrixWorld); else _m.identity();
    _m.decompose(_v, _q, _s);
    const scale = (_s.x + _s.y + _s.z) / 3;
    switch (shape.type) {
      case 'sphere':
        this.a.copy(shape.offset).applyMatrix4(_m); this.radius = shape.radius * scale; break;
      case 'capsule':
        this.a.copy(shape.offset).applyMatrix4(_m); this.b.copy(shape.tail).applyMatrix4(_m); this.radius = shape.radius * scale;
        // a push direction for points right on the axis, square to it (CachedFallbackPushDir)
        _w.subVectors(this.b, this.a);
        this.n.set(1, 0, 0); if (Math.abs(_w.normalize().x) > 0.9) this.n.set(0, 1, 0);
        this.n.cross(_w).normalize(); break;
      case 'plane':
        this.a.copy(shape.offset).applyMatrix4(_m); this.n.copy(shape.normal).applyQuaternion(_q).normalize(); break;
      case 'box':
        this.fromBox.compose(shape.offset, shape.rotation, _s.set(1, 1, 1)).premultiply(_m);
        this.toBox.copy(this.fromBox).invert(); this.boxScale = scale; break;
    }
  }
}

/** Push a point of radius r out of the collider (or, for an inside sphere, back into it). */
export function pushOut(c: Collider, p: THREE.Vector3, r: number): void {
  const shape = c.def.shape;
  switch (shape.type) {
    case 'sphere': {
      const d = _v.subVectors(p, c.a), dist = d.length();
      if (!shape.inside) {
        const lim = c.radius + r;
        if (dist < lim && dist > 1e-8) p.copy(c.a).addScaledVector(d, lim / dist);
      } else {
        // a point at least as big as the sphere is pinned to its centre (Max(...,0) in the original)
        const lim = Math.max(c.radius - r, 0);
        if (dist > lim) { if (dist > 1e-8) p.copy(c.a).addScaledVector(d, lim / dist); else p.copy(c.a); }
      }
      return;
    }
    case 'capsule': {
      const ab = _w.subVectors(c.b, c.a), len2 = ab.lengthSq();
      const t = len2 > 0 ? THREE.MathUtils.clamp(_v.subVectors(p, c.a).dot(ab) / len2, 0, 1) : 0;
      const closest = _v.copy(c.a).addScaledVector(ab, t), lim = c.radius + r;
      const d = _w.subVectors(p, closest), dist = d.length();
      if (dist >= lim) return;
      if (dist > 1e-8) p.copy(closest).addScaledVector(d, lim / dist);
      else p.copy(closest).addScaledVector(c.n, lim);
      return;
    }
    case 'plane': {
      // ours: a half-space. The original also catches a point that crossed the plane this step, but lets one that
      // starts deep behind it stay there; for a deck or a floor the half-space is what is meant.
      const s = _v.subVectors(p, c.a).dot(c.n);
      if (s < r) p.addScaledVector(c.n, r - s);
      return;
    }
    case 'box': {
      const e = shape.extent, rl = r / c.boxScale;
      const lp = _v.copy(p).applyMatrix4(c.toBox);
      const cx = THREE.MathUtils.clamp(lp.x, -e.x, e.x), cy = THREE.MathUtils.clamp(lp.y, -e.y, e.y), cz = THREE.MathUtils.clamp(lp.z, -e.z, e.z);
      const dx = lp.x - cx, dy = lp.y - cy, dz = lp.z - cz, dist = Math.hypot(dx, dy, dz);
      if (dist > rl) return;
      if (dist <= 1e-8) {
        // centre inside or on the box: out through the nearest face, by its depth plus the radius
        const px = e.x - Math.abs(lp.x), py = e.y - Math.abs(lp.y), pz = e.z - Math.abs(lp.z);
        if (px <= py && px <= pz) lp.x = Math.sign(lp.x || 1) * (e.x + rl);
        else if (py <= pz) lp.y = Math.sign(lp.y || 1) * (e.y + rl);
        else lp.z = Math.sign(lp.z || 1) * (e.z + rl);
      } else {
        const k = rl / dist; lp.set(cx + dx * k, cy + dy * k, cz + dz * k);
      }
      p.copy(lp).applyMatrix4(c.fromBox);
      return;
    }
  }
}
