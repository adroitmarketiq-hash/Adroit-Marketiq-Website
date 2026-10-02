/* ==========================================================================
   Adroit Marketiq — WebGL scenes (Three.js, loaded from CDN as an ES module)

   data-scene="hero"   the growth ecosystem on the home page: a rising line
                       (strategy → attention → engagement → conversion → growth)
                       over a field of data points, with a campaign network,
                       interface fragments and signals travelling the line.
   data-scene="field"  the quiet data field behind dark page headers.

   The module loads Three.js only when a scene is on the page and WebGL works.
   Without WebGL the hero shows its inline SVG fallback instead.
   ========================================================================== */

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';

const COLOR = { navy: 0x101c35, blue: 0x1673e6, sky: 0x56c5f5, amber: 0xf2b01e, paper: 0xf5f7fb, deep: 0x0d172d };

const host = document.querySelector('[data-scene]');
if (host) start(host);

async function start(host) {
  const canvas = host.querySelector('canvas');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fail = () => host.classList.add('is-fallback');
  if (!canvas) return fail();

  let THREE;
  let renderer;
  try {
    THREE = await import(THREE_URL);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (error) {
    return fail();
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.5 : 1.75));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  const build = host.dataset.scene === 'field' ? buildField : buildHero;
  const stage = build(THREE, scene, camera, host);

  /* ----- sizing ----- */
  let width = 0;
  let height = 0;
  function resize() {
    width = host.clientWidth;
    height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    stage.layout(width, height);
    camera.updateProjectionMatrix();
    if (reduced) renderStatic();
  }

  // Reduced motion: one finished frame, no loop. Updated twice so the labels are
  // projected with the camera position that the first pass settles.
  function renderStatic() {
    for (let pass = 0; pass < 2; pass++) {
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      stage.update({ time: 0, intro: 1, pointer: { x: 0, y: 0 }, scroll: 0, width, height, instant: true });
    }
    renderer.render(scene, camera);
  }
  new ResizeObserver(resize).observe(host);
  resize();

  /* ----- pointer + scroll input ----- */
  const pointer = { x: 0, y: 0 };
  window.addEventListener(
    'pointermove',
    (event) => {
      pointer.x = event.clientX / window.innerWidth - 0.5;
      pointer.y = event.clientY / window.innerHeight - 0.5;
    },
    { passive: true }
  );

  /* ----- visibility: never render what cannot be seen ----- */
  let visible = true;
  new IntersectionObserver((entries) => (visible = entries[0].isIntersecting)).observe(host);

  /* ----- intro: begins when the loader lifts ----- */
  let introStart = null;
  const begin = () => {
    introStart = performance.now() + 350;
    host.classList.add('is-ready');
  };
  if (window.AM && window.AM.onReady) window.AM.onReady(begin);
  else begin();

  if (reduced) {
    host.classList.add('is-ready');
    renderStatic();
    return;
  }

  const clock = new THREE.Clock();
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible || document.hidden || !width) return;
    const intro = introStart === null ? 0 : easeInOut(Math.min(1, Math.max(0, (now - introStart) / 2600)));
    const scroll = Math.min(1, Math.max(0, window.scrollY / Math.max(1, host.offsetHeight)));
    stage.update({ time: clock.getElapsedTime(), intro, pointer, scroll, width, height });
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

/* --------------------------------------------------------------------------
   Shared pieces
   -------------------------------------------------------------------------- */

/** Soft round sprite so points render as dots rather than squares. */
function dotTexture(THREE) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Deterministic pseudo-random numbers, so the composition is the same on every visit. */
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** A grid of points that ripples like a slow data surface. */
function makeTerrain(THREE, { cols, rows, stepX, stepZ, originZ, y, color, size, opacity, map, additive }) {
  const positions = new Float32Array(cols * rows * 3);
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      positions[i++] = (c - (cols - 1) / 2) * stepX;
      positions[i++] = y;
      positions[i++] = originZ - r * stepZ;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color,
    size,
    map,
    transparent: true,
    opacity,
    depthWrite: false,
    sizeAttenuation: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  const update = (time, amplitude) => {
    const p = geometry.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k);
      const z = p.getZ(k);
      p.setY(k, y + Math.sin(x * 0.55 + time * 0.55) * Math.cos(z * 0.5 + time * 0.4) * amplitude);
    }
    p.needsUpdate = true;
  };
  return { points, update };
}

/* --------------------------------------------------------------------------
   Hero: the growth ecosystem
   -------------------------------------------------------------------------- */

function buildHero(THREE, scene, camera, host) {
  const dot = dotTexture(THREE);
  const random = seeded(7);
  scene.fog = new THREE.Fog(COLOR.paper, 10, 25);

  const FLOOR = -2.25;
  const world = new THREE.Group();
  scene.add(world);

  /* data field */
  const terrain = makeTerrain(THREE, {
    cols: 78, rows: 34, stepX: 0.32, stepZ: 0.38, originZ: 3.4, y: FLOOR,
    color: COLOR.navy, size: 0.05, opacity: 0.5, map: dot,
  });
  scene.add(terrain.points);

  /* the growth line */
  const curve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-3.3, -1.75, 0.8),
      new THREE.Vector3(-1.5, -1.3, -0.4),
      new THREE.Vector3(0.15, -0.5, 0.5),
      new THREE.Vector3(1.6, 0.7, -0.35),
      new THREE.Vector3(2.95, 2.2, 0.15),
    ],
    false,
    'catmullrom',
    0.5
  );

  const tubeGeometry = new THREE.TubeGeometry(curve, 260, 0.02, 8, false);
  const tubeIndexCount = tubeGeometry.index.count;
  const tube = new THREE.Mesh(tubeGeometry, new THREE.MeshBasicMaterial({ color: COLOR.blue, fog: false }));
  world.add(tube);

  /* its trace on the floor, and drop lines from each station: reads as a 3D chart */
  const samples = curve.getPoints(120);
  const shadow = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(samples.map((p) => new THREE.Vector3(p.x, FLOOR + 0.01, p.z))),
    new THREE.LineBasicMaterial({ color: COLOR.navy, transparent: true, opacity: 0.22 })
  );
  world.add(shadow);

  const STATIONS = [0.015, 0.27, 0.52, 0.765, 0.985];
  const stationPoints = STATIONS.map((t) => curve.getPointAt(t));
  const labels = Array.from(host.querySelectorAll('[data-station]'));

  const dropPositions = [];
  stationPoints.forEach((p) => dropPositions.push(p.x, p.y, p.z, p.x, FLOOR, p.z));
  const drops = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(dropPositions, 3)),
    new THREE.LineDashedMaterial({ color: COLOR.navy, transparent: true, opacity: 0.4, dashSize: 0.08, gapSize: 0.08 })
  );
  drops.computeLineDistances();
  world.add(drops);

  const stations = stationPoints.map((p, index) => {
    const group = new THREE.Group();
    group.position.copy(p);
    const last = index === stationPoints.length - 1;
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 20, 20),
      new THREE.MeshBasicMaterial({ color: last ? COLOR.amber : COLOR.blue, fog: false })
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.165, 40),
      new THREE.MeshBasicMaterial({ color: COLOR.navy, transparent: true, opacity: 0.75, side: THREE.DoubleSide, fog: false })
    );
    group.add(core, ring);
    group.scale.setScalar(0.001);
    world.add(group);
    return { group, ring, shown: 0 };
  });

  /* arrowhead at the top of the line: the arrow from the Adroit mark */
  const endTangent = curve.getTangentAt(1);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 20), new THREE.MeshBasicMaterial({ color: COLOR.amber, fog: false }));
  arrow.position.copy(curve.getPointAt(1)).addScaledVector(endTangent, 0.3);
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), endTangent);
  arrow.scale.setScalar(0.001);
  world.add(arrow);

  /* signals travelling the line */
  const FLOW = 34;
  const flowOffsets = Array.from({ length: FLOW }, () => random());
  const flowSpeeds = Array.from({ length: FLOW }, () => 0.035 + random() * 0.05);
  const flowColors = new Float32Array(FLOW * 3);
  const tint = new THREE.Color();
  for (let i = 0; i < FLOW; i++) {
    tint.setHex(i % 9 === 0 ? COLOR.amber : i % 2 ? COLOR.sky : COLOR.blue);
    flowColors.set([tint.r, tint.g, tint.b], i * 3);
  }
  const flowGeometry = new THREE.BufferGeometry();
  flowGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FLOW * 3), 3));
  flowGeometry.setAttribute('color', new THREE.BufferAttribute(flowColors, 3));
  const flow = new THREE.Points(
    flowGeometry,
    new THREE.PointsMaterial({ size: 0.13, map: dot, vertexColors: true, transparent: true, depthWrite: false, fog: false })
  );
  flow.frustumCulled = false;
  world.add(flow);

  /* campaign network: audiences and channels around the middle of the journey */
  const nodeCount = 30;
  const nodes = [];
  for (let i = 0; i < nodeCount; i++) {
    const anchor = curve.getPointAt(0.15 + random() * 0.7);
    nodes.push(
      new THREE.Vector3(anchor.x + (random() - 0.5) * 3.4, anchor.y + (random() - 0.2) * 2.6, anchor.z + (random() - 0.5) * 3.6)
    );
  }
  const linkPositions = [];
  for (let a = 0; a < nodeCount; a++) {
    for (let b = a + 1; b < nodeCount; b++) {
      if (nodes[a].distanceTo(nodes[b]) < 1.55) linkPositions.push(nodes[a].x, nodes[a].y, nodes[a].z, nodes[b].x, nodes[b].y, nodes[b].z);
    }
  }
  const network = new THREE.Group();
  const linkMaterial = new THREE.LineBasicMaterial({ color: COLOR.navy, transparent: true, opacity: 0 });
  const nodeMaterial = new THREE.PointsMaterial({ color: COLOR.blue, size: 0.09, map: dot, transparent: true, opacity: 0, depthWrite: false });
  network.add(
    new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(linkPositions, 3)), linkMaterial),
    new THREE.Points(new THREE.BufferGeometry().setFromPoints(nodes), nodeMaterial)
  );
  world.add(network);

  /* a rising row of markers on the floor: the chart behind the line */
  const bars = new THREE.Group();
  const barPositions = [];
  const barTops = [];
  const BAR_COUNT = 13;
  for (let i = 0; i < BAR_COUNT; i++) {
    const x = -3.4 + i * 0.56;
    const h = 0.3 + Math.pow(i / (BAR_COUNT - 1), 1.5) * 2.5 + (random() - 0.5) * 0.3;
    barPositions.push(x, 0, 0, x, h, 0);
    barTops.push(new THREE.Vector3(x, h, 0));
  }
  bars.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(barPositions, 3)),
      new THREE.LineBasicMaterial({ color: COLOR.navy, transparent: true, opacity: 0.34 })
    ),
    new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(barTops),
      new THREE.PointsMaterial({ color: COLOR.navy, size: 0.085, map: dot, transparent: true, opacity: 0.8, depthWrite: false })
    )
  );
  bars.position.set(0.2, FLOOR, -2.6);
  bars.scale.y = 0.001;
  world.add(bars);

  /* interface fragments: a browser window, a post, a search field */
  const frameMaterial = new THREE.LineBasicMaterial({ color: COLOR.navy, transparent: true, opacity: 0 });
  const rect = (x, y, w, h) => [x, y, 0, x + w, y, 0, x + w, y, 0, x + w, y - h, 0, x + w, y - h, 0, x, y - h, 0, x, y - h, 0, x, y, 0];
  const line = (x1, y1, x2, y2) => [x1, y1, 0, x2, y2, 0];
  const fragment = (segments, position, rotationY) => {
    const mesh = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(segments.flat(), 3)),
      frameMaterial
    );
    mesh.position.copy(position);
    mesh.rotation.y = rotationY;
    mesh.userData.baseY = position.y;
    world.add(mesh);
    return mesh;
  };
  const fragments = [
    // browser window
    fragment(
      [rect(0, 0, 1.7, 1.15), line(0, -0.2, 1.7, -0.2), rect(0.14, -0.36, 0.86, 0.36), line(0.14, -0.86, 1.1, -0.86), line(0.14, -0.98, 0.76, -0.98), rect(1.14, -0.36, 0.42, 0.62)],
      new THREE.Vector3(-1.5, 1.75, -2.0),
      0.36
    ),
    // social post
    fragment(
      [rect(0, 0, 0.82, 1.02), rect(0.1, -0.1, 0.62, 0.56), line(0.1, -0.78, 0.6, -0.78), line(0.1, -0.89, 0.4, -0.89)],
      new THREE.Vector3(1.0, 2.75, -2.4),
      -0.3
    ),
    // search field
    fragment([rect(0, 0, 1.5, 0.3), line(0.12, -0.15, 0.72, -0.15)], new THREE.Vector3(-0.3, 3.15, -2.8), 0.2),
  ];

  /* ----- responsive framing ----- */
  const target = new THREE.Vector3();
  let baseCamera = new THREE.Vector3();
  function layout(width, height) {
    const aspect = width / height;
    const halfFov = Math.tan((camera.fov * Math.PI) / 360);
    // Below 900px the page stacks the scene under the copy (see .hero__scene in pages.css).
    if (aspect >= 1.3 && window.innerWidth >= 900) {
      // Desktop: the composition sits in the right half, beside the headline. Its left end
      // stays just right of centre (clear of the copy) and its right end leaves room for
      // the "Growth" label, whatever the window shape.
      baseCamera.set(0, 1.35, 12.2);
      target.set(0, 0.35, 0);
      const halfWidth = halfFov * baseCamera.z * aspect;
      const right = aspect < 1.5 ? 0.74 : 0.8;
      const scale = Math.min(0.9, ((right + 0.06) * halfWidth) / 6.25);
      world.scale.setScalar(scale);
      world.position.set(right * halfWidth - 2.95 * scale, 0.15, 0);
    } else {
      // Stacked: the scene is its own band, centred, nudged left for the station labels.
      world.scale.setScalar(1);
      world.position.set(-0.55, 0.1, 0);
      baseCamera.set(0, 1.5, Math.max(11, 5.5 / (halfFov * aspect)));
      target.set(0, 0.3, 0);
    }
  }

  /* ----- per-frame update ----- */
  const projected = new THREE.Vector3();
  const flowPoint = new THREE.Vector3();
  const lerp = (a, b, t) => a + (b - a) * t;

  function update({ time, intro, pointer, scroll, width, height, instant }) {
    const ease = (rate) => (instant ? 1 : rate); // instant = jump straight to the finished state
    terrain.update(time, 0.17);

    // the line draws itself
    tubeGeometry.setDrawRange(0, Math.floor((tubeIndexCount * intro) / 6) * 6);
    shadow.geometry.setDrawRange(0, Math.floor(121 * intro));
    drops.material.opacity = 0.4 * intro;

    stations.forEach((station, i) => {
      const goal = intro >= STATIONS[i] - 0.01 ? 1 : 0;
      station.shown = lerp(station.shown, goal, ease(0.12));
      station.group.scale.setScalar(Math.max(0.001, station.shown * (1 + Math.sin(time * 1.6 + i) * 0.04)));
      station.ring.quaternion.copy(camera.quaternion);
      station.ring.scale.setScalar(1 + ((time * 0.35 + i * 0.2) % 1) * 0.9);
      station.ring.material.opacity = 0.75 * (1 - ((time * 0.35 + i * 0.2) % 1));

      const label = labels[i];
      if (label) {
        projected.copy(station.group.position).applyMatrix4(world.matrixWorld).project(camera);
        label.style.transform =
          'translate(' + ((projected.x * 0.5 + 0.5) * width).toFixed(1) + 'px,' + ((-projected.y * 0.5 + 0.5) * height).toFixed(1) + 'px)';
        label.classList.toggle('is-on', goal === 1);
      }
    });

    arrow.scale.setScalar(Math.max(0.001, lerp(arrow.scale.x, intro > 0.985 ? 1 : 0, ease(0.14))));

    const flowPositions = flowGeometry.attributes.position;
    for (let i = 0; i < FLOW; i++) {
      const t = ((flowOffsets[i] + time * flowSpeeds[i]) % 1) * intro;
      curve.getPointAt(Math.min(0.999, t), flowPoint);
      flowPositions.setXYZ(i, flowPoint.x, flowPoint.y, flowPoint.z);
    }
    flowPositions.needsUpdate = true;
    flow.material.opacity = Math.min(1, intro * 2);

    const networkIn = Math.min(1, Math.max(0, (intro - 0.25) / 0.5));
    linkMaterial.opacity = 0.17 * networkIn;
    nodeMaterial.opacity = 0.85 * networkIn;
    network.rotation.y = Math.sin(time * 0.16) * 0.07;

    bars.scale.y = Math.max(0.001, Math.min(1, Math.max(0, (intro - 0.1) / 0.7)));
    frameMaterial.opacity = 0.34 * Math.min(1, Math.max(0, (intro - 0.4) / 0.5));
    fragments.forEach((mesh, i) => {
      mesh.position.y = mesh.userData.baseY + Math.sin(time * 0.5 + i * 2.1) * 0.07;
    });

    // pointer parallax and scroll drift
    world.rotation.y = lerp(world.rotation.y, -0.16 + pointer.x * 0.2 + scroll * 0.35, ease(0.05));
    world.rotation.x = lerp(world.rotation.x, pointer.y * 0.08, ease(0.05));
    camera.position.set(baseCamera.x, baseCamera.y + scroll * 1.4, baseCamera.z);
    camera.lookAt(target);
  }

  return { layout, update };
}

/* --------------------------------------------------------------------------
   Field: quiet data surface for dark page headers
   -------------------------------------------------------------------------- */

function buildField(THREE, scene, camera) {
  const dot = dotTexture(THREE);
  scene.fog = new THREE.Fog(COLOR.deep, 7, 22);

  const terrain = makeTerrain(THREE, {
    cols: 90, rows: 30, stepX: 0.34, stepZ: 0.42, originZ: 4, y: -1.9,
    color: COLOR.sky, size: 0.06, opacity: 0.6, map: dot, additive: true,
  });
  scene.add(terrain.points);

  /* three signal lines climbing to the right */
  const SEGMENTS = 150;
  const lines = [
    { color: COLOR.sky, opacity: 0.75, z: -1.5, phase: 0, lift: 0.4 },
    { color: COLOR.blue, opacity: 0.9, z: -3.2, phase: 1.7, lift: 0.9 },
    { color: COLOR.amber, opacity: 0.5, z: -5, phase: 3.1, lift: 1.4 },
  ].map((spec) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 3), 3));
    const mesh = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: spec.color, transparent: true, opacity: 0, fog: true }));
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { ...spec, geometry, mesh };
  });

  function layout(width, height) {
    const aspect = width / height;
    camera.position.set(0, aspect < 1 ? 1.2 : 0.9, aspect < 1 ? 11 : 9);
    camera.lookAt(aspect < 1 ? 0 : 1.2, -0.2, 0);
  }

  function update({ time, intro, pointer, scroll }) {
    terrain.update(time, 0.3);
    terrain.points.material.opacity = 0.6 * intro;

    lines.forEach((spec) => {
      const p = spec.geometry.attributes.position;
      for (let i = 0; i <= SEGMENTS; i++) {
        const u = i / SEGMENTS;
        const x = (u - 0.5) * 30;
        const y = -1.5 + spec.lift + u * u * 2.6 + Math.sin(x * 0.42 + time * 0.5 + spec.phase) * 0.32 * (0.4 + u);
        p.setXYZ(i, x, y, spec.z);
      }
      p.needsUpdate = true;
      spec.geometry.setDrawRange(0, Math.floor((SEGMENTS + 1) * intro));
      spec.mesh.material.opacity = spec.opacity * intro;
    });

    scene.rotation.y += (pointer.x * 0.1 - scene.rotation.y) * 0.04;
    scene.position.y = scroll * 0.8;
  }

  return { layout, update };
}
