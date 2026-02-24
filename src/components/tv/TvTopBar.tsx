import React from 'react';
import { View, Text } from 'react-native';
import { Home, Tv, Film, MonitorPlay, Ghost, Trophy } from 'lucide-react-native';
import TvFocusable from './TvFocusable';

interface TvTopBarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

const TABS = [
  { id: 'home', label: 'Inicio', Icon: Home },
  { id: 'sport', label: 'Deporte', Icon: Trophy },
  { id: 'tv', label: 'En Vivo', Icon: Tv },
  { id: 'movie', label: 'Películas', Icon: Film },
  { id: 'series', label: 'Series', Icon: MonitorPlay },
  { id: 'anime', label: 'Anime', Icon: Ghost },
];

export default function TvTopBar({ currentTab, setCurrentTab }: TvTopBarProps) {
  return (
    <View className="w-full pt-8 pb-4 items-center justify-center bg-gradient-to-b from-black/98 to-transparent absolute top-0 z-50">
      <View className="flex-row items-center justify-center w-full max-w-[1200px] mt-2">

        {/* LOGO */}
        <View className="mr-12">
          <Text className="text-white text-3xl font-black tracking-widest drop-shadow-lg">
            VORTEX<Text className="text-vortex-yellow">.</Text>
          </Text>
        </View>

        {/* MENÚ CENTRAL */}
        <View className="flex-row items-center space-x-2">
          {TABS.map(tab => {
            const isActive = currentTab === tab.id;
            const Icon = tab.Icon;

            return (
              <TvFocusable
                key={tab.id}
                onPress={() => setCurrentTab(tab.id)}
                scaleTo={1.1}
                borderWidth={0}
                style={{ borderRadius: 12 }}
                focusedStyle={{ backgroundColor: 'transparent' }}
              >
                {(focused: boolean) => (
                  <View className="flex-row items-center px-4 py-2">
                    <Text style={{
                      fontWeight: focused || isActive ? '900' : '600',
                      fontSize: 18,
                      color: focused ? '#FACC15' : isActive ? '#fff' : '#9CA3AF',
                      textTransform: 'uppercase',
                      letterSpacing: 1.5,
                      textShadowColor: focused ? 'rgba(250, 204, 21, 0.5)' : isActive ? 'rgba(255, 255, 255, 0.3)' : 'transparent',
                      textShadowOffset: { width: 0, height: 0 },
                      textShadowRadius: focused ? 12 : 6
                    }}>
                      {tab.label}
                    </Text>
                    {isActive && !focused && (
                      <View className="absolute -bottom-1 left-4 right-4 h-[3px] bg-white rounded-full" />
                    )}
                  </View>
                )}
              </TvFocusable>
            );
          })}
        </View>

      </View>
    </View>
  );
}