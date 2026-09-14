"use client";

import { useEffect, useReducer } from "react";

// Adapted from the supplied Tetris loader. A pure tick owns the board,
// piece placement and line clearing; no nested updates or delayed mutations.
const pieces = [
  [[1, 1, 1, 1]],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [0, 1, 0],
    [1, 1, 1],
  ],
  [
    [1, 0],
    [1, 0],
    [1, 1],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
  ],
  [
    [0, 1],
    [0, 1],
    [1, 1],
  ],
];
const width = 10,
  height = 16;
const empty = () =>
  Array.from({ length: height }, () => Array<number>(width).fill(0));
const next = (index: number) => ({
  shape: pieces[index % pieces.length]!,
  x: [0, 6, 3, 8, 1, 5, 3][index % 7]!,
  y: -3,
});
type Board = {
  grid: number[][];
  index: number;
  piece: ReturnType<typeof next>;
};
function tick(state: Board): Board {
  const { piece, grid } = state;
  const cells = piece.shape.flatMap((row, y) =>
    row.flatMap((filled, x) =>
      filled ? [{ x: x + piece.x, y: y + piece.y }] : [],
    ),
  );
  if (
    cells.every(({ x, y }) => y + 1 < height && (y + 1 < 0 || !grid[y + 1]![x]))
  ) {
    return { ...state, piece: { ...piece, y: piece.y + 1 } };
  }
  const index = state.index + 1;
  if (cells.some(({ y }) => y < 0))
    return { grid: empty(), index, piece: next(index) };
  const placed = grid.map((row) => [...row]);
  cells.forEach(({ x, y }) => {
    placed[y]![x] = 1;
  });
  const remaining = placed.filter((row) => row.some((cell) => !cell));
  while (remaining.length < height)
    remaining.unshift(Array<number>(width).fill(0));
  return { grid: remaining, index, piece: next(index) };
}

export default function TetrisLoading({
  loadingText = "Готовим пространство",
}: {
  loadingText?: string;
}) {
  const [state, dispatch] = useReducer(tick, undefined, () => ({
    grid: empty(),
    index: 0,
    piece: { ...next(0), y: 0 },
  }));
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const timer = setInterval(() => {
      if (!motion.matches && !document.hidden) dispatch();
    }, 40);
    return () => clearInterval(timer);
  }, []);
  const display = state.grid.map((row) => [...row]);
  state.piece.shape.forEach((row, y) =>
    row.forEach((filled, x) => {
      const gy = y + state.piece.y;
      if (filled && gy >= 0 && gy < height) display[gy]![x + state.piece.x] = 1;
    }),
  );
  return (
    <div className="tetris-loader">
      <div className="tetris-grid" aria-hidden="true">
        {display.flatMap((row, y) =>
          row.map((filled, x) => (
            <span key={`${y}-${x}`} data-filled={!!filled} />
          )),
        )}
      </div>
      <p>{loadingText}</p>
    </div>
  );
}
