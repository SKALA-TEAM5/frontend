'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AppUser } from './permissions';
import { ACTION_NOTIFICATION_EVENT, getActionNotifications, type ActionNotification } from './action-notifications';

export const isNotificationForUser = (notification: ActionNotification, user: AppUser) =>
  notification.recipientRole === user.role && (!notification.recipientUserName || notification.recipientUserName === user.name);

export const useActionNotifications = (user?: AppUser) => {
  const [notifications, setNotifications] = useState<ActionNotification[]>([]);

  useEffect(() => {
    const syncNotifications = () => setNotifications(getActionNotifications());
    syncNotifications();
    window.addEventListener(ACTION_NOTIFICATION_EVENT, syncNotifications);
    window.addEventListener('storage', syncNotifications);
    return () => {
      window.removeEventListener(ACTION_NOTIFICATION_EVENT, syncNotifications);
      window.removeEventListener('storage', syncNotifications);
    };
  }, []);

  const visibleNotifications = useMemo(
    () => user ? notifications.filter((notification) => isNotificationForUser(notification, user)) : notifications,
    [notifications, user],
  );
  const unreadNotifications = useMemo(
    () => visibleNotifications.filter((notification) => !notification.read),
    [visibleNotifications],
  );

  return { notifications, visibleNotifications, unreadNotifications };
};
