import { Platform } from 'react-native';

/** Browser notifications for new messages while the tab is in the background (web only). */
export const notificationsSupported = () => Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window;
export const notificationPermission = (): NotificationPermission | 'unsupported' =>
  notificationsSupported() ? Notification.permission : 'unsupported';
export const requestNotifications = async () => (notificationsSupported() ? Notification.requestPermission() : 'denied');

export function showMessageNotification(title: string, body: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted' || !document.hidden) return;
  const n = new Notification(title, { body, icon: '/favicon.ico', tag: title });
  n.onclick = () => { window.focus(); n.close(); };
}

/** "(3) EasyTalk" in the browser tab when there are unread messages. */
export function setUnreadTitle(count: number) {
  if (Platform.OS === 'web' && typeof document !== 'undefined') document.title = count > 0 ? `(${count}) EasyTalk` : 'EasyTalk';
}
