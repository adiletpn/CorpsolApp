import React from 'react';

import { EmptyState, ErrorRetry, Gap, ScreenHeader, Spinner } from './ui';
import { useLoad } from './useLoad';

/**
 * Экран за период: заголовок, загрузка, пусто или ошибка с повтором.
 * Как PeriodScreen во Flutter — пять экранов устроены одинаково.
 */
export function PeriodScreen<T>({
  title,
  subtitle,
  load,
  isEmpty,
  emptyMessage,
  emptyIcon,
  children,
}: {
  title: string;
  subtitle?: string;
  load: () => Promise<T>;
  isEmpty?: (data: T) => boolean;
  emptyMessage: string;
  emptyIcon?: string;
  children: (data: T) => React.ReactNode;
}) {
  const { data, loading, error, reload } = useLoad(load);
  const hasData = data !== null && !(isEmpty?.(data) ?? false);

  return (
    <>
      <ScreenHeader title={title} subtitle={subtitle} />
      <Gap size={2} />
      {hasData ? (
        children(data)
      ) : loading ? (
        <Spinner />
      ) : error ? (
        <ErrorRetry message="Не удалось загрузить данные" onRetry={reload} />
      ) : (
        <EmptyState message={emptyMessage} icon={emptyIcon} />
      )}
    </>
  );
}
