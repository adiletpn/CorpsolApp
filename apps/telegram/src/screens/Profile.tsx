import { ROLE_LABELS } from '@corpsol/shared';
import React, { useState } from 'react';

import { api, type Achievement } from '../api';
import { formatDate, initialsOf } from '../format';
import { useSession } from '../session';
import {
  ACCENTS,
  ACCENT_LABELS,
  ACCENT_SWATCHES,
  THEMES,
  THEME_LABELS,
  savedAppearance,
  saveAppearance,
  type Appearance,
} from '../theme';
import { tap } from '../telegram';
import {
  Figure,
  FigureRow,
  Gap,
  Icon,
  Panel,
  PanelRow,
  RowValue,
  SectionLabel,
  Spinner,
  tone,
} from '../ui';
import { useLoad } from '../useLoad';

/** Профиль: кто я, мои награды, оформление и выход. */
export function Profile() {
  const { user, signOut } = useSession();
  const achievements = useLoad(api.achievements, 'achievements');

  if (!user) return null;

  return (
    <>
      <div className="profile-card">
        <div className="profile-avatar">{initialsOf(user.fullName)}</div>
        <div className="profile-name">{user.fullName}</div>
        <p className="header-subtitle">
          {ROLE_LABELS[user.role]} · {user.email}
        </p>
      </div>

      <Gap size={3} />
      <Awards items={achievements.data} loading={achievements.loading} />

      <Gap size={3} />
      <AppearancePicker />

      <Gap size={3} />
      <SectionLabel>Аккаунт</SectionLabel>
      <Panel>
        <button className="panel-button" onClick={signOut}>
          <PanelRow title={<span className="tone-danger-text">Выйти</span>} trailing={<Icon name="logout" style={{ color: tone.danger }} />} />
        </button>
      </Panel>
    </>
  );
}

function Awards({ items, loading }: { items: Achievement[] | null; loading: boolean }) {
  if (!items) return loading ? <Spinner /> : null;

  const unlocked = items.filter((item) => item.unlockedAt);
  const goals = items.filter((item) => !item.unlockedAt);
  const points = unlocked.reduce((sum, item) => sum + item.points, 0);

  return (
    <>
      <SectionLabel>Награды</SectionLabel>
      <FigureRow>
        <Figure value={`${unlocked.length} из ${items.length}`} label="получено" />
        <Figure value={String(points)} label="баллов за награды" color={points > 0 ? tone.warning : undefined} />
      </FigureRow>
      <Gap size={1} />
      <Panel>
        {/* Полученные — золотом и первыми, цели спокойно ниже:
            иначе список целей читается как список провалов. */}
        {[...unlocked, ...goals].map((item) => (
          <PanelRow
            key={item.code}
            title={item.title}
            subtitle={item.unlockedAt ? `Получено ${formatDate(item.unlockedAt)}` : item.description}
            accent={item.unlockedAt ? tone.warning : undefined}
            trailing={
              <RowValue color={item.unlockedAt ? tone.warning : undefined} muted={!item.unlockedAt}>
                +{item.points}
              </RowValue>
            }
          />
        ))}
      </Panel>
    </>
  );
}

/** Тема и акцент — как в настройках Mind AI. Выбор действует сразу. */
function AppearancePicker() {
  const [appearance, setAppearance] = useState<Appearance>(savedAppearance);

  function update(next: Appearance) {
    tap();
    setAppearance(next);
    saveAppearance(next);
  }

  return (
    <>
      <SectionLabel>Тема</SectionLabel>
      <Panel>
        <div className="theme-cards">
          {THEMES.map((theme) => (
            <button
              key={theme}
              className={`theme-card ${appearance.theme === theme ? 'is-active' : ''}`}
              onClick={() => update({ ...appearance, theme })}
            >
              <div className={`theme-preview is-${theme}`} />
              {THEME_LABELS[theme]}
            </button>
          ))}
        </div>
      </Panel>

      <Gap size={2} />
      <SectionLabel trailing={<span>{ACCENT_LABELS[appearance.accent]}</span>}>Акцентный цвет</SectionLabel>
      <Panel>
        <div className="accents">
          {ACCENTS.map((accent) => (
            <button
              key={accent}
              className={`accent-dot ${appearance.accent === accent ? 'is-active' : ''}`}
              style={{ background: ACCENT_SWATCHES[accent] }}
              aria-label={ACCENT_LABELS[accent]}
              title={ACCENT_LABELS[accent]}
              onClick={() => update({ ...appearance, accent })}
            />
          ))}
        </div>
      </Panel>
    </>
  );
}
