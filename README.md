# 💰 Humaixo Arth - Smart Finance Ledger & AI Parser

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white)

**Ek AI-powered, full-stack finance management application jo aapke kharche ko banata hai simple, smart aur secure.**

[Features](#-features) • [Tech Stack](#-tech-stack) • [Setup Guide](#-setup-guide) • [API Docs](#-api-endpoints) • [Author](#-author)

</div>

---

## 🌟 Features

### 🔐 Authentication & Security
- ✅ Email/Password authentication with JWT
- ✅ Google & GitHub OAuth integration
- ✅ Expo SecureStore (mobile) & localStorage (web)
- ✅ bcrypt password hashing & Rate limiting

### 📊 Dashboard & Analytics
- ✅ Explore-first dashboard with sample data for guests
- ✅ Real-time Total Net Worth calculation
- ✅ Category-wise spending breakdown (**Pie Chart**)
- ✅ Monthly trends visualization (**Line Chart**)

### 🏦 Account & Transaction Management
- ✅ Multiple accounts support (Savings, Cash, etc.)
- ✅ Manual transaction entry (Income/Expense)
- ✅ Searchable & paginated transaction ledger
- ✅ Payee/Recipient tracking & timeline view

### 📄 Intelligent Statement Import
- **CSV Import:** Row validation, duplicate detection, import history.
- **PDF Import:** AI extraction for digital bank PDFs (HDFC, SBI, ICICI). Max 5MB, processed in-memory.

### 💬 Smart SMS Parser
- ✅ Manual SMS paste or one-tap clipboard read
- ✅ Transaction amount vs balance detection with confidence score
- ✅ Raw SMS privacy protection (hidden from APIs)

### 🎨 UI/UX
- ✅ PhonePe-style animated splash screen
- ✅ Dark/Light theme support
- ✅ Responsive design (Web, Android, iOS)

---

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React Native, Expo SDK 58, TypeScript, NativeWind (Tailwind), Zustand |
| **Backend API** | Node.js, Express.js, TypeScript, JWT, MongoDB (Mongoose) |
| **AI Service** | Python, Flask, spaCy NLP, pdf-parse |
| **Security** | Expo SecureStore, CORS, Helmet, bcrypt |

---

## 📁 Project Structure

```text
humaixo-arth/
├── HumaixoArth/          # Frontend (React Native + Expo)
│   ├── src/app/          # Expo Router pages
│   ├── src/components/   # Reusable UI
│   └── src/store/        # Zustand state
├── backend/              # Backend (Node.js + Express)
│   ├── src/routes/       # API endpoints
│   ├── src/models/       # MongoDB schemas
│   └── src/middleware/   # Auth & Error handlers
├── ai-service/           # Python AI Parser
│   └── app.py            # Flask server
└── docs/                 # Documentation

🧠 How the Ledger Calculates Balances
💡 Core Logic: An account stores an opening balance and the date that amount was accurate.
If a bank CSV/PDF/SMS provides a balance at a specific date, that balance is authoritative.
Later transactions are applied on top of the latest balance snapshot.
Without a snapshot, the ledger calculates from the opening balance + all recorded transactions.

🚀 Setup Guide
1. Backend Setup
cd backend
npm install
# Create .env file with: MONGO_URI, JWT_SECRET, GOOGLE_CLIENT_ID, GITHUB_CLIENT_ID
npm run dev

2. AI Service Setup
cd ai-service
python -m venv venv
# Activate venv (Windows: .\venv\Scripts\Activate.ps1)
pip install -r requirements.txt
python -m spacy download en_core_web_sm
python app.py

3. Frontend Setup
cd HumaixoArth
npm install
# Create .env file with: EXPO_PUBLIC_API_URL=http://localhost:5000
npx expo start --clear

🔧 API Endpoints
Method
Endpoint
Description
POST
/api/auth/register
Register new user
POST
/api/auth/login
Login (Email/Google/GitHub)
GET
/api/transactions
Get paginated transactions
POST
/api/transactions
Add new transaction
GET
/api/analytics/summary
Get total income/expense/balance
POST
/api/parse-statement
Upload & parse Bank PDF

🔒 Security & Privacy
Data Protection: Passwords hashed with bcrypt. JWT tokens stored securely.
Privacy-First: Raw CSV/PDF content is never saved to the database. Only hashes and summaries are retained.
SMS Privacy: The app never reads SMS in the background. Clipboard reading requires explicit user tap.

🗺️ Future Roadmap
OpenAI/Gemini integration for smart categorization
Budget limits and overspending alerts
Multi-currency support
Export transaction history to CSV/Excel
Recurring transactions & Bill reminders

👨‍💻 Author

          "Harish Singh"

📍 Dehradun, Uttarakhand, India
🔗 GitHub: @Hrx19
✉️ harshukbhai09@gmail.com
Made with ❤️ and ☕ by Harish Singh
If you find this project useful, please ⭐ star this repository!
