"""Privacy-conscious bank SMS parser for Humaixo Arth.

Regex rules handle the structured parts of bank alerts; spaCy is used only as a
merchant fallback because bank statements often contain multiple money values.
"""

from __future__ import annotations

import logging
import os
import re
import hmac
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from dotenv import load_dotenv

load_dotenv()

AI_SERVICE_API_KEY = os.getenv("AI_SERVICE_API_KEY", "")
if os.getenv("NODE_ENV", "development") == "production" and len(AI_SERVICE_API_KEY) < 32:
    raise RuntimeError("AI_SERVICE_API_KEY must be at least 32 characters in production.")

try:
    import spacy

    try:
        NLP = spacy.load(os.getenv("SPACY_MODEL", "en_core_web_sm"))
    except OSError:
        NLP = None
except ImportError:  # Regex extraction remains available during local bootstrap.
    spacy = None  # type: ignore[assignment]
    NLP = None

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("humaixo.ai")
if NLP is None:
    logger.warning("spaCy model is unavailable; using deterministic pattern extraction only.")
else:
    logger.info("spaCy model loaded.")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024
allowed_origins = [
    origin.strip()
    for origin in os.getenv("AI_CORS_ORIGINS", "*").split(",")
    if origin.strip()
]
CORS(app, resources={r"/*": {"origins": allowed_origins}})


@app.before_request
def authenticate_internal_service_call():
    if not AI_SERVICE_API_KEY:
        return None
    supplied_key = request.headers.get("X-Service-Key", "")
    if not hmac.compare_digest(supplied_key, AI_SERVICE_API_KEY):
        return jsonify(ErrorResponse(error="Service authentication failed.").model_dump()), 401
    return None

MONEY = r"(?P<amount>\d[\d,]*(?:\.\d{1,2})?)"
CURRENCY_PREFIX = r"(?:INR|Rs\.?|₹)\s*"
BALANCE_PATTERNS = (
    re.compile(rf"\b(?:available|avl|closing|current)\s+bal(?:ance)?\s*[:\-]?\s*(?:{CURRENCY_PREFIX})?{MONEY}", re.I),
    re.compile(rf"\bbal(?:ance)?\s*[:\-]\s*(?:{CURRENCY_PREFIX})?{MONEY}", re.I),
)
AMOUNT_PATTERN = re.compile(rf"{CURRENCY_PREFIX}{MONEY}", re.I)
ACTION_AMOUNT_PATTERN = re.compile(
    rf"\b(?:debited|credited|paid|transferred|sent|received)\b[^\d₹]{{0,28}}{MONEY}",
    re.I,
)

MERCHANT_PATTERNS = (
    re.compile(r"\b(?:at|to|towards)\s+(?:VPA\s+|UPI\s+ID\s+|merchant\s+)?([\w][\w&.' -]{1,78}?)(?=\s+(?:via|on|with|for|ref(?:erence)?|utr|avl|available|bal(?:ance)?|a/c|acct)\b|[.;,]|$)", re.I),
    re.compile(r"\bfrom\s+([\w][\w&.' -]{1,78}?)(?=\s+(?:on|ref(?:erence)?|utr|avl|available|bal(?:ance)?|a/c|acct)\b|[.;,]|$)", re.I),
)

CATEGORY_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Food", ("swiggy", "zomato", "restaurant", "cafe", "dominos", "pizza", "blinkit", "zepto", "bigbasket")),
    ("Shopping", ("amazon", "flipkart", "myntra", "ajio", "shopping", "retail")),
    ("Travel", ("uber", "ola", "rapido", "irctc", "flight", "airline", "metro", "makemytrip")),
    ("Fuel", ("petrol", "fuel", "indian oil", "bpcl", "shell")),
    ("Bills", ("electricity", "water bill", "broadband", "recharge", "utility", "gas bill")),
    ("Subscriptions", ("netflix", "spotify", "prime video", "subscription", "hotstar")),
    ("Healthcare", ("hospital", "pharmacy", "medical", "clinic", "health")),
    ("Rent", ("rent", "landlord")),
    ("Income", ("salary", "payroll", "dividend", "interest credit")),
    ("Refund", ("refund", "reversal", "cashback")),
)


class SMSRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    sms: str = Field(min_length=10, max_length=1_000)


class ParsedTransaction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    success: bool = True
    amount: float = Field(gt=0, allow_inf_nan=False)
    currency: str = "INR"
    type: str = Field(pattern="^(credit|debit)$")
    category: str = Field(min_length=1, max_length=60)
    merchant: str = Field(min_length=1, max_length=120)
    confidence: float = Field(ge=0, le=1)
    balanceAfter: float | None = Field(default=None, allow_inf_nan=False)


class ErrorResponse(BaseModel):
    success: bool = False
    error: str


def parse_money(value: str) -> float | None:
    try:
        amount = float(value.replace(",", ""))
    except (TypeError, ValueError):
        return None
    return amount if amount > 0 else None


def extract_balance(sms_text: str) -> float | None:
    for pattern in BALANCE_PATTERNS:
        match = pattern.search(sms_text)
        if match:
            return parse_money(match.group("amount"))
    return None


def extract_transaction_amount(sms_text: str) -> tuple[float | None, float]:
    # Bank messages commonly contain both the transaction and remaining balance.
    # Prefer the first currency amount that does not follow a balance label.
    for match in AMOUNT_PATTERN.finditer(sms_text):
        prefix = sms_text[max(0, match.start() - 36):match.start()].lower()
        if re.search(r"(?:avl|available|closing|current)?\s*bal(?:ance)?\s*[:\-]?\s*$", prefix):
            continue
        amount = parse_money(match.group("amount"))
        if amount is not None:
            return amount, 0.48

    action_match = ACTION_AMOUNT_PATTERN.search(sms_text)
    if action_match:
        return parse_money(action_match.group("amount")), 0.34

    if NLP is not None:
        for entity in NLP(sms_text).ents:
            if entity.label_ == "MONEY":
                amount_match = re.search(r"\d[\d,]*(?:\.\d{1,2})?", entity.text)
                if amount_match:
                    amount = parse_money(amount_match.group(0))
                    if amount is not None:
                        return amount, 0.28
    return None, 0.0


def extract_type(sms_text: str) -> tuple[str, float]:
    text = sms_text.lower()
    credit = re.search(r"\b(credited|received|refund(?:ed)?|reversal|cashback|salary credit)\b", text)
    debit = re.search(r"\b(debited|spent|paid|purchase|sent|withdrawn|withdrawal)\b", text)
    if credit and (not debit or credit.start() < debit.start()):
        return "credit", 0.24
    if debit:
        return "debit", 0.24
    return "debit", 0.0


def clean_merchant(candidate: str) -> str | None:
    value = re.sub(r"\s+", " ", candidate).strip(" .,:;-\t\n")
    if not value or len(value) < 2:
        return None
    if re.match(r"^(?:your|a/c|account|bank|hdfc|sbi|icici|axis|upi|imps|neft)\b", value, re.I):
        return None
    value = re.sub(r"^(?:VPA|UPI ID|merchant)\s+", "", value, flags=re.I)
    return value[:120] or None


def extract_merchant(sms_text: str) -> tuple[str, float]:
    for pattern in MERCHANT_PATTERNS:
        match = pattern.search(sms_text)
        if match:
            merchant = clean_merchant(match.group(1))
            if merchant:
                return merchant, 0.18

    if NLP is not None:
        bank_names = {"hdfc", "sbi", "icici", "axis", "upi", "rbi", "bank"}
        for entity in NLP(sms_text).ents:
            merchant = clean_merchant(entity.text)
            if entity.label_ in {"ORG", "GPE", "PERSON"} and merchant:
                if merchant.casefold() not in bank_names:
                    return merchant, 0.12
    return "Unknown", 0.0


def infer_category(sms_text: str, merchant: str, transaction_type: str) -> tuple[str, float]:
    text = f"{sms_text} {merchant}".casefold()
    for category, keywords in CATEGORY_RULES:
        if any(keyword in text for keyword in keywords):
            return category, 0.10
    if re.search(r"\b(?:upi|imps|neft|rtgs|transfer|sent to|received from)\b", text):
        return "Transfer", 0.10
    return ("Income" if transaction_type == "credit" else "Uncategorised"), 0.02


def advanced_parse_sms(sms_text: str) -> dict[str, Any]:
    amount, amount_confidence = extract_transaction_amount(sms_text)
    transaction_type, type_confidence = extract_type(sms_text)
    merchant, merchant_confidence = extract_merchant(sms_text)
    category, category_confidence = infer_category(sms_text, merchant, transaction_type)
    confidence = min(1.0, amount_confidence + type_confidence + merchant_confidence + category_confidence)

    result: dict[str, Any] = {
        "success": amount is not None,
        "amount": amount or 0.0,
        "currency": "INR",
        "type": transaction_type,
        "category": category,
        "merchant": merchant,
        "confidence": round(confidence, 2),
        "balanceAfter": extract_balance(sms_text),
    }
    return result


@app.get("/")
def health_check():
    return jsonify({"status": "healthy", "service": "Humaixo Arth AI Engine", "nlp_loaded": NLP is not None})


@app.post("/parse-sms")
def parse_sms_endpoint():
    try:
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return jsonify(ErrorResponse(error="A JSON request body is required.").model_dump()), 400
        req_data = SMSRequest.model_validate(body)
        parsed_data = advanced_parse_sms(req_data.sms)
        if not parsed_data["success"]:
            return jsonify(ErrorResponse(error="No transaction amount was found in this SMS.").model_dump()), 422
        validated = ParsedTransaction.model_validate(parsed_data)
        return jsonify(validated.model_dump(exclude_none=True)), 200
    except ValidationError as error:
        # Never echo the SMS contents or Pydantic's input values to logs/responses.
        logger.info("Rejected an invalid SMS parse request (%d validation issue(s)).", len(error.errors()))
        return jsonify(ErrorResponse(error="SMS text must be valid and between 10 and 1000 characters.").model_dump()), 400
    except Exception:
        logger.exception("Unexpected SMS parser failure.")
        return jsonify(ErrorResponse(error="An unexpected parser error occurred.").model_dump()), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5001"))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    logger.info("Starting Humaixo Arth AI service on port %s.", port)
    app.run(host="0.0.0.0", port=port, debug=debug)
