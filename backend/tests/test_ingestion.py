# tests/test_ingestion.py

from fastapi import status


def get_auth_headers(client):
    # Misma lógica que en otros tests
    resp = client.post(
        "/auth/login",
        data={
            "username": "carlos@example.com",
            "password": "changeme123",
        },
    )
    assert resp.status_code == status.HTTP_200_OK
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_register_and_list_ingestion_file(client):
    headers = get_auth_headers(client)

    payload = {
        "empresa_id": 1,
        "tipo": "M1",
        "anio": 2026,
        "mes": 2,
        "filename": "M1_Luxida_2026-02.xlsx",
        "storage_key": "tenant-1/empresa-1/2026/02/M1_Luxida_2026-02.xlsx",
    }

    # Registrar fichero
    resp = client.post("/ingestion/files", headers=headers, json=payload)
    assert resp.status_code == status.HTTP_201_CREATED
    data = resp.json()
    assert data["empresa_id"] == 1
    assert data["status"] == "pending"

    # Listar sin filtros
    resp = client.get("/ingestion/files", headers=headers)
    assert resp.status_code == status.HTTP_200_OK
    items = resp.json()
    assert len(items) == 1
    assert items[0]["filename"] == payload["filename"]


def test_register_file_invalid_empresa(client):
    """
    No se puede registrar un fichero para una empresa que no
    pertenece al tenant (o que no existe).
    """
    headers = get_auth_headers(client)

    payload = {
        "empresa_id": 999,  # no existe
        "tipo": "M1",
        "anio": 2026,
        "mes": 2,
        "filename": "M1_Invalid_2026-02.xlsx",
    }

    resp = client.post("/ingestion/files", headers=headers, json=payload)
    assert resp.status_code == status.HTTP_404_NOT_FOUND


def test_process_file_and_filter_by_status(client):
    headers = get_auth_headers(client)

    # 1) Registramos un fichero (queda en pending)
    payload = {
        "empresa_id": 1,
        "tipo": "M1",
        "anio": 2026,
        "mes": 2,
        "filename": "M1_To_Process_2026-02.xlsx",
    }
    resp = client.post("/ingestion/files", headers=headers, json=payload)
    assert resp.status_code == status.HTTP_201_CREATED
    file_id = resp.json()["id"]

    # 2) Procesamos el fichero
    resp = client.post(f"/ingestion/files/{file_id}/process", headers=headers)
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert data["status"] == "ok"
    assert data["rows_ok"] is not None
    assert data["processed_at"] is not None

    # 3) Filtramos por status=ok
    resp = client.get(
        "/ingestion/files",
        headers=headers,
        params={"status_": "ok"},
    )
    assert resp.status_code == status.HTTP_200_OK
    items = resp.json()
    # Con la BD de tests reseteada, solo tendremos este
    assert len(items) == 1
    assert items[0]["id"] == file_id


def test_invalid_month_validation(client):
    """
    La validación de Pydantic debe rechazar mes fuera de rango.
    """
    headers = get_auth_headers(client)

    payload = {
        "empresa_id": 1,
        "tipo": "M1",
        "anio": 2026,
        "mes": 13,  # inválido
        "filename": "M1_Invalid_Month.xlsx",
    }

    resp = client.post("/ingestion/files", headers=headers, json=payload)
    # Error de validación (Pydantic) -> 422
    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY