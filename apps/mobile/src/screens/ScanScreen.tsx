import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ApiError, request } from '../api/client';
import type { CheckInResponse } from '../api/types';
import { LocationDenied, readLocation } from '../lib/location';
import { theme } from '../theme';

type Phase =
  | { kind: 'scanning' }
  | { kind: 'submitting'; step: string }
  | { kind: 'success'; result: CheckInResponse }
  | { kind: 'error'; message: string; code?: string };

/** Подсказки поверх сообщения сервера: что именно сотруднику сделать. */
const ACTION_HINTS: Record<string, string> = {
  outside_fence: 'Подойдите ближе к офису и повторите.',
  accuracy_too_low: 'Выйдите ближе к окну или на улицу — сигнал GPS слишком слабый.',
  mocked_location: 'Отключите приложения подмены геолокации.',
  qr_expired: 'Код на экране обновляется каждые 30 секунд — отсканируйте заново.',
  device_mismatch: 'Отметка возможна только с телефона, закреплённого за вашим аккаунтом.',
};

export function ScanScreen({ onDone }: { onDone: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ kind: 'scanning' });

  // Камера успевает отдать один и тот же код несколько раз подряд —
  // защёлка не даёт отправить дубль запроса.
  const locked = useRef(false);

  const handleScan = useCallback(async ({ data }: { data: string }) => {
    if (locked.current) return;
    locked.current = true;

    try {
      setPhase({ kind: 'submitting', step: 'Определяем местоположение…' });
      const location = await readLocation();

      setPhase({ kind: 'submitting', step: 'Подтверждаем приход…' });
      const result = await request<CheckInResponse>('/attendance/check-in', {
        method: 'POST',
        body: { qr: data, ...location },
      });

      setPhase({ kind: 'success', result });
    } catch (cause) {
      if (cause instanceof LocationDenied) {
        setPhase({
          kind: 'error',
          message: 'Без доступа к геолокации отметка невозможна. Разрешите доступ в настройках.',
        });
      } else if (cause instanceof ApiError) {
        setPhase({ kind: 'error', message: cause.message, code: cause.code });
      } else {
        setPhase({ kind: 'error', message: 'Нет связи с сервером. Попробуйте ещё раз.' });
      }
    }
  }, []);

  const retry = () => {
    locked.current = false;
    setPhase({ kind: 'scanning' });
  };

  if (!permission) {
    return <Centered><ActivityIndicator color={theme.colors.accent} /></Centered>;
  }

  if (!permission.granted) {
    return (
      <Centered>
        <Text style={styles.message}>
          Для отметки прихода нужен доступ к камере — ею сканируется QR-код терминала.
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Разрешить доступ</Text>
        </TouchableOpacity>
      </Centered>
    );
  }

  if (phase.kind === 'submitting') {
    return (
      <Centered>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.message}>{phase.step}</Text>
      </Centered>
    );
  }

  if (phase.kind === 'success') {
    const { result } = phase;
    const late = result.status === 'LATE';
    return (
      <Centered>
        <Text style={[styles.badge, late ? styles.badgeLate : styles.badgeOk]}>
          {late ? `Опоздание ${result.lateMinutes} мин` : 'Приход отмечен вовремя'}
        </Text>
        <Text style={styles.message}>
          {result.office.name} · {new Date(result.checkInAt).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
        <Text style={styles.hint}>Расстояние до офиса: {result.distanceMeters} м</Text>
        <TouchableOpacity style={styles.button} onPress={onDone}>
          <Text style={styles.buttonText}>Готово</Text>
        </TouchableOpacity>
      </Centered>
    );
  }

  if (phase.kind === 'error') {
    return (
      <Centered>
        <Text style={[styles.badge, styles.badgeError]}>Отметка не засчитана</Text>
        <Text style={styles.message}>{phase.message}</Text>
        {phase.code && ACTION_HINTS[phase.code] ? (
          <Text style={styles.hint}>{ACTION_HINTS[phase.code]}</Text>
        ) : null}
        <TouchableOpacity style={styles.button} onPress={retry}>
          <Text style={styles.buttonText}>Попробовать снова</Text>
        </TouchableOpacity>
      </Centered>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleScan}
      />
      <View style={styles.overlay}>
        <View style={styles.frame} />
        <Text style={styles.overlayText}>
          Наведите камеру на QR-код терминала в офисе
        </Text>
      </View>
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(3),
    gap: theme.spacing(2),
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing(3),
  },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.lg,
  },
  overlayText: {
    color: theme.colors.text,
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: theme.spacing(4),
  },
  message: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  badge: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  badgeOk: { color: theme.colors.success },
  badgeLate: { color: theme.colors.warning },
  badgeError: { color: theme.colors.danger },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(1.75),
    paddingHorizontal: theme.spacing(4),
    marginTop: theme.spacing(1),
  },
  buttonText: {
    color: theme.colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
});
