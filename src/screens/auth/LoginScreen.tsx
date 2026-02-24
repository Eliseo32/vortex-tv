import React, { useState } from 'react';
import { View, Text, TextInput, ActivityIndicator, Image, Dimensions } from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../config/firebase';
import TvFocusable from '../../components/tv/TvFocusable';

const { width, height } = Dimensions.get('window');

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Estados manuales de foco para los inputs
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Por favor, ingresa tu correo y contraseña.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // La navegación la maneja AppNavigator mediante onAuthStateChanged
    } catch (err: any) {
      setError('Credenciales incorrectas. Verifica tu usuario y contraseña.');
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-[#050505]">
      {/* Fondo de películas estilo Netflix */}
      <Image 
        source={{ uri: 'https://images.unsplash.com/photo-1574267432553-4b462808152f?q=80&w=2000&auto=format&fit=crop' }} 
        style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.2 }} 
      />
      <View className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/90 to-[#050505]/60" />

      <View className="flex-1 flex-row items-center px-24">
        {/* LOGO AREA */}
        <View className="flex-1">
          <Text className="text-white text-7xl font-black tracking-widest mb-6">
            VORTEX<Text className="text-vortex-yellow">.</Text>
          </Text>
          <Text className="text-gray-400 text-2xl font-medium leading-10 max-w-lg">
            Todo tu entretenimiento en un solo lugar. Inicia sesión para continuar.
          </Text>
        </View>

        {/* FORMULARIO */}
        <View className="w-[500px] bg-[#111] p-12 rounded-[32px] border border-white/10 shadow-2xl shadow-black">
          <Text className="text-white text-3xl font-black mb-10 text-center">Inicia Sesión</Text>
          
          {error ? <Text className="text-red-500 text-center mb-6 font-bold">{error}</Text> : null}

          {/* INPUT EMAIL */}
          <View 
            style={[
              { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, marginBottom: 24, borderWidth: 4, borderColor: 'transparent' },
              emailFocused && { borderColor: '#FACC15', backgroundColor: 'rgba(255,255,255,0.1)' }
            ]}
          >
            <TextInput
              focusable={true}
              placeholder="Correo Electrónico"
              placeholderTextColor="#6B7280"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              keyboardType="email-address"
              autoCapitalize="none"
              style={{ color: '#fff', fontSize: 20, fontWeight: '600', paddingHorizontal: 20, paddingVertical: 20 }}
            />
          </View>

          {/* INPUT CONTRASEÑA */}
          <View 
            style={[
              { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, marginBottom: 32, borderWidth: 4, borderColor: 'transparent' },
              passFocused && { borderColor: '#FACC15', backgroundColor: 'rgba(255,255,255,0.1)' }
            ]}
          >
            <TextInput
              focusable={true}
              placeholder="Contraseña"
              placeholderTextColor="#6B7280"
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPassFocused(true)}
              onBlur={() => setPassFocused(false)}
              secureTextEntry
              style={{ color: '#fff', fontSize: 20, fontWeight: '600', paddingHorizontal: 20, paddingVertical: 20 }}
            />
          </View>

          {/* BOTÓN LOGIN USANDO NUESTRO COMPONENTE */}
          <TvFocusable onPress={handleLogin} borderWidth={3} style={{ borderRadius: 12 }}>
            {(focused) => (
              <View className={`py-5 rounded-xl items-center justify-center ${focused ? 'bg-white' : 'bg-vortex-yellow'}`}>
                {loading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text className={`font-black text-xl tracking-widest uppercase text-black`}>Entrar</Text>
                )}
              </View>
            )}
          </TvFocusable>
        </View>
      </View>
    </View>
  );
}