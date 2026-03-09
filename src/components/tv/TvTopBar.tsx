import React from 'react';
import { View, Text } from 'react-native';
import { Home, Tv, Film, MonitorPlay, Ghost, Trophy } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import TvFocusable from './TvFocusable';

interface TvTopBarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  forceFocus?: boolean;
}

const TABS = [
  { id: 'home', label: 'Inicio', Icon: Home },
  { id: 'sport', label: 'Deporte', Icon: Trophy },
  { id: 'tv', label: 'En Vivo', Icon: Tv },
  { id: 'movie', label: 'Películas', Icon: Film },
  { id: 'series', label: 'Series', Icon: MonitorPlay },
  { id: 'anime', label: 'Anime', Icon: Ghost },
];

export default function TvTopBar({ currentTab, setCurrentTab, forceFocus }: TvTopBarProps) {
  return (
    <LinearGradient
      colors={['rgba(5,5,5,0.98)', 'rgba(5,5,5,0.85)', 'transparent']}
      style={{ width: '100%', paddingTop: 16, paddingBottom: 20, zIndex: 50 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: 1200, alignSelf: 'center', marginTop: 4 }}>

        {/* LOGO */}
        <View style={{ marginRight: 48 }}>
          <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 4 }}>
            VORTEX<Text style={{ color: '#B026FF' }}>.</Text>
          </Text>
        </View>

        {/* MENÚ CENTRAL */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {TABS.map(tab => {
            const isActive = currentTab === tab.id;

            return (
              <TvFocusable
                key={tab.id}
                onPress={() => setCurrentTab(tab.id)}
                scaleTo={1.08}
                borderWidth={0}
                style={{ borderRadius: 12 }}
                focusedStyle={{ backgroundColor: 'transparent' }}
                hasTVPreferredFocus={forceFocus && isActive}
              >
                {(focused: boolean) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, position: 'relative' }}>
                    <Text style={{
                      fontWeight: focused || isActive ? '900' : '600',
                      fontSize: 16,
                      color: focused ? '#B026FF' : isActive ? '#fff' : '#9CA3AF',
                      textTransform: 'uppercase',
                      letterSpacing: 1.5,
                      textShadowColor: focused ? 'rgba(250, 204, 21, 0.5)' : isActive ? 'rgba(255, 255, 255, 0.3)' : 'transparent',
                      textShadowOffset: { width: 0, height: 0 },
                      textShadowRadius: focused ? 12 : 6
                    }}>
                      {tab.label}
                    </Text>
                    {isActive && !focused && (
                      <View style={{ position: 'absolute', bottom: -2, left: 16, right: 16, height: 3, backgroundColor: '#B026FF', borderRadius: 2 }} />
                    )}
                  </View>
                )}
              </TvFocusable>
            );
          })}
        </View>

      </View>
    </LinearGradient>
  );
}
