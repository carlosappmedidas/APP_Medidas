"use client";

type TablePaginationFooterProps = {
  loading: boolean;
  hasLoadedOnce: boolean;
  totalFilas: number;
  startIndex: number;
  endIndex: number;
  pageSize: number;
  setPageSize: (value: number) => void;
  currentPage: number;
  totalPages: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  compact?: boolean;
};

export default function TablePaginationFooter({
  loading,
  hasLoadedOnce,
  totalFilas,
  startIndex,
  endIndex,
  pageSize,
  setPageSize,
  currentPage,
  totalPages,
  setPage,
  compact = false,
}: TablePaginationFooterProps) {
  if (loading || !hasLoadedOnce || totalFilas <= 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--card-border)] px-4 py-3 text-[11px] ui-muted md:flex-row md:items-center md:justify-between">
      <div>
        Mostrando{" "}
        <span className="font-medium" style={{ color: "var(--text)" }}>
          {startIndex + 1}
        </span>{" "}
        -{" "}
        <span className="font-medium" style={{ color: "var(--text)" }}>
          {endIndex}
        </span>{" "}
        de{" "}
        <span className="font-medium" style={{ color: "var(--text)" }}>
          {totalFilas}
        </span>{" "}
        filas
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span>Filas por página:</span>
          <select
            className="ui-select w-auto text-[10px]"
            style={
              compact
                ? {
                    minHeight: 26,
                    height: 26,
                    paddingTop: 2,
                    paddingBottom: 2,
                    paddingLeft: 8,
                    paddingRight: 8,
                    lineHeight: 1.05,
                  }
                : {
                    minHeight: 28,
                    paddingTop: 3,
                    paddingBottom: 3,
                    paddingLeft: 8,
                    paddingRight: 8,
                    lineHeight: 1.1,
                  }
            }
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value) || 20)}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="ui-btn ui-btn-outline ui-btn-xs"
          >
            ← Anterior
          </button>

          <span>
            Página{" "}
            <span className="font-medium" style={{ color: "var(--text)" }}>
              {currentPage + 1}
            </span>{" "}
            /{" "}
            <span className="font-medium" style={{ color: "var(--text)" }}>
              {totalPages}
            </span>
          </span>

          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            className="ui-btn ui-btn-outline ui-btn-xs"
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  );
}