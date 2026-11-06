"""Regression tests for contextual bank-SMS extraction."""

import app as ai_app

from app import app, advanced_parse_sms


def test_debit_amount_is_not_confused_with_available_balance():
    result = advanced_parse_sms(
        "INR 450.00 debited from A/c XXXX4521 at SWIGGY BANGALORE on 24-10-26. "
        "Avl Bal: INR 12,450.50."
    )

    assert result["amount"] == "450"
    assert result["balanceAfter"] == "12450.5"
    assert result["type"] == "debit"
    assert result["merchant"].lower().startswith("swiggy")
    assert result["category"] == "Food"


def test_salary_credit_extracts_sender():
    result = advanced_parse_sms(
        "Rs. 75000.00 credited to your SBI A/c XXXX8832 from TCS LTD on 25-10-26. Ref: SALARY OCT."
    )

    assert result["amount"] == "75000"
    assert result["type"] == "credit"
    assert result["merchant"].lower() == "tcs ltd"
    assert result["category"] == "Income"


def test_upi_person_transfer_and_balance():
    result = advanced_parse_sms(
        "Alert: INR 2000 sent to Rahul Sharma via UPI. "
        "Debited from HDFC Bank A/c XXXX1234. Bal: INR 5400."
    )

    assert result["amount"] == "2000"
    assert result["type"] == "debit"
    assert result["merchant"].lower() == "rahul sharma"
    assert result["category"] == "Transfer"
    assert result["balanceAfter"] == "5400"


def test_non_transaction_message_is_rejected_without_echoing_sms():
    client = app.test_client()
    response = client.post("/parse-sms", json={"sms": "Welcome to your bank account. No money detail."})

    assert response.status_code == 422
    assert response.json == {
        "success": False,
        "error": "No transaction amount was found in this SMS.",
    }


def test_internal_service_key_is_required_when_configured(monkeypatch):
    monkeypatch.setattr(ai_app, "AI_SERVICE_API_KEY", "test-service-key-with-more-than-32-chars")
    client = app.test_client()
    sms = {"sms": "INR 450 debited at SWIGGY. Avl Bal INR 1200."}

    unauthorized = client.post("/parse-sms", json=sms)
    authorized = client.post(
        "/parse-sms",
        json=sms,
        headers={"X-Service-Key": "test-service-key-with-more-than-32-chars"},
    )

    assert unauthorized.status_code == 401
    assert authorized.status_code == 200
