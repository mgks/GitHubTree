const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require("copy-webpack-plugin");
const PrerenderSPAPlugin = require('prerender-spa-plugin-next');

module.exports = {
  mode: 'production',
  entry: './src/script.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    publicPath: ''
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      filename: 'index.html',
      inject: 'body',
    }),
    new CopyPlugin({
      patterns: [
        { from: "src/assets", to: "assets" },
      ],
    }),
    new PrerenderSPAPlugin({
      staticDir: path.join(__dirname, 'dist'),

      routes: ['/'],

        postProcess(renderedRoute) {
          renderedRoute.route = renderedRoute.originalRoute;

          if (renderedRoute.route.endsWith('404.html')) {
            renderedRoute.outputPath = path.join(__dirname, 'dist', '404.html');
          }
          return renderedRoute;
        },
    })
  ],
  devServer: {
    static: './dist',
    hot: true,
    historyApiFallback: true,
  },
};