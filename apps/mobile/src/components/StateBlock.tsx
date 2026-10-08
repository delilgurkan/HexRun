import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { T } from './Text';

/** Boş / hata durumu: tek başlık, tek açıklama, tek eylem. */
export function StateBlock({
  icon,
  title,
  body,
  action,
  onAction,
  footnote,
  children,
  testID,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
  footnote?: string;
  children?: ReactNode;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 12, paddingVertical: 24 }} testID={testID} accessibilityLiveRegion="polite">
      {icon ? (
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: t.c.surf2, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} />
        </View>
      ) : null}
      <T v="title2" accessibilityRole="header">
        {title}
      </T>
      {body ? <T tone={2}>{body}</T> : null}
      {children}
      {action && onAction ? <Button label={action} onPress={onAction} kind="secondary" style={{ alignSelf: 'flex-start' }} /> : null}
      {footnote ? (
        <T v="data" tone={3}>
          {footnote}
        </T>
      ) : null}
    </View>
  );
}
