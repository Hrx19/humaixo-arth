import React from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, StatusBar } from 'react-native';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <View style={styles.logoBox}>
              <Text style={styles.logoText}>H</Text>
            </View>
            <Text style={styles.brandName}>Humaixo <Text style={styles.brandHighlight}>Arth</Text></Text>
          </View>
          <View style={styles.profileBox}>
            <Text style={styles.profileText}>HS</Text>
          </View>
        </View>

        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total Net Worth</Text>
          <Text style={styles.balanceAmount}>₹4,52,380</Text>
          <Text style={styles.balanceChange}>▲ +₹18,400 this month</Text>
        </View>

        {/* Quick Stats */}
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

        {/* Transactions Header */}
        <Text style={styles.sectionTitle}>Recent Transactions</Text>

        {/* Transaction List */}
        <View style={styles.txItem}>
          <View style={[styles.txIcon, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
            <Text style={styles.txEmoji}></Text>
          </View>
          <View style={styles.txInfo}>
            <Text style={styles.txName}>Swiggy</Text>
            <Text style={styles.txMeta}>Food • HDFC ••4521</Text>
          </View>
          <Text style={[styles.txAmount, styles.textRed]}>-₹450</Text>
        </View>

        <View style={styles.txItem}>
          <View style={[styles.txIcon, { backgroundColor: 'rgba(16,185,129,0.1)' }]}>
            <Text style={styles.txEmoji}>💰</Text>
          </View>
          <View style={styles.txInfo}>
            <Text style={styles.txName}>Salary - TCS Ltd</Text>
            <Text style={styles.txMeta}>Income • SBI ••8832</Text>
          </View>
          <Text style={[styles.txAmount, styles.textGreen]}>+₹75,000</Text>
        </View>

        <View style={styles.txItem}>
          <View style={[styles.txIcon, { backgroundColor: 'rgba(99,102,241,0.1)' }]}>
            <Text style={styles.txEmoji}></Text>
          </View>
          <View style={styles.txInfo}>
            <Text style={styles.txName}>Rahul Sharma</Text>
            <Text style={styles.txMeta}>Transfer • UPI</Text>
          </View>
          <Text style={[styles.txAmount, styles.textRed]}>-₹2,000</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a', // Dark slate background
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBox: {
    width: 36,
    height: 36,
    backgroundColor: '#6366f1', // Indigo
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  logoText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
  },
  brandName: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  brandHighlight: {
    color: '#818cf8',
  },
  profileBox: {
    width: 36,
    height: 36,
    backgroundColor: '#1e293b',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  balanceCard: {
    backgroundColor: '#1e1b4b', // Dark indigo
    padding: 24,
    borderRadius: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  balanceLabel: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 8,
  },
  balanceAmount: {
    color: 'white',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
    marginBottom: 6,
  },
  balanceChange: {
    color: '#10b981',
    fontSize: 13,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 16,
    width: '48%',
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: 11,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  textGreen: {
    color: '#10b981',
  },
  textRed: {
    color: '#ef4444',
  },
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  txItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txEmoji: {
    fontSize: 18,
  },
  txInfo: {
    flex: 1,
  },
  txName: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  txMeta: {
    color: '#94a3b8',
    fontSize: 11,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
});