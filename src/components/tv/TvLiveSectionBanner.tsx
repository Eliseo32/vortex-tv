/**
 * TvLiveSectionBanner.tsx
 * Rediseño Cinemático Premium para "TV EN VIVO"
 * 
 * Basado en la especificación "The Cinematic Pulse".
 * Elimina los headers rígidos e introduce un bloque masivo asimétrico.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, Animated, Dimensions
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Radio, ChevronRight, Play } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import TvFocusable from './TvFocusable';
import { ChocopopService, ChocopopChannel } from '../../services/ChocopopService';

const { width: windowWidth } = Dimensions.get('window');

// Cabecera necesaria para que bestleague.world sirva las imágenes
const POSTER_HEADERS = { Referer: 'http://tv.chocopopflow.com/' };

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── Componente ───────────────────────────────────────────────────────────────
interface TvLiveSectionBannerProps {
  onOpenLiveTab?: () => void;
}

export default function TvLiveSectionBanner({ onOpenLiveTab }: TvLiveSectionBannerProps) {
  const navigation = useNavigation<any>();
  const [channels, setChannels] = useState<ChocopopChannel[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Animaciones de fondo y pulse
  const pulsAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = () =>
      Animated.sequence([
        Animated.timing(pulsAnim, { toValue: 0.3, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulsAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ]).start(() => pulse());
    pulse();
  }, []);

  useEffect(() => {
    ChocopopService.fetchPreview(12).then((chs) => {
      setChannels(chs);
      setLoaded(true);
    });
  }, []);

  const handleOpenChannel = useCallback((ch: ChocopopChannel) => {
    navigation.navigate('ChocopopPlayerTV', { channel: ch });
  }, [navigation]);

  const handleOpenAll = useCallback(() => {
    if (onOpenLiveTab) {
      onOpenLiveTab();
    } else if (channels.length > 0) {
      navigation.navigate('ChocopopPlayerTV', { channel: channels[0] });
    }
  }, [channels, onOpenLiveTab, navigation]);

  const keyExtractor = useCallback((item: ChocopopChannel) => item.m3u8, []);

  const renderCard = useCallback(({ item }: { item: ChocopopChannel }) => {
    const accent = getAccent(item.name);

    return (
      <TvFocusable
        onPress={() => handleOpenChannel(item)}
        scaleTo={1.05}
        borderWidth={0}
        style={{ borderRadius: 16, marginRight: 24 }}
      >
        {(focused: boolean) => (
          <View style={[
            styles.card,
            focused && { backgroundColor: '#1c1c24' },
          ]}>
            {focused && (
              <Animated.View style={[styles.cardGlow, { shadowColor: accent }]} />
            )}
            
            <View style={styles.cardImageWrap}>
              {item.poster ? (
                <Image
                  source={{ uri: item.poster, headers: POSTER_HEADERS }}
                  style={styles.cardImage}
                  contentFit="cover"
                  onError={() => { /* expo-image muestra nada si falla — el placeholder queda debajo */ }}
                />
              ) : (
                <View style={[styles.cardPlaceholder, { backgroundColor: `${accent}15` }]}>
                  <Text style={[styles.cardInitials, { color: accent }]}>
                    {getInitials(item.name)}
                  </Text>
                </View>
              )}

              {/* Overlay Glass Layer en Hover */}
              {focused && (
                 <View style={styles.cardHoverOverlay}>
                   <Play size={24} color="#fff" fill="#fff" />
                 </View>
              )}

              <View style={styles.liveBadge}>
                <View style={[styles.liveDotSmall, { backgroundColor: accent }]} />
                <Text style={styles.liveText}>VIVO</Text>
              </View>
            </View>

            <View style={styles.cardInfo}>
              <Text numberOfLines={2} style={[
                styles.cardName,
                focused && { color: '#fff' },
              ]}>
                {item.name}
              </Text>
            </View>
          </View>
        )}
      </TvFocusable>
    );
  }, [handleOpenChannel]);

  if (!loaded || channels.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* El Bloque Cinematográfico masivo */}
      <View style={styles.cinemaBlock}>
        <LinearGradient
          colors={['rgba(191,64,191,0.12)', '#000000']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Un brillo extra en la esquina */}
        <Animated.View style={[styles.bgGlow, { opacity: pulsAnim }]} />

        <View style={styles.contentLayout}>
          
          {/* LADO IZQUIERDO: Tipografía y CTA */}
          <View style={styles.leftColumn}>
            
            <View style={styles.liveBadgeHuge}>
              <Animated.View style={[styles.liveDotHuge, { opacity: pulsAnim }]} />
              <Text style={styles.liveBadgeHugeText}>EN VIVO AHORA</Text>
            </View>

            <Text style={styles.heroTitle}>
              La Televisión,{'\n'}Sin Límites.
            </Text>
            
            <Text style={styles.heroDescription}>
              Disfruta de más de 50 canales globales con señal ininterrumpida. Noticias, deportes y entretenimiento proyectados en tiempo real hacia tu pantalla.
            </Text>

            <View style={{ marginTop: 32 }}>
              <TvFocusable onPress={handleOpenAll} scaleTo={1.05} borderWidth={0} style={{ borderRadius: 12, alignSelf: 'flex-start' }}>
                {(focused: boolean) => (
                  <LinearGradient
                    colors={focused ? ['#BF40BF', '#a229ff'] : ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.05)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.mainActionBtn, focused && styles.mainActionBtnFocused]}
                  >
                    <Radio size={20} color={focused ? '#fff' : '#BF40BF'} strokeWidth={focused ? 2.5 : 2} />
                    <Text style={[styles.mainActionText, focused && { color: '#fff' }]}>
                      Ingresar a la Señal
                    </Text>
                  </LinearGradient>
                )}
              </TvFocusable>
            </View>

          </View>

          {/* LADO DERECHO: Carrusel Integrado */}
          <View style={styles.rightColumn}>
            <FlatList
              data={channels}
              keyExtractor={keyExtractor}
              renderItem={renderCard}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: 16, paddingRight: 64, paddingVertical: 24 }}
              initialNumToRender={5}
              maxToRenderPerBatch={4}
              windowSize={5}
            />
          </View>

        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const CARD_W = 180;
const CARD_H = 150;
const IMAGE_H = 105;

const styles = StyleSheet.create({
  container: {
    marginBottom: 48,
    marginTop: 24,
    paddingHorizontal: 24, // Margen global de layout
  },
  cinemaBlock: {
    width: '100%',
    backgroundColor: '#0a0a0a',
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(191,64,191,0.1)',
  },
  bgGlow: {
    position: 'absolute',
    top: -150,
    left: -150,
    width: 500,
    height: 500,
    borderRadius: 250,
    backgroundColor: '#BF40BF',
    opacity: 0.15,
    filter: 'blur(60px)',
  },
  contentLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 48,
  },
  leftColumn: {
    flex: 0.45,
    paddingLeft: 48,
    paddingRight: 16,
    justifyContent: 'center',
  },
  rightColumn: {
    flex: 0.55,
  },

  // Typography & Content
  liveBadgeHuge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(191,64,191,0.15)',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(191,64,191,0.3)',
  },
  liveDotHuge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#BF40BF',
    shadowColor: '#BF40BF',
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  liveBadgeHugeText: {
    color: '#BF40BF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 48,
    lineHeight: 52,
    fontWeight: '900',
    letterSpacing: -1.5,
  },
  heroDescription: {
    color: '#adaaaa',
    fontSize: 15,
    lineHeight: 24,
    marginTop: 16,
    paddingRight: 24,
  },
  
  // Buttons
  mainActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 32,
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(191,64,191,0.3)',
  },
  mainActionBtnFocused: {
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#BF40BF',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  mainActionText: {
    color: '#BF40BF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Canal Cards
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0a0a0a',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardGlow: {
    ...StyleSheet.absoluteFillObject,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    backgroundColor: '#1c1c24',
    zIndex: -1,
  },
  cardImageWrap: {
    width: '100%',
    height: IMAGE_H,
    position: 'relative',
    backgroundColor: '#111',
  },
  cardImage: { width: '100%', height: '100%' },
  cardPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInitials: { fontSize: 28, fontWeight: '900' },
  cardHoverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(191,64,191,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  liveDotSmall: { width: 5, height: 5, borderRadius: 3 },
  liveText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  
  cardInfo: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  cardName: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

