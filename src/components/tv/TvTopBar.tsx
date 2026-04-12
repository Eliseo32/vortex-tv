import React, { useRef, useEffect } from 'react';
import { View, Text, Animated } from 'react-native';
import { Image } from 'expo-image';
import { Home, Compass, Bookmark, Search, Radio } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import TvFocusable from './TvFocusable';

interface TvTopBarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  forceFocus?: boolean;
}

const TABS = [
  { id: 'home', label: 'Inicio', Icon: Home },
  { id: 'discover', label: 'Descubrir', Icon: Compass },
  { id: 'mylist', label: 'Mi Lista', Icon: Bookmark },
  { id: 'search', label: 'Buscar', Icon: Search },
];

import { useAppStore } from '../../store/useAppStore';

export default function TvTopBar({ currentTab, setCurrentTab, forceFocus }: TvTopBarProps) {
  // Dot pulsante para el tab "En Vivo"
  const pulsAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const pulse = () =>
      Animated.sequence([
        Animated.timing(pulsAnim, { toValue: 0.2, duration: 800, useNativeDriver: true }),
        Animated.timing(pulsAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]).start(() => pulse());
    pulse();
  }, []);
  const { currentProfile } = useAppStore();
  const avatarUrl = currentProfile?.avatar && currentProfile.avatar.trim() !== ''
    ? currentProfile.avatar
    : `https://api.dicebear.com/7.x/notionists/png?seed=${currentProfile?.name || 'Vortex'}&backgroundColor=${(currentProfile?.color || 'B026FF').replace('#', '')}`;

  return (
    <View
      style={{ width: '100%', paddingTop: 24, paddingBottom: 24, zIndex: 100, backgroundColor: '#050505', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 64 }}>
        
        {/* LOGO */}
        <View style={{ marginRight: 32 }}>
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: 4 }}>
            VORTEX<Text style={{ color: '#BF40BF' }}>.</Text>
          </Text>
        </View>

        {/* MENÚ CENTRAL */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {TABS.map(tab => {
            const isActive = currentTab === tab.id;
            const isLive = (tab as any).isLive;
            const accentColor = isLive ? '#ef4444' : '#BF40BF';

            return (
              <TvFocusable
                key={tab.id}
                onPress={() => setCurrentTab(tab.id)}
                scaleTo={1.05}
                borderWidth={0}
                style={{ borderRadius: 12 }}
                hasTVPreferredFocus={forceFocus && isActive}
              >
                {(focused: boolean) => (
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                    backgroundColor: focused
                      ? (isLive ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.1)')
                      : 'transparent',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: focused
                      ? (isLive ? 'rgba(239,68,68,0.5)' : 'rgba(191,64,191,0.5)')
                      : 'transparent',
                  }}>
                    {/* Dot pulsante para En Vivo */}
                    {isLive && (
                      <Animated.View style={{
                        width: 7, height: 7, borderRadius: 4,
                        backgroundColor: '#ef4444',
                        marginRight: 6,
                        opacity: pulsAnim,
                      }} />
                    )}
                    <tab.Icon
                      size={18}
                      color={focused || isActive ? '#fff' : (isLive ? '#ef4444' : '#8B949E')}
                      style={{ marginRight: 8 }}
                    />
                    <Text style={{
                      fontWeight: focused || isActive ? '800' : '600',
                      fontSize: 15,
                      color: focused || isActive ? '#fff' : (isLive ? '#ef4444' : '#8B949E'),
                      textTransform: 'uppercase',
                      letterSpacing: 1.2,
                    }}>
                      {tab.label}
                    </Text>
                    {/* Indicador activo */}
                    {isActive && !focused && (
                      <View style={{
                        position: 'absolute', bottom: -6, left: 24, right: 24,
                        height: 3, backgroundColor: accentColor, borderRadius: 2,
                        shadowColor: accentColor, shadowOpacity: 0.8, shadowRadius: 8, elevation: 5,
                      }} />
                    )}
                  </View>
                )}
              </TvFocusable>
            );
          })}
        </View>

        {/* PERFIL */}
        <View style={{ marginLeft: 'auto' }}>
          <TvFocusable
            onPress={() => setCurrentTab('profile')}
            scaleTo={1.1}
            borderWidth={0}
            style={{ borderRadius: 24 }}
            hasTVPreferredFocus={forceFocus && currentTab === 'profile'}
          >
            {(focused: boolean) => (
              <View style={{
                width: 44, height: 44, borderRadius: 22,
                backgroundColor: 'rgba(255,255,255,0.05)',
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: focused ? '#BF40BF' : 'rgba(255,255,255,0.1)',
                shadowColor: focused ? '#BF40BF' : 'transparent',
                shadowOpacity: focused ? 0.8 : 0,
                shadowRadius: 10,
                elevation: focused ? 8 : 0,
              }}>
                <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: 22 }} contentFit="cover" transition={200} />
              </View>
            )}
          </TvFocusable>
        </View>

      </View>
    </View>
  );
}
