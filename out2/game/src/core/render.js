// Renderer setup: WebGL renderer, scene, camera, lights, sky, resize.
// Kept deliberately small so shot mode can build the same rig without a loop.

import { WORLD, CAMERA } from '../config.js';

export function createRenderRig(canvas, opts = {}) {
  const width = opts.width || window.innerWidth;
  const height = opts.height || window.innerHeight;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: opts.antialias !== false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio ?? 1.75));
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(WORLD.fogColor);
  scene.fog = new THREE.Fog(WORLD.fogColor, WORLD.fogNear, WORLD.fogFar);

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, width / height, 0.15, 700);

  // --- Lights ---
  const hemi = new THREE.HemisphereLight(0x9fb8d8, 0x2a2620, 0.62);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0x404a5a, 0.45);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffe6c0, 2.0);
  sun.position.set(70, 110, 45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(WORLD.shadowMapSize, WORLD.shadowMapSize);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 320;
  const span = 95;
  sun.shadow.camera.left = -span;
  sun.shadow.camera.right = span;
  sun.shadow.camera.top = span;
  sun.shadow.camera.bottom = -span;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  // Rim/fill light from the opposite side keeps facades readable
  const fill = new THREE.DirectionalLight(0x6a86b0, 0.5);
  fill.position.set(-60, 40, -70);
  scene.add(fill);

  const rig = { renderer, scene, camera, sun, hemi, ambient, fill, width, height };

  function resize(w, h) {
    if (w === 0 || h === 0) return;
    rig.width = w;
    rig.height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  rig.resize = resize;
  return rig;
}

/** Move the shadow frustum with the action so shadows stay sharp near the player. */
export function updateShadowFocus(rig, x, z) {
  rig.sun.position.set(x + 70, 110, z + 45);
  rig.sun.target.position.set(x, 0, z);
  rig.sun.target.updateMatrixWorld();
}

/** Sky dome: cheap gradient sphere, no textures. */
export function createSky(scene) {
  const geo = new THREE.SphereGeometry(600, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x101a2c) },
      midColor: { value: new THREE.Color(0x2d4763) },
      bottomColor: { value: new THREE.Color(0x5b6d78) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      void main() {
        float h = normalize(vPos).y;
        vec3 c = mix(bottomColor, midColor, smoothstep(-0.15, 0.22, h));
        c = mix(c, topColor, smoothstep(0.18, 0.85, h));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  scene.add(sky);
  return sky;
}
