"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Pause, Play, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";
type GalleryImage = { src: string; alt: string };
// The supplied photography gallery's depth and cloth shader use the existing
// Three.js runtime. Events stay local and never trap page scrolling.
export default function InfiniteGallery({
  images,
  active,
  onActive,
}: {
  images: GalleryImage[];
  active: number;
  onActive: (index: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<{
    select: (n: number) => void;
    pause: (v: boolean) => void;
  } | null>(null);
  const selected = useRef(active),
    onChange = useRef(onActive);
  const [ready, setReady] = useState(false),
    [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    onChange.current = onActive;
  }, [onActive]);
  useEffect(() => {
    if (selected.current !== active) scene.current?.select(active);
    selected.current = active;
  }, [active]);
  useEffect(() => {
    scene.current?.pause(paused || !!reduced);
  }, [paused, reduced]);
  useEffect(() => {
    const element = host.current,
      node = canvas.current;
    if (!element || !node || !images.length) return;
    let disposed = false,
      cleanup: (() => void) | undefined,
      started = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || started) return;
        started = true;
        void Promise.all([import("three"), import("./gallery-material")])
          .then(async ([T, { createClothMaterial }]) => {
            if (disposed) return;
            const renderer = new T.WebGLRenderer({
              canvas: node,
              antialias: true,
              alpha: true,
            });
            renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
            renderer.outputColorSpace = T.SRGBColorSpace;
            const world = new T.Scene(),
              camera = new T.PerspectiveCamera(48, 1, 0.1, 60);
            camera.position.z = 5;
            const loaded = await Promise.allSettled(
              images.map(async (image) => {
                const t = await new T.TextureLoader().loadAsync(image.src);
                t.colorSpace = T.SRGBColorSpace;
                return t;
              }),
            );
            const textures = loaded.flatMap((result) =>
              result.status === "fulfilled" ? [result.value] : [],
            );
            if (disposed || textures.length !== images.length) {
              textures.forEach((t) => t.dispose());
              renderer.dispose();
              return;
            }
            const geometry = new T.PlaneGeometry(1, 1, 28, 28);
            const planes = textures.map((texture, index) => {
              const material = createClothMaterial();
              material.uniforms.map!.value = texture;
              material.depthWrite = false;
              const mesh = new T.Mesh(geometry, material);
              world.add(mesh);
              return { mesh, material, index };
            });
            let offset = selected.current,
              target = offset,
              stop = !!reduced,
              raf = 0,
              visible = true,
              last = 0,
              previousTime = 0;
            const count = images.length;
            const render = (time: number) => {
              if (disposed) return;
              const dt = Math.min((time - previousTime) / 1000 || 0.016, 0.04);
              previousTime = time;
              if (visible && !document.hidden) {
                if (!stop && time - last > 6500) {
                  target = Math.round(target) + 1;
                  last = time;
                }
                offset = reduced
                  ? target
                  : T.MathUtils.damp(offset, target, 2.8, dt);
                const current = ((Math.round(offset) % count) + count) % count;
                if (
                  Math.abs(target - offset) < 0.05 &&
                  current !== selected.current
                ) {
                  selected.current = current;
                  onChange.current(current);
                }
                const mobile = camera.aspect < 1;
                planes.forEach(({ mesh, material, index }) => {
                  const depth =
                    ((index - offset + count * 10 + count / 2) % count) -
                    count / 2;
                  const focus = Math.max(0, 1 - Math.abs(depth));
                  mesh.position.set(
                    (mobile ? 0 : 1.55) +
                      Math.sin(depth * 0.9) * (mobile ? 2.2 : 3.1),
                    0.2 + Math.sin(depth * 1.7) * 0.65,
                    -Math.abs(depth) * 3.5,
                  );
                  mesh.rotation.y = -depth * 0.12;
                  mesh.rotation.z = Math.sin(depth) * 0.045;
                  const aspect =
                    textures[index]!.image.width /
                    textures[index]!.image.height;
                  mesh.scale.set(
                    (mobile ? 2.35 : 3.45) * aspect,
                    mobile ? 2.35 : 3.45,
                    1,
                  );
                  material.uniforms.opacity!.value = 0.3 + focus * 0.7;
                  material.uniforms.blurAmount!.value = Math.min(
                    2.5,
                    Math.abs(depth) * 1.3,
                  );
                  material.uniforms.time!.value = time * 0.001;
                  material.uniforms.scrollForce!.value = reduced
                    ? 0
                    : (target - offset) * 0.12;
                  mesh.renderOrder = Math.round(100 - Math.abs(depth) * 10);
                });
                renderer.render(world, camera);
              }
              raf = requestAnimationFrame(render);
            };
            const resize = () => {
              const { width, height } = element.getBoundingClientRect();
              renderer.setSize(width, height, false);
              camera.aspect = width / height;
              camera.updateProjectionMatrix();
            };
            const ro = new ResizeObserver(resize);
            ro.observe(element);
            resize();
            const visibility = new IntersectionObserver(([e]) => {
              visible = !!e?.isIntersecting;
            });
            visibility.observe(element);
            const hover = () => {
              planes.forEach(
                (p) =>
                  (p.material.uniforms.isHovered!.value =
                    p.index === selected.current && !reduced ? 1 : 0),
              );
            };
            const leave = () => {
              planes.forEach((p) => (p.material.uniforms.isHovered!.value = 0));
            };
            node.addEventListener("pointermove", hover);
            node.addEventListener("pointerleave", leave);
            const lost = (e: Event) => {
              e.preventDefault();
              setReady(false);
            };
            node.addEventListener("webglcontextlost", lost);
            scene.current = {
              select: (n) => {
                const current = ((Math.round(target) % count) + count) % count;
                let step = n - current;
                if (step > count / 2) step -= count;
                if (step < -count / 2) step += count;
                target = Math.round(target) + step;
                last = performance.now();
              },
              pause: (value) => {
                stop = value;
                last = performance.now();
              },
            };
            setReady(true);
            raf = requestAnimationFrame(render);
            cleanup = () => {
              cancelAnimationFrame(raf);
              ro.disconnect();
              visibility.disconnect();
              node.removeEventListener("pointermove", hover);
              node.removeEventListener("pointerleave", leave);
              node.removeEventListener("webglcontextlost", lost);
              geometry.dispose();
              planes.forEach((p) => p.material.dispose());
              textures.forEach((t) => t.dispose());
              renderer.dispose();
              scene.current = null;
            };
          })
          .catch(() => {
            if (!disposed) setReady(false);
          });
      },
      { rootMargin: "120px" },
    );
    io.observe(element);
    return () => {
      disposed = true;
      io.disconnect();
      cleanup?.();
    };
  }, [images, reduced]);
  return (
    <div ref={host} className="infinite-photo-gallery" data-ready={ready}>
      <img
        className="gallery-fallback"
        src={images[active]?.src}
        alt={images[active]?.alt ?? "Направления клуба"}
      />
      <canvas ref={canvas} aria-hidden="true" />
      <div className="gallery-controls">
        <Button
          variant="outline"
          size="icon"
          aria-label="Предыдущее направление"
          onClick={() => onActive((active - 1 + images.length) % images.length)}
        >
          <ChevronLeft />
        </Button>
        <span>
          {String(active + 1).padStart(2, "0")} /{" "}
          {String(images.length).padStart(2, "0")}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Следующее направление"
          onClick={() => onActive((active + 1) % images.length)}
        >
          <ChevronRight />
        </Button>
        {!reduced && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={paused ? "Продолжить галерею" : "Приостановить галерею"}
            onClick={() => setPaused((v) => !v)}
          >
            {paused ? <Play /> : <Pause />}
          </Button>
        )}
      </div>
    </div>
  );
}
