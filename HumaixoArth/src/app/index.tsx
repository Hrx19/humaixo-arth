// src/app/index.tsx
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, StatusBar, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';

export default function HomeScreen() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [smsInput, setSmsInput] = useState('');
  const [parsing, setParsing] = useState(false);

  useEffect(() => { fetchTransactions(); }, []);

  const fetchTransactions = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/transactions');
      const data = await response.json();
      setTransactions(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setLoading(false);
    }
  };

  const handleParseSMS = async () => {
    if (!smsInput.trim()) {
      Alert.alert('Error', 'Please paste a bank SMS first');
      return;
    }

    setParsing(true);
    try {
      const response = await fetch('http://localhost:5000/api/parse-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sms: smsInput })
      });

      const result = await response.json();

      if (response.ok) {
        const newTransaction = {
          id: Date.now(),
          name: result.data.merchant,
          meta: `${result.data.category} • AI Parsed • Confidence: ${(result.data.confidence * 100).toFixed(0)}%`,
          amount: result.data.type === 'credit' ? result.data.amount : -result.data.amount,
          type: result.data.type,
          category: result.data.category
        };

        setTransactions([newTransaction, ...transactions]);
        setSmsInput('');
        Alert.alert('Success', `Parsed: ₹${result.data.amount} - ${result.data.merchant} (${result.data.category})`);
      } else {
        Alert.alert('Error', result.error || 'Failed to parse SMS');
      }
    } catch (error) {
      console.error('Error parsing SMS:', error);
      Alert.alert('Error', 'Failed to connect to server');
    } finally {
      setParsing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <View style={styles.logoBox}><Text style={styles.logoText}>H</Text></View>
            <Text style={styles.brandName}>Humaixo <Text style={styles.brandHighlight}>Arth</Text></Text>
          </View>
          <View style={styles.profileBox}><Text style={styles.profileText}>HS</Text></View>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total Net Worth</Text>
          <Text style={styles.balanceAmount}>₹4,52,380</Text>
          <Text style={styles.balanceChange}>▲ +₹18,400 this month</Text>
        </View>

        {/* AI SMS Parser Section */}
        <View style={styles.parserCard}>
          <Text style={styles.parserTitle}>🤖 AI SMS Parser</Text>
          <Text style={styles.parserSubtitle}>Paste your bank SMS below</Text>
          
          <TextInput
            style={styles.smsInput}
            placeholder="e.g., INR 450 debited from A/c XXXX1234 at SWIGGY..."
            placeholderTextColor="#64748b"
            multiline
            numberOfLines={3}
            value={smsInput}
            onChangeText={setSmsInput}
            editable={!parsing}
          />

          <TouchableOpacity 
            style={[styles.parseButton, parsing && styles.parseButtonDisabled]} 
            onPress={handleParseSMS}
            disabled={parsing}
          >
            {parsing ? <ActivityIndicator color="white" /> : <Text style={styles.parseButtonText}>Parse with AI</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Today Income</Text>
            <Text style={[styles.statValue, styles.textGreen]}>+₹5,000</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Today Expense</Text>
            <Text style={[styles.statValue, styles.textRed]}>-₹1,240</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Recent Transactions</Text>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={styles.loadingText}>Loading data from server...</Text>
          </View>
        )}

        {!loading && transactions.map((tx) => (
          <View key={tx.id} style={styles.txItem}>
            <View style={[styles.txIcon, { backgroundColor: tx.type === 'credit' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }]}>
              <Text style={styles.txEmoji}>{tx.type === 'credit' ? '💰' : tx.category === 'Food' ? '🍔' : '🛒'}</Text>
            </View>
            <View style={styles.txInfo}>
              <Text style={styles.txName}>{tx.name}</Text>
              <Text style={styles.txMeta}>{tx.meta}</Text>
            </View>
            <Text style={[styles.txAmount, tx.type === 'credit' ? styles.textGreen : styles.textRed]}>
              {tx.type === 'credit' ? '+' : '-'}₹{Math.abs(tx.amount).toLocaleString('en-IN')}
            </Text>
          </View>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scrollContainer: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 30 },
  logoContainer: { flexDirection: 'row', alignItems: 'center' },
  logoBox: { width: 36, height: 36, backgroundColor: '#6366f1', borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  logoText: { color: 'white', fontSize: 18, fontWeight: '800' },
  brandName: { color: 'white', fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  brandHighlight: { color: '#818cf8' },
  profileBox: { width: 36, height: 36, backgroundColor: '#1e293b', borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  profileText: { color: 'white', fontSize: 14, fontWeight: '700' },
  balanceCard: { backgroundColor: '#1e1b4b', padding: 24, borderRadius: 24, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(99, 102, 241, 0.3)' },
  balanceLabel: { color: '#94a3b8', fontSize: 12, marginBottom: 8 },
  balanceAmount: { color: 'white', fontSize: 34, fontWeight: '800', letterSpacing: -1, marginBottom: 6 },
  balanceChange: { color: '#10b981', fontSize: 13 },
  parserCard: { backgroundColor: '#1e293b', padding: 20, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: '#334155' },
  parserTitle: { color: 'white', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  parserSubtitle: { color: '#94a3b8', fontSize: 12, marginBottom: 12 },
  smsInput: { backgroundColor: '#0f172a', color: 'white', borderRadius: 12, padding: 12, fontSize: 13, minHeight: 80, textAlignVertical: 'top', marginBottom: 12, borderWidth: 1, borderColor: '#475569' },
  parseButton: { backgroundColor: '#6366f1', padding: 14, borderRadius: 12, alignItems: 'center' },
  parseButtonDisabled: { backgroundColor: '#475569' },
  parseButtonText: { color: 'white', fontSize: 15, fontWeight: '700' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  statCard: { backgroundColor: '#1e293b', padding: 16, borderRadius: 16, width: '48%' },
  statLabel: { color: '#94a3b8', fontSize: 11, marginBottom: 8 },
  statValue: { fontSize: 18, fontWeight: '700' },
  textGreen: { color: '#10b981' },
  textRed: { color: '#ef4444' },
  sectionTitle: { color: '#94a3b8', fontSize: 14, fontWeight: '700', marginBottom: 12, marginTop: 10 },
  loadingContainer: { padding: 20, alignItems: 'center' },
  loadingText: { color: '#94a3b8', marginTop: 10, fontSize: 12 },
  txItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#334155' },
  txIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  txEmoji: { fontSize: 18 },
  txInfo: { flex: 1 },
  txName: { color: 'white', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  txMeta: { color: '#94a3b8', fontSize: 11 },
  txAmount: { fontSize: 14, fontWeight: '700' },
});