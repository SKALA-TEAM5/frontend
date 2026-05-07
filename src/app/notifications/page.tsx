'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { AppFrame } from '../../components/common';
import { C } from '../../lib/theme';
import { useCurrentUser } from '../../lib/dev-user';
import { markActionNotificationRead, type ActionNotification } from '../../lib/action-notifications';
import { useActionNotifications } from '../../lib/use-action-notifications';
import {
  ACTION_REQUEST_STATUS_META,
  ACTION_REQUEST_STATUS_STEPS,
  type ActionRequestStatusCode,
} from '../../lib/project-data';

type NotificationBox = 'received' | 'sent';

const pillButtonStyle = (active = false, color = C.primary): CSSProperties => ({
  border: active ? 'none' : `1px solid ${C.g200}`,
  borderRadius: 999,
  padding: '8px 14px',
  background: active ? color : C.white,
  color: active ? C.white : C.g600,
  fontSize: 12,
  fontWeight: 900,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  boxShadow: active ? '0 9px 18px rgba(27, 94, 59, .22)' : '0 7px 16px rgba(31, 55, 43, .08)',
});

const badgeStyle = (color: string, bg = C.white): CSSProperties => ({
  border: `1px solid ${color}`,
  borderRadius: 999,
  padding: '4px 8px',
  background: bg,
  color,
  fontSize: 11,
  fontWeight: 900,
  whiteSpace: 'nowrap',
});

const getActionStatusCode = (notification: ActionNotification): ActionRequestStatusCode =>
  notification.statusCode || 'open';

const summarizeTargets = (notifications: ActionNotification[]) => {
  const targets = Array.from(new Set(notifications.map((notification) => notification.categoryName).filter(Boolean)));
  if (!targets.length) return '항목 정보 없음';
  return targets.length === 1 ? targets[0] : `${targets[0]} 외 ${targets.length - 1}건`;
};

const formatUploadProjectLabel = (projectName: string) => {
  const match = projectName.match(/(.+?)\s*[·-]\s*(\d{4})-(\d{2})/);
  if (!match) return projectName;
  return `${match[1].trim()} ${Number(match[2])}년 ${Number(match[3])}월`;
};

export default function NotificationsPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { notifications, visibleNotifications } = useActionNotifications(user);
  const [notificationQuery, setNotificationQuery] = useState('');
  const [notificationProjectFilter, setNotificationProjectFilter] = useState('all');
  const [notificationPeriodFilter, setNotificationPeriodFilter] = useState('all');
  const [notificationBox, setNotificationBox] = useState<NotificationBox>('received');
  const [notificationStatusFilter, setNotificationStatusFilter] = useState<ActionRequestStatusCode | 'active'>('active');

  const receivedNotifications = useMemo(
    () => visibleNotifications.filter((notification) => notification.type === 'new_upload'),
    [visibleNotifications],
  );

  const sentNotifications = useMemo(
    () => notifications.filter((notification) => notification.type === 'action_request' && notification.senderName === user.name),
    [notifications, user.name],
  );

  const baseNotifications = notificationBox === 'sent' ? sentNotifications : receivedNotifications;

  const notificationProjectOptions = useMemo(
    () => Array.from(new Set(baseNotifications.map((notification) => notification.projectName))).filter(Boolean),
    [baseNotifications],
  );

  const filteredNotifications = useMemo(() => {
    const now = Date.now();
    const periodStart = notificationPeriodFilter === 'today'
      ? now - 24 * 60 * 60 * 1000
      : notificationPeriodFilter === '7d'
        ? now - 7 * 24 * 60 * 60 * 1000
        : notificationPeriodFilter === '30d'
          ? now - 30 * 24 * 60 * 60 * 1000
          : 0;
    const query = notificationQuery.trim().toLowerCase();

    return baseNotifications.filter((notification) => {
      const statusCode = getActionStatusCode(notification);
      const matchesQuery = !query || [notification.projectName, notification.categoryName, notification.title, notification.message, notification.senderName].some((value) => value.toLowerCase().includes(query));
      const matchesProject = notificationProjectFilter === 'all' || notification.projectName === notificationProjectFilter;
      const matchesPeriod = notificationPeriodFilter === 'all' || (notification.createdAtMs || 0) >= periodStart;
      const matchesStatus = notificationBox === 'received' || notificationStatusFilter === 'active' ? statusCode !== 'closed' : statusCode === notificationStatusFilter;
      return matchesQuery && matchesProject && matchesPeriod && matchesStatus;
    });
  }, [baseNotifications, notificationBox, notificationPeriodFilter, notificationProjectFilter, notificationQuery, notificationStatusFilter]);

  const uploadGroups = useMemo(() => {
    const grouped = new Map<string, ActionNotification[]>();
    filteredNotifications.forEach((notification) => {
      const key = `${notification.projectId || notification.projectName}-${notification.senderName}-${notification.createdAtMs}`;
      grouped.set(key, [...(grouped.get(key) || []), notification]);
    });
    return Array.from(grouped.values());
  }, [filteredNotifications]);

  const openProject = (notification: ActionNotification, tab: 'archive' | 'validation') => {
    if (!notification.projectId) return;
    markActionNotificationRead(notification.id);
    router.push(`/projects/${notification.projectId}?tab=${tab}`);
  };

  const renderStatusBar = (notification: ActionNotification) => {
    const actionStatusCode = getActionStatusCode(notification);
    const actionStatusIndex = ACTION_REQUEST_STATUS_STEPS.indexOf(actionStatusCode);
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ACTION_REQUEST_STATUS_STEPS.length}, minmax(0, 1fr))`, gap: 8, marginTop: 10 }}>
        {ACTION_REQUEST_STATUS_STEPS.map((statusCode, index) => {
          const meta = ACTION_REQUEST_STATUS_META[statusCode];
          const active = index === actionStatusIndex;
          const done = index < actionStatusIndex;
          return (
            <div key={statusCode} style={{ minWidth: 0 }}>
              <div style={{ height: 5, borderRadius: 99, background: active || done ? meta.color : C.g100, marginBottom: 6 }} />
              <div style={{ fontSize: 11, fontWeight: active ? 900 : 800, color: active ? meta.color : done ? C.g600 : C.g400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {meta.label}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const resultCount = notificationBox === 'received' ? uploadGroups.length : filteredNotifications.length;

  return (
    <AppFrame title="알림센터" description={user.role === 'she_manager' ? '보낸 조치 요청과 받은 새 파일 업로드 알림을 확인할 수 있습니다.' : 'SHE 담당자가 보낸 조치 요청 알림을 확인하고 조치할 수 있습니다.'}>
      <div className="screen-enter">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12, padding: 10, border: `1px solid ${C.g200}`, borderRadius: 6, background: C.white }}>
          <input value={notificationQuery} onChange={(event) => setNotificationQuery(event.target.value)} placeholder="알림 내용, 항목, 담당자 검색" style={{ flex: '1 1 320px', minWidth: 240, border: `1px solid ${C.g200}`, borderRadius: 6, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: C.g800, background: '#FBFDFC', outline: 'none' }} />
          <select className="soft-green-focus" value={notificationProjectFilter} onChange={(event) => setNotificationProjectFilter(event.target.value)} style={{ flex: '0 1 300px', minWidth: 200, border: `1px solid ${C.g200}`, borderRadius: 6, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: C.g800, background: '#FBFDFC', outline: 'none' }}>
            <option value="all">전체 프로젝트</option>
            {notificationProjectOptions.map((projectName) => <option key={projectName} value={projectName}>{projectName}</option>)}
          </select>
          <select className="soft-green-focus" value={notificationPeriodFilter} onChange={(event) => setNotificationPeriodFilter(event.target.value)} style={{ flex: '0 1 150px', minWidth: 130, border: `1px solid ${C.g200}`, borderRadius: 6, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: C.g800, background: '#FBFDFC', outline: 'none' }}>
            <option value="all">전체 기간</option>
            <option value="today">최근 24시간</option>
            <option value="7d">최근 7일</option>
            <option value="30d">최근 30일</option>
          </select>
          {notificationBox === 'sent' && (
            <select className="soft-green-focus" value={notificationStatusFilter} onChange={(event) => setNotificationStatusFilter(event.target.value as ActionRequestStatusCode | 'active')} style={{ flex: '0 1 140px', minWidth: 130, border: `1px solid ${C.g200}`, borderRadius: 6, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13, fontWeight: 900, color: C.g800, background: '#FBFDFC', cursor: 'pointer', outline: 'none' }}>
              <option value="active">조치 상태</option>
              {ACTION_REQUEST_STATUS_STEPS.map((statusCode) => (
                <option key={statusCode} value={statusCode}>{ACTION_REQUEST_STATUS_META[statusCode].label}</option>
              ))}
            </select>
          )}
        </div>
        <div role="tablist" aria-label="알림함 선택" style={{ display: 'flex', alignItems: 'center', gap: 2, borderBottom: `1px solid ${C.g200}`, marginBottom: 12, overflowX: 'auto' }}>
          {([
            ['received', '받은 알림'],
            ['sent', '보낸 알림'],
          ] as Array<[NotificationBox, string]>).map(([box, label]) => {
            const active = notificationBox === box;
            return (
              <button key={box} type="button" role="tab" aria-selected={active} onClick={() => setNotificationBox(box)} style={{ border: 'none', borderBottom: `2px solid ${active ? C.primary : 'transparent'}`, background: 'transparent', color: active ? C.primary : C.g400, opacity: active ? 1 : 0.58, padding: '8px 12px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: active ? 900 : 800, whiteSpace: 'nowrap' }}>
                {label}
              </button>
            );
          })}
        </div>

        <div style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', borderBottom: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: C.g800 }}>{notificationBox === 'sent' ? '보낸 알림' : '받은 알림'}</div>
            <div style={{ fontSize: 12, fontWeight: 900, color: C.g400 }}>{resultCount}건</div>
          </div>
          {resultCount === 0 && <div style={{ padding: 28, textAlign: 'center', color: C.g400, fontSize: 13, fontWeight: 800 }}>조건에 맞는 알림이 없습니다.</div>}

          {notificationBox === 'sent' && filteredNotifications.map((notification) => {
            const actionStatusCode = getActionStatusCode(notification);
            const actionStatusMeta = ACTION_REQUEST_STATUS_META[actionStatusCode];
            return (
              <div key={notification.id} style={{ padding: '15px 16px', borderBottom: `1px solid ${C.g100}`, background: C.white }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: C.g800 }}>{notification.categoryName}</div>
                    <div style={{ fontSize: 12, color: C.g400, marginTop: 3 }}>{notification.projectName} · {notification.recipientUserName || '프로젝트 담당자'}에게 보냄 · {notification.createdAt}</div>
                  </div>
                  <span style={badgeStyle(actionStatusMeta.color, actionStatusMeta.bg)}>{actionStatusMeta.label}</span>
                </div>
                <div style={{ fontSize: 13, color: C.g800, lineHeight: 1.6 }}>{notification.message}</div>
                {notification.requestedFiles.length > 0 && <div style={{ fontSize: 12, color: C.g600, lineHeight: 1.5, marginTop: 6 }}>요청 자료: {notification.requestedFiles.join(', ')}</div>}
                {renderStatusBar(notification)}
              </div>
            );
          })}

          {notificationBox === 'received' && uploadGroups.map((group) => {
            const first = group[0];
            const targetSummary = summarizeTargets(group);
            const fileCount = group.reduce((sum, notification) => sum + notification.requestedFiles.length, 0);
            const unread = group.some((notification) => !notification.read);
            const targets = Array.from(new Set(group.map((notification) => notification.categoryName).filter(Boolean))).slice(0, 3);
            return (
              <div key={`${first.id}-${group.length}`} style={{ padding: '15px 16px', borderBottom: `1px solid ${C.g100}`, background: unread ? '#FCFEFD' : C.white }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', flex: '1 1 auto' }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: C.g800, lineHeight: 1.6 }}>
                      {first.senderName} 담당자가 {formatUploadProjectLabel(first.projectName)}에 새 파일 {fileCount}건을 업로드했습니다.
                    </div>
                    <div style={{ fontSize: 12, color: C.g400, fontWeight: 800, lineHeight: 1.6, whiteSpace: 'nowrap' }}>{first.createdAt}</div>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={badgeStyle(unread ? C.primary : C.ok, unread ? C.bg : '#F4FBF6')}>{unread ? '안읽음' : '읽음'}</span>
                  </div>
                </div>
                {targets.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                    {targets.map((target) => <span key={target} style={badgeStyle(C.g600, C.white)}>{target}</span>)}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 7, marginTop: 11 }}>
                  {unread && <button type="button" onClick={() => group.forEach((notification) => markActionNotificationRead(notification.id))} style={pillButtonStyle(false)}>읽음</button>}
                  <button type="button" onClick={() => openProject(first, 'archive')} disabled={!first.projectId} style={{ ...pillButtonStyle(true), cursor: first.projectId ? 'pointer' : 'not-allowed', opacity: first.projectId ? 1 : 0.45 }}>확인하기</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppFrame>
  );
}
