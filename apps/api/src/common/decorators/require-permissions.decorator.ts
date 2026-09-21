import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@corpsol/shared';

export const PERMISSIONS_KEY = 'requiredPermissions';

/** Эндпоинт доступен, если у роли есть хотя бы одно из перечисленных прав. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
