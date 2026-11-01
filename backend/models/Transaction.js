// backend/models/Transaction.js
const mongoose = require('mongoose');

// Transaction ka structure (Schema) define karna
const transactionSchema = new mongoose.Schema({
    merchant: {
        type: String,
        required: true,
        trim: true
    },
    amount: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['credit', 'debit'], // Sirf 'credit' ya 'debit' allow hoga
        required: true
    },
    category: {
        type: String,
        default: 'General'
    },
    confidence: {
        type: Number,
        default: 0.0
    },
    date: {
        type: Date,
        default: Date.now // Jab transaction add hua, uska time
    }
});

// Model export karna taaki server.js use kar sake
module.exports = mongoose.model('Transaction', transactionSchema);