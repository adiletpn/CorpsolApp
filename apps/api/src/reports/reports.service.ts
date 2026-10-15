import { Injectable } from '@nestjs/common';
import {
  ATTENDANCE_STATUS_LABELS,
  CHECK_METHOD_LABELS,
  buildCsv,
  csvMoney,
} from '@corpsol/shared';

import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { COLLECTIONS } from '../firestore/collections';
import { FirebaseService } from '../firebase/firebase.service';
import type { DepartmentDoc, OrganizationDoc, UserDoc } from '../firestore/types';
import { localParts } from '../common/utils/time';
import { AttendanceService } from '../attendance/attendance.service';
import { PayrollService } from '../payroll/payroll.service';

/**
 * Выгрузки для бухгалтерии.
 *
 * Табель и расчёт зарплаты живут в панели, но бухгалтеру нужен документ:
 * его прикладывают к ведомости, по нему сверяют начисления и хранят как
 * основание. Пересчитывать руками то, что система уже посчитала, —
 * самый верный способ получить расхождение.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly attendance: AttendanceService,
    private readonly payroll: PayrollService,
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  /**
   * Табель за период построчно.
   *
   * Колонка со способом отметки стоит не для красоты: по ней видно,
   * какие дни проставлены руками руководителя, а какие — сканом.
   */
  async attendanceCsv(
    actor: AuthenticatedUser,
    from: string,
    to: string,
    departmentId?: string,
  ): Promise<string> {
    const records = await this.attendance.listScoped(actor, from, to, departmentId);
    const [names, departments, timezone] = await Promise.all([
      this.employeeNames(actor.organizationId),
      this.departmentNames(actor.organizationId),
      this.timezoneOf(actor.organizationId),
    ]);

    const rows = records
      // Сервис отдаёт свежие сверху — для документа привычнее обратный
      // порядок: сверху начало периода.
      .slice()
      .reverse()
      .map((record) => [
        record.workDate,
        names.get(record.userId) ?? 'Сотрудник удалён',
        record.departmentId ? (departments.get(record.departmentId) ?? '') : '',
        ATTENDANCE_STATUS_LABELS[record.status] ?? record.status,
        this.localTime(record.checkInAt, timezone),
        this.localTime(record.checkOutAt, timezone),
        record.lateMinutes,
        CHECK_METHOD_LABELS[record.method] ?? record.method,
      ]);

    return buildCsv(
      [
        'Дата',
        'Сотрудник',
        'Отдел',
        'Статус',
        'Приход',
        'Уход',
        'Опоздание, мин',
        'Чем отмечено',
      ],
      rows,
    );
  }

  /**
   * Расчётные листы за период.
   *
   * Каждая сумма отдельной колонкой: бухгалтеру нужно видеть, из чего
   * сложилась выплата, а не только итог.
   */
  async payrollCsv(actor: AuthenticatedUser, periodStart: string): Promise<string> {
    const payrolls = await this.payroll.list(actor, periodStart);
    const [names, departments] = await Promise.all([
      this.employeeNames(actor.organizationId),
      this.departmentNames(actor.organizationId),
    ]);

    const rows = payrolls.map((item) => [
      names.get(item.userId) ?? 'Сотрудник удалён',
      item.departmentId ? (departments.get(item.departmentId) ?? '') : '',
      item.periodStart,
      item.periodEnd,
      csvMoney(item.baseSalaryMinor),
      csvMoney(item.bonusMinor),
      // Удержание показываем со знаком минус: в ведомости оно вычитается,
      // и колонка должна складываться сама.
      csvMoney(-Math.abs(item.penaltyMinor)),
      csvMoney(item.totalMinor),
      item.status,
    ]);

    return buildCsv(
      [
        'Сотрудник',
        'Отдел',
        'Период с',
        'Период по',
        'Оклад',
        'Бонусы',
        'Удержания',
        'К выплате',
        'Статус',
      ],
      rows,
    );
  }

  /** Имена сотрудников одним запросом: по одному на строку было бы дорого. */
  private async employeeNames(organizationId: string): Promise<Map<string, string>> {
    const snapshot = await this.db
      .collection(COLLECTIONS.users)
      .where('organizationId', '==', organizationId)
      .get();

    return new Map(
      snapshot.docs.map((doc) => [doc.id, (doc.data() as UserDoc).fullName]),
    );
  }

  private async departmentNames(organizationId: string): Promise<Map<string, string>> {
    const snapshot = await this.db
      .collection(COLLECTIONS.departments)
      .where('organizationId', '==', organizationId)
      .get();

    return new Map(
      snapshot.docs.map((doc) => [doc.id, (doc.data() as DepartmentDoc).name]),
    );
  }

  /** Часовой пояс организации: время в документе должно быть местным. */
  private async timezoneOf(organizationId: string): Promise<string> {
    const snapshot = await this.db
      .collection(COLLECTIONS.organizations)
      .doc(organizationId)
      .get();

    return (snapshot.data() as OrganizationDoc | undefined)?.timezone ?? 'Asia/Almaty';
  }

  /**
   * Время прихода в виде «ЧЧ:ММ» по месту работы.
   *
   * В документе секунды лишние, а UTC — прямая ошибка: бухгалтер сверяет
   * время с графиком, где стоит 09:00, и увидел бы там 04:00.
   */
  private localTime(iso: string | null, timezone: string): string {
    if (!iso) return '';

    const parts = localParts(new Date(iso), timezone);
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${pad(parts.hour)}:${pad(parts.minute)}`;
  }
}
