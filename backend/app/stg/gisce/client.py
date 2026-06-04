# app/stg/gisce/client.py
# pyright: reportMissingImports=false
"""
Cliente XML-RPC minimo para GISCE-ERP (basado en Odoo/OpenERP).

GISCE expone su API en dos endpoints estandar XML-RPC:
  - /xmlrpc/common  -> login()
  - /xmlrpc/object  -> execute_kw(database, uid, password, modelo, metodo, args, kwargs)

Uso tipico:
    cli = GisceClient(url="http://host:8069", database="sanjose",
                      usuario="x", password="y")
    uid = cli.login()
    cts = cli.search_read("giscedata.cts", [["active", "=", True]],
                          ["id", "name", "active"])
"""
from __future__ import annotations

import xmlrpc.client
from typing import Any, Optional


class GisceError(Exception):
    """Error generico del cliente GISCE."""
    pass


class GisceAuthError(GisceError):
    """Credenciales rechazadas (login devolvio False)."""
    pass


class GisceConnectionError(GisceError):
    """No se pudo contactar con el servidor GISCE."""
    pass


class GisceClient:
    """
    Wrapper sobre xmlrpc.client.ServerProxy para llamar a GISCE-ERP.
    No mantiene estado entre instancias: el uid se cachea durante la vida
    de la instancia.
    """

    def __init__(
        self,
        url: str,
        database: str,
        usuario: str,
        password: str,
    ) -> None:
        self.url = url.rstrip("/")
        self.database = database
        self.usuario = usuario
        self.password = password

        # Lazy: solo se conecta al primer uso
        self._common: Optional[xmlrpc.client.ServerProxy] = None
        self._object: Optional[xmlrpc.client.ServerProxy] = None
        self._uid: Optional[int] = None

    def _make_proxy(self, endpoint: str) -> xmlrpc.client.ServerProxy:
        url = f"{self.url}/xmlrpc/{endpoint}"
        try:
            return xmlrpc.client.ServerProxy(url, allow_none=True)
        except Exception as exc:
            raise GisceConnectionError(
                f"No se pudo crear proxy XML-RPC a {url}: {exc}"
            ) from exc

    def login(self) -> int:
        """Login contra GISCE. Devuelve uid o lanza excepcion."""
        if self._common is None:
            self._common = self._make_proxy("common")
        try:
            uid = self._common.login(self.database, self.usuario, self.password)
        except (xmlrpc.client.Fault, ConnectionError, OSError) as exc:
            raise GisceConnectionError(
                f"Fallo al contactar GISCE en {self.url}: {exc}"
            ) from exc
        if not uid:
            raise GisceAuthError(
                f"Credenciales rechazadas (db='{self.database}', user='{self.usuario}')"
            )
        self._uid = int(uid)
        return self._uid

    def _ensure_uid(self) -> int:
        if self._uid is None:
            return self.login()
        return self._uid

    def _ensure_object_proxy(self) -> xmlrpc.client.ServerProxy:
        if self._object is None:
            self._object = self._make_proxy("object")
        return self._object

    def execute_kw(
        self,
        modelo: str,
        metodo: str,
        args: list,
        kwargs: Optional[dict] = None,
    ) -> Any:
        uid = self._ensure_uid()
        obj = self._ensure_object_proxy()
        try:
            return obj.execute_kw(
                self.database, uid, self.password,
                modelo, metodo, args, kwargs or {},
            )
        except (xmlrpc.client.Fault, ConnectionError, OSError) as exc:
            raise GisceError(f"Error ejecutando {modelo}.{metodo}: {exc}") from exc

    def search_read(
        self,
        modelo: str,
        domain: Optional[list] = None,
        fields: Optional[list] = None,
        limit: Optional[int] = None,
    ) -> list[dict]:
        kwargs = {}
        if fields is not None:
            kwargs["fields"] = fields
        if limit is not None:
            kwargs["limit"] = limit
        return self.execute_kw(modelo, "search_read", [domain or []], kwargs)

    def count(self, modelo: str, domain: Optional[list] = None) -> int:
        return self.execute_kw(modelo, "search_count", [domain or []])
