import { Alert, Platform } from 'react-native';

/** Yes/no dialog. Alert.alert has no buttons on web, so use the browser's confirm there. */
export function confirm(title: string, message: string, okLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }));
}

export const confirmDeleteChat = (name: string) =>
  confirm('Delete chat?', `Messages with ${name} will be removed from your phone. ${name} keeps their copy.`, 'Delete');
