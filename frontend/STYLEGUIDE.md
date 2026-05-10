# APP Medidas — Design System v1

Documento de referencia del sistema de design unificado de la aplicación.
Toda nueva pantalla, componente o elemento visual debe seguir las reglas aquí descritas.

## 🎯 Principios

1. **Una sola fuente de verdad**: los tokens viven en `globals.css`; nadie hardcodea colores, tamaños o radios en JSX.
2. **Composición, no duplicación**: si un patrón aparece 2+ veces, se extrae a componente reutilizable.
3. **Jerarquía visual clara**: superficie 1 (body) > superficie 2 (cards) > superficie 3 (inputs/selects).
4. **Sólido > transparente**: las tarjetas usan fondo sólido (`--surface-2`) para contraste profesional. Los inputs usan transparencias controladas.

---

## 1. Superficies (fondos)

| Token | Valor | Uso |
|---|---|---|
| `--surface-1` | `#0d1b2a` | Body de la aplicación, fondo de página |
| `--surface-2` | `#131e2e` | Tarjetas, paneles, contenedores principales |
| `--surface-3` | `rgba(0,0,0,0.35)` | Inputs, selects, drop zones |
| `--surface-accent` | `rgba(55,138,221,0.15)` | Estado seleccionado/activo |
| `--surface-hover` | `rgba(55,138,221,0.06)` | Hover en pills y filas |

**Regla de uso**: nunca usar `rgba(0,0,0,0.X)` o `rgba(255,255,255,0.X)` directamente en JSX. Siempre usar el token.

---

## 2. Bordes

| Token | Valor | Uso |
|---|---|---|
| `--border-soft` | `0.5px solid rgba(255,255,255,0.06)` | Borde sutil para tarjetas |
| `--border-medium` | `1px solid rgba(255,255,255,0.1)` | Separación visible (tablas, secciones) |
| `--border-accent` | `1px solid rgba(55,138,221,0.5)` | Activo/seleccionado |
| `--border-success` | `0.5px solid rgba(29,158,117,0.4)` | Tarjetas de éxito |
| `--border-danger` | `0.5px solid rgba(226,75,74,0.4)` | Tarjetas de error |

---

## 3. Tipografía

Escala de 6 tamaños. Nunca usar valores fuera de esta escala.

| Token | Tamaño | Uso típico |
|---|---|---|
| `--text-2xl` | `22px` | KPIs grandes en dashboard |
| `--text-xl` | `18px` | Títulos de página |
| `--text-base` | `14px` | Títulos de tarjeta, números importantes |
| `--text-md` | `12px` | Texto de botones, body principal |
| `--text-sm` | `11px` | **DEFAULT** — texto secundario, valor más usado |
| `--text-xs` | `10px` | Etiquetas en mayúsculas, metadatos |

**Pesos**:
- `400` (normal) — texto cuerpo, secundario
- `500` (medium) — títulos, énfasis
- `600` (semibold) — etiquetas en mayúsculas
- `700` (bold) — solo casos excepcionales

**Letter-spacing**:
- `0.04em` — texto normal con énfasis
- `0.06em` — etiquetas en mayúsculas (default)
- `0.08em` — títulos de sección

---

## 4. Espaciados

Escala basada en múltiplos de 4. Nunca usar valores fuera de esta escala.

| Token | Valor | Uso |
|---|---|---|
| `--sp-1` | `4px` | Gaps internos pequeños |
| `--sp-2` | `8px` | Gaps entre elementos |
| `--sp-3` | `12px` | Gaps entre secciones, padding interno tarjeta |
| `--sp-4` | `14px` | **DEFAULT padding tarjeta** |
| `--sp-5` | `20px` | Padding generoso |
| `--sp-6` | `24px` | Separación grande |

---

## 5. Border-radius

| Token | Valor | Uso |
|---|---|---|
| `--r-sm` | `4px` | Mini-chips, badges pequeños |
| `--r-md` | `6px` | Selects, inputs, botones pequeños |
| `--r-lg` | `8px` | Botones, pill toggles |
| `--r-xl` | `10px` | **DEFAULT** — Tarjetas, chips, contenedores |
| `--r-pill` | `9999px` | Botones pill (acciones primarias destacadas) |

**Regla**: Si dudas, usa `--r-xl` (10px).

---

## 6. Estados semánticos

| Token de fondo | Token de borde | Token de texto | Uso |
|---|---|---|---|
| `--bg-success-soft` | `--border-success` | `--text-success` (#1D9E75) | OK, válido, completado |
| `--bg-info-soft` | `--border-info` | `--text-info` (#85B7EB) | Activo, seleccionado, información |
| `--bg-warning-soft` | `--border-warning` | `--text-warning` (#FAC775) | Aviso, próximo a vencer |
| `--bg-danger-soft` | `--border-danger` | `--text-danger` (#E5736E) | Error, BAD, vencido |
| `--bg-muted-soft` | `--border-soft` | `--text-muted` | Inactivo, neutro |

---

## 7. Componentes

### 7.1 `<UiCard>` (futuro)

```tsx