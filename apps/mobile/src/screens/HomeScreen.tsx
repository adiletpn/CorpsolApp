import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { request } from '../api/client';
import type { AttendanceRecord } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';

const STATUS_LABELS: Record<AttendanceRecord['status'], string> = {
  ON_TIME: 'Вовремя',
  LATE: 'Опоздание',
  ABSENT: 'Отсутствие',
  DAY_OFF: 'Выходной',
  EXCUSED: 'Уважительная',
};

const STATUS_COLORS: Record<AttendanceRecord['status'], string> = {
  ON_TIME: theme.colors.success,
  LATE: theme.colors.warning,
  ABSENT: theme.colors.danger,
  DAY_OFF: theme.colors.textMuted,
  EXCUSED: theme.colors.accent,
};

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function HomeScreen({ onScan }: { onScan: () => void }) {
  const { user, signOut } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const { from, to } = monthRange();
      const data = await request<AttendanceRecord[]>(
        `/attendance/me?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      setRecords(data);
    } catch {
      // Молча оставляем прошлые данные: экран не должен падать из-за сети.
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const checkedInToday = records.some(
    (record) =>
      record.checkInAt &&
      new Date(record.workDate).toDateString() === new Date().toDateString(),
  );

  const onTimeCount = records.filter((record) => record.status === 'ON_TIME').length;
  const lateCount = records.filter((record) => record.status === 'LATE').length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.colors.accent} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{user?.fullName}</Text>
          <Text style={styles.role}>Менеджер отдела продаж</Text>
        </View>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.signOut}>Выйти</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.checkInCard, checkedInToday && styles.checkInCardDone]}
        onPress={onScan}
        disabled={checkedInToday}
      >
        <Text style={styles.checkInTitle}>
          {checkedInToday ? 'Приход отмечен' : 'Отметить приход'}
        </Text>
        <Text style={styles.checkInSubtitle}>
          {checkedInToday
            ? 'На сегодня всё, хорошего дня'
            : 'Отсканируйте QR-код на терминале в офисе'}
        </Text>
      </TouchableOpacity>

      <View style={styles.statsRow}>
        <Stat label="Вовремя" value={onTimeCount} color={theme.colors.success} />
        <Stat label="Опозданий" value={lateCount} color={theme.colors.warning} />
        <Stat label="Смен" value={records.length} color={theme.colors.accent} />
      </View>

      <Text style={styles.sectionTitle}>Мой табель за месяц</Text>
      {records.length === 0 ? (
        <Text style={styles.empty}>Отметок пока нет</Text>
      ) : (
        records.map((record) => (
          <View key={record.id} style={styles.row}>
            <Text style={styles.rowDate}>
              {new Date(record.workDate).toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: 'short',
              })}
            </Text>
            <Text style={styles.rowTime}>
              {record.checkInAt
                ? new Date(record.checkInAt).toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'}
            </Text>
            <Text style={[styles.rowStatus, { color: STATUS_COLORS[record.status] }]}>
              {STATUS_LABELS[record.status]}
              {record.lateMinutes > 0 ? ` · ${record.lateMinutes} мин` : ''}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing(2), gap: theme.spacing(2), paddingBottom: theme.spacing(6) },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing(4),
  },
  greeting: { color: theme.colors.text, fontSize: 22, fontWeight: '700' },
  role: { color: theme.colors.textMuted, fontSize: 14, marginTop: 2 },
  signOut: { color: theme.colors.textMuted, fontSize: 14 },
  checkInCard: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.lg,
    padding: theme.spacing(3),
    gap: theme.spacing(0.5),
  },
  checkInCardDone: { backgroundColor: theme.colors.surface },
  checkInTitle: { color: theme.colors.background, fontSize: 20, fontWeight: '700' },
  checkInSubtitle: { color: theme.colors.background, fontSize: 14, opacity: 0.8 },
  statsRow: { flexDirection: 'row', gap: theme.spacing(1.5) },
  stat: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing(2),
    alignItems: 'center',
  },
  statValue: { fontSize: 26, fontWeight: '700' },
  statLabel: { color: theme.colors.textMuted, fontSize: 13, marginTop: 2 },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '600',
    marginTop: theme.spacing(1),
  },
  empty: { color: theme.colors.textMuted, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(1.5),
    paddingHorizontal: theme.spacing(2),
  },
  rowDate: { color: theme.colors.text, fontSize: 15, width: 80 },
  rowTime: { color: theme.colors.textMuted, fontSize: 15, width: 64 },
  rowStatus: { fontSize: 14, fontWeight: '600', flex: 1, textAlign: 'right' },
});
