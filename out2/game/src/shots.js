// Shot definitions for Redline City.
// Used by the build/harness to know what scenes to stage.
// The actual staging logic lives in main.js (runShot).

export const SHOTS = [
  { name: '1-cover.png',  query: '?shot=start&seed=1' },
  { name: '2-city.png',   query: '?shot=play&seed=1' },
  { name: '3-action.png', query: '?shot=play&seed=42' },
  { name: '4-mission.png', query: '?shot=end&seed=99' },
];

export function getShotNames() {
  return SHOTS.map(s => s.name);
}

export function getShotQuery(name) {
  const s = SHOTS.find(s => s.name === name);
  return s ? s.query : null;
}