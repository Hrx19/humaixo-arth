# Humaixo Arth

Humaixo Arth is a private finance ledger for tracking account balances, daily money in/out, payees, and historical balances. The project combines an Expo app, a TypeScript/Express API, MongoDB, and a Flask/spaCy SMS parser.

## What is implemented

- Explore-first dashboard with clearly labeled sample figures for guests.
- Email/password registration and login. Mobile tokens use Expo SecureStore; web uses browser localStorage.
- Multiple tracked accounts with opening balance/date, type, provider, and optional last four digits.
- Manual transaction entry and searchable/paginated transaction ledger.
- Statement CSV preview, row validation, duplicate detection, import history, and transaction import. Raw CSV content is not saved after the API request; the file hash and import summary are retained.
- Category and monthly cash-flow analytics, pie/bar/line charts, income/expense summaries, account net balance, and historical balance lookup.
- Payee totals: money sent, money received, net flow, count, and transaction timeline.
- SMS parser for manual paste and explicit one-tap clipboard read. It distinguishes the transaction amount from available balance and reports a confidence score.
- Duplicate SMS prevention and hidden raw-SMS source records. Raw SMS is omitted from transaction APIs.
- Structured API logging, input validation, JWT-protected finance routes, safe error responses, and database retry/shutdown handling.

## How the ledger calculates balances

An account stores an opening balance and the date that amount was accurate. Each transaction stores its date, signed flow type, and optional balance-before/balance-after snapshots. If a bank CSV or SMS supplies a balance, that snapshot is authoritative; later activity is applied on top of the latest earlier snapshot. Without a snapshot, the ledger calculates from the opening balance and recorded transactions. Historical values are only as complete as the statements and transactions imported by the user.

The payee summary groups transaction records marked as person transfers. Merchant/recipient extraction is heuristic, so users should review imported rows before relying on those totals. Insights are descriptive summaries of recorded data, not financial advice or a credit score.

## Local setup

Use a Node.js version supported by the installed Expo SDK. Expo SDK 58 targets Node 22.13.x; the workspace's current Node 25.1 runtime prints unsupported-engine warnings. Python 3.11 or 3.12 is a practical local choice for the spaCy model.

### 1. MongoDB and backend

Create `backend/.env` from the template and fill in your private Atlas URI and a random JWT secret of at least 32 characters. Never commit `.env` files.

```powershell
cd "C:\Humaixo Arth\backend"
npm install
Copy-Item .env.example .env
npm run dev
```

For a production build, use `npm run build` then `npm start`. `/health` reports API and MongoDB status. Finance routes require `Authorization: Bearer <token>`.

### 2. AI parser

```powershell
cd "C:\Humaixo Arth\ai-service"
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m spacy download en_core_web_sm
Copy-Item .env.example .env
python app.py
```

The parser listens on port `5001`; the backend calls `http://localhost:5001/parse-sms`. It does not log SMS content. If the spaCy model is unavailable, deterministic patterns remain available as a fallback.

For production, set the same random 32+ character `AI_SERVICE_API_KEY` in both backend and AI service environment files. The API sends it in `X-Service-Key`; the AI service rejects calls without it.

### 3. Expo frontend

```powershell
cd "C:\Humaixo Arth\HumaixoArth"
npm install
Copy-Item .env.example .env
npx expo start --clear
```

Set `EXPO_PUBLIC_API_URL` for the device you use:

- Web on the same computer: `http://localhost:5000`
- Android emulator: `http://10.0.2.2:5000`
- Physical phone: `http://<computer-LAN-IP>:5000` (phone and computer must share a network)

## Importing statements

Create an account first and set its opening balance/date to a known point. Pick the account in **Import statement**, preview the rows, review invalid/duplicate counts, then confirm import. Supported CSV columns include:

- Date
- Description, Narration, Particulars, or Remarks
- Debit and Credit, or Amount plus Type/Direction
- Optional Balance, Recipient/Payee, Reference/UTR, and Category

Use a running balance column whenever the bank provides one. For older data without a running balance, make sure the account opening balance/date predates the first transaction you import.

## SMS and platform boundaries

The app never reads messages in the background. Expo Go does not provide a general bank-SMS inbox reader, so **Read copied SMS and parse** reads the clipboard only after the user taps it. The pasted message is sent to the configured backend, parsed, and retained as a private source field on the transaction; finance API responses do not return that raw field. A native Android SMS receiver would require a separately reviewed development build, Android-specific implementation, and explicit user permission.

## Verification commands

```powershell
cd "C:\Humaixo Arth\backend"; npm run build
cd "C:\Humaixo Arth\HumaixoArth"; npx tsc --noEmit; npm run lint
cd "C:\Humaixo Arth\ai-service"; .\venv\Scripts\python.exe -m pytest -q
```
