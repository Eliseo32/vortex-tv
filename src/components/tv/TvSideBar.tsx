import React, { useRef, useState } from 'react';
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
    item, isActive, onPress, isExpanded, onFocus, onBlur
}: {
    item: typeof SIDEBAR_ITEMS[0]; isActive: boolean; onPress: () => void; isExpanded: boolean; onFocus?: () => void; onBlur?: () => void;
}) {
    const Icon = item.Icon;

    return (
        <View style={{ position: 'relative', width: '100%', alignItems: isExpanded ? 'flex-start' : 'center', paddingHorizontal: isExpanded ? 8 : 0 }}>
            <TvFocusable
                onPress={onPress}
                onFocus={onFocus}
                onBlur={onBlur}
                borderWidth={0}
                scaleTo={1.05}
                style={{ borderRadius: 14, width: isExpanded ? '100%' : 'auto', paddingVertical: 10, paddingHorizontal: isExpanded ? 16 : 0 }}
                focusedStyle={{ backgroundColor: 'rgba(250, 204, 21, 0.12)' }}
            >
                {(focused: boolean) => (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {/* Box del ícono */}
                        <View style={{
                            alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12,
                            backgroundColor: isActive && !focused ? 'rgba(255,255,255,0.08)' : 'transparent',
                            borderWidth: isActive && !focused ? 1 : 0,
                            borderColor: 'rgba(255,255,255,0.12)',
                        }}>
                            <Icon color={focused ? '#B026FF' : isActive ? '#fff' : '#6B7280'} size={21} strokeWidth={focused || isActive ? 2.5 : 1.8} />
                            {isActive && !isExpanded && (
                                <View style={{ position: 'absolute', bottom: -6, width: 4, height: 4, borderRadius: 2, backgroundColor: focused ? '#B026FF' : '#fff' }} />
                            )}
                        </View>

                        {/* Texto mostrado SÓLO cuando el sidebar está expandido */}
                        {isExpanded && (
                            <Text style={{ marginLeft: 16, color: focused ? '#B026FF' : isActive ? '#fff' : '#9CA3AF', fontSize: 16, fontWeight: focused || isActive ? '800' : '600', letterSpacing: 0.5 }}>
                                {item.label}
                            </Text>
                        )}
                    </View>
                )}
            </TvFocusable>
        </View>
    );
}

function SidebarProfileItem({ isExpanded, onFocus, onBlur, onPress, currentProfile }: any) {
    return (
        <TvFocusable
            onPress={onPress}
            onFocus={onFocus}
            onBlur={onBlur}
            borderWidth={0}
            scaleTo={1.05}
            style={{ borderRadius: 14, width: isExpanded ? '100%' : 'auto', alignItems: isExpanded ? 'flex-start' : 'center', paddingVertical: 10, paddingHorizontal: isExpanded ? 16 : 0 }}
            focusedStyle={{ backgroundColor: 'rgba(239,68,68,0.2)' }}
        >
            {(focused: boolean) => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 38, height: 38, borderRadius: 19, overflow: 'hidden', borderWidth: 2, borderColor: focused ? '#ef4444' : (currentProfile?.color || '#B026FF') }}>
                        {currentProfile?.avatar ? (
                            <Image source={{ uri: currentProfile.avatar }} style={{ width: '100%', height: '100%' }} />
                        ) : (
                            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a' }}>
                                <LogOut color={focused ? '#ef4444' : '#E5E7EB'} size={16} />
                            </View>
                        )}
                    </View>
                    {isExpanded && (
                        <Text style={{ marginLeft: 16, color: focused ? '#ef4444' : '#E5E7EB', fontSize: 16, fontWeight: '700' }}>
                            {currentProfile?.name || 'Mi Perfil'}
                        </Text>
                    )}
                </View>
            )}
        </TvFocusable>
    );
}

export default function TvSideBar({ currentTab, setCurrentTab }: TvSideBarProps) {
    const { logout, currentProfile } = useAppStore();
    const [isSidebarFocused, setIsSidebarFocused] = useState(false);
    const sidebarWidth = useRef(new Animated.Value(68)).current;

    const handleFocus = () => {
        setIsSidebarFocused(true);
        Animated.timing(sidebarWidth, {
            toValue: 220,
            duration: 250,
            useNativeDriver: false, // width cannot use native driver
        }).start();
    };

    const handleBlur = () => {
        setIsSidebarFocused(false);
        Animated.timing(sidebarWidth, {
            toValue: 68,
            duration: 200,
            useNativeDriver: false,
        }).start();
    };

    return (
        <Animated.View
            style={{
                width: sidebarWidth,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.07)',
                backgroundColor: 'rgba(8,8,8,0.75)',
                // Eliminamos absolute y offsets específicos
                borderRightWidth: 1, // Separador sutil si no es flotante absoluto
                height: '100%',
                paddingVertical: 40,
                alignItems: isSidebarFocused ? 'flex-start' : 'center',
                paddingHorizontal: isSidebarFocused ? 16 : 0,
                justifyContent: 'space-between',
                overflow: 'hidden',
                zIndex: 60,
            }}
        >
            {/* Línea lateral decorativa de foco activo */}
            <View style={{
                position: 'absolute', right: 0, top: '15%', bottom: '15%',
                width: 2, borderRadius: 1,
                backgroundColor: 'rgba(250,204,21,0.08)',
            }} />

            {/* Logo/Marca opcional arriba (ideal para el modo expandido) */}
            {isSidebarFocused && (
                <View style={{ width: '100%', alignItems: 'center', marginBottom: 20 }}>
                    <Image source={require('../../../assets/tv-banner.png')} style={{ width: 120, height: 40, resizeMode: 'contain', opacity: 0.8 }} />
                </View>
            )}

            {/* Botones principales */}
            <View style={{ width: '100%', paddingHorizontal: isSidebarFocused ? 0 : 8, gap: 4, flex: 1, justifyContent: 'center' }}>
                {SIDEBAR_ITEMS.map((item) => (
                    <SidebarItem
                        key={item.id}
                        item={item}
                        isActive={currentTab === item.id}
                        isExpanded={isSidebarFocused}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        onPress={() => setCurrentTab(item.id === 'discover' ? 'home' : item.id)}
                    />
                ))}
            </View>

            {/* Separador inferior */}
            <View style={{ width: '100%', paddingHorizontal: 12, alignItems: 'center' }}>
                <View style={{ width: isSidebarFocused ? '100%' : '60%', height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 12 }} />
            </View>

            {/* Perfil / Logout */}
            <View style={{ width: '100%', paddingHorizontal: isSidebarFocused ? 0 : 8, paddingBottom: 4 }}>
                <SidebarProfileItem
                    isExpanded={isSidebarFocused}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onPress={logout}
                    currentProfile={currentProfile}
                />
            </View>
        </Animated.View>
    );
}
