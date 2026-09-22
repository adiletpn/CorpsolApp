import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { FirebaseError } from 'firebase/app';

import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';

/** Отказы по устройству приходят с бэкенда — сотрудник должен понимать, что делать. */
const ERROR_HINTS: Record<string, string> = {
  device_mismatch:
    'Аккаунт закреплён за другим телефоном. Заявка на перепривязку отправлена HR — дождитесь подтверждения.',
  device_taken: 'Это устройство уже закреплено за другим сотрудником.',
  device_required: 'Вход возможен только из мобильного приложения.',
  employee_inactive: 'Учётная запись неактивна. Обратитесь к HR.',
  no_session: 'Сессия не найдена, войдите заново.',
};

/**
 * Ошибки Firebase Auth. Неверный логин и неверный пароль намеренно сведены
 * к одному тексту: разные сообщения подсказали бы, какие email существуют.
 */
const FIREBASE_HINTS: Record<string, string> = {
  'auth/invalid-email': 'Неверный email или пароль.',
  'auth/invalid-credential': 'Неверный email или пароль.',
  'auth/wrong-password': 'Неверный email или пароль.',
  'auth/user-not-found': 'Неверный email или пароль.',
  'auth/user-disabled': 'Учётная запись отключена. Обратитесь к HR.',
  'auth/too-many-requests': 'Слишком много попыток входа. Попробуйте позже.',
  'auth/network-request-failed': 'Нет связи с сервером.',
};

function describe(cause: unknown): string {
  if (cause instanceof ApiError) {
    return ERROR_HINTS[cause.code ?? ''] ?? cause.message;
  }
  if (cause instanceof FirebaseError) {
    return FIREBASE_HINTS[cause.code] ?? 'Не удалось войти. Попробуйте ещё раз.';
  }
  return 'Нет связи с сервером';
}

export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (cause) {
      setError(describe(cause));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = email.length > 3 && password.length >= 8 && !busy;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>CorpSol</Text>
        <Text style={styles.subtitle}>Вход для сотрудников</Text>

        <TextInput
          style={styles.input}
          placeholder="Рабочий email"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Пароль"
          placeholderTextColor={theme.colors.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={submit}
          disabled={!canSubmit}
        >
          {busy ? (
            <ActivityIndicator color={theme.colors.background} />
          ) : (
            <Text style={styles.buttonText}>Войти</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.notice}>
          Аккаунт привязывается к этому устройству. Вход с другого телефона потребует
          подтверждения HR.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    padding: theme.spacing(2),
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing(3),
    gap: theme.spacing(1.5),
  },
  title: {
    color: theme.colors.text,
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: theme.spacing(1),
  },
  input: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(1.75),
    color: theme.colors.text,
    fontSize: 16,
  },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(2),
    alignItems: 'center',
    marginTop: theme.spacing(1),
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: {
    color: theme.colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  error: {
    color: theme.colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  notice: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: theme.spacing(1),
  },
});
