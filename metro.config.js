const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ─── Excluir la carpeta scripts/ del bundle de React Native ────────────────
// Los scripts son Node.js puros (scrapers) y no deben ser procesados por Hermes.
const scriptsDir = path.resolve(__dirname, 'scripts');

config.resolver.blockList = [
    // Excluir todo lo que esté dentro de scripts/
    new RegExp(`^${scriptsDir.replace(/\\/g, '\\\\').replace(/\//g, '\\/')}.*$`),
];

module.exports = config;
