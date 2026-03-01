// app/components/DashboardSection.tsx
"use client";

type Props = {
  token: string | null;
};

export default function DashboardSection({ token }: Props) {
  const isLogged = !!token;

  return (
    <section className="ui-card text-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="ui-card-title">Dashboard</h3>
          <p className="ui-card-subtitle mt-1">
            Resumen del estado del panel y accesos rápidos.
          </p>
        </div>

        {/* Badge estado sesión (sin hardcodear colores) */}
        <span
          className={[
            "ui-btn ui-btn-xs",
            isLogged ? "ui-btn-outline" : "ui-btn-danger",
          ].join(" ")}
          title={isLogged ? "Sesión iniciada" : "No hay sesión activa"}
        >
          {isLogged ? "Con sesión" : "Sin sesión"}
        </span>
      </div>

      {/* Estado general */}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="ui-panel">
          <div className="text-[10px] ui-muted">Estado</div>
          <div className="mt-1 text-sm font-semibold">
            {isLogged ? "Operativo" : "Requiere acceso"}
          </div>
          <div className="mt-1 text-[11px] ui-muted">
            {isLogged
              ? "Puedes navegar y usar las secciones disponibles."
              : "Inicia sesión para acceder a funcionalidades."}
          </div>
        </div>

        <div className="ui-panel">
          <div className="text-[10px] ui-muted">Última actividad</div>
          <div className="mt-1 text-sm font-semibold">—</div>
          <div className="mt-1 text-[11px] ui-muted">
            Placeholder. Aquí podemos mostrar la última carga/consulta.
          </div>
        </div>

        <div className="ui-panel">
          <div className="text-[10px] ui-muted">Avisos</div>
          <div className="mt-1 text-sm font-semibold">0</div>
          <div className="mt-1 text-[11px] ui-muted">
            Placeholder. Aquí podemos mostrar incidencias o tareas pendientes.
          </div>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="mt-4 ui-panel">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-semibold">Acciones rápidas</div>
            <div className="mt-0.5 text-[11px] ui-muted">
              Atajos habituales (los conectamos después).
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="ui-btn ui-btn-secondary" disabled={!isLogged}>
              Ir a Carga
            </button>
            <button type="button" className="ui-btn ui-btn-outline" disabled={!isLogged}>
              Ver Tablas
            </button>
            <button type="button" className="ui-btn ui-btn-outline" disabled={!isLogged}>
              Configuración
            </button>
          </div>
        </div>
      </div>

      {/* Nota */}
      {!isLogged && (
        <div className="mt-4 ui-alert ui-alert--danger">
          Inicia sesión para ver datos reales en el dashboard.
        </div>
      )}
    </section>
  );
}