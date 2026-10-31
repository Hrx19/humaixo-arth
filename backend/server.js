// backend/server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3').verbose();

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors()); 
app.use(express.json());

// 1. SQLite Database Setup
const db = new sqlite3.Database('./humaixo_arth.db', (err) => {
    if (err) console.error('DB Error:', err.message);
    else console.log('✅ SQLite Database se connect ho gaya!');
});

db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    meta TEXT,
    amount REAL,
    type TEXT
)`);

// Dummy data (agar database khaali hai)
db.get("SELECT count(*) as count FROM transactions", (err, row) => {
    if (row.count === 0) {
        const dummyData = [
            ['Swiggy', 'Food • HDFC ••4521', -450, 'debit'],
            ['Salary - TCS Ltd', 'Income • SBI ••8832', 75000, 'credit'],
            ['Rahul Sharma', 'Transfer • UPI', -2000, 'debit'],
            ['Amazon', 'Shopping • SBI CC', -3499, 'debit'],
            ['Netflix', 'Subscription • Auto-debit', -649, 'debit']
        ];
        const stmt = db.prepare("INSERT INTO transactions (name, meta, amount, type) VALUES (?, ?, ?, ?)");
        dummyData.forEach(tx => stmt.run(tx));
        stmt.finalize();
        console.log(' Dummy transactions database mein daal diye gaye.');
    }
});

// 2. API: Transactions ko Database se padhna
app.get('/api/transactions', (req, res) => {
    db.all("SELECT * FROM transactions ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 3. API: AI SMS Parser + Auto Save to Database (MAGIC FEATURE)
app.get('/api/parse-sms', async (req, res) => {
    try {
        const sms = req.query.sms;
        // AI Service se data mango
        const response = await fetch(`http://localhost:5001/parse-sms?sms=${encodeURIComponent(sms)}`);
        const data = await response.json();

        // AI se mila data ko Database ke format mein badlo
        const amountStr = data.extracted_amount.replace('₹', '').replace(',', '');
        let finalAmount = parseFloat(amountStr);
        if (data.transaction_type === 'DEBIT') {
            finalAmount = -finalAmount; // Debit ko negative banao
        }
        
        const txName = data.predicted_category + " (via AI)";
        const txMeta = "AI Parsed • " + data.transaction_type;
        const txType = data.transaction_type.toLowerCase();

        // Database mein save karo
        db.run(`INSERT INTO transactions (name, meta, amount, type) VALUES (?, ?, ?, ?)`,
            [txName, txMeta, finalAmount, txType], function(err) {
                if (err) console.error("DB Save Error:", err);
                else console.log(`✅ Naya transaction DB mein save ho gaya! ID: ${this.lastID}`);
            }
        );

        res.json(data); // App ko response bhejo
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "AI Service se connect nahi ho paya" });
    }
});

// Server Start
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Humaixo Arth Server is running on port ${PORT}`);
});