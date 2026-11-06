import * as THREE from 'three';
import { evalCurve, type Curve } from './curve.ts';
import { Collider, pushOut, type ColliderDef } from './colliders.ts';

/* =====================================================================
   KAWAII-STYLE SECONDARY MOTION FOR THREE.JS BONES
   The algorithm is KawaiiPhysics' (v1.21.0, MIT, (c) 2019-2026 pafuhana1213, commit feee5fe; see
   THIRD_PARTY_NOTICES.md): AnimNode_KawaiiPhysics.cpp, ...ModifyBones.cpp, ...Simulation.cpp, ...Collision.cpp.
   A node takes the animated pose every frame and lets chains of bones hang from it: Verlet points pulled back
   toward where the animation puts them (stiffness), losing speed (damping), lagging behind the character's own
   movement through the world only as much as world damping allows, pushed out of colliders, then put back at
   their bone lengths. The result is written back as bone rotations, so clips and physics share every frame.
   Departures from the original are marked "ours:".
   ===================================================================== */

export interface PhysicsSettings {
  /** share of the velocity lost per reference frame */
  damping: number;
  /** share of the way back to the animated pose per reference frame */
  stiffness: number;
  /** 1: the character's movement through the world leaves the bones as they were in its own frame; 0: they keep their place in the world */
  worldDampingLocation: number;
  worldDampingRotation: number;
  /** collision radius of each simulated point, in simulation units */
  radius: number;
  /** degrees away from the animated direction; 0 = no limit */
  limitAngle: number;
}
export type PhysicsKey = keyof PhysicsSettings;
export const PHYSICS_KEYS: readonly PhysicsKey[] = ['damping', 'stiffness', 'worldDampingLocation', 'worldDampingRotation', 'radius', 'limitAngle'];
// the original's defaults; radius 3 cm in metres
export const defaultPhysics = (): PhysicsSettings =>
  ({ damping: 0.1, stiffness: 0.05, worldDampingLocation: 0.8, worldDampingRotation: 0.8, radius: 0.03, limitAngle: 0 });

/** XPBD compliance of the bone constraints, as in the original's table (EXPBDComplianceType) */
export type Compliance = 'concrete' | 'wood' | 'leather' | 'tendon' | 'rubber' | 'muscle' | 'fat';
const COMPLIANCE: Record<Compliance, number> = { concrete: 4e-11, wood: 1.6e-10, leather: 1e-9, tendon: 2e-9, rubber: 1e-7, muscle: 2e-5, fat: 1e-4 };

export interface WindSettings {
  /** world direction the wind blows toward */
  direction: THREE.Vector3;
  /** ours: an acceleration (simulation units/s²) rather than the original's per-step velocity of UE's wind sources */
  strength: number;
  /** how far gusts swing the strength, 0..1 */
  gust: number;
}

export interface NodeSettings {
  enabled: boolean;
  /** blend of the result over the animated pose (the AnimNode's Alpha) */
  alpha: number;
  physics: PhysicsSettings;
  /** to change one while running, give a new curve: one edited in place goes unnoticed */
  curves: Partial<Record<PhysicsKey, Curve>>;
  /** acceleration; in world space unless gravityInWorld is false. The original's default is none: stiffness already holds the pose */
  gravity: THREE.Vector3;
  gravityInWorld: boolean;
  /** a displacement per second in the simulation space, outside the velocity (SimpleExternalForce) */
  simpleExternalForce: THREE.Vector3;
  wind: WindSettings;
  /** the rate the damping and stiffness values are meant at (TargetFramerate) */
  referenceFramerate: number;
  /** 'fixed': the original's fixed substeps with an accumulator; 'variable': ours, every frame split into equal steps */
  stepping: 'fixed' | 'variable';
  /** steps per second: the fixed rate, or the most a variable step may be apart */
  substepRate: number;
  maxSubsteps: number;
  /** a jump of the character larger than this in one frame (simulation units, degrees) drops its inertia; 0 = off */
  teleportDistance: number;
  teleportRotation: number;
  /** scales the character's movement before world damping (SkelCompMoveScale) */
  moveScale: THREE.Vector3;
  constraintIterationsBefore: number;
  constraintIterationsAfter: number;
  constraintCompliance: Compliance;
}

const defaultSettings = (): NodeSettings => ({
  enabled: true, alpha: 1, physics: defaultPhysics(), curves: {},
  gravity: new THREE.Vector3(), gravityInWorld: true, simpleExternalForce: new THREE.Vector3(),
  wind: { direction: new THREE.Vector3(1, 0, 0), strength: 0, gust: 0.5 },
  referenceFramerate: 60, stepping: 'fixed', substepRate: 60, maxSubsteps: 4,
  teleportDistance: 3, teleportRotation: 10, moveScale: new THREE.Vector3(1, 1, 1),
  constraintIterationsBefore: 1, constraintIterationsAfter: 1, constraintCompliance: 'leather',
});

export interface ConstraintDef { a: string; b: string; compliance?: Compliance }

export interface KawaiiNodeOptions {
  name?: string;
  /** the simulation space ("component space"): usually the model's root */
  component: THREE.Object3D;
  /** chain roots; each root follows the animation, every bone below it is simulated */
  roots: string[];
  exclude?: string[];
  /** length of the dummy tip added past each leaf bone, by leaf name, in that bone's units (DummyBoneLength) */
  tipLengths?: Record<string, number>;
  dummyBoneLength?: number;
  colliders?: ColliderDef[];
  constraints?: ConstraintDef[];
  warmUpFrames?: number;
  settings?: Partial<Omit<NodeSettings, 'physics' | 'wind'>> & { physics?: Partial<PhysicsSettings>; wind?: Partial<WindSettings> };
}

/** One simulated point: a bone of the chain, or the dummy tip past a leaf. */
export class ModifyBone {
  bone: THREE.Bone | null = null;
  parent = -1;
  children: number[] = [];
  /** dummies: length past the parent along its FORWARD axis, in the parent's units */
  tip = 0;
  lengthFromRoot = 0;
  lengthRate = 0;
  windPhase = 0;
  readonly s: PhysicsSettings = defaultPhysics();
  readonly loc = new THREE.Vector3();
  readonly prevLoc = new THREE.Vector3();
  /** the animated pose in the simulation space: this step's (interpolated in substeps), this frame's, last frame's */
  readonly poseLoc = new THREE.Vector3();
  readonly poseRot = new THREE.Quaternion();
  readonly poseScale = new THREE.Vector3(1, 1, 1);
  readonly curPoseLoc = new THREE.Vector3();
  readonly curPoseRot = new THREE.Quaternion();
  readonly prevPoseLoc = new THREE.Vector3();
  readonly prevPoseRot = new THREE.Quaternion();
  readonly outLoc = new THREE.Vector3();
  readonly outRot = new THREE.Quaternion();
  get dummy(): boolean { return this.bone === null; }
}

interface Constraint { i: number; j: number; length: number; compliance: number; lambda: number }

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _vel = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m3 = new THREE.Matrix3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const sanitize = (n: string) => THREE.PropertyBinding.sanitizeNodeName(n);
/** the bones' axis the dummy tips extend along (BoneForwardAxis): +Y, as Blender's glTF exporter leaves them */
const FORWARD = new THREE.Vector3(0, 1, 0);
/** ours: how often the wind's gusts come (Hz), and how much more of it the tips take than the roots */
const GUST_HZ = 0.35, WIND_BY_LENGTH: Curve = [[0, 0.4], [1, 1]];

export class KawaiiNode {
  readonly name: string;
  readonly component: THREE.Object3D;
  readonly s: NodeSettings;
  readonly bones: ModifyBone[] = [];
  readonly colliders: Collider[];
  /** ms spent in the last update */
  lastCost = 0;
  /** whether the last frame counted as a teleport */
  teleported = false;

  private readonly opts: KawaiiNodeOptions;
  private cons: Constraint[] = [];
  private needsInit = true;
  private wasOff = false;
  private warmUp: number;
  private time = 0;
  private acc = 0;
  private dtOld = 0;
  private consume = 1;
  private readonly simFromWorld = new THREE.Matrix4();
  private readonly worldFromSim = new THREE.Matrix4();
  private readonly compQuat = new THREE.Quaternion();
  private readonly prevCompPos = new THREE.Vector3();
  private readonly prevCompQuat = new THREE.Quaternion();
  private readonly moveVec = new THREE.Vector3();
  private readonly moveRot = new THREE.Quaternion();
  private readonly stepMove = new THREE.Vector3();
  private readonly stepRot = new THREE.Quaternion();
  private readonly gSim = new THREE.Vector3();
  private readonly windSim = new THREE.Vector3();
  /** the values and curves the points' settings were last worked out from */
  private resolved: { physics: PhysicsSettings; curves: NodeSettings['curves'] } | null = null;

  constructor(opts: KawaiiNodeOptions) {
    this.opts = opts;
    this.name = opts.name ?? 'kawaii';
    this.component = opts.component;
    const d = defaultSettings();
    this.s = { ...d, ...opts.settings, physics: { ...d.physics, ...opts.settings?.physics }, wind: { ...d.wind, ...opts.settings?.wind } };
    this.colliders = (opts.colliders ?? []).map(c => new Collider(c));
    this.warmUp = opts.warmUpFrames ?? 0;
  }

  /** Start again from the current pose on the next update (ResetDynamics). */
  reset(): void { this.needsInit = true; }

  /**
   * Simulate one frame. The bones must hold this frame's animated pose (see PoseSnapshot: a three.js mixer leaves a
   * bone alone when its clip value did not change, so last frame's physics would otherwise be read as animation).
   * `current`: the caller has just brought the component's world matrices up to date, so several nodes on one model
   * need not each do it again. Each node leaves the matrices of the bones it turned up to date for the next.
   */
  update(dt: number, current = false): void {
    if (!this.s.enabled) { this.wasOff = true; return; }
    if (this.wasOff) { this.wasOff = false; this.needsInit = true; }
    if (!(dt > 0)) return;
    const t0 = performance.now();
    this.time += dt;
    const C = this.component;
    if (!current) C.updateWorldMatrix(true, true);
    this.worldFromSim.copy(C.matrixWorld);
    this.simFromWorld.copy(C.matrixWorld).invert();
    C.matrixWorld.decompose(_p, this.compQuat, _s);
    if (this.needsInit) this.init(); else this.readPose(false);
    this.resolveSettings();
    for (const c of this.colliders) c.update(this.simFromWorld);
    this.measureMove(dt);
    for (; this.warmUp > 0; this.warmUp--) this.simulate(1 / this.s.referenceFramerate, false);
    this.simulate(dt, !this.teleported);
    this.writePose();
    this.advanceComponent();
    this.lastCost = performance.now() - t0;
  }

  /** Points of every chain in world space, for drawing. */
  worldPoints(out: THREE.Vector3[] = []): THREE.Vector3[] {
    this.bones.forEach((mb, i) => { (out[i] ??= new THREE.Vector3()).copy(mb.loc).applyMatrix4(this.worldFromSim); });
    out.length = this.bones.length;
    return out;
  }

  /* ---------- the chains: InitModifyBones / AddModifyBone / CalcBoneLength ---------- */
  private init(): void {
    const o = this.opts, bones = this.bones, roots: [number, number][] = [];
    bones.length = 0;
    const ex = new Set((o.exclude ?? []).map(sanitize));
    for (const name of o.roots) {
      const root = this.component.getObjectByName(sanitize(name)) as THREE.Bone | undefined;
      if (!root) { console.warn(`kawaii ${this.name}: no bone ${name}`); continue; }
      roots.push([bones.length, 0]);
      this.add(root, ex);
      roots[roots.length - 1][1] = bones.length;
    }
    // ours: three.js works out a bone's Euler rotation again on every write to its quaternion, and these are written
    // several times a frame. Nothing reads the rotation of the bones physics turns, so it is no longer kept up.
    for (const mb of bones) mb.bone?.quaternion._onChange(() => {});
    this.resolved = null;
    this.readPose(true);
    // each point's place along its chain, for the curves, from the first pose
    for (const [first, end] of roots) {
      let total = 0;
      for (let i = first; i < end; i++) {
        const mb = bones[i];
        if (mb.parent < 0) continue;
        const p = bones[mb.parent];
        mb.lengthFromRoot = p.lengthFromRoot + mb.curPoseLoc.distanceTo(p.curPoseLoc);
        total = Math.max(total, mb.lengthFromRoot);
      }
      for (let i = first; i < end; i++) bones[i].lengthRate = total > 0 ? bones[i].lengthFromRoot / total : 0;
    }
    bones.forEach((mb, i) => {
      // a phase per point for the gusts, from where it starts
      const w = mb.bone ? mb.bone.getWorldPosition(_v) : _v.set(i, 0, 0);
      mb.windPhase = (Math.sin(w.x * 12.9898 + w.y * 78.233 + w.z * 37.719) * 43758.5453 % 1) * Math.PI * 2;
    });
    this.initConstraints();
    this.prevCompPos.setFromMatrixPosition(this.component.matrixWorld);
    this.prevCompQuat.copy(this.compQuat);
    this.acc = 0; this.dtOld = 0; this.consume = 1;
    this.needsInit = false;
  }

  private add(bone: THREE.Bone, ex: Set<string>): number {
    if (ex.has(bone.name)) return -1;
    const mb = new ModifyBone();
    mb.bone = bone;
    const idx = this.bones.push(mb) - 1;
    let added = false;
    for (const c of bone.children) {
      if (!(c as THREE.Bone).isBone) continue;
      const ci = this.add(c as THREE.Bone, ex);
      if (ci < 0) continue;
      mb.children.push(ci); this.bones[ci].parent = idx; added = true;
    }
    const o = this.opts, tip = o.tipLengths?.[bone.name] ?? o.tipLengths?.[sanitize(bone.name)] ?? o.dummyBoneLength ?? 0;
    if (!added && tip > 0) {
      const d = new ModifyBone();
      d.tip = tip; d.parent = idx;
      mb.children.push(this.bones.push(d) - 1);
    }
    return idx;
  }

  private initConstraints(): void {
    const o = this.opts, bones = this.bones, find = (n: string) => bones.findIndex(mb => mb.bone?.name === sanitize(n));
    const tipOf = (i: number) => bones[i].children.find(c => bones[c].dummy) ?? -1;
    this.cons = [];
    // rest lengths from the first pose, read just before (InitBoneConstraints runs right after InitModifyBones)
    const add =(i: number, j: number, c?: Compliance) => this.cons.push({ i, j, length: bones[i].loc.distanceTo(bones[j].loc), compliance: COMPLIANCE[c ?? this.s.constraintCompliance], lambda: 0 });
    for (const c of o.constraints ?? []) {
      const i = find(c.a), j = find(c.b);
      if (i < 0 || j < 0) { console.warn(`kawaii ${this.name}: constraint ${c.a}-${c.b} not found`); continue; }
      add(i, j, c.compliance);
      // and their tip dummies when both are leaves (bAutoAddChildDummyBoneConstraint, on by default)
      const ti = tipOf(i), tj = tipOf(j);
      if (ti >= 0 && tj >= 0) add(ti, tj);
    }
  }

  /* ---------- the animated pose in the simulation space: UpdateModifyBonesPoseTransform ---------- */
  private readPose(fresh: boolean): void {
    for (const mb of this.bones) {
      const b = mb.bone, p = this.bones[mb.parent] as ModifyBone | undefined;
      if (b && p?.bone === b.parent) {
        // under a simulated parent: from the parent's pose and its own transform, without taking a matrix apart
        mb.curPoseRot.multiplyQuaternions(p.curPoseRot, b.quaternion);
        mb.curPoseLoc.copy(b.position).multiply(p.poseScale).applyQuaternion(p.curPoseRot).add(p.curPoseLoc);
        mb.poseScale.multiplyVectors(p.poseScale, b.scale);
      } else if (b) {
        _m.multiplyMatrices(this.simFromWorld, b.matrixWorld).decompose(mb.curPoseLoc, mb.curPoseRot, mb.poseScale);
      } else if (p) {
        _v.copy(FORWARD).multiply(p.poseScale).multiplyScalar(mb.tip).applyQuaternion(p.curPoseRot);
        mb.curPoseLoc.copy(p.curPoseLoc).add(_v);
        mb.curPoseRot.copy(p.curPoseRot); mb.poseScale.copy(p.poseScale);
      }
      if (fresh) {
        mb.loc.copy(mb.curPoseLoc); mb.prevLoc.copy(mb.curPoseLoc);
        mb.poseLoc.copy(mb.curPoseLoc); mb.poseRot.copy(mb.curPoseRot);
        mb.prevPoseLoc.copy(mb.curPoseLoc); mb.prevPoseRot.copy(mb.curPoseRot);
      }
    }
  }

  /** UpdatePhysicsSettingsOfModifyBones: the node's values scaled by the curves at each point's place */
  private resolveSettings(): void {
    const P = this.s.physics, cv = this.s.curves, r = this.resolved;
    // ours: only when a value or a curve has changed since (the original redoes it every frame)
    if (r && PHYSICS_KEYS.every(k => r.physics[k] === P[k] && r.curves[k] === cv[k])) return;
    this.resolved = { physics: { ...P }, curves: { ...cv } };
    for (const mb of this.bones) {
      const t = mb.lengthRate;
      mb.s.damping = clamp01(P.damping * evalCurve(cv.damping, t));
      mb.s.stiffness = clamp01(P.stiffness * evalCurve(cv.stiffness, t));
      mb.s.worldDampingLocation = clamp01(P.worldDampingLocation * evalCurve(cv.worldDampingLocation, t));
      mb.s.worldDampingRotation = clamp01(P.worldDampingRotation * evalCurve(cv.worldDampingRotation, t));
      mb.s.radius = Math.max(0, P.radius * evalCurve(cv.radius, t));
      mb.s.limitAngle = Math.max(0, P.limitAngle * evalCurve(cv.limitAngle, t));
    }
  }

  /** UpdateSkelCompMove: where last frame's origin and turn are, seen from this frame's simulation space */
  private measureMove(dt: number): void {
    const s = this.s;
    this.moveVec.copy(this.prevCompPos).applyMatrix4(this.simFromWorld).multiply(s.moveScale);
    this.moveRot.copy(this.compQuat).invert().multiply(this.prevCompQuat);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(this.moveRot.w))) * THREE.MathUtils.RAD2DEG;
    // ours: the thresholds are per reference frame, not per frame, so a quick turn at 30 fps is not taken for a jump
    // that the same turn at 60 fps is not. With fixed steps the movement measured also holds what earlier frames left
    // unused (advanceComponent), so it spans that time as well.
    const span = dt + (s.stepping === 'fixed' ? this.acc : 0), k = Math.max(1e-3, s.referenceFramerate * span);
    this.teleported = (s.teleportDistance > 0 && this.moveVec.length() > s.teleportDistance * k) || (s.teleportRotation > 0 && angle > s.teleportRotation * k);
  }

  /* ---------- SimulateModifyBones: substeps, with the pose and the character's movement shared out over them ---------- */
  private simulate(frameDt: number, follow: boolean): void {
    const s = this.s, bones = this.bones;
    _m3.setFromMatrix4(this.simFromWorld);
    this.gSim.copy(s.gravity); if (s.gravityInWorld) this.gSim.applyMatrix3(_m3);
    this.windSim.copy(s.wind.direction).normalize().multiplyScalar(s.wind.strength).applyMatrix3(_m3);
    let n: number, stepDt: number, moveFrac: number;
    if (s.stepping === 'fixed') {
      const fixed = 1 / s.substepRate, raw = Math.max(this.acc + frameDt, 1e-6);
      this.acc = Math.min(raw, s.maxSubsteps * fixed);   // more than maxSubsteps behind: the rest is dropped
      const dropped = raw - this.acc;
      n = Math.floor(this.acc / fixed + 1e-4);
      this.acc = Math.max(0, this.acc - n * fixed);
      moveFrac = fixed / raw;
      this.consume = clamp01((n * fixed + dropped) / raw);
      stepDt = fixed; this.dtOld = fixed;
    } else {
      // ours: every frame in equal steps no farther apart than 1/substepRate; damping and stiffness scale with the step
      n = Math.max(1, Math.min(s.maxSubsteps, Math.ceil(frameDt * s.substepRate - 1e-4)));
      stepDt = frameDt / n; moveFrac = 1 / n; this.consume = 1;
      if (this.dtOld <= 0) this.dtOld = stepDt;
    }
    const fullMove = _a.copy(this.moveVec), fullRot = _pq.copy(this.moveRot);
    for (let i = 0; i < n; i++) {
      const k = (i + 1) / n;
      for (const mb of bones) { mb.poseLoc.lerpVectors(mb.prevPoseLoc, mb.curPoseLoc, k); mb.poseRot.slerpQuaternions(mb.prevPoseRot, mb.curPoseRot, k); }
      this.stepMove.copy(fullMove).multiplyScalar(follow ? moveFrac : 0);
      this.stepRot.identity().slerp(fullRot, follow ? moveFrac : 0);
      this.step(stepDt);
      this.dtOld = stepDt;
    }
    for (const mb of bones) {
      mb.poseLoc.copy(mb.curPoseLoc); mb.poseRot.copy(mb.curPoseRot);
      mb.prevPoseLoc.copy(mb.curPoseLoc); mb.prevPoseRot.copy(mb.curPoseRot);
    }
  }

  /** SimulateOnce: one step of every chain */
  private step(dt: number): void {
    const s = this.s, bones = this.bones, k = s.referenceFramerate * dt, inv = 1 / Math.max(this.dtOld, 1e-6);
    const wind = s.wind.strength !== 0, gt = 2 * Math.PI * GUST_HZ * this.time;
    // roots are kinematic: they go where the animation puts them
    for (const mb of bones) if (mb.parent < 0) { mb.prevLoc.copy(mb.loc); mb.loc.copy(mb.poseLoc); }
    for (const mb of bones) {
      if (mb.parent < 0) continue;
      const p = bones[mb.parent], ms = mb.s;
      // Verlet velocity, damped (ComputeVerletStepVelocity); ours: damping per reference frame, so per step it scales with k
      _vel.subVectors(mb.loc, mb.prevLoc).multiplyScalar(inv);
      mb.prevLoc.copy(mb.loc);
      _vel.multiplyScalar(Math.pow(1 - ms.damping, k));
      if (wind) {
        const g = 1 + s.wind.gust * (0.6 * Math.sin(gt + mb.windPhase) + 0.4 * Math.sin(2.3 * gt + 1.7 + 1.3 * mb.windPhase));
        _vel.addScaledVector(this.windSim, g * evalCurve(WIND_BY_LENGTH, mb.lengthRate) * dt);
      }
      _vel.addScaledVector(this.gSim, dt);
      mb.loc.addScaledVector(_vel, dt);
      mb.loc.addScaledVector(s.simpleExternalForce, dt);
      // the character's own movement through the world, let through as far as world damping allows. The shift also
      // lands in next step's Verlet velocity, so it pushes like a force of (1 - damping) times the speed per step;
      // ours: scaled by k, so that force per second does not change with the step. Same at k = 1.
      mb.loc.addScaledVector(this.stepMove, (1 - ms.worldDampingLocation) * k);
      _v.copy(mb.prevLoc).applyQuaternion(this.stepRot).sub(mb.prevLoc);
      mb.loc.addScaledVector(_v, (1 - ms.worldDampingRotation) * k);
      // back toward the animated pose, hung from the parent's simulated place (ApplyStiffnessPull). The original raises
      // 1 - stiffness to the power k; ours: k², since a correction of position in a Verlet step is also a change of
      // velocity, so this pull is a spring whose strength per second goes as the step's square. Same at k = 1.
      _v.subVectors(mb.poseLoc, p.poseLoc).add(p.loc).sub(mb.loc);
      mb.loc.addScaledVector(_v, 1 - Math.pow(1 - ms.stiffness, k * k));
    }
    this.solveConstraints(s.constraintIterationsBefore, dt);
    for (const mb of bones) {
      if (mb.parent < 0) continue;
      for (const c of this.colliders) if (c.enabled) pushOut(c, mb.loc, mb.s.radius);
    }
    this.solveConstraints(s.constraintIterationsAfter, dt);
    this.restoreLengthsAndLimits();
  }

  /** AdjustByBoneConstraints, XPBD distance constraints between points of different chains (a skirt's ring) */
  private solveConstraints(iterations: number, dt: number): void {
    if (iterations <= 0 || !this.cons.length) return;
    const bones = this.bones;
    for (const c of this.cons) c.lambda = 0;
    for (let it = 0; it < iterations; it++) for (const c of this.cons) {
      const A = bones[c.i], B = bones[c.j];
      // ours: kinematic roots do not move (the original moves both ends)
      const wa = A.parent < 0 ? 0 : 1, wb = B.parent < 0 ? 0 : 1;
      if (wa + wb === 0) continue;
      const d = _v.subVectors(B.loc, A.loc), len = d.length();
      if (len <= 0) continue;
      const alpha = c.compliance / Math.max(dt * dt, 1e-12), dl = (len - c.length - alpha * c.lambda) / (wa + wb + alpha);
      d.multiplyScalar(dl / len);
      A.loc.addScaledVector(d, wa); B.loc.addScaledVector(d, -wb);
      c.lambda += dl;
    }
  }

  /** RestoreBoneLengthsAndLimits: angle limit, then back at the animated bone length (no planar constraint here) */
  private restoreLengthsAndLimits(): void {
    const bones = this.bones;
    for (const mb of bones) {
      if (mb.parent < 0) continue;
      const p = bones[mb.parent];
      if (mb.s.limitAngle > 0) {
        const dir = _v.subVectors(mb.loc, p.loc), len = dir.length(), pose = _w.subVectors(mb.poseLoc, p.poseLoc).normalize();
        if (len > 1e-8) {
          dir.divideScalar(len);
          const angle = Math.atan2(_b.crossVectors(pose, dir).length(), pose.dot(dir)), limit = mb.s.limitAngle * THREE.MathUtils.DEG2RAD;
          if (angle > limit) {
            // nearly opposite: no axis from the cross product, so the parent's side axis (GetAxisX)
            if (_b.lengthSq() < 1e-12) _b.set(1, 0, 0).applyQuaternion(p.poseRot);
            dir.applyAxisAngle(_b.normalize(), limit - angle);
            mb.loc.copy(p.loc).addScaledVector(dir, len);
          }
        }
      }
      const length = _w.subVectors(mb.poseLoc, p.poseLoc).length();
      const d = _v.subVectors(mb.loc, p.loc), dl = d.length();
      if (dl > 1e-8) mb.loc.copy(p.loc).addScaledVector(d, length / dl);
      else mb.loc.copy(p.loc).add(_w);
    }
  }

  /* ---------- ApplySimulateResult: each parent turns toward where its one child went ---------- */
  private writePose(): void {
    const a = clamp01(this.s.alpha), bones = this.bones;
    if (a <= 0) return;
    for (const mb of bones) { mb.outRot.copy(mb.poseRot); mb.outLoc.copy(mb.poseLoc); }
    for (const mb of bones) {
      if (mb.parent < 0) continue;
      const p = bones[mb.parent];
      if (p.children.length <= 1 && p.bone) {
        _a.subVectors(mb.poseLoc, p.poseLoc); _b.subVectors(mb.loc, p.loc);
        if (_a.lengthSq() > 1e-16 && _b.lengthSq() > 1e-16) p.outRot.setFromUnitVectors(_a.normalize(), _b.normalize()).multiply(p.poseRot);
      }
      if (mb.bone) mb.outLoc.copy(mb.loc);
    }
    // parents first (the array is in that order). Under a simulated parent a bone is placed from where the parent
    // went, not from the parent's matrices read back; a chain's root reads its parent's.
    for (const mb of bones) {
      const b = mb.bone, parent = b?.parent;
      if (!b || !parent) continue;
      if (a < 1) { mb.outRot.slerpQuaternions(mb.poseRot, mb.outRot, a); mb.outLoc.lerpVectors(mb.poseLoc, mb.outLoc, a); }
      const p = bones[mb.parent] as ModifyBone | undefined;
      if (p?.bone === parent) { _p.copy(p.outLoc); _q.copy(p.outRot); _s.copy(p.poseScale); }
      else _m.multiplyMatrices(this.simFromWorld, parent.matrixWorld).decompose(_p, _q, _s);
      _q.invert();
      b.position.subVectors(mb.outLoc, _p).applyQuaternion(_q).divide(_s);
      b.quaternion.multiplyQuaternions(_q, mb.outRot);
      // its own world matrix only, not its whole subtree again for every bone
      b.updateWorldMatrix(false, false);
    }
  }

  /** AdvancePreSkelCompTransform: movement the substeps did not use yet carries over to the next frame */
  private advanceComponent(): void {
    const f = this.teleported ? 1 : this.consume;
    _p.setFromMatrixPosition(this.component.matrixWorld);
    if (f >= 1 - 1e-6) { this.prevCompPos.copy(_p); this.prevCompQuat.copy(this.compQuat); }
    else { this.prevCompPos.lerp(_p, f); this.prevCompQuat.slerp(this.compQuat, f); }
  }
}
