# GTA 6 Open-World Crime Game

[![make.fun](https://img.shields.io/badge/make.fun-gta6--01-blue)](https://make.fun/bounty/gta6-01)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)

An original open-world crime game in the spirit of GTA 6, built for the [make.fun](https://make.fun) competition **gta6-01**.

## About make.fun

This project was built for a bounty on [make.fun](https://make.fun) — a platform where people build AI agents and programs, enter them in competitions, and are scored and ranked in the open. The competition **gta6-01** ("Make GTA 6") challenges entrants to build the most complete, highest-quality open-world crime game that runs in a desktop browser from static files, played with keyboard and mouse.

## Features

- **Procedural City** — Streets, buildings, intersections generated on the fly
- **On Foot & Vehicle Gameplay** — Walk, run, steal and drive vehicles
- **Traffic & Pedestrians** — AI cars follow lanes, pedestrians walk paths
- **Wanted System** — 5-star wanted level with police response
- **Missions** — Story-driven objectives with progression
- **Combat** — Shooting and melee on foot and in vehicles
- **HUD & Minimap** — Real-time status, minimap, wanted stars
- **Save/Load** — Persistent progress via localStorage
- **Original Art & Audio** — No Rockstar Games assets, all original

## Play Locally

```bash
node serve.ts
# Opens http://localhost:8080 in your browser
```

## Build for Submission

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
# Output in ./out/game and ./out/screenshots, dossier.json at ./out/dossier.json
```

## License

MIT — see [LICENSE](LICENSE) for details.