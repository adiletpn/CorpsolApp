import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  QR_ACCEPTED_DRIFT_WINDOWS,
  QR_PAYLOAD_VERSION,
  QR_PERIOD_SECONDS,
  currentQrCounter,
  encodeQrPayload,
  type QrPayload,
} from '@corpsol/shared';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type { TerminalDoc } from '../firestore/types';

const SIGNATURE_LENGTH = 16;

@Injectable()
export class TerminalService {
  constructor(private readonly firebase: FirebaseService) {}

  private get collection() {
    return this.firebase.firestore.collection(COLLECTIONS.terminals);
  }

  static generateSecret(): string {
    return randomBytes(32).toString('base64url');
  }

  private static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async load(terminalId: string): Promise<TerminalDoc | null> {
    const snapshot = await this.collection.doc(terminalId).get();
    return snapshot.exists ? (snapshot.data() as TerminalDoc) : null;
  }

  /**
   * Подпись кода: HMAC(secret, terminalId.counter). Секрет никогда не покидает
   * сервер, поэтому валидный код нельзя сгенерировать заранее или вне офиса.
   */
  private sign(secret: string, terminalId: string, counter: number): string {
    return createHmac('sha256', secret)
      .update(`${terminalId}.${counter}`)
      .digest('base64url')
      .slice(0, SIGNATURE_LENGTH);
  }

  /** Текущий QR для экрана терминала. Экран перезапрашивает его каждые 30 секунд. */
  async issueCode(terminalId: string): Promise<{
    payload: string;
    counter: number;
    expiresInMs: number;
  }> {
    const terminal = await this.load(terminalId);
    if (!terminal || !terminal.isActive) {
      throw new NotFoundException('Терминал не найден или отключён');
    }

    const now = Date.now();
    const counter = currentQrCounter(now);
    const payload: QrPayload = {
      v: QR_PAYLOAD_VERSION,
      t: terminalId,
      c: counter,
      s: this.sign(terminal.secret, terminalId, counter),
    };

    const periodMs = QR_PERIOD_SECONDS * 1000;
    return {
      payload: encodeQrPayload(payload),
      counter,
      expiresInMs: periodMs - (now % periodMs),
    };
  }

  /**
   * Проверка отсканированного кода. Принимаем соседние окна — расхождение
   * часов телефона и сервера на десяток секунд не должно ломать отметку.
   */
  async verify(
    payload: QrPayload,
    nowMs: number = Date.now(),
  ): Promise<{ valid: boolean; expired: boolean; terminalId: string }> {
    const terminal = await this.load(payload.t);
    if (!terminal || !terminal.isActive) {
      return { valid: false, expired: false, terminalId: payload.t };
    }

    const current = currentQrCounter(nowMs);
    if (Math.abs(current - payload.c) > QR_ACCEPTED_DRIFT_WINDOWS) {
      return { valid: false, expired: true, terminalId: payload.t };
    }

    const expected = this.sign(terminal.secret, payload.t, payload.c);
    return {
      valid: this.equals(expected, payload.s),
      expired: false,
      terminalId: payload.t,
    };
  }

  /**
   * Выпускает токен экрана терминала. Возвращается один раз в открытом виде —
   * дальше в базе остаётся только хеш, восстановить токен оттуда нельзя.
   * Повторный вызов обесценивает предыдущий токен.
   */
  async issueAccessToken(terminalId: string): Promise<{ token: string; issuedAt: Date }> {
    const terminal = await this.load(terminalId);
    if (!terminal) throw new NotFoundException('Терминал не найден');

    const token = randomBytes(32).toString('base64url');
    const issuedAt = new Date();

    await this.collection.doc(terminalId).update({
      accessTokenHash: TerminalService.hashToken(token),
      tokenIssuedAt: Timestamp.fromDate(issuedAt),
    });

    return { token, issuedAt };
  }

  /**
   * Проверяет токен экрана. Даёт доступ ровно к одному терминалу, поэтому
   * монитор у входа не нужно держать залогиненным под учёткой администратора.
   */
  async resolveByAccessToken(terminalId: string, token: string): Promise<string> {
    const terminal = await this.load(terminalId);

    if (!terminal || !terminal.isActive || !terminal.accessTokenHash) {
      throw new UnauthorizedException('Терминал не найден или токен отозван');
    }
    if (!this.equals(terminal.accessTokenHash, TerminalService.hashToken(token))) {
      throw new UnauthorizedException('Неверный токен терминала');
    }

    return terminalId;
  }

  private equals(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  }
}
