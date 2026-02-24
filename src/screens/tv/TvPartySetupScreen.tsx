import React, { useState } from 'react';
import { View, Text, TextInput, Image, StyleSheet, Dimensions } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Users, Play, Sparkles, LogIn, X } from 'lucide-react-native';
import TvFocusable from '../../components/tv/TvFocusable';

const { width, height } = Dimensions.get('window');

export default function TvPartySetupScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { item, title, backdrop, selectedVideoUrl } = route.params;
  
  const videoUrlToUse = selectedVideoUrl || item?.videoUrl; 
  const [joinCode, setJoinCode] = useState('');
  const [generatedCode] = useState(() => "VRTX-" + Math.floor(1000 + Math.random() * 9000));
  const [inputFocused, setInputFocused] = useState(false);

  const createParty = () => {
    if (!videoUrlToUse) return;
    navigation.navigate('PartyPlayerTV', { videoUrl: videoUrlToUse, title: title || 'Vortex Party', roomCode: generatedCode });
  };

  const joinParty = () => {
    if (!videoUrlToUse || joinCode.length < 4) return;
    navigation.navigate('PartyPlayerTV', { videoUrl: videoUrlToUse, title: title || 'Vortex Party', roomCode: joinCode.toUpperCase() });
  };

  return (
    <View className="flex-1 bg-[#050505]">
      {/* FONDO CINEMÁTICO */}
      <View style={StyleSheet.absoluteFillObject}>
        {backdrop && <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFillObject} blurRadius={40} className="opacity-40" />}
        <View style={StyleSheet.absoluteFillObject} className="bg-black/80" />
      </View>

      <View className="flex-1 items-center justify-center px-24">
        
        {/* ENCABEZADO */}
        <View className="items-center mb-12">
          <View className="w-24 h-24 bg-purple-600/20 rounded-full items-center justify-center mb-6 border border-purple-500/30 shadow-lg shadow-purple-500/20">
            <Users color="#A855F7" size={48} />
          </View>
          <Text className="text-white text-6xl font-black mb-4 tracking-tighter">Vortex Party</Text>
          <Text className="text-gray-300 text-2xl font-medium text-center max-w-3xl">
            Comparte <Text className="text-white font-bold">"{title}"</Text> con tus amigos sincronizadamente.
          </Text>
        </View>

        <View className="flex-row w-full max-w-6xl justify-between">
          
          {/* LADO IZQUIERDO: ANFITRIÓN */}
          <View className="flex-1 bg-white/5 border border-white/10 p-12 rounded-[32px] mr-8 shadow-2xl shadow-black">
            <View className="flex-row items-center mb-8">
              <Sparkles color="#A855F7" size={32} />
              <Text className="text-white font-bold text-3xl ml-4 tracking-wide">Crear Sala</Text>
            </View>
            <View className="bg-black/50 border border-white/5 rounded-2xl p-8 mb-10 items-center">
              <Text className="text-gray-500 text-sm font-bold mb-2 uppercase tracking-widest">Tu Código Privado</Text>
              <Text style={{ letterSpacing: 8 }} className="text-vortex-yellow font-mono text-5xl">{generatedCode}</Text>
            </View>
            <TvFocusable onPress={createParty} scaleTo={1.05} borderWidth={4} style={{ borderRadius: 16 }}>
              {(focused) => (
                <View className={`py-6 rounded-xl flex-row justify-center items-center ${focused ? 'bg-white' : 'bg-purple-600'}`}>
                  <Play color={focused ? "#000" : "#fff"} size={28} fill={focused ? "#000" : "#fff"} />
                  <Text className={`font-black text-2xl ml-4 tracking-widest uppercase ${focused ? 'text-black' : 'text-white'}`}>Iniciar Sala</Text>
                </View>
              )}
            </TvFocusable>
          </View>

          {/* LADO DERECHO: UNIRSE */}
          <View className="flex-1 bg-white/5 border border-white/10 p-12 rounded-[32px] ml-8 shadow-2xl shadow-black">
            <View className="flex-row items-center mb-8">
              <LogIn color="#4ade80" size={32} />
              <Text className="text-white font-bold text-3xl ml-4 tracking-wide">Unirse a una Sala</Text>
            </View>
            <TextInput
              focusable={true}
              placeholder="VRTX-0000"
              placeholderTextColor="#4B5563"
              value={joinCode}
              onChangeText={setJoinCode}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              autoCapitalize="characters"
              style={{ letterSpacing: 8 }}
              className={`bg-black/50 text-white text-center font-mono text-4xl py-8 rounded-2xl border-4 mb-10 transition-colors
                ${inputFocused ? 'border-vortex-yellow bg-white/10' : 'border-white/5'}
              `}
            />
            <TvFocusable onPress={joinParty} scaleTo={1.05} borderWidth={4} style={{ borderRadius: 16 }}>
              {(focused) => {
                const canJoin = joinCode.length >= 4;
                return (
                  <View className={`py-6 rounded-xl flex-row justify-center items-center ${
                    focused && canJoin ? 'bg-vortex-yellow' : 
                    focused ? 'bg-white/20' : 
                    canJoin ? 'bg-[#222]' : 'bg-black/40'
                  }`}>
                    <Text className={`font-black text-2xl tracking-widest uppercase ${
                      focused && canJoin ? 'text-black' : 
                      canJoin ? 'text-vortex-yellow' : 'text-gray-600'
                    }`}>Conectar</Text>
                  </View>
                );
              }}
            </TvFocusable>
          </View>
        </View>

        {/* BOTÓN CANCELAR */}
        <View className="mt-12">
          <TvFocusable onPress={() => navigation.goBack()} borderWidth={3} style={{ borderRadius: 999 }}>
            {(focused) => (
              <View className={`flex-row items-center px-10 py-4 rounded-full ${focused ? 'bg-red-600' : 'bg-white/10'}`}>
                <X color={focused ? "#fff" : "#9CA3AF"} size={24} />
                <Text className={`font-bold text-xl uppercase ml-3 ${focused ? 'text-white' : 'text-gray-400'}`}>Cancelar</Text>
              </View>
            )}
          </TvFocusable>
        </View>

      </View>
    </View>
  );
}