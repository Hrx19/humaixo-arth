# ai-service/app.py
from flask import Flask, jsonify, request
import spacy
import re

app = Flask(__name__)

# AI Model load karo (English samajhne ke liye)
nlp = spacy.load("en_core_web_sm")

@app.route('/', methods=['GET'])
def home():
    return jsonify({
        "message": "Humaixo Arth AI Service is running! 🧠",
        "status": "Ready to parse SMS"
    })

# Naya Smart SMS Parser Route (GET method taaki browser mein aasani se test ho sake)
@app.route('/parse-sms', methods=['GET'])
def parse_sms():
    # URL se SMS text lo (e.g., ?sms=Debited Rs 500 for Swiggy)
    sms_text = request.args.get('sms', '')
    
    if not sms_text:
        return jsonify({"error": "Please provide an 'sms' parameter in the URL"}), 400

    sms_lower = sms_text.lower()

    # 1. Amount nikalna (Regex ka use karke Rs, INR, ya ₹ ke aas-paas ke numbers dhundhna)
    amount_match = re.search(r'(?:rs\.?|inr|₹)\s*(\d+(?:,\d+)*)|(\d+(?:,\d+)*)\s*(?:rs\.?|inr|₹)', sms_text, re.IGNORECASE)
    amount = amount_match.group(1) or amount_match.group(2) if amount_match else "0"
    
    # 2. Transaction Type nikalna (Credit ya Debit)
    tx_type = "credit" if any(word in sms_lower for word in ["credited", "received", "salary", "refund"]) else "debit"

    # 3. Category nikalna (Smart Keyword Matching + NLP)
    category = "Others"
    if any(word in sms_lower for word in ["swiggy", "zomato", "food", "restaurant", "dining"]):
        category = "Food"
    elif any(word in sms_lower for word in ["amazon", "flipkart", "shopping", "mall", "myntra"]):
        category = "Shopping"
    elif any(word in sms_lower for word in ["uber", "ola", "petrol", "fuel", "metro"]):
        category = "Transport"
    elif any(word in sms_lower for word in ["salary", "credited", "interest"]):
        category = "Income"

    # AI ka final response
    return jsonify({
        "original_sms": sms_text,
        "extracted_amount": f"₹{amount}",
        "transaction_type": tx_type.upper(),
        "predicted_category": category,
        "ai_status": "Successfully Parsed ✅"
    })

if __name__ == '__main__':
    print("✅ Humaixo Arth AI Service is running on port 5001")
    app.run(port=5001, debug=True)