import * as THREE from 'three';

/**
 * The animated local pose of some bones, kept between frames.
 *
 * KawaiiPhysics gets a fresh input pose from the AnimGraph every frame. three.js has no such thing: an AnimationMixer
 * writes a property only when its blended value differs from the one it wrote last frame (PropertyMixer.apply), and a
 * bone with no track at all is never written. Physics overwrites those bones every frame, so on any frame the clips hold
 * one still, the mixer would leave last frame's physics in place and the solver would read it back as animation.
 * hane-voyage met the same thing with its head turn (src/figures.ts, "faint twitch").
 *
 * So, every frame:  snapshot.restore(); mixer.update(dt); snapshot.capture(); node.update(dt);
 */
export class PoseSnapshot {
  readonly bones: THREE.Object3D[];
  private readonly pos: THREE.Vector3[];
  private readonly rot: THREE.Quaternion[];
  private readonly scl: THREE.Vector3[];

  /** Takes the bones' current local pose as the first snapshot, so build it before any physics has run. */
  constructor(bones: Iterable<THREE.Object3D>) {
    this.bones = [...new Set(bones)];
    this.pos = this.bones.map(b => b.position.clone());
    this.rot = this.bones.map(b => b.quaternion.clone());
    this.scl = this.bones.map(b => b.scale.clone());
  }

  /** Put back the last animated pose, before the mixer runs. */
  restore(): void {
    this.bones.forEach((b, i) => { b.position.copy(this.pos[i]); b.quaternion.copy(this.rot[i]); b.scale.copy(this.scl[i]); });
  }

  /** Keep what the mixer left, after it ran and before physics does. */
  capture(): void {
    this.bones.forEach((b, i) => { this.pos[i].copy(b.position); this.rot[i].copy(b.quaternion); this.scl[i].copy(b.scale); });
  }
}
