import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { request } from '../api/client';
import type { LeaderboardResult, Plan, RankedEntry } from '../api/types';
import { currentMonth } from '../lib/period';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';

const METRIC_LABELS: Record<Plan['metric'], string> = {
  CALLS: 'Звонки',
  TALK_MINUTES: 'Минуты разговора',
  OFFERS: 'Сделки',
  REVENUE: 'Выручка',
};

function medal(rank: number): string {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : String(rank);
}

export function LeaderboardScreen() {
  const { user } = useAuth();
  const [board, setBoard] = useState<LeaderboardResult | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const period = currentMonth();

    try {
      const [result, planList] = await Promise.all([
        request<LeaderboardResult>(
          `/gamification/leaderboard?from=${period.from}&to=${period.to}`,
        ),
        request<Plan[]>(`/plans?periodStart=${period.from}`),
      ]);

      setBoard(result);
      setPlans(planList);
    } catch {
      // Молча оставляем прошлые данные.
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const departmentPlans = plans.filter((plan) => plan.scope === 'DEPARTMENT');
  const personalPlans = plans.filter((plan) => plan.scope === 'USER');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.colors.accent} />
      }
    >
      <Text style={styles.title}>Рейтинг и планы</Text>

      {board?.self ? (
        <View style={styles.selfCard}>
          <Text style={styles.selfRank}>{medal(board.self.rank)} место</Text>
          <Text style={styles.selfPoints}>{board.self.points} очков</Text>
          {board.self.pointsBehindLeader > 0 ? (
            <Text style={styles.selfBehind}>
              До первого места: {board.self.pointsBehindLeader}
            </Text>
          ) : (
            <Text style={styles.selfBehind}>Вы лидер отдела</Text>
          )}
        </View>
      ) : null}

      {personalPlans.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Мой план</Text>
          {personalPlans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} />
          ))}
        </View>
      ) : null}

      {departmentPlans.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>План отдела</Text>
          {departmentPlans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} />
          ))}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Рейтинг отдела</Text>

        {!board || board.entries.length === 0 ? (
          <Text style={styles.empty}>Очки за этот месяц ещё не начислялись</Text>
        ) : (
          board.entries.map((entry) => (
            <Row key={entry.userId} entry={entry} isSelf={entry.userId === user?.id} />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function PlanRow({ plan }: { plan: Plan }) {
  const percent = Math.round(plan.progress.ratio * 100);
  const color =
    percent >= 100 ? theme.colors.success : percent >= 70 ? theme.colors.warning : theme.colors.danger;

  return (
    <View style={styles.plan}>
      <View style={styles.planHeader}>
        <Text style={styles.planLabel}>{METRIC_LABELS[plan.metric]}</Text>
        <Text style={[styles.planPercent, { color }]}>{percent}%</Text>
      </View>

      <View style={styles.bar}>
        {/* Полосу обрезаем на сотне, подпись показывает настоящий процент. */}
        <View style={[styles.barFill, { width: `${Math.min(100, percent)}%`, backgroundColor: color }]} />
      </View>

      <Text style={styles.planHint}>
        {plan.progress.achieved} из {plan.progress.target}
        {plan.progress.isComplete ? ' · закрыт' : ` · осталось ${plan.progress.remaining}`}
      </Text>
    </View>
  );
}

function Row({ entry, isSelf }: { entry: RankedEntry; isSelf: boolean }) {
  return (
    <View style={[styles.row, isSelf && styles.rowSelf]}>
      <Text style={styles.rowRank}>{medal(entry.rank)}</Text>
      <Text style={styles.rowName}>
        {entry.fullName}
        {isSelf ? ' — вы' : ''}
      </Text>
      <Text style={styles.rowPoints}>{entry.points}</Text>
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
  selfCard: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.lg,
    padding: theme.spacing(3),
  },
  selfRank: { color: theme.colors.background, fontSize: 24, fontWeight: '700' },
  selfPoints: { color: theme.colors.background, fontSize: 16, marginTop: 4 },
  selfBehind: { color: theme.colors.background, fontSize: 13, opacity: 0.8, marginTop: 8 },
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
  plan: { marginBottom: theme.spacing(1.5) },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  planLabel: { color: theme.colors.text, fontSize: 14 },
  planPercent: { fontSize: 14, fontWeight: '700' },
  bar: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 999,
    height: 8,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 999 },
  planHint: { color: theme.colors.textMuted, fontSize: 12, marginTop: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing(1),
    borderRadius: theme.radius.sm,
  },
  rowSelf: { backgroundColor: theme.colors.surfaceMuted, paddingHorizontal: theme.spacing(1) },
  rowRank: { color: theme.colors.text, fontSize: 16, width: 36 },
  rowName: { color: theme.colors.text, fontSize: 15, flex: 1 },
  rowPoints: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  empty: { color: theme.colors.textMuted, fontSize: 14 },
});
