/**
 * TvLiveSectionBanner.tsx
 * Tira compacta de TV en Vivo — igual que una fila de contenido del Home
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  ● EN VIVO   Televisión en Vivo  [Ver todo →]  │ canal carrusel │
 * └─────────────────────────────────────────────────────────────────┘
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, Animated, Dimensions, TouchableOpacity
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Radio, ChevronRight } from 'lucide-react-native';
import { Image } from 'expo-image';
import TvFocusable from './TvFocusable';
import { ChocopopService, ChocopopChannel } from '../../services/ChocopopService';

const POSTER_HEADERS = { Referer: 'http://tv.chocopopflow.com/' };

/* ─── Card dimensions ─────────────────────────────────────────────────────── */
const CARD_W  = 100;   // ancho del canal
const CARD_H  = 70;    // alto del logo
const CARD_TOTAL = 110; // alto total (logo + nombre)

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
const ACCENT_COLORS = [
  '#B026FF', '#00e3fd', '#ff6b35', '#f7c59f',
  '#39d353', '#ffb151', '#ff4757', '#2ed573',
];
function getAccent(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ACCENT_COLORS[h % ACCENT_COLORS.length];
}

/* ─── Componente ─────────────────────────────────────────────────────────── */
interface Props { onOpenLiveTab?: () => void; }

export default function TvLiveSectionBanner({ onOpenLiveTab }: Props) {
  const navigation = useNavigation<any>();
  const [channels, setChannels] = useState<ChocopopChannel[]>([]);
  const [loaded, setLoaded]     = useState(false);
  const pulsAnim = useRef(new Animated.Value(1)).current;

  /* Animación del dot EN VIVO */
  useEffect(() => {
    const pulse = () =>
      Animated.sequence([
        Animated.timing(pulsAnim, { toValue: 0.2, duration: 900, useNativeDriver: true }),
        Animated.timing(pulsAnim, { toValue: 1,   duration: 900, useNativeDriver: true }),
      ]).start(pulse);
    pulse();
  }, []);

  useEffect(() => {
    ChocopopService.fetchPreview(20).then((chs) => {
      setChannels(chs);
      setLoaded(true);
    });
  }, []);

  const openChannel = useCallback((ch: ChocopopChannel) => {
    navigation.navigate('ChocopopPlayerTV', { channel: ch });
  }, [navigation]);

  const openAll = useCallback(() => {
    if (onOpenLiveTab) onOpenLiveTab();
    else if (channels.length > 0) navigation.navigate('ChocopopPlayerTV', { channel: channels[0] });
  }, [channels, onOpenLiveTab, navigation]);

  const keyExtractor = useCallback((item: ChocopopChannel) => item.m3u8, []);

  /* ── Card de canal ─────────────────────────────────────────────────────── */
  const renderCard = useCallback(({ item }: { item: ChocopopChannel }) => {
    const accent = getAccent(item.name);
    return (
      <TvFocusable
        onPress={() => openChannel(item)}
        scaleTo={1.1}
        borderWidth={0}
        style={{ borderRadius: 12, marginRight: 12 }}
      >
        {(focused: boolean) => (
          <View style={[styles.card, focused && styles.cardFocused]}>

            {/* Logo / Poster */}
            <View style={[styles.logoWrap, { borderColor: focused ? accent : 'rgba(255,255,255,0.06)' }]}>
              {item.poster ? (
                <Image
                  source={{ uri: item.poster, headers: POSTER_HEADERS }}
                  style={styles.logo}
                  contentFit="contain"
                />
              ) : (
                <View style={[styles.logoPlaceholder, { backgroundColor: `${accent}18` }]}>
                  <Text style={[styles.initials, { color: accent }]}>{getInitials(item.name)}</Text>
                </View>
              )}

              {/* Overlay play al enfocarse */}
              {focused && (
                <View style={[styles.playOverlay, { backgroundColor: `${accent}55` }]}>
                  <View style={styles.playTriangle} />
                </View>
              )}

              {/* Badge EN VIVO */}
              <View style={styles.liveBadge}>
                <Animated.View style={[styles.liveDot, { backgroundColor: accent, opacity: pulsAnim }]} />
              </View>
            </View>

            {/* Nombre */}
            <Text numberOfLines={1} style={[styles.channelName, focused && { color: '#fff' }]}>
              {item.name}
            </Text>
          </View>
        )}
      </TvFocusable>
    );
  }, [openChannel, pulsAnim]);

  if (!loaded || channels.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* ── Header row ────────────────────────────────────────────────── */}
      <View style={styles.header}>
        {/* Título con badge pulsante */}
        <View style={styles.titleRow}>
          <Animated.View style={[styles.liveDotLarge, { opacity: pulsAnim }]} />
          <Radio size={16} color="#BF40BF" strokeWidth={2} style={{ marginLeft: 6 }} />
          <Text style={styles.title}>Televisión en Vivo</Text>
        </View>

        {/* Ver todo */}
        <TvFocusable onPress={openAll} scaleTo={1.06} borderWidth={0} style={{ borderRadius: 8 }}>
          {(f: boolean) => (
            <View style={[styles.verTodoBtn, f && styles.verTodoBtnFocused]}>
              <Text style={[styles.verTodoText, f && { color: '#BF40BF' }]}>Ver todo</Text>
              <ChevronRight size={14} color={f ? '#BF40BF' : '#555'} strokeWidth={2.5} />
            </View>
          )}
        </TvFocusable>
      </View>

      {/* ── Carrusel de canales ─────────────────────────────────────────── */}
      <View style={styles.stripWrap}>
        <FlatList
          data={channels}
          keyExtractor={keyExtractor}
          renderItem={renderCard}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={5}
        />
      </View>
    </View>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: {
    marginBottom: 40,
    marginTop: 8,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDotLarge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#BF40BF',
    shadowColor: '#BF40BF',
    shadowOpacity: 1,
    shadowRadius: 6,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginLeft: 2,
  },
  verTodoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  verTodoBtnFocused: {
    backgroundColor: 'rgba(191,64,191,0.08)',
  },
  verTodoText: {
    color: '#555',
    fontSize: 13,
    fontWeight: '700',
  },

  /* Strip wrapper */
  stripWrap: {
    // Sin altura fija — se adapta al contenido
    paddingLeft: 24,
  },
  listContent: {
    paddingRight: 32,
    paddingVertical: 4,
  },

  /* Card */
  card: {
    width: CARD_W,
    alignItems: 'center',
    gap: 6,
  },
  cardFocused: {},

  logoWrap: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111116',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.06)',
    position: 'relative',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  logoPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontSize: 22,
    fontWeight: '900',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderLeftWidth: 14,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#fff',
    marginLeft: 3,
  },
  liveBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  channelName: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.1,
    textAlign: 'center',
    width: CARD_W,
  },
});
