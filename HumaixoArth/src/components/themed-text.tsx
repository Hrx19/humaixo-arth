import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Typography } from '@/theme/typography';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: Typography.size.subtext,
    lineHeight: Typography.lineHeight.subtext,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: Typography.size.subtext,
    lineHeight: Typography.lineHeight.subtext,
    fontWeight: 700,
  },
  default: {
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: 500,
  },
  title: {
    fontSize: Typography.size.display,
    fontWeight: 600,
    lineHeight: Typography.lineHeight.display,
  },
  subtitle: {
    fontSize: Typography.size.title,
    lineHeight: Typography.lineHeight.title,
    fontWeight: 600,
  },
  link: {
    lineHeight: Typography.lineHeight.subtext,
    fontSize: Typography.size.subtext,
  },
  linkPrimary: {
    lineHeight: Typography.lineHeight.subtext,
    fontSize: Typography.size.subtext,
    color: '#3c87f7',
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: Typography.size.caption,
  },
});
