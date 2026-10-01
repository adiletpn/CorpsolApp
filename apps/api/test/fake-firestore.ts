import type { FirebaseService } from '../src/firebase/firebase.service';

/**
 * Минимальный Firestore в памяти: ровно те операции, которыми пользуются
 * тестируемые сервисы. Нужен, чтобы проверять логику без эмулятора и сети —
 * поднимать эмулятор ради проверки подписи QR или сопоставления звонков
 * было бы несоразмерной ценой.
 */
type Document = Record<string, unknown>;

type Operator = '==' | '>=' | '<=' | '>' | '<';

interface Filter {
  field: string;
  op: Operator;
  value: unknown;
}

function matches(doc: Document, filter: Filter): boolean {
  const actual = doc[filter.field];

  switch (filter.op) {
    case '==':
      return actual === filter.value;
    case '>=':
      return (actual as never) >= (filter.value as never);
    case '<=':
      return (actual as never) <= (filter.value as never);
    case '>':
      return (actual as never) > (filter.value as never);
    case '<':
      return (actual as never) < (filter.value as never);
  }
}

class FakeDocRef {
  constructor(
    private readonly store: Map<string, Document>,
    readonly id: string,
    readonly collectionName: string,
  ) {}

  async get() {
    return snapshotOf(this.store, this.id);
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

function snapshotOf(store: Map<string, Document>, id: string) {
  const data = store.get(id);
  return {
    exists: data !== undefined,
    id,
    data: () => (data ? { ...data } : undefined),
  };
}

class FakeQuery {
  constructor(
    private readonly store: Map<string, Document>,
    private readonly collectionName: string,
    private readonly filters: Filter[] = [],
    private readonly limitValue: number | null = null,
  ) {}

  where(field: string, op: Operator, value: unknown): FakeQuery {
    return new FakeQuery(
      this.store,
      this.collectionName,
      [...this.filters, { field, op, value }],
      this.limitValue,
    );
  }

  /** Сортировка на результат выборки в тестах не влияет, поэтому сквозная. */
  orderBy(): FakeQuery {
    return this;
  }

  limit(value: number): FakeQuery {
    return new FakeQuery(this.store, this.collectionName, this.filters, value);
  }

  async get() {
    let entries = [...this.store.entries()].filter(([, doc]) =>
      this.filters.every((filter) => matches(doc, filter)),
    );

    if (this.limitValue !== null) entries = entries.slice(0, this.limitValue);

    const docs = entries.map(([id, doc]) => ({
      id,
      exists: true,
      data: () => ({ ...doc }),
    }));

    return { docs, empty: docs.length === 0, size: docs.length };
  }

  count() {
    return {
      get: async () => {
        const { size } = await this.get();
        return { data: () => ({ count: size }) };
      },
    };
  }
}

class FakeCollection extends FakeQuery {
  constructor(
    private readonly documents: Map<string, Document>,
    private readonly name: string,
  ) {
    super(documents, name);
  }

  doc(id?: string): FakeDocRef {
    const key = id ?? `auto-${this.documents.size + 1}-${Math.random().toString(36).slice(2, 8)}`;
    return new FakeDocRef(this.documents, key, this.name);
  }

  async add(value: Document): Promise<FakeDocRef> {
    const ref = this.doc();
    await ref.set(value);
    return ref;
  }
}

interface BatchOperation {
  kind: 'set' | 'update' | 'create';
  ref: FakeDocRef;
  value: Document;
}

class FakeBatch {
  private readonly operations: BatchOperation[] = [];

  set(ref: FakeDocRef, value: Document): void {
    this.operations.push({ kind: 'set', ref, value });
  }

  update(ref: FakeDocRef, value: Document): void {
    this.operations.push({ kind: 'update', ref, value });
  }

  create(ref: FakeDocRef, value: Document): void {
    this.operations.push({ kind: 'create', ref, value });
  }

  async commit(): Promise<void> {
    for (const operation of this.operations) {
      if (operation.kind === 'set') await operation.ref.set(operation.value);
      if (operation.kind === 'update') await operation.ref.update(operation.value);
      if (operation.kind === 'create') await operation.ref.create(operation.value);
    }
  }
}

export class FakeFirestore {
  private readonly collections = new Map<string, Map<string, Document>>();

  private store(name: string): Map<string, Document> {
    let store = this.collections.get(name);
    if (!store) {
      store = new Map();
      this.collections.set(name, store);
    }
    return store;
  }

  collection(name: string): FakeCollection {
    return new FakeCollection(this.store(name), name);
  }

  batch(): FakeBatch {
    return new FakeBatch();
  }

  async getAll(...refs: FakeDocRef[]) {
    return Promise.all(refs.map((ref) => ref.get()));
  }

  /** Транзакции в тестах выполняются последовательно, без изоляции. */
  async runTransaction<T>(
    handler: (tx: {
      get: (ref: FakeDocRef) => Promise<ReturnType<typeof snapshotOf>>;
      set: (ref: FakeDocRef, value: Document) => void;
      update: (ref: FakeDocRef, value: Document) => void;
    }) => Promise<T>,
  ): Promise<T> {
    return handler({
      get: (ref) => ref.get(),
      set: (ref, value) => void ref.set(value),
      update: (ref, value) => void ref.update(value),
    });
  }

  /** Прямой доступ к содержимому — для подготовки данных и проверок в тестах. */
  seed(collection: string, id: string, value: Document): void {
    this.store(collection).set(id, { ...value });
  }

  read(collection: string, id: string): Document | undefined {
    return this.collections.get(collection)?.get(id);
  }

  all(collection: string): Document[] {
    return [...(this.collections.get(collection)?.values() ?? [])];
  }
}

interface AuthRecord {
  uid: string;
  email: string;
  displayName?: string;
  disabled: boolean;
  claims: Record<string, unknown>;
  tokensRevokedAt: number | null;
}

/**
 * Firebase Auth в памяти. Заведение сотрудника затрагивает два хранилища
 * сразу — учётку и карточку, — и проверять надо именно их согласованность:
 * что при сбое записи карточки не остаётся учётка, по которой можно войти.
 */
export class FakeAuth {
  private readonly users = new Map<string, AuthRecord>();
  private counter = 0;

  /** Admin SDK позволяет задать uid явно — этим пользуются тесты. */
  async createUser(input: {
    uid?: string;
    email: string;
    password: string;
    displayName?: string;
  }): Promise<{ uid: string }> {
    this.counter += 1;
    const uid = input.uid ?? `uid-${this.counter}`;
    this.users.set(uid, {
      uid,
      email: input.email,
      displayName: input.displayName,
      disabled: false,
      claims: {},
      tokensRevokedAt: null,
    });
    return { uid };
  }

  /** Настоящий Admin SDK бросает ошибку, когда адрес свободен. */
  async getUserByEmail(email: string): Promise<AuthRecord> {
    const found = [...this.users.values()].find((user) => user.email === email);
    if (!found) throw new Error('auth/user-not-found');
    return found;
  }

  async setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void> {
    const user = this.require(uid);
    user.claims = { ...claims };
  }

  async updateUser(uid: string, patch: Partial<AuthRecord>): Promise<void> {
    Object.assign(this.require(uid), patch);
  }

  async revokeRefreshTokens(uid: string): Promise<void> {
    this.require(uid).tokensRevokedAt = Date.now();
  }

  async deleteUser(uid: string): Promise<void> {
    this.users.delete(uid);
  }

  /** Прямой доступ для проверок в тестах. */
  record(uid: string): AuthRecord | undefined {
    return this.users.get(uid);
  }

  get size(): number {
    return this.users.size;
  }

  private require(uid: string): AuthRecord {
    const user = this.users.get(uid);
    if (!user) throw new Error(`auth/user-not-found: ${uid}`);
    return user;
  }
}

/** Оборачивает поддельный Firestore в тот же интерфейс, что ждут сервисы. */
export function fakeFirebase(firestore: FakeFirestore, auth?: FakeAuth): FirebaseService {
  return { firestore, auth } as unknown as FirebaseService;
}
