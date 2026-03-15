from __future__ import annotations

from fastapi import status


def get_auth_headers(client):
    resp = client.post(
        "/auth/login",
        data={
            "username": "superadmin@plataforma.com",
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

    resp = client.post("/ingestion/files", headers=headers, json=payload)
    assert resp.status_code == status.HTTP_201_CREATED

    data = resp.json()
    assert data["empresa_id"] == 1
    assert data["status"] == "pending"
    assert data["filename"] == payload["filename"]
    assert data["storage_key"] == payload["storage_key"]

    resp = client.get("/ingestion/files", headers=headers)
    assert resp.status_code == status.HTTP_200_OK

    items = resp.json()
    assert len(items) == 1
    assert items[0]["filename"] == payload["filename"]


def test_register_file_invalid_empresa(client):
    headers = get_auth_headers(client)

    payload = {
        "empresa_id": 999,
        "tipo": "M1",
        "anio": 2026,
        "mes": 2,
        "filename": "M1_Invalid_2026-02.xlsx",
        "storage_key": "tenant-1/empresa-999/2026/02/M1_Invalid_2026-02.xlsx",
    }

    resp = client.post("/ingestion/files", headers=headers, json=payload)
    assert resp.status_code == status.HTTP_404_NOT_FOUND


def test_register_file_updates_existing_logical_file(client):
    headers = get_auth_headers(client)

    payload_1 = {
        "empresa_id": 1,
        "tipo": "M1",
        "anio": 2026,
        "mes": 2,
        "filename": "M1_Luxida_2026-02_v1.xlsx",
        "storage_key": "tenant-1/empresa-1/2026/02/M1_Luxida_2026-02_v1.xlsx",
    }

    payload_2 = {
        "empresa_id": 1,
        "tipo": "M1",
        "anio": 2026,
        "mes": 2,
        "filename": "M1_Luxida_2026-02_v2.xlsx",
        "storage_key": "tenant-1/empresa-1/2026/02/M1_Luxida_2026-02_v2.xlsx",
    }

    resp_1 = client.post("/ingestion/files", headers=headers, json=payload_1)
    assert resp_1.status_code == status.HTTP_201_CREATED
    data_1 = resp_1.json()

    resp_2 = client.post("/ingestion/files", headers=headers, json=payload_2)
    assert resp_2.status_code == status.HTTP_201_CREATED
    data_2 = resp_2.json()

    assert data_2["id"] == data_1["id"]
    assert data_2["filename"] == payload_2["filename"]
    assert data_2["storage_key"] == payload_2["storage_key"]
    assert data_2["status"] == "pending"

    resp = client.get("/ingestion/files", headers=headers)
    assert resp.status_code == status.HTTP_200_OK
    items = resp.json()

    assert len(items) == 1
    assert items[0]["id"] == data_1["id"]
    assert items[0]["filename"] == payload_2["filename"]


def test_process_file_and_filter_by_status(client, monkeypatch):
    headers = get_auth_headers(client)

    payload = {
        "empresa_id": 1,
        "tipo": "M1",
        "anio": 2026,
        "mes": 2,
        "filename": "M1_To_Process_2026-02.xlsx",
        "storage_key": "tenant-1/empresa-1/2026/02/M1_To_Process_2026-02.xlsx",
    }

    resp = client.post("/ingestion/files", headers=headers, json=payload)
    assert resp.status_code == status.HTTP_201_CREATED
    file_id = resp.json()["id"]

    class FakeResult:
        _ingestion_warnings = [
            {"type": "test_warning", "message": "warning de prueba"}
        ]

    def fake_process_m1(*, db, tenant_id, empresa_id, fichero, file_path):
        return FakeResult()

    monkeypatch.setattr(
        "app.ingestion.routes.procesar_fichero_m1_desde_csv",
        fake_process_m1,
    )

    resp = client.post(f"/ingestion/files/{file_id}/process", headers=headers)
    assert resp.status_code == status.HTTP_200_OK

    data = resp.json()
    assert data["status"] == "ok"
    assert data["rows_ok"] == 1
    assert data["rows_error"] == 0
    assert data["processed_at"] is not None
    assert data["error_message"] is None
    assert isinstance(data["warnings"], list)
    assert len(data["warnings"]) == 1
    assert data["warnings"][0]["type"] == "test_warning"

    resp = client.get(
        "/ingestion/files",
        headers=headers,
        params={"status_": "ok"},
    )
    assert resp.status_code == status.HTTP_200_OK

    items = resp.json()
    assert len(items) == 1
    assert items[0]["id"] == file_id
    assert items[0]["status"] == "ok"


def test_process_file_without_storage_key_returns_400(client):
    headers = get_auth_headers(client)

    payload = {
        "empresa_id": 1,
        "tipo": "M1",
        "anio": 2026,
        "mes": 2,
        "filename": "M1_No_Storage_2026-02.xlsx",
        "storage_key": None,
    }

    resp = client.post("/ingestion/files", headers=headers, json=payload)
    assert resp.status_code == status.HTTP_201_CREATED
    file_id = resp.json()["id"]

    resp = client.post(f"/ingestion/files/{file_id}/process", headers=headers)
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    assert "storage_key" in resp.json()["detail"]


def test_list_files_invalid_status_filter_returns_400(client):
    headers = get_auth_headers(client)

    resp = client.get(
        "/ingestion/files",
        headers=headers,
        params={"status_": "invented_status"},
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    assert "Status no válido" in resp.json()["detail"]


def test_delete_preview_returns_expected_shape(client):
    headers = get_auth_headers(client)

    payload = {
        "empresa_id": 1,
        "tipo": "M1",
        "anio": 2026,
        "mes": 2,
        "filename": "M1_Delete_Preview_2026-02.xlsx",
        "storage_key": "tenant-1/empresa-1/2026/02/M1_Delete_Preview_2026-02.xlsx",
    }

    resp = client.post("/ingestion/files", headers=headers, json=payload)
    assert resp.status_code == status.HTTP_201_CREATED

    resp = client.get(
        "/ingestion/files/delete-preview",
        headers=headers,
        params={"empresa_id": 1, "anio": 2026, "mes": 2},
    )
    assert resp.status_code == status.HTTP_200_OK

    data = resp.json()

    assert "filters" in data
    assert "summary" in data
    assert "ingestion_files" in data
    assert "affected_general_periods" in data
    assert "affected_ps_periods" in data
    assert "orphan_medidas_general_candidates" in data
    assert "orphan_medidas_ps_candidates" in data
    assert "refacturas_m1" in data

    assert data["filters"]["empresa_id"] == 1
    assert data["filters"]["anio"] == 2026
    assert data["filters"]["mes"] == 2

    summary = data["summary"]
    assert "ingestion_files_count" in summary
    assert "m1_period_contributions_count" in summary
    assert "general_period_contributions_count" in summary
    assert "bald_period_contributions_count" in summary
    assert "ps_period_detail_count" in summary
    assert "ps_period_contributions_count" in summary
    assert "medidas_general_direct_count" in summary
    assert "medidas_ps_direct_count" in summary
    assert "affected_general_periods_count" in summary
    assert "affected_ps_periods_count" in summary
    assert "orphan_medidas_general_candidate_count" in summary
    assert "orphan_medidas_ps_candidate_count" in summary
    assert "refacturas_m1_count" in summary

    assert summary["ingestion_files_count"] == 1
    assert len(data["ingestion_files"]) == 1
    assert data["ingestion_files"][0]["filename"] == payload["filename"]


def test_delete_files_by_filter_removes_registered_file(client):
    headers = get_auth_headers(client)

    payload = {
        "empresa_id": 1,
        "tipo": "M1",
        "anio": 2026,
        "mes": 3,
        "filename": "M1_Delete_2026-03.xlsx",
        "storage_key": "tenant-1/empresa-1/2026/03/M1_Delete_2026-03.xlsx",
    }

    resp = client.post("/ingestion/files", headers=headers, json=payload)
    assert resp.status_code == status.HTTP_201_CREATED

    resp = client.delete(
        "/ingestion/files",
        headers=headers,
        params={"empresa_id": 1, "anio": 2026, "mes": 3},
    )
    assert resp.status_code == status.HTTP_200_OK

    data = resp.json()
    assert data["deleted_ingestion_files"] == 1
    assert data["filters"]["empresa_id"] == 1
    assert data["filters"]["anio"] == 2026
    assert data["filters"]["mes"] == 3

    resp = client.get(
        "/ingestion/files",
        headers=headers,
        params={"empresa_id": 1, "anio": 2026, "mes": 3},
    )
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json() == []


def test_invalid_month_validation(client):
    headers = get_auth_headers(client)

    payload = {
        "empresa_id": 1,
        "tipo": "M1",
        "anio": 2026,
        "mes": 13,
        "filename": "M1_Invalid_Month.xlsx",
        "storage_key": "tenant-1/empresa-1/2026/13/M1_Invalid_Month.xlsx",
    }

    resp = client.post("/ingestion/files", headers=headers, json=payload)
    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY