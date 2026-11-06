import React, { useState, type ComponentProps } from 'react';
import { Pressable, type PressableStateCallbackType } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ScalePressableProps = ComponentProps<typeof Pressable>;

export function ScalePressable({
  style,
  onPressIn,
  onPressOut,
  disabled,
  ...props
}: ScalePressableProps): React.JSX.Element {
  const [pressed, setPressed] = useState(false);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(pressed ? 0.97 : 1, { damping: 16, stiffness: 320 }) }],
  }));

  const pressableStyle = typeof style === 'function'
    ? (state: PressableStateCallbackType) => [style(state), animatedStyle]
    : [style, animatedStyle];

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      style={pressableStyle}
      onPressIn={(event) => {
        if (!disabled) setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
    />
  );
}
