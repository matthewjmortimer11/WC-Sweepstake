/* ===========================================================================
   WHEESHT — PROFILE EDITION (variation B)
   A side-on referee whistle (Acme Thunderer silhouette): round chamber as the
   head, the mouthpiece as a snout, finger-grip ring on top. Faces left.
   Chrome finish. Same 10-mood vocabulary + aliases as the front-on Wheesht.
   The tam o' shanter appears on the Scottish mood ONLY.
   Exports window.WheeshtProfile.
   =========================================================================== */
(function () {
  var R = window.React;

  // shared keyframes (reuse the front-on stylesheet if present; else inject)
  if (!document.getElementById('wheesht-css')) {
    var css = document.createElement('style'); css.id = 'wheesht-css';
    css.textContent = [
      '.wh-svg{overflow:visible;display:block}',
      '.wh-breathe{transform-box:fill-box;transform-origin:60% 100%;animation:whBreathe 3.6s ease-in-out infinite}',
      '@keyframes whBreathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-1.5px) scale(1.012,1.02)}}',
      '.wh-stage{transform-box:fill-box;transform-origin:60% 92%}',
      '.wh-a-idle{animation:whIdle 4.2s ease-in-out infinite}',
      '@keyframes whIdle{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-4px) rotate(1deg)}}',
      '.wh-a-bounce{animation:whBounce 1.1s cubic-bezier(.3,.7,.3,1) infinite}',
      '@keyframes whBounce{0%,100%{transform:translateY(0) rotate(-3deg) scale(1)}30%{transform:translateY(-15px) rotate(2deg) scale(1.04,.97)}55%{transform:translateY(2px) rotate(-1deg) scale(.97,1.03)}}',
      '.wh-a-jitter{animation:whJitter .35s ease-in-out infinite}',
      '@keyframes whJitter{0%,100%{transform:translate(0,0) rotate(0)}25%{transform:translate(-1.5px,.5px) rotate(-1deg)}75%{transform:translate(1.5px,.5px) rotate(1deg)}}',
      '.wh-a-throb{animation:whThrob .6s ease-in-out infinite}',
      '@keyframes whThrob{0%,100%{transform:scale(1) rotate(-1deg)}50%{transform:scale(1.05,.97) rotate(1deg)}}',
      '.wh-a-sway{animation:whSway 3.4s ease-in-out infinite}',
      '@keyframes whSway{0%,100%{transform:translateY(2px) rotate(-3deg)}50%{transform:translateY(4px) rotate(3deg)}}',
      '.wh-a-lean{animation:whLean 3s ease-in-out infinite}',
      '@keyframes whLean{0%,100%{transform:rotate(-3deg) translateX(-1px)}50%{transform:rotate(3deg) translateX(2px)}}',
      '.wh-a-pop{animation:whPop .5s cubic-bezier(.2,1.4,.4,1) both, whFloat 3s ease-in-out .5s infinite}',
      '@keyframes whPop{0%{transform:scale(.7) translateY(8px)}100%{transform:scale(1) translateY(0)}}',
      '@keyframes whFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}',
      '.wh-lid{transform-box:fill-box;transform-origin:50% 0;transform:scaleY(0)}',
      '.wh-blinking{animation:whBlink var(--whblink,5.2s) ease-in-out infinite}',
      '@keyframes whBlink{0%,93%,100%{transform:scaleY(0)}96%,97.5%{transform:scaleY(1)}}',
      '.wh-drip{transform-box:fill-box;transform-origin:50% 0;animation:whDrip 1.8s ease-in infinite}',
      '@keyframes whDrip{0%{transform:translateY(0) scaleY(.6);opacity:0}30%{opacity:1}100%{transform:translateY(26px) scaleY(1);opacity:0}}',
      '.wh-twinkle{transform-box:fill-box;transform-origin:center;animation:whTwinkle 1.4s ease-in-out infinite}',
      '@keyframes whTwinkle{0%,100%{transform:scale(.4);opacity:.2}50%{transform:scale(1);opacity:1}}',
      '.wh-twinkle.d1{animation-delay:.5s}.wh-twinkle.d2{animation-delay:.9s}',
      '.wh-puff{transform-box:fill-box;transform-origin:0 50%;animation:whPuff 1.1s ease-out infinite}',
      '@keyframes whPuff{0%{transform:scale(.3) translateX(0);opacity:0}30%{opacity:.9}100%{transform:scale(1.3) translateX(14px);opacity:0}}',
      '.wh-flag{transform-box:fill-box;transform-origin:0 50%;animation:whFlagWave 1.3s ease-in-out infinite}',
      '@keyframes whFlagWave{0%,100%{transform:skewY(-4deg) rotate(-3deg)}50%{transform:skewY(4deg) rotate(3deg)}}',
      '.wh-toot{transform-box:fill-box;transform-origin:100% 50%;animation:whToot 1.2s ease-out infinite}',
      '@keyframes whToot{0%{transform:scale(.4) translateX(0);opacity:0}30%{opacity:.85}100%{transform:scale(1.2) translateX(-18px);opacity:0}}'
    ].join('\n');
    document.head.appendChild(css);
  }

  var INK = '#222831';
  var CANON = ['neutral', 'happy', 'celebrating', 'shocked', 'nervous', 'confident', 'angry', 'crying', 'mischievous', 'scottish'];
  var ALIAS = { welcome: 'happy', smug: 'confident', outraged: 'shocked', delighted: 'celebrating', suspicious: 'mischievous', wounded: 'crying', solemn: 'neutral', broadcast: 'confident', drumroll: 'nervous' };
  function resolve(m) { if (CANON.indexOf(m) >= 0) return m; if (ALIAS[m]) return ALIAS[m]; return 'neutral'; }

  // geometry (facing LEFT): chamber = head, mouthpiece = snout to the left
  var CH = { x: 170, y: 118, r: 62 };
  var EYE = { x: 150, y: 100 };
  var SNOUT = { tip: 34, y: 122 };

  var CFG = {
    neutral:     { eye: 'open',  brow: 'rest',  mouth: 'soft',  arm: 'rest',  anim: 'idle',   toot: false },
    happy:       { eye: 'open',  brow: 'up',    mouth: 'smile', arm: 'rest',  anim: 'idle',   toot: false },
    celebrating: { eye: 'joy',   brow: 'up',    mouth: 'grin',  arm: 'up',    anim: 'bounce', toot: true },
    shocked:     { eye: 'wide',  brow: 'high',  mouth: 'oh',    arm: 'startle', anim: 'pop',  toot: false },
    nervous:     { eye: 'worry', brow: 'worry', mouth: 'wavy',  arm: 'fidget', anim: 'jitter', toot: false },
    confident:   { eye: 'half',  brow: 'cocky', mouth: 'smirk', arm: 'hip',   anim: 'idle',   toot: true },
    angry:       { eye: 'narrow',brow: 'angry', mouth: 'shout', arm: 'card',  anim: 'throb',  toot: true },
    crying:      { eye: 'shut',  brow: 'sad',   mouth: 'wail',  arm: 'face',  anim: 'sway',   toot: false },
    mischievous: { eye: 'half',  brow: 'sly',   mouth: 'sly',   arm: 'rest',  anim: 'lean',   toot: false },
    scottish:    { eye: 'joy',   brow: 'up',    mouth: 'grin',  arm: 'flag',  anim: 'bounce', toot: true }
  };

  // single profile eyebrow above the eye
  var BROWS = {
    rest:  'M' + (EYE.x - 17) + ',' + (EYE.y - 22) + ' Q' + EYE.x + ',' + (EYE.y - 28) + ' ' + (EYE.x + 15) + ',' + (EYE.y - 21),
    up:    'M' + (EYE.x - 17) + ',' + (EYE.y - 26) + ' Q' + EYE.x + ',' + (EYE.y - 36) + ' ' + (EYE.x + 15) + ',' + (EYE.y - 27),
    high:  'M' + (EYE.x - 17) + ',' + (EYE.y - 30) + ' Q' + EYE.x + ',' + (EYE.y - 40) + ' ' + (EYE.x + 15) + ',' + (EYE.y - 31),
    worry: 'M' + (EYE.x - 17) + ',' + (EYE.y - 20) + ' Q' + EYE.x + ',' + (EYE.y - 28) + ' ' + (EYE.x + 15) + ',' + (EYE.y - 26),
    cocky: 'M' + (EYE.x - 17) + ',' + (EYE.y - 20) + ' Q' + EYE.x + ',' + (EYE.y - 22) + ' ' + (EYE.x + 15) + ',' + (EYE.y - 30),
    angry: 'M' + (EYE.x - 18) + ',' + (EYE.y - 28) + ' L' + (EYE.x + 14) + ',' + (EYE.y - 16),
    sad:   'M' + (EYE.x - 16) + ',' + (EYE.y - 16) + ' Q' + EYE.x + ',' + (EYE.y - 28) + ' ' + (EYE.x + 15) + ',' + (EYE.y - 22),
    sly:   'M' + (EYE.x - 17) + ',' + (EYE.y - 19) + ' Q' + EYE.x + ',' + (EYE.y - 22) + ' ' + (EYE.x + 15) + ',' + (EYE.y - 28)
  };

  function makeDefs(uid) {
    return R.createElement('defs', null,
      R.createElement('linearGradient', { id: uid + 'cr', x1: '0', y1: '0', x2: '0.2', y2: '1' },
        R.createElement('stop', { offset: '0', stopColor: '#ffffff' }),
        R.createElement('stop', { offset: '0.16', stopColor: '#eaf0f4' }),
        R.createElement('stop', { offset: '0.4', stopColor: '#c4ced7' }),
        R.createElement('stop', { offset: '0.52', stopColor: '#9fabb6' }),
        R.createElement('stop', { offset: '0.62', stopColor: '#cdd6dd' }),
        R.createElement('stop', { offset: '0.8', stopColor: '#8b97a3' }),
        R.createElement('stop', { offset: '1', stopColor: '#646f7a' })),
      R.createElement('radialGradient', { id: uid + 'sp', cx: '0.34', cy: '0.26', r: '0.5' },
        R.createElement('stop', { offset: '0', stopColor: '#fff', stopOpacity: '0.95' }),
        R.createElement('stop', { offset: '0.45', stopColor: '#fff', stopOpacity: '0.22' }),
        R.createElement('stop', { offset: '1', stopColor: '#fff', stopOpacity: '0' })),
      R.createElement('linearGradient', { id: uid + 'mt', x1: '0', y1: '0', x2: '0', y2: '1' },
        R.createElement('stop', { offset: '0', stopColor: '#3a4048' }),
        R.createElement('stop', { offset: '1', stopColor: '#15191e' })),
      R.createElement('pattern', { id: uid + 'tn', width: '14', height: '14', patternUnits: 'userSpaceOnUse' },
        R.createElement('rect', { width: '14', height: '14', fill: '#1f3d2e' }),
        R.createElement('rect', { width: '14', height: '14', fill: '#10325a', opacity: '0.45' }),
        R.createElement('rect', { x: '0', width: '4', height: '14', fill: '#9b1b2e' }),
        R.createElement('rect', { y: '0', width: '14', height: '4', fill: '#9b1b2e' }),
        R.createElement('rect', { x: '9', width: '1.4', height: '14', fill: '#e7d27a', opacity: '0.8' }),
        R.createElement('rect', { y: '9', width: '14', height: '1.4', fill: '#e7d27a', opacity: '0.8' })));
  }

  function eye(uid, style, blink, delay) {
    var x = EYE.x, y = EYE.y, ink = INK;
    if (style === 'joy') return R.createElement('path', { d: 'M' + (x - 15) + ',' + (y + 3) + ' Q' + x + ',' + (y - 15) + ' ' + (x + 15) + ',' + (y + 3), fill: 'none', stroke: ink, strokeWidth: 6, strokeLinecap: 'round' });
    if (style === 'shut') return R.createElement('path', { d: 'M' + (x - 14) + ',' + (y - 2) + ' Q' + x + ',' + (y + 9) + ' ' + (x + 14) + ',' + (y - 2), fill: 'none', stroke: ink, strokeWidth: 6, strokeLinecap: 'round' });
    var rx = 17, ry = 20, pr = 8.5;
    if (style === 'wide') { rx = 19; ry = 23; pr = 7; }
    if (style === 'narrow') { ry = 12; pr = 7.5; }
    if (style === 'half' || style === 'worry') { ry = 17; }
    var px = x - 4, py = y + 2; // pupil toward snout (left)
    var els = [
      R.createElement('ellipse', { key: 'w', cx: x, cy: y, rx: rx, ry: ry, fill: '#fff', stroke: ink, strokeWidth: 4 }),
      R.createElement('circle', { key: 'p', cx: px, cy: py, r: pr, fill: '#20252b' }),
      R.createElement('circle', { key: 'g', cx: px - 3, cy: py - 3, r: 2.4, fill: '#fff' })
    ];
    if (style === 'half') els.push(R.createElement('path', { key: 'l', d: 'M' + (x - rx - 1) + ',' + (y - 3) + ' a' + rx + ',' + ry + ' 0 0 1 ' + (rx * 2 + 2) + ',0 l0,-' + (ry + 4) + ' l-' + (rx * 2 + 2) + ',0 Z', fill: 'url(#' + uid + 'cr)', stroke: ink, strokeWidth: 4, strokeLinejoin: 'round' }));
    if (style === 'worry') els.push(R.createElement('path', { key: 'l', d: 'M' + (x - rx - 1) + ',' + (y - 6) + ' a' + rx + ',' + ry + ' 0 0 1 ' + (rx * 2 + 2) + ',0 l0,-' + (ry + 6) + ' l-' + (rx * 2 + 2) + ',0 Z', fill: 'url(#' + uid + 'cr)', stroke: ink, strokeWidth: 4, strokeLinejoin: 'round' }));
    if (blink) els.push(R.createElement('ellipse', { key: 'bl', className: 'wh-lid wh-blinking', style: { '--whblink': delay }, cx: x, cy: y, rx: rx + 1, ry: ry + 1, fill: 'url(#' + uid + 'cr)', stroke: ink, strokeWidth: 4 }));
    return R.createElement('g', null, els);
  }

  // mouth at the snout tip (left-facing opening)
  function mouth(style) {
    var ink = INK, lip = '#d8536e', x = SNOUT.tip, y = SNOUT.y;
    switch (style) {
      case 'smile': return R.createElement('path', { d: 'M' + (x - 2) + ',' + (y - 9) + ' Q' + (x - 16) + ',' + y + ' ' + (x - 2) + ',' + (y + 9), fill: 'none', stroke: ink, strokeWidth: 5.5, strokeLinecap: 'round' });
      case 'grin': return R.createElement('g', null,
        R.createElement('path', { d: 'M' + x + ',' + (y - 12) + ' Q' + (x - 22) + ',' + y + ' ' + x + ',' + (y + 12) + ' Q' + (x - 8) + ',' + y + ' ' + x + ',' + (y - 12) + ' Z', fill: ink }),
        R.createElement('path', { d: 'M' + (x - 2) + ',' + (y - 9) + ' Q' + (x - 12) + ',' + y + ' ' + (x - 2) + ',' + (y + 9)+' Z', fill: '#fff' }));
      case 'oh': return R.createElement('ellipse', { cx: x - 6, cy: y, rx: 9, ry: 12, fill: ink });
      case 'shout': return R.createElement('g', null,
        R.createElement('path', { d: 'M' + (x + 2) + ',' + (y - 13) + ' Q' + (x - 24) + ',' + (y - 6) + ' ' + (x - 24) + ',' + y + ' Q' + (x - 24) + ',' + (y + 6) + ' ' + (x + 2) + ',' + (y + 13) + ' Z', fill: ink }),
        R.createElement('path', { d: 'M' + (x + 1) + ',' + (y - 9) + ' Q' + (x - 14) + ',' + (y - 4) + ' ' + (x - 14) + ',' + y + ' Q' + (x - 14) + ',' + (y + 4) + ' ' + (x + 1) + ',' + (y + 9) + ' Z', fill: lip }));
      case 'smirk': return R.createElement('path', { d: 'M' + (x - 2) + ',' + (y - 10) + ' Q' + (x - 14) + ',' + (y + 4) + ' ' + (x + 2) + ',' + (y + 11), fill: 'none', stroke: ink, strokeWidth: 5.5, strokeLinecap: 'round' });
      case 'sly': return R.createElement('path', { d: 'M' + (x + 2) + ',' + (y - 8) + ' Q' + (x - 16) + ',' + (y - 2) + ' ' + (x - 8) + ',' + (y + 8) + ' Q' + (x - 4) + ',' + (y + 12) + ' ' + (x + 4) + ',' + (y + 10), fill: 'none', stroke: ink, strokeWidth: 5, strokeLinecap: 'round' });
      case 'wavy': return R.createElement('path', { d: 'M' + (x - 2) + ',' + (y - 10) + ' q-7,6 0,12 q7,6 0,10', fill: 'none', stroke: ink, strokeWidth: 5, strokeLinecap: 'round' });
      case 'wail': return R.createElement('g', null,
        R.createElement('path', { d: 'M' + (x + 4) + ',' + (y - 10) + ' Q' + (x - 20) + ',' + (y - 4) + ' ' + (x - 20) + ',' + (y + 4) + ' Q' + (x - 20) + ',' + (y + 12) + ' ' + (x + 4) + ',' + (y + 12) + ' Z', fill: ink }),
        R.createElement('path', { d: 'M' + (x + 2) + ',' + (y - 5) + ' Q' + (x - 11) + ',' + y + ' ' + (x + 2) + ',' + (y + 7) + ' Z', fill: lip }));
      case 'soft': default: return R.createElement('path', { d: 'M' + (x - 2) + ',' + (y - 8) + ' Q' + (x - 12) + ',' + y + ' ' + (x - 2) + ',' + (y + 8), fill: 'none', stroke: ink, strokeWidth: 5.5, strokeLinecap: 'round' });
    }
  }

  function arm(uid, style) {
    var stroke = INK, fill = 'url(#' + uid + 'cr)';
    var A = function (d, k) { return R.createElement('path', { key: k, d: d, fill: fill, stroke: stroke, strokeWidth: 5, strokeLinejoin: 'round', strokeLinecap: 'round' }); };
    // near-side arm anchored at chamber lower-left ~(150,168)
    switch (style) {
      case 'up': return A('M150,164 Q150,128 134,104 Q140,128 130,150 Q138,162 150,170 Z', 'a');
      case 'hip': return A('M156,168 Q176,176 178,196 Q160,192 148,182 Z', 'a');
      case 'startle': return A('M146,160 Q120,150 110,160 Q126,170 146,170 Z', 'a');
      case 'fidget': return A('M150,170 Q140,184 152,194 Q162,186 162,176 Z', 'a');
      case 'card': return R.createElement('g', null,
        A('M150,162 Q150,134 138,112 Q140,132 132,150 Z', 'a'),
        R.createElement('g', { key: 'rc', transform: 'rotate(-10 134 100)' }, R.createElement('rect', { x: '124', y: '76', width: '22', height: '32', rx: '4', fill: '#E8272A', stroke: stroke, strokeWidth: '4' })));
      case 'face': return A('M148,158 Q132,150 120,158 Q130,168 144,166 Z', 'a');
      case 'flag': return R.createElement('g', null,
        A('M152,160 Q150,132 140,108 Q146,130 136,150 Z', 'a'),
        R.createElement('g', { key: 'fg', transform: 'translate(128,52)' },
          R.createElement('rect', { x: '-2', y: '0', width: '3', height: '56', rx: '1.5', fill: '#5a6470' }),
          R.createElement('g', { className: 'wh-flag' },
            R.createElement('rect', { x: '-42', y: '2', width: '40', height: '28', rx: '2', fill: '#0a4aa0', stroke: stroke, strokeWidth: '2.5' }),
            R.createElement('path', { d: 'M-42,2 L-2,30 M-2,2 L-42,30', stroke: '#fff', strokeWidth: '5' }))));
      case 'rest': default: return A('M152,170 Q150,186 162,192 Q170,182 164,170 Z', 'a');
    }
  }

  function star(cx, cy, s, fill, cls) {
    return R.createElement('path', { className: cls, transform: 'translate(' + cx + ',' + cy + ')', d: 'M0,' + (-s) + ' L' + (s * .3) + ',' + (-s * .3) + ' L' + s + ',0 L' + (s * .3) + ',' + (s * .3) + ' L0,' + s + ' L' + (-s * .3) + ',' + (s * .3) + ' L' + (-s) + ',0 L' + (-s * .3) + ',' + (-s * .3) + ' Z', fill: fill, stroke: INK, strokeWidth: 1.4 });
  }

  function extras(mood) {
    switch (mood) {
      case 'celebrating': return R.createElement('g', null, star(206, 56, 7, '#F5C800', 'wh-twinkle'), star(232, 110, 6, '#F5C800', 'wh-twinkle d1'), star(120, 56, 5, '#F5C800', 'wh-twinkle d2'));
      case 'shocked': return R.createElement('g', { stroke: '#E8272A', strokeWidth: 4, strokeLinecap: 'round' }, R.createElement('line', { x1: '170', y1: '44', x2: '170', y2: '30' }), R.createElement('line', { x1: '202', y1: '52', x2: '212', y2: '40' }));
      case 'nervous': return R.createElement('ellipse', { className: 'wh-drip', cx: '196', cy: '92', rx: '5', ry: '8', fill: '#5BB6E8', stroke: INK, strokeWidth: '1.5' });
      case 'angry': return R.createElement('g', { transform: 'translate(206,72)', fill: '#cfd8df' }, R.createElement('circle', { className: 'wh-puff', cx: '0', cy: '0', r: '5' }), R.createElement('circle', { className: 'wh-puff', cx: '0', cy: '8', r: '4', style: { animationDelay: '.4s' } }));
      case 'crying': return R.createElement('ellipse', { className: 'wh-drip', cx: EYE.x - 4, cy: EYE.y + 22, rx: '5', ry: '8', fill: '#5BB6E8', stroke: INK, strokeWidth: '1.5' });
      case 'mischievous': return star(206, 150, 6, '#F5C800', 'wh-twinkle');
      case 'scottish': return R.createElement('g', null, star(214, 64, 7, '#0a4aa0', 'wh-twinkle'), star(232, 120, 6, '#fff', 'wh-twinkle d1'), star(120, 60, 5, '#0a4aa0', 'wh-twinkle d2'));
      default: return null;
    }
  }

  function toot(uid) {
    // air puff out of the snout (left)
    var x = SNOUT.tip, y = SNOUT.y;
    return R.createElement('g', { className: 'wh-toot', stroke: '#9fb0bd', strokeWidth: 3.5, fill: 'none', strokeLinecap: 'round', opacity: .9 },
      R.createElement('path', { d: 'M' + (x - 12) + ',' + (y - 8) + ' q-10,2 -10,8 q0,6 10,8' }),
      R.createElement('path', { d: 'M' + (x - 20) + ',' + (y - 2) + ' q-7,2 -7,4', opacity: .6 }));
  }

  function tam(uid) {
    // sits atop the chamber, tilted; only used for scottish
    return R.createElement('g', { transform: 'translate(' + CH.x + ',' + (CH.y - CH.r - 4) + ') rotate(-14) translate(-' + CH.x + ',-' + (CH.y - CH.r - 4) + ')' },
      R.createElement('ellipse', { cx: CH.x, cy: CH.y - CH.r - 6, rx: 56, ry: 22, fill: '#262a31' }),
      R.createElement('ellipse', { cx: CH.x - 12, cy: CH.y - CH.r - 12, rx: 30, ry: 11, fill: '#343a44', opacity: .8 }),
      R.createElement('path', { d: 'M' + (CH.x - 48) + ',' + (CH.y - CH.r + 2) + ' Q' + CH.x + ',' + (CH.y - CH.r + 18) + ' ' + (CH.x + 48) + ',' + (CH.y - CH.r + 2) + ' L' + (CH.x + 48) + ',' + (CH.y - CH.r + 9) + ' Q' + CH.x + ',' + (CH.y - CH.r + 25) + ' ' + (CH.x - 48) + ',' + (CH.y - CH.r + 9) + ' Z', fill: 'url(#' + uid + 'tn)', stroke: INK, strokeWidth: 3 }),
      R.createElement('ellipse', { cx: CH.x, cy: CH.y - CH.r + 2, rx: 48, ry: 13, fill: 'none', stroke: INK, strokeWidth: 3 }),
      R.createElement('circle', { cx: CH.x, cy: CH.y - CH.r - 26, r: 8.5, fill: '#E8272A', stroke: INK, strokeWidth: 3 }),
      R.createElement('circle', { cx: CH.x - 3, cy: CH.y - CH.r - 29, r: 2.4, fill: '#ff8a98' }));
  }

  function WheeshtProfile(props) {
    var mood = resolve(props.mood);
    var c = CFG[mood];
    var size = props.size || 150;
    var animate = !!props.animate;
    var uid = R.useMemo(function () { return 'wp' + Math.random().toString(36).slice(2, 8); }, []);
    var delay = R.useMemo(function () { return (4.5 + Math.random() * 2.5).toFixed(2) + 's'; }, []);
    var canBlink = animate && (c.eye === 'open' || c.eye === 'half' || c.eye === 'wide' || c.eye === 'narrow' || c.eye === 'worry');
    var scottish = mood === 'scottish';
    var mp = 'url(#' + uid + 'mt)', cr = 'url(#' + uid + 'cr)';

    var stage = R.createElement('g', { className: 'wh-stage' + (animate ? ' wh-a-' + c.anim : '') },
      // air toot
      animate && c.toot ? toot(uid) : null,
      arm(uid, c.arm),
      // legs + ref boots under the chamber
      R.createElement('g', null,
        R.createElement('rect', { x: CH.x - 22, y: CH.y + CH.r - 14, width: 13, height: 30, rx: 6.5, fill: cr, stroke: INK, strokeWidth: 5 }),
        R.createElement('rect', { x: CH.x + 6, y: CH.y + CH.r - 14, width: 13, height: 30, rx: 6.5, fill: cr, stroke: INK, strokeWidth: 5 }),
        R.createElement('path', { d: 'M' + (CH.x - 34) + ',' + (CH.y + CH.r + 16) + ' q-2,-12 16,-12 l8,0 0,12 Z', fill: INK }),
        R.createElement('path', { d: 'M' + (CH.x + 26) + ',' + (CH.y + CH.r + 16) + ' q-2,-12 16,-12 l8,0 0,12 Z', fill: INK }),
        R.createElement('rect', { x: CH.x - 36, y: CH.y + CH.r + 14, width: 24, height: 5, rx: 2, fill: '#fff', opacity: .85 }),
        R.createElement('rect', { x: CH.x + 24, y: CH.y + CH.r + 14, width: 24, height: 5, rx: 2, fill: '#fff', opacity: .85 })),

      // ---- the whistle body ----
      // mouthpiece / snout (tapered tube to the left)
      R.createElement('path', { d: 'M' + SNOUT.tip + ',' + (SNOUT.y - 18) + ' L' + (CH.x - 6) + ',' + (CH.y - 26) + ' L' + (CH.x - 6) + ',' + (CH.y + 26) + ' L' + SNOUT.tip + ',' + (SNOUT.y + 18) + ' Q' + (SNOUT.tip - 9) + ',' + SNOUT.y + ' ' + SNOUT.tip + ',' + (SNOUT.y - 18) + ' Z', fill: cr, stroke: INK, strokeWidth: 6, strokeLinejoin: 'round' }),
      // sound window (the classic rectangular cut-out on top of the mouthpiece)
      R.createElement('path', { d: 'M' + (CH.x - 30) + ',' + (CH.y - 24) + ' l22,-7 0,15 -22,5 Z', fill: mp, stroke: INK, strokeWidth: 3.5, strokeLinejoin: 'round' }),
      // chamber (head/body)
      R.createElement('circle', { cx: CH.x, cy: CH.y, r: CH.r, fill: cr, stroke: INK, strokeWidth: 6 }),
      // chrome specular
      R.createElement('path', { d: 'M' + (CH.x - 54) + ',' + (CH.y + 12) + ' Q' + CH.x + ',' + (CH.y + 2) + ' ' + (CH.x + 54) + ',' + (CH.y + 12) + ' Q' + CH.x + ',' + (CH.y + 24) + ' ' + (CH.x - 54) + ',' + (CH.y + 12) + ' Z', fill: '#fff', opacity: .3 }),
      R.createElement('ellipse', { cx: CH.x, cy: CH.y, rx: CH.r - 2, ry: CH.r - 2, fill: 'url(#' + uid + 'sp)' }),
      R.createElement('ellipse', { cx: CH.x + 18, cy: CH.y - 30, rx: 16, ry: 11, fill: '#fff', opacity: .6, transform: 'rotate(-20 ' + (CH.x + 18) + ' ' + (CH.y - 30) + ')' }),
      // finger-grip ring on top of chamber
      R.createElement('g', null,
        R.createElement('path', { d: 'M' + (CH.x + 26) + ',' + (CH.y - CH.r + 6) + ' q14,-26 30,-6', fill: 'none', stroke: INK, strokeWidth: 7, strokeLinecap: 'round' }),
        R.createElement('path', { d: 'M' + (CH.x + 26) + ',' + (CH.y - CH.r + 6) + ' q14,-22 30,-6', fill: 'none', stroke: '#cdd6dd', strokeWidth: 3, strokeLinecap: 'round' })),
      // tartan band on the snout for scottish flavour
      scottish ? R.createElement('path', { d: 'M' + (CH.x - 30) + ',' + (CH.y - 26) + ' l8,0 0,52 -8,0 Z', fill: 'url(#' + uid + 'tn)', stroke: INK, strokeWidth: 2.5 }) : null,
      extras(mood),
      // cheek
      scottish
        ? R.createElement('g', { transform: 'translate(' + (CH.x - 6) + ',' + (CH.y + 16) + ')' }, R.createElement('rect', { x: -10, y: -7, width: 20, height: 14, rx: 3, fill: '#0a4aa0', opacity: .92 }), R.createElement('path', { d: 'M-10,-7 L10,7 M10,-7 L-10,7', stroke: '#fff', strokeWidth: 3 }))
        : R.createElement('circle', { cx: CH.x - 4, cy: CH.y + 18, r: 11, fill: '#F0708F', opacity: .55 }),
      // eye + brow + mouth
      eye(uid, c.eye, canBlink, delay),
      R.createElement('path', { d: BROWS[c.brow], fill: 'none', stroke: INK, strokeWidth: 6, strokeLinecap: 'round' }),
      mouth(c.mouth),
      // hat last — scottish only
      scottish ? tam(uid) : null
    );

    return R.createElement('svg', { className: 'wh-svg', viewBox: '0 0 260 220', width: size, height: size * (220 / 260), style: { display: 'block' } },
      makeDefs(uid),
      R.createElement('ellipse', { cx: CH.x, cy: 204, rx: 58, ry: 9, fill: '#1A1A1A', opacity: .12 }),
      R.createElement('g', { className: animate ? 'wh-breathe' : '' }, stage));
  }

  window.WheeshtProfile = WheeshtProfile;
})();
