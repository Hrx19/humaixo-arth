// backend/server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios'); // AI service se baat karne ke liye

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const AI_SERVICE_URL = 'http://localhost:5001/parse-sms'; // AI Service ka address

// Middleware
app.use(cors());
app.use(express.json());

// 1. Health Check
app.get('/', (req, res) => {
    res.json({ 
        message: "Welcome to Humaixo Arth Backend! 🚀",
        status: "Running Successfully",
        ai_service: AI_SERVICE_URL
    });
});

// 2. Transactions Fetch Karne ka API
app.get('/api/transactions', (req, res) => {
    const transactions = [
        { id: 1, name: "Swiggy", meta: "Food • HDFC ••4521", amount: -450, type: "debit", category: "Food" },
        { id: 2, name: "Salary - TCS Ltd", meta: "Income • SBI ••8832", amount: 75000, type: "credit", category: "Income" },
        { id: 3, name: "Rahul Sharma", meta: "Transfer • UPI", amount: -2000, type: "debit", category: "Transfer" },
        { id: 4, name: "Amazon", meta: "Shopping • SBI CC", amount: -3499, type: "debit", category: "Shopping" }
    ];
    res.json(transactions);
});

// 3. 🆕 NEW: SMS Parse Karne ka API (AI Service ko call karega)
app.post('/api/parse-sms', async (req, res) => {
    try {
        const { sms } = req.body;
        
        if (!sms) {
            return res.status(400).json({ error: "SMS text is required" });
        }

        console.log(`📨 Received SMS for parsing: ${sms.substring(0, 50)}...`);

        // AI Service ko call karna
        const aiResponse = await axios.post(AI_SERVICE_URL, { sms });
        
        console.log(`✅ AI Parsed:`, aiResponse.data);

        // AI ka response frontend ko bhejna
        res.json({
            success: true,
            data: aiResponse.data
        });

    } catch (error) {
        console.error('❌ Error calling AI Service:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            return res.status(503).json({ 
                error: "AI Service is not running",
                details: "Please start the AI service on port 5001"
            });
        }

        res.status(500).json({ 
            error: "Failed to parse SMS",
            details: error.message
        });
    }
});

// Server Start
app.listen(PORT, () => {
    console.log(`✅ Humaixo Arth Backend is running on port ${PORT}`);
    console.log(`🔗 API Base: http://localhost:${PORT}`);
    console.log(`🤖 AI Service: ${AI_SERVICE_URL}`);
});