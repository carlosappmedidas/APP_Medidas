"use client";

import { useMemo } from "react";
import { useAppearanceTheme, type VarKey } from "./hooks/useAppearanceTheme";

type Props = {
  token?: string | null;
};

export default function AppearanceSettingsSection({ token = null }: Props) {
  const {
    defaults,
    presets,
    activePresetId,
    activeModeId,
    activeSettingsTab,
    activeDetailSection,
    draftHex,
    draftAlpha,

    setActiveSettingsTab,
    setActiveDetailSection,

    currentHex,
    currentAlphaPct,

    onHexChange,
    onHexBlur,
    onPickerChange,
    onAlphaChange,

    resetGroup,
    onSelectPreset,
    savePresetAs,
    overwritePreset,
    deletePreset,
    exportPresets,
    importPresets,
    handleSelectMode,

    presetOptions,
    constants,
  } = useAppearanceTheme({ token });

  const DEFAULT_PRESET_ID = constants?.DEFAULT_PRESET_ID ?? "__css_default__";

  const ColorRow = ({
    varKey,
    label,
    placeholder,
    aria,
    showAlpha,
  }: {
    varKey: VarKey;
    label: string;
    placeholder: string;
    aria: string;
    showAlpha?: boolean;
  }) => (
    <div>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={currentHex(varKey)}
          onChange={(e) => onPickerChange(varKey, e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent p-1"
          aria-label={`${aria} picker`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] ui-muted">{label}</div>
          <input
            type="text"
            className="ui-input mt-1"
            value={draftHex[varKey] || ""}
            onChange={(e) => onHexChange(varKey, e.target.value)}
            onBlur={() => onHexBlur(varKey)}
            placeholder={placeholder}
            aria-label={aria}
          />
        </div>
      </div>

      {showAlpha && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[10px] ui-muted">
            <span>Alpha</span>
            <span>{draftAlpha[varKey] ?? currentAlphaPct(varKey)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={draftAlpha[varKey] ?? currentAlphaPct(varKey)}
            onChange={(e) => onAlphaChange(varKey, Number(e.target.value))}
            className="mt-1 w-full"
            aria-label={`${aria} alpha`}
          />
        </div>
      )}
    </div>
  );

  const presetDisabled = useMemo(
    () => activePresetId === DEFAULT_PRESET_ID || !presets[activePresetId],
    [activePresetId, presets, DEFAULT_PRESET_ID]
  );

  return (
    <div className="appearance-root">
      <div className="appearance-header">
        <h3 className="ui-card-title">Apariencia del panel</h3>
        <p className="ui-card-subtitle">
          Cambia los colores del panel. Se aplica al momento en todas las secciones.
        </p>
        <p className="ui-help">
          {token
            ? "✅ Guardando en local y en tu usuario (servidor)."
            : "ℹ️ Guardado solo en este navegador."}
        </p>
      </div>

      <div className="mt-1 flex flex-wrap gap-2 border-b border-[color:var(--card-border)] pb-2">
        <button
          type="button"
          onClick={() => setActiveSettingsTab("mode")}
          className={[
            "ui-btn ui-btn-xs",
            activeSettingsTab === "mode" ? "ui-btn-secondary" : "ui-btn-outline",
          ].join(" ")}
        >
          Modo de color
        </button>

        <button
          type="button"
          onClick={() => setActiveSettingsTab("presets")}
          className={[
            "ui-btn ui-btn-xs",
            activeSettingsTab === "presets" ? "ui-btn-secondary" : "ui-btn-outline",
          ].join(" ")}
        >
          Mis temas
        </button>

        <button
          type="button"
          onClick={() => setActiveSettingsTab("advanced")}
          className={[
            "ui-btn ui-btn-xs",
            activeSettingsTab === "advanced" ? "ui-btn-secondary" : "ui-btn-outline",
          ].join(" ")}
        >
          Ajustes detallados
        </button>
      </div>

      {activeSettingsTab === "mode" && (
        <section className="appearance-section">
          <div className="appearance-section-header">
            <div>
              <div className="appearance-section-title">Modo de color</div>
              <p className="appearance-section-subtitle">
                Elige un modo base de color. Siempre puedes afinar abajo.
              </p>
            </div>
          </div>

          <div className="theme-mode-grid">
            <button
              type="button"
              className={[
                "theme-mode-card",
                activeModeId === "dark" ? "theme-mode-card--active" : "",
              ].join(" ")}
              onClick={() => handleSelectMode("dark")}
            >
              <div className="theme-mode-card-header">
                <span className="theme-mode-card-title">Oscuro</span>
                <span className="theme-mode-card-badge">Recomendado</span>
              </div>
              <div className="theme-mode-card-preview">
                <div className="theme-mode-card-preview-bar" />
                <div className="theme-mode-card-preview-body">
                  <div className="theme-mode-card-preview-main" />
                  <div className="theme-mode-card-preview-side" />
                </div>
              </div>
            </button>

            <button
              type="button"
              className={[
                "theme-mode-card",
                activeModeId === "light" ? "theme-mode-card--active" : "",
              ].join(" ")}
              onClick={() => handleSelectMode("light")}
            >
              <div className="theme-mode-card-header">
                <span className="theme-mode-card-title">Claro</span>
                <span className="theme-mode-card-badge">Suave</span>
              </div>
              <div className="theme-mode-card-preview">
                <div className="theme-mode-card-preview-bar" />
                <div className="theme-mode-card-preview-body">
                  <div className="theme-mode-card-preview-main" />
                  <div className="theme-mode-card-preview-side" />
                </div>
              </div>
            </button>
          </div>
        </section>
      )}

      {activeSettingsTab === "presets" && (
        <section className="appearance-section">
          <div className="appearance-section-header">
            <div>
              <div className="appearance-section-title">Mis temas guardados</div>
              <p className="appearance-section-subtitle">
                Guarda y recupera tus propias combinaciones de colores. Se almacenan en tu
                navegador y, si aplica, en el backend.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-[220px]">
              <label className="mb-1 block text-[10px] ui-muted">Tema actual</label>
              <select
                className="ui-select"
                value={activePresetId}
                onChange={(e) => onSelectPreset(e.target.value)}
                aria-label="Seleccionar tema guardado"
                style={{ width: 260 }}
              >
                <option value={DEFAULT_PRESET_ID}>CSS (por defecto)</option>
                {presetOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              <p className="mt-1 text-[10px] ui-muted">
                {activePresetId === DEFAULT_PRESET_ID
                  ? "Usando los colores por defecto de la aplicación."
                  : "Estás usando un tema guardado. Puedes actualizarlo con tus cambios actuales."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 md:justify-end">
              <button
                type="button"
                className="ui-btn ui-btn-primary ui-btn-xs"
                onClick={savePresetAs}
              >
                Guardar como…
              </button>

              <button
                type="button"
                className="ui-btn ui-btn-outline ui-btn-xs"
                onClick={overwritePreset}
                disabled={presetDisabled}
              >
                Sobrescribir
              </button>

              <button
                type="button"
                className="ui-btn ui-btn-outline ui-btn-xs"
                onClick={deletePreset}
                disabled={presetDisabled}
              >
                Borrar
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-[color:var(--card-border)] pt-3 md:flex-row md:items-center md:justify-between">
            <p className="max-w-md text-[10px] ui-muted">
              Exporta tus temas a JSON para compartirlos o hacer copia de seguridad.
              Puedes importarlos más tarde en otro navegador o equipo.
            </p>

            <div className="flex flex-wrap gap-2 md:justify-end">
              <button
                type="button"
                className="ui-btn ui-btn-outline ui-btn-xs"
                onClick={exportPresets}
              >
                Exportar
              </button>

              <button
                type="button"
                className="ui-btn ui-btn-outline ui-btn-xs"
                onClick={importPresets}
              >
                Importar
              </button>
            </div>
          </div>
        </section>
      )}

      {activeSettingsTab === "advanced" && (
        <section className="appearance-section">
          <div className="appearance-section-header">
            <div>
              <div className="appearance-section-title">Ajustes detallados</div>
              <p className="appearance-section-subtitle">
                Colores por sección (fondo, tarjetas, texto, botones…). No hace falta
                tocarlos para usar la app.
              </p>
              <p className="mt-1 text-[10px] ui-muted">
                Solo para ajustes finos. Cambiar estos valores afecta a toda la interfaz.
                Siempre puedes restaurar los colores desde Configuración o desde cada
                grupo.
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveDetailSection("fondo")}
              className={[
                "ui-btn ui-btn-xs",
                activeDetailSection === "fondo" ? "ui-btn-secondary" : "ui-btn-outline",
              ].join(" ")}
            >
              Fondo
            </button>
            <button
              type="button"
              onClick={() => setActiveDetailSection("tarjetas")}
              className={[
                "ui-btn ui-btn-xs",
                activeDetailSection === "tarjetas" ? "ui-btn-secondary" : "ui-btn-outline",
              ].join(" ")}
            >
              Tarjetas
            </button>
            <button
              type="button"
              onClick={() => setActiveDetailSection("texto")}
              className={[
                "ui-btn ui-btn-xs",
                activeDetailSection === "texto" ? "ui-btn-secondary" : "ui-btn-outline",
              ].join(" ")}
            >
              Texto
            </button>
            <button
              type="button"
              onClick={() => setActiveDetailSection("botones")}
              className={[
                "ui-btn ui-btn-xs",
                activeDetailSection === "botones" ? "ui-btn-secondary" : "ui-btn-outline",
              ].join(" ")}
            >
              Botones
            </button>
            <button
              type="button"
              onClick={() => setActiveDetailSection("sidebar")}
              className={[
                "ui-btn ui-btn-xs",
                activeDetailSection === "sidebar" ? "ui-btn-secondary" : "ui-btn-outline",
              ].join(" ")}
            >
              Sidebar
            </button>
            <button
              type="button"
              onClick={() => setActiveDetailSection("nav")}
              className={[
                "ui-btn ui-btn-xs",
                activeDetailSection === "nav" ? "ui-btn-secondary" : "ui-btn-outline",
              ].join(" ")}
            >
              Navegación
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-[11px]">
              <div className="mb-2 flex items-center justify-between">
                <span className="ui-muted">Vista previa del panel</span>
                <span className="text-[10px] ui-muted">
                  Solo visual, no afecta a datos reales.
                </span>
              </div>

              <div
                className="rounded-xl p-2"
                style={{
                  background: "var(--app-bg)",
                  color: "var(--text)",
                }}
              >
                <div
                  className="mb-2 rounded-md px-3 py-2 text-[11px] font-semibold"
                  style={{
                    background: "var(--main-bg)",
                    border: "1px solid var(--card-border)",
                  }}
                >
                  APP Medidas · Dashboard
                </div>

                <div className="flex gap-2">
                  <div
                    className="flex h-32 w-24 flex-col rounded-lg border p-2"
                    style={{
                      borderColor: "var(--sidebar-border)",
                      background: "var(--sidebar-bg)",
                    }}
                  >
                    <div
                      className="mb-1 truncate text-[10px] font-semibold"
                      style={{ color: "var(--nav-item-text)" }}
                    >
                      Menú
                    </div>
                    <div className="space-y-1">
                      <div
                        className="rounded-full px-2 py-1 text-[9px]"
                        style={{
                          background: "var(--nav-item-bg)",
                          color: "var(--nav-item-text)",
                        }}
                      >
                        Item
                      </div>
                      <div
                        className="rounded-full px-2 py-1 text-[9px]"
                        style={{
                          background: "var(--nav-item-hover)",
                          color: "var(--nav-item-text)",
                        }}
                      >
                        Hover
                      </div>
                      <div
                        className="rounded-full px-2 py-1 text-[9px]"
                        style={{
                          background: "var(--nav-active-bg)",
                          color: "var(--nav-active-text)",
                        }}
                      >
                        Activo
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex-1 rounded-lg border p-2"
                    style={{
                      background: "var(--main-bg)",
                      borderColor: "var(--card-border)",
                    }}
                  >
                    <div
                      className="mb-2 rounded-md border p-2 text-[10px]"
                      style={{
                        background: "var(--card-bg)",
                        borderColor: "var(--card-border)",
                      }}
                    >
                      <div className="text-[10px] font-semibold">Tarjeta de ejemplo</div>
                      <div
                        className="mt-1 text-[9px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Texto secundario dentro de una tarjeta del panel.
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="ui-btn ui-btn-primary ui-btn-xs"
                        disabled
                      >
                        Acción primaria
                      </button>
                      <button
                        type="button"
                        className="ui-btn ui-btn-secondary ui-btn-xs"
                        disabled
                      >
                        Acción secundaria
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-2 text-[10px] ui-muted">
                Usa esta vista para ver cómo combinan los colores entre sí (fondo, tarjetas,
                sidebar, navegación y botones).
              </div>
            </div>

            <div className="space-y-4">
              {activeDetailSection === "fondo" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold">Fondo</div>
                      <p className="text-[10px] ui-muted">
                        Colores base del fondo general de la app y del área central.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost ui-btn-xs"
                      onClick={() => resetGroup(["--app-bg", "--main-bg"])}
                      disabled={!defaults}
                    >
                      Restaurar fondo
                    </button>
                  </div>

                  <ColorRow
                    varKey="--app-bg"
                    label="fondo general (app)"
                    placeholder="#020617"
                    aria="Color fondo general"
                  />

                  <div className="mt-3">
                    <ColorRow
                      varKey="--main-bg"
                      label="fondo del contenido (main)"
                      placeholder="rgba(...) o #rrggbbaa"
                      aria="Color fondo main"
                    />
                  </div>
                </div>
              )}

              {activeDetailSection === "tarjetas" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold">Tarjetas</div>
                      <p className="text-[10px] ui-muted">
                        Fondo y borde de las tarjetas del panel.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost ui-btn-xs"
                      onClick={() => resetGroup(["--card-bg", "--card-border"])}
                      disabled={!defaults}
                    >
                      Restaurar tarjetas
                    </button>
                  </div>

                  <ColorRow
                    varKey="--card-bg"
                    label="fondo de tarjetas"
                    placeholder="#111827"
                    aria="Color fondo tarjetas"
                  />

                  <div className="mt-3">
                    <ColorRow
                      varKey="--card-border"
                      label="borde de tarjetas"
                      placeholder="rgba(...) o #rrggbbaa"
                      aria="Color borde tarjetas"
                      showAlpha
                    />
                  </div>
                </div>
              )}

              {activeDetailSection === "texto" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold">Texto</div>
                      <p className="text-[10px] ui-muted">
                        Colores de texto principal y secundario en toda la app.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost ui-btn-xs"
                      onClick={() => resetGroup(["--text", "--text-muted"])}
                      disabled={!defaults}
                    >
                      Restaurar texto
                    </button>
                  </div>

                  <ColorRow
                    varKey="--text"
                    label="texto principal"
                    placeholder="#e5e7eb"
                    aria="Color texto principal"
                  />

                  <div className="mt-3">
                    <ColorRow
                      varKey="--text-muted"
                      label="texto secundario"
                      placeholder="rgba(...) o #rrggbbaa"
                      aria="Color texto secundario"
                    />
                  </div>
                </div>
              )}

              {activeDetailSection === "botones" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold">Botones</div>
                      <p className="text-[10px] ui-muted">
                        Colores de los botones primario y secundario.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost ui-btn-xs"
                      onClick={() => resetGroup(["--btn-primary-bg", "--btn-secondary-bg"])}
                      disabled={!defaults}
                    >
                      Restaurar botones
                    </button>
                  </div>

                  <ColorRow
                    varKey="--btn-primary-bg"
                    label="botón primario"
                    placeholder="#059669"
                    aria="Color botón primario"
                  />

                  <div className="mt-3">
                    <ColorRow
                      varKey="--btn-secondary-bg"
                      label="botón secundario"
                      placeholder="#4f46e5"
                      aria="Color botón secundario"
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" className="ui-btn ui-btn-primary" disabled>
                      Primario
                    </button>
                    <button type="button" className="ui-btn ui-btn-secondary" disabled>
                      Secundario
                    </button>
                    <button type="button" className="ui-btn ui-btn-outline" disabled>
                      Outline
                    </button>
                  </div>
                </div>
              )}

              {activeDetailSection === "sidebar" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold">Sidebar</div>
                      <p className="text-[10px] ui-muted">
                        Fondo y borde de la barra lateral de navegación.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost ui-btn-xs"
                      onClick={() => resetGroup(["--sidebar-bg", "--sidebar-border"])}
                      disabled={!defaults}
                    >
                      Restaurar sidebar
                    </button>
                  </div>

                  <ColorRow
                    varKey="--sidebar-bg"
                    label="fondo sidebar"
                    placeholder="rgba(...) o #rrggbbaa"
                    aria="Color fondo sidebar"
                    showAlpha
                  />

                  <div className="mt-3">
                    <ColorRow
                      varKey="--sidebar-border"
                      label="borde sidebar"
                      placeholder="rgba(...) o #rrggbbaa"
                      aria="Color borde sidebar"
                      showAlpha
                    />
                  </div>
                </div>
              )}

              {activeDetailSection === "nav" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold">Navegación</div>
                      <p className="text-[10px] ui-muted">
                        Colores de los items del menú lateral (normal, hover y activo).
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost ui-btn-xs"
                      onClick={() =>
                        resetGroup([
                          "--nav-item-bg",
                          "--nav-item-hover",
                          "--nav-item-text",
                          "--nav-active-bg",
                          "--nav-active-text",
                          "--nav-sub-active-bg",
                        ])
                      }
                      disabled={!defaults}
                    >
                      Restaurar navegación
                    </button>
                  </div>

                  <ColorRow
                    varKey="--nav-item-bg"
                    label="fondo item (normal)"
                    placeholder="rgba(...) o #rrggbbaa"
                    aria="Color item normal"
                    showAlpha
                  />

                  <div className="mt-3">
                    <ColorRow
                      varKey="--nav-item-hover"
                      label="fondo item (hover)"
                      placeholder="rgba(...) o #rrggbbaa"
                      aria="Color item hover"
                      showAlpha
                    />
                  </div>

                  <div className="mt-3">
                    <ColorRow
                      varKey="--nav-item-text"
                      label="texto item"
                      placeholder="rgba(...) o #rrggbbaa"
                      aria="Color texto item"
                    />
                  </div>

                  <div className="mt-3">
                    <ColorRow
                      varKey="--nav-active-bg"
                      label="fondo item activo"
                      placeholder="#4f46e5"
                      aria="Color fondo activo"
                    />
                  </div>

                  <div className="mt-3">
                    <ColorRow
                      varKey="--nav-active-text"
                      label="texto activo"
                      placeholder="#ffffff"
                      aria="Color texto activo"
                    />
                  </div>

                  <div className="mt-3">
                    <ColorRow
                      varKey="--nav-sub-active-bg"
                      label="fondo sub-item activo"
                      placeholder="#6366f1"
                      aria="Color fondo sub activo"
                    />
                  </div>

                  <p className="mt-2 text-[10px] ui-muted">
                    Los efectos se pueden ver en la vista previa de la izquierda (items
                    normal, hover y activo).
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 text-[10px] ui-muted">
            Todos los cambios se aplican sobre variables CSS en <code>:root</code>, así que
            afectan a toda la app.
          </div>
        </section>
      )}
    </div>
  );
}