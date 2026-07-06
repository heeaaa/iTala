// Default Metro config that extends Expo's. Required for SDK 54.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
