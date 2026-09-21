import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Role } from '@corpsol/shared';

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
  departmentId: string | null;
  officeId: string | null;
  deviceId: string | null;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;
    return data ? user?.[data] : user;
  },
);
