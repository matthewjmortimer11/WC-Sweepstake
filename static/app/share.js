/* Share helpers — invite links, Web Share API, WhatsApp, canvas cards. */
(function () {
  function leagueCode() {
    return window.Store && window.Store.leagueCode ? window.Store.leagueCode() : '';
  }
  function inviteUrl(code) {
    var c = (code || leagueCode() || '').trim().toUpperCase();
    return location.origin + '/join/' + encodeURIComponent(c);
  }
  function appJoinUrl(code) {
    var c = (code || leagueCode() || '').trim().toUpperCase();
    return location.origin + '/?join=' + encodeURIComponent(c);
  }
  function buildInviteMessage(league, variant) {
    var L = league || (window.Store && window.Store.activeLeague && window.Store.activeLeague()) || {};
    var name = L.name || 'our sweepstake';
    var link = inviteUrl(L.code);
    var copy = window.WheeshtCopy || {};
    var templates = copy.inviteTemplates || {};
    var key = variant || L.purpose || 'work';
    var tpl = templates[key] || templates.work;
    if (tpl) return tpl.replace(/\{name\}/g, name).replace(/\{link\}/g, link);
    return 'You\'re invited to ' + name + ' on Wheesht — World Cup sweepstake, predictions, and gentle chaos.\n\nJoin here: ' + link;
  }
  function whatsappUrl(text) {
    return 'https://wa.me/?text=' + encodeURIComponent(text || '');
  }
  function qrImageUrl(url, size) {
    var s = size || 240;
    return 'https://api.qrserver.com/v1/create-qr-code/?size=' + s + 'x' + s + '&data=' + encodeURIComponent(url || '');
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; });
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return Promise.resolve(true);
  }
  function shareViaWebShare(opts) {
    opts = opts || {};
    if (navigator.share) {
      return navigator.share(opts).then(function () { return true; }).catch(function () { return false; });
    }
    var text = opts.text || opts.title || '';
    if (opts.url) text = (text ? text + '\n\n' : '') + opts.url;
    return copyText(text).then(function () {
      if (window.wcToast) window.wcToast('Copied to clipboard.', 'confident');
      return true;
    });
  }
  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }
  function renderInvitePoster(league) {
    var L = league || {};
    var W = 1080, H = 1350;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F4EEE3';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1A1A1A';
    drawRoundedRect(ctx, 48, 48, W - 96, H - 96, 36);
    ctx.fill();
    ctx.fillStyle = '#F5C800';
    ctx.font = 'bold 56px Bricolage Grotesque, sans-serif';
    ctx.fillText('Wheesht', 88, 130);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 64px Bricolage Grotesque, sans-serif';
    var title = (L.name || 'Sweepstake').slice(0, 28);
    ctx.fillText(title, 88, 240);
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.font = '600 38px Hanken Grotesk, sans-serif';
    ctx.fillText('World Cup sweepstake', 88, 310);
    ctx.fillStyle = '#F5C800';
    ctx.font = 'bold 48px Bricolage Grotesque, sans-serif';
    ctx.fillText((L.code || '').toUpperCase(), 88, 400);
    return { canvas: canvas, qrBox: { x: 88, y: 460, size: 360 } };
  }
  function shareInvitePoster(league) {
    var rendered = renderInvitePoster(league);
    var canvas = rendered.canvas;
    var box = rendered.qrBox;
    var link = inviteUrl(league && league.code);
    return loadImage(qrImageUrl(link, box.size)).then(function (qr) {
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      drawRoundedRect(ctx, box.x - 12, box.y - 12, box.size + 24, box.size + 24, 16);
      ctx.fill();
      ctx.drawImage(qr, box.x, box.y, box.size, box.size);
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.font = '600 32px Hanken Grotesk, sans-serif';
      ctx.fillText('Scan to join · wheesht', 88, 920);
      return canvasToBlob(canvas);
    }).then(function (blob) {
      if (!blob) throw new Error('Could not render poster');
      var file = new File([blob], 'wheesht-invite.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: 'Join ' + (league.name || 'Wheesht') });
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'wheesht-invite.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (window.wcToast) window.wcToast('Poster saved.', 'confident');
    });
  }
  function renderLeaderboardCard(opts) {
    opts = opts || {};
    var W = 1080, H = 1350;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F4EEE3';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1A1A1A';
    drawRoundedRect(ctx, 48, 48, W - 96, H - 96, 36);
    ctx.fill();
    ctx.fillStyle = '#F5C800';
    ctx.font = 'bold 52px Bricolage Grotesque, sans-serif';
    ctx.fillText('Wheesht', 88, 130);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 64px Bricolage Grotesque, sans-serif';
    var title = (opts.leagueName || 'Sweepstake') + ' standings';
    ctx.fillText(title.length > 28 ? title.slice(0, 26) + '…' : title, 88, 220);
    var rows = (opts.rows || []).slice(0, 5);
    var meId = opts.meId;
    rows.forEach(function (p, i) {
      var y = 320 + i * 170;
      var isMe = p.id === meId;
      if (isMe) {
        ctx.fillStyle = 'rgba(245,200,0,.25)';
        drawRoundedRect(ctx, 72, y - 50, W - 144, 140, 20);
        ctx.fill();
      }
      ctx.fillStyle = isMe ? '#F5C800' : '#fff';
      ctx.font = 'bold 48px Bricolage Grotesque, sans-serif';
      ctx.fillText(String(i + 1), 88, y + 20);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 44px Hanken Grotesk, sans-serif';
      var nm = (p.displayName || p.name || 'Player').slice(0, 22);
      ctx.fillText(nm, 160, y + 10);
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.font = '600 36px Hanken Grotesk, sans-serif';
      ctx.fillText((p.predScore || 0) + ' pts', 160, y + 58);
    });
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.font = '600 32px Hanken Grotesk, sans-serif';
    ctx.fillText('wheesht.app · officially impartial', 88, H - 110);
    return canvas;
  }
  function canvasToBlob(canvas) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (b) { resolve(b); }, 'image/png', 0.92);
    });
  }
  function shareLeaderboard(opts) {
    var canvas = renderLeaderboardCard(opts);
    return canvasToBlob(canvas).then(function (blob) {
      if (!blob) throw new Error('Could not render image');
      var file = new File([blob], 'wheesht-standings.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: 'Wheesht standings' });
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'wheesht-standings.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (window.wcToast) window.wcToast('Standings image saved.', 'celebrating');
    });
  }
  function renderOvertakeCard(opts) {
    opts = opts || {};
    var W = 1080, H = 1080;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F5C800';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1A1A1A';
    drawRoundedRect(ctx, 56, 56, W - 112, H - 112, 32);
    ctx.fill();
    ctx.fillStyle = '#F5C800';
    ctx.font = 'bold 56px Bricolage Grotesque, sans-serif';
    ctx.fillText('Wheesht', 96, 140);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 58px Bricolage Grotesque, sans-serif';
    var line1 = 'I\'ve gone past';
    ctx.fillText(line1, 96, 280);
    ctx.fillStyle = '#F5C800';
    ctx.font = 'bold 72px Bricolage Grotesque, sans-serif';
    var victim = (opts.overtakenName || 'someone').slice(0, 18);
    ctx.fillText(victim, 96, 380);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.font = '600 40px Hanken Grotesk, sans-serif';
    ctx.fillText('on the prediction board.', 96, 460);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 120px Bricolage Grotesque, sans-serif';
    ctx.fillText('#' + (opts.rank || '?'), 96, 640);
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.font = '600 34px Hanken Grotesk, sans-serif';
    ctx.fillText((opts.leagueName || 'Wheesht league'), 96, H - 120);
    return canvas;
  }
  function shareOvertake(opts) {
    var canvas = renderOvertakeCard(opts);
    return canvasToBlob(canvas).then(function (blob) {
      if (!blob) throw new Error('Could not render image');
      var file = new File([blob], 'wheesht-overtake.png', { type: 'image/png' });
      var text = 'I\'ve gone past ' + (opts.overtakenName || 'someone') + ' on the Wheesht board.';
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], text: text, title: 'Wheesht' });
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'wheesht-overtake.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (window.wcToast) window.wcToast('Share card saved.', 'celebrating');
    });
  }
  window.WheeshtShare = {
    inviteUrl: inviteUrl,
    appJoinUrl: appJoinUrl,
    buildInviteMessage: buildInviteMessage,
    whatsappUrl: whatsappUrl,
    qrImageUrl: qrImageUrl,
    copyText: copyText,
    shareViaWebShare: shareViaWebShare,
    shareLeaderboard: shareLeaderboard,
    shareOvertake: shareOvertake,
    shareInvitePoster: shareInvitePoster,
  };
})();
