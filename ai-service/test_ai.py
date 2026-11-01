"""Optional live HTTP smoke test for a running AI service."""

import os

import pytest
import requests


@pytest.mark.skipif(
    os.getenv("HUMAIXO_RUN_AI_INTEGRATION") != "true",
    reason="Set HUMAIXO_RUN_AI_INTEGRATION=true to call the live service.",
)
def test_ai_service_parses_a_live_sample():
    service_url = os.getenv("AI_SERVICE_URL", "http://localhost:5001/parse-sms")
    response = requests.post(
        service_url,
        json={
            "sms": "INR 450.00 debited from A/c XXXX4521 at SWIGGY BANGALORE. Avl Bal: INR 12,450.50."
        },
        timeout=5,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["amount"] == 450.0
    assert payload["balanceAfter"] == 12450.5
