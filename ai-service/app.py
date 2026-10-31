# ai-service/app.py
import re
import logging
from flask import Flask, jsonify, request
from flask_cors import CORS
from pydantic import BaseModel, Field, ValidationError
import spacy

# --- 1. Professional Configuration & Logging ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app) # Security: Cross-Origin requests allow karne ke liye

# NLP Model Load karna (Global scope mein taaki baar-baar load na ho)
logger.info("Loading spaCy NLP model...")
try:
    nlp = spacy.load("en_core_web_sm")
    logger.info("spaCy model loaded successfully.")
except OSError:
    logger.error("spaCy model not found. Run: python -m spacy download en_core_web_sm")
    nlp = None

# --- 2. Pydantic Models (Strict Data Validation) ---
class SMSRequest(BaseModel):
    sms: str = Field(..., min_length=10, max_length=1000, description="Bank SMS text")

class ParsedTransaction(BaseModel):
    success: bool
    amount: float
    currency: str
    type: str  # credit or debit
    category: str
    merchant: str
    confidence: float # AI ka confidence score

class ErrorResponse(BaseModel):
    success: bool
    error: str
    details: str

# --- 3. Advanced NLP & Parsing Logic ---
def advanced_parse_sms(sms_text: str) -> dict:
    """
    Advanced parsing using Regex + spaCy NER (Named Entity Recognition)
    """
    result = {
        "success": True, "amount": 0.0, "currency": "INR", 
        "type": "debit", "category": "Uncategorized", 
        "merchant": "Unknown", "confidence": 0.0
    }

    # A. Amount Extraction (Regex + spaCy MONEY entity)
    amount = 0.0
    confidence = 0.0
    
    # Regex fallback
    amount_match = re.search(r'(?:INR|Rs\.?|₹)\s?(\d+(?:,\d+)*(?:\.\d{2})?)', sms_text, re.IGNORECASE)
    if amount_match:
        amount = float(amount_match.group(1).replace(',', ''))
        confidence += 0.4

    # spaCy NER for Money
    if nlp:
        doc = nlp(sms_text)
        for ent in doc.ents:
            if ent.label_ == "MONEY":
                # Clean currency symbols
                clean_text = ent.text.replace('₹', '').replace('Rs', '').replace('INR', '').strip()
                try:
                    spacy_amount = float(clean_text.replace(',', ''))
                    if spacy_amount > amount: # Take the most prominent amount
                        amount = spacy_amount
                        confidence += 0.5
                except ValueError:
                    pass

    result["amount"] = amount
    result["confidence"] = min(confidence, 1.0)

    # B. Transaction Type (Credit vs Debit)
    sms_lower = sms_text.lower()
    credit_keywords = ['credited', 'received', 'added', 'refund', 'reversal', 'cashback']
    debit_keywords = ['debited', 'spent', 'paid', 'purchase', 'sent']
    
    if any(word in sms_lower for word in credit_keywords):
        result["type"] = "credit"
    elif any(word in sms_lower for word in debit_keywords):
        result["type"] = "debit"

    # C. Merchant & Category Extraction (spaCy NER + Heuristics)
    merchant = "Unknown"
    category = "General"
    
    if nlp:
        doc = nlp(sms_text)
        # Look for ORG (Organizations) or GPE (Locations acting as merchants)
        for ent in doc.ents:
            if ent.label_ in ["ORG", "GPE", "PERSON"]:
                # Filter out bank names
                if ent.text.lower() not in ['hdfc', 'sbi', 'icici', 'axis', 'upi', 'rbi']:
                    merchant = ent.text
                    break

    # Category Mapping based on Merchant
    merchant_lower = merchant.lower()
    category_map = {
        'food': ['swiggy', 'zomato', 'dominos', 'mcdonald', 'starbucks', 'cafe'],
        'travel': ['uber', 'ola', 'irctc', 'makemytrip', 'goibibo', 'indigo'],
        'shopping': ['amazon', 'flipkart', 'myntra', 'ajio', 'nykaa'],
        'entertainment': ['netflix', 'spotify', 'prime', 'hotstar', 'youtube'],
        'fuel': ['hp petrol', 'indian oil', 'bpcl', 'shell']
    }
    
    for cat, keywords in category_map.items():
        if any(k in merchant_lower or k in sms_lower for k in keywords):
            category = cat.title()
            break
            
    # Fallback Category based on type
    if category == "General":
        category = "Transfer" if "upi" in sms_lower or "transfer" in sms_lower else ("Income" if result["type"] == "credit" else "Expense")

    result["merchant"] = merchant.title()
    result["category"] = category
    
    return result

# --- 4. API Routes ---
@app.route('/', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "service": "Humaixo AI Engine v2.0", "nlp_loaded": nlp is not None})

@app.route('/parse-sms', methods=['POST'])
def parse_sms_endpoint():
    try:
        # Pydantic Validation
        req_data = SMSRequest(**request.json)
        logger.info(f"Parsing SMS: {req_data.sms[:50]}...")
        
        # Process
        parsed_data = advanced_parse_sms(req_data.sms)
        
        return jsonify(parsed_data), 200
        
    except ValidationError as e:
        logger.error(f"Validation Error: {e}")
        return jsonify(ErrorResponse(success=False, error="Invalid Data", details=str(e)).dict()), 400
        
    except Exception as e:
        logger.exception("Internal Server Error")
        return jsonify(ErrorResponse(success=False, error="Server Error", details="An unexpected error occurred").dict()), 500

if __name__ == '__main__':
    logger.info("🚀 Starting Humaixo Arth AI Service on Port 5001...")
    app.run(host='0.0.0.0', port=5001, debug=True)