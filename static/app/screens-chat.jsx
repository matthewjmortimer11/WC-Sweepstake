/* ===========================================================================
   CHAT — simple group message wall. Live only (requires WC_LIVE / server).
   Polls every 15 s; messages are appended locally on send for instant feel.
   =========================================================================== */
const WCch = window.WC;
const Sch = window.Store;
const Wch = window.Wheesht;
const { useState: cState, useEffect: cEffect, useRef: cRef } = React;

function ChatScreen() {
  const me = Sch.active();
  const [msgs, setMsgs] = cState([]);
  const [text, setText] = cState('');
  const [busy, setBusy] = cState(false);
  const [err, setErr] = cState(false);
  const listRef = cRef(null);
  const isLive = !!window.WC_LIVE;

  function scrollBottom() {
    setTimeout(function() {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, 60);
  }

  function load() {
    fetch('/api/chat').then(function(r) { return r.json(); }).then(function(data) {
      setMsgs(data);
      setErr(false);
    }).catch(function() { setErr(true); });
  }

  cEffect(function() {
    if (!isLive) return;
    load();
    scrollBottom();
    var iv = setInterval(load, 15000);
    return function() { clearInterval(iv); };
  }, []);

  cEffect(function() { scrollBottom(); }, [msgs.length]);

  function send() {
    if (!text.trim() || !me || busy) return;
    setBusy(true);
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author_id: me.id, text: text.trim() }),
    }).then(function(r) { return r.json(); }).then(function(msg) {
      setMsgs(function(prev) { return prev.concat([msg]); });
      setText('');
      setBusy(false);
    }).catch(function() { setBusy(false); });
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 168px)' }}>

      {/* message list */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px' }}>
        {msgs.length === 0 && !err && (
          <div style={{ textAlign: 'center', padding: '44px 0', color: 'var(--ink2)', fontSize: 13.5, fontWeight: 600 }}>
            <Wch mood="waiting" size={64} animate />
            <div style={{ marginTop: 8 }}>Nothing yet. Wheesht is listening.</div>
          </div>
        )}
        {err && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink2)', fontSize: 13 }}>
            Couldn't load messages — tap to retry.
          </div>
        )}
        {msgs.map(function(msg) {
          var isMe = me && msg.author_id === me.id;
          var t = WCch.TEAMS[msg.team];
          var d = new Date(msg.ts);
          var timeStr = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
          return (
            <div key={msg.id} style={{ display: 'flex', gap: 9, marginBottom: 14, flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end' }}>
              {!isMe && (
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: msg.color || '#333', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 12, flexShrink: 0, boxShadow: '0 2px 0 rgba(0,0,0,.15)' }}>
                  {msg.initials || '?'}
                </div>
              )}
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
      {me ? (
        <div style={{ display: 'flex', gap: 9, padding: '9px 12px 12px', borderTop: '1.5px solid var(--line)', background: 'var(--bg)', flexShrink: 0 }}>
          <input
            style={{ flex: 1, border: '2.5px solid var(--ink)', borderRadius: 22, padding: '10px 14px', fontFamily: 'var(--body)', fontSize: 14, fontWeight: 500, background: '#fff', outline: 'none', color: 'var(--ink)' }}
            value={text}
            onChange={function(e) { setText(e.target.value); }}
            onKeyDown={function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Say something…"
            maxLength={280}
          />
          <button
            onClick={send}
            disabled={!text.trim() || busy}
            style={{ background: 'var(--ink)', color: '#fff', border: 'none', borderRadius: 22, padding: '10px 16px', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 14, cursor: text.trim() && !busy ? 'pointer' : 'default', opacity: text.trim() && !busy ? 1 : 0.35, flexShrink: 0, boxShadow: '0 4px 0 rgba(0,0,0,.35)' }}
          >
            Send
          </button>
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
