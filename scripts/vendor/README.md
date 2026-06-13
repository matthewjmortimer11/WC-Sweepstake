# Build vendor directory (gitignored)

`scripts/build_standalone.py` inlines these third-party assets into the offline
standalone build. They are **not** committed (large, third-party); populate them
once on a machine with network access:

```bash
# React + ReactDOM (UMD dev builds) + Babel standalone
npm install --prefix /tmp/wc-deps react@18.3.1 react-dom@18.3.1 @babel/standalone@7.29.0
cp /tmp/wc-deps/node_modules/react/umd/react.development.js          scripts/vendor/
cp /tmp/wc-deps/node_modules/react-dom/umd/react-dom.development.js  scripts/vendor/
cp /tmp/wc-deps/node_modules/@babel/standalone/babel.min.js          scripts/vendor/
```

`fonts_inline.css` is the two Google Fonts (Bricolage Grotesque + Hanken
Grotesk) as base64 `@font-face` rules. Generate it by downloading each weight's
TTF (URLs from the Google Fonts CSS API) and emitting `@font-face` blocks with
`src: url(data:font/truetype;base64,...)`. Versions used: Bricolage Grotesque
v9 (500/600/700/800), Hanken Grotesk v12 (400/500/600/700/800).

Required files:

- `react.development.js`
- `react-dom.development.js`
- `babel.min.js`
- `fonts_inline.css`
