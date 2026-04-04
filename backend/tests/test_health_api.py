def test_root_endpoint(client):
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {
        "message": "WireGuard Management API",
        "version": "1.0.0",
        "docs": "/docs",
    }


def test_health_endpoint(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_openapi_contract_exposes_client_routes(client):
    response = client.get("/openapi.json")

    assert response.status_code == 200
    spec = response.json()
    paths = spec.get("paths", {})

    assert "/api/clients" in paths
    assert "/api/clients/stats" in paths
    assert "/api/clients/connected" in paths
    assert "/api/logs/caddy/access/stream" in paths
