import { API_BASE_URL } from './api-client';

export type ChatbotEventType = 'session_id' | 'session_reset' | 'status' | 'intent' | 'token' | 'sources' | 'error';

export interface ChatbotStreamEvent {
  type: ChatbotEventType;
  value: unknown;
}

export interface StreamChatOptions {
  question: string;
  sessionId?: string | null;
  signal?: AbortSignal;
  onEvent: (event: ChatbotStreamEvent) => void;
}

const parseSsePayload = (line: string): ChatbotStreamEvent | null => {
  const trimmed = line.trim();
  if (!trimmed || trimmed === 'data: [DONE]' || trimmed === '[DONE]') return null;

  let payload = trimmed;
  while (payload.startsWith('data:')) {
    payload = payload.slice(5).trim();
  }
  if (!payload || payload === '[DONE]') return null;

  try {
    const parsed = JSON.parse(payload) as Partial<ChatbotStreamEvent>;
    if (!parsed.type) return null;
    return { type: parsed.type as ChatbotEventType, value: parsed.value };
  } catch {
    return null;
  }
};

async function refreshAuth() {
  await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
}

async function openChatStream(options: StreamChatOptions, refreshed: boolean): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: options.question,
      sessionId: options.sessionId || null,
    }),
    signal: options.signal,
  });

  if (response.status === 401 && !refreshed) {
    await refreshAuth();
    return openChatStream(options, true);
  }

  if (!response.ok || !response.body) {
    throw new Error('챗봇 응답을 가져오지 못했습니다.');
  }

  return response;
}

export async function streamChat(options: StreamChatOptions): Promise<void> {
  const response = await openChatStream(options, false);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split(/\r?\n/);
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        const event = parseSsePayload(chunk);
        if (event) options.onEvent(event);
      }
    }

    buffer += decoder.decode();
    const event = parseSsePayload(buffer);
    if (event) options.onEvent(event);
  } finally {
    reader.releaseLock();
  }
}
