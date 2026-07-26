/**
 * Thin fetch wrapper around the backend API.
 *
 * The dashboard used to swallow non-ok responses (so a rejected tag looked like a
 * success) and fall back to hard-coded demo data on failure. Every call now either
 * returns parsed data or throws an ApiError carrying the server's own message.
 */

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }

  get isUnauthorized() {
    return this.status === 401
  }
}

async function readError(response: Response): Promise<string> {
  const fallback = `Request failed (${response.status})`
  try {
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const body = await response.json()
      return body?.error || body?.message || fallback
    }
    const text = await response.text()
    return text.trim().slice(0, 200) || fallback
  } catch {
    return fallback
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
  })

  if (!response.ok) {
    throw new ApiError(response.status, await readError(response))
  }

  return response
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await request(path)
  return response.json() as Promise<T>
}

export async function apiGetText(path: string): Promise<string> {
  const response = await request(path)
  return response.text()
}

export async function apiSend<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await request(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

  if (response.status === 204) return undefined as T
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) return undefined as T
  return response.json() as Promise<T>
}

export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return fallback
}
