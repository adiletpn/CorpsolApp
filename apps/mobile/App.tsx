import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { theme } from './src/theme';

function Root() {
  const { user, initializing } = useAuth();
  const [scanning, setScanning] = useState(false);

  if (initializing) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  if (!user) return <LoginScreen />;
  if (scanning) return <ScanScreen onDone={() => setScanning(false)} />;

  return <HomeScreen onScan={() => setScanning(true)} />;
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
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
});
