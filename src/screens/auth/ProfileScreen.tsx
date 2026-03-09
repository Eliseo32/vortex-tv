import React, { useEffect, useRef } from 'react';
import { View, Text, FlatList, Image, Animated, StyleSheet, Dimensions } from 'react-native';
import { useAppStore } from '../../store/useAppStore';
import TvFocusable from '../../components/tv/TvFocusable';

const { width, height } = Dimensions.get('window');

export default function ProfileScreen() {
  const { userId, profiles, loadProfiles, setProfile } = useAppStore();
  const bgFadeAnim = useRef(new Animated.Value(0)).current;

  // Calculamos tamaños dinámicos relativos a la altura de la TV
  const AVATAR_SIZE = height * 0.28;
  const AVATAR_FOCUSED_SCALE = 1.15;

  useEffect(() => {
    if (userId) {
      loadProfiles(userId);
    }
  }, [userId]);

  useEffect(() => {
    Animated.timing(bgFadeAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={{ flex: 1, backgroundColor: '#000000', opacity: bgFadeAnim, alignItems: 'center', justifyContent: 'center' }}>

      {/* GLOW DE FONDO (Pure CSS, OLED Black) */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <View style={{ position: 'absolute', top: -height * 0.3, left: -width * 0.1, width: width * 0.5, height: width * 0.5, backgroundColor: 'rgba(176,38,255,0.06)', borderRadius: 9999, filter: 'blur(200px)' as any }} />
        <View style={{ position: 'absolute', bottom: -height * 0.3, right: -width * 0.1, width: width * 0.5, height: width * 0.5, backgroundColor: 'rgba(176,38,255,0.06)', borderRadius: 9999, filter: 'blur(200px)' as any }} />
      </View>

      {/* LOGO SUPERIOR CENTRADO DISTANTE */}
      <View style={{ position: 'absolute', top: height * 0.08, left: 0, right: 0, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: Math.min(42, height * 0.06), fontWeight: '900', letterSpacing: 4 }}>
          VORTEX<Text style={{ color: '#B026FF' }}>.</Text>
        </Text>
      </View>

      {/* TITULO */}
      <Text style={{
        color: '#fff', fontSize: Math.min(64, height * 0.08), fontWeight: '800', letterSpacing: 1, marginBottom: height * 0.1,
        textShadowColor: 'rgba(176,38,255,0.2)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 20
      }}>
        ¿Quién está viendo?
      </Text>

      {/* LISTA DE PERFILES HORIZONTAL */}
      <View style={{ height: height * 0.45, justifyContent: 'center' }}>
        <FlatList
          data={profiles}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ alignItems: 'center', paddingHorizontal: width * 0.1 }}
          renderItem={({ item }) => {
            const avatarSource = item.avatar && item.avatar.trim() !== ''
              ? { uri: item.avatar }
              : { uri: `https://api.dicebear.com/7.x/notionists/png?seed=${item.name}&backgroundColor=${(item.color || 'B026FF').replace('#', '')}` };

            return (
              <View style={{ marginHorizontal: width * 0.03, alignItems: 'center' }}>
                <TvFocusable
                  onPress={() => setProfile(item)}
                  scaleTo={AVATAR_FOCUSED_SCALE}
                  borderWidth={0}
                  style={{ borderRadius: AVATAR_SIZE / 2, alignItems: 'center', justifyContent: 'center' }}
                  focusedStyle={{ backgroundColor: 'transparent' }}
                >
                  {(focused) => (
                    <View style={{ alignItems: 'center' }}>

                      {/* AVATAR CIRCULAR */}
                      <View style={[
                        {
                          width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, overflow: 'hidden',
                          backgroundColor: '#111',
                          borderWidth: focused ? 6 : 0,
                          borderColor: focused ? '#B026FF' : 'transparent', // Sin elevación, puro borde grueso de neón
                        },
                        !focused && { opacity: 0.5 } // Atenuar los avatares no enfocados dramáticamente
                      ]}>
                        <Image
                          source={avatarSource}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                        {/* Borde interior HD */}
                        <View style={{ position: 'absolute', inset: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: AVATAR_SIZE / 2 }} pointerEvents="none" />
                      </View>

                      {/* NOMBRE DEL PERFIL */}
                      <Text style={{
                        color: focused ? '#ffffff' : '#555555',
                        fontSize: Math.min(32, height * 0.04),
                        fontWeight: focused ? '800' : '600',
                        marginTop: height * 0.04,
                        letterSpacing: 1,
                        textShadowColor: focused ? 'rgba(176,38,255,1)' : 'transparent',
                        textShadowOffset: { width: 0, height: 0 },
                        textShadowRadius: focused ? 25 : 0,
                      }}>
                        {item.name}
                      </Text>
                    </View>
                  )}
                </TvFocusable>
              </View>
            );
          }}
        />
      </View>
    </Animated.View>
  );
}