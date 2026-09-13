import * as THREE from "three";
// Original Scene Lab composition. All art-direction controls remain in CONFIG.
export const CONFIG = {
  paper: "#e1f4df",
  floor: "#d4c5a8",
  wall: "#fffefc",
  ink: "#0f3e17",
  sage: "#b1dbb8",
  glass: "#b6ced5",
  metal: "#64766a",
  pot: "#b79b7b",
  wood: "#a99474",
  roomWidth: 6,
  roomDepth: 5,
  wallHeight: 2.8,
  roomGap: 1,
  maxDpr: 1.5,
  cameraX: 9,
  cameraY: 9,
  cameraZ: 12,
  cameraFov: 37,
  damping: 3.2,
  exposure: 1.1,
  ambient: 2.2,
  sun: 3,
  shadowSize: 1024,
};
export function mountHallScene(
  canvas: HTMLCanvasElement,
  rooms: { name: string }[],
  onReady: () => void,
) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.maxDpr));
  renderer.setClearColor(CONFIG.paper);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CONFIG.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(CONFIG.cameraFov, 1, 0.1, 150),
    group = new THREE.Group();
  scene.add(group);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (color: string) => {
    if (!materials.has(color))
      materials.set(
        color,
        new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
      );
    return materials.get(color)!;
  };
  function mesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    color: string,
    x: number,
    y: number,
    z: number,
  ) {
    const m = new THREE.Mesh(geometry, material(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const box = (
    p: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    c: string,
    x: number,
    y: number,
    z: number,
  ) => mesh(p, new THREE.BoxGeometry(w, h, d), c, x, y, z);
  const cyl = (
    p: THREE.Object3D,
    r: number,
    h: number,
    c: string,
    x: number,
    y: number,
    z: number,
  ) => mesh(p, new THREE.CylinderGeometry(r, r, h, 16), c, x, y, z);
  const ambient = new THREE.HemisphereLight(
    CONFIG.wall,
    CONFIG.sage,
    CONFIG.ambient,
  );
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(CONFIG.wall, CONFIG.sun);
  sun.position.set(-4, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(CONFIG.shadowSize, CONFIG.shadowSize);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 15;
  sun.shadow.camera.bottom = -15;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  const stage = box(scene, 80, 0.08, 35, CONFIG.paper, 0, -0.35, 0);
  stage.castShadow = false;
  function plant(parent: THREE.Object3D, x: number, z: number) {
    cyl(parent, 0.24, 0.4, CONFIG.pot, x, 0.28, z);
    cyl(parent, 0.025, 1.4, CONFIG.wood, x, 1, z);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4,
        leaf = mesh(
          parent,
          new THREE.SphereGeometry(0.35, 8, 6),
          i % 2 ? CONFIG.sage : CONFIG.ink,
          x + Math.cos(a) * 0.25,
          1 + i * 0.1,
          z + Math.sin(a) * 0.25,
        );
      leaf.scale.set(0.4, 1.5, 0.8);
      leaf.rotation.set(Math.sin(a) * 0.6, a, 0.6);
    }
  }
  function dumbbell(parent: THREE.Object3D, x: number, y: number, z: number) {
    const handle = cyl(parent, 0.035, 0.45, CONFIG.metal, x, y, z);
    handle.rotation.z = Math.PI / 2;
    for (const offset of [-0.22, 0.22]) {
      const plate = cyl(parent, 0.14, 0.13, CONFIG.ink, x + offset, y, z);
      plate.rotation.z = Math.PI / 2;
    }
  }
  rooms.forEach((room, i) => {
    const r = new THREE.Group();
    r.position.x = i * (CONFIG.roomWidth + CONFIG.roomGap);
    group.add(r);
    box(r, 6, 0.2, 5, CONFIG.floor, 0, -0.1, 0);
    for (let p = 0; p < 17; p++)
      box(r, 0.014, 0.012, 5, CONFIG.wood, -2.85 + p * 0.35, 0.007, 0);
    box(
      r,
      6,
      CONFIG.wallHeight,
      0.15,
      CONFIG.wall,
      0,
      CONFIG.wallHeight / 2,
      -2.5,
    );
    box(r, 0.15, 1, 5, CONFIG.wall, -3, 0.5, 0);
    for (const x of [-1.9, 0, 1.9]) {
      const shape = new THREE.Shape();
      shape.moveTo(-0.67, 0);
      shape.lineTo(-0.67, 1.1);
      shape.absarc(0, 1.1, 0.67, Math.PI, 0, true);
      shape.lineTo(0.67, 0);
      shape.closePath();
      const pane = mesh(
        r,
        new THREE.ShapeGeometry(shape),
        CONFIG.glass,
        x,
        0.62,
        -2.405,
      );
      pane.castShadow = false;
      const pts = shape
        .getPoints(32)
        .map((p) => new THREE.Vector3(p.x + x, p.y + 0.62, -2.37));
      const outline = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(pts, false),
          64,
          0.025,
          6,
          false,
        ),
        material(CONFIG.ink),
      );
      r.add(outline);
      box(r, 0.03, 1.62, 0.035, CONFIG.ink, x, 1.42, -2.35);
      box(r, 1.32, 0.035, 0.04, CONFIG.ink, x, 1.72, -2.35);
      box(r, 1.48, 0.07, 0.32, CONFIG.wood, x, 0.6, -2.35);
    }
    plant(r, -2.35, -1.7);
    plant(r, 2.35, -1.75);
    if (/сил|strength/i.test(room.name)) {
      for (const x of [-1.35, 1.25]) {
        box(r, 0.7, 0.14, 1.8, CONFIG.ink, x, 0.55, 0.35);
        for (const z of [-0.3, 1])
          box(r, 0.08, 0.55, 0.08, CONFIG.metal, x, 0.25, z);
        for (const side of [-0.5, 0.5]) {
          box(r, 0.06, 1.35, 0.06, CONFIG.metal, x + side, 0.675, -0.55);
          box(r, 0.4, 0.06, 0.5, CONFIG.metal, x + side, 0.035, -0.55);
        }
        const bar = cyl(r, 0.035, 1.65, CONFIG.metal, x, 1.35, -0.55);
        bar.rotation.z = Math.PI / 2;
        for (const off of [-0.67, 0.67]) {
          const plate = cyl(r, 0.3, 0.12, CONFIG.ink, x + off, 1.35, -0.55);
          plate.rotation.z = Math.PI / 2;
        }
      }
      for (let d = 0; d < 4; d++) dumbbell(r, -2.25, 0.18, 0.1 + d * 0.5);
    } else {
      for (const x of [-1.3, 1.3])
        for (const z of [-0.35, 1.5]) {
          box(r, 1.1, 0.045, 1.55, CONFIG.sage, x, 0.04, z);
          if (/функц/i.test(room.name)) {
            dumbbell(r, x, 0.19, z);
            cyl(r, 0.16, 0.24, CONFIG.ink, x + 0.3, 0.16, z + 0.35);
          } else {
            box(r, 0.28, 0.13, 0.18, CONFIG.wood, x + 0.3, 0.12, z - 0.5);
            const roll = cyl(r, 0.1, 1, CONFIG.ink, x, 0.15, z + 0.6);
            roll.rotation.z = Math.PI / 2;
          }
        }
    }
    box(r, 1.2, 0.12, 0.4, CONFIG.wood, 0, 0.7, -2.05);
    for (const x of [-0.48, 0.48])
      box(r, 0.07, 0.7, 0.3, CONFIG.wood, x, 0.35, -2.05);
  });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)"),
    target = new THREE.Vector3(0, 0.65, 0),
    look = target.clone(),
    desired = new THREE.Vector3(CONFIG.cameraX, CONFIG.cameraY, CONFIG.cameraZ);
  camera.position.copy(desired).add(new THREE.Vector3(0, 3, 2));
  let raf = 0,
    last = performance.now(),
    visible = true,
    disposed = false,
    ready = false;
  function draw(now: number) {
    raf = 0;
    if (disposed || !visible || document.hidden) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const k = reduced.matches ? 1 : 1 - Math.exp(-CONFIG.damping * dt);
    camera.position.lerp(desired, k);
    look.lerp(target, k);
    camera.lookAt(look);
    renderer.render(scene, camera);
    if (!ready) {
      ready = true;
      onReady();
    }
    if (
      camera.position.distanceTo(desired) > 0.004 ||
      look.distanceTo(target) > 0.004
    )
      raf = requestAnimationFrame(draw);
  }
  const wake = () => {
    if (!disposed && !raf && visible && !document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(draw);
    }
  };
  const resize = () => {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    wake();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => {
    visible = !!e?.isIntersecting;
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
  reduced.addEventListener("change", wake);
  resize();
  wake();
  return {
    select(index: number) {
      const x =
        Math.max(0, Math.min(rooms.length - 1, index)) *
        (CONFIG.roomWidth + CONFIG.roomGap);
      target.set(x, 0.65, 0);
      desired.set(x + CONFIG.cameraX, CONFIG.cameraY, CONFIG.cameraZ);
      wake();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", wake);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      materials.forEach((m) => m.dispose());
      sun.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
