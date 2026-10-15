"""Pruebas unitarias e de integración para el backend Flask de Aurabyte."""

import pytest

from app import app as flask_app


@pytest.fixture()
def app():
    flask_app.config.update(TESTING=True)
    yield flask_app


@pytest.fixture()
def client(app):
    return app.test_client()


def test_index_sirve_html(client):
    res = client.get("/")
    assert res.status_code == 200
    assert b"Aurabyte" in res.data


def test_services_endpoint(client):
    res = client.get("/api/services")
    assert res.status_code == 200
    data = res.get_json()
    assert isinstance(data, list)
    assert len(data) > 0
    # No debe quedar ningún servicio que no esté también en index.html.
    names = {s["name"] for s in data}
    assert "Desarrollo Web" in names


def test_technologies_endpoint(client):
    res = client.get("/api/technologies")
    assert res.status_code == 200


def test_projects_endpoint_no_inventa_casos_de_exito(client):
    """Regresión: este endpoint devolvía 3 proyectos ficticios (Tienda
    Online, Portal Corporativo, Dashboard Analytics) que no existen en
    ningún otro lado del repo. Solo debe listar proyectos reales."""
    res = client.get("/api/projects")
    assert res.status_code == 200
    data = res.get_json()
    names = {p["name"] for p in data}
    assert "Tienda Online" not in names
    assert "Portal Corporativo" not in names
    assert "Dashboard Analytics" not in names
    assert "Aurabyte Web" in names


def test_contact_falla_sin_campos(client):
    res = client.post("/api/contact", json={})
    assert res.status_code == 400
    assert res.get_json()["success"] is False


def test_contact_falla_email_invalido(client):
    res = client.post(
        "/api/contact",
        json={
            "name": "Ana",
            "email": "no-es-un-email",
            "message": "Este es un mensaje de prueba suficientemente largo.",
        },
    )
    assert res.status_code == 400


def test_contact_falla_mensaje_corto(client):
    res = client.post(
        "/api/contact",
        json={"name": "Ana", "email": "ana@example.com", "message": "corto"},
    )
    assert res.status_code == 400


def test_contact_exitoso_sin_smtp_no_afirma_envio(client, monkeypatch):
    """Regresión: el backend afirmaba "¡Mensaje enviado con éxito!" cuando en
    realidad solo hacía print() del mensaje (no se enviaba a ningún lado).
    Sin SMTP_* configurado, debe aceptar el mensaje (success=True) pero
    email_sent debe ser False y el texto NO debe afirmar un envío real."""
    for var in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "CONTACT_EMAIL_TO"):
        monkeypatch.delenv(var, raising=False)

    res = client.post(
        "/api/contact",
        json={
            "name": "Ana de Prueba",
            "email": "ana.prueba@example.com",
            "message": "Este es un mensaje de prueba suficientemente largo.",
        },
    )
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["email_sent"] is False
    assert "enviado" not in data["message"].lower()


def test_contact_exitoso_con_smtp_simulado(client, monkeypatch):
    """Con SMTP_* configurado y el envío simulado en éxito, el backend sí
    debe afirmar que el mensaje fue enviado."""
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_USER", "no-reply@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "fake-password-for-tests")
    monkeypatch.setenv("CONTACT_EMAIL_TO", "info@example.com")
    monkeypatch.setattr("app.send_contact_email", lambda data: True)

    res = client.post(
        "/api/contact",
        json={
            "name": "Ana de Prueba",
            "email": "ana.prueba@example.com",
            "message": "Este es un mensaje de prueba suficientemente largo.",
        },
    )
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["email_sent"] is True
    assert "enviado" in data["message"].lower()


def test_ruta_inexistente_devuelve_404(client):
    res = client.get("/esto-no-existe")
    assert res.status_code == 404
