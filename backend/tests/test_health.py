"""Health endpoint tests."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient) -> None:
    """Test that /health returns healthy status."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("ok", "healthy", "degraded")
    assert "version" in data
    assert "timestamp" in data


@pytest.mark.asyncio
async def test_health_response_format(client: AsyncClient) -> None:
    """Test health response has all required fields."""
    response = await client.get("/health")
    data = response.json()
    required_fields = {"status", "version", "timestamp"}
    assert required_fields.issubset(data.keys())
