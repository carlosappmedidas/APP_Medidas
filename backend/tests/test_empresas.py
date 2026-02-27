# tests/test_empresas.py

def get_auth_headers(client):
    resp = client.post(
        "/auth/login",
        data={"username": "carlos@example.com", "password": "changeme123"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_list_empresas(client):
    headers = get_auth_headers(client)

    resp = client.get("/empresas/", headers=headers)
    assert resp.status_code == 200
    empresas = resp.json()
    assert isinstance(empresas, list)
    # Al menos la empresa demo
    assert len(empresas) >= 1
    assert empresas[0]["nombre"] == "Empresa Demo 1"


def test_create_empresa(client):
    headers = get_auth_headers(client)

    payload = {
        "nombre": "Empresa Test",
        "codigo_ree": "REE999",
        "codigo_cnmc": "CNMC999",
        "activo": True,
    }

    resp = client.post("/empresas/", headers=headers, json=payload)
    assert resp.status_code in (200, 201)
    data = resp.json()
    assert data["nombre"] == payload["nombre"]

    # Comprobar que aparece en el listado
    resp2 = client.get("/empresas/", headers=headers)
    empresas = resp2.json()
    nombres = [e["nombre"] for e in empresas]
    assert "Empresa Test" in nombres