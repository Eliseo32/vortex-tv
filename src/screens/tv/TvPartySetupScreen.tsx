import React, { useState } from 'react';
import { View, Text, TextInput, Image, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Users, Play, Sparkles, LogIn, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import TvFocusable from '../../components/tv/TvFocusable';
import { db } from '../../config/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { useAppStore } from '../../store/useAppStore';

const { width, height } = Dimensions.get('window');

export default function TvPartySetupScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { currentProfile, userId } = useAppStore();
  const { item, title, backdrop, selectedVideoUrl } = route.params ?? {};

  const videoUrlToUse = selectedVideoUrl || item?.videoUrl || '';
  const [joinCode, setJoinCode] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [generatedCode] = useState(() => 'VRTX-' + Math.floor(1000 + Math.random() * 9000));

  // ─── Crear sala en Firestore ─────────────────────────────────────────────────
  const createParty = async () => {
    if (!videoUrlToUse || isCreating) return;
    setIsCreating(true);
    try {
      await setDoc(doc(db, 'parties', generatedCode), {
        hostId: userId || 'anon',
        hostName: currentProfile?.name || 'Host',
        videoUrl: videoUrlToUse,
        title: title || 'Vortex Party',
        isPlaying: true,
        currentTime: 0,
        updatedAt: Date.now(),
        createdAt: Date.now(),
      });
      navigation.navigate('PartyPlayerTV', {
        videoUrl: videoUrlToUse,
        title: title || 'Vortex Party',
        roomCode: generatedCode,
        isHost: true,
      });
    } catch (e) {
      console.error('Error creando sala Party:', e);
    } finally {
      setIsCreating(false);
    }
  };

  // ─── Unirse a una sala existente ─────────────────────────────────────────────
  const joinParty = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4 || isJoining) return;
    setIsJoining(true);
    try {
      const partySnap = await getDoc(doc(db, 'parties', code));
      if (!partySnap.exists()) {
        // Sala no encontrada - igual intentamos entrar con la URL local
        navigation.navigate('PartyPlayerTV', {
          videoUrl: videoUrlToUse,
          title: title || 'Vortex Party',
          roomCode: code,
          isHost: false,
        });
        return;
      }
      const partyData = partySnap.data();
      navigation.navigate('PartyPlayerTV', {
        videoUrl: partyData.videoUrl || videoUrlToUse,
        title: partyData.title || title || 'Vortex Party',
        roomCode: code,
        isHost: false,
      });
    } catch (e) {
      console.error('Error uniéndose a la sala:', e);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <View style={s.root}>
      {/* Fondo cinematográfico desenfocado */}
      {backdrop && (
        <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFillObject} blurRadius={40} />
      )}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(5,5,5,0.88)' }]} />

      {/* Contenido centrado */}
      <View style={s.inner}>

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerIcon}>
            <Users color="#B026FF" size={32} />
          </View>
          <Text style={s.headerTitle}>Vortex Party</Text>
          <Text style={s.headerSub} numberOfLines={1}>
            {title ? `"${title}"` : 'Seleccioná un contenido para compartir'}
          </Text>
        </View>

        {/* ── DOS COLUMNAS ────────────────────────────────────────────────── */}
        <View style={s.columns}>

          {/* IZQUIERDA: Crear Sala */}
          <View style={s.card}>
            <View style={s.cardRow}>
              <Sparkles color="#B026FF" size={24} />
              <Text style={s.cardTitle}>Crear Sala</Text>
            </View>

            {/* Código generado */}
            <View style={s.codeBox}>
              <Text style={s.codeLabel}>TU CÓDIGO PRIVADO</Text>
              <Text style={s.codeText}>{generatedCode}</Text>
            </View>

            <TvFocusable onPress={createParty} borderWidth={0} scaleTo={1.04} style={s.btn}>
              {(focused: boolean) => (
                <LinearGradient
                  colors={focused ? ['#fff', '#e0e0e0'] : ['#B026FF', '#7700cc']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.btnGrad}
                >
                  {isCreating
                    ? <ActivityIndicator color={focused ? '#000' : '#fff'} />
                    : <>
                        <Play color={focused ? '#000' : '#fff'} size={20} fill={focused ? '#000' : '#fff'} />
                        <Text style={[s.btnText, focused && { color: '#000' }]}>Iniciar Sala</Text>
                      </>
                  }
                </LinearGradient>
              )}
            </TvFocusable>
          </View>

          {/* DERECHA: Unirse */}
          <View style={s.card}>
            <View style={s.cardRow}>
              <LogIn color="#4ade80" size={24} />
              <Text style={s.cardTitle}>Unirse a una Sala</Text>
            </View>

            <TextInput
              focusable
              placeholder="VRTX-0000"
              placeholderTextColor="#4B5563"
              value={joinCode}
              onChangeText={setJoinCode}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              autoCapitalize="characters"
              style={[s.input, inputFocused && s.inputFocused]}
            />

            <TvFocusable onPress={joinParty} borderWidth={0} scaleTo={1.04} style={s.btn}>
              {(focused: boolean) => {
                const canJoin = joinCode.length >= 4;
                return (
                  <View style={[
                    s.btnGrad,
                    { backgroundColor: focused && canJoin ? '#4ade80' : focused ? 'rgba(255,255,255,0.1)' : canJoin ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.05)' },
                    canJoin && !focused && { borderWidth: 1, borderColor: 'rgba(74,222,128,0.4)' },
                  ]}>
                    {isJoining
                      ? <ActivityIndicator color={focused && canJoin ? '#000' : '#4ade80'} />
                      : <Text style={[s.btnText, { color: focused && canJoin ? '#000' : canJoin ? '#4ade80' : '#555' }]}>
                          Conectar
                        </Text>
                    }
                  </View>
                );
              }}
            </TvFocusable>
          </View>
        </View>

        {/* ── CANCELAR ─────────────────────────────────────────────────────── */}
        <TvFocusable onPress={() => navigation.goBack()} borderWidth={0} scaleTo={1.04} style={s.cancelBtn}>
          {(focused: boolean) => (
            <View style={[s.cancelInner, focused && { backgroundColor: '#ef4444', borderColor: '#ef4444' }]}>
              <X color={focused ? '#fff' : '#9CA3AF'} size={16} />
              <Text style={[s.cancelText, focused && { color: '#fff' }]}>Cancelar</Text>
            </View>
          )}
        </TvFocusable>

      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050505' },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 48 },

  // Header
  header: { alignItems: 'center', marginBottom: 32 },
  headerIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(176,38,255,0.15)',
    borderWidth: 1, borderColor: 'rgba(176,38,255,0.3)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  headerTitle: { color: '#fff', fontSize: 38, fontWeight: '900', letterSpacing: -0.5, marginBottom: 6 },
  headerSub: { color: '#9ca3af', fontSize: 16, fontWeight: '500', maxWidth: width * 0.6, textAlign: 'center' },

  // Columns
  columns: { flexDirection: 'row', width: '100%', maxWidth: 900, gap: 24, marginBottom: 28 },
  card: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 24, padding: 28,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 },
  cardTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },

  // Code
  codeBox: {
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(176,38,255,0.2)',
    padding: 16, alignItems: 'center', marginBottom: 20,
  },
  codeLabel: { color: '#6b7280', fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 6 },
  codeText: { color: '#B026FF', fontSize: 32, fontWeight: '900', letterSpacing: 6, fontVariant: ['tabular-nums'] as any },

  // Input
  input: {
    backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14, padding: 14, fontSize: 28,
    textAlign: 'center', letterSpacing: 6, marginBottom: 20, fontWeight: '700',
  },
  inputFocused: { borderColor: '#B026FF', backgroundColor: 'rgba(176,38,255,0.08)' },

  // Buttons
  btn: { borderRadius: 14 },
  btnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 14, gap: 10,
  },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 1.2, textTransform: 'uppercase' },

  // Cancel
  cancelBtn: { borderRadius: 999 },
  cancelInner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 28, paddingVertical: 10, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  cancelText: { color: '#9ca3af', fontWeight: '700', fontSize: 14 },
});