// app/components/DashboardSection.tsx
"use client";

type Props = {
  token: string | null;
};

export default function DashboardSection({ token }: Props) {
  return (
    <section className="ui-card text-sm">
      <div className="flex items-center justify-between">
        <h3 className="ui-card-title">Dashboard</h3>

        {/* Badge estado sesión (sin hardcodear colores) */}
        <span
          className={["ui-btn ui-btn-xs", token ? "ui-btn-outline" : "ui-btn-danger"].join(
            " "
          )}
        >
          {token ? "Con sesión" : "Sin sesión"}
        </span>
      </div>

      <p className="ui-card-subtitle mt-2">
        Placeholder. Aquí pondremos el contenido cuando me digas qué quieres
        visualizar.
      </p>
    </section>
  );
}