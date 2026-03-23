import React, { useRef, useEffect, useState } from 'react';
import { Animated, Pressable, View, ViewStyle, StyleProp } from 'react-native';

interface TvFocusableProps {
  children: React.ReactNode | ((focused: boolean) => React.ReactNode);
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  focusedStyle?: StyleProp<ViewStyle>;
  scaleTo?: number;
  borderWidth?: number;
  onFocus?: () => void;
  onBlur?: () => void;
  nextFocusUp?: number;
  nextFocusDown?: number;
  nextFocusLeft?: number;
  nextFocusRight?: number;
  hasTVPreferredFocus?: boolean;
  autoFocus?: boolean;
}

const AnimatedFocusContent = ({ focused, pressed, children, style, focusedStyle, scaleTo, borderWidth }: any) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: pressed ? 0.96 : (focused ? scaleTo : 1),
      friction: 6,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [focused, pressed]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], zIndex: focused ? 50 : 1 }}>
      <View
        style={[
          style,
          {
            borderWidth,
            borderColor: focused ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0)',
            borderRadius: style?.borderRadius || 12,
          },
          focused && focusedStyle,
          focused && {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 20 },
            shadowOpacity: 0.8,
            shadowRadius: 30,
            elevation: 20,
            backgroundColor: '#111',
          }
        ]}
      >
        {typeof children === 'function' ? children(focused) : children}
      </View>
    </Animated.View>
  );
};

export default function TvFocusable({ children, onPress, style, focusedStyle, scaleTo = 1.08, borderWidth = 4, onFocus, onBlur, nextFocusUp, nextFocusDown, nextFocusLeft, nextFocusRight, hasTVPreferredFocus, autoFocus }: TvFocusableProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  useEffect(() => {
    if (autoFocus && hasTVPreferredFocus) {
      // Auto-focus handled naturally by native engine setting nextFocuses or hasTVPreferredFocus
    }
  }, [autoFocus, hasTVPreferredFocus]);

  return (
    <Pressable
      {...({
        focusable: true,
        nextFocusUp,
        nextFocusDown,
        nextFocusLeft,
        nextFocusRight,
        hasTVPreferredFocus,
      } as any)}
      onPress={onPress}
      onFocus={() => {
        setIsFocused(true);
        if (onFocus) onFocus(); // <- CRUCIAL: Avisamos al componente padre
      }}
      onBlur={() => {
        setIsFocused(false);
        if (onBlur) onBlur();
      }}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
    >
      <AnimatedFocusContent
        focused={isFocused}
        pressed={isPressed}
        style={style}
        focusedStyle={focusedStyle}
        scaleTo={scaleTo}
        borderWidth={borderWidth}
      >
        {children}
      </AnimatedFocusContent>
    </Pressable>
  );
}