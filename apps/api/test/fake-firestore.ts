import type { FirebaseService } from '../src/firebase/firebase.service';

/**
 * Минимальный Firestore в памяти: ровно те операции, которыми пользуются
 * тестируемые сервисы. Нужен, чтобы проверять логику без эмулятора и сети —
 * подъём эмулятора ради проверки подписи QR был бы несоразмерной ценой.
 */
type Document = Record<string, unknown>;

class FakeDocRef {
  constructor(
    private readonly store: Map<string, Document>,
    readonly id: string,
  ) {}

  async get() {
    const data = this.store.get(this.id);
    return {
      exists: data !== undefined,
      id: this.id,
      data: () => (data ? { ...data } : undefined),
    };
  }

  async set(value: Document) {
    this.store.set(this.id, { ...value });
  }

  async update(patch: Document) {
    const current = this.store.get(this.id);
    if (!current) throw new Error(`Документ ${this.id} не найден`);
    this.store.set(this.id, { ...current, ...patch });
  }

  /** Падает, если документ уже существует — так Firestore защищает ключ. */
  async create(value: Document) {
    if (this.store.has(this.id)) {
      throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
    }
    this.store.set(this.id, { ...value });
  }
}

export class FakeFirestore {
  private readonly collections = new Map<string, Map<string, Document>>();

  collection(name: string) {
    let store = this.collections.get(name);
    if (!store) {
      store = new Map();
      this.collections.set(name, store);
    }
    const resolved = store;

    return {
      doc: (id: string) => new FakeDocRef(resolved, id),
    };
  }

  /** Прямой доступ к содержимому — для подготовки данных и проверок в тестах. */
  seed(collection: string, id: string, value: Document): void {
    this.collection(collection);
    this.collections.get(collection)!.set(id, { ...value });
  }

  read(collection: string, id: string): Document | undefined {
    return this.collections.get(collection)?.get(id);
  }
}

/** Оборачивает поддельный Firestore в тот же интерфейс, что ждут сервисы. */
export function fakeFirebase(firestore: FakeFirestore): FirebaseService {
  return { firestore } as unknown as FirebaseService;
}
