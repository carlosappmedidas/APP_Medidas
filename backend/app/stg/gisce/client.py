# app/stg/gisce/client.py
# pyright: reportMissingImports=false
"""
Cliente XML-RPC para GISCE-ERP (basado en OpenERP 5/6 legacy).

IMPORTANTE: GISCE-ERP esta basado en un fork de OpenERP 5/6 que NO soporta
el moderno execute_kw (introducido en Odoo 7+). Usa solo el legacy execute
con argumentos posicionales.

Endpoints XML-RPC:
  - /xmlrpc/common  -> login(database, user, password) -> uid
  - /xmlrpc/object  -> execute(database, uid, password, modelo, metodo, *args)
"""
from __future__ import annotations

import xmlrpc.client
from typing import Any, Optional


class GisceError(Exception):
    """Error generico del cliente GISCE."""
    pass


class GisceAuthError(GisceError):
    """Credenciales rechazadas."""
    pass


class GisceConnectionError(GisceError):
    """No se pudo contactar con el servidor GISCE."""
    pass


class GisceClient:
    """Wrapper sobre xmlrpc.client para GISCE-ERP (OpenERP 5/6 legacy)."""

    def __init__(self, url: str, database: str, usuario: str, password: str) -> None:
        self.url = url.rstrip("/")
        self.database = database
        self.usuario = usuario
        self.password = password
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

    def execute(self, modelo: str, metodo: str, *args) -> Any:
        """
        Llamada generica al execute() legacy de OpenERP 5/6.

        Equivalente a:
            object.execute(database, uid, password, modelo, metodo, *args)
        """
        uid = self._ensure_uid()
        obj = self._ensure_object_proxy()
        try:
            return obj.execute(
                self.database, uid, self.password,
                modelo, metodo, *args,
            )
        except (xmlrpc.client.Fault, ConnectionError, OSError) as exc:
            raise GisceError(
                f"Error ejecutando {modelo}.{metodo}: {exc}"
            ) from exc

    def search(
        self,
        modelo: str,
        domain: Optional[list] = None,
        limit: Optional[int] = None,
    ) -> list[int]:
        """Devuelve lista de ids que matchean domain."""
        args = [domain or []]
        if limit is not None:
            # signature legacy: search(domain, offset, limit)
            args.extend([0, limit])
        return self.execute(modelo, "search", *args)

    def read(
        self,
        modelo: str,
        ids: list[int],
        fields: Optional[list] = None,
    ) -> list[dict]:
        """Devuelve registros por ids."""
        if not ids:
            return []
        if fields is None:
            return self.execute(modelo, "read", ids)
        return self.execute(modelo, "read", ids, fields)

    def search_read(
        self,
        modelo: str,
        domain: Optional[list] = None,
        fields: Optional[list] = None,
        limit: Optional[int] = None,
    ) -> list[dict]:
        """search + read en dos llamadas (OpenERP 5/6 no tiene search_read)."""
        ids = self.search(modelo, domain=domain, limit=limit)
        return self.read(modelo, ids, fields=fields)

    def count(self, modelo: str, domain: Optional[list] = None) -> int:
        return self.execute(modelo, "search_count", domain or [])
