# tests/test_auth.py

def test_health_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "ok"


def test_login_ok(client):
    resp = client.post(
        "/auth/login",
        data={"username": "carlos@example.com", "password": "changeme123"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"