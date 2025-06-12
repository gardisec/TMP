from api import app

def test_health_check():
    """Тест проверяет, что эндпоинт /api/health отвечает статусом 200 OK."""
    with app.test_client() as client:
        response = client.get('/api/health')
        assert response.status_code == 200
        assert response.json == {"status": "ok"}

