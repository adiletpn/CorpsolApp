import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { request } from '../api/client';
import type { Payroll } from '../api/types';
import { currentMonth, formatMoney } from '../lib/period';
import { theme } from '../theme';

export function PayrollScreen() {
  const [payroll, setPayroll] = useState<Payroll | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const period = currentMonth();
      const list = await request<Payroll[]>(`/payroll?periodStart=${period.from}`);
      setPayroll(list[0] ?? null);
    } catch {
      // Оставляем прошлые данные: экран не должен падать из-за сети.
    } finally {
      setRefreshing(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.colors.accent} />
      }
    >
      <Text style={styles.title}>Зарплата за месяц</Text>

      {!payroll ? (
        <View style={styles.card}>
          <Text style={styles.empty}>
            {loaded
              ? 'Расчёт за этот месяц ещё не выполнялся. Он появится, когда руководитель его запустит.'
              : 'Загрузка…'}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>К выплате</Text>
            <Text style={styles.totalValue}>{formatMoney(payroll.totalMinor)}</Text>
            {payroll.status === 'DRAFT' ? (
              <Text style={styles.draft}>Предварительный расчёт, может измениться</Text>
            ) : null}
          </View>

          <View style={styles.row}>
            <Summary label="Оклад" value={formatMoney(payroll.baseSalaryMinor)} />
            <Summary
              label="Премия"
              value={payroll.bonusMinor > 0 ? `+${formatMoney(payroll.bonusMinor)}` : '—'}
              color={theme.colors.success}
            />
            <Summary
              label="Удержано"
              value={payroll.penaltyMinor > 0 ? `−${formatMoney(payroll.penaltyMinor)}` : '—'}
              color={theme.colors.danger}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Из чего сложилось</Text>

            {payroll.lines.length === 0 ? (
              <Text style={styles.empty}>
                Ни одно правило не сработало — выплачивается оклад без изменений.
              </Text>
            ) : (
              payroll.lines.map((line) => (
                <View key={`${line.ruleId}-${line.title}`} style={styles.line}>
                  <Text style={styles.lineTitle}>{line.title}</Text>
                  <Text
                    style={[
                      styles.lineAmount,
                      {
                        color:
                          line.amountMinor >= 0 ? theme.colors.success : theme.colors.danger,
                      },
                    ]}
                  >
                    {line.amountMinor >= 0 ? '+' : '−'}
                    {formatMoney(Math.abs(line.amountMinor))}
                  </Text>
                </View>
              ))
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Summary({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.summary}>
      <Text style={[styles.summaryValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing(2), gap: theme.spacing(2), paddingBottom: theme.spacing(6) },
  title: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginTop: theme.spacing(2),
  },
  totalCard: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.lg,
    padding: theme.spacing(3),
  },
  totalLabel: { color: theme.colors.background, fontSize: 14, opacity: 0.8 },
  totalValue: {
    color: theme.colors.background,
    fontSize: 34,
    fontWeight: '700',
    marginTop: 4,
  },
  draft: { color: theme.colors.background, fontSize: 12, opacity: 0.75, marginTop: 6 },
  row: { flexDirection: 'row', gap: theme.spacing(1.5) },
  summary: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing(2),
  },
  summaryValue: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  summaryLabel: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing(2),
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: theme.spacing(1),
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing(1),
  },
  lineTitle: { color: theme.colors.text, fontSize: 14, flex: 1, paddingRight: theme.spacing(1) },
  lineAmount: { fontSize: 15, fontWeight: '700' },
  empty: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 21 },
});
