import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { TabBar, type TabKey } from './src/components/TabBar';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { OffersScreen } from './src/screens/OffersScreen';
import { PayrollScreen } from './src/screens/PayrollScreen';
import { LeaderboardScreen } from './src/screens/LeaderboardScreen';
import { theme } from './src/theme';

function Root() {
  const { user, initializing } = useAuth();
  const [tab, setTab] = useState<TabKey>('home');
  const [scanning, setScanning] = useState(false);

  if (initializing) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  if (!user) return <LoginScreen />;

  // Сканирование открывается поверх вкладок: это разовое действие,
  // а не раздел, и возвращаться из него нужно туда же, откуда пришёл.
  if (scanning) return <ScanScreen onDone={() => setScanning(false)} />;

  const screens: Record<TabKey, React.ReactNode> = {
    home: <HomeScreen onScan={() => setScanning(true)} />,
    offers: <OffersScreen />,
    payroll: <PayrollScreen />,
    rating: <LeaderboardScreen />,
  };

  return (
    <View style={styles.shell}>
      <View style={styles.screen}>{screens[tab]}</View>
      <TabBar active={tab} onChange={setTab} />
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        <Root />
      </SafeAreaView>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  shell: { flex: 1 },
  screen: { flex: 1 },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
});
