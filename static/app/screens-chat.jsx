/* ===========================================================================
   CHAT — simple group message wall. Live only (requires WC_LIVE / server).
   Polls every 15 s; messages are appended locally on send for instant feel.
   =========================================================================== */
const WCch = window.WC;
const Sch = window.Store;
const Wch = window.Wheesht;
const Wch_Avatar = window.Avatar;
const { useState: cState, useEffect: cEffect, useRef: cRef } = React;

const WHEESHT_MOODS = [
  { key: 'confident', label: '😤 Confident' },
  { key: 'celebrating', label: '🎉 Celebrating' },
  { key: 'shocked', label: '😱 Shocked' },
  { key: 'mischievous', label: '😏 Mischievous' },
  { key: 'neutral', label: '😐 Neutral' },
];

function ChatScreen() {
  const me = Sch.active();
  const [msgs, setMsgs] = cState([]);
  const [text, setText] = cState('');
  const [busy, setBusy] = cState(false);
  const [err, setErr] = cState(false);
  const [asWheesht, setAsWheesht] = cState(false);
  const [mood, setMood] = cState('confident');
  const listRef = cRef(null);
  const isLive = !!window.WC_LIVE;
  const leagueCode = Sch.leagueCode && Sch.leagueCode();
  const isOrganiser = Sch.hasAdminToken && Sch.hasAdminToken();

  function scrollBottom() {
    setTimeout(function() {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, 60);
  }

  function load() {
    if (!leagueCode) {
      setMsgs([]);
      setErr(false);
      return;
    }
    fetch(Sch.api('/chat')).then(function(r) {
      return r.json().then(function(data) {
        if (!r.ok) throw new Error((data && data.detail) || 'Chat failed');
        return data;
      });
    }).then(function(data) {
      var arr = Array.isArray(data) ? data : [];
      setMsgs(arr);
      setErr(false);
      if (window.__wcOnChatPoll) window.__wcOnChatPoll(arr);
    }).catch(function() { setErr(true); });
  }

  cEffect(function() {
    if (!isLive || !leagueCode) return;
    load();
    scrollBottom();
    var iv = setInterval(load, 15000);
    return function() { clearInterval(iv); };
  }, [isLive, leagueCode]);

  cEffect(function() { scrollBottom(); }, [msgs.length]);

  function send() {
    if (!text.trim() || busy || !leagueCode) return;
    if (!asWheesht && !me) return;
    setBusy(true);
    var url = asWheesht ? Sch.api('/chat/system') : Sch.api('/chat');
    var body = asWheesht
      ? JSON.stringify({ text: text.trim(), mood: mood })
      : JSON.stringify({ author_id: me.id, text: text.trim() });
    var headers = asWheesht ? Sch.adminHeaders() : { 'Content-Type': 'application/json' };
    fetch(url, { method: 'POST', headers: headers, body: body })
      .then(function(r) {
        return r.json().then(function(msg) {
          if (!r.ok) throw new Error((msg && msg.detail) || 'Message failed');
          return msg;
        });
      }).then(function(msg) {
        if (msg && msg.id) setMsgs(function(prev) { return prev.concat([msg]); });
        setText('');
        setBusy(false);
        setErr(false);
        window.wcHaptic && window.wcHaptic('light');
      }).catch(function() { setBusy(false); setErr(true); });
  }

  if (!isLive) {
    return (
      <div style={{ padding: '48px 22px', textAlign: 'center' }}>
        <Wch mood="mischievous" size={88} animate />
        <div className="dh" style={{ fontSize: 22, marginTop: 12 }}>Group chat</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 8, lineHeight: 1.5 }}>
          Chat only works when connected to the sweepstake server.<br />Open the shared link to join the conversation.
        </div>
      </div>
    );
  }

  if (!leagueCode) {
    return (
      <div style={{ padding: '48px 22px', textAlign: 'center' }}>
        <Wch mood="neutral" size={88} animate />
        <div className="dh" style={{ fontSize: 22, marginTop: 12 }}>Group chat</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 8, lineHeight: 1.5 }}>
          Join or create a league to use chat.
        </div>
      </div>
    );
  }

  return (
    <div className="chat-wrap" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 146px - env(safe-area-inset-top, 0px))' }}>

      {/* message list */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px' }}>
        {msgs.length === 0 && !err && (
          <div style={{ textAlign: 'center', padding: '44px 0', color: 'var(--ink2)', fontSize: 13.5, fontWeight: 600 }}>
            <Wch mood="neutral" size={64} animate />
            <div style={{ marginTop: 8 }}>Nothing yet. Wheesht is listening.</div>
          </div>
        )}
        {err && (
          <button onClick={load} style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'center', padding: '32px 0', color: 'var(--ink2)', fontFamily: 'var(--body)', fontSize: 13, fontWeight: 700 }}>
            Couldn't load messages — tap to retry.
          </button>
        )}
        {msgs.map(function(msg) {
          var isMe = me && msg.author_id === me.id;
          var isWheesht = msg.author_id === 'wheesht';
          var t = WCch.TEAMS[msg.team];
          var d = new Date(msg.ts);
          var timeStr = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');

          if (isWheesht) {
            var mood = msg.team || 'confident'; // team field carries the mood for system messages
            return (
              <div key={msg.id} style={{ display: 'flex', gap: 11, marginBottom: 16, alignItems: 'flex-start', background: 'var(--ink)', borderRadius: 18, padding: '12px 14px' }}>
                <div style={{ flexShrink: 0 }}>
                  <Wch mood={mood} size={42} animate />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--yellow)', marginBottom: 4 }}>Wheesht · announcement</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', lineHeight: 1.42, wordBreak: 'break-word' }}>{msg.text}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', fontWeight: 600, marginTop: 4 }}>{timeStr}</div>
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} style={{ display: 'flex', gap: 9, marginBottom: 14, flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end' }}>
              {!isMe && (function(){
                var person = Sch.allSync().find(function(p){ return p.id === msg.author_id; })
                  || { id: msg.author_id, initials: msg.initials || '?', color: msg.color || '#333', isYou: false };
                return <Wch_Avatar person={person} size={34} />;
              })()}
              <div style={{ maxWidth: '74%' }}>
                {!isMe && (
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--ink2)', marginBottom: 4, letterSpacing: '.01em' }}>
                    {msg.author}{t ? (' ' + t.flag) : ''}
                  </div>
                )}
                <div style={{
                  background: isMe ? 'var(--ink)' : '#fff',
                  color: isMe ? '#fff' : 'var(--ink)',
                  border: isMe ? 'none' : '2px solid var(--line)',
                  borderRadius: isMe ? '18px 18px 5px 18px' : '18px 18px 18px 5px',
                  padding: '10px 13px',
                  fontSize: 14, fontWeight: 500, lineHeight: 1.42,
                  wordBreak: 'break-word',
                }}>
                  {msg.text}
                </div>
                <div style={{ fontSize: 10, color: 'var(--ink2)', fontWeight: 600, marginTop: 3, textAlign: isMe ? 'right' : 'left', paddingLeft: isMe ? 0 : 2 }}>
                  {timeStr}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* input bar */}
      {(me || isOrganiser) ? (
        <div style={{ borderTop: '1.5px solid var(--line)', background: asWheesht ? 'var(--ink)' : 'var(--bg)', flexShrink: 0 }}>
          {isOrganiser && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px 0' }}>
              <button
                onClick={function() { setAsWheesht(function(v) { return !v; }); }}
                style={{ background: asWheesht ? 'var(--yellow)' : 'rgba(0,0,0,.07)', border: 'none', borderRadius: 999, padding: '4px 11px', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 11.5, cursor: 'pointer', color: asWheesht ? 'var(--ink)' : 'var(--ink2)', letterSpacing: '-.01em', flexShrink: 0, transition: 'background .15s' }}
              >
                {asWheesht ? '🐦 Wheesht mode ON' : 'Send as Wheesht'}
              </button>
              {asWheesht && (
                <select
                  value={mood}
                  onChange={function(e) { setMood(e.target.value); }}
                  style={{ border: 'none', background: 'rgba(255,255,255,.15)', color: '#fff', borderRadius: 8, padding: '4px 8px', fontFamily: 'var(--body)', fontWeight: 700, fontSize: 12, cursor: 'pointer', flex: 1, minWidth: 0 }}
                >
                  {WHEESHT_MOODS.map(function(m) { return <option key={m.key} value={m.key} style={{ background: '#222', color: '#fff' }}>{m.label}</option>; })}
                </select>
              )}
            </div>
          )}
          {(me || asWheesht) && (
            <div style={{ display: 'flex', gap: 9, padding: '7px 12px 12px' }}>
              <input
                style={{ flex: 1, border: asWheesht ? '2.5px solid var(--yellow)' : '2.5px solid var(--ink)', borderRadius: 22, padding: '10px 14px', fontFamily: 'var(--body)', fontSize: 14, fontWeight: 500, background: asWheesht ? 'rgba(255,255,255,.1)' : '#fff', outline: 'none', color: asWheesht ? '#fff' : 'var(--ink)' }}
                value={text}
                onChange={function(e) { setText(e.target.value); }}
                onKeyDown={function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={asWheesht ? 'Wheesht says…' : 'Say something…'}
                maxLength={asWheesht ? 400 : 280}
              />
              <button
                onClick={send}
                disabled={!text.trim() || busy}
                style={{ background: asWheesht ? 'var(--yellow)' : 'var(--ink)', color: asWheesht ? 'var(--ink)' : '#fff', border: 'none', borderRadius: 22, padding: '10px 16px', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 14, cursor: text.trim() && !busy ? 'pointer' : 'default', opacity: text.trim() && !busy ? 1 : 0.35, flexShrink: 0, boxShadow: '0 4px 0 rgba(0,0,0,.35)' }}
              >
                Send
              </button>
            </div>
          )}
          {!me && !asWheesht && (
            <div style={{ padding: '10px 16px 12px', textAlign: 'center', fontSize: 13, color: asWheesht ? 'rgba(255,255,255,.5)' : 'var(--ink2)', fontWeight: 600 }}>
              Pick who you are to join the chat — or send as Wheesht above.
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, color: 'var(--ink2)', fontWeight: 600, borderTop: '1.5px solid var(--line)' }}>
          Pick who you are to join the chat.
        </div>
      )}
    </div>
  );
}

window.ChatScreen = ChatScreen;
