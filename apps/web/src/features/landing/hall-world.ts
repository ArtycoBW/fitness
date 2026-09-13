import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Reflector } from "three/addons/objects/Reflector.js";

// Interior authored for Stride. Split studio environment and physical metal treatment
// adapted from GetLayers Onyx Cubes; CC0 maps are credited in public/media/halls/LICENSE.md.
export const CONFIG = {
  wall: "#e5e1d6",
  ceiling: "#ebe9df",
  oak: "#d7bd93",
  rubber: "#292d2c",
  steel: "#313836",
  chrome: "#bfc6c5",
  upholstery: "#25392e",
  mat: "#536452",
  daylight: "#f8f0df",
  environment: "#565c54",
  floor: "#fff2d7",
  exposure: 1.04,
  roughness: 0.25,
  metalness: 0.92,
  clearcoat: 0.35,
  maxDpr: 1.5,
  fov: 62,
  camera: [2.5, 2.3, 5.8] as const,
};

export function mountHallScene(
  canvas: HTMLCanvasElement,
  rooms: { name: string }[],
  onReady: () => void,
) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.maxDpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CONFIG.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.wall);
  const camera = new THREE.PerspectiveCamera(CONFIG.fov, 1, 0.08, 60);
  camera.position.set(...CONFIG.camera);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1.2, -1.7);
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minAzimuthAngle = -0.48;
  controls.maxAzimuthAngle = 0.52;
  controls.minPolarAngle = 1.13;
  controls.maxPolarAngle = 1.55;
  controls.rotateSpeed = 0.45;
  // Vertical swipes and wheel remain page scrolling; horizontal drag explores the room.
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  canvas.style.touchAction = "pan-y";
  const textures: THREE.Texture[] = [],
    geometries: THREE.BufferGeometry[] = [],
    materials: THREE.Material[] = [];
  const mirrors: Reflector[] = [];
  let disposed = false,
    visible = true,
    raf = 0,
    prepared = false;
  const wake = () => {
    if (!disposed && visible && !document.hidden && !raf)
      raf = requestAnimationFrame(draw);
  };
  const loader = new THREE.TextureLoader();
  const texture = (url: string, color = false) => {
    const t = loader.load(url, wake);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 4);
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    textures.push(t);
    return t;
  };
  const material = (parameters: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial(parameters);
    materials.push(m);
    return m;
  };
  const wall = material({ color: CONFIG.wall, roughness: 0.92 });
  const oak = material({
    color: CONFIG.floor,
    map: texture("/media/halls/oak-color.jpg", true),
    normalMap: texture("/media/halls/oak-normal.jpg"),
    normalScale: new THREE.Vector2(0.3, 0.3),
    roughnessMap: texture("/media/halls/oak-roughness.jpg"),
    roughness: 0.78,
  });
  const wood = material({ color: CONFIG.oak, roughness: 0.62, map: oak.map });
  const rubber = material({ color: CONFIG.rubber, roughness: 0.92 });
  const fabric = material({ color: CONFIG.upholstery, roughness: 0.84 });
  const sage = material({ color: CONFIG.mat, roughness: 0.93 });
  const chrome = new THREE.MeshPhysicalMaterial({
    color: CONFIG.chrome,
    metalness: CONFIG.metalness,
    roughness: CONFIG.roughness,
    clearcoat: CONFIG.clearcoat,
  });
  materials.push(chrome);
  const steel = material({
    color: CONFIG.steel,
    metalness: 0.72,
    roughness: 0.38,
  });
  const light = new THREE.MeshBasicMaterial({
    color: CONFIG.daylight,
    toneMapped: false,
  });
  materials.push(light);
  const mesh = (
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    geometries.push(geometry);
    const m = new THREE.Mesh(geometry, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const box = (
    p: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    m: THREE.Material,
    bevel = 0.015,
  ) =>
    mesh(
      p,
      bevel
        ? new RoundedBoxGeometry(
            w,
            h,
            d,
            2,
            Math.min(bevel, w / 4, h / 4, d / 4),
          )
        : new THREE.BoxGeometry(w, h, d),
      m,
      x,
      y,
      z,
    );
  const cylinder = (
    p: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    m: THREE.Material,
    segments = 32,
  ) => mesh(p, new THREE.CylinderGeometry(r, r, h, segments), m, x, y, z);
  const rod = (
    p: THREE.Object3D,
    a: number[],
    b: number[],
    radius: number,
    mat: THREE.Material,
  ) => {
    const from = new THREE.Vector3(...a),
      to = new THREE.Vector3(...b),
      delta = to.clone().sub(from);
    const m = cylinder(
      p,
      (a[0]! + b[0]!) / 2,
      (a[1]! + b[1]!) / 2,
      (a[2]! + b[2]!) / 2,
      radius,
      delta.length(),
      mat,
    );
    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return m;
  };
  // GetLayers split-environment rig: reflected luminous panels, separate from camera background.
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(CONFIG.environment);
  for (const [x, y, z, w, h, energy, ry, rx] of [
    [-7, 3, 0, 12, 5, 6, Math.PI / 2, 0],
    [0, 7, 0, 9, 10, 3, 0, Math.PI / 2],
    [3, 3, 6, 4, 6, 1.2, 0, 0],
  ]) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(energy!, energy!, energy!),
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    m.position.set(x!, y!, z!);
    m.rotation.set(rx!, ry!, 0);
    envScene.add(m);
  }
  const pmrem = new THREE.PMREMGenerator(renderer),
    environment = pmrem.fromScene(envScene, 0.05);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.6;
  envScene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight("#faf5e8", "#655e4d", 1.15));
  const sun = new THREE.DirectionalLight(CONFIG.daylight, 3.4);
  sun.position.set(-6, 6, 2);
  sun.target.position.set(1, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -9;
  sun.shadow.camera.far = 30;
  sun.shadow.normalBias = 0.025;
  sun.shadow.bias = -0.0002;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight("#dae4eb", 0.65);
  fill.position.set(4, 3, 5);
  scene.add(fill);

  const dumbbell = (
    p: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    size = 1,
  ) => {
    rod(p, [x - 0.22, y, z], [x + 0.22, y, z], 0.023, chrome);
    for (const dx of [-0.22, 0.22]) {
      const head = cylinder(
        p,
        x + dx,
        y,
        z,
        0.105 * size,
        0.13 * size,
        rubber,
        6,
      );
      head.rotation.z = Math.PI / 2;
      const cap = cylinder(p, x + dx * 1.35, y, z, 0.04, 0.005, steel);
      cap.rotation.z = Math.PI / 2;
    }
  };
  const bench = (p: THREE.Object3D, x: number, z: number, turn = 0) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = turn;
    p.add(g);
    box(g, 0, 0.27, 0, 0.08, 0.1, 1.45, steel);
    box(g, 0, 0.51, -0.3, 0.34, 0.12, 1.03, fabric, 0.04);
    box(g, 0, 0.51, 0.4, 0.36, 0.12, 0.36, fabric, 0.045);
    for (const zz of [-0.6, 0.55]) {
      box(g, 0, 0.05, zz, 0.7, 0.08, 0.13, steel);
      rod(g, [0, 0.09, zz], [0, 0.46, zz + 0.1], 0.04, steel);
      for (const xx of [-0.3, 0.3])
        box(g, xx, 0.04, zz, 0.12, 0.08, 0.18, rubber);
    }
    box(g, 0, 0.39, -0.28, 0.06, 0.07, 0.84, chrome);
  };
  const rack = (p: THREE.Object3D, x: number, z: number) => {
    for (const xx of [-0.68, 0.68])
      for (const zz of [-0.42, 0.42]) {
        box(p, x + xx, 1.22, z + zz, 0.075, 2.44, 0.075, steel);
        box(p, x + xx, 0.045, z + zz, 0.27, 0.09, 0.28, steel);
        for (let h = 0.38; h < 2.15; h += 0.14) {
          const bolt = cylinder(
            p,
            x + xx,
            h,
            z + zz + 0.042,
            0.012,
            0.005,
            chrome,
            12,
          );
          bolt.rotation.x = Math.PI / 2;
        }
      }
    for (const zz of [-0.42, 0.42])
      box(p, x, 2.4, z + zz, 1.43, 0.07, 0.07, steel);
    for (const xx of [-0.68, 0.68])
      box(p, x + xx, 2.4, z, 0.075, 0.075, 0.9, steel);
    rod(p, [x - 0.72, 2.24, z + 0.5], [x + 0.72, 2.24, z + 0.5], 0.025, chrome);
    rod(
      p,
      [x - 1.08, 1.38, z + 0.43],
      [x + 1.08, 1.38, z + 0.43],
      0.021,
      chrome,
    );
    for (const side of [-1, 1])
      for (let n = 0; n < 3; n++) {
        const plate = cylinder(
          p,
          x + side * (0.79 + n * 0.065),
          1.38,
          z + 0.43,
          0.225 - n * 0.035,
          0.06,
          rubber,
        );
        plate.rotation.z = Math.PI / 2;
        const ring = mesh(
          p,
          new THREE.TorusGeometry(0.19 - n * 0.035, 0.004, 6, 32),
          steel,
          x + side * (0.825 + n * 0.065),
          1.38,
          z + 0.43,
        );
        ring.rotation.y = Math.PI / 2;
      }
    bench(p, x, z + 1.25);
  };
  const cableMachine = (p: THREE.Object3D, x: number, z: number) => {
    for (const xx of [-0.65, 0.65]) {
      box(p, x + xx, 1.24, z, 0.095, 2.48, 0.14, steel);
      box(p, x + xx, 0.06, z + 0.23, 0.48, 0.1, 0.85, steel);
      for (let n = 0; n < 16; n++)
        box(p, x + xx, 0.19 + n * 0.045, z, 0.36, 0.035, 0.22, rubber, 0.007);
      rod(p, [x + xx, 0.28, z + 0.15], [x + xx, 2.24, z + 0.15], 0.012, chrome);
      const pulley = cylinder(p, x + xx, 2.22, z + 0.2, 0.08, 0.045, steel);
      pulley.rotation.x = Math.PI / 2;
      rod(p, [x + xx, 2.22, z + 0.23], [x + xx, 1.23, z + 0.46], 0.004, rubber);
      rod(
        p,
        [x + xx - 0.11, 1.2, z + 0.46],
        [x + xx + 0.11, 1.2, z + 0.46],
        0.023,
        rubber,
      );
    }
    box(p, x, 2.45, z, 1.44, 0.13, 0.2, steel);
    box(p, x, 0.16, z, 1.4, 0.09, 0.14, steel);
  };
  const reformer = (p: THREE.Object3D, x: number, z: number) => {
    for (const xx of [-0.39, 0.39]) {
      box(p, x + xx, 0.38, z, 0.09, 0.2, 2.5, wood);
      rod(p, [x + xx, 0.51, z - 1.1], [x + xx, 0.51, z + 1.1], 0.019, chrome);
    }
    for (const zz of [-1, 1])
      for (const xx of [-0.35, 0.35])
        box(p, x + xx, 0.16, z + zz, 0.13, 0.3, 0.14, wood);
    box(p, x, 0.53, z, 0.69, 0.14, 1.17, fabric, 0.035);
    for (const xx of [-0.22, 0.22]) {
      box(p, x + xx, 0.68, z - 0.45, 0.14, 0.21, 0.21, fabric, 0.045);
      rod(p, [x + xx, 0.4, z - 1.14], [x + xx, 0.83, z - 1.14], 0.021, chrome);
    }
    rod(p, [x - 0.35, 0.58, z + 1], [x - 0.35, 0.96, z + 0.8], 0.023, chrome);
    rod(p, [x + 0.35, 0.58, z + 1], [x + 0.35, 0.96, z + 0.8], 0.023, chrome);
    rod(p, [x - 0.35, 0.96, z + 0.8], [x + 0.35, 0.96, z + 0.8], 0.035, rubber);
    for (const xx of [-0.22, -0.11, 0, 0.11, 0.22])
      rod(p, [x + xx, 0.37, z + 0.57], [x + xx, 0.37, z + 1.12], 0.009, chrome);
  };
  const groups = rooms.map((room) => {
    const g = new THREE.Group();
    scene.add(g);
    g.visible = false;
    box(g, 0, -0.09, 0, 10, 0.18, 13, oak, 0);
    box(g, 0, 1.9, -6.1, 10, 3.8, 0.16, wall, 0);
    box(g, 5.05, 1.9, 0, 0.16, 3.8, 12.3, wall, 0);
    box(
      g,
      0,
      3.9,
      -0.3,
      10.2,
      0.18,
      12.2,
      material({ color: CONFIG.ceiling, roughness: 1 }),
      0,
    );
    for (let z = -5; z < 6; z += 2.2) {
      box(g, -5, 1.9, z, 0.08, 3.8, 0.07, steel, 0);
      const pane = box(g, -5.08, 1.98, z + 0.95, 0.045, 3.2, 1.85, light, 0);
      pane.castShadow = false;
      box(g, -4.93, 0.35, z + 0.95, 0.3, 0.1, 1.95, wood);
    }
    for (const y of [0.42, 2, 3.58])
      box(g, -4.96, y, 0, 0.1, 0.06, 12, steel, 0);
    for (let z = -4; z < 6; z += 3) {
      box(g, 0, 3.77, z, 8, 0.09, 0.12, steel);
      box(g, 0, 3.72, z, 7.8, 0.018, 0.06, light, 0);
    }
    for (let x = -4.8; x < -2.7; x += 0.13)
      box(g, x, 1.9, -5.97, 0.045, 3.8, 0.07, wood, 0);
    for (const z of [-6, 6]) box(g, 0, 0.09, z, 10, 0.18, 0.04, wood, 0);
    box(g, 4.94, 0.09, 0, 0.04, 0.18, 12, wood, 0);
    const mirror = new Reflector(new THREE.PlaneGeometry(5.7, 2.5), {
      textureWidth: 1024,
      textureHeight: 512,
      color: "#c2c9c5",
      clipBias: 0.003,
    });
    mirror.position.set(0.75, 1.85, -5.995);
    g.add(mirror);
    mirrors.push(mirror);
    for (const y of [0.57, 3.13])
      box(g, 0.75, y, -5.95, 5.82, 0.045, 0.045, chrome);
    if (/сил|strength/i.test(room.name)) {
      for (let x = -3; x < 4; x++)
        for (let z = -5; z < 5; z++)
          box(g, x + 0.48, 0.008, z + 0.48, 0.988, 0.016, 0.988, rubber, 0.005);
      rack(g, -1.6, -3.7);
      rack(g, 1.55, -3.7);
      for (const x of [-0.8, 2.8]) {
        bench(g, x, 2.1, -0.3);
      }
      for (const z of [-2.2, 0.2, 2.6]) {
        for (const zz of [-0.75, 0.75])
          box(g, 4.14, 0.55, z + zz, 0.4, 1.1, 0.07, steel);
        for (const y of [0.52, 0.93]) {
          box(g, 4.05, y, z, 0.65, 0.065, 1.72, steel);
          for (let j = 0; j < 4; j++) {
            const sub = new THREE.Group();
            sub.position.set(4, y + 0.14, z - 0.62 + j * 0.42);
            sub.rotation.y = Math.PI / 2;
            g.add(sub);
            dumbbell(sub, 0, 0, 0, 0.85 + j * 0.15);
          }
        }
      }
    } else if (/персон|personal/i.test(room.name)) {
      cableMachine(g, 2.1, -4.8);
      reformer(g, -1.8, -0.7);
      bench(g, 2.1, -0.8, -0.25);
      box(g, 1.9, 0.014, 2.2, 2, 0.027, 2.4, sage);
      const ball = mesh(
        g,
        new THREE.SphereGeometry(0.33, 48, 32),
        sage,
        3.5,
        0.33,
        -3.7,
      );
      for (let i = 0; i < 12; i++) {
        const y = -0.28 + i * 0.05,
          radius = Math.sqrt(0.33 ** 2 - y ** 2);
        const ring = mesh(
          g,
          new THREE.TorusGeometry(radius, 0.002, 4, 48),
          fabric,
          ball.position.x,
          0.33 + y,
          ball.position.z,
        );
        ring.rotation.x = Math.PI / 2;
      }
    } else {
      for (const x of [-2.4, 0.1, 2.6])
        for (const z of [-2.4, 1.1]) {
          box(g, x, 0.014, z, 0.72, 0.028, 1.88, sage, 0.015);
          for (const dx of [-0.14, 0.14])
            box(g, x + dx, 0.12, z - 1.12, 0.12, 0.22, 0.23, wood, 0.01);
          const bolster = cylinder(g, x, 0.125, z + 1.08, 0.12, 0.55, fabric);
          bolster.rotation.z = Math.PI / 2;
        }
      box(g, 4.55, 1.06, -0.5, 0.06, 0.06, 7.2, wood);
      for (const z of [-3, 1, 3])
        rod(g, [4.9, 1.02, z], [4.55, 1.06, z], 0.012, chrome);
    }
    // Built-in bench, folded cotton towels and cubbies give the interior human scale.
    box(g, -3.7, 0.42, -5.4, 2.15, 0.08, 0.6, wood);
    for (const x of [-4.6, -3.7, -2.8])
      box(g, x, 0.21, -5.4, 0.05, 0.42, 0.58, wood);
    for (let n = 0; n < 3; n++)
      box(g, -3.7, 0.5 + n * 0.045, -5.4, 0.42, 0.045, 0.3, wall, 0.02);
    return g;
  });
  if (groups[0]) groups[0].visible = true;
  controls.update();
  controls.saveState();
  function draw() {
    raf = 0;
    if (disposed || !visible || document.hidden) return;
    const changed = controls.update();
    renderer.render(scene, camera);
    if (!prepared) {
      prepared = true;
      onReady();
    }
    if (changed) wake();
  }
  const resize = () => {
    if (!canvas.clientWidth || !canvas.clientHeight) return;
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    wake();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting;
    if (visible) wake();
    else {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });
  io.observe(canvas);
  const visibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else wake();
  };
  document.addEventListener("visibilitychange", visibility);
  controls.addEventListener("change", wake);
  resize();
  return {
    select(index: number) {
      groups.forEach((g, i) => {
        g.visible = i === index;
      });
      controls.reset();
      wake();
    },
    reset() {
      camera.fov = CONFIG.fov;
      camera.updateProjectionMatrix();
      controls.reset();
      wake();
    },
    turn(direction: number) {
      const offset = camera.position.clone().sub(controls.target),
        spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta = THREE.MathUtils.clamp(
        spherical.theta + direction * 0.18,
        controls.minAzimuthAngle,
        controls.maxAzimuthAngle,
      );
      camera.position
        .copy(controls.target)
        .add(new THREE.Vector3().setFromSpherical(spherical));
      controls.update();
      wake();
    },
    zoom(delta: number) {
      camera.fov = THREE.MathUtils.clamp(camera.fov + delta, 42, 72);
      camera.updateProjectionMatrix();
      wake();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      controls.dispose();
      mirrors.forEach((m) => {
        m.getRenderTarget().dispose();
        m.geometry.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) =>
          mat.dispose(),
        );
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      environment.dispose();
      sun.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
