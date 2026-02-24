import React, { useRef, useEffect, useState } from 'react';
import { Animated, Pressable, ViewStyle, StyleProp } from 'react-native';

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
}

const AnimatedFocusContent = ({ focused, pressed, children, style, focusedStyle, scaleTo, borderWidth }: any) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: pressed ? 0.96 : (focused ? scaleTo : 1),
        friction: 6, // Más suave, estilo Apple TV
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(glowAnim, {
        toValue: focused ? 1 : 0,
        duration: 200, // Transición de color elegante
        useNativeDriver: false,
      })
    ]).start();
  }, [focused, pressed]);

  // Borde transparente que pasa a un Blanco Puro Brillante
  const borderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 1)']
  });

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], zIndex: focused ? 50 : 1 }}>
      <Animated.View
        style={[
          style,
          { borderWidth, borderColor, borderRadius: style?.borderRadius || 12 },
          focused && focusedStyle,
          focused && {
            shadowColor: '#000', // Sombra doble: Oscura base
            shadowOffset: { width: 0, height: 20 },
            shadowOpacity: 0.8,
            shadowRadius: 30,
            elevation: 20,
            backgroundColor: '#111', // Evita transparencias raras
          }
        ]}
      >
        {typeof children === 'function' ? children(focused) : children}

        {/* Capa de resplandor interior sutil amarilla */}
        {focused && (
          <Animated.View
            style={{
              position: 'absolute', inset: 0,
              borderWidth: 2, borderColor: 'rgba(250, 204, 21, 0.4)', // Vortex Yellow
              borderRadius: (style?.borderRadius || 12) - 3,
              opacity: glowAnim
            }}
            pointerEvents="none"
          />
        )}
      </Animated.View>
    </Animated.View>
  );
};

export default function TvFocusable({ children, onPress, style, focusedStyle, scaleTo = 1.08, borderWidth = 4, onFocus, onBlur, nextFocusUp, nextFocusDown, nextFocusLeft, nextFocusRight }: TvFocusableProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  return (
    <Pressable
      {...({
        focusable: true,
        nextFocusUp,
        nextFocusDown,
        nextFocusLeft,
        nextFocusRight,
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