"use client";

import { useEffect, useRef } from "react";

export interface CtMapa {
  id_ct:        string;
  nombre:       string;
  potencia_kva: number | null;
  lat:          number | null;
  lon:          number | null;
  propiedad:    string | null;
}

export interface CupsMapa {
  cups:       string;
  id_ct:      string | null;
  tarifa:     string | null;
  tension_kv: number | null;
  lat:        number | null;
  lon:        number | null;
}

interface Props {
  cts:         CtMapa[];
  cups:        CupsMapa[];
  mostrarCts:  boolean;
  mostrarCups: boolean;
}

export default function MapaLeaflet({ cts, cups, mostrarCts, mostrarCups }: Props) {
  const mapRef        = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapaInstancia = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctLayerRef    = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cupsLayerRef  = useRef<any>(null);

  useEffect(() => {
    if (mapaInstancia.current || !mapRef.current) return;

    import("leaflet").then(L => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (L.Browser as any).touch   = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (L.Browser as any).pointer = false;

      const map = L.map(mapRef.current!, {
        center:          [40.0, -3.7],
        zoom:            7,
        dragging:        true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        zoomControl:     true,
        touchZoom:       false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapAny = map as any;
      if (mapAny.touchZoom) mapAny.touchZoom.disable();
      if (mapAny.tap)       mapAny.tap.disable();

      map.dragging.enable();

      ctLayerRef.current    = L.layerGroup().addTo(map);
      cupsLayerRef.current  = L.layerGroup().addTo(map);
      mapaInstancia.current = map;

      setTimeout(() => map.invalidateSize(), 200);

      const container = mapRef.current!;

      // ── Drag manual ───────────────────────────────────────────────────────
      let dragging = false;
      let lastX = 0;
      let lastY = 0;

      const onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
      };
      const onMouseMove = (e: MouseEvent) => {
        if (!dragging || !mapaInstancia.current) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (dx !== 0 || dy !== 0) {
          mapaInstancia.current.panBy([-dx, -dy], { animate: false });
        }
        lastX = e.clientX;
        lastY = e.clientY;
      };
      const onMouseUp = () => { dragging = false; };

      // ── Wheel zoom manual ─────────────────────────────────────────────────
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (!mapaInstancia.current) return;
        const zoom = mapaInstancia.current.getZoom();
        mapaInstancia.current.setZoom(e.deltaY < 0 ? zoom + 1 : zoom - 1);
      };

      container.addEventListener("mousedown", onMouseDown);
      document.addEventListener("mousemove",  onMouseMove);
      document.addEventListener("mouseup",    onMouseUp);
      container.addEventListener("wheel",     onWheel, { passive: false });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mapaInstancia as any)._cleanup = () => {
        container.removeEventListener("mousedown", onMouseDown);
        document.removeEventListener("mousemove",  onMouseMove);
        document.removeEventListener("mouseup",    onMouseUp);
        container.removeEventListener("wheel",     onWheel);
      };
    });

    return () => {
      if (mapaInstancia.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapaInstancia as any)._cleanup?.();
        mapaInstancia.current.remove();
        mapaInstancia.current = null;
        ctLayerRef.current    = null;
        cupsLayerRef.current  = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!ctLayerRef.current) return;
    import("leaflet").then(L => {
      ctLayerRef.current.clearLayers();
      if (!mostrarCts) return;

      const iconCt = L.divIcon({
        className: "",
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#E24B4A;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
        iconSize:   [14, 14],
        iconAnchor: [7, 7],
      });

      cts.forEach(ct => {
        if (ct.lat === null || ct.lon === null) return;
        L.marker([ct.lat, ct.lon], { icon: iconCt })
          .bindPopup(`
            <div style="font-size:12px;min-width:160px;line-height:1.5">
              <div style="font-weight:600;margin-bottom:4px">${ct.nombre}</div>
              <div style="color:#888;font-size:11px;font-family:monospace">${ct.id_ct}</div>
              ${ct.potencia_kva ? `<div style="margin-top:6px">⚡ <strong>${ct.potencia_kva} kVA</strong></div>` : ""}
              ${ct.propiedad === "E" ? `<div style="margin-top:4px;color:#EF9F27;font-size:11px">⚠️ Cedido por tercero</div>` : ""}
            </div>`)
          .addTo(ctLayerRef.current);
      });
    });
  }, [cts, mostrarCts]);

  useEffect(() => {
    if (!cupsLayerRef.current) return;
    import("leaflet").then(L => {
      cupsLayerRef.current.clearLayers();
      if (!mostrarCups) return;

      const iconCups = L.divIcon({
        className: "",
        html: `<div style="width:7px;height:7px;border-radius:50%;background:#378ADD;border:1px solid rgba(255,255,255,0.9);box-shadow:0 1px 2px rgba(0,0,0,0.3)"></div>`,
        iconSize:   [7, 7],
        iconAnchor: [3, 3],
      });

      cups.forEach(c => {
        if (c.lat === null || c.lon === null) return;
        L.marker([c.lat, c.lon], { icon: iconCups })
          .bindPopup(`
            <div style="font-size:12px;min-width:200px;line-height:1.5">
              <div style="font-weight:600;margin-bottom:4px;font-family:monospace;font-size:11px">${c.cups}</div>
              <div style="color:#888;font-size:11px">Tarifa: <strong>${c.tarifa ?? "—"}</strong></div>
              <div style="color:#888;font-size:11px">Tensión: <strong>${c.tension_kv ?? "—"} kV</strong></div>
              <div style="color:#888;font-size:11px;margin-top:2px">CT: ${c.id_ct ?? "No asignado"}</div>
            </div>`)
          .addTo(cupsLayerRef.current);
      });

      const validos = cups.filter(c => c.lat !== null && c.lon !== null);
      if (validos.length > 0 && mapaInstancia.current) {
        const bounds = L.latLngBounds(validos.map(c => [c.lat!, c.lon!] as [number, number]));
        mapaInstancia.current.fitBounds(bounds, { padding: [40, 40] });
      }
    });
  }, [cups, mostrarCups]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={mapRef} style={{ width: "100%", height: "580px" }} />
    </>
  );
}
