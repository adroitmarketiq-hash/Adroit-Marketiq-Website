/* ==========================================================================
   Adroit Marketiq — loader scene (Three.js, ES module)

   The brand loader as a growth chart: six bars rise in turn, one for each step
   of the process (Discover → Strategize → Create → Launch → Optimize → Grow),
   a growth line draws across their tops and ends in the arrow from the Adroit
   mark. core.js then wipes the logo in and lifts the cover.

   Runs only on the first page of a session, and only if it can claim the
   loader in time (see runLoader in core.js); otherwise core.js shows the
   simple version.
   ========================================================================== */

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';

const COLOR = { blue: 0x1673e6, sky: 0x56c5f5, amber: 0xf2b01e, paper: 0xf5f7fb };
const STEPS = ['Discover', 'Strategize', 'Create', 'Launch', 'Optimize', 'Grow'];
const HEIGHTS = [0.55, 0.9, 1.3, 1.8, 2.4, 3.1];
const SPACING = 0.8;
const BAR_WIDTH = 0.46;

const loader = document.querySelector('.loader');
const core = window.AM;

if (loader && core && core.loader && document.documentElement.classList.contains('is-loading')) {
  run();
}

async function run() {
  let THREE;
  try {
    THREE = await import(THREE_URL);
  } catch (error) {
    return; // core.js falls back on its own timer
  }

  const control = core.loader.claim();
  if (!control) return; // too late: the simple sequence is already playing

  let stage;
  try {
    stage = buildStage(THREE, loader.querySelector('.loader__canvas'));
  } catch (error) {
    control.fail(); // no WebGL
    return;
  }
  play(stage, control);
}

/* --------------------------------------------------------------------------
   Scene
   -------------------------------------------------------------------------- */

function buildStage(THREE, canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
  const chart = new THREE.Group();
  scene.add(chart);

  const firstX = -((STEPS.length - 1) * SPACING) / 2;
  const barX = (i) => firstX + i * SPACING;

  /* floor: a small field of points the chart stands on */
  const dot = dotTexture(THREE);
  const floorPoints = [];
  for (let x = -3.2; x <= 3.21; x += 0.4) {
    for (let z = -1.2; z <= 1.21; z += 0.4) floorPoints.push(x, 0, z);
  }
  const floorMaterial = new THREE.PointsMaterial({ color: COLOR.sky, size: 0.055, map: dot, transparent: true, opacity: 0, depthWrite: false });
  chart.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(floorPoints, 3)), floorMaterial));

  /* back guides: the horizontal rules of a chart */
  const guidePositions = [];
  for (let y = 0; y <= 3; y++) guidePositions.push(-2.7, y, -0.5, 2.7, y, -0.5);
  const guideMaterial = new THREE.LineBasicMaterial({ color: COLOR.paper, transparent: true, opacity: 0 });
  chart.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(guidePositions, 3)), guideMaterial));

  /* bars: glass columns with a lit rim and cap; each is scaled up from the floor */
  const box = new THREE.BoxGeometry(BAR_WIDTH, 1, BAR_WIDTH).translate(0, 0.5, 0);
  const edges = new THREE.EdgesGeometry(box);
  const cap = new THREE.PlaneGeometry(BAR_WIDTH, BAR_WIDTH).rotateX(-Math.PI / 2).translate(0, 1.001, 0);
  const bars = HEIGHTS.map((height, i) => {
    const last = i === HEIGHTS.length - 1;
    const group = new THREE.Group();
    group.add(
      new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: COLOR.blue, transparent: true, opacity: 0.16 + i * 0.035, depthWrite: false })),
      new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: COLOR.sky, transparent: true, opacity: 0.9 })),
      new THREE.Mesh(cap, new THREE.MeshBasicMaterial({ color: last ? COLOR.amber : COLOR.sky, transparent: true, opacity: last ? 0.95 : 0.6, side: THREE.DoubleSide, depthWrite: false }))
    );
    group.position.x = barX(i);
    group.scale.y = 0.0001;
    group.visible = false;
    chart.add(group);
    return { group, height };
  });

  /* growth line: over the bar tops, rising past the last one */
  const linePoints = [new THREE.Vector3(firstX - 0.6, 0.3, 0)];
  HEIGHTS.forEach((height, i) => linePoints.push(new THREE.Vector3(barX(i), height + 0.32, 0)));
  const topX = barX(HEIGHTS.length - 1);
  const topY = HEIGHTS[HEIGHTS.length - 1];
  linePoints.push(new THREE.Vector3(topX + 0.55, topY + 0.95, 0));
  const curve = new THREE.CatmullRomCurve3(linePoints, false, 'centripetal');

  const tube = new THREE.TubeGeometry(curve, 160, 0.02, 8, false);
  const glow = new THREE.TubeGeometry(curve, 160, 0.07, 8, false);
  chart.add(
    new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color: COLOR.paper })),
    new THREE.Mesh(glow, new THREE.MeshBasicMaterial({ color: COLOR.sky, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }))
  );
  tube.setDrawRange(0, 0);
  glow.setDrawRange(0, 0);

  /* the travelling head of the line */
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: COLOR.sky, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  head.scale.setScalar(0.34);
  chart.add(head);

  /* a node where the line passes each bar */
  const samples = curve.getSpacedPoints(400);
  const nodes = HEIGHTS.map((height, i) => {
    const target = linePoints[i + 1];
    let best = 0;
    samples.forEach((point, index) => {
      if (point.distanceToSquared(target) < samples[best].distanceToSquared(target)) best = index;
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 16), new THREE.MeshBasicMaterial({ color: COLOR.paper }));
    mesh.position.copy(target);
    mesh.scale.setScalar(0.0001);
    chart.add(mesh);
    return { mesh, at: best / 400, shown: 0 };
  });

  /* arrowhead and a pulse ring at the end of the line */
  const tangent = curve.getTangentAt(1);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 24), new THREE.MeshBasicMaterial({ color: COLOR.amber }));
  arrow.position.copy(curve.getPointAt(1)).addScaledVector(tangent, 0.16);
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
  arrow.scale.setScalar(0.0001);
  chart.add(arrow);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.225, 48),
    new THREE.MeshBasicMaterial({ color: COLOR.amber, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.position.copy(arrow.position);
  chart.add(ring);

  /* framing: the chart fills about 47% of the screen height, or 80% of its width on narrow screens */
  const target = new THREE.Vector3(0.15, 1.75, 0);
  const direction = new THREE.Vector3(0.36, 0.2, 1).normalize();
  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const halfFov = Math.tan((camera.fov * Math.PI) / 360);
    const distance = Math.max(4.35 / halfFov, 4.1 / (halfFov * camera.aspect));
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  /* values the timeline animates; applied to the scene every frame */
  const state = { line: 0, floor: 0, arrow: 0, ring: 0, turn: 0.5 };
  const tubeCount = tube.index.count;
  const glowCount = glow.index.count;
  const point = new THREE.Vector3();
  let running = true;

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);

    floorMaterial.opacity = 0.42 * state.floor;
    guideMaterial.opacity = 0.1 * state.floor;
    chart.rotation.y = state.turn;

    tube.setDrawRange(0, Math.floor((tubeCount * state.line) / 6) * 6);
    glow.setDrawRange(0, Math.floor((glowCount * state.line) / 6) * 6);
    curve.getPointAt(Math.min(1, state.line), point);
    head.position.copy(point);
    head.material.opacity = state.line > 0.001 && state.line < 0.999 ? 1 : 0;

    nodes.forEach((node) => {
      node.shown += ((state.line >= node.at ? 1 : 0) - node.shown) * 0.2;
      node.mesh.scale.setScalar(Math.max(0.0001, node.shown));
    });

    arrow.scale.setScalar(Math.max(0.0001, state.arrow));
    ring.quaternion.copy(camera.quaternion);
    ring.scale.setScalar(1 + state.ring * 2.4);
    ring.material.opacity = state.ring > 0.001 ? 1 - state.ring : 0;

    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  function dispose() {
    running = false;
    window.removeEventListener('resize', resize);
    scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) object.material.dispose();
    });
    dot.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return { canvas, bars, state, dispose };
}

/** Soft round sprite so points render as dots rather than squares. */
function dotTexture(THREE) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* --------------------------------------------------------------------------
   Sequence
   -------------------------------------------------------------------------- */

function play(stage, control) {
  const gsap = window.gsap;
  const mark = loader.querySelector('.loader__mark');
  const step = loader.querySelector('.loader__step');
  const { canvas, bars, state } = stage;

  const BAR_START = 0.1;
  const BAR_STAGGER = 0.11;
  const showStep = (i) => {
    step.textContent = STEPS[i];
  };
  // The percentage carries on from wherever the waiting phase left it.
  const percent = { value: control.progress() };

  mark.style.animation = 'none';
  showStep(0);

  const timeline = gsap.timeline();

  timeline
    .to(mark, { opacity: 0, scale: 0.8, duration: 0.25, ease: 'power2.in' }, 0)
    .to(canvas, { opacity: 1, duration: 0.3 }, 0.05)
    .to(state, { floor: 1, duration: 0.5, ease: 'power2.out' }, 0.05)
    .to(state, { turn: 0.2, duration: 1.5, ease: 'power2.out' }, 0);

  bars.forEach((bar, i) => {
    const at = BAR_START + i * BAR_STAGGER;
    timeline
      .call(() => { bar.group.visible = true; showStep(i); }, null, at)
      .to(bar.group.scale, { y: bar.height, duration: 0.55, ease: 'expo.out' }, at);
  });

  const lineEnd = BAR_START + (bars.length - 1) * BAR_STAGGER + 0.45;
  timeline
    .to(state, { line: 1, duration: lineEnd - 0.2, ease: 'power2.inOut' }, 0.2)
    .to(percent, { value: 100, duration: lineEnd + 0.1, ease: 'power1.inOut', onUpdate: () => control.progress(percent.value) }, 0)
    .to(state, { arrow: 1, duration: 0.3, ease: 'back.out(2.5)' }, lineEnd - 0.05)
    .to(state, { ring: 1, duration: 0.5, ease: 'power2.out' }, lineEnd)
    // hand over to the logo: the chart recedes while core.js wipes the lockup in over it
    .to(canvas, { opacity: 0, scale: 0.94, duration: 0.35, ease: 'power2.in' }, lineEnd + 0.3)
    .call(control.finish, null, lineEnd + 0.38)
    // the cover needs about a second to show the logo and lift; then free the GPU
    .call(() => setTimeout(stage.dispose, 1800), null, lineEnd + 0.65);
}
