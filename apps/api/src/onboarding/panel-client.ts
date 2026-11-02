/**
 * Клиент API панели для скриптов: те же запросы, что делает браузер
 * администратора. Через API, а не напрямую в базу — тогда работают все
 * проверки, пароли выдаются по общему правилу, а действия пишутся в журнал.
 */

type Fetch = typeof fetch;

export interface DepartmentRow {
  id: string;
  name: string;
  head: { id: string; fullName: string } | null;
}

export interface OfficeRow {
  id: string;
  name: string;
}

export interface EmployeeRow {
  id: string;
  email: string;
  fullName: string;
  role: string;
  departmentId: string | null;
}

export interface WorkNumberRow {
  userId: string;
  provider: string;
  workNumber: string;
}

export interface SyncResult {
  fetched: number;
  imported: number;
  withoutEmployee: number;
  unmatched: Array<{ employeeKey: string; count: number }>;
}

export class PanelApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Вход администратора по паролю — тем же способом, что и форма панели. */
export async function signIn(apiKey: string, email: string, password: string, fetchImpl: Fetch = fetch): Promise<string> {
  const response = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = (await response.json()) as { idToken?: string; error?: { message?: string } };
  if (!body.idToken) throw new PanelApiError(response.status, `Вход не удался: ${body.error?.message ?? response.status}`);
  return body.idToken;
}

export class PanelClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, '')}${path}`, {
      method: init.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await response.text();
    const json = text ? (JSON.parse(text) as unknown) : null;
    if (!response.ok) {
      const message = (json as { message?: unknown } | null)?.message;
      throw new PanelApiError(response.status, `${init.method ?? 'GET'} ${path}: ${typeof message === 'string' ? message : response.status}`);
    }
    return json as T;
  }

  departments = () => this.request<DepartmentRow[]>('/departments');
  createDepartment = (name: string) => this.request<DepartmentRow>('/departments', { method: 'POST', body: { name } });
  setDepartmentHead = (id: string, headId: string) =>
    this.request<DepartmentRow>(`/departments/${id}`, { method: 'PATCH', body: { headId } });

  offices = () => this.request<OfficeRow[]>('/offices');

  employees = () => this.request<EmployeeRow[]>('/employees');
  createEmployee = (body: { email: string; fullName: string; role: string; departmentId: string; officeId: string | null }) =>
    this.request<EmployeeRow & { temporaryPassword?: string }>('/employees', {
      method: 'POST',
      body: { ...body, officeId: body.officeId ?? undefined },
    });

  workNumbers = () => this.request<WorkNumberRow[]>('/calls/work-numbers');
  linkWorkNumber = (userId: string, workNumber: string, provider: 'KCELL_USER' | 'SIPUNI') =>
    this.request<WorkNumberRow>('/calls/work-numbers', { method: 'POST', body: { userId, workNumber, provider } });

  sync = (pbx: 'kcell' | 'sipuni', since: Date) =>
    this.request<SyncResult>(`/calls/integrations/${pbx}/sync`, { method: 'POST', body: { since: since.toISOString() } });
}
