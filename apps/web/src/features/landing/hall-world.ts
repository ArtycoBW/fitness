import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const MODEL_PATHS = {
  strength: "/media/halls/strength-room.glb",
  balance: "/media/halls/balance-studio.glb",
  personal: "/media/halls/personal-studio.glb",
} as const;

function modelFor(name: string) {
  if (/сил|strength/i.test(name)) return MODEL_PATHS.strength;
  if (/персон|personal/i.test(name)) return MODEL_PATHS.personal;
  return MODEL_PATHS.balance;
}

export function mountHallScene(
  canvas: HTMLCanvasElement,
  rooms: { name: string }[],
  onReady: () => void,
  onFailure: () => void,
) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#dcded4");
  const camera = new THREE.PerspectiveCamera(63, 1, 0.08, 60);
  camera.position.set(1.15, 1.78, 5.75);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1.5, -1.55);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minAzimuthAngle = -0.52;
  controls.maxAzimuthAngle = 0.52;
  controls.minPolarAngle = 1.32;
  controls.maxPolarAngle = 1.6;
  controls.rotateSpeed = 0.42;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  canvas.style.touchAction = "pan-y";
  controls.update();
  controls.saveState();
  function setView(index: number) {
    const name = rooms[index]?.name ?? "";
    const position = /сил|strength/i.test(name)
      ? [-0.15, 1.72, 2.55]
      : /персон|personal/i.test(name)
        ? [0.82, 1.68, 3.1]
        : [0.42, 1.64, 3.65];
    const target = /сил|strength/i.test(name)
      ? [-1.2, 1.28, -1.65]
      : /персон|personal/i.test(name)
        ? [-1.05, 1.08, -0.75]
        : [0, 0.85, -1.1];
    camera.position.set(...(position as [number, number, number]));
    controls.target.set(...(target as [number, number, number]));
    camera.fov = 61;
    camera.updateProjectionMatrix();
    controls.update();
    controls.saveState();
  }
  setView(0);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const environment = pmrem.fromScene(roomEnvironment, 0.045);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.45;
  roomEnvironment.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight("#faf6ea", "#89918a", 0.68));
  const sun = new THREE.DirectionalLight("#fff0d6", 3.1);
  sun.position.set(-5.8, 8.5, 4);
  sun.target.position.set(0, 0.6, -1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -9;
  sun.shadow.camera.far = 30;
  sun.shadow.normalBias = 0.02;
  sun.shadow.bias = -0.00025;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight("#dce7e2", 0.38);
  fill.position.set(3, 3.5, 5);
  scene.add(fill);
  // Postprocessing uses its own render target; multisampling keeps the rack,
  // window mullions and equipment edges sharp at landing-page scale.
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const occlusion = new GTAOPass(scene, camera);
  occlusion.blendIntensity = 0.62;
  occlusion.updateGtaoMaterial({ radius: 0.24, distanceExponent: 1.2, thickness: 1.1 });
  composer.addPass(occlusion);
  const output = new OutputPass();
  composer.addPass(output);

  const models: Array<THREE.Group | undefined> = new Array(rooms.length);
  const mirrors: Reflector[] = [];
  const loader = new GLTFLoader();
  let selected = 0;
  let displayed = -1;
  let disposed = false;
  let visible = false;
  let prepared = false;
  let raf = 0;

  function wake() {
    if (!disposed && visible && !document.hidden && !raf) raf = requestAnimationFrame(draw);
  }
  function draw() {
    raf = 0;
    if (disposed || !visible || document.hidden) return;
    const changed = controls.update();
    composer.render();
    if (!prepared && displayed >= 0) {
      prepared = true;
      onReady();
    }
    if (changed) wake();
  }
  function show(index: number) {
    if (!models[index]) return;
    models.forEach((model, i) => { if (model) model.visible = i === index; });
    displayed = index;
    renderer.shadowMap.needsUpdate = true;
    wake();
  }
  function disposeModel(root: THREE.Object3D) {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object instanceof Reflector) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.map?.dispose();
          material.normalMap?.dispose();
          material.roughnessMap?.dispose();
          material.metalnessMap?.dispose();
        }
        material.dispose();
      }
    });
  }

  rooms.forEach((room, index) => {
    loader.load(modelFor(room.name), (gltf) => {
      if (disposed) { disposeModel(gltf.scene); return; }
      const model = gltf.scene;
      model.visible = false;
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const name = object.name.toLowerCase();
        object.receiveShadow = !/glass|mirror|foliage|lamp/.test(name);
        object.castShadow = !/floor|wall|ceiling|window|courtyard|mirror|skirting|plank|rubber tile|lamp/.test(name);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.envMapIntensity = 0.72;
            if (material.map) material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          }
        }
      });
      const reflection = new Reflector(new THREE.PlaneGeometry(5.32, 2.45), {
        textureWidth: 768,
        textureHeight: 384,
        color: "#bfc7c0",
        clipBias: 0.003,
      });
      reflection.position.set(1.63, 1.93, -5.77);
      model.add(reflection);
      mirrors.push(reflection);
      scene.add(model);
      models[index] = model;
      if (index === selected) show(index);
    }, undefined, () => {
      if (!disposed && index === selected && displayed < 0) onFailure();
    });
  });

  function resize() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    wake();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting;
    if (visible) wake();
    else { cancelAnimationFrame(raf); raf = 0; }
  }, { rootMargin: "140px 0px", threshold: 0 });
  io.observe(canvas);
  const visibility = () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else wake();
  };
  document.addEventListener("visibilitychange", visibility);
  controls.addEventListener("change", wake);
  canvas.addEventListener("webglcontextlost", onFailure);
  resize();

  return {
    select(index: number) {
      selected = index;
      show(index);
      setView(index);
      wake();
    },
    reset() {
      setView(selected);
      wake();
    },
    turn(direction: number) {
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta = THREE.MathUtils.clamp(spherical.theta + direction * 0.19, controls.minAzimuthAngle, controls.maxAzimuthAngle);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      controls.update();
      wake();
    },
    zoom(delta: number) {
      camera.fov = THREE.MathUtils.clamp(camera.fov + delta, 42, 64);
      camera.updateProjectionMatrix();
      wake();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("webglcontextlost", onFailure);
      controls.dispose();
      models.forEach((model) => { if (model) disposeModel(model); });
      mirrors.forEach((mirror) => {
        mirror.getRenderTarget().dispose();
        mirror.geometry.dispose();
        (Array.isArray(mirror.material) ? mirror.material : [mirror.material]).forEach((material) => material.dispose());
      });
      environment.dispose();
      occlusion.dispose();
      output.dispose();
      composer.dispose();
      sun.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
