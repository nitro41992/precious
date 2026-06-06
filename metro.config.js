const { getDefaultConfig } = require("expo/metro-config");
const { mergeConfig } = require("@react-native/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

module.exports = mergeConfig(config, {
  resolver: {
    extraNodeModules: {
      "expo-modules-core": path.resolve(__dirname, "node_modules/expo/node_modules/expo-modules-core")
    }
  }
});
