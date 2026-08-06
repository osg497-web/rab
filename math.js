export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// smooth, no-overshoot easing toward a target — good for scroll/mouse follow
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
