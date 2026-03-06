import React, { useEffect, useRef } from 'react';
import { View, Text, FlatList, Image, Animated, StyleSheet } from 'react-native';
import { useAppStore } from '../../store/useAppStore';
import TvFocusable from '../../components/tv/TvFocusable';

export default function ProfileScreen() {
  const { userId, profiles, loadProfiles, setProfile } = useAppStore();
  const bgFadeAnim = useRef(new Animated.Value(0)).current;

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
    <Animated.View style={{ flex: 1, backgroundColor: '#050505', opacity: bgFadeAnim, alignItems: 'center', justifyContent: 'center' }}>

      {/* Fondo Premium Oscuro Neumórfico */}
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: '#050505' }}>
        <View style={{ position: 'absolute', top: '-30%', left: '-20%', width: '70%', height: '70%', backgroundColor: 'rgba(59, 130, 246, 0.04)', borderRadius: 999, filter: 'blur(120px)' as any }} />
        <View style={{ position: 'absolute', bottom: '-30%', right: '-20%', width: '70%', height: '70%', backgroundColor: 'rgba(250, 204, 21, 0.03)', borderRadius: 999, filter: 'blur(120px)' as any }} />
      </View>

      <View style={{ position: 'absolute', top: 60, alignItems: 'center' }}>
        <Text style={{ color: '#FACC15', fontSize: 20, fontWeight: '900', letterSpacing: 6, opacity: 0.8 }}>VORTEX TV</Text>
      </View>

      <Text style={{
        color: '#fff', fontSize: 48, fontWeight: '800', letterSpacing: 1, marginBottom: 80,
        textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 10
      }}>
        ¿Quién está viendo hoy?
      </Text>

      <FlatList
        data={profiles}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}
        renderItem={({ item }) => {
          // Si no tiene avatar local, usa un placeholder premium
          const avatarSource = item.avatar && item.avatar.trim() !== ''
            ? { uri: item.avatar }
            : { uri: `https://api.dicebear.com/7.x/notionists/png?seed=${item.name}&backgroundColor=${(item.color || 'FACC15').replace('#', '')}` };

          return (
            <View style={{ marginHorizontal: 28, alignItems: 'center' }}>
              <TvFocusable
                onPress={() => setProfile(item)}
                scaleTo={1.12}
                borderWidth={0}
                style={{ borderRadius: 90, alignItems: 'center' }}
                focusedStyle={{ backgroundColor: 'transparent' }}
              >
                {(focused) => (
                  <View style={{ alignItems: 'center' }}>
                    <View style={{
                      width: 180, height: 180, borderRadius: 90, overflow: 'hidden',
                      backgroundColor: '#111',
                      borderWidth: focused ? 6 : 0,
                      borderColor: focused ? (item.color || '#FACC15') : 'transparent',
                      shadowColor: focused ? (item.color || '#FACC15') : '#000',
                      shadowOffset: { width: 0, height: focused ? 0 : 20 },
                      shadowOpacity: focused ? 0.8 : 0.6,
                      shadowRadius: focused ? 25 : 20,
                      elevation: 15,
                    }}>
                      <Image
                        source={avatarSource}
                        style={{ width: '100%', height: '100%', opacity: focused ? 1 : 0.5 }}
                        resizeMode="cover"
                      />

                      {/* Borde sutil oscuro interno para el círculo */}
                      <View style={{ position: 'absolute', inset: 0, borderWidth: 2, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 90 }} pointerEvents="none" />
                    </View>

                    <Text style={{
                      color: focused ? '#ffffff' : '#a1a1aa',
                      fontSize: 24, fontWeight: '700', marginTop: 30, letterSpacing: 0.5,
                      textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 10
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
    </Animated.View>
  );
}