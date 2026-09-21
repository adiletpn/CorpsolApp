import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Снимает требование JWT с эндпоинта (логин, обновление токена, экран терминала). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
