/* ===========================================================================
   WHEESHT — REFEREE WHISTLE MASCOT (side profile)
   The silhouette reads as a real ref whistle seen side-on: round resonating
   chamber (the head/body), a tapered mouthpiece projecting left, the
   rectangular sound-window cut into the top at the junction, and a finger
   ring on top. Bold uniform black outline, flat grey fills, rubber-hose arms
   with white gloves and big shoes. Ten animated moods. The Scottish mood adds
   a neatly-cocked tam + saltire cheeks WITHOUT breaking the whistle outline.
   Exports window.WheeshtMascot (also aliased to window.Wheesht).
   =========================================================================== */
(function () {
  var R = window.React;

  if (!document.getElementById('wheesht-mascot-css')) {
    var css = document.createElement('style'); css.id = 'wheesht-mascot-css';
    css.textContent = [
      '.wm-svg{overflow:visible;display:block}',
      '.wm-breathe{transform-box:fill-box;transform-origin:50% 92%;animation:wmBreathe 3.4s ease-in-out infinite}',
      '@keyframes wmBreathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-2px) scale(1.012,1.022)}}',
      '.wm-stage{transform-box:fill-box;transform-origin:50% 92%}',
      '.wm-a-idle{animation:wmIdle 4s ease-in-out infinite}',
      '@keyframes wmIdle{0%,100%{transform:translateY(0) rotate(-1.5deg)}50%{transform:translateY(-5px) rotate(1.5deg)}}',
      '.wm-a-bounce{animation:wmBounce 1s cubic-bezier(.3,.7,.3,1) infinite}',
      '@keyframes wmBounce{0%,100%{transform:translateY(0) rotate(-3deg) scale(1)}30%{transform:translateY(-18px) rotate(3deg) scale(1.05,.95)}55%{transform:translateY(3px) rotate(-1deg) scale(.96,1.04)}}',
      '.wm-a-jitter{animation:wmJitter .3s ease-in-out infinite}',
      '@keyframes wmJitter{0%,100%{transform:translate(0,0) rotate(0)}25%{transform:translate(-2px,.5px) rotate(-1.4deg)}75%{transform:translate(2px,.5px) rotate(1.4deg)}}',
      '.wm-a-throb{animation:wmThrob .55s ease-in-out infinite}',
      '@keyframes wmThrob{0%,100%{transform:scale(1) rotate(-1deg)}50%{transform:scale(1.06,.96) rotate(1.5deg)}}',
      '.wm-a-sway{animation:wmSway 3.2s ease-in-out infinite}',
      '@keyframes wmSway{0%,100%{transform:translateY(2px) rotate(-3.5deg)}50%{transform:translateY(4px) rotate(3.5deg)}}',
      '.wm-a-lean{animation:wmLean 2.8s ease-in-out infinite}',
      '@keyframes wmLean{0%,100%{transform:rotate(-4deg) translateX(-1px)}50%{transform:rotate(3deg) translateX(2px)}}',
      '.wm-a-pop{animation:wmPop .5s cubic-bezier(.2,1.5,.4,1) both, wmFloat 2.8s ease-in-out .5s infinite}',
      '@keyframes wmPop{0%{transform:scale(.6) translateY(10px)}100%{transform:scale(1) translateY(0)}}',
      '@keyframes wmFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}',
      '.wm-lid{transform-box:fill-box;transform-origin:50% 0;transform:scaleY(0)}',
      '.wm-blink{animation:wmBlink var(--b,5s) ease-in-out infinite}',
      '@keyframes wmBlink{0%,93%,100%{transform:scaleY(0)}96%,97.5%{transform:scaleY(1)}}',
      '.wm-armL{transform-box:fill-box;transform-origin:90% 8%;animation:wmArmL 3s ease-in-out infinite}',
      '@keyframes wmArmL{0%,100%{transform:rotate(0)}50%{transform:rotate(-10deg)}}',
      '.wm-armR{transform-box:fill-box;transform-origin:10% 8%;animation:wmArmR 3s ease-in-out infinite}',
      '@keyframes wmArmR{0%,100%{transform:rotate(0)}50%{transform:rotate(10deg)}}',
      '.wm-wave{transform-box:fill-box;transform-origin:10% 95%;animation:wmWave 1s ease-in-out infinite}',
      '@keyframes wmWave{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(18deg)}}',
      '.wm-drip{transform-box:fill-box;transform-origin:50% 0;animation:wmDrip 1.8s ease-in infinite}',
      '@keyframes wmDrip{0%{transform:translateY(0) scaleY(.6);opacity:0}30%{opacity:1}100%{transform:translateY(26px) scaleY(1);opacity:0}}',
      '.wm-tw{transform-box:fill-box;transform-origin:center;animation:wmTw 1.4s ease-in-out infinite}',
      '@keyframes wmTw{0%,100%{transform:scale(.4);opacity:.2}50%{transform:scale(1);opacity:1}}',
      '.wm-tw.d1{animation-delay:.5s}.wm-tw.d2{animation-delay:.9s}',
      '.wm-toot{transform-box:fill-box;transform-origin:100% 50%;animation:wmToot 1.1s ease-out infinite}',
      '@keyframes wmToot{0%{transform:scale(.3) translate(0,0);opacity:0}30%{opacity:.9}100%{transform:scale(1.2) translate(-18px,0);opacity:0}}',
      '.wm-puff{transform-box:fill-box;transform-origin:0 50%;animation:wmPuff 1.1s ease-out infinite}',
      '@keyframes wmPuff{0%{transform:scale(.3);opacity:0}30%{opacity:.9}100%{transform:scale(1.4) translateX(12px);opacity:0}}'
    ].join('\n');
    document.head.appendChild(css);
  }

  var INK = '#15181c';
  var SW = 7;
  var CANON = ['neutral', 'happy', 'celebrating', 'shocked', 'nervous', 'confident', 'angry', 'crying', 'mischievous', 'scottish'];
  var ALIAS = { welcome: 'happy', smug: 'confident', outraged: 'shocked', delighted: 'celebrating', suspicious: 'mischievous', wounded: 'crying', solemn: 'neutral', broadcast: 'confident', drumroll: 'nervous' };
  function resolve(m) { if (CANON.indexOf(m) >= 0) return m; if (ALIAS[m]) return ALIAS[m]; return 'neutral'; }

  // whistle geometry — chamber centre + face anchors (face on the round body)
  var BC = { x: 162, y: 128, rx: 60, ry: 58 };   // body / resonating chamber
  var L = { x: 146, y: 120 }, RY = { x: 182, y: 120 };  // eyes
  var MX = 164, MY = 152;                                // mouth centre

  var CFG = {
    neutral:     { e: 'open',  brow: 'rest',  m: 'soft',  arms: 'rest',    anim: 'idle',   fx: null },
    happy:       { e: 'open',  brow: 'up',    m: 'smile', arms: 'thumbs',  anim: 'idle',   fx: null },
    celebrating: { e: 'joy',   brow: 'up',    m: 'grin',  arms: 'up',      anim: 'bounce', fx: 'spark' },
    shocked:     { e: 'wide',  brow: 'high',  m: 'oh',    arms: 'startle', anim: 'pop',    fx: 'bolt' },
    nervous:     { e: 'worry', brow: 'worry', m: 'wavy',  arms: 'fidget',  anim: 'jitter', fx: 'sweat' },
    confident:   { e: 'half',  brow: 'cocky', m: 'smirk', arms: 'hip',     anim: 'idle',   fx: 'toot' },
    angry:       { e: 'narrow',brow: 'angry', m: 'shout', arms: 'card',    anim: 'throb',  fx: 'steam' },
    crying:      { e: 'shut',  brow: 'sad',   m: 'wail',  arms: 'face',    anim: 'sway',   fx: 'tears' },
    mischievous: { e: 'half',  brow: 'sly',   m: 'sly',   arms: 'rub',     anim: 'lean',   fx: 'spark1' },
    scottish:    { e: 'joy',   brow: 'up',    m: 'grin',  arms: 'wave',    anim: 'bounce', fx: 'spark' }
  };

  var BROWS = {
    rest:  ['M' + (L.x - 15) + ',' + (L.y - 20) + ' Q' + L.x + ',' + (L.y - 26) + ' ' + (L.x + 13) + ',' + (L.y - 20), 'M' + (RY.x - 13) + ',' + (RY.y - 20) + ' Q' + RY.x + ',' + (RY.y - 26) + ' ' + (RY.x + 15) + ',' + (RY.y - 20)],
    up:    ['M' + (L.x - 15) + ',' + (L.y - 24) + ' Q' + L.x + ',' + (L.y - 34) + ' ' + (L.x + 13) + ',' + (L.y - 25), 'M' + (RY.x - 13) + ',' + (RY.y - 25) + ' Q' + RY.x + ',' + (RY.y - 34) + ' ' + (RY.x + 15) + ',' + (RY.y - 24)],
    high:  ['M' + (L.x - 15) + ',' + (L.y - 28) + ' Q' + L.x + ',' + (L.y - 38) + ' ' + (L.x + 13) + ',' + (L.y - 29), 'M' + (RY.x - 13) + ',' + (RY.y - 29) + ' Q' + RY.x + ',' + (RY.y - 38) + ' ' + (RY.x + 15) + ',' + (RY.y - 28)],
    worry: ['M' + (L.x - 15) + ',' + (L.y - 22) + ' Q' + L.x + ',' + (L.y - 28) + ' ' + (L.x + 13) + ',' + (L.y - 25), 'M' + (RY.x - 13) + ',' + (RY.y - 20) + ' Q' + RY.x + ',' + (RY.y - 25) + ' ' + (RY.x + 15) + ',' + (RY.y - 22)],
    cocky: ['M' + (L.x - 15) + ',' + (L.y - 20) + ' Q' + L.x + ',' + (L.y - 22) + ' ' + (L.x + 13) + ',' + (L.y - 28), 'M' + (RY.x - 13) + ',' + (RY.y - 19) + ' Q' + RY.x + ',' + (RY.y - 21) + ' ' + (RY.x + 15) + ',' + (RY.y - 27)],
    angry: ['M' + (L.x - 16) + ',' + (L.y - 26) + ' L' + (L.x + 13) + ',' + (L.y - 13), 'M' + (RY.x + 16) + ',' + (RY.y - 26) + ' L' + (RY.x - 13) + ',' + (RY.y - 13)],
    sad:   ['M' + (L.x - 14) + ',' + (L.y - 14) + ' Q' + L.x + ',' + (L.y - 26) + ' ' + (L.x + 14) + ',' + (L.y - 20), 'M' + (RY.x - 14) + ',' + (RY.y - 20) + ' Q' + RY.x + ',' + (RY.y - 26) + ' ' + (RY.x + 16) + ',' + (RY.y - 14)],
    sly:   ['M' + (L.x - 15) + ',' + (L.y - 18) + ' Q' + L.x + ',' + (L.y - 21) + ' ' + (L.x + 13) + ',' + (L.y - 27), 'M' + (RY.x - 13) + ',' + (RY.y - 18) + ' Q' + RY.x + ',' + (RY.y - 20) + ' ' + (RY.x + 15) + ',' + (RY.y - 26)]
  };

  function defs(uid) {
    return R.createElement('defs', null,
      R.createElement('linearGradient', { id: uid + 'g', x1: '0', y1: '0', x2: '0', y2: '1' },
        R.createElement('stop', { offset: '0', stopColor: '#dde2e7' }),
        R.createElement('stop', { offset: '0.5', stopColor: '#bcc4cc' }),
        R.createElement('stop', { offset: '1', stopColor: '#98a2ab' })),
      R.createElement('linearGradient', { id: uid + 'gm', x1: '0', y1: '0', x2: '0', y2: '1' },
        R.createElement('stop', { offset: '0', stopColor: '#c9d0d7' }),
        R.createElement('stop', { offset: '1', stopColor: '#8b95a0' })),
      R.createElement('pattern', { id: uid + 'tn', width: '13', height: '13', patternUnits: 'userSpaceOnUse' },
        R.createElement('rect', { width: '13', height: '13', fill: '#1f3d2e' }),
        R.createElement('rect', { width: '13', height: '13', fill: '#10325a', opacity: '0.45' }),
        R.createElement('rect', { x: '0', width: '4', height: '13', fill: '#9b1b2e' }),
        R.createElement('rect', { y: '0', width: '13', height: '4', fill: '#9b1b2e' }),
        R.createElement('rect', { x: '8', width: '1.3', height: '13', fill: '#e7d27a', opacity: '0.8' })));
  }

  function eye(uid, c, x, y, scale, blink, delay) {
    scale = scale || 1; var ink = INK;
    if (c === 'joy') return R.createElement('path', { d: 'M' + (x - 14 * scale) + ',' + (y + 3) + ' Q' + x + ',' + (y - 14 * scale) + ' ' + (x + 14 * scale) + ',' + (y + 3), fill: 'none', stroke: ink, strokeWidth: 6 * scale, strokeLinecap: 'round' });
    if (c === 'shut') return R.createElement('path', { d: 'M' + (x - 13 * scale) + ',' + (y - 1) + ' Q' + x + ',' + (y + 8 * scale) + ' ' + (x + 13 * scale) + ',' + (y - 1), fill: 'none', stroke: ink, strokeWidth: 6 * scale, strokeLinecap: 'round' });
    var rx = 14 * scale, ry = 17 * scale, pr = 7.5 * scale;
    if (c === 'wide') { rx = 16 * scale; ry = 20 * scale; pr = 6 * scale; }
    if (c === 'narrow') { ry = 10 * scale; pr = 6.5 * scale; }
    if (c === 'half' || c === 'worry') ry = 14 * scale;
    var px = x, py = y + 2;
    var els = [
      R.createElement('ellipse', { key: 'w', cx: x, cy: y, rx: rx, ry: ry, fill: '#fff', stroke: ink, strokeWidth: 4 * scale }),
      R.createElement('circle', { key: 'p', cx: px, cy: py, r: pr, fill: '#15181c' }),
      R.createElement('circle', { key: 'g', cx: px - 2.5 * scale, cy: py - 3 * scale, r: 2.4 * scale, fill: '#fff' })
    ];
    if (c === 'half') els.push(R.createElement('path', { key: 'l', d: 'M' + (x - rx - 1) + ',' + (y - 2) + ' a' + rx + ',' + ry + ' 0 0 1 ' + (rx * 2 + 2) + ',0 l0,-' + (ry + 4) + ' l-' + (rx * 2 + 2) + ',0 Z', fill: 'url(#' + uid + 'g)', stroke: ink, strokeWidth: 4 * scale, strokeLinejoin: 'round' }));
    if (c === 'worry') els.push(R.createElement('path', { key: 'l', d: 'M' + (x - rx - 1) + ',' + (y - 5) + ' a' + rx + ',' + ry + ' 0 0 1 ' + (rx * 2 + 2) + ',0 l0,-' + (ry + 6) + ' l-' + (rx * 2 + 2) + ',0 Z', fill: 'url(#' + uid + 'g)', stroke: ink, strokeWidth: 4 * scale, strokeLinejoin: 'round' }));
    if (blink) els.push(R.createElement('ellipse', { key: 'b', className: 'wm-lid wm-blink', style: { '--b': delay }, cx: x, cy: y, rx: rx + 1, ry: ry + 1, fill: 'url(#' + uid + 'g)', stroke: ink, strokeWidth: 4 * scale }));
    return R.createElement('g', null, els);
  }

  function mouth(style) {
    var ink = INK, lip = '#d8536e', x = MX, y = MY;
    switch (style) {
      case 'smile': return R.createElement('path', { d: 'M' + (x - 22) + ',' + (y - 4) + ' Q' + x + ',' + (y + 16) + ' ' + (x + 22) + ',' + (y - 4) + ' Q' + x + ',' + (y + 6) + ' ' + (x - 22) + ',' + (y - 4) + ' Z', fill: ink });
      case 'grin': return R.createElement('g', null,
        R.createElement('path', { d: 'M' + (x - 26) + ',' + (y - 6) + ' Q' + x + ',' + (y + 22) + ' ' + (x + 26) + ',' + (y - 6) + ' Q' + x + ',' + (y + 4) + ' ' + (x - 26) + ',' + (y - 6) + ' Z', fill: ink }),
        R.createElement('path', { d: 'M' + (x - 21) + ',' + (y - 5) + ' L' + (x + 21) + ',' + (y - 5) + ' Q' + x + ',' + (y + 1) + ' ' + (x - 21) + ',' + (y - 5) + ' Z', fill: '#fff' }),
        R.createElement('path', { d: 'M' + (x - 9) + ',' + (y + 11) + ' Q' + x + ',' + (y + 16) + ' ' + (x + 9) + ',' + (y + 11) + ' Q' + x + ',' + (y + 14) + ' ' + (x - 9) + ',' + (y + 11) + ' Z', fill: lip }));
      case 'oh': return R.createElement('ellipse', { cx: x, cy: y + 2, rx: 11, ry: 14, fill: ink });
      case 'shout': return R.createElement('g', null,
        R.createElement('path', { d: 'M' + (x - 21) + ',' + (y - 6) + ' Q' + x + ',' + (y - 2) + ' ' + (x + 21) + ',' + (y - 6) + ' Q' + (x + 13) + ',' + (y + 19) + ' ' + x + ',' + (y + 19) + ' Q' + (x - 13) + ',' + (y + 19) + ' ' + (x - 21) + ',' + (y - 6) + ' Z', fill: ink }),
        R.createElement('path', { d: 'M' + (x - 17) + ',' + (y - 5) + ' L' + (x + 17) + ',' + (y - 5) + ' Q' + x + ',' + (y - 1) + ' ' + (x - 17) + ',' + (y - 5) + ' Z', fill: '#fff' }));
      case 'smirk': return R.createElement('path', { d: 'M' + (x - 19) + ',' + (y - 2) + ' Q' + (x + 4) + ',' + (y + 12) + ' ' + (x + 21) + ',' + (y - 12), fill: 'none', stroke: ink, strokeWidth: 6, strokeLinecap: 'round' });
      case 'sly': return R.createElement('path', { d: 'M' + (x - 19) + ',' + (y - 4) + ' Q' + (x - 2) + ',' + (y + 10) + ' ' + (x + 13) + ',' + (y + 2) + ' Q' + (x + 21) + ',' + (y - 1) + ' ' + (x + 23) + ',' + (y - 9), fill: 'none', stroke: ink, strokeWidth: 5.5, strokeLinecap: 'round' });
      case 'wavy': return R.createElement('path', { d: 'M' + (x - 19) + ',' + y + ' q7,-7 13,0 q7,7 13,0 q6,-6 6,-2', fill: 'none', stroke: ink, strokeWidth: 5, strokeLinecap: 'round' });
      case 'wail': return R.createElement('g', null,
        R.createElement('path', { d: 'M' + (x - 19) + ',' + (y + 4) + ' Q' + x + ',' + (y - 15) + ' ' + (x + 19) + ',' + (y + 4) + ' Q' + x + ',' + (y + 19) + ' ' + (x - 19) + ',' + (y + 4) + ' Z', fill: ink }),
        R.createElement('path', { d: 'M' + (x - 10) + ',' + (y + 4) + ' Q' + x + ',' + (y - 2) + ' ' + (x + 10) + ',' + (y + 4) + ' Q' + x + ',' + (y + 10) + ' ' + (x - 10) + ',' + (y + 4) + ' Z', fill: lip }));
      case 'soft': default: return R.createElement('path', { d: 'M' + (x - 17) + ',' + (y - 2) + ' Q' + x + ',' + (y + 9) + ' ' + (x + 17) + ',' + (y - 2), fill: 'none', stroke: ink, strokeWidth: 6, strokeLinecap: 'round' });
    }
  }

  function hose(uid, d, cls) {
    return R.createElement('g', { className: cls || '' },
      R.createElement('path', { d: d, fill: 'none', stroke: INK, strokeWidth: 15, strokeLinecap: 'round' }),
      R.createElement('path', { d: d, fill: 'none', stroke: 'url(#' + uid + 'gm)', strokeWidth: 8, strokeLinecap: 'round' }));
  }
  function glove(x, y, kind) {
    var els = [R.createElement('circle', { key: 'g', cx: x, cy: y, r: 14, fill: '#fff', stroke: INK, strokeWidth: 5 })];
    if (kind === 'thumb') els.push(R.createElement('path', { key: 't', d: 'M' + (x - 3) + ',' + (y - 11) + ' q-7,-9 1,-15 q6,-3 8,4 l-1,11', fill: '#fff', stroke: INK, strokeWidth: 5, strokeLinejoin: 'round' }));
    else els.push(R.createElement('path', { key: 'k', d: 'M' + (x - 8) + ',' + (y - 2) + ' q8,5 16,0', fill: 'none', stroke: INK, strokeWidth: 3, strokeLinecap: 'round', opacity: .5 }));
    return R.createElement('g', null, els);
  }

  // shoulders: left lower-left of chamber, right at chamber right
  function arms(uid, style) {
    switch (style) {
      case 'up': return R.createElement('g', null,
        hose(uid, 'M118,156 Q92,138 88,108', 'wm-armL'), glove(86, 102, 'thumb'),
        hose(uid, 'M212,140 Q238,124 244,96', 'wm-armR'), glove(246, 90, 'thumb'));
      case 'thumbs': return R.createElement('g', null,
        hose(uid, 'M116,160 Q98,172 102,190', ''), glove(102, 194, 'thumb'),
        hose(uid, 'M212,142 Q236,134 240,108', ''), glove(242, 102, 'thumb'));
      case 'wave': return R.createElement('g', null,
        hose(uid, 'M116,162 Q98,174 102,192', ''), glove(102, 196, 'thumb'),
        R.createElement('g', { className: 'wm-wave' }, hose(uid, 'M212,138 Q240,120 248,92', ''), glove(250, 86, 'thumb')));
      case 'hip': return R.createElement('g', null,
        hose(uid, 'M118,166 Q100,178 110,194', ''), glove(112, 198, ''),
        hose(uid, 'M210,156 Q230,168 220,194', ''), glove(222, 198, ''));
      case 'startle': return R.createElement('g', null,
        hose(uid, 'M116,150 Q90,142 80,150', ''), glove(76, 150, ''),
        hose(uid, 'M212,140 Q240,132 250,142', ''), glove(254, 144, ''));
      case 'fidget': return R.createElement('g', null,
        hose(uid, 'M120,166 Q110,180 122,188', ''), glove(126, 192, ''),
        hose(uid, 'M210,156 Q222,170 210,180', ''), glove(206, 184, ''));
      case 'card': return R.createElement('g', null,
        hose(uid, 'M118,164 Q100,174 108,192', ''), glove(110, 196, ''),
        R.createElement('g', { transform: 'rotate(-10 240 96)' },
          hose(uid, 'M212,138 Q234,116 234,96', ''),
          R.createElement('rect', { x: '222', y: '60', width: '24', height: '34', rx: '4', fill: '#E8272A', stroke: INK, strokeWidth: '5' })));
      case 'face': return R.createElement('g', null,
        hose(uid, 'M122,150 Q112,164 132,170', ''), glove(136, 172, ''),
        hose(uid, 'M208,144 Q220,158 200,166', ''), glove(196, 168, ''));
      case 'rub': return R.createElement('g', null,
        hose(uid, 'M122,164 Q112,176 130,184', ''), glove(134, 187, ''),
        hose(uid, 'M208,158 Q220,170 202,178', ''), glove(198, 181, ''));
      case 'rest': default: return R.createElement('g', null,
        hose(uid, 'M118,160 Q102,174 110,192', 'wm-armL'), glove(112, 196, ''),
        hose(uid, 'M212,150 Q228,164 220,192', 'wm-armR'), glove(222, 196, ''));
    }
  }

  function legs() {
    var x1 = MX - 22, x2 = MX + 22, top = 178, knee = 206;
    function leg(x, dir) {
      return R.createElement('g', { key: 'lg' + x },
        R.createElement('path', { d: 'M' + x + ',' + top + ' L' + x + ',' + knee, fill: 'none', stroke: INK, strokeWidth: 15, strokeLinecap: 'round' }),
        R.createElement('path', { d: 'M' + x + ',' + top + ' L' + x + ',' + knee, fill: 'none', stroke: '#98a2ab', strokeWidth: 7, strokeLinecap: 'round' }),
        R.createElement('path', { d: 'M' + (x - 6) + ',' + (knee - 4) + ' q-' + (dir > 0 ? 4 : 20) + ',2 -' + (dir > 0 ? 4 : 22) + ',14 q0,7 12,7 l' + (dir > 0 ? 26 : 20) + ',0 q9,0 9,-8 q0,-9 -12,-12 Z', fill: INK }),
        R.createElement('rect', { x: x - (dir > 0 ? 16 : 24), y: knee + 12, width: 38, height: 5, rx: 2.5, fill: '#fff' }));
    }
    return R.createElement('g', null, leg(x1, -1), leg(x2, 1));
  }

  function star(cx, cy, s, fill, cls) {
    return R.createElement('path', { className: cls, transform: 'translate(' + cx + ',' + cy + ')', d: 'M0,' + (-s) + ' L' + (s * .3) + ',' + (-s * .3) + ' L' + s + ',0 L' + (s * .3) + ',' + (s * .3) + ' L0,' + s + ' L' + (-s * .3) + ',' + (s * .3) + ' L' + (-s) + ',0 L' + (-s * .3) + ',' + (-s * .3) + ' Z', fill: fill, stroke: INK, strokeWidth: 1.4 });
  }

  function fx(uid, kind) {
    switch (kind) {
      case 'spark': return R.createElement('g', null, star(70, 58, 8, '#F5C800', 'wm-tw'), star(232, 56, 7, '#F5C800', 'wm-tw d1'), star(228, 150, 5, '#F5C800', 'wm-tw d2'), star(78, 150, 5, '#F5C800', 'wm-tw d1'));
      case 'spark1': return star(224, 152, 7, '#F5C800', 'wm-tw');
      case 'bolt': return R.createElement('g', { stroke: '#E8272A', strokeWidth: 4.5, strokeLinecap: 'round' }, R.createElement('line', { x1: '162', y1: '46', x2: '162', y2: '30' }), R.createElement('line', { x1: '198', y1: '52', x2: '210', y2: '40' }), R.createElement('line', { x1: '126', y1: '52', x2: '114', y2: '40' }));
      case 'sweat': return R.createElement('ellipse', { className: 'wm-drip', cx: '210', cy: '96', rx: '5.5', ry: '9', fill: '#5BB6E8', stroke: INK, strokeWidth: '1.5' });
      case 'tears': return R.createElement('g', null,
        R.createElement('ellipse', { className: 'wm-drip', cx: L.x - 2, cy: L.y + 22, rx: '5.5', ry: '9', fill: '#5BB6E8', stroke: INK, strokeWidth: '1.5' }),
        R.createElement('ellipse', { className: 'wm-drip', cx: RY.x + 2, cy: RY.y + 22, rx: '5', ry: '8', fill: '#5BB6E8', stroke: INK, strokeWidth: '1.5', style: { animationDelay: '.7s' } }));
      case 'steam': return R.createElement('g', { transform: 'translate(214,76)', fill: '#cfd8df' },
        R.createElement('circle', { className: 'wm-puff', cx: '0', cy: '0', r: '6' }),
        R.createElement('circle', { className: 'wm-puff', cx: '2', cy: '10', r: '5', style: { animationDelay: '.4s' } }));
      default: return null;
    }
  }

  // tam cocked on the upper-left of the chamber; ring stays visible top-right
  function tam(uid) {
    var cx = 134, top = 78;
    return R.createElement('g', { transform: 'translate(' + cx + ',' + top + ') rotate(-20) translate(' + (-cx) + ',' + (-top) + ')' },
      R.createElement('ellipse', { cx: cx, cy: top - 5, rx: 46, ry: 18, fill: '#262a31' }),
      R.createElement('ellipse', { cx: cx - 12, cy: top - 11, rx: 22, ry: 8, fill: '#363d47', opacity: .85 }),
      R.createElement('path', { d: 'M' + (cx - 40) + ',' + (top + 3) + ' Q' + cx + ',' + (top + 16) + ' ' + (cx + 40) + ',' + (top + 3) + ' L' + (cx + 40) + ',' + (top + 10) + ' Q' + cx + ',' + (top + 23) + ' ' + (cx - 40) + ',' + (top + 10) + ' Z', fill: 'url(#' + uid + 'tn)', stroke: INK, strokeWidth: 3 }),
      R.createElement('ellipse', { cx: cx, cy: top + 3, rx: 40, ry: 10, fill: 'none', stroke: INK, strokeWidth: 3 }),
      R.createElement('circle', { cx: cx, cy: top - 22, r: 8, fill: '#E8272A', stroke: INK, strokeWidth: 3 }),
      R.createElement('circle', { cx: cx - 3, cy: top - 24, r: 2.2, fill: '#ff8a98' }));
  }

  function WheeshtMascot(props) {
    var mood = resolve(props.mood);
    var c = CFG[mood];
    var size = props.size || 170;
    var animate = !!props.animate;
    var uid = R.useMemo(function () { return 'm' + Math.random().toString(36).slice(2, 8); }, []);
    var delay = R.useMemo(function () { return (4.4 + Math.random() * 2.4).toFixed(2) + 's'; }, []);
    var canBlink = animate && (c.e === 'open' || c.e === 'half' || c.e === 'wide' || c.e === 'narrow' || c.e === 'worry');
    var scottish = mood === 'scottish';

    // --- the whistle hardware (side profile, drawn upright) ---
    var hardware = R.createElement('g', null,
      // finger ring on top (slightly right of centre, clear of the sound window)
      R.createElement('g', null,
        R.createElement('path', { d: 'M186,78 q-2,-18 ' + (-2) + ',-22', fill: 'none', stroke: INK, strokeWidth: SW }),
        R.createElement('circle', { cx: 188, cy: 50, r: 16, fill: 'none', stroke: INK, strokeWidth: SW }),
        R.createElement('circle', { cx: 188, cy: 50, r: 16, fill: 'none', stroke: 'url(#' + uid + 'gm)', strokeWidth: SW - 4 })),
      // mouthpiece tube projecting left from the chamber
      R.createElement('path', { d: 'M40,104 q-8,0 -8,14 q0,14 8,14 l78,4 0,-40 Z', fill: 'url(#' + uid + 'gm)', stroke: INK, strokeWidth: SW, strokeLinejoin: 'round' }),
      // chamber (round body)
      R.createElement('ellipse', { cx: BC.x, cy: BC.y, rx: BC.rx, ry: BC.ry, fill: 'url(#' + uid + 'g)', stroke: INK, strokeWidth: SW }),
      // rectangular sound window cut into the TOP at the mouthpiece junction
      R.createElement('path', { d: 'M96,96 l30,-2 0,-16 q-30,0 -34,4 Z', fill: INK }),
      R.createElement('path', { d: 'M99,92 l24,-1.4 0,-9 q-22,0 -26,2 Z', fill: '#3a424b' }),
      // chamber top highlight
      R.createElement('path', { d: 'M118,98 Q160,86 200,100', fill: 'none', stroke: '#eef2f5', strokeWidth: 7, strokeLinecap: 'round', opacity: .65 })
    );

    var stage = R.createElement('g', { className: 'wm-stage' + (animate ? ' wm-a-' + c.anim : '') },
      animate && c.fx === 'toot' ? R.createElement('g', { className: 'wm-toot' },
        R.createElement('path', { d: 'M30,118 q-12,0 -12,8 q0,8 12,8', fill: 'none', stroke: '#aab4bd', strokeWidth: 4, strokeLinecap: 'round' }),
        R.createElement('path', { d: 'M20,126 q-7,0 -7,4', fill: 'none', stroke: '#aab4bd', strokeWidth: 3.5, strokeLinecap: 'round', opacity: .6 })) : null,
      legs(),
      arms(uid, c.arms),
      hardware,
      // tartan band wrapped round the mouthpiece (scottish, subtle)
      scottish ? R.createElement('rect', { x: 70, y: 96, width: 11, height: 44, rx: 2, fill: 'url(#' + uid + 'tn)', stroke: INK, strokeWidth: 2.5 }) : null,
      c.fx ? fx(uid, c.fx) : null,
      // cheeks
      scottish
        ? R.createElement('g', null, saltCheek(L.x - 2, L.y + 22), saltCheek(RY.x + 2, RY.y + 22, .85))
        : R.createElement('g', null,
            R.createElement('ellipse', { cx: L.x - 2, cy: L.y + 22, rx: 10, ry: 7, fill: '#F0708F', opacity: .5 }),
            R.createElement('ellipse', { cx: RY.x + 2, cy: RY.y + 22, rx: 9, ry: 6, fill: '#F0708F', opacity: .45 })),
      // face
      eye(uid, c.e, L.x, L.y, 1, canBlink, delay),
      eye(uid, c.e, RY.x, RY.y, 1, canBlink, delay),
      R.createElement('path', { d: BROWS[c.brow][0], fill: 'none', stroke: INK, strokeWidth: 6, strokeLinecap: 'round' }),
      R.createElement('path', { d: BROWS[c.brow][1], fill: 'none', stroke: INK, strokeWidth: 6, strokeLinecap: 'round' }),
      mouth(c.m),
      scottish ? tam(uid) : null
    );

    return R.createElement('svg', { className: 'wm-svg', viewBox: '0 0 276 240', width: size, height: size * (240 / 276), style: { display: 'block' } },
      defs(uid),
      R.createElement('ellipse', { cx: 164, cy: 226, rx: 62, ry: 11, fill: '#1A1A1A', opacity: .14 }),
      R.createElement('g', { className: animate ? 'wm-breathe' : '' }, stage));
  }
  function saltCheek(cx, cy, s) {
    s = s || 1;
    return R.createElement('g', { transform: 'translate(' + (cx - 10 * s) + ',' + (cy - 7 * s) + ') scale(' + s + ')' },
      R.createElement('rect', { x: 0, y: 0, width: 20, height: 14, rx: 3, fill: '#0a4aa0', opacity: .92 }),
      R.createElement('path', { d: 'M0,0 L20,14 M20,0 L0,14', stroke: '#fff', strokeWidth: 3 }));
  }

  window.WheeshtMascot = WheeshtMascot;
  window.Wheesht = WheeshtMascot;
})();
