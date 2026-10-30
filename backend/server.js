// backend/server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors()); // Phone aur browser se request allow karne ke liye
app.use(express.json());

// 1. Pehla Test Route
app.get('/', (req, res) => {
    res.json({ 
        message: "Welcome to Humaixo Arth Backend! 🚀",
        status: "Running Successfully"
    });
});

// 2. Transactions ka data bhejne wala API
app.get('/api/transactions', (req, res) => {
    const realTransactions = [
        { id: 1, name: "Swiggy", meta: "Food • HDFC ••4521", amount: -450, type: "debit" },
        { id: 2, name: "Salary - TCS Ltd", meta: "Income • SBI ••8832", amount: 75000, type: "credit" },
        { id: 3, name: "Rahul Sharma", meta: "Transfer • UPI", amount: -2000, type: "debit" },
        { id: 4, name: "Amazon", meta: "Shopping • SBI CC", amount: -3499, type: "debit" },
        { id: 5, name: "Netflix", meta: "Subscription • Auto-debit", amount: -649, type: "debit" }
    ];
    res.json(realTransactions);
});

// 3. Naya AI Proxy Route (App se SMS lega aur AI ko bhejega)
app.get('/api/parse-sms', async (req, res) => {
    try {
        const sms = req.query.sms;
        // Backend, AI service (port 5001) se baat karega
        const response = await fetch(`http://localhost:5001/parse-sms?sms=${encodeURIComponent(sms)}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: "AI Service se connect nahi ho paya" });
    }
});

// Server Start (0.0.0.0 isliye taaki phone connect ho sake)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Humaixo Arth Server is running on port ${PORT}`);
    console.log(`🔗 Open http://localhost:${PORT} in your browser`);
});