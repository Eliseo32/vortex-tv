import React from 'react';
import { View, Text, FlatList, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Clock, Play } from 'lucide-react-native';
import { useAppStore } from '../../store/useAppStore';
import TvFocusable from '../../components/tv/TvFocusable';

const HistoryTvCard = ({ historyItem, onPress }: any) => {
  const { item: movie, season, episode } = historyItem;
  const isSeries = movie.type === 'series' || movie.type === 'anime';

  return (
    <View style={{ width: '48%', margin: '1%' }}>
      <TvFocusable onPress={onPress} borderWidth={4} style={{ borderRadius: 16 }}>
        {(focused) => (
          <View className={`flex-row rounded-xl p-4 items-center ${focused ? 'bg-white/10' : 'bg-white/5'}`}>
            <View className="w-24 h-36 rounded-lg overflow-hidden relative border border-white/10">
              <Image source={{ uri: movie.poster }} className="w-full h-full" resizeMode="cover" />
              {focused && (
                <View className="absolute inset-0 bg-black/50 items-center justify-center">
                  <View className="w-12 h-12 bg-vortex-yellow rounded-full items-center justify-center shadow-lg shadow-black">
                    <Play color="#000" size={24} fill="#000" style={{ marginLeft: 3 }} />
                  </View>
                </View>
              )}
            </View>

            <View className="flex-1 ml-6 justify-center">
              <Text className={`text-[10px] font-bold tracking-widest uppercase mb-2 ${focused ? 'text-vortex-yellow' : 'text-gray-400'}`}>
                {isSeries ? 'Visto Recientemente' : 'Película'}
              </Text>
              <Text className="text-white font-black text-2xl mb-2 leading-tight" numberOfLines={2}>
                {movie.title}
              </Text>
              
              {isSeries ? (
                <View className={`${focused ? 'bg-vortex-yellow/20' : 'bg-white/10'} self-start px-3 py-1.5 rounded mb-2`}>
                  <Text className={`${focused ? 'text-vortex-yellow' : 'text-gray-300'} font-bold text-sm`}>
                    Temporada {season} • Episodio {episode}
                  </Text>
                </View>
              ) : (
                <Text className="text-gray-400 text-sm mb-2">{movie.year} • {movie.genre}</Text>
              )}
            </View>
          </View>
        )}
      </TvFocusable>
    </View>
  );
};

export default function TvHistoryScreen() {
  const navigation = useNavigation<any>();
  const watchHistory = useAppStore((state) => state.watchHistory);

  return (
    <View className="flex-1 bg-[#050505] pt-32 px-16">
      <View className="mb-8 px-2">
        <Text className="text-white text-4xl font-black tracking-widest drop-shadow-md">HISTORIAL</Text>
      </View>

      {watchHistory.length === 0 ? (
        <View className="flex-1 items-center justify-center pb-32">
          <Clock color="#222" size={100} className="mb-6" />
          <Text className="text-white text-3xl font-black mb-2 text-center">Historial vacío</Text>
          <Text className="text-gray-500 text-xl font-medium text-center max-w-lg mt-2">
            Todo lo que reproduzcas aparecerá aquí para que puedas retomarlo rápidamente.
          </Text>
        </View>
      ) : (
        <FlatList
          data={watchHistory}
          keyExtractor={(item, index) => `${item.item.id}-${item.season}-${item.episode}-${index}`}
          numColumns={2}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
          renderItem={({ item }) => (
            <HistoryTvCard historyItem={item} onPress={() => navigation.navigate('DetailTV', { item: item.item, season: item.season, episode: item.episode })} />
          )}
        />
      )}
    </View>
  );
}