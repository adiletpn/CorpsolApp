import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  QR_ACCEPTED_DRIFT_WINDOWS,
  QR_PAYLOAD_VERSION,
  QR_PERIOD_SECONDS,
  currentQrCounter,
  encodeQrPayload,
  type QrPayload,
} from '@corpsol/shared';

import { PrismaService } from '../prisma/prisma.service';

const SIGNATURE_LENGTH = 16;

@Injectable()
export class TerminalService {
  constructor(private readonly prisma: PrismaService) {}

  static generateSecret(): string {
    return randomBytes(32).toString('base64url');
  }

  private static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Выпускает токен экрана терминала. Возвращается один раз в открытом виде —
   * дальше в базе остаётся только хеш, восстановить токен оттуда нельзя.
   * Повторный вызов обесценивает предыдущий токен.
   */
  async issueAccessToken(terminalId: string): Promise<{ token: string; issuedAt: Date }> {
    const terminal = await this.prisma.terminal.findUnique({ where: { id: terminalId } });
    if (!terminal) throw new NotFoundException('Терминал не найден');

    const token = randomBytes(32).toString('base64url');
    const issuedAt = new Date();

    await this.prisma.terminal.update({
      where: { id: terminalId },
      data: { accessTokenHash: TerminalService.hashToken(token), tokenIssuedAt: issuedAt },
    });

    return { token, issuedAt };
  }

  /**
   * Проверяет токен экрана. Права даёт ровно на один терминал, поэтому
   * монитор у входа не нужно держать залогиненным под учёткой администратора.
   */
  async resolveByAccessToken(terminalId: string, token: string): Promise<string> {
    const terminal = await this.prisma.terminal.findUnique({ where: { id: terminalId } });

    if (!terminal || !terminal.isActive || !terminal.accessTokenHash) {
      throw new UnauthorizedException('Терминал не найден или токен отозван');
    }
    if (!this.equals(terminal.accessTokenHash, TerminalService.hashToken(token))) {
      throw new UnauthorizedException('Неверный токен терминала');
    }

    return terminal.id;
  }

  /**
   * Подпись кода: HMAC(secret, terminalId.counter). Секрет никогда не покидает сервер,
   * поэтому валидный код нельзя сгенерировать заранее или вне офиса.
   */
  private sign(secret: string, terminalId: string, counter: number): string {
    return createHmac('sha256', secret)
      .update(`${terminalId}.${counter}`)
      .digest('base64url')
      .slice(0, SIGNATURE_LENGTH);
  }

  /** Текущий QR для экрана терминала. Клиент терминала перезапрашивает его каждые 30 секунд. */
  async issueCode(terminalId: string): Promise<{
    payload: string;
    counter: number;
    expiresInMs: number;
  }> {
    const terminal = await this.prisma.terminal.findUnique({ where: { id: terminalId } });
    if (!terminal || !terminal.isActive) {
      throw new NotFoundException('Терминал не найден или отключён');
    }

    const now = Date.now();
    const counter = currentQrCounter(now);
    const payload: QrPayload = {
      v: QR_PAYLOAD_VERSION,
      t: terminal.id,
      c: counter,
      s: this.sign(terminal.secret, terminal.id, counter),
    };

    const periodMs = QR_PERIOD_SECONDS * 1000;
    return {
      payload: encodeQrPayload(payload),
      counter,
      expiresInMs: periodMs - (now % periodMs),
    };
  }

  /**
   * Проверка отсканированного кода. Принимаем соседние окна — расхождение часов
   * телефона и сервера на десяток секунд не должно ломать отметку.
   */
  async verify(
    payload: QrPayload,
    nowMs: number = Date.now(),
  ): Promise<{ valid: boolean; expired: boolean; terminalId: string }> {
    const terminal = await this.prisma.terminal.findUnique({ where: { id: payload.t } });
    if (!terminal || !terminal.isActive) {
      return { valid: false, expired: false, terminalId: payload.t };
    }

    const current = currentQrCounter(nowMs);
    if (Math.abs(current - payload.c) > QR_ACCEPTED_DRIFT_WINDOWS) {
      return { valid: false, expired: true, terminalId: payload.t };
    }

    const expected = this.sign(terminal.secret, terminal.id, payload.c);
    return {
      valid: this.equals(expected, payload.s),
      expired: false,
      terminalId: terminal.id,
    };
  }

  private equals(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  }
}
