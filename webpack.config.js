const { resolve } = require('path');
const glob = require('glob');
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ESBuildMinifyPlugin } = require('esbuild-loader');
const { ProvidePlugin, BannerPlugin } = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

const isProd = process.env.NODE_ENV === 'production';
const isDevelopment = !isProd;
const SANDBOX_SUFFIX = '-sandbox';

const config = {
  mode: isProd ? 'production' : 'development',
  entry: glob.sync('./src/widgets/**/*.tsx').reduce((obj, el) => {
    const rel = path.relative('src/widgets', el).replace(/\.[tj]sx?$/, '').replace(/\\/g, '/');
    obj[rel] = el;
    obj[`${rel}${SANDBOX_SUFFIX}`] = el;
    return obj;
  }, {}),
  output: {
    path: resolve(__dirname, 'dist'),
    filename: '[name].js',
    publicPath: '',
  },
  resolve: { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
  module: {
    rules: [
      {
        test: /\.(ts|tsx|jsx|js)?$/,
        loader: 'esbuild-loader',
        options: { loader: 'tsx', target: 'es2020', minify: false },
      },
      {
        test: /\.css$/i,
        use: [
          isDevelopment ? 'style-loader' : MiniCssExtractPlugin.loader,
          { loader: 'css-loader', options: { url: false } },
          'postcss-loader',
        ],
      },
    ],
  },
  plugins: [
    isDevelopment ? undefined : new MiniCssExtractPlugin({ filename: '[name].css' }),
    new HtmlWebpackPlugin({
      templateContent: `
      <style>html,body{margin:0;padding:0}</style>
      <body></body>
      <script type="text/javascript">
      const urlSearchParams = new URLSearchParams(window.location.search);
      const queryParams = Object.fromEntries(urlSearchParams.entries());
      const widgetName = queryParams["widgetName"];
      if (!["index", "smart_tts", "config_popup"].includes(widgetName)) {
        document.body.textContent = "Unknown or missing widget ID.";
      } else {
      ${isProd ? `const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = widgetName + '${SANDBOX_SUFFIX}.css';
      document.head.appendChild(css);` : ''}
      const s = document.createElement('script');
      s.type = "module";
      s.src = widgetName+"${SANDBOX_SUFFIX}.js";
      document.body.appendChild(s);
      }
      </script>`,
      filename: 'index.html',
      inject: false,
    }),
    new ProvidePlugin({ React: 'react', reactDOM: 'react-dom' }),
    new BannerPlugin({
      banner: (file) => (!file.chunk.name.includes(SANDBOX_SUFFIX) ? 'const IMPORT_META=import.meta;' : ''),
      raw: true,
    }),
    new CopyPlugin({ patterns: [{ from: 'public', to: '' }, { from: 'src/style.css', to: 'App.css' }, { from: 'README.md', to: '' }, { from: 'docs', to: 'docs' }] }),
    isDevelopment ? new ReactRefreshWebpackPlugin() : undefined,
  ].filter(Boolean),
};

if (isProd) {
  config.optimization = { minimize: true, minimizer: [new ESBuildMinifyPlugin()] };
} else {
  config.devServer = {
    port: 8081,
    host: '0.0.0.0',
    open: false,
    hot: true,
    compress: true,
    watchFiles: ['src/**/*'],
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'baggage, sentry-trace',
    },
  };
}

module.exports = config;
