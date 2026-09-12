"use client";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
export function DataTable<T>({
  rows,
  columns,
  total,
  page,
  onPage,
  loading,
}: {
  rows: T[];
  columns: ColumnDef<T>[];
  total: number;
  page: number;
  onPage: (page: number) => void;
  loading?: boolean;
}) {
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });
  return (
    <div className="data-surface">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((h) => (
                  <th key={h.id}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length}>
                  <div className="table-status" role="status">
                    Загружаем данные…
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!loading && !rows.length && (
        <div className="empty-state">
          <SearchX size={26} />
          <h2>Пока ничего нет</h2>
          <p>Измените условия поиска или добавьте первую запись.</p>
        </div>
      )}
      <div className="table-pagination">
        <span>Всего: {total}</span>
        <div>
          <Button
            aria-label="Предыдущая страница"
            variant="ghost"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <span>
            {page} / {Math.max(1, Math.ceil(total / 20))}
          </span>
          <Button
            aria-label="Следующая страница"
            variant="ghost"
            disabled={page * 20 >= total}
            onClick={() => onPage(page + 1)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
