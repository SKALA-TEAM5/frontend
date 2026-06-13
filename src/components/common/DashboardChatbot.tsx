'use client';

import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { streamChat, type ChatbotStreamEvent } from '../../lib/chatbot-api';
import { C } from '../../lib/theme';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  intent?: string;
  sources?: string[];
};

const assistantGreeting = '안녕하세요.\n안전관리비 정산, 증빙, 보완 사유와 관련해 궁금한 내용을 질문해 주세요.';
const mascotSrc = '/assets/chatbot-mascot.png';
const floatingPositionStorageKey = 'dashboard-chatbot-position';
const floatingButtonSize = 60;
const floatingMargin = 16;
const panelGap = 12;
const panelMaxWidth = 450;
const panelMaxHeight = 620;
const panelMinHeight = 500;
const defaultViewportSize = { width: 1280, height: 800 } as const;

type FloatingPosition = {
  left: number;
  top: number;
};

type FloatingEdge = 'left' | 'right' | 'top' | 'bottom';

type StoredFloatingPosition = {
  horizontalAnchor: Extract<FloatingEdge, 'left' | 'right'>;
  horizontalOffset: number;
  verticalAnchor: Extract<FloatingEdge, 'top' | 'bottom'>;
  verticalOffset: number;
};

type ViewportSize = {
  width: number;
  height: number;
};

type DragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
  startLeft: number;
  startTop: number;
  moved: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getViewportSize = (): ViewportSize => {
  if (typeof window === 'undefined') return defaultViewportSize;
  return { width: window.innerWidth, height: window.innerHeight };
};

const clampFloatingPosition = (position: FloatingPosition, viewport: ViewportSize): FloatingPosition => ({
  left: clamp(position.left, floatingMargin, Math.max(floatingMargin, viewport.width - floatingButtonSize - floatingMargin)),
  top: clamp(position.top, floatingMargin, Math.max(floatingMargin, viewport.height - floatingButtonSize - floatingMargin)),
});

const getDefaultFloatingPosition = (viewport: ViewportSize): FloatingPosition => clampFloatingPosition({
  left: viewport.width - floatingButtonSize - 32,
  top: viewport.height - floatingButtonSize - 28,
}, viewport);

const positionToStoredFloatingPosition = (
  position: FloatingPosition,
  viewport: ViewportSize,
): StoredFloatingPosition => {
  const clampedPosition = clampFloatingPosition(position, viewport);
  const right = viewport.width - clampedPosition.left - floatingButtonSize;
  const bottom = viewport.height - clampedPosition.top - floatingButtonSize;
  const horizontalAnchor = clampedPosition.left <= right ? 'left' : 'right';
  const verticalAnchor = clampedPosition.top <= bottom ? 'top' : 'bottom';

  return {
    horizontalAnchor,
    horizontalOffset: horizontalAnchor === 'left' ? clampedPosition.left : right,
    verticalAnchor,
    verticalOffset: verticalAnchor === 'top' ? clampedPosition.top : bottom,
  };
};

const storedFloatingPositionToPosition = (
  storedPosition: StoredFloatingPosition,
  viewport: ViewportSize,
): FloatingPosition => clampFloatingPosition({
  left: storedPosition.horizontalAnchor === 'right'
    ? viewport.width - floatingButtonSize - storedPosition.horizontalOffset
    : storedPosition.horizontalOffset,
  top: storedPosition.verticalAnchor === 'bottom'
    ? viewport.height - floatingButtonSize - storedPosition.verticalOffset
    : storedPosition.verticalOffset,
}, viewport);

const isStoredFloatingPosition = (value: Partial<StoredFloatingPosition>): value is StoredFloatingPosition => (
  (value.horizontalAnchor === 'left' || value.horizontalAnchor === 'right')
  && typeof value.horizontalOffset === 'number'
  && (value.verticalAnchor === 'top' || value.verticalAnchor === 'bottom')
  && typeof value.verticalOffset === 'number'
);

const readStoredFloatingPosition = (viewport: ViewportSize): FloatingPosition => {
  if (typeof window === 'undefined') return getDefaultFloatingPosition(viewport);
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(floatingPositionStorageKey) || '') as Partial<FloatingPosition & StoredFloatingPosition>;
    if (isStoredFloatingPosition(parsed)) {
      return storedFloatingPositionToPosition(parsed, viewport);
    }
    if (typeof parsed.left === 'number' && typeof parsed.top === 'number') {
      return getDefaultFloatingPosition(viewport);
    }
  } catch {
    // Ignore invalid persisted coordinates and fall back to the default corner.
  }
  return getDefaultFloatingPosition(viewport);
};

const iconStyle = {
  width: 32,
  height: 32,
  borderRadius: 999,
  background: 'transparent',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  overflow: 'visible',
} as const;

const ChatLogo = ({ size = 24 }: { size?: number }) => (
  <span style={{ ...iconStyle, width: size, height: size }} aria-hidden="true">
    <img
      src={mascotSrc}
      alt=""
      draggable={false}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        display: 'block',
      }}
    />
  </span>
);

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const PlusBubbleIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 11.5a7.5 7.5 0 0 1-10.76 6.75L4 20l1.75-5.24A7.5 7.5 0 1 1 20 11.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 8v7M8.5 11.5h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const SendIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CopyIcon = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 9h10v12H9V9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M5 15H4V4h11v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const todayLabel = () => new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());

export default function DashboardChatbot() {
  const [open, setOpen] = useState(false);
  const [viewport, setViewport] = useState<ViewportSize>(defaultViewportSize);
  const [buttonPosition, setButtonPosition] = useState<FloatingPosition>(() => getDefaultFloatingPosition(defaultViewportSize));
  const [positionInitialized, setPositionInitialized] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: 'greeting', role: 'assistant', text: assistantGreeting },
  ]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const storedPositionRef = useRef<StoredFloatingPosition | null>(null);

  const dateLabel = useMemo(todayLabel, []);
  const canSubmit = input.trim().length > 0 && !streaming;
  const visibleButtonPosition = clampFloatingPosition(buttonPosition, viewport);
  const panelWidth = Math.min(panelMaxWidth, Math.max(280, viewport.width - floatingMargin * 2 - floatingButtonSize - panelGap));
  const panelHeight = Math.min(panelMaxHeight, Math.max(panelMinHeight, viewport.height - floatingMargin * 2 - floatingButtonSize - panelGap));
  const panelBelowIcon = visibleButtonPosition.top + floatingButtonSize / 2 < viewport.height / 2;
  const panelTop = clamp(
    panelBelowIcon ? visibleButtonPosition.top + floatingButtonSize + panelGap : visibleButtonPosition.top - panelHeight - panelGap,
    floatingMargin,
    Math.max(floatingMargin, viewport.height - panelHeight - floatingMargin),
  );
  const panelLeft = clamp(
    visibleButtonPosition.left + floatingButtonSize - panelWidth,
    floatingMargin,
    Math.max(floatingMargin, viewport.width - panelWidth - floatingButtonSize - panelGap - floatingMargin),
  );
  const floatingControlPosition = open
    ? {
      left: clamp(panelLeft + panelWidth + panelGap, floatingMargin, Math.max(floatingMargin, viewport.width - floatingButtonSize - floatingMargin)),
      top: clamp(visibleButtonPosition.top, panelTop, Math.max(panelTop, panelTop + panelHeight - floatingButtonSize)),
    }
    : visibleButtonPosition;

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status, open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 120 ? 'auto' : 'hidden';
  }, [input]);

  useEffect(() => {
    const initialViewport = getViewportSize();
    const initialPosition = readStoredFloatingPosition(initialViewport);
    setViewport(initialViewport);
    setButtonPosition(initialPosition);
    storedPositionRef.current = positionToStoredFloatingPosition(initialPosition, initialViewport);
    setPositionInitialized(true);

    const handleResize = () => {
      const nextViewport = getViewportSize();
      setViewport(nextViewport);
      setButtonPosition((currentPosition) => storedFloatingPositionToPosition(
        storedPositionRef.current || positionToStoredFloatingPosition(currentPosition, nextViewport),
        nextViewport,
      ));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!positionInitialized) return;
    const storedPosition = storedPositionRef.current || positionToStoredFloatingPosition(buttonPosition, viewport);
    window.sessionStorage.setItem(floatingPositionStorageKey, JSON.stringify(storedPosition));
  }, [buttonPosition, positionInitialized, viewport]);

  const handleEvent = (event: ChatbotStreamEvent) => {
    if (event.type === 'session_id' && typeof event.value === 'string') {
      setSessionId(event.value);
      return;
    }

    if (event.type === 'status' && typeof event.value === 'string') {
      setStatus(event.value);
      return;
    }

    if (event.type === 'token' && typeof event.value === 'string') {
      setStatus('');
      const targetId = assistantMessageIdRef.current;
      if (!targetId) return;
      setMessages((current) =>
        current.map((message) => (message.id === targetId ? { ...message, text: message.text + event.value } : message)),
      );
      return;
    }

    if (event.type === 'intent' && typeof event.value === 'string') {
      const targetId = assistantMessageIdRef.current;
      if (!targetId) return;
      setMessages((current) =>
        current.map((message) => (message.id === targetId ? { ...message, intent: event.value as string } : message)),
      );
      return;
    }

    if (event.type === 'sources' && Array.isArray(event.value)) {
      const targetId = assistantMessageIdRef.current;
      if (!targetId) return;
      const sources = event.value.filter((item): item is string => typeof item === 'string');
      setMessages((current) =>
        current.map((message) => (message.id === targetId ? { ...message, sources } : message)),
      );
      return;
    }

    if (event.type === 'error' && typeof event.value === 'string') {
      const text = event.value;
      setStatus('');
      const targetId = assistantMessageIdRef.current;
      if (!targetId) {
        setMessages((current) => [...current, { id: `error-${Date.now()}`, role: 'assistant', text }]);
        return;
      }
      setMessages((current) =>
        current.map((message) => (message.id === targetId && !message.text ? { ...message, text } : message)),
      );
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || streaming) return;

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `assistant-${Date.now()}`;
    assistantMessageIdRef.current = assistantMessageId;
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setMessages((current) => [
      ...current,
      { id: userMessageId, role: 'user', text: question },
      { id: assistantMessageId, role: 'assistant', text: '' },
    ]);
    setInput('');
    setStreaming(true);
    setStatus('질문을 전달하는 중...');

    try {
      await streamChat({
        question,
        sessionId,
        signal: abortRef.current.signal,
        onEvent: handleEvent,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const targetId = assistantMessageIdRef.current;
      setMessages((current) =>
        current.map((message) =>
          message.id === targetId && !message.text
            ? { ...message, text: '챗봇 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.' }
            : message,
        ),
      );
    } finally {
      setStreaming(false);
      setStatus('');
      assistantMessageIdRef.current = null;
    }
  };

  const closePanel = () => {
    abortRef.current?.abort();
    setOpen(false);
    setStreaming(false);
    setStatus('');
  };

  const startNewChat = () => {
    abortRef.current?.abort();
    setSessionId(null);
    setStreaming(false);
    setStatus('');
    setMessages([{ id: `greeting-${Date.now()}`, role: 'assistant', text: assistantGreeting }]);
  };

  const handleFloatingPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - visibleButtonPosition.left,
      offsetY: event.clientY - visibleButtonPosition.top,
      startLeft: visibleButtonPosition.left,
      startTop: visibleButtonPosition.top,
      moved: false,
    };
    setDragging(true);
  };

  const handleFloatingPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const nextPosition = clampFloatingPosition({
      left: event.clientX - dragState.offsetX,
      top: event.clientY - dragState.offsetY,
    }, viewport);
    if (Math.abs(nextPosition.left - dragState.startLeft) > 4 || Math.abs(nextPosition.top - dragState.startTop) > 4) {
      dragState.moved = true;
    }
    storedPositionRef.current = positionToStoredFloatingPosition(nextPosition, viewport);
    setButtonPosition(nextPosition);
  };

  const finishFloatingDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    suppressClickRef.current = dragState.moved;
    dragStateRef.current = null;
    setDragging(false);
  };

  const toggleChatbot = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setOpen((value) => !value);
  };

  return (
    <>
      {open && (
        <section
          aria-label="i-veri 챗봇"
          style={{
            position: 'fixed',
            left: panelLeft,
            top: panelTop,
            zIndex: 2200,
            width: panelWidth,
            height: panelHeight,
            borderRadius: 16,
            background: C.white,
            boxShadow: '0 18px 44px rgba(31, 55, 43, .18)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            border: `1px solid ${C.g200}`,
          }}
        >
          <header style={{ minHeight: 76, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', flexShrink: 0, borderBottom: `1px solid ${C.g200}`, background: C.bg }}>
            <ChatLogo size={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.g800, fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>안전관리비 도우미</div>
              <div style={{ color: C.g500, fontSize: 13, fontWeight: 700, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>정산 기준과 증빙 보완을 확인합니다</div>
            </div>
            <span style={{ position: 'relative', display: 'inline-flex' }} className="chatbot-tooltip-wrap">
              <button type="button" onClick={startNewChat} aria-label="새 대화 시작" title="새 대화 시작" style={headerButtonStyle}>
                <PlusBubbleIcon />
              </button>
              <span
                aria-hidden="true"
                className="chatbot-tooltip"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 8px)',
                  zIndex: 2,
                  display: 'none',
                  whiteSpace: 'nowrap',
                  border: `1px solid ${C.g200}`,
                  borderRadius: 6,
                  background: C.g800,
                  color: C.white,
                  padding: '5px 8px',
                  fontSize: 12,
                  fontWeight: 700,
                  boxShadow: '0 8px 18px rgba(31, 55, 43, .18)',
                }}
              >
                새 대화 시작
              </span>
            </span>
            <button type="button" onClick={closePanel} aria-label="챗봇 창 닫기" style={headerButtonStyle}>
              <CloseIcon />
            </button>
          </header>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 20px', background: C.white }}>
            <div style={{ height: 10 }} />
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <span style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '4px 12px', color: C.g500, fontSize: 13, fontWeight: 700, lineHeight: 1.1 }}>
                {dateLabel}
              </span>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {messages.map((message) => (
                <div key={message.id} style={{ display: 'flex', justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start', gap: 10 }}>
                  {message.role === 'assistant' && <ChatLogo size={34} />}
                  <div
                    style={{
                      maxWidth: message.role === 'user' ? '78%' : 'calc(100% - 44px)',
                      borderRadius: message.role === 'user' ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
                      background: message.role === 'user' ? C.primary : C.g100,
                      color: message.role === 'user' ? C.white : C.g800,
                      border: message.role === 'user' ? 'none' : `1px solid ${C.g200}`,
                      boxShadow: 'none',
                      padding: message.role === 'user' ? '10px 13px' : '12px 14px',
                      fontSize: 14,
                      fontWeight: 650,
                      lineHeight: 1.58,
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {message.role === 'assistant' && message.intent && (
                      <div style={{ marginBottom: 8, display: 'flex' }}>
                        <span style={{ border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.primary, padding: '3px 8px', fontSize: 12, fontWeight: 800, lineHeight: 1.2 }}>
                          {message.intent}
                        </span>
                      </div>
                    )}
                    {message.text || (message.role === 'assistant' && streaming ? '...' : '')}
                    {message.sources && message.sources.length > 0 && (
                      <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {message.sources.slice(0, 3).map((source) => (
                          <span key={source} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '3px 8px', color: C.g500, fontSize: 12, fontWeight: 700 }}>
                            {source}
                          </span>
                        ))}
                      </div>
                    )}
                    {message.role === 'assistant' && message.text && (
                      <button
                        type="button"
                        aria-label="답변 복사"
                        onClick={() => void navigator.clipboard?.writeText(message.text)}
                        style={{ marginTop: 8, marginLeft: 'auto', border: 'none', background: 'transparent', color: C.g500, display: 'flex', cursor: 'pointer', padding: 0 }}
                      >
                        <CopyIcon />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {status && (
                <div style={{ marginLeft: 44, color: C.g500, fontSize: 13, fontWeight: 700 }}>
                  {status}
                </div>
              )}
            </div>
          </div>

          <footer style={{ flexShrink: 0, padding: '14px 16px 16px', background: C.white, borderTop: `1px solid ${C.g200}` }}>
            <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 46px', alignItems: 'end', gap: 8, border: `1px solid ${C.g200}`, borderRadius: 10, padding: 6, background: C.white }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }}
                placeholder="안전관리비 기준, 증빙, 보완 사유를 질문하세요"
                aria-label="챗봇 메시지 입력"
                disabled={streaming}
                rows={1}
                style={{
                  minWidth: 0,
                  minHeight: 44,
                  maxHeight: 120,
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  overflowY: 'hidden',
                  color: C.g800,
                  fontSize: 14,
                  fontWeight: 700,
                  lineHeight: 1.45,
                  padding: '12px 8px',
                  fontFamily: 'inherit',
                  background: 'transparent',
                }}
              />
              <button
                type="submit"
                aria-label="메시지 보내기"
                disabled={!canSubmit}
                style={{
                  width: 44,
                  height: 44,
                  border: 'none',
                  borderRadius: 8,
                  background: canSubmit ? C.primary : C.g100,
                  color: canSubmit ? C.white : C.g400,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <SendIcon />
              </button>
            </form>
          </footer>
        </section>
      )}

      <style jsx>{`
        .chatbot-tooltip-wrap:hover .chatbot-tooltip {
          display: inline-flex !important;
        }
      `}</style>

      <button
        type="button"
        onClick={toggleChatbot}
        onPointerDown={open ? undefined : handleFloatingPointerDown}
        onPointerMove={open ? undefined : handleFloatingPointerMove}
        onPointerUp={open ? undefined : finishFloatingDrag}
        onPointerCancel={open ? undefined : finishFloatingDrag}
        onDragStart={(event) => event.preventDefault()}
        aria-label={open ? '챗봇 닫기' : '챗봇 열기'}
        aria-expanded={open}
        style={{
          position: 'fixed',
          left: floatingControlPosition.left,
          top: floatingControlPosition.top,
          zIndex: 2300,
          width: floatingButtonSize,
          height: floatingButtonSize,
          borderRadius: 999,
          border: 'none',
          background: `radial-gradient(circle at center, color-mix(in srgb, ${C.light} 35%, white 65%) 0%, ${C.bg} 56%, transparent 100%)`,
          color: open ? C.g800 : C.white,
          boxShadow: '0 10px 24px rgba(31, 55, 43, .16)',
          display: 'grid',
          placeItems: 'center',
          cursor: open ? 'pointer' : dragging ? 'grabbing' : 'grab',
          overflow: 'hidden',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        {open ? <CloseIcon /> : <ChatLogo size={52} />}
      </button>
    </>
  );
}

const headerButtonStyle = {
  border: `1px solid ${C.g200}`,
  borderRadius: 8,
  background: C.white,
  color: C.g600,
  padding: 0,
  width: 32,
  height: 32,
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  flexShrink: 0,
} as const;
