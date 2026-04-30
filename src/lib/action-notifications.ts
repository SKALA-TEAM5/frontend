export interface ActionNotification {
  id: string;
  projectId?: string;
  projectName: string;
  categoryName: string;
  title: string;
  message: string;
  requestedFiles: string[];
  senderName: string;
  recipientRole: 'project_manager' | 'she_manager';
  recipientUserName?: string;
  createdAt: string;
  createdAtMs: number;
  read: boolean;
}

const STORAGE_KEY = 'sananbee.action.notifications';
export const ACTION_NOTIFICATION_EVENT = 'sananbee:action-notifications';

const readRaw = (): ActionNotification[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ActionNotification[]).map((notification) => ({
      ...notification,
      recipientRole: notification.recipientRole || 'project_manager',
    })) : [];
  } catch {
    return [];
  }
};

const writeRaw = (notifications: ActionNotification[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  window.dispatchEvent(new Event(ACTION_NOTIFICATION_EVENT));
};

export const getActionNotifications = () => readRaw();

export const addActionNotification = (notification: Omit<ActionNotification, 'id' | 'createdAt' | 'createdAtMs' | 'read' | 'recipientRole'> & { recipientRole?: ActionNotification['recipientRole'] }) => {
  const next: ActionNotification = {
    ...notification,
    id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    recipientRole: notification.recipientRole || 'project_manager',
    createdAt: new Date().toLocaleString('ko-KR'),
    createdAtMs: Date.now(),
    read: false,
  };
  writeRaw([next, ...readRaw()]);
  return next;
};

export const markActionNotificationRead = (notificationId: string) => {
  writeRaw(readRaw().map((notification) => notification.id === notificationId ? { ...notification, read: true } : notification));
};
