/** Коды отказа при входе. Клиент по коду решает, что показать пользователю. */
export const AUTH_ERRORS = {
  INVALID_CREDENTIALS: 'invalid_credentials',
  EMPLOYEE_INACTIVE: 'employee_inactive',
  DEVICE_REQUIRED: 'device_required',
  DEVICE_MISMATCH: 'device_mismatch',
  DEVICE_TAKEN: 'device_taken',
  REFRESH_INVALID: 'refresh_invalid',
} as const;

export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  [AUTH_ERRORS.INVALID_CREDENTIALS]: 'Неверный email или пароль.',
  [AUTH_ERRORS.EMPLOYEE_INACTIVE]: 'Учётная запись неактивна. Обратитесь к HR.',
  [AUTH_ERRORS.DEVICE_REQUIRED]: 'Вход возможен только из мобильного приложения.',
  [AUTH_ERRORS.DEVICE_MISMATCH]:
    'Аккаунт привязан к другому устройству. Заявка на перепривязку отправлена HR.',
  [AUTH_ERRORS.DEVICE_TAKEN]: 'Это устройство уже закреплено за другим сотрудником.',
  [AUTH_ERRORS.REFRESH_INVALID]: 'Сессия истекла, войдите заново.',
};
