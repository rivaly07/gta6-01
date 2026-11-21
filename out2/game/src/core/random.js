// Seeded random number generator (Mulberry32) - deterministic for a given seed.
// Same seed always produces the same sequence, essential for reproducible city generation.

export function createRandom(seed) {
  let state = seed | 0;

  function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Return random integer in [min, max]
  random.int = function(min, max) {
    return min + Math.floor(random() * (max - min + 1));
  };

  // Return random float in [min, max]
  random.float = function(min, max) {
    return min + random() * (max - min);
  };

  // Return random element from array
  random.choice = function(array) {
    return array[Math.floor(random() * array.length)];
  };

  // Return random boolean with given probability
  random.chance = function(probability) {
    return random() < probability;
  };

  // Return random point in circle
  random.inCircle = function(radius) {
    const r = Math.sqrt(random()) * radius;
    const theta = random() * Math.PI * 2;
    return { x: r * Math.cos(theta), z: r * Math.sin(theta) };
  };

  // Return random point in rectangle
  random.inRect = function(width, depth) {
    return {
      x: (random() - 0.5) * width,
      z: (random() - 0.5) * depth,
    };
  };

  // Weighted random choice
  random.weighted = function(items, weightKey = 'weight') {
    const total = items.reduce((sum, item) => sum + item[weightKey], 0);
    let r = random() * total;
    for (const item of items) {
      r -= item[weightKey];
      if (r <= 0) return item;
    }
    return items[items.length - 1];
  };

  // Get/set state for save/load
  random.getState = function() {
    return state;
  };

  random.setState = function(newState) {
    state = newState | 0;
  };

  return random;
}

// Global random instance (initialized with default seed, replaced on game start)
export let globalRandom = createRandom(123456789);

export function setGlobalSeed(seed) {
  globalRandom = createRandom(seed);
  return globalRandom;
}