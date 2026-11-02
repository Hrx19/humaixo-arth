# 💰 Humaixo Arth - Smart Finance Ledger & AI Parser

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)

**A private, intelligent finance ledger for tracking account balances, daily transactions, and automated bank statement parsing.**

[Features](#-features) • [Tech Stack](#-tech-stack) • [How It Works](#-how-the-ledger-calculates-balances) • [Local Setup](#-local-setup)

</div>

---

## 🌟 Features

- **🔐 Secure Authentication**: Email/password login with JWT. Mobile tokens use Expo SecureStore; web uses browser localStorage.
- **📊 Explore-First Dashboard**: Clearly labeled sample figures for guests, transitioning to real-time data upon login.
- **🏦 Multi-Account Tracking**: Manage multiple accounts with opening balance/date, type, provider, and optional last four digits.
- **📝 Manual & Automated Transactions**: Manual entry with searchable/paginated ledger, plus automated imports.
- **📄 Intelligent Statement Import**: 
  - **CSV**: Row validation, duplicate detection, and import history. Raw CSV content is hashed and not saved.
  - **PDF**: Authenticated extraction for digital bank PDFs (up to 5MB). Processed in memory; scanned/image-only PDFs are rejected.
- **📈 Advanced Analytics**: Category and monthly cash-flow analytics, pie/bar/line charts, income/expense summaries, and historical balance lookup.
- **👥 Payee Totals**: Money sent, received, net flow, count, and transaction timeline (heuristic merchant/recipient extraction).
- **💬 Smart SMS Parser**: Manual paste or one-tap clipboard read. Distinguishes transaction amount from available balance with a confidence score. Raw SMS is hidden from finance APIs for privacy.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React Native, Expo SDK 58, TypeScript, NativeWind |
| **Backend API** | Node.js, Express.js, TypeScript, JWT, Structured Logging |
| **Database** | MongoDB Atlas (with retry/shutdown handling) |
| **AI / Parser** | Python, Flask, spaCy (`en_core_web_sm`), Heuristic Patterns |
| **Security** | Expo SecureStore, CORS, Helmet, Input Validation |

---

## 🧠 How the Ledger Calculates Balances

> 💡 **Core Logic**: An account stores an opening balance and the date that amount was accurate. Each transaction stores its date, signed flow type, and optional balance-before/balance-after snapshots. 
> - If a bank CSV or SMS supplies a balance, that snapshot is **authoritative**; later activity is applied on top of the latest earlier snapshot. 
> - Without a snapshot, the ledger calculates from the opening balance and recorded transactions. 
> - *Note: Historical values are only as complete as the statements and transactions imported by the user.*

The payee summary groups transaction records marked as person transfers. Insights are descriptive summaries of recorded data, **not financial advice or a credit score**.

---

## 🚀 Local Setup

*Prerequisites: Node.js 22.13.x (Expo SDK 58 target), Python 3.11 or 3.12.*

### 1. MongoDB and Backend
Create `backend/.env` from the template. Fill in your private Atlas URI and a random JWT secret (min 32 chars). **Never commit `.env` files.**

```bash
cd backend
npm install
cp .env.example .env  # On Windows PowerShell: Copy-Item .env.example .env
npm run dev           # For production: npm run build && npm start
