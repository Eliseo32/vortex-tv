import React, { useRef } from 'react';
import { View, Text, Image, Animated } from 'react-native';
import { Search, Heart, Clock, Home, LogOut, Compass } from 'lucide-react-native';
import { useAppStore } from '../../store/useAppStore';
import TvFocusable from './TvFocusable';

interface TvSideBarProps {
    currentTab: string;
    setCurrentTab: (tab: string) => void;
}

const SIDEBAR_ITEMS = [
    { id: 'home', label: 'Inicio', Icon: Home },
    { id: 'discover', label: 'Descubrir', Icon: Compass },
    { id: 'search', label: 'Buscar', Icon: Search },
    { id: 'mylist', label: 'Favoritos', Icon: Heart },
    { id: 'history', label: 'Historial', Icon: Clock },
];

function SidebarItem({
    item,
    isActive,
    onPress,
}: {
    item: typeof SIDEBAR_ITEMS[0];
    isActive: boolean;
    onPress: () => void;
}) {
    const Icon = item.Icon;
    const labelOpacity = useRef(new Animated.Value(0)).current;
    const labelTranslate = useRef(new Animated.Value(-6)).current;

    const showLabel = () => {
        Animated.parallel([
            Animated.timing(labelOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
            Animated.timing(labelTranslate, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]).start();
    };

    const hideLabel = () => {
        Animated.parallel([
            Animated.timing(labelOpacity, { toValue: 0, duration: 140, useNativeDriver: true }),
            Animated.timing(labelTranslate, { toValue: -6, duration: 140, useNativeDriver: true }),
        ]).start();
    };

    return (
        <View style={{ position: 'relative', alignItems: 'center', width: '100%' }}>
            <TvFocusable
                onPress={onPress}
                onFocus={showLabel}
                onBlur={hideLabel}
                borderWidth={0}
                scaleTo={1.1}
                style={{ borderRadius: 14, width: '100%', alignItems: 'center', paddingVertical: 10 }}
                focusedStyle={{ backgroundColor: 'rgba(250, 204, 21, 0.12)' }}
            >
                {(focused: boolean) => (
                    <View style={{
                        alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12,
                        backgroundColor: isActive && !focused ? 'rgba(255,255,255,0.08)' : 'transparent',
                        borderWidth: isActive && !focused ? 1 : 0,
                        borderColor: 'rgba(255,255,255,0.12)',
                    }}>
                        <Icon
                            color={focused ? '#FACC15' : isActive ? '#fff' : '#6B7280'}
                            size={21}
                            strokeWidth={focused || isActive ? 2.5 : 1.8}
                        />
                        {/* Indicador activo — bolita amarilla abajo */}
                        {isActive && (
                            <View style={{
                                position: 'absolute', bottom: -6,
                                width: 4, height: 4, borderRadius: 2,
                                backgroundColor: focused ? '#FACC15' : '#fff',
                            }} />
                        )}
                    </View>
                )}
            </TvFocusable>

            {/* Label flotante que aparece al hacer focus */}
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    left: 68,
                    opacity: labelOpacity,
                    transform: [{ translateX: labelTranslate }],
                    backgroundColor: 'rgba(10,10,10,0.92)',
                    borderWidth: 1,
                    borderColor: 'rgba(250,204,21,0.3)',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                    zIndex: 999,
                }}
            >
                <Text style={{ color: '#FACC15', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }}>
                    {item.label}
                </Text>
            </Animated.View>
        </View>
    );
}

export default function TvSideBar({ currentTab, setCurrentTab }: TvSideBarProps) {
    const { logout, currentProfile } = useAppStore();

    return (
        <View
            style={{
                width: 68,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.07)',
                borderRadius: 22,
                backgroundColor: 'rgba(8,8,8,0.75)',
            }}
            className="absolute left-5 top-[8%] bottom-[8%] z-[60] py-5 items-center justify-between overflow-visible"
        >
            {/* Línea lateral izquierda decorativa */}
            <View style={{
                position: 'absolute', left: 0, top: '15%', bottom: '15%',
                width: 2, borderRadius: 1,
                backgroundColor: 'rgba(250,204,21,0.08)',
            }} />

            {/* Botones principales */}
            <View style={{ width: '100%', paddingHorizontal: 8, gap: 4, flex: 1, justifyContent: 'center' }}>
                {SIDEBAR_ITEMS.map((item) => (
                    <SidebarItem
                        key={item.id}
                        item={item}
                        isActive={currentTab === item.id}
                        onPress={() => setCurrentTab(item.id === 'discover' ? 'home' : item.id)}
                    />
                ))}
            </View>

            {/* Separador */}
            <View style={{ width: '60%', height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 12 }} />

            {/* Perfil / Logout */}
            <View style={{ width: '100%', paddingHorizontal: 8, paddingBottom: 4 }}>
                <TvFocusable
                    onPress={logout}
                    borderWidth={0}
                    scaleTo={1.1}
                    style={{ borderRadius: 14, width: '100%', alignItems: 'center', paddingVertical: 10 }}
                    focusedStyle={{ backgroundColor: 'rgba(239,68,68,0.2)' }}
                >
                    {(focused: boolean) => (
                        <View style={{
                            width: 38, height: 38, borderRadius: 19, overflow: 'hidden',
                            borderWidth: 2,
                            borderColor: focused ? '#ef4444' : (currentProfile?.color || '#FACC15'),
                        }}>
                            {currentProfile?.avatar ? (
                                <Image source={{ uri: currentProfile.avatar }} style={{ width: '100%', height: '100%' }} />
                            ) : (
                                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a' }}>
                                    <LogOut color={focused ? '#ef4444' : '#E5E7EB'} size={16} />
                                </View>
                            )}
                        </View>
                    )}
                </TvFocusable>
            </View>
        </View>
    );
}
