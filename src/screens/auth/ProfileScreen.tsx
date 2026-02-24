import React, { useEffect } from 'react';
import { View, Text, FlatList, Image } from 'react-native';
import { useAppStore } from '../../store/useAppStore';
import TvFocusable from '../../components/tv/TvFocusable';

export default function ProfileScreen() {
  const { userId, profiles, loadProfiles, setProfile } = useAppStore();

  useEffect(() => {
    if (userId) {
      loadProfiles(userId);
    }
  }, [userId]);

  return (
    <View className="flex-1 bg-[#050505] items-center justify-center">
      <Text className="text-white text-5xl font-black tracking-widest mb-16 shadow-black drop-shadow-lg">
        ¿Quién está viendo?
      </Text>

      <FlatList
        data={profiles}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: 'center', justifyContent: 'center' }}
        renderItem={({ item }) => (
          <View className="mx-8 items-center">
            <TvFocusable 
              onPress={() => setProfile(item)} 
              scaleTo={1.15} 
              borderWidth={6} 
              style={{ borderRadius: 32 }}
              focusedStyle={{ borderColor: item.color || '#fff' }}
            >
              {(focused) => (
                <View style={{ width: 160, height: 160, borderRadius: 26, overflow: 'hidden', backgroundColor: '#111' }}>
                  <Image 
                    source={{ uri: item.avatar }} 
                    style={{ width: '100%', height: '100%', opacity: focused ? 1 : 0.7 }} 
                    resizeMode="cover"
                  />
                </View>
              )}
            </TvFocusable>
            <Text className="text-white text-2xl font-bold mt-6 tracking-wide">{item.name}</Text>
          </View>
        )}
      />
    </View>
  );
}