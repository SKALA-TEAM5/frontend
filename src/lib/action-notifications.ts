import type { ActionRequestStatusCode } from './project-data';

export type NotificationType = 'action_request' | 'new_upload';

export interface ActionNotification {
  id: string;
  type: NotificationType;
  projectId?: string;
  projectName: string;
  categoryName: string;
  title: string;
  message: string;
  requestedFiles: string[];
  senderName: string;
  recipientRole: 'project_manager' | 'she_manager';
  recipientUserName?: string;
  statusCode?: ActionRequestStatusCode;
  createdAt: string;
  createdAtMs: number;
  read: boolean;
}

const STORAGE_KEY = 'sananbee.action.notifications';
export const ACTION_NOTIFICATION_EVENT = 'sananbee:action-notifications';
type StoredNotificationType = NotificationType | 'action_completed';
type StoredActionNotification = Omit<ActionNotification, 'type'> & { type?: StoredNotificationType };

const inferNotificationType = (notification: Partial<Omit<ActionNotification, 'type'>> & { type?: StoredNotificationType }): NotificationType => {
  if (notification.type === 'action_request' || notification.type === 'new_upload') return notification.type;
  if (notification.recipientRole === 'she_manager') return 'new_upload';
  return 'action_request';
};

const readRaw = (): ActionNotification[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredActionNotification[])
      .filter((notification) => notification.type !== 'action_completed')
      .map((notification) => ({
        ...notification,
        type: inferNotificationType(notification),
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

export const addActionNotification = (notification: Omit<ActionNotification, 'id' | 'createdAt' | 'createdAtMs' | 'read' | 'recipientRole' | 'type'> & { recipientRole?: ActionNotification['recipientRole']; type?: NotificationType }) => {
  const next: ActionNotification = {
    ...notification,
    id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: notification.type || inferNotificationType(notification),
    recipientRole: notification.recipientRole || 'project_manager',
    createdAt: new Date().toLocaleString('ko-KR'),
    createdAtMs: Date.now(),
    read: false,
  };
  writeRaw([next, ...readRaw()]);
  return next;
};

export const markActionNotificationRead = (notificationId: string) => {
  writeRaw(readRaw().map((notification) => {
    if (notification.id !== notificationId) return notification;
    const shouldStartAction = notification.type === 'action_request' && (!notification.statusCode || notification.statusCode === 'open');
    return {
      ...notification,
      read: true,
      statusCode: shouldStartAction ? 'in_progress' : notification.statusCode,
    };
  }));
};

export const updateActionNotificationStatus = (notificationId: string, statusCode: ActionRequestStatusCode) => {
  writeRaw(readRaw().map((notification) => notification.id === notificationId ? { ...notification, statusCode } : notification));
};

export const resolveActionRequestNotificationsForProject = (projectId: string) => {
  writeRaw(readRaw().map((notification) => {
    if (notification.projectId !== projectId) return notification;
    if (notification.type !== 'action_request') return notification;
    return { ...notification, statusCode: 'resolved', read: true };
  }));
};

export const closeResolvedActionNotificationsForProject = (projectId: string) => {
  writeRaw(readRaw().map((notification) => {
    if (notification.projectId !== projectId) return notification;
    if (notification.statusCode !== 'resolved') return notification;
    return { ...notification, statusCode: 'closed', read: true };
  }));
};
