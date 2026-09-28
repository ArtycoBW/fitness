"use client";

import { useEffect, useRef } from "react";

const PHI = (1 + Math.sqrt(5)) / 2;
const VERTICES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
  [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
  [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1],
];

// The supplied Molecule scene's icosahedral cage, adapted for a short,
// first-visit introduction without its full-page scroll or controls.
export function MoleculeIntro() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let disposed = false;
    let disposeScene = () => {};

    void import("three").then((THREE) => {
      if (disposed) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({
          canvas: element,
          alpha: true,
          antialias: false,
          powerPreference: "low-power",
        });
      } catch {
        return;
      }

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 30);
      camera.position.z = 8.5;
      const cage = new THREE.Group();
      scene.add(cage);
      const atoms = VERTICES.map(([x, y, z]) => {
        const length = Math.hypot(x, y, z);
        return new THREE.Vector3((x / length) * 2.55, (y / length) * 2.55, (z / length) * 2.55);
      });
      const edgeLength = Math.min(...atoms.flatMap((a, i) => atoms.slice(i + 1).map((b) => a.distanceTo(b))));
      const edges: Array<[number, number]> = [];
      atoms.forEach((a, i) => atoms.forEach((b, j) => {
        if (j > i && a.distanceTo(b) < edgeLength * 1.05) edges.push([i, j]);
      }));

      const positions: number[] = [];
      const scales: number[] = [];
      const kinds: number[] = [];
      const addPoint = (point: InstanceType<typeof THREE.Vector3>, scale: number, kind: number) => {
        positions.push(point.x, point.y, point.z);
        scales.push(scale);
        kinds.push(kind);
      };
      for (const atom of atoms) {
        for (let i = 0; i < 280; i++) {
          const z = Math.random() * 2 - 1;
          const angle = Math.random() * Math.PI * 2;
          const radial = Math.sqrt(1 - z * z);
          const radius = 0.12 + Math.pow(Math.random(), 0.7) * 0.17;
          addPoint(new THREE.Vector3(
            atom.x + radial * Math.cos(angle) * radius,
            atom.y + radial * Math.sin(angle) * radius,
            atom.z + z * radius,
          ), 0.5 + Math.random() * 0.8, 0);
        }
      }
      const bondSegments: number[] = [];
      for (const [start, end] of edges) {
        const a = atoms[start]!, b = atoms[end]!;
        bondSegments.push(a.x, a.y, a.z, b.x, b.y, b.z);
        for (let i = 0; i < 24; i++) {
          addPoint(a.clone().lerp(b, 0.08 + Math.random() * 0.84), 0.25 + Math.random() * 0.25, 1);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("aScale", new THREE.Float32BufferAttribute(scales, 1));
      geometry.setAttribute("aBond", new THREE.Float32BufferAttribute(kinds, 1));
      const uniforms = { uTime: { value: 0 }, uOpacity: { value: 0 } };
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms,
        vertexShader: `
          uniform float uTime;
          attribute float aScale;
          attribute float aBond;
          varying float vBond;
          void main() {
            vBond = aBond;
            vec3 wobble = vec3(
              sin(uTime * 1.2 + aScale * 19.0),
              cos(uTime * 1.4 + aScale * 13.0),
              sin(uTime + aScale * 17.0)
            ) * 0.023;
            vec4 view = modelViewMatrix * vec4(position + wobble, 1.0);
            gl_Position = projectionMatrix * view;
            gl_PointSize = min(8.0, (aBond > 0.5 ? 5.0 : 9.0) * aScale * 6.0 / -view.z);
          }
        `,
        fragmentShader: `
          uniform float uOpacity;
          varying float vBond;
          void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;
            float glow = pow(1.0 - d * 2.0, 2.2);
            vec3 color = vBond > 0.5 ? vec3(0.96, 0.76, 0.40) : mix(vec3(0.26, 0.84, 0.58), vec3(0.92, 1.0, 0.86), glow);
            gl_FragColor = vec4(color * 1.15, glow * uOpacity * 0.72);
          }
        `,
      });
      const particles = new THREE.Points(geometry, material);
      cage.add(particles);
      const linesGeometry = new THREE.BufferGeometry();
      linesGeometry.setAttribute("position", new THREE.Float32BufferAttribute(bondSegments, 3));
      const linesMaterial = new THREE.LineBasicMaterial({ color: 0xc9aa6b, transparent: true, opacity: 0.38 });
      cage.add(new THREE.LineSegments(linesGeometry, linesMaterial));

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const pointer = { x: 0, y: 0 };
      const onPointer = (event: PointerEvent) => {
        pointer.x = (event.clientX / innerWidth - 0.5) * 0.2;
        pointer.y = (event.clientY / innerHeight - 0.5) * 0.15;
      };
      if (!reducedMotion) window.addEventListener("pointermove", onPointer, { passive: true });
      const resize = () => {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(rect.width, rect.height, false);
        camera.aspect = rect.width / rect.height;
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(element);
      resize();
      const started = performance.now();
      let frame = 0;
      const render = () => {
        const elapsed = (performance.now() - started) / 1000;
        uniforms.uTime.value = elapsed;
        uniforms.uOpacity.value = Math.min(1, elapsed * 1.7);
        cage.rotation.y = elapsed * (reducedMotion ? 0 : 0.3) + pointer.x;
        cage.rotation.x = -0.16 + Math.sin(elapsed * 0.5) * (reducedMotion ? 0 : 0.08) + pointer.y;
        renderer.render(scene, camera);
        if (!reducedMotion) frame = requestAnimationFrame(render);
      };
      render();
      disposeScene = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        window.removeEventListener("pointermove", onPointer);
        geometry.dispose();
        material.dispose();
        linesGeometry.dispose();
        linesMaterial.dispose();
        renderer.dispose();
      };
    }).catch(() => {});

    return () => {
      disposed = true;
      disposeScene();
    };
  }, []);

  return <canvas className="site-intro-molecule" ref={canvas} aria-hidden="true" />;
}
