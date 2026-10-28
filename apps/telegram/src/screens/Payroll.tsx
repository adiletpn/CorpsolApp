import { WEEK_BAND_LABELS, formatMinor } from '@corpsol/shared';
import React from 'react';

import { api, type GradeProgress, type Payroll as PayrollSheet, type PayrollForecast } from '../api';
import { formatDate, monthRange } from '../format';
import { RingMeter, StackedBar, chart } from '../charts';
import { PeriodScreen } from '../PeriodScreen';
import { Figure, FigureRow, Gap, HeroFigure, Panel, PanelRow, RowValue, SectionLabel, tone } from '../ui';

const STATUS_LABELS: Record<PayrollSheet['status'], string> = {
  DRAFT: 'Черновик',
  APPROVED: 'Утверждён',
  PAID: 'Выплачен',
};

export function Payroll() {
  const now = new Date();
  const month = monthRange(now);
  const previous = monthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  return (
    <PeriodScreen
      title="Зарплата"
      subtitle="Оклад, бонусы и удержания"
      load={async () => {
        const [current, past, grade, forecast] = await Promise.all([
          api.payroll(month.from),
          api.payroll(previous.from),
          // Ранг и прогноз — дополнения: без них расчёт всё равно должен показаться.
          api.grade().catch(() => null),
          api.forecast().catch(() => null),
        ]);
        // На стыке периодов один лист может прийти в обоих ответах.
        const sheets = [...current, ...past].filter(
          (sheet, index, all) => all.findIndex((item) => item.id === sheet.id) === index,
        );
        // Пока лист за месяц не утверждён, вместо него — прогноз.
        const approvedThisMonth = sheets.some((sheet) => sheet.periodStart === month.from);
        return { sheets, grade, forecast: approvedThisMonth ? null : forecast };
      }}
      isEmpty={({ sheets, grade, forecast }) => sheets.length === 0 && !grade && !forecast}
      // Черновик сотруднику не показывают: суммы ещё изменятся пересчётом.
      emptyMessage="Расчёт появится, когда руководитель его утвердит"
      emptyIcon="payments"
    >
      {({ sheets, grade, forecast }) => (
        <>
          {forecast ? <ForecastCard forecast={forecast} /> : null}
          {grade ? <GradeCard grade={grade} /> : null}
          {sheets.map((sheet) => (
            <PayrollCard key={sheet.id} sheet={sheet} />
          ))}
        </>
      )}
    </PeriodScreen>
  );
}

/**
 * Прогноз: сколько выходит за месяц, если считать по сегодняшний день.
 * Подпись прямо говорит, что это не утверждённая сумма — иначе
 * прогноз прочтут как обещание.
 */
export function ForecastCard({ forecast }: { forecast: PayrollForecast }) {
  const parts = [`оклад ${formatMinor(forecast.baseSalaryMinor)}`];
  if (forecast.bonusMinor > 0) parts.push(`бонусы +${formatMinor(forecast.bonusMinor)}`);
  if (forecast.penaltyMinor > 0) parts.push(`удержания −${formatMinor(forecast.penaltyMinor)}`);

  return (
    <>
      <HeroFigure
        label={`Прогноз на ${formatDate(forecast.asOf)}`}
        value={formatMinor(forecast.totalMinor)}
        caption={`${parts.join(' · ')}. Не утверждено — итог месяца может измениться.`}
        icon="insights"
      />
      <Gap size={3} />
    </>
  );
}

/**
 * Ранг и текущая неделя: сколько регистраций, по какой ставке они
 * сейчас идут и сколько осталось до плана — чтобы менеджер видел,
 * что даст ещё одна регистрация, до утверждения расчёта.
 */
export function GradeCard({ grade }: { grade: GradeProgress }) {
  const { tier, week, next } = grade;
  const period = `${formatDate(week.start)} — ${formatDate(week.end)}`;

  return (
    <>
      <SectionLabel trailing={<RowValue muted>оклад {formatMinor(tier.baseSalaryMinor)}</RowValue>}>
        Ранг {tier.name}
      </SectionLabel>
      <Panel>
        <div className="grade-week">
          <RingMeter
            ratio={week.count / tier.weekPlan}
            label="Неделя"
            caption={`${week.count} из ${tier.weekPlan} рег.`}
            complete={week.toPlan === 0}
          />
          <FigureRow>
            <Figure value={formatMinor(week.rateMinor)} label={`ставка · ${WEEK_BAND_LABELS[week.band]}`} />
            <Figure value={formatMinor(week.amountMinor)} label="бонус за неделю" />
          </FigureRow>
        </div>
        <PanelRow
          title={week.toPlan > 0 ? `До плана недели — ещё ${week.toPlan} рег.` : 'План недели выполнен'}
          subtitle={period}
        />
        {next ? (
          <PanelRow
            title={next.left > 0 ? `До ранга ${next.name} — ещё ${next.left} рег. в этом месяце` : `Ранг ${next.name} в следующем месяце`}
            subtitle={`В месяце ${grade.monthCount} из ${next.monthPlan}`}
          />
        ) : null}
      </Panel>
      <Gap size={3} />
    </>
  );
}

export function PayrollCard({ sheet }: { sheet: PayrollSheet }) {
  return (
    <>
      <HeroFigure
        label={STATUS_LABELS[sheet.status]}
        value={formatMinor(sheet.totalMinor)}
        caption={`к выплате за ${formatDate(sheet.periodStart)} — ${formatDate(sheet.periodEnd)}`}
        icon="account_balance_wallet"
      />
      <Gap size={3} />
      <SectionLabel>Из чего сложилось</SectionLabel>
      {/* Порядок «бонусы, оклад, удержания» — от валидатора палитры:
          зелёный рядом с красным при дейтеранопии неразличим, синий оклад
          их разделяет. Удержания ещё и заштрихованы — признак кроме цвета. */}
      <Panel>
        <StackedBar
          caption={`Оклад ${formatMinor(sheet.baseSalaryMinor)}, бонусы ${formatMinor(sheet.bonusMinor)}, удержания ${formatMinor(sheet.penaltyMinor)}`}
          segments={[
            { key: 'bonus', label: 'Бонусы', value: sheet.bonusMinor, color: chart.good, display: `+${formatMinor(sheet.bonusMinor)}` },
            { key: 'base', label: 'Оклад', value: sheet.baseSalaryMinor, color: chart.accent, display: formatMinor(sheet.baseSalaryMinor) },
            {
              key: 'penalty',
              label: 'Удержания',
              value: Math.abs(sheet.penaltyMinor),
              color: chart.bad,
              striped: true,
              display: formatMinor(-Math.abs(sheet.penaltyMinor)),
            },
          ]}
        />
      </Panel>
      {sheet.lines.length > 0 ? (
        <>
          <Gap size={3} />
          <SectionLabel>Подробно</SectionLabel>
          <Panel>
            {sheet.lines.map((line) => {
              // Удержания в расшифровке идут со знаком минус, как в выгрузке.
              const amount = line.kind.endsWith('PENALTY') ? -Math.abs(line.amountMinor) : line.amountMinor;
              return (
                <PanelRow
                  key={line.ruleId + line.kind}
                  title={line.title}
                  trailing={
                    <RowValue color={amount < 0 ? tone.danger : undefined} muted={amount === 0}>
                      {formatMinor(amount)}
                    </RowValue>
                  }
                />
              );
            })}
          </Panel>
        </>
      ) : null}
      <Gap size={3} />
    </>
  );
}
