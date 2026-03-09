import React, { useState } from 'react';
import { View, Text, TextInput, ActivityIndicator, Dimensions, StyleSheet } from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../config/firebase';
import TvFocusable from '../../components/tv/TvFocusable';

const { width, height } = Dimensions.get('window');

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Ingresa tu correo y contraseña.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError('Credenciales incorrectas.');
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' }}>

      {/* GLOW DE FONDO (Pure CSS) */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <View style={{ position: 'absolute', top: -height * 0.4, left: -width * 0.2, width: width * 0.8, height: width * 0.8, backgroundColor: 'rgba(176,38,255,0.07)', borderRadius: 9999, transform: [{ scale: 2 }], filter: 'blur(200px)' as any }} />
        <View style={{ position: 'absolute', bottom: -height * 0.4, right: -width * 0.2, width: width * 0.8, height: width * 0.8, backgroundColor: 'rgba(176,38,255,0.05)', borderRadius: 9999, transform: [{ scale: 2 }], filter: 'blur(200px)' as any }} />
      </View>

      {/* CONTENEDOR PRINCIPAL CENTRADO */}
      <View style={{ width: Math.min(600, width * 0.6), alignItems: 'center', zIndex: 10 }}>

        {/* BRANDING LOGO */}
        <View style={{ alignItems: 'center', marginBottom: height * 0.05 }}>
          <Text style={{ color: '#ffffff', fontSize: Math.min(56, height * 0.08), fontWeight: '900', letterSpacing: 8 }}>
            VORTEX<Text style={{ color: '#B026FF' }}>.</Text>
          </Text>
          <Text style={{ color: '#888888', fontSize: Math.min(18, height * 0.03), fontWeight: '500', marginTop: 5, letterSpacing: 1 }}>
            Ultra Premium Streaming
          </Text>
        </View>

        {error ? (
          <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', borderWidth: 1, padding: 16, borderRadius: 12, marginBottom: 20, width: '100%' }}>
            <Text style={{ color: '#ef4444', textAlign: 'center', fontSize: 18, fontWeight: '600' }}>{error}</Text>
          </View>
        ) : null}

        {/* INPUT EMAIL */}
        <View style={{ width: '100%', marginBottom: height * 0.03 }}>
          <View style={[
            { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderWidth: 4, borderColor: 'transparent', width: '100%', overflow: 'hidden' },
            emailFocused && {
              borderColor: '#B026FF', backgroundColor: 'rgba(176,38,255,0.15)'
            }
          ]}>
            <TextInput
              focusable={true}
              placeholder="Correo electrónico"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              keyboardType="email-address"
              autoCapitalize="none"
              style={{ color: '#fff', fontSize: Math.min(24, height * 0.035), paddingHorizontal: 32, paddingVertical: Math.min(26, height * 0.03), fontWeight: '500', textAlign: 'center' }}
            />
          </View>
        </View>

        {/* INPUT PASS */}
        <View style={{ width: '100%', marginBottom: height * 0.05 }}>
          <View style={[
            { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderWidth: 4, borderColor: 'transparent', width: '100%', overflow: 'hidden' },
            passFocused && {
              borderColor: '#B026FF', backgroundColor: 'rgba(176,38,255,0.15)'
            }
          ]}>
            <TextInput
              focusable={true}
              placeholder="Contraseña"
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPassFocused(true)}
              onBlur={() => setPassFocused(false)}
              secureTextEntry
              style={{ color: '#fff', fontSize: Math.min(24, height * 0.035), paddingHorizontal: 32, paddingVertical: Math.min(26, height * 0.03), fontWeight: '500', textAlign: 'center' }}
            />
          </View>
        </View>

        {/* BOTÓN INICIAR */}
        <View style={{ width: '100%' }}>
          <TvFocusable onPress={handleLogin} borderWidth={0} scaleTo={1.05} style={{ borderRadius: 16 }}>
            {(focused) => (
              <View style={[{
                paddingVertical: Math.min(24, height * 0.035), borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                backgroundColor: focused ? '#ffffff' : '#B026FF',
              }, focused && {
                shadowColor: '#B026FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 40, elevation: 25,
              }]}>
                {loading ? (
                  <ActivityIndicator color={focused ? '#000' : '#fff'} size="large" />
                ) : (
                  <Text style={{ color: focused ? '#000' : '#fff', fontSize: Math.min(24, height * 0.035), fontWeight: '900', letterSpacing: 3, textTransform: 'uppercase' }}>
                    Iniciar Sesión
                  </Text>
                )}
              </View>
            )}
          </TvFocusable>
        </View>

      </View>
    </View>
  );
}