/* ===========================================================================
   WHEESHT — CHROME 3D EDITION (variation C)
   A 3/4 (45°) view, dimensional chrome referee whistle: spherical chamber with
   real metallic shading, a cylindrical mouthpiece angled down-left, a 3D
   finger-grip ring, big glossy eyes, arms, legs + ref boots. Heavily animated.
   Tam o' shanter on the Scottish mood only. Exports window.WheeshtChrome.
   =========================================================================== */
(function () {
  var R = window.React;

  if (!document.getElementById('wheesht-chrome-css')) {
    var css = document.createElement('style'); css.id = 'wheesht-chrome-css';
    css.textContent = [
      '.wc3-svg{overflow:visible;display:block}',
      '.wc3-breathe{transform-box:fill-box;transform-origin:50% 96%;animation:wc3Breathe 3.4s ease-in-out infinite}',
      '@keyframes wc3Breathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-2px) scale(1.015,1.025)}}',
      '.wc3-stage{transform-box:fill-box;transform-origin:50% 94%}',
      '.wc3-a-idle{animation:wc3Idle 4s ease-in-out infinite}',
      '@keyframes wc3Idle{0%,100%{transform:translateY(0) rotate(-1.5deg)}50%{transform:translateY(-5px) rotate(1.5deg)}}',
      '.wc3-a-bounce{animation:wc3Bounce 1s cubic-bezier(.3,.7,.3,1) infinite}',
      '@keyframes wc3Bounce{0%,100%{transform:translateY(0) rotate(-3deg) scale(1)}30%{transform:translateY(-18px) rotate(3deg) scale(1.05,.95)}55%{transform:translateY(2px) rotate(-1deg) scale(.96,1.04)}}',
      '.wc3-a-jitter{animation:wc3Jitter .32s ease-in-out infinite}',
      '@keyframes wc3Jitter{0%,100%{transform:translate(0,0) rotate(0)}25%{transform:translate(-2px,.5px) rotate(-1.4deg)}75%{transform:translate(2px,.5px) rotate(1.4deg)}}',
      '.wc3-a-throb{animation:wc3Throb .55s ease-in-out infinite}',
      '@keyframes wc3Throb{0%,100%{transform:scale(1) rotate(-1deg)}50%{transform:scale(1.06,.96) rotate(1.5deg)}}',
      '.wc3-a-sway{animation:wc3Sway 3.2s ease-in-out infinite}',
      '@keyframes wc3Sway{0%,100%{transform:translateY(2px) rotate(-3.5deg)}50%{transform:translateY(4px) rotate(3.5deg)}}',
      '.wc3-a-lean{animation:wc3Lean 2.8s ease-in-out infinite}',
      '@keyframes wc3Lean{0%,100%{transform:rotate(-4deg) translateX(-1px)}50%{transform:rotate(3deg) translateX(2px)}}',
      '.wc3-a-pop{animation:wc3Pop .5s cubic-bezier(.2,1.5,.4,1) both, wc3Float 2.8s ease-in-out .5s infinite}',
      '@keyframes wc3Pop{0%{transform:scale(.6) translateY(10px)}100%{transform:scale(1) translateY(0)}}',
      '@keyframes wc3Float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}',
      '.wc3-lid{transform-box:fill-box;transform-origin:50% 0;transform:scaleY(0)}',
      '.wc3-blink{animation:wc3Blink var(--b,5s) ease-in-out infinite}',
      '@keyframes wc3Blink{0%,93%,100%{transform:scaleY(0)}96%,97.5%{transform:scaleY(1)}}',
      '.wc3-arm-l{transform-box:fill-box;transform-origin:88% 12%;animation:wc3ArmL 3s ease-in-out infinite}',
      '@keyframes wc3ArmL{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-9deg)}}',
      '.wc3-arm-r{transform-box:fill-box;transform-origin:12% 12%;animation:wc3ArmR 3s ease-in-out infinite}',
      '@keyframes wc3ArmR{0%,100%{transform:rotate(0deg)}50%{transform:rotate(9deg)}}',
      '.wc3-wave{transform-box:fill-box;transform-origin:12% 90%;animation:wc3Wave 1.1s ease-in-out infinite}',
      '@keyframes wc3Wave{0%,100%{transform:rotate(-12deg)}50%{transform:rotate(16deg)}}',
      '.wc3-drip{transform-box:fill-box;transform-origin:50% 0;animation:wc3Drip 1.8s ease-in infinite}',
      '@keyframes wc3Drip{0%{transform:translateY(0) scaleY(.6);opacity:0}30%{opacity:1}100%{transform:translateY(28px) scaleY(1);opacity:0}}',
      '.wc3-tw{transform-box:fill-box;transform-origin:center;animation:wc3Tw 1.4s ease-in-out infinite}',
      '@keyframes wc3Tw{0%,100%{transform:scale(.4);opacity:.2}50%{transform:scale(1);opacity:1}}',
      '.wc3-tw.d1{animation-delay:.5s}.wc3-tw.d2{animation-delay:.9s}',
      '.wc3-toot{transform-box:fill-box;transform-origin:100% 50%;animation:wc3Toot 1.1s ease-out infinite}',
      '@keyframes wc3Toot{0%{transform:scale(.3) translate(0,0);opacity:0}30%{opacity:.9}100%{transform:scale(1.25) translate(-20px,6px);opacity:0}}',
      '.wc3-puff{transform-box:fill-box;transform-origin:0 50%;animation:wc3Puff 1.1s ease-out infinite}',
      '@keyframes wc3Puff{0%{transform:scale(.3);opacity:0}30%{opacity:.9}100%{transform:scale(1.4) translateX(12px);opacity:0}}'
    ].join('\n');
    document.head.appendChild(css);
  }

  var INK = '#20262d';
  var CANON = ['neutral', 'happy', 'celebrating', 'shocked', 'nervous', 'confident', 'angry', 'crying', 'mischievous', 'scottish'];
  var ALIAS = { welcome: 'happy', smug: 'confident', outraged: 'shocked', delighted: 'celebrating', suspicious: 'mischievous', wounded: 'crying', solemn: 'neutral', broadcast: 'confident', drumroll: 'nervous' };
  function resolve(m) { if (CANON.indexOf(m) >= 0) return m; if (ALIAS[m]) return ALIAS[m]; return 'neutral'; }

  // sphere body centre + radius (3/4 view)
  var B = { x: 134, y: 130, r: 66 };
  var L = { x: 112, y: 116 }, RY = { x: 158, y: 120 }; // left/right eye centres (right is the "far" eye)

  var CFG = {
    neutral:     { e: 'open',  brow: 'rest',  m: 'soft',  arms: 'rest',  anim: 'idle',   fx: null },
    happy:       { e: 'open',  brow: 'up',    m: 'smile', arms: 'rest',  anim: 'idle',   fx: null },
    celebrating: { e: 'joy',   brow: 'up',    m: 'grin',  arms: 'up',    anim: 'bounce', fx: 'spark' },
    shocked:     { e: 'wide',  brow: 'high',  m: 'oh',    arms: 'startle', anim: 'pop',  fx: 'bolt' },
    nervous:     { e: 'worry', brow: 'worry', m: 'wavy',  arms: 'fidget', anim: 'jitter', fx: 'sweat' },
    confident:   { e: 'half',  brow: 'cocky', m: 'smirk', arms: 'hip',   anim: 'idle',   fx: 'toot' },
    angry:       { e: 'narrow',brow: 'angry', m: 'shout', arms: 'card',  anim: 'throb',  fx: 'steam' },
    crying:      { e: 'shut',  brow: 'sad',   m: 'wail',  arms: 'face',  anim: 'sway',   fx: 'tears' },
    mischievous: { e: 'half',  brow: 'sly',   m: 'sly',   arms: 'rub',   anim: 'lean',   fx: 'spark1' },
    scottish:    { e: 'joy',   brow: 'up',    m: 'grin',  arms: 'wave',  anim: 'bounce', fx: 'spark' }
  };

  var BROWS = {
    rest:  ['M' + (L.x - 16) + ',' + (L.y - 22) + ' Q' + L.x + ',' + (L.y - 28) + ' ' + (L.x + 14) + ',' + (L.y - 22), 'M' + (RY.x - 13) + ',' + (RY.y - 20) + ' Q' + RY.x + ',' + (RY.y - 25) + ' ' + (RY.x + 12) + ',' + (RY.y - 20)],
    up:    ['M' + (L.x - 16) + ',' + (L.y - 26) + ' Q' + L.x + ',' + (L.y - 36) + ' ' + (L.x + 14) + ',' + (L.y - 27), 'M' + (RY.x - 13) + ',' + (RY.y - 24) + ' Q' + RY.x + ',' + (RY.y - 33) + ' ' + (RY.x + 12) + ',' + (RY.y - 25)],
    high:  ['M' + (L.x - 16) + ',' + (L.y - 30) + ' Q' + L.x + ',' + (L.y - 40) + ' ' + (L.x + 14) + ',' + (L.y - 31), 'M' + (RY.x - 13) + ',' + (RY.y - 28) + ' Q' + RY.x + ',' + (RY.y - 37) + ' ' + (RY.x + 12) + ',' + (RY.y - 29)],
    worry: ['M' + (L.x - 16) + ',' + (L.y - 24) + ' Q' + L.x + ',' + (L.y - 30) + ' ' + (L.x + 14) + ',' + (L.y - 27), 'M' + (RY.x - 13) + ',' + (RY.y - 22) + ' Q' + RY.x + ',' + (RY.y - 27) + ' ' + (RY.x + 12) + ',' + (RY.y - 24)],
    cocky: ['M' + (L.x - 16) + ',' + (L.y - 22) + ' Q' + L.x + ',' + (L.y - 24) + ' ' + (L.x + 14) + ',' + (L.y - 30), 'M' + (RY.x - 13) + ',' + (RY.y - 20) + ' Q' + RY.x + ',' + (RY.y - 22) + ' ' + (RY.x + 12) + ',' + (RY.y - 26)],
    angry: ['M' + (L.x - 17) + ',' + (L.y - 28) + ' L' + (L.x + 13) + ',' + (L.y - 15), 'M' + (RY.x + 13) + ',' + (RY.y - 26) + ' L' + (RY.x - 12) + ',' + (RY.y - 14)],
    sad:   ['M' + (L.x - 15) + ',' + (L.y - 16) + ' Q' + L.x + ',' + (L.y - 28) + ' ' + (L.x + 14) + ',' + (L.y - 22), 'M' + (RY.x - 12) + ',' + (RY.y - 14) + ' Q' + RY.x + ',' + (RY.y - 24) + ' ' + (RY.x + 12) + ',' + (RY.y - 19)],
    sly:   ['M' + (L.x - 16) + ',' + (L.y - 19) + ' Q' + L.x + ',' + (L.y - 22) + ' ' + (L.x + 14) + ',' + (L.y - 28), 'M' + (RY.x - 13) + ',' + (RY.y - 18) + ' Q' + RY.x + ',' + (RY.y - 20) + ' ' + (RY.x + 12) + ',' + (RY.y - 25)]
  };

  function defs(uid) {
    return R.createElement('defs', null,
      // metallic sphere — light from upper-left
      R.createElement('radialGradient', { id: uid + 'bd', cx: '0.36', cy: '0.28', r: '0.95' },
        R.createElement('stop', { offset: '0', stopColor: '#ffffff' }),
        R.createElement('stop', { offset: '0.18', stopColor: '#eef3f7' }),
        R.createElement('stop', { offset: '0.42', stopColor: '#c2ccd5' }),
        R.createElement('stop', { offset: '0.62', stopColor: '#8e9aa6' }),
        R.createElement('stop', { offset: '0.82', stopColor: '#5f6b76' }),
        R.createElement('stop', { offset: '1', stopColor: '#3c454e' })),
      // bright rim light bottom-right
      R.createElement('radialGradient', { id: uid + 'rim', cx: '0.72', cy: '0.82', r: '0.5' },
        R.createElement('stop', { offset: '0', stopColor: '#dfe8ef', stopOpacity: '0.85' }),
        R.createElement('stop', { offset: '1', stopColor: '#dfe8ef', stopOpacity: '0' })),
      // cylinder shading for mouthpiece
      R.createElement('linearGradient', { id: uid + 'cyl', x1: '0', y1: '0', x2: '0', y2: '1', gradientTransform: 'rotate(38 .5 .5)' },
        R.createElement('stop', { offset: '0', stopColor: '#6b7681' }),
        R.createElement('stop', { offset: '0.28', stopColor: '#eef3f7' }),
        R.createElement('stop', { offset: '0.5', stopColor: '#c2ccd5' }),
        R.createElement('stop', { offset: '0.72', stopColor: '#7b8792' }),
        R.createElement('stop', { offset: '1', stopColor: '#454e57' })),
      R.createElement('linearGradient', { id: uid + 'ring', x1: '0', y1: '0', x2: '1', y2: '1' },
        R.createElement('stop', { offset: '0', stopColor: '#eff4f8' }),
        R.createElement('stop', { offset: '0.5', stopColor: '#9aa6b1' }),
        R.createElement('stop', { offset: '1', stopColor: '#4a535c' })),
      R.createElement('linearGradient', { id: uid + 'mt', x1: '0', y1: '0', x2: '0', y2: '1' },
        R.createElement('stop', { offset: '0', stopColor: '#2c333b' }),
        R.createElement('stop', { offset: '1', stopColor: '#12161a' })),
      R.createElement('radialGradient', { id: uid + 'glow', cx: '0.5', cy: '0.5', r: '0.5' },
        R.createElement('stop', { offset: '0', stopColor: '#fff', stopOpacity: '0.9' }),
        R.createElement('stop', { offset: '1', stopColor: '#fff', stopOpacity: '0' })),
      R.createElement('pattern', { id: uid + 'tn', width: '13', height: '13', patternUnits: 'userSpaceOnUse' },
        R.createElement('rect', { width: '13', height: '13', fill: '#1f3d2e' }),
        R.createElement('rect', { width: '13', height: '13', fill: '#10325a', opacity: '0.45' }),
        R.createElement('rect', { x: '0', width: '4', height: '13', fill: '#9b1b2e' }),
        R.createElement('rect', { y: '0', width: '13', height: '4', fill: '#9b1b2e' }),
        R.createElement('rect', { x: '8', width: '1.3', height: '13', fill: '#e7d27a', opacity: '0.8' })));
  }

  function eyeProfile(uid, c, x, y, scale, blink, delay) {
    scale = scale || 1; var ink = INK;
    if (c === 'joy') return R.createElement('path', { d: 'M' + (x - 15 * scale) + ',' + (y + 3) + ' Q' + x + ',' + (y - 15 * scale) + ' ' + (x + 15 * scale) + ',' + (y + 3), fill: 'none', stroke: ink, strokeWidth: 6 * scale, strokeLinecap: 'round' });
    if (c === 'shut') return R.createElement('path', { d: 'M' + (x - 14 * scale) + ',' + (y - 1) + ' Q' + x + ',' + (y + 9 * scale) + ' ' + (x + 14 * scale) + ',' + (y - 1), fill: 'none', stroke: ink, strokeWidth: 6 * scale, strokeLinecap: 'round' });
    var rx = 16 * scale, ry = 19 * scale, pr = 8 * scale;
    if (c === 'wide') { rx = 18 * scale; ry = 22 * scale; pr = 6.5 * scale; }
    if (c === 'narrow') { ry = 11 * scale; pr = 7 * scale; }
    if (c === 'half' || c === 'worry') ry = 16 * scale;
    var px = x - 3 * scale, py = y + 2;
    var els = [
      R.createElement('ellipse', { key: 'w', cx: x, cy: y, rx: rx, ry: ry, fill: '#fff', stroke: ink, strokeWidth: 3.5 * scale }),
      R.createElement('circle', { key: 'p', cx: px, cy: py, r: pr, fill: '#1c2127' }),
      R.createElement('circle', { key: 'g', cx: px - 3 * scale, cy: py - 3 * scale, r: 2.4 * scale, fill: '#fff' }),
      R.createElement('circle', { key: 'g2', cx: px + 2.5 * scale, cy: py + 3 * scale, r: 1.3 * scale, fill: '#fff', opacity: 0.7 })
    ];
    if (c === 'half') els.push(R.createElement('path', { key: 'l', d: 'M' + (x - rx - 1) + ',' + (y - 2) + ' a' + rx + ',' + ry + ' 0 0 1 ' + (rx * 2 + 2) + ',0 l0,-' + (ry + 4) + ' l-' + (rx * 2 + 2) + ',0 Z', fill: 'url(#' + uid + 'bd)', stroke: ink, strokeWidth: 3.5 * scale, strokeLinejoin: 'round' }));
    if (c === 'worry') els.push(R.createElement('path', { key: 'l', d: 'M' + (x - rx - 1) + ',' + (y - 5) + ' a' + rx + ',' + ry + ' 0 0 1 ' + (rx * 2 + 2) + ',0 l0,-' + (ry + 6) + ' l-' + (rx * 2 + 2) + ',0 Z', fill: 'url(#' + uid + 'bd)', stroke: ink, strokeWidth: 3.5 * scale, strokeLinejoin: 'round' }));
    if (blink) els.push(R.createElement('ellipse', { key: 'b', className: 'wc3-lid wc3-blink', style: { '--b': delay }, cx: x, cy: y, rx: rx + 1, ry: ry + 1, fill: 'url(#' + uid + 'bd)', stroke: ink, strokeWidth: 3.5 * scale }));
    return R.createElement('g', null, els);
  }

  function mouth(style) {
    var ink = INK, lip = '#d8536e', x = 130, y = 168;
    switch (style) {
      case 'smile': return R.createElement('path', { d: 'M' + (x - 22) + ',' + (y - 4) + ' Q' + x + ',' + (y + 16) + ' ' + (x + 22) + ',' + (y - 4) + ' Q' + x + ',' + (y + 6) + ' ' + (x - 22) + ',' + (y - 4) + ' Z', fill: ink });
      case 'grin': return R.createElement('g', null,
        R.createElement('path', { d: 'M' + (x - 26) + ',' + (y - 6) + ' Q' + x + ',' + (y + 22) + ' ' + (x + 26) + ',' + (y - 6) + ' Q' + x + ',' + (y + 4) + ' ' + (x - 26) + ',' + (y - 6) + ' Z', fill: ink }),
        R.createElement('path', { d: 'M' + (x - 21) + ',' + (y - 5) + ' L' + (x + 21) + ',' + (y - 5) + ' Q' + x + ',' + (y + 1) + ' ' + (x - 21) + ',' + (y - 5) + ' Z', fill: '#fff' }),
        R.createElement('path', { d: 'M' + (x - 9) + ',' + (y + 11) + ' Q' + x + ',' + (y + 16) + ' ' + (x + 9) + ',' + (y + 11) + ' Q' + x + ',' + (y + 14) + ' ' + (x - 9) + ',' + (y + 11) + ' Z', fill: lip }));
      case 'oh': return R.createElement('ellipse', { cx: x, cy: y + 2, rx: 12, ry: 15, fill: ink });
      case 'shout': return R.createElement('g', null,
        R.createElement('path', { d: 'M' + (x - 22) + ',' + (y - 6) + ' Q' + x + ',' + (y - 2) + ' ' + (x + 22) + ',' + (y - 6) + ' Q' + (x + 14) + ',' + (y + 20) + ' ' + x + ',' + (y + 20) + ' Q' + (x - 14) + ',' + (y + 20) + ' ' + (x - 22) + ',' + (y - 6) + ' Z', fill: ink }),
        R.createElement('path', { d: 'M' + (x - 18) + ',' + (y - 5) + ' L' + (x + 18) + ',' + (y - 5) + ' Q' + x + ',' + (y - 1) + ' ' + (x - 18) + ',' + (y - 5) + ' Z', fill: '#fff' }));
      case 'smirk': return R.createElement('path', { d: 'M' + (x - 20) + ',' + (y - 2) + ' Q' + (x + 4) + ',' + (y + 12) + ' ' + (x + 22) + ',' + (y - 12), fill: 'none', stroke: ink, strokeWidth: 6, strokeLinecap: 'round' });
      case 'sly': return R.createElement('path', { d: 'M' + (x - 20) + ',' + (y - 4) + ' Q' + (x - 2) + ',' + (y + 10) + ' ' + (x + 14) + ',' + (y + 2) + ' Q' + (x + 22) + ',' + (y - 1) + ' ' + (x + 24) + ',' + (y - 9), fill: 'none', stroke: ink, strokeWidth: 5.5, strokeLinecap: 'round' });
      case 'wavy': return R.createElement('path', { d: 'M' + (x - 20) + ',' + y + ' q7,-7 14,0 q7,7 14,0 q6,-6 6,-2', fill: 'none', stroke: ink, strokeWidth: 5, strokeLinecap: 'round' });
      case 'wail': return R.createElement('g', null,
        R.createElement('path', { d: 'M' + (x - 20) + ',' + (y + 4) + ' Q' + x + ',' + (y - 16) + ' ' + (x + 20) + ',' + (y + 4) + ' Q' + x + ',' + (y + 20) + ' ' + (x - 20) + ',' + (y + 4) + ' Z', fill: ink }),
        R.createElement('path', { d: 'M' + (x - 11) + ',' + (y + 4) + ' Q' + x + ',' + (y - 3) + ' ' + (x + 11) + ',' + (y + 4) + ' Q' + x + ',' + (y + 11) + ' ' + (x - 11) + ',' + (y + 4) + ' Z', fill: lip }));
      case 'soft': default: return R.createElement('path', { d: 'M' + (x - 18) + ',' + (y - 2) + ' Q' + x + ',' + (y + 10) + ' ' + (x + 18) + ',' + (y - 2), fill: 'none', stroke: ink, strokeWidth: 6, strokeLinecap: 'round' });
    }
  }

  function metalArm(uid, d, cls) {
    return R.createElement('g', { className: cls || '' },
      R.createElement('path', { d: d, fill: 'none', stroke: INK, strokeWidth: 13, strokeLinecap: 'round' }),
      R.createElement('path', { d: d, fill: 'none', stroke: 'url(#' + uid + 'ring)', strokeWidth: 8, strokeLinecap: 'round' }));
  }
  function mitt(x, y) {
    return R.createElement('g', null,
      R.createElement('circle', { cx: x, cy: y, r: 11, fill: 'url(#' + (window.__wc3uid || 'x') + 'bd)', stroke: INK, strokeWidth: 4 }));
  }

  function arms(uid, style) {
    // anchored at body sides (~70,150) and (~198,150)
    switch (style) {
      case 'up': return R.createElement('g', null,
        metalArm(uid, 'M78,156 Q50,140 44,108', 'wc3-arm-l'), handBall(uid, 44, 104),
        metalArm(uid, 'M192,156 Q220,138 230,104', 'wc3-arm-r'), handBall(uid, 230, 100));
      case 'wave': return R.createElement('g', null,
        metalArm(uid, 'M78,158 Q56,150 50,176', ''), handBall(uid, 50, 180),
        R.createElement('g', { className: 'wc3-wave' }, metalArm(uid, 'M192,154 Q220,134 232,100', ''), handBall(uid, 232, 96)));
      case 'hip': return R.createElement('g', null,
        metalArm(uid, 'M80,168 Q60,180 70,196', ''), handBall(uid, 72, 198),
        metalArm(uid, 'M190,168 Q210,180 200,196', ''), handBall(uid, 198, 198));
      case 'startle': return R.createElement('g', null,
        metalArm(uid, 'M78,150 Q52,142 40,150', ''), handBall(uid, 38, 150),
        metalArm(uid, 'M192,150 Q218,142 230,150', ''), handBall(uid, 232, 150));
      case 'fidget': return R.createElement('g', null,
        metalArm(uid, 'M82,170 Q72,184 84,192', ''), handBall(uid, 86, 194),
        metalArm(uid, 'M188,170 Q198,184 186,192', ''), handBall(uid, 184, 194));
      case 'card': return R.createElement('g', null,
        metalArm(uid, 'M80,168 Q58,176 66,194', ''), handBall(uid, 68, 196),
        R.createElement('g', { transform: 'rotate(-12 214 96)' },
          metalArm(uid, 'M192,150 Q214,128 214,104', ''),
          R.createElement('rect', { x: '202', y: '70', width: '24', height: '34', rx: '4', fill: '#E8272A', stroke: INK, strokeWidth: '4' })));
      case 'face': return R.createElement('g', null,
        metalArm(uid, 'M84,156 Q72,166 92,172', ''), handBall(uid, 96, 172),
        metalArm(uid, 'M186,156 Q198,166 178,172', ''), handBall(uid, 174, 172));
      case 'rub': return R.createElement('g', null,
        metalArm(uid, 'M84,172 Q72,182 90,190', ''), handBall(uid, 94, 191),
        metalArm(uid, 'M186,172 Q198,182 180,190', ''), handBall(uid, 176, 191));
      case 'rest': default: return R.createElement('g', null,
        metalArm(uid, 'M80,166 Q64,178 72,192', 'wc3-arm-l'), handBall(uid, 74, 194),
        metalArm(uid, 'M190,166 Q206,178 198,192', 'wc3-arm-r'), handBall(uid, 196, 194));
    }
  }
  function handBall(uid, x, y) { return R.createElement('circle', { cx: x, cy: y, r: 11, fill: 'url(#' + uid + 'bd)', stroke: INK, strokeWidth: 4 }); }

  function star(cx, cy, s, fill, cls) {
    return R.createElement('path', { className: cls, transform: 'translate(' + cx + ',' + cy + ')', d: 'M0,' + (-s) + ' L' + (s * .3) + ',' + (-s * .3) + ' L' + s + ',0 L' + (s * .3) + ',' + (s * .3) + ' L0,' + s + ' L' + (-s * .3) + ',' + (s * .3) + ' L' + (-s) + ',0 L' + (-s * .3) + ',' + (-s * .3) + ' Z', fill: fill, stroke: INK, strokeWidth: 1.4 });
  }

  function fx(uid, kind) {
    switch (kind) {
      case 'spark': return R.createElement('g', null, star(46, 60, 8, '#F5C800', 'wc3-tw'), star(214, 58, 7, '#F5C800', 'wc3-tw d1'), star(206, 150, 5, '#F5C800', 'wc3-tw d2'), star(54, 150, 5, '#F5C800', 'wc3-tw d1'));
      case 'spark1': return star(196, 150, 7, '#F5C800', 'wc3-tw');
      case 'bolt': return R.createElement('g', { stroke: '#E8272A', strokeWidth: 4.5, strokeLinecap: 'round' }, R.createElement('line', { x1: '134', y1: '46', x2: '134', y2: '30' }), R.createElement('line', { x1: '168', y1: '54', x2: '180', y2: '42' }), R.createElement('line', { x1: '100', y1: '54', x2: '88', y2: '42' }));
      case 'sweat': return R.createElement('ellipse', { className: 'wc3-drip', cx: '186', cy: '100', rx: '5.5', ry: '9', fill: '#5BB6E8', stroke: INK, strokeWidth: '1.5' });
      case 'tears': return R.createElement('g', null,
        R.createElement('ellipse', { className: 'wc3-drip', cx: L.x - 2, cy: L.y + 22, rx: '5.5', ry: '9', fill: '#5BB6E8', stroke: INK, strokeWidth: '1.5' }),
        R.createElement('ellipse', { className: 'wc3-drip', cx: RY.x, cy: RY.y + 22, rx: '5', ry: '8', fill: '#5BB6E8', stroke: INK, strokeWidth: '1.5', style: { animationDelay: '.7s' } }));
      case 'steam': return R.createElement('g', { transform: 'translate(196,80)', fill: '#cfd8df' },
        R.createElement('circle', { className: 'wc3-puff', cx: '0', cy: '0', r: '6' }),
        R.createElement('circle', { className: 'wc3-puff', cx: '2', cy: '10', r: '5', style: { animationDelay: '.4s' } }));
      default: return null;
    }
  }

  function tam(uid) {
    var cx = B.x, top = B.y - B.r;
    return R.createElement('g', { transform: 'translate(' + cx + ',' + (top - 2) + ') rotate(-15) translate(' + (-cx) + ',' + (-(top - 2)) + ')' },
      R.createElement('ellipse', { cx: cx, cy: top - 8, rx: 56, ry: 22, fill: '#262a31' }),
      R.createElement('ellipse', { cx: cx - 14, cy: top - 14, rx: 28, ry: 10, fill: '#363d47', opacity: .85 }),
      R.createElement('path', { d: 'M' + (cx - 50) + ',' + (top + 2) + ' Q' + cx + ',' + (top + 18) + ' ' + (cx + 50) + ',' + (top + 2) + ' L' + (cx + 50) + ',' + (top + 10) + ' Q' + cx + ',' + (top + 26) + ' ' + (cx - 50) + ',' + (top + 10) + ' Z', fill: 'url(#' + uid + 'tn)', stroke: INK, strokeWidth: 3 }),
      R.createElement('ellipse', { cx: cx, cy: top + 2, rx: 50, ry: 13, fill: 'none', stroke: INK, strokeWidth: 3 }),
      R.createElement('circle', { cx: cx, cy: top - 26, r: 9, fill: '#E8272A', stroke: INK, strokeWidth: 3 }),
      R.createElement('circle', { cx: cx - 3, cy: top - 29, r: 2.4, fill: '#ff8a98' }));
  }

  function WheeshtChrome(props) {
    var mood = resolve(props.mood);
    var c = CFG[mood];
    var size = props.size || 170;
    var animate = !!props.animate;
    var uid = R.useMemo(function () { return 'c' + Math.random().toString(36).slice(2, 8); }, []);
    window.__wc3uid = uid;
    var delay = R.useMemo(function () { return (4.4 + Math.random() * 2.4).toFixed(2) + 's'; }, []);
    var canBlink = animate && (c.e === 'open' || c.e === 'half' || c.e === 'wide' || c.e === 'narrow' || c.e === 'worry');
    var scottish = mood === 'scottish';

    var body = R.createElement('g', { className: 'wc3-stage' + (animate ? ' wc3-a-' + c.anim : '') },
      animate && c.fx === 'toot' ? R.createElement('g', { className: 'wc3-toot' },
        R.createElement('path', { d: 'M60,176 q-12,2 -12,9 q0,7 12,9', fill: 'none', stroke: '#9fb0bd', strokeWidth: 4, strokeLinecap: 'round' }),
        R.createElement('path', { d: 'M50,184 q-7,2 -7,4', fill: 'none', stroke: '#9fb0bd', strokeWidth: 3.5, strokeLinecap: 'round', opacity: .6 })) : null,
      // arms behind body
      arms(uid, c.arms),
      // legs + ref boots
      R.createElement('g', null,
        R.createElement('rect', { x: B.x - 26, y: B.y + B.r - 16, width: 15, height: 32, rx: 7.5, fill: 'url(#' + uid + 'cyl)', stroke: INK, strokeWidth: 5 }),
        R.createElement('rect', { x: B.x + 11, y: B.y + B.r - 16, width: 15, height: 32, rx: 7.5, fill: 'url(#' + uid + 'cyl)', stroke: INK, strokeWidth: 5 }),
        R.createElement('path', { d: 'M' + (B.x - 38) + ',' + (B.y + B.r + 16) + ' q-2,-13 17,-13 l9,0 0,13 Z', fill: INK }),
        R.createElement('path', { d: 'M' + (B.x + 30) + ',' + (B.y + B.r + 16) + ' q-2,-13 17,-13 l9,0 0,13 Z', fill: INK }),
        R.createElement('rect', { x: B.x - 40, y: B.y + B.r + 14, width: 26, height: 5, rx: 2, fill: '#fff', opacity: .85 }),
        R.createElement('rect', { x: B.x + 28, y: B.y + B.r + 14, width: 26, height: 5, rx: 2, fill: '#fff', opacity: .85 })),

      // ---- 3D mouthpiece (cylinder angled down-left) ----
      R.createElement('g', { transform: 'rotate(30 78 168)' },
        R.createElement('rect', { x: 18, y: 150, width: 70, height: 38, rx: 19, fill: 'url(#' + uid + 'cyl)', stroke: INK, strokeWidth: 6 }),
        R.createElement('ellipse', { cx: 24, cy: 169, rx: 7, ry: 16, fill: 'url(#' + uid + 'mt)', stroke: INK, strokeWidth: 4 }),
        R.createElement('rect', { x: 40, y: 145, width: 26, height: 9, rx: 3, fill: 'url(#' + uid + 'mt)', stroke: INK, strokeWidth: 3 })),

      // ---- spherical chamber (the head/body) ----
      R.createElement('circle', { cx: B.x, cy: B.y, r: B.r, fill: 'url(#' + uid + 'bd)', stroke: INK, strokeWidth: 6 }),
      R.createElement('circle', { cx: B.x, cy: B.y, r: B.r - 3, fill: 'url(#' + uid + 'rim)' }),
      // equator reflection band (chrome horizon)
      R.createElement('path', { d: 'M' + (B.x - B.r + 6) + ',' + (B.y + 16) + ' Q' + B.x + ',' + (B.y + 6) + ' ' + (B.x + B.r - 6) + ',' + (B.y + 16) + ' Q' + B.x + ',' + (B.y + 30) + ' ' + (B.x - B.r + 6) + ',' + (B.y + 16) + ' Z', fill: '#eef4f8', opacity: .5 }),
      R.createElement('path', { d: 'M' + (B.x - B.r + 10) + ',' + (B.y + 34) + ' Q' + B.x + ',' + (B.y + 44) + ' ' + (B.x + B.r - 10) + ',' + (B.y + 34), fill: 'none', stroke: '#39424b', strokeWidth: 3, opacity: .35 }),
      // primary specular highlight
      R.createElement('ellipse', { cx: B.x - 22, cy: B.y - 28, rx: 20, ry: 13, fill: 'url(#' + uid + 'glow)', transform: 'rotate(-24 ' + (B.x - 22) + ' ' + (B.y - 28) + ')' }),
      R.createElement('circle', { cx: B.x + 26, cy: B.y + 24, r: 6, fill: '#fff', opacity: .5 }),
      // sound window on upper body
      R.createElement('path', { d: 'M' + (B.x - 8) + ',' + (B.y - B.r + 14) + ' l26,-4 0,13 -26,5 Z', fill: 'url(#' + uid + 'mt)', stroke: INK, strokeWidth: 3.2, strokeLinejoin: 'round' }),

      // ---- 3D finger-grip ring on top-right ----
      R.createElement('g', { transform: 'translate(' + (B.x + 30) + ',' + (B.y - B.r + 4) + ')' },
        R.createElement('path', { d: 'M0,6 q10,-30 30,-10 q14,16 -2,30', fill: 'none', stroke: INK, strokeWidth: 11, strokeLinecap: 'round' }),
        R.createElement('path', { d: 'M0,6 q10,-28 30,-10 q12,15 -2,28', fill: 'none', stroke: 'url(#' + uid + 'ring)', strokeWidth: 6, strokeLinecap: 'round' })),

      // tartan band on the mouthpiece for scottish
      scottish ? R.createElement('g', { transform: 'rotate(30 78 168)' }, R.createElement('rect', { x: 52, y: 150, width: 12, height: 38, fill: 'url(#' + uid + 'tn)', stroke: INK, strokeWidth: 2.5 })) : null,
      animate && c.fx ? fx(uid, c.fx) : (c.fx === 'spark' || c.fx === 'bolt' ? fx(uid, c.fx) : null),

      // cheeks
      scottish
        ? R.createElement('g', null, saltCheek(L.x - 4, L.y + 22), saltCheek(RY.x + 2, RY.y + 22, .85))
        : R.createElement('g', null,
            R.createElement('ellipse', { cx: L.x - 2, cy: L.y + 22, rx: 11, ry: 8, fill: '#F0708F', opacity: .5 }),
            R.createElement('ellipse', { cx: RY.x + 2, cy: RY.y + 22, rx: 9, ry: 7, fill: '#F0708F', opacity: .45 })),
      // eyes (right eye smaller = far side of 3/4)
      eyeProfile(uid, c.e, L.x, L.y, 1, canBlink, delay),
      eyeProfile(uid, c.e, RY.x, RY.y, 0.82, canBlink, delay),
      // brows
      R.createElement('path', { d: BROWS[c.brow][0], fill: 'none', stroke: INK, strokeWidth: 6, strokeLinecap: 'round' }),
      R.createElement('path', { d: BROWS[c.brow][1], fill: 'none', stroke: INK, strokeWidth: 5, strokeLinecap: 'round' }),
      mouth(c.m),
      scottish ? tam(uid) : null
    );

    return R.createElement('svg', { className: 'wc3-svg', viewBox: '0 0 268 250', width: size, height: size * (250 / 268), style: { display: 'block' } },
      defs(uid),
      R.createElement('ellipse', { cx: B.x, cy: 236, rx: 64, ry: 11, fill: '#1A1A1A', opacity: .15 }),
      R.createElement('g', { className: animate ? 'wc3-breathe' : '' }, body));
  }
  function saltCheek(cx, cy, s) {
    s = s || 1;
    return R.createElement('g', { transform: 'translate(' + (cx - 10 * s) + ',' + (cy - 7 * s) + ') scale(' + s + ')' },
      R.createElement('rect', { x: 0, y: 0, width: 20, height: 14, rx: 3, fill: '#0a4aa0', opacity: .92 }),
      R.createElement('path', { d: 'M0,0 L20,14 M20,0 L0,14', stroke: '#fff', strokeWidth: 3 }));
  }

  window.WheeshtChrome = WheeshtChrome;
})();
