import { HealthController } from '../src/health/health.controller';

describe('проверка живости', () => {
  it('отвечает без токена и сообщает только статус', () => {
    const body = new HealthController().check();

    expect(body.status).toBe('ok');
    // Наружу не должно уходить ничего про окружение и версии.
    expect(Object.keys(body).sort()).toEqual(['status', 'uptimeSeconds']);
  });

  it('время работы не отрицательное', () => {
    expect(new HealthController().check().uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
