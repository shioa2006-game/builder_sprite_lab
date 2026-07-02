import { lerpColor } from "../core/utils.js";

// One in-game day = 300 real seconds. Time is in hours [0, 24).
const HOURS_PER_SECOND = 24 / 300;

const PHASES = [
  // [untilHour, sky, fog, hemi, sun]
  { until: 4.5, sky: 0x1a2238, hemi: 0.55, sun: 0.1 }, // deep night
  { until: 6.5, sky: 0xd98a5f, hemi: 1.4, sun: 0.9 }, // dawn
  { until: 16.5, sky: 0x8fb5c9, hemi: 2.4, sun: 2.0 }, // day
  { until: 19.0, sky: 0xe0955c, hemi: 1.5, sun: 1.0 }, // dusk
  { until: 24.0, sky: 0x1a2238, hemi: 0.55, sun: 0.1 }, // night
];

export class DayNight {
  constructor() {
    this.hour = 8;
    this.day = 1;
    this.frozen = false;
  }

  update(dt) {
    if (this.frozen) return;
    this.hour += dt * HOURS_PER_SECOND;
    if (this.hour >= 24) {
      this.hour -= 24;
      this.day += 1;
    }
  }

  get isNight() {
    return this.hour >= 19.5 || this.hour < 4.5;
  }

  get isEvening() {
    return this.hour >= 17.5;
  }

  sleep() {
    if (this.hour > 6) this.day += 1;
    this.hour = 6;
  }

  forceNight() {
    this.hour = 20;
  }

  clockText() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    const label = this.isNight ? "🌙" : this.hour < 10 ? "🌅" : this.hour < 16 ? "☀️" : "🌇";
    return `${label} ${this.day}日目 ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // Blend the two phases around the current hour for smooth transitions.
  sample() {
    const h = this.hour;
    let i = PHASES.findIndex((p) => h < p.until);
    if (i < 0) i = PHASES.length - 1;
    const cur = PHASES[i];
    const prevUntil = i === 0 ? 0 : PHASES[i - 1].until;
    const span = cur.until - prevUntil;
    // Ease within the first 30% of each phase from the previous phase's values.
    const t = Math.min(1, (h - prevUntil) / Math.max(0.6, span * 0.3));
    const prev = PHASES[(i + PHASES.length - 1) % PHASES.length];
    return {
      sky: lerpColor(prev.sky, cur.sky, t),
      hemi: prev.hemi + (cur.hemi - prev.hemi) * t,
      sun: prev.sun + (cur.sun - prev.sun) * t,
    };
  }
}
