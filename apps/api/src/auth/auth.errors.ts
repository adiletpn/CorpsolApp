/** Коды отказа при входе. Клиент по коду решает, что показать сотруднику. */
export const AUTH_ERRORS = {
  EMPLOYEE_INACTIVE: 'employee_inactive',
  DEVICE_REQUIRED: 'device_required',
  DEVICE_MISMATCH: 'device_mismatch',
  DEVICE_TAKEN: 'device_taken',
  TELEGRAM_INVALID: 'telegram_invalid',
  TELEGRAM_NOT_CONFIGURED: 'telegram_not_configured',
} as const;

export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  [AUTH_ERRORS.EMPLOYEE_INACTIVE]: 'Учётная запись неактивна. Обратитесь к HR.',
  [AUTH_ERRORS.DEVICE_REQUIRED]: 'Вход возможен только из мобильного приложения.',
  [AUTH_ERRORS.DEVICE_MISMATCH]:
    'Аккаунт привязан к другому устройству. Заявка на перепривязку отправлена HR.',
  [AUTH_ERRORS.DEVICE_TAKEN]: 'Это устройство уже закреплено за другим сотрудником.',
  [AUTH_ERRORS.TELEGRAM_INVALID]: 'Не удалось подтвердить аккаунт Telegram. Откройте приложение заново.',
  [AUTH_ERRORS.TELEGRAM_NOT_CONFIGURED]: 'Вход через Telegram ещё не настроен на сервере.',
};
