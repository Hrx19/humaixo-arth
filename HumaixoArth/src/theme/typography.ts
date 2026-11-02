import { StyleSheet } from 'react-native';

export const Typography = {
  size: {
    caption: 12,
    subtext: 14,
    body: 16,
    bodyLarge: 18,
    heading: 24,
    title: 30,
    display: 36,
  },
  lineHeight: {
    caption: 16,
    subtext: 20,
    body: 24,
    bodyLarge: 26,
    heading: 32,
    title: 38,
    display: 44,
  },
} as const;

export const typographyStyles = StyleSheet.create({
  caption: { fontSize: Typography.size.caption, lineHeight: Typography.lineHeight.caption },
  subtext: { fontSize: Typography.size.subtext, lineHeight: Typography.lineHeight.subtext },
  body: { fontSize: Typography.size.body, lineHeight: Typography.lineHeight.body },
  bodyLarge: { fontSize: Typography.size.bodyLarge, lineHeight: Typography.lineHeight.bodyLarge },
  heading: { fontSize: Typography.size.heading, lineHeight: Typography.lineHeight.heading },
  title: { fontSize: Typography.size.title, lineHeight: Typography.lineHeight.title },
  display: { fontSize: Typography.size.display, lineHeight: Typography.lineHeight.display },
});
