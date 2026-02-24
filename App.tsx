import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AppNavigator from './src/navigation/AppNavigator';

const VortexTheme = {
  ...DarkTheme,
  colors: { 
    ...DarkTheme.colors, 
    primary: '#FACC15', 
    background: '#050505', 
    card: '#0A0A0A', 
    text: '#ffffff', 
    border: '#1a1a1a' 
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer theme={VortexTheme}>
        <StatusBar style="light" backgroundColor="#050505" hidden={false} />
        {/* Toda la lógica de sesión y rutas está ahora en el AppNavigator */}
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}