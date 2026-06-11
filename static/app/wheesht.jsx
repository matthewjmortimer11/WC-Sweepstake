/* ===========================================================================
   WHEESHT — the constitutionally-biased referee whistle.
   Premium chrome finish · tam o' shanter · tartan · expressive moods.

   <Wheesht mood="celebrating" size={160} animate track /> ; moods below.

   Canonical moods (brief):
     neutral · happy · celebrating · shocked · nervous ·
     confident · angry · crying · mischievous · scottish
   Legacy aliases (kept so existing screens keep working):
     welcome→happy · smug→confident · outraged→shocked · delighted→celebrating
     suspicious→mischievous · wounded→crying · solemn→neutral
     broadcast→confident · drumroll→nervous
   Exported to window.Wheesht.
   =========================================================================== */
(function () {
  var R = window.React;

  /* ---- one-time stylesheet (self-contained, works in app + lab) -------- */
  if (!document.getElementById('wheesht-css')) {
    var css = document.createElement('style');
    css.id = 'wheesht-css';
    css.textContent = [
      '.wh-svg{overflow:visible;display:block}',
      '.wh-breathe{transform-box:fill-box;transform-origin:50% 100%;animation:whBreathe 3.6s ease-in-out infinite}',
      '@keyframes whBreathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-1.5px) scale(1.012,1.02)}}',
      /* stage (body language) */
      '.wh-stage{transform-box:fill-box;transform-origin:50% 92%}',
      '.wh-a-idle{animation:whIdle 4.2s ease-in-out infinite}',
      '@keyframes whIdle{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-4px) rotate(1deg)}}',
      '.wh-a-bounce{animation:whBounce 1.1s cubic-bezier(.3,.7,.3,1) infinite}',
      '@keyframes whBounce{0%,100%{transform:translateY(0) rotate(-3deg) scale(1)}30%{transform:translateY(-16px) rotate(2deg) scale(1.04,.97)}55%{transform:translateY(2px) rotate(-1deg) scale(.97,1.03)}}',
      '.wh-a-jitter{animation:whJitter .35s ease-in-out infinite}',
      '@keyframes whJitter{0%,100%{transform:translate(0,0) rotate(0)}25%{transform:translate(-1.5px,.5px) rotate(-1deg)}75%{transform:translate(1.5px,.5px) rotate(1deg)}}',
      '.wh-a-throb{animation:whThrob .6s ease-in-out infinite}',
      '@keyframes whThrob{0%,100%{transform:scale(1) rotate(-1deg)}50%{transform:scale(1.05,.97) rotate(1deg)}}',
      '.wh-a-sway{animation:whSway 3.4s ease-in-out infinite}',
      '@keyframes whSway{0%,100%{transform:translateY(2px) rotate(-3deg)}50%{transform:translateY(4px) rotate(3deg)}}',
      '.wh-a-lean{animation:whLean 3s ease-in-out infinite}',
      '@keyframes whLean{0%,100%{transform:rotate(-4deg) translateX(-1px)}50%{transform:rotate(2deg) translateX(2px)}}',
      '.wh-a-pop{animation:whPop .5s cubic-bezier(.2,1.4,.4,1) both, whFloat 3s ease-in-out .5s infinite}',
      '@keyframes whPop{0%{transform:scale(.7) translateY(8px)}100%{transform:scale(1) translateY(0)}}',
      '@keyframes whFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}',
      /* blink */
      '.wh-lid{transform-box:fill-box;transform-origin:50% 0;transform:scaleY(0)}',
      '.wh-blinking{animation:whBlink var(--whblink,5.2s) ease-in-out infinite}',
      '@keyframes whBlink{0%,93%,100%{transform:scaleY(0)}96%,97.5%{transform:scaleY(1)}}',
      /* extras */
      '.wh-drip{transform-box:fill-box;transform-origin:50% 0;animation:whDrip 1.8s ease-in infinite}',
      '@keyframes whDrip{0%{transform:translateY(0) scaleY(.6);opacity:0}30%{opacity:1}100%{transform:translateY(26px) scaleY(1);opacity:0}}',
      '.wh-twinkle{transform-box:fill-box;transform-origin:center;animation:whTwinkle 1.4s ease-in-out infinite}',
      '@keyframes whTwinkle{0%,100%{transform:scale(.4);opacity:.2}50%{transform:scale(1);opacity:1}}',
      '.wh-twinkle.d1{animation-delay:.5s}.wh-twinkle.d2{animation-delay:.9s}',
      '.wh-puff{transform-box:fill-box;transform-origin:0 50%;animation:whPuff 1.1s ease-out infinite}',
      '@keyframes whPuff{0%{transform:scale(.3) translateX(0);opacity:0}30%{opacity:.9}100%{transform:scale(1.3) translateX(14px);opacity:0}}',
      '.wh-wave{animation:whWave 1.6s ease-in-out infinite}',
      '@keyframes whWave{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(10deg)}}',
      '.wh-flag{transform-box:fill-box;transform-origin:0 50%;animation:whFlagWave 1.3s ease-in-out infinite}',
      '@keyframes whFlagWave{0%,100%{transform:skewY(-4deg) rotate(-3deg)}50%{transform:skewY(4deg) rotate(3deg)}}'
    ].join('\n');
    document.head.appendChild(css);
  }

  var CANON = ['neutral', 'happy', 'celebrating', 'shocked', 'nervous', 'confident', 'angry', 'crying', 'mischievous', 'scottish'];
  var ALIAS = {
    welcome: 'happy', smug: 'confident', outraged: 'shocked', delighted: 'celebrating',
    suspicious: 'mischievous', wounded: 'crying', solemn: 'neutral',
    broadcast: 'confident', drumroll: 'nervous'
  };
  function resolveMood(m) { if (CANON.indexOf(m) >= 0) return m; if (ALIAS[m]) return ALIAS[m]; return 'neutral'; }

  var INK = '#222831';     // steel outline
  var DARK = '#1b2026';

  // mood → config
  var CFG = {
    neutral:     { eyes: 'open',     dx: 0,  dy: 0,  brow: 'rest',   mouth: 'soft',   arms: 'rest',   anim: 'idle' },
    happy:       { eyes: 'open',     dx: 0,  dy: -2, brow: 'up',     mouth: 'smile',  arms: 'rest',   anim: 'idle' },
    celebrating: { eyes: 'joy',      dx: 0,  dy: 0,  brow: 'up',     mouth: 'grin',   arms: 'up',     anim: 'bounce' },
    shocked:     { eyes: 'wide',     dx: 0,  dy: 1,  brow: 'high',   mouth: 'oh',     arms: 'startle',anim: 'pop' },
    nervous:     { eyes: 'worry',    dx: 4,  dy: 1,  brow: 'worry',  mouth: 'wavy',   arms: 'fidget', anim: 'jitter' },
    confident:   { eyes: 'half',     dx: 3,  dy: -2, brow: 'cocky',  mouth: 'smirk',  arms: 'hips',   anim: 'idle' },
    angry:       { eyes: 'narrow',   dx: 0,  dy: 1,  brow: 'angry',  mouth: 'shout',  arms: 'card',   anim: 'throb' },
    crying:      { eyes: 'shut',     dx: 0,  dy: 0,  brow: 'sad',    mouth: 'wail',   arms: 'face',   anim: 'sway' },
    mischievous: { eyes: 'half',     dx: 5,  dy: 1,  brow: 'sly',    mouth: 'sly',    arms: 'rub',    anim: 'lean' },
    scottish:    { eyes: 'joy',      dx: 0,  dy: -1, brow: 'up',     mouth: 'grin',   arms: 'flag',   anim: 'bounce' }
  };

  // eyebrow path pairs (left,right) per style
  var BROWS = {
    rest:  ['M64,98 Q80,92 95,97',  'M156,98 Q140,92 125,97'],
    up:    ['M62,94 Q80,84 96,91',  'M158,94 Q140,84 124,91'],
    high:  ['M62,88 Q80,80 96,86',  'M158,88 Q140,80 124,86'],
    worry: ['M64,96 Q80,90 95,95',  'M156,100 Q140,96 125,100'],
    cocky: ['M64,100 Q80,100 95,99','M158,90 Q140,82 124,90'],
    angry: ['M62,92 L96,104',       'M158,92 L124,104'],
    sad:   ['M66,104 Q82,92 96,100','M154,104 Q138,92 124,100'],
    sly:   ['M64,100 Q80,98 95,99', 'M158,90 Q140,84 124,92']
  };

  function makeDefs(uid, scottish) {
    return R.createElement('defs', null,
      R.createElement('linearGradient', { id: uid + 'cr', x1: '0', y1: '0', x2: '0.25', y2: '1' },
        R.createElement('stop', { offset: '0', stopColor: '#ffffff' }),
        R.createElement('stop', { offset: '0.16', stopColor: '#eaf0f4' }),
        R.createElement('stop', { offset: '0.40', stopColor: '#c4ced7' }),
        R.createElement('stop', { offset: '0.52', stopColor: '#9fabb6' }),
        R.createElement('stop', { offset: '0.60', stopColor: '#cdd6dd' }),
        R.createElement('stop', { offset: '0.78', stopColor: '#8b97a3' }),
        R.createElement('stop', { offset: '1', stopColor: '#646f7a' })
      ),
      R.createElement('radialGradient', { id: uid + 'sp', cx: '0.34', cy: '0.26', r: '0.55' },
        R.createElement('stop', { offset: '0', stopColor: '#fff', stopOpacity: '0.95' }),
        R.createElement('stop', { offset: '0.4', stopColor: '#fff', stopOpacity: '0.28' }),
        R.createElement('stop', { offset: '1', stopColor: '#fff', stopOpacity: '0' })
      ),
      R.createElement('linearGradient', { id: uid + 'mt', x1: '0', y1: '0', x2: '0', y2: '1' },
        R.createElement('stop', { offset: '0', stopColor: '#3a4048' }),
        R.createElement('stop', { offset: '1', stopColor: '#15191e' })
      ),
      // tartan pattern (hatband / sash)
      R.createElement('pattern', { id: uid + 'tn', width: '14', height: '14', patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(0)' },
        R.createElement('rect', { width: '14', height: '14', fill: '#1f3d2e' }),
        R.createElement('rect', { width: '14', height: '14', fill: '#10325a', opacity: '0.45' }),
        R.createElement('rect', { x: '0', width: '4', height: '14', fill: '#9b1b2e' }),
        R.createElement('rect', { y: '0', width: '14', height: '4', fill: '#9b1b2e' }),
        R.createElement('rect', { x: '9', width: '1.4', height: '14', fill: '#e7d27a', opacity: '0.8' }),
        R.createElement('rect', { y: '9', width: '14', height: '1.4', fill: '#e7d27a', opacity: '0.8' })
      )
    );
  }

  // ---- eyes ----------------------------------------------------------------
  function eye(uid, cx, cy, style, dx, dy, blink, blinkDelay) {
    var ink = INK, els = [];
    var pupil = '#20252b';
    if (style === 'joy') {
      // happy upward arcs
      return R.createElement('path', { key: 'e' + cx, d: 'M' + (cx - 16) + ',' + (cy + 4) + ' Q' + cx + ',' + (cy - 16) + ' ' + (cx + 16) + ',' + (cy + 4), fill: 'none', stroke: ink, strokeWidth: 6, strokeLinecap: 'round' });
    }
    if (style === 'shut') {
      return R.createElement('path', { key: 'e' + cx, d: 'M' + (cx - 15) + ',' + (cy - 2) + ' Q' + cx + ',' + (cy + 10) + ' ' + (cx + 15) + ',' + (cy - 2), fill: 'none', stroke: ink, strokeWidth: 6, strokeLinecap: 'round' });
    }
    var rx = 18, ry = 21, pr = 9;
    if (style === 'wide') { rx = 20; ry = 24; pr = 7; }
    if (style === 'narrow') { ry = 13; pr = 8; }
    if (style === 'half' || style === 'worry') { ry = 18; }
    var px = cx + dx, py = cy + 2 + dy;
    // clamp pupil within white
    var maxx = (rx - pr - 2), maxy = (ry - pr - 2);
    var ox = Math.max(-maxx, Math.min(maxx, dx));
    var oy = Math.max(-maxy, Math.min(maxy, dy));
    px = cx + ox; py = cy + 2 + oy;
    els.push(R.createElement('ellipse', { key: 'w', cx: cx, cy: cy, rx: rx, ry: ry, fill: '#fff', stroke: ink, strokeWidth: 4 }));
    els.push(R.createElement('circle', { key: 'p', cx: px, cy: py, r: pr, fill: pupil }));
    els.push(R.createElement('circle', { key: 'g', cx: px - 3, cy: py - 3, r: 2.6, fill: '#fff' }));
    // half/sly lid
    if (style === 'half') {
      els.push(R.createElement('path', { key: 'l', d: 'M' + (cx - rx - 1) + ',' + (cy - 3) + ' a' + rx + ',' + ry + ' 0 0 1 ' + (rx * 2 + 2) + ',0 l0,-' + (ry + 4) + ' l-' + (rx * 2 + 2) + ',0 Z', fill: 'url(#' + uid + 'cr)', stroke: ink, strokeWidth: 4, strokeLinejoin: 'round' }));
    }
    if (style === 'worry') {
      els.push(R.createElement('path', { key: 'l', d: 'M' + (cx - rx - 1) + ',' + (cy - 6) + ' a' + rx + ',' + ry + ' 0 0 1 ' + (rx * 2 + 2) + ',0 l0,-' + (ry + 6) + ' l-' + (rx * 2 + 2) + ',0 Z', fill: 'url(#' + uid + 'cr)', stroke: ink, strokeWidth: 4, strokeLinejoin: 'round' }));
    }
    // blink lid (only for normal open-ish eyes)
    if (blink) {
      els.push(R.createElement('ellipse', { key: 'bl', className: 'wh-lid wh-blinking', style: { '--whblink': blinkDelay }, cx: cx, cy: cy, rx: rx + 1, ry: ry + 1, fill: 'url(#' + uid + 'cr)', stroke: ink, strokeWidth: 4 }));
    }
    return R.createElement('g', { key: 'e' + cx }, els);
  }

  // ---- mouth ---------------------------------------------------------------
  function mouth(style) {
    var ink = INK, lip = '#d8536e';
    switch (style) {
      case 'smile':
        return R.createElement('g', null,
          R.createElement('path', { d: 'M84,164 Q110,190 136,164 Q110,180 84,164 Z', fill: ink }),
          R.createElement('path', { d: 'M97,177 Q110,184 123,177 Q110,182 97,177 Z', fill: lip }));
      case 'grin':
        return R.createElement('g', null,
          R.createElement('path', { d: 'M80,160 Q110,196 140,160 Q110,176 80,160 Z', fill: ink }),
          R.createElement('rect', { x: '92', y: '161', width: '36', height: '7', rx: '2', fill: '#fff' }),
          R.createElement('path', { d: 'M96,180 Q110,188 124,180 Q110,185 96,180 Z', fill: lip }));
      case 'oh':
        return R.createElement('g', null,
          R.createElement('ellipse', { cx: '110', cy: '170', rx: '15', ry: '19', fill: ink }),
          R.createElement('ellipse', { cx: '110', cy: '177', rx: '8', ry: '7', fill: lip }));
      case 'shout':
        return R.createElement('g', null,
          R.createElement('path', { d: 'M86,158 Q110,166 134,158 Q126,188 110,188 Q94,188 86,158 Z', fill: ink }),
          R.createElement('rect', { x: '90', y: '159', width: '40', height: '6', rx: '2', fill: '#fff' }),
          R.createElement('path', { d: 'M99,180 Q110,186 121,180 Q110,184 99,180 Z', fill: lip }));
      case 'smirk':
        return R.createElement('path', { d: 'M88,170 Q116,180 132,158', fill: 'none', stroke: ink, strokeWidth: 6, strokeLinecap: 'round' });
      case 'sly':
        return R.createElement('path', { d: 'M86,166 Q104,178 124,170 Q132,168 134,160', fill: 'none', stroke: ink, strokeWidth: 6, strokeLinecap: 'round' });
      case 'wavy':
        return R.createElement('path', { d: 'M88,170 q8,-7 14,0 q7,7 14,0 q6,-6 8,-2', fill: 'none', stroke: ink, strokeWidth: 5.5, strokeLinecap: 'round' });
      case 'wail':
        return R.createElement('g', null,
          R.createElement('path', { d: 'M88,182 Q110,160 132,182 Q110,196 88,182 Z', fill: ink }),
          R.createElement('path', { d: 'M98,182 Q110,176 122,182 Q110,189 98,182 Z', fill: lip }));
      case 'soft':
      default:
        return R.createElement('path', { d: 'M90,166 Q110,180 130,166', fill: 'none', stroke: ink, strokeWidth: 6, strokeLinecap: 'round' });
    }
  }

  // ---- arms ----------------------------------------------------------------
  function arms(uid, style) {
    var stroke = INK, fill = 'url(#' + uid + 'cr)';
    var A = function (d, k, cls) { return R.createElement('path', { key: k, className: cls, d: d, fill: fill, stroke: stroke, strokeWidth: 5, strokeLinejoin: 'round', strokeLinecap: 'round' }); };
    switch (style) {
      case 'up':
        return R.createElement('g', null,
          A('M52,150 Q22,128 16,96 Q32,104 42,124 Q52,142 62,158 Z', 'l'),
          A('M168,150 Q198,128 204,96 Q188,104 178,124 Q168,142 158,158 Z', 'r'));
      case 'hips':
        return R.createElement('g', null,
          A('M50,172 Q24,176 22,198 Q42,194 58,184 Z', 'l'),
          A('M170,172 Q196,176 198,198 Q178,194 162,184 Z', 'r'));
      case 'startle':
        return R.createElement('g', null,
          A('M52,150 Q24,140 14,150 Q30,160 50,160 Z', 'l'),
          A('M168,150 Q196,140 206,150 Q190,160 170,160 Z', 'r'));
      case 'fidget':
        return R.createElement('g', null,
          A('M54,172 Q44,186 56,196 Q66,188 66,178 Z', 'l'),
          A('M166,172 Q176,186 164,196 Q154,188 154,178 Z', 'r'));
      case 'card':
        return R.createElement('g', null,
          A('M168,160 Q188,138 182,112 Q172,124 162,140 Z', 'r'),
          R.createElement('g', { key: 'rc', transform: 'rotate(8 176 100)' },
            R.createElement('rect', { x: '168', y: '74', width: '22', height: '32', rx: '4', fill: '#E8272A', stroke: stroke, strokeWidth: '4' })),
          A('M52,172 Q26,176 24,198 Q44,194 60,184 Z', 'l'));
      case 'face':
        return R.createElement('g', null,
          A('M58,158 Q44,176 60,186 Q72,178 70,164 Z', 'l'),
          A('M162,158 Q176,176 160,186 Q148,178 150,164 Z', 'r'));
      case 'rub':
        return R.createElement('g', null,
          A('M60,178 Q44,186 52,198 Q66,196 78,188 Z', 'l'),
          A('M160,178 Q176,186 168,198 Q154,196 142,188 Z', 'r'));
      case 'flag':
        return R.createElement('g', null,
          A('M50,172 Q24,176 22,198 Q42,194 58,184 Z', 'l'),
          A('M168,150 Q196,132 200,104 Q186,116 176,136 Z', 'r'),
          // saltire flag in right hand
          R.createElement('g', { key: 'fg', transform: 'translate(192,70)' },
            R.createElement('rect', { x: '-2', y: '0', width: '3', height: '54', rx: '1.5', fill: '#5a6470' }),
            R.createElement('g', { className: 'wh-flag' },
              R.createElement('rect', { x: '1', y: '2', width: '40', height: '28', rx: '2', fill: '#0a4aa0', stroke: stroke, strokeWidth: '2.5' }),
              R.createElement('path', { d: 'M1,2 L41,30 M41,2 L1,30', stroke: '#fff', strokeWidth: '5' }))));
      case 'rest':
      default:
        return R.createElement('g', null,
          A('M52,166 Q34,172 30,190 Q48,186 60,178 Z', 'l'),
          A('M168,166 Q186,172 190,190 Q172,186 160,178 Z', 'r'));
    }
  }

  // ---- per-mood floating extras -------------------------------------------
  function extras(mood) {
    switch (mood) {
      case 'celebrating':
        return R.createElement('g', null,
          star(34, 60, 7, '#F5C800', 'wh-twinkle'),
          star(182, 52, 6, '#F5C800', 'wh-twinkle d1'),
          star(168, 150, 5, '#F5C800', 'wh-twinkle d2'),
          star(40, 150, 5, '#F5C800', 'wh-twinkle d1'));
      case 'shocked':
        return R.createElement('g', { stroke: '#E8272A', strokeWidth: 4, strokeLinecap: 'round' },
          R.createElement('line', { x1: '110', y1: '44', x2: '110', y2: '30' }),
          R.createElement('line', { x1: '142', y1: '52', x2: '152', y2: '40' }),
          R.createElement('line', { x1: '78', y1: '52', x2: '68', y2: '40' }));
      case 'nervous':
        return R.createElement('ellipse', { className: 'wh-drip', cx: '150', cy: '116', rx: '5', ry: '8', fill: '#5BB6E8', stroke: INK, strokeWidth: '1.5' });
      case 'angry':
        return R.createElement('g', null,
          // steam puffs
          R.createElement('g', { transform: 'translate(150,86)', fill: '#cfd8df' },
            R.createElement('circle', { className: 'wh-puff', cx: '0', cy: '0', r: '5' }),
            R.createElement('circle', { className: 'wh-puff', cx: '0', cy: '8', r: '4', style: { animationDelay: '.4s' } })),
          // anger throb mark
          R.createElement('g', { transform: 'translate(70,86)', stroke: '#E8272A', strokeWidth: '3.5', fill: 'none', strokeLinecap: 'round' },
            R.createElement('path', { d: 'M0,0 L8,4 L0,8 M10,-2 L18,4 L10,10' })));
      case 'crying':
        return R.createElement('g', null,
          R.createElement('ellipse', { className: 'wh-drip', cx: '78', cy: '140', rx: '5', ry: '8', fill: '#5BB6E8', stroke: INK, strokeWidth: '1.5' }),
          R.createElement('ellipse', { className: 'wh-drip', cx: '142', cy: '140', rx: '5', ry: '8', fill: '#5BB6E8', stroke: INK, strokeWidth: '1.5', style: { animationDelay: '.7s' } }));
      case 'mischievous':
        return star(150, 150, 6, '#F5C800', 'wh-twinkle');
      case 'scottish':
        return R.createElement('g', null,
          star(30, 70, 7, '#0a4aa0', 'wh-twinkle'),
          star(190, 64, 6, '#0a4aa0', 'wh-twinkle d1'),
          star(176, 156, 5, '#fff', 'wh-twinkle d2'),
          star(36, 158, 5, '#fff', 'wh-twinkle d1'));
      default:
        return null;
    }
  }
  function star(cx, cy, s, fill, cls) {
    return R.createElement('path', {
      className: cls, transform: 'translate(' + cx + ',' + cy + ')',
      d: 'M0,' + (-s) + ' L' + (s * 0.3) + ',' + (-s * 0.3) + ' L' + s + ',0 L' + (s * 0.3) + ',' + (s * 0.3) + ' L0,' + s + ' L' + (-s * 0.3) + ',' + (s * 0.3) + ' L' + (-s) + ',0 L' + (-s * 0.3) + ',' + (-s * 0.3) + ' Z',
      fill: fill, stroke: INK, strokeWidth: 1.5
    });
  }

  // ---- tam o' shanter ------------------------------------------------------
  function tam(uid, scottish) {
    var ink = INK;
    var tilt = scottish ? -16 : -9;
    var scale = scottish ? 1.12 : 1;
    return R.createElement('g', { transform: 'translate(110,52) rotate(' + tilt + ') scale(' + scale + ') translate(-110,-52)' },
      // floppy wool top
      R.createElement('ellipse', { cx: '110', cy: '44', rx: '62', ry: '24', fill: '#262a31' }),
      R.createElement('ellipse', { cx: '96', cy: '38', rx: '34', ry: '13', fill: '#343a44', opacity: '0.8' }),
      // ribbed headband with tartan
      R.createElement('path', { d: 'M58,52 Q110,72 162,52 L162,60 Q110,80 58,60 Z', fill: 'url(#' + uid + 'tn)', stroke: ink, strokeWidth: '3' }),
      R.createElement('ellipse', { cx: '110', cy: '52', rx: '54', ry: '14', fill: 'none', stroke: ink, strokeWidth: '3' }),
      // toorie (red pom-pom)
      R.createElement('circle', { cx: '110', cy: '24', r: '9', fill: '#E8272A', stroke: ink, strokeWidth: '3' }),
      R.createElement('circle', { cx: '107', cy: '21', r: '2.5', fill: '#ff8a98' })
    );
  }

  function Wheesht(props) {
    var mood = resolveMood(props.mood);
    var c = CFG[mood];
    var size = props.size || 150;
    var animate = !!props.animate;
    var track = !!props.track;
    var uid = R.useMemo(function () { return 'w' + Math.random().toString(36).slice(2, 8); }, []);
    var blinkDelay = R.useMemo(function () { return (4.5 + Math.random() * 2.5).toFixed(2) + 's'; }, []);

    // eye tracking (opt-in to keep many small instances cheap)
    var ref = R.useRef(null);
    var st = R.useState({ x: 0, y: 0 });
    var off = st[0], setOff = st[1];
    R.useEffect(function () {
      if (!track) return;
      function onMove(e) {
        var el = ref.current; if (!el) return;
        var r = el.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height * 0.45;
        var dx = (e.clientX - cx) / r.width, dy = (e.clientY - cy) / r.height;
        var clamp = function (v) { return Math.max(-1, Math.min(1, v)); };
        setOff({ x: clamp(dx) * 5, y: clamp(dy) * 5 });
      }
      window.addEventListener('pointermove', onMove);
      return function () { window.removeEventListener('pointermove', onMove); };
    }, [track]);

    var dx = c.dx + (track ? off.x : 0);
    var dy = c.dy + (track ? off.y : 0);
    var canBlink = animate && (c.eyes === 'open' || c.eyes === 'half' || c.eyes === 'wide' || c.eyes === 'narrow' || c.eyes === 'worry');
    var scottish = mood === 'scottish';

    var stage = R.createElement('g', { className: 'wh-stage' + (animate ? ' wh-a-' + c.anim : '') },
      // lanyard
      R.createElement('path', { d: 'M72,86 Q110,50 148,86', fill: 'none', stroke: '#C81E22', strokeWidth: 7, strokeLinecap: 'round' }),
      R.createElement('path', { d: 'M74,88 Q110,54 146,88', fill: 'none', stroke: '#7c1216', strokeWidth: 2.5, strokeLinecap: 'round', opacity: 0.6 }),
      arms(uid, c.arms),
      // legs + referee boots
      R.createElement('g', null,
        R.createElement('rect', { x: '90', y: '198', width: '13', height: '30', rx: '6.5', fill: 'url(#' + uid + 'cr)', stroke: INK, strokeWidth: 5 }),
        R.createElement('rect', { x: '117', y: '198', width: '13', height: '30', rx: '6.5', fill: 'url(#' + uid + 'cr)', stroke: INK, strokeWidth: 5 }),
        R.createElement('path', { d: 'M80,228 q-2,-12 16,-12 l8,0 0,12 Z', fill: INK }),
        R.createElement('path', { d: 'M140,228 q2,-12 -16,-12 l-8,0 0,12 Z', fill: INK }),
        R.createElement('rect', { x: '78', y: '226', width: '24', height: '5', rx: '2', fill: '#fff', opacity: 0.85 }),
        R.createElement('rect', { x: '118', y: '226', width: '24', height: '5', rx: '2', fill: '#fff', opacity: 0.85 })
      ),
      // body (chrome)
      R.createElement('circle', { cx: '110', cy: '138', r: '66', fill: 'url(#' + uid + 'cr)', stroke: INK, strokeWidth: 6 }),
      // chrome reflection band + specular
      R.createElement('path', { d: 'M48,150 Q110,140 172,150 Q110,162 48,150 Z', fill: '#fff', opacity: 0.35 }),
      R.createElement('ellipse', { cx: '110', cy: '138', rx: '60', ry: '60', fill: 'url(#' + uid + 'sp)' }),
      R.createElement('ellipse', { cx: '82', cy: '108', rx: '18', ry: '12', fill: '#fff', opacity: 0.65, transform: 'rotate(-25 82 108)' }),
      R.createElement('circle', { cx: '150', cy: '170', r: '7', fill: '#fff', opacity: 0.5 }),
      // whistle hardware: top ring + sound window + mouthpiece
      R.createElement('circle', { cx: '110', cy: '74', r: '9', fill: 'none', stroke: INK, strokeWidth: 5 }),
      R.createElement('path', { d: 'M150,150 q15,3 15,19 q-15,3 -19,-10 Z', fill: 'url(#' + uid + 'mt)', stroke: INK, strokeWidth: 3 }),
      R.createElement('g', null,
        R.createElement('rect', { x: '44', y: '152', width: '28', height: '18', rx: '7', transform: 'rotate(12 58 160)', fill: 'url(#' + uid + 'cr)', stroke: INK, strokeWidth: 5 }),
        R.createElement('rect', { x: '44', y: '157', width: '10', height: '8', rx: '2', transform: 'rotate(12 49 161)', fill: 'url(#' + uid + 'mt)' })),
      // tartan sash for scottish mode
      scottish ? R.createElement('path', { d: 'M64,108 L150,184 L138,196 L52,120 Z', fill: 'url(#' + uid + 'tn)', stroke: INK, strokeWidth: 3, opacity: 0.96 }) : null,
      extras(mood),
      // cheeks
      scottish
        ? R.createElement('g', null,
            saltireCheek(66, 150), saltireCheek(154, 150))
        : R.createElement('g', null,
            R.createElement('circle', { cx: '68', cy: '150', r: '11', fill: '#F0708F', opacity: 0.6 }),
            R.createElement('circle', { cx: '152', cy: '150', r: '11', fill: '#F0708F', opacity: 0.6 })),
      // eyes
      R.createElement('g', null,
        eye(uid, 86, 126, c.eyes, dx, dy, canBlink, blinkDelay),
        eye(uid, 134, 126, c.eyes, dx, dy, canBlink, blinkDelay)),
      // eyebrows
      R.createElement('path', { d: BROWS[c.brow][0], fill: 'none', stroke: INK, strokeWidth: 6, strokeLinecap: 'round' }),
      R.createElement('path', { d: BROWS[c.brow][1], fill: 'none', stroke: INK, strokeWidth: 6, strokeLinecap: 'round' }),
      mouth(c.mouth),
      // hat last (on top)
      tam(uid, scottish)
    );

    return R.createElement('svg', {
      ref: ref, className: 'wh-svg', viewBox: '0 0 220 250',
      width: size, height: size * (250 / 220),
      style: { display: 'block' }
    },
      makeDefs(uid, scottish),
      R.createElement('ellipse', { cx: '110', cy: '236', rx: '54', ry: '9', fill: '#1A1A1A', opacity: 0.12 }),
      R.createElement('g', { className: animate ? 'wh-breathe' : '' }, stage)
    );
  }
  function saltireCheek(cx, cy) {
    return R.createElement('g', { key: 'sc' + cx, transform: 'translate(' + (cx - 10) + ',' + (cy - 7) + ')' },
      R.createElement('rect', { x: '0', y: '0', width: '20', height: '14', rx: '3', fill: '#0a4aa0', opacity: 0.92 }),
      R.createElement('path', { d: 'M0,0 L20,14 M20,0 L0,14', stroke: '#fff', strokeWidth: 3 }));
  }

  window.Wheesht = Wheesht;
  window.WHEESHT_MOODS = CANON;
})();
