import React, { useMemo } from 'react';
import { View, Text, FlatList } from 'react-native';
import { useAppStore } from '../../store/useAppStore';
import TvMovieCard from '../../components/tv/TvMovieCard';
import TvFocusable from '../../components/tv/TvFocusable';
import { useNavigation } from '@react-navigation/native';
import { Star, PlusCircle } from 'lucide-react-native';

export default function TvMyListScreen() {
  const { cloudContent, myList } = useAppStore();
  const navigation = useNavigation<any>();

  const savedItems = useMemo(() => {
    return cloudContent.filter(item => myList.includes(item.id));
  }, [cloudContent, myList]);

  return (
    <View className="flex-1 bg-[#050505] pt-32 px-16">
      
      <View className="flex-row items-center justify-between mb-8 px-4">
        <View>
          <Text className="text-white text-4xl font-black tracking-widest drop-shadow-md">
            MI LISTA
          </Text>
          <Text className="text-gray-400 font-medium text-lg mt-2">
            Tu colección personal de títulos guardados.
          </Text>
        </View>

        {savedItems.length > 0 && (
          <View className="bg-white/10 px-5 py-2.5 rounded-full border border-white/5 flex-row items-center">
            <Text className="text-gray-300 font-bold uppercase tracking-widest text-sm mr-3">Títulos Guardados</Text>
            <Text className="text-vortex-yellow font-black text-xl">{savedItems.length}</Text>
          </View>
        )}
      </View>
      
      {savedItems.length === 0 ? (
        <View className="flex-1 items-center justify-center pb-32">
          
          <View className="w-40 h-40 bg-white/5 rounded-full items-center justify-center mb-8 border border-white/10 shadow-xl shadow-black">
            <View className="w-32 h-32 bg-vortex-yellow/10 rounded-full items-center justify-center border border-vortex-yellow/20">
              <Star color="#FACC15" size={64} strokeWidth={1.5} />
            </View>
          </View>
          
          <Text className="text-white text-4xl font-black mb-4 tracking-tighter text-center">
            Tu lista está vacía
          </Text>
          <Text className="text-gray-400 text-center text-xl leading-8 max-w-2xl mb-12">
            Aún no has guardado ninguna película o serie. Explora el catálogo y añade tus favoritos.
          </Text>

          {/* Botón informativo premium */}
          <TvFocusable onPress={() => navigation.navigate('MainTV')} borderWidth={3} style={{ borderRadius: 16 }}>
            {(focused) => (
              <View className={`flex-row items-center justify-center px-10 py-5 rounded-2xl ${focused ? 'bg-vortex-yellow' : 'bg-[#111]'}`}>
                <PlusCircle color={focused ? "#000" : "#fff"} size={28} />
                <Text className={`font-black text-xl ml-4 tracking-widest uppercase ${focused ? 'text-black' : 'text-white'}`}>
                  Ir a Explorar
                </Text>
              </View>
            )}
          </TvFocusable>

        </View>
      ) : (
        <FlatList
          data={savedItems}
          keyExtractor={(item) => item.id}
          numColumns={6}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
          renderItem={({ item }) => <TvMovieCard item={item} onPress={() => navigation.navigate('DetailTV', { item })} />}
        />
      )}
    </View>
  );
}