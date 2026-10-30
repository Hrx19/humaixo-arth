# ai-service/app.py
from flask import Flask, jsonify, request

app = Flask(__name__)

# Test Route (Check karne ke liye ki AI service chal rahi hai)
@app.route('/', methods=['GET'])
def home():
    return jsonify({
        "message": "Welcome to Humaixo Arth AI Service! 🧠",
        "status": "Running Successfully"
    })

# SMS Parse karne wala Route (Future mein yahan asli AI logic aayega)
@app.route('/parse-sms', methods=['POST'])
def parse_sms():
    data = request.get_json()
    sms_text = data.get('sms', '')
    
    # Abhi ke liye ek dummy response
    return jsonify({
        "parsed": True,
        "sms_received": sms_text,
        "category": "Food",
        "amount": 500
    })

if __name__ == '__main__':
    print("✅ Humaixo Arth AI Service is running on port 5001")
    app.run(port=5001, debug=True)