import type { CSSProperties } from 'react';
import { C } from '../../lib/theme';

export type DashboardWidgetId =
  | 'actionPipeline'
  | 'actionQueue'
  | 'decisionLog'
  | 'projectProgress'
  | 'workload'
  | 'myProjects'
  | 'timeline';

export type WidgetHelpId = DashboardWidgetId;
export type WidgetPosition = { col: number; row: number };
export type WidgetSize = { colSpan: number; rowSpan: number };

export const DASHBOARD_WIDGETS: Array<{ id: DashboardWidgetId; label: string }> = [
  { id: 'actionPipeline', label: '프로젝트 상태 파이프라인' },
  { id: 'actionQueue', label: '확인 필요 프로젝트' },
  { id: 'decisionLog', label: '최근 상태 변경' },
  { id: 'projectProgress', label: '프로젝트 공정률' },
  { id: 'workload', label: '담당자별 프로젝트 현황' },
  { id: 'myProjects', label: '내 프로젝트 현황' },
  { id: 'timeline', label: '월별 타임라인' },
];

export const DEFAULT_WIDGET_IDS = DASHBOARD_WIDGETS.map((widget) => widget.id);
export const DASHBOARD_WIDGET_STORAGE_KEY = 'she.dashboard.visibleWidgets.v19';
export const DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY = 'she.dashboard.widgetLayout.v19';

export const GRID_GAP = 14;
export const GRID_ROW_GUIDE_HEIGHT = 130;
export const GRID_EDIT_PADDING = 12;
export const GRID_COLUMN_COUNT = 7;

export const WIDGET_SIZES: Record<DashboardWidgetId, WidgetSize> = {
  actionPipeline: { colSpan: 7, rowSpan: 1 },
  actionQueue: { colSpan: 4, rowSpan: 3 },
  decisionLog: { colSpan: 3, rowSpan: 3 },
  projectProgress: { colSpan: 2, rowSpan: 1 },
  workload: { colSpan: 2, rowSpan: 2 },
  myProjects: { colSpan: 4, rowSpan: 3 },
  timeline: { colSpan: 7, rowSpan: 3 },
};

export const DEFAULT_WIDGET_LAYOUT: Record<DashboardWidgetId, WidgetPosition> = {
  actionPipeline: { col: 1, row: 1 },
  actionQueue: { col: 1, row: 2 },
  decisionLog: { col: 5, row: 2 },
  workload: { col: 5, row: 6 },
  projectProgress: { col: 5, row: 5 },
  myProjects: { col: 1, row: 5 },
  timeline: { col: 1, row: 8 },
};

export const dashboardGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `repeat(${GRID_COLUMN_COUNT}, minmax(0, 1fr))`,
  gridAutoRows: GRID_ROW_GUIDE_HEIGHT,
  gap: GRID_GAP,
  alignItems: 'stretch',
  width: 'min(100%, 1280px)',
  maxWidth: 1180,
  alignSelf: 'center',
  minWidth: 0,
};

export const dashboardEditGridStyle: CSSProperties = {
  boxSizing: 'border-box',
  padding: GRID_EDIT_PADDING,
  width: '100%',
  minHeight: GRID_ROW_GUIDE_HEIGHT * 10 + GRID_GAP * 9 + GRID_EDIT_PADDING * 2,
  maxWidth: '100%',
  borderRadius: 18,
  backgroundImage: `linear-gradient(${C.g200} 1px, transparent 1px), linear-gradient(90deg, ${C.g200} 1px, transparent 1px)`,
  backgroundPosition: `${GRID_EDIT_PADDING}px ${GRID_EDIT_PADDING}px`,
  backgroundSize: `calc((100% - ${GRID_EDIT_PADDING * 2}px - ${GRID_GAP * (GRID_COLUMN_COUNT - 1)}px) / ${GRID_COLUMN_COUNT} + ${GRID_GAP}px) ${GRID_ROW_GUIDE_HEIGHT + GRID_GAP}px`,
  backgroundColor: '#FAFDFB',
};

export const widgetPlacementStyle = (size: WidgetSize): CSSProperties => ({
  gridColumn: `span ${size.colSpan}`,
  gridRow: `span ${size.rowSpan}`,
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
});

const overlaps = (a: WidgetPosition, aSize: WidgetSize, b: WidgetPosition, bSize: WidgetSize) => {
  const aColEnd = a.col + aSize.colSpan - 1;
  const bColEnd = b.col + bSize.colSpan - 1;
  const aRowEnd = a.row + aSize.rowSpan - 1;
  const bRowEnd = b.row + bSize.rowSpan - 1;
  return a.col <= bColEnd && b.col <= aColEnd && a.row <= bRowEnd && b.row <= aRowEnd;
};

const clampWidgetPosition = (id: DashboardWidgetId, position: WidgetPosition): WidgetPosition => {
  const size = WIDGET_SIZES[id];
  const maxColumn = Math.max(1, GRID_COLUMN_COUNT - size.colSpan + 1);
  return {
    col: Math.min(Math.max(1, position.col), maxColumn),
    row: Math.max(1, position.row),
  };
};

export const resolveLayoutWithPushDown = (
  current: Record<DashboardWidgetId, WidgetPosition>,
  activeWidgetIds: DashboardWidgetId[],
  movingWidgetId: DashboardWidgetId,
  movingTo: WidgetPosition,
) => {
  const next = { ...current, [movingWidgetId]: clampWidgetPosition(movingWidgetId, movingTo) };
  const orderedWidgetIds = activeWidgetIds
    .filter((id) => id !== movingWidgetId)
    .sort((a, b) => {
      const aPosition = current[a] || DEFAULT_WIDGET_LAYOUT[a];
      const bPosition = current[b] || DEFAULT_WIDGET_LAYOUT[b];
      return aPosition.row - bPosition.row || aPosition.col - bPosition.col;
    });
  const placedWidgetIds = [movingWidgetId];

  orderedWidgetIds.forEach((id) => {
    let position = clampWidgetPosition(id, current[id] || DEFAULT_WIDGET_LAYOUT[id]);
    let changed = true;

    while (changed) {
      changed = false;
      placedWidgetIds.forEach((placedId) => {
        const placedPosition = next[placedId] || DEFAULT_WIDGET_LAYOUT[placedId];
        if (!overlaps(position, WIDGET_SIZES[id], placedPosition, WIDGET_SIZES[placedId])) return;
        position = { ...position, row: placedPosition.row + WIDGET_SIZES[placedId].rowSpan };
        changed = true;
      });
    }

    next[id] = position;
    placedWidgetIds.push(id);
  });

  return next;
};

export const getGridCellMetrics = (grid: HTMLDivElement) => {
  const width = Math.max(0, grid.clientWidth - GRID_EDIT_PADDING * 2 - GRID_GAP * (GRID_COLUMN_COUNT - 1));
  const columnWidth = Math.max(1, width / GRID_COLUMN_COUNT);
  return {
    columnWidth,
    columnPitch: columnWidth + GRID_GAP,
  };
};
