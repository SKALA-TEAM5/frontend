import ChevronIcon from '../../../components/ui/ChevronIcon';
import { C } from '../../../lib/theme';
import type { UsageDetailTodoItem } from './usage-statement-detail-types';

export interface UsageDetailTodoGroup {
  id: string;
  label: string;
  agentType: string;
  items: UsageDetailTodoItem[];
}

interface UsageDetailTodoSidebarProps {
  visible: boolean;
  open: boolean;
  pinned: boolean;
  hoverBlocked: boolean;
  activeTodoCount: number;
  groups: UsageDetailTodoGroup[];
  collapsedGroupIds: Record<string, boolean>;
  confirmingIds: Record<string, boolean>;
  isTodoDone: (todo: UsageDetailTodoItem) => boolean;
  getTodoConfirmingKey: (todo: UsageDetailTodoItem) => string;
  getTodoDisplayTitle: (todo: UsageDetailTodoItem) => string;
  onTodoToggle: (todo: UsageDetailTodoItem) => void;
  onGroupToggle: (groupId: string) => void;
  onPin: () => void;
  onCollapse: () => void;
  onRailEnter: () => void;
  onRailLeave: () => void;
  onRailOpen: () => void;
}

export default function UsageDetailTodoSidebar({
  visible,
  open,
  pinned,
  hoverBlocked,
  activeTodoCount,
  groups,
  collapsedGroupIds,
  confirmingIds,
  isTodoDone,
  getTodoConfirmingKey,
  getTodoDisplayTitle,
  onTodoToggle,
  onGroupToggle,
  onPin,
  onCollapse,
  onRailEnter,
  onRailLeave,
  onRailOpen,
}: UsageDetailTodoSidebarProps) {
  if (!visible || !groups.length) return null;

  return (
    <>
      {open && (
        <aside data-ui="usage-detail-screen.todo-panel" onClick={onPin} style={{ position: 'fixed', top: 'var(--app-header-height)', right: 0, width: 320, maxWidth: 'calc(100vw - 24px)', height: 'calc(100vh - var(--app-header-height))', zIndex: 54, border: `1px solid ${C.g200}`, borderRight: 'none', borderRadius: '10px 0 0 10px', background: C.white, boxShadow: '-18px 0 42px rgba(31,47,39,.14)', overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto minmax(0,1fr)', overscrollBehavior: 'contain', opacity: pinned ? 1 : 0.95, transition: 'opacity .16s ease' }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 2, background: C.white, borderBottom: `1px solid ${C.g200}`, padding: '16px 16px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: C.g800 }}>보완 TODO</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.primary }}>{activeTodoCount}건</div>
                <button type="button" aria-label="보완 TODO 접기" onClick={(event) => { event.stopPropagation(); onCollapse(); }} style={{ width: 28, height: 28, border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.primary, cursor: 'pointer', fontSize: 19, fontWeight: 800, lineHeight: 1 }}>
                  »
                </button>
              </div>
            </div>
          </div>
          <div className="usage-detail-todo-scroll" style={{ overflowY: 'auto', overflowX: 'hidden', padding: '12px 8px 12px 12px', scrollbarWidth: 'thin', scrollbarColor: `${C.g200} transparent`, background: C.white, overscrollBehavior: 'contain' }}>
            {groups.map((group) => (
              <TodoGroup
                key={group.id}
                group={group}
                collapsed={Boolean(collapsedGroupIds[group.id])}
                confirmingIds={confirmingIds}
                isTodoDone={isTodoDone}
                getTodoConfirmingKey={getTodoConfirmingKey}
                getTodoDisplayTitle={getTodoDisplayTitle}
                onTodoToggle={onTodoToggle}
                onGroupToggle={onGroupToggle}
              />
            ))}
          </div>
        </aside>
      )}
      {!open && (
        <aside data-ui="usage-detail-screen.todo-rail" onMouseEnter={() => { if (!hoverBlocked) onRailEnter(); }} onMouseLeave={onRailLeave} style={{ position: 'fixed', top: 'var(--app-header-height)', right: 0, width: 45, height: 180, zIndex: 54, border: `1px solid ${C.g200}`, borderRight: 'none', borderRadius: '14px 0 0 14px', background: C.white, boxShadow: '-10px 0 28px rgba(31,47,39,.10)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '10px 6px' }}>
          <button type="button" aria-label="보완 TODO 펼치기" onClick={onRailOpen} style={{ width: 34, height: 34, border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.primary, cursor: 'pointer', fontSize: 21, fontWeight: 800, lineHeight: 1, boxShadow: '0 8px 18px rgba(31,47,39,.10)' }}>
            «
          </button>
          <div style={{ width: 30, borderTop: `1px solid ${C.g200}` }} />
          <button type="button" onClick={onRailOpen} style={{ width: 36, minHeight: 92, border: 'none', borderRadius: 10, background: 'transparent', color: C.g800, cursor: 'pointer', fontFamily: 'inherit', display: 'grid', placeItems: 'center', gap: 5, padding: '7px 3px' }}>
            <span aria-hidden="true" style={{ width: 23, height: 23, borderRadius: 999, border: `2px solid ${C.primary}`, background: C.white, color: C.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{activeTodoCount}</span>
            <span style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.2, writingMode: 'vertical-rl', letterSpacing: 0 }}>보완 TODO</span>
          </button>
        </aside>
      )}
    </>
  );
}

function TodoGroup({
  group,
  collapsed,
  confirmingIds,
  isTodoDone,
  getTodoConfirmingKey,
  getTodoDisplayTitle,
  onTodoToggle,
  onGroupToggle,
}: {
  group: UsageDetailTodoGroup;
  collapsed: boolean;
  confirmingIds: Record<string, boolean>;
  isTodoDone: (todo: UsageDetailTodoItem) => boolean;
  getTodoConfirmingKey: (todo: UsageDetailTodoItem) => string;
  getTodoDisplayTitle: (todo: UsageDetailTodoItem) => string;
  onTodoToggle: (todo: UsageDetailTodoItem) => void;
  onGroupToggle: (groupId: string) => void;
}) {
  const activeCount = group.items.filter((todo) => !isTodoDone(todo)).length;

  return (
    <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: C.white, padding: 7, display: 'grid', gap: collapsed ? 0 : 7, marginBottom: 8, position: 'relative' }}>
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => onGroupToggle(group.id)}
        style={{ width: '100%', border: 'none', background: 'transparent', padding: 0, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', alignItems: 'center', gap: 7, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
      >
        <span style={{ minWidth: 0 }}>
          <span title={group.label} style={{ display: 'block', fontSize: 13, fontWeight: 800, color: activeCount ? C.g800 : C.g400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.label}</span>
          <span title={group.agentType} style={{ display: 'block', marginTop: 2, fontSize: 11, fontWeight: 700, color: C.g400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.agentType}</span>
        </span>
        <span style={{ minWidth: 20, height: 18, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', background: C.white, color: activeCount ? C.primary : C.g400, border: `1px solid ${C.g200}`, fontSize: 11, fontWeight: 800 }}>{activeCount}</span>
        <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 999, border: `1px solid ${C.g200}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronIcon direction={collapsed ? 'right' : 'down'} size={14} color={C.g600} />
        </span>
      </button>
      {!collapsed && <TodoList items={group.items} confirmingIds={confirmingIds} isTodoDone={isTodoDone} getTodoConfirmingKey={getTodoConfirmingKey} getTodoDisplayTitle={getTodoDisplayTitle} onTodoToggle={onTodoToggle} />}
    </div>
  );
}

function TodoList({
  items,
  confirmingIds,
  isTodoDone,
  getTodoConfirmingKey,
  getTodoDisplayTitle,
  onTodoToggle,
}: {
  items: UsageDetailTodoItem[];
  confirmingIds: Record<string, boolean>;
  isTodoDone: (todo: UsageDetailTodoItem) => boolean;
  getTodoConfirmingKey: (todo: UsageDetailTodoItem) => string;
  getTodoDisplayTitle: (todo: UsageDetailTodoItem) => string;
  onTodoToggle: (todo: UsageDetailTodoItem) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {items.map((todo) => {
        const done = isTodoDone(todo);
        const confirming = Boolean(confirmingIds[getTodoConfirmingKey(todo)]);
        const tone = todo.mode === 'add' ? C.primary : C.danger;
        const toneSoft = todo.mode === 'add' ? C.bg : C.dangerBg;
        const toneBorder = todo.mode === 'add' ? C.light : '#FFCDD2';
        const cardBorder = done ? C.g200 : toneBorder;
        const titleText = getTodoDisplayTitle(todo);

        return (
          <button
            key={todo.id}
            type="button"
            onClick={() => onTodoToggle(todo)}
            disabled={confirming}
            style={{
              width: '100%',
              border: `1px solid ${cardBorder}`,
              borderRadius: 6,
              background: C.white,
              color: done ? C.g400 : C.g800,
              cursor: confirming ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              padding: '9px 8px',
              textAlign: 'left',
              position: 'relative',
              boxShadow: done ? 'none' : '0 6px 14px rgba(31,47,39,.06)',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr)', gap: 7, alignItems: 'start' }}>
              <span
                aria-hidden="true"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  border: `1px solid ${done ? C.g200 : toneBorder}`,
                  background: done ? C.g100 : toneSoft,
                  color: done ? C.g400 : tone,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 800,
                  marginTop: 1,
                }}
              >
                {done ? '✓' : ''}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 800, lineHeight: 1.35, color: done ? C.g400 : tone, textDecoration: done ? 'line-through' : 'none', whiteSpace: 'pre-line' }}>{titleText}</span>
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
