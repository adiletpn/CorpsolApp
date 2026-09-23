import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { normalizeBssid } from '@corpsol/shared';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type { OfficeDoc } from '../firestore/types';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import type { CreateOfficeDto, UpdateOfficeDto } from './dto';

export interface OfficeView extends OfficeDoc {
  id: string;
}

const DEFAULT_MAX_ACCURACY_METERS = 100;

@Injectable()
export class OfficesService {
  constructor(private readonly firebase: FirebaseService) {}

  private get collection() {
    return this.firebase.firestore.collection(COLLECTIONS.offices);
  }

  /**
   * Приводит адреса точек доступа к единому виду при сохранении.
   * Нераспознанное значение отклоняем сразу: иначе опечатка тихо
   * заблокировала бы отметку всему офису, и причину искали бы долго.
   */
  private normalizeNetworks(values: string[] | undefined): string[] | undefined {
    if (values === undefined) return undefined;

    return values.map((value) => {
      const normalized = normalizeBssid(value);
      if (!normalized) {
        throw new BadRequestException(`Не похоже на MAC-адрес точки доступа: «${value}»`);
      }
      return normalized;
    });
  }

  async create(actor: AuthenticatedUser, dto: CreateOfficeDto): Promise<OfficeView> {
    const doc: OfficeDoc = {
      organizationId: actor.organizationId,
      name: dto.name,
      address: dto.address,
      lat: dto.lat,
      lng: dto.lng,
      radiusMeters: dto.radiusMeters,
      maxAccuracyMeters: dto.maxAccuracyMeters ?? DEFAULT_MAX_ACCURACY_METERS,
      wifiBssids: this.normalizeNetworks(dto.wifiBssids) ?? [],
    };

    const ref = await this.collection.add(doc);
    return { id: ref.id, ...doc };
  }

  async update(actor: AuthenticatedUser, officeId: string, dto: UpdateOfficeDto): Promise<OfficeView> {
    const current = await this.loadOwned(actor, officeId);

    const patch = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.address !== undefined ? { address: dto.address } : {}),
      ...(dto.lat !== undefined ? { lat: dto.lat } : {}),
      ...(dto.lng !== undefined ? { lng: dto.lng } : {}),
      ...(dto.radiusMeters !== undefined ? { radiusMeters: dto.radiusMeters } : {}),
      ...(dto.maxAccuracyMeters !== undefined
        ? { maxAccuracyMeters: dto.maxAccuracyMeters }
        : {}),
      ...(dto.wifiBssids !== undefined
        ? { wifiBssids: this.normalizeNetworks(dto.wifiBssids) }
        : {}),
    };

    await this.collection.doc(officeId).update(patch);
    return { id: officeId, ...current, ...patch };
  }

  async list(actor: AuthenticatedUser): Promise<OfficeView[]> {
    const snapshot = await this.collection
      .where('organizationId', '==', actor.organizationId)
      .get();

    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as OfficeDoc) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  async findOne(actor: AuthenticatedUser, officeId: string): Promise<OfficeView> {
    const doc = await this.loadOwned(actor, officeId);
    return { id: officeId, ...doc };
  }

  private async loadOwned(actor: AuthenticatedUser, officeId: string): Promise<OfficeDoc> {
    const snapshot = await this.collection.doc(officeId).get();
    const data = snapshot.data() as OfficeDoc | undefined;

    if (!snapshot.exists || data?.organizationId !== actor.organizationId) {
      throw new NotFoundException('Офис не найден');
    }
    return data;
  }
}
