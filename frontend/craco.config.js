// craco.config.js
const path = require("path");
require("dotenv").config();

let webpackConfig = {
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {
      webpackConfig.watchOptions = {
        ...webpackConfig.watchOptions,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/build/**',
          '**/dist/**',
          '**/coverage/**',
          '**/public/**',
        ],
      };
      // Remove ForkTsCheckerWebpackPlugin — incompatible with Node v24 (ajv-keywords crash)
      webpackConfig.plugins = webpackConfig.plugins.filter(
        (p) => p.constructor.name !== 'ForkTsCheckerWebpackPlugin'
      );
      return webpackConfig;
    },
  },
};

module.exports = webpackConfig;
