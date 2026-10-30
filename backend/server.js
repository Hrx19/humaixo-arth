// backend/server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Environment variables load karo
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware (JSON data aur CORS allow karne ke liye)
app.use(cors());
app.use(express.json());

// Pehla Test Route (Yeh check karega ki server chal raha hai ya nahi)
app.get('/', (req, res) => {
    res.json({ 
        message: "Welcome to Humaixo Arth Backend! 🚀",
        status: "Running Successfully"
    });
});

// Server ko start karo
app.listen(PORT, () => {
    console.log(`✅ Humaixo Arth Server is running on port ${PORT}`);
    console.log(`🔗 Open http://localhost:${PORT} in your browser`);
});