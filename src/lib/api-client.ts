export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
export const AUTH_EXPIRED_EVENT = 'i-veri:auth-expired';

export const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: string;
}

export interface ApiFailure {
  success: false;
  message: string;
}

export class ApiClientError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
  }
}

export const GENERIC_API_ERROR_MESSAGE = '서버 요청에 실패했습니다. 잠시 후 다시 시도해주세요.';

export const getApiErrorMessage = (error: unknown, fallback = GENERIC_API_ERROR_MESSAGE) => {
  if (error instanceof ApiClientError) {
    return error.status >= 400 && error.status < 500 ? error.message || fallback : fallback;
  }
  return fallback;
};

type ApiFetchOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | Record<string, unknown> | null;
  skipAuthRefresh?: boolean;
};

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<ApiSuccess<T>> {
  return request<T>(path, options, false);
}

async function request<T>(path: string, options: ApiFetchOptions, refreshed: boolean): Promise<ApiSuccess<T>> {
  const headers = new Headers(options.headers);
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  let body: BodyInit | null | undefined;
  if (isFormData || typeof options.body === 'string' || options.body == null) {
    body = options.body as BodyInit | null | undefined;
  } else {
    body = JSON.stringify(options.body);
  }

  if (!isFormData && body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const { skipAuthRefresh, ...requestOptions } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    headers,
    body,
    credentials: 'include',
  });

  const payload = await readJson<ApiSuccess<T> | ApiFailure>(response);
  if (response.status === 401 && !skipAuthRefresh && !refreshed && shouldRefresh(path)) {
    try {
      await apiFetch('/auth/refresh', { method: 'POST', skipAuthRefresh: true });
    } catch {
      notifyAuthExpired();
      throw new ApiClientError(401, '로그인이 만료되었습니다. 다시 로그인해 주세요.');
    }
    return request<T>(path, options, true);
  }

  if (!response.ok || !payload.success) {
    if (response.status === 401 && shouldRefresh(path)) {
      notifyAuthExpired();
    }
    throw new ApiClientError(response.status, payload.message || '요청에 실패했습니다.');
  }

  return payload;
}

function shouldRefresh(path: string) {
  return !path.startsWith('/auth/');
}

function notifyAuthExpired() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return { success: response.ok, data: null, message: '' } as T;
  }
  return JSON.parse(text) as T;
}
