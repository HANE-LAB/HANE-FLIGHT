// Hooks on window: the first few are set by screenshot and timing scripts before the page script runs (dev/shots.mjs,
// dev/perf.mjs); the rest are for reviewing moments from the console.
interface Window {
  __fixedQuality?: boolean;   // keep the quality steps where they start (no automatic lowering)
  __phone?: boolean;          // start on the phone settings whatever the device is
  __gpuMs?: number[];         // GPU time of recent frames, when the timer query is available (dev/perf.mjs reads it)
  __frameByFrame?: boolean;   // test only (dev/film.mjs): frames only when __frame is called
  __frame?: (dt: number) => void;
  __lensAt?: { at: number[]; look: number[]; fov: number };   // test only: the lens put anywhere
  __renderSound?: (from: number, seconds: number, rate?: number) => Promise<{ wav: string; peak: number; rms: number; log: string[] }>;   // test only (dev/film.mjs): the sound of a stretch of flight
  __dbg?: Record<string, unknown>;   // the scene, camera, uniforms and composer, for tuning from the console
  // playback state and a few handles for review from the console or a screenshot script
  flight: {
    seek(day: number | string): void;
    play(on: boolean): void;
    speed(k: number): void;
    view(n: number): void;
    lens(yaw: number, pitch: number, zoom: number): void;
    state(): { u: number; simT: number; flock: number };
  };
}
