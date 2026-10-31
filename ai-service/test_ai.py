# ai-service/test_ai.py
import requests
import json

API_URL = "http://localhost:5001/parse-sms"

# Real Indian Bank SMS Examples
test_sms_list = [
    "INR 450.00 debited from A/c XXXX4521 at SWIGGY BANGALORE on 24-10-26. Avl Bal: INR 12,450.50.",
    "Rs. 75000.00 credited to your SBI A/c XXXX8832 from TCS LTD on 25-10-26. Ref: SALARY OCT.",
    "Alert: INR 2000 sent to Rahul Sharma via UPI. Debited from HDFC Bank A/c XXXX1234. Bal: INR 5400.",
    "Your Amazon.in order #402-1234567-1234567 has been shipped. Amount INR 3499 will be charged."
]

print("🧪 Testing Humaixo AI Engine...\n" + "="*50)

for i, sms in enumerate(test_sms_list, 1):
    print(f"\n[Test {i}] SMS: {sms}")
    try:
        response = requests.post(API_URL, json={"sms": sms})
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Success! | Amount: ₹{data['amount']} | Type: {data['type']} | Merchant: {data['merchant']} | Category: {data['category']} | Confidence: {data['confidence']}")
        else:
            print(f"❌ Error {response.status_code}: {response.text}")
    except Exception as e:
        print(f"❌ Connection Failed: {e}")

print("\n" + "="*50 + "\n🏁 Testing Complete.")