export const editorialPhotos = [
  "yoga",
  "mobility",
  "pilates",
  "strength",
  "functional",
].map((name) => `/media/editorial/${name}.webp`);
export function workoutPhoto(name: string) {
  const index = /йог/i.test(name)
    ? 0
    : /мобил/i.test(name)
      ? 1
      : /пилат/i.test(name)
        ? 2
        : /сил/i.test(name)
          ? 3
          : 4;
  return editorialPhotos[index]!;
}
export function trainerPhoto(name: string) {
  const portrait = /Анна Соколова/.test(name)
    ? "anna"
    : /Максим Орлов/.test(name)
      ? "maxim"
      : /Елена Миронова/.test(name)
        ? "elena"
        : null;
  return portrait
    ? `/media/editorial/${portrait}.webp`
    : "/media/editorial/mobility.webp";
}
