// src/app/index.tsx
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, StatusBar, ActivityIndicator, TextInput, TouchableOpacity } from 'react-native';

// YAHAN APNA LAPTOP KA IP ADDRESS DALNA
const API_IP = '192.168.56.1'; 

type Transaction = {
  id: string | number;
  name: string;
  meta: string;
  amount: number;
  type: 'credit' | 'debit';
};

type AiResult = {
  extracted_amount?: number | string;
  predicted_category?: string;
  transaction_type?: string;
  error?: string;
};

export default function HomeScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [smsInput, setSmsInput] = useState('');
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [parsing, setParsing] = useState(false);

  // Backend se data lane ka function
  const fetchTransactions = () => {
    setLoading(true);
    fetch(`http://${API_IP}:5000/api/transactions`)
      .then(response => response.json())
      .then(data => {
        setTransactions(data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error:', error);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  // AI Parse aur Auto-Refresh function
  const handleParseSMS = async () => {
    if (!smsInput.trim()) return;
    setParsing(true);
    setAiResult(null);

    try {
      const response = await fetch(`http://${API_IP}:5000/api/parse-sms?sms=${encodeURIComponent(smsInput)}`);
      const data = await response.json();
      setAiResult(data);
      
      // MAGIC: Parse hone ke baad list ko refresh karo taaki naya item dikh jaye
      setTimeout(() => {
        fetchTransactions(); 
        setSmsInput(''); // Input box khaali kar do
      }, 1000);

    } catch (error) {
      console.error('AI Error:', error);
      setAiResult({ error: "AI se connect nahi ho paya" });
    } finally {
      setParsing(false);
    }
  };

  const analyticsData = [
    { category: 'Food & Dining', amount: 4500, color: '#ef4444', percentage: 45 },
    { category: 'Shopping', amount: 3499, color: '#f59e0b', percentage: 35 },
    { category: 'Transport', amount: 1200, color: '#3b82f6', percentage: 12 },
    { category: 'Bills & Others', amount: 800, color: '#8b5cf6', percentage: 8 },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <View style={styles.logoBox}><Text style={styles.logoText}>H</Text></View>
            <Text style={styles.brandName}>Humaixo <Text style={styles.brandHighlight}>Arth</Text></Text>
          </View>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total Net Worth</Text>
          <Text style={styles.balanceAmount}>₹4,52,380</Text>
          <Text style={styles.balanceChange}>▲ +₹18,400 this month</Text>
        </View>

        <View style={styles.aiBox}>
          <Text style={styles.aiTitle}>🧠 AI SMS Parser (Auto-Save)</Text>
          <TextInput
            style={styles.input}
            placeholder="Paste Bank SMS here..."
            placeholderTextColor="#94a3b8"
            value={smsInput}
            onChangeText={setSmsInput}
            multiline
          />
          <TouchableOpacity style={styles.parseButton} onPress={handleParseSMS} disabled={parsing}>
            <Text style={styles.parseButtonText}>{parsing ? 'Processing...' : 'Parse & Save with AI'}</Text>
          </TouchableOpacity>

          {aiResult && !aiResult.error && (
            <View style={styles.resultBox}>
              <Text style={styles.resultText}>💰 Amount: <Text style={styles.highlight}>{aiResult.extracted_amount}</Text></Text>
              <Text style={styles.resultText}>📂 Category: <Text style={styles.highlight}>{aiResult.predicted_category}</Text></Text>
              <Text style={styles.resultText}>🔄 Type: <Text style={styles.highlight}>{aiResult.transaction_type}</Text></Text>
            </View>
          )}
          {aiResult?.error && <Text style={styles.errorText}>{aiResult.error}</Text>}
        </View>

        <View style={styles.analyticsCard}>
          <Text style={styles.sectionTitle}>Monthly Expense Breakdown</Text>
          {analyticsData.map((item, index) => (
            <View key={index} style={styles.analyticsRow}>
              <View style={styles.analyticsInfo}>
                <View style={[styles.colorDot, { backgroundColor: item.color }]} />
                <Text style={styles.analyticsName}>{item.category}</Text>
                <Text style={styles.analyticsAmount}>₹{item.amount.toLocaleString('en-IN')}</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${item.percentage}%`, backgroundColor: item.color }]} />
              </View>
              <Text style={styles.analyticsPercent}>{item.percentage}%</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Recent Transactions (Live DB)</Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6366f1" />
          </View>
        ) : (
          transactions.map((tx) => (
            <View key={tx.id} style={styles.txItem}>
              <View style={[styles.txIcon, { backgroundColor: tx.type === 'credit' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }]}>
                <Text style={styles.txEmoji}>{tx.type === 'credit' ? '' : '🛒'}</Text>
              </View>
              <View style={styles.txInfo}>
                <Text style={styles.txName}>{tx.name}</Text>
                <Text style={styles.txMeta}>{tx.meta}</Text>
              </View>
              <Text style={[styles.txAmount, tx.type === 'credit' ? styles.textGreen : styles.textRed]}>
                {tx.type === 'credit' ? '+' : '-'}₹{Math.abs(tx.amount).toLocaleString('en-IN')}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scrollContainer: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 20 },
  logoContainer: { flexDirection: 'row', alignItems: 'center' },
  logoBox: { width: 36, height: 36, backgroundColor: '#6366f1', borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  logoText: { color: 'white', fontSize: 18, fontWeight: '800' },
  brandName: { color: 'white', fontSize: 18, fontWeight: '800' },
  brandHighlight: { color: '#818cf8' },
  balanceCard: { backgroundColor: '#1e1b4b', padding: 24, borderRadius: 24, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(99, 102, 241, 0.3)' },
  balanceLabel: { color: '#94a3b8', fontSize: 12, marginBottom: 8 },
  balanceAmount: { color: 'white', fontSize: 34, fontWeight: '800', letterSpacing: -1, marginBottom: 6 },
  balanceChange: { color: '#10b981', fontSize: 13 },
  aiBox: { backgroundColor: '#1e293b', padding: 16, borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: '#6366f1' },
  aiTitle: { color: '#818cf8', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  input: { backgroundColor: '#0f172a', color: 'white', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155', minHeight: 60, textAlignVertical: 'top', fontSize: 14 },
  parseButton: { backgroundColor: '#6366f1', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  parseButtonText: { color: 'white', fontWeight: '700', fontSize: 16 },
  resultBox: { marginTop: 16, padding: 12, backgroundColor: '#0f172a', borderRadius: 8, borderWidth: 1, borderColor: '#10b981' },
  resultText: { color: '#cbd5e1', fontSize: 14, marginBottom: 6 },
  highlight: { color: '#10b981', fontWeight: '700' },
  errorText: { color: '#ef4444', marginTop: 12, textAlign: 'center' },
  analyticsCard: { backgroundColor: '#1e293b', padding: 16, borderRadius: 16, marginBottom: 24 },
  analyticsRow: { marginBottom: 16 },
  analyticsInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  colorDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  analyticsName: { color: '#cbd5e1', fontSize: 14, flex: 1 },
  analyticsAmount: { color: 'white', fontSize: 14, fontWeight: '700' },
  progressBarBg: { height: 8, backgroundColor: '#0f172a', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: 8, borderRadius: 4 },
  analyticsPercent: { color: '#94a3b8', fontSize: 12, textAlign: 'right', marginTop: 4 },
  sectionTitle: { color: '#94a3b8', fontSize: 14, fontWeight: '700', marginBottom: 12 },
  loadingContainer: { padding: 20, alignItems: 'center' },
  txItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#334155' },
  txIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  txEmoji: { fontSize: 18 },
  txInfo: { flex: 1 },
  txName: { color: 'white', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  txMeta: { color: '#94a3b8', fontSize: 11 },
  txAmount: { fontSize: 14, fontWeight: '700' },
  textGreen: { color: '#10b981' },
  textRed: { color: '#ef4444' },
});