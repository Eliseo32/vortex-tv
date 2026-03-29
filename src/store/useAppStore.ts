import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, getDocs, doc, setDoc, getDoc, query, orderBy } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../config/firebase';

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  color: string;
}

export interface ContentServer { name: string; url: string; }
export interface SeasonData { season: number; episodes: number; }

export interface ContentItem {
  id: string;
  tmdb_id?: string;
  type: string;
  title: string;
  year: string;
  genre: string;
  poster: string;
  backdrop: string;
  description: string;
  rating: string;
  videoUrl?: string;
  servers?: ContentServer[];
  seasonsData?: SeasonData[];
}

export interface FeaturedEvent {
  id: string;
  date: string;
  time: string;
  category: string;
  league: string;
  team1: string;
  team2: string;
  logo1: string | null;
  logo2: string | null;
  status: string;           // "⚪ PROGRAMADO" | "🔴 EN VIVO"
  videoUrl: string | null;  // Primer servidor (para compatibilidad)
  servers: string[];        // Todos los iframes como array de URLs
  opciones: Record<string, string>; // "Opción 1" → URL
  createdAt: number;
}


// 🔥 NUEVA INTERFAZ PARA EL HISTORIAL
export interface HistoryItem {
  item: ContentItem;
  season?: number;
  episode?: number;
  timestamp: number;
}

export interface ChannelOption {
  name: string;
  iframe: string;
}

export interface ChannelFolder {
  id: string;
  name: string;
  logo: string | null;
  options: ChannelOption[];
  order: number;
  genre?: string; // Categoría TV Libre: Argentina, Deportes, etc.
}

interface AppState {
  myList: string[];
  watchedEpisodes: string[];
  toggleMyList: (id: string) => void;
  isInMyList: (id: string) => boolean;
  markAsWatched: (episodeKey: string) => void;
  isWatched: (episodeKey: string) => boolean;

  // 🔥 HISTORIAL
  watchHistory: HistoryItem[];
  addToHistory: (item: ContentItem, season?: number, episode?: number) => void;

  // AUTENTICACIÓN Y PERFILES
  userId: string | null;
  setUserId: (id: string | null) => void;

  userAvatar: string | null;
  availableAvatars: string[];
  setUserAvatar: (url: string) => void;

  profiles: UserProfile[];
  currentProfile: UserProfile | null;
  setProfile: (profile: UserProfile | null) => void;
  loadProfiles: (uid: string) => Promise<void>;
  addProfile: (uid: string, profile: Omit<UserProfile, 'id'>) => Promise<void>;
  logout: () => Promise<void>;

  cloudContent: ContentItem[];
  featuredEvents: FeaturedEvent[];
  channelFolders: ChannelFolder[];
  isLoadingContent: boolean;
  fetchCloudContent: () => Promise<void>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      myList: [],
      watchedEpisodes: [],
      watchHistory: [],

      toggleMyList: (id) => set((state) => {
        const list = state.myList;
        return list.includes(id) ? { myList: list.filter((item) => item !== id) } : { myList: [...list, id] };
      }),
      isInMyList: (id) => get().myList.includes(id),

      markAsWatched: (episodeKey) => set((state) => {
        if (state.watchedEpisodes.includes(episodeKey)) return state;
        return { watchedEpisodes: [...state.watchedEpisodes, episodeKey] };
      }),
      isWatched: (episodeKey) => get().watchedEpisodes.includes(episodeKey),

      // 🔥 LÓGICA DEL HISTORIAL (Mueve el item al principio si ya existía)
      addToHistory: (item, season, episode) => set((state) => {
        const filtered = state.watchHistory.filter(h => h.item.id !== item.id);
        const newEntry = { item, season, episode, timestamp: Date.now() };
        return { watchHistory: [newEntry, ...filtered] };
      }),

      // AUTENTICACIÓN
      userId: null,
      setUserId: (id) => set({ userId: id }),
      profiles: [],
      currentProfile: null,
      setProfile: (profile) => set({ currentProfile: profile }),

      // SISTEMA DE AVATARES
      userAvatar: null,
      availableAvatars: [
        'https://picsum.photos/seed/vortex1/300/300',
        'https://picsum.photos/seed/vortex2/300/300',
        'https://picsum.photos/seed/neon3/300/300',
        'https://picsum.photos/seed/cyber4/300/300',
        'https://picsum.photos/seed/synth5/300/300',
        'https://picsum.photos/seed/retro6/300/300',
        'https://picsum.photos/seed/future7/300/300',
        'https://picsum.photos/seed/oled8/300/300',
      ],
      setUserAvatar: (url) => set({ userAvatar: url }),

      logout: async () => {
        try {
          await signOut(auth);
          set({ userId: null, currentProfile: null, profiles: [], myList: [], watchedEpisodes: [], watchHistory: [], userAvatar: null });
        } catch (e) { console.error("Error al cerrar sesión", e); }
      },

      loadProfiles: async (uid) => {
        try {
          const userDoc = await getDoc(doc(db, 'users', uid));
          if (userDoc.exists() && userDoc.data().profiles) {
            set({ profiles: userDoc.data().profiles });
          } else {
            const defaultProfile = { id: Date.now().toString(), name: 'Admin', avatar: `https://api.dicebear.com/7.x/avataaars/png?seed=${uid}`, color: '#B026FF' };
            await setDoc(doc(db, 'users', uid), { profiles: [defaultProfile] }, { merge: true });
            set({ profiles: [defaultProfile] });
          }
        } catch (error) { console.error("Error cargando perfiles:", error); }
      },

      addProfile: async (uid, profileData) => {
        try {
          const newProfile = { id: Date.now().toString(), ...profileData };
          const updatedProfiles = [...get().profiles, newProfile];
          await setDoc(doc(db, 'users', uid), { profiles: updatedProfiles }, { merge: true });
          set({ profiles: updatedProfiles });
        } catch (error) { console.error("Error creando perfil:", error); }
      },

      // CATÁLOGO
      cloudContent: [],
      featuredEvents: [],
      channelFolders: [],
      isLoadingContent: false,
      fetchCloudContent: async () => {

        set({ isLoadingContent: true });
        try {
          const [contentQuery, agendaQuery] = await Promise.all([
            getDocs(collection(db, 'content')),
            getDocs(query(collection(db, 'agenda'), orderBy('createdAt', 'desc'))),
          ]);

          const items: ContentItem[] = [];
          contentQuery.forEach((doc) => { items.push({ id: doc.id, ...doc.data() } as ContentItem); });

          const events: FeaturedEvent[] = [];
          agendaQuery.forEach((doc) => { events.push(doc.data() as FeaturedEvent); });

          // ── TV en Vivo: solo canales de TV Libre, ordenados por categoría ──
          // Los canales en tvlibre_channels están agrupados por categoría (argentina, deportes, etc.)
          // y cada doc tiene: { name, order, channels: [{ name, logo, options: [{name, iframe}] }] }
          let tvlibreChannels: ChannelFolder[] = [];
          try {
            const tvlibreQuery = await getDocs(query(collection(db, 'tvlibre_channels'), orderBy('order', 'asc')));
            // Reconstruir canales individuales preservando el orden de categoría de la página
            tvlibreQuery.forEach((docSnap) => {
              const data = docSnap.data();
              if (data.channels && Array.isArray(data.channels)) {
                data.channels.forEach((ch: any, idx: number) => {
                  tvlibreChannels.push({
                    id: `tvlibre-${docSnap.id}-${idx}`,
                    name: ch.name,
                    logo: ch.logo || null,
                    // genre usa el nombre de la categoría (Argentina, Deportes, etc.)
                    genre: data.name,
                    options: (ch.options || []).map((opt: any) => ({
                      name: opt.name || ch.name,
                      iframe: opt.iframe || '',
                    })),
                    order: (data.order || 0) * 1000 + idx,
                  });
                });
              }
            });
          } catch (tvlErr) {
            console.warn('tvlibre_channels no disponible:', tvlErr);
          }

          set({
            cloudContent: items,
            featuredEvents: events,
            channelFolders: tvlibreChannels,
            isLoadingContent: false,
          });
        } catch (error) {
          console.error("Error al descargar catálogo:", error);
          set({ isLoadingContent: false });
        }
      },
    }),
    {
      name: 'vortex-storage', // Nombre de la base local
      storage: createJSONStorage(() => AsyncStorage),
      // Solo persistimos datos del usuario — el catálogo siempre viene fresco de Firestore
      partialize: (state) => ({
        myList: state.myList,
        watchedEpisodes: state.watchedEpisodes,
        watchHistory: state.watchHistory,
        userAvatar: state.userAvatar,
      }),
    }
  )
);