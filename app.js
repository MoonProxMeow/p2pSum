/* ============================================================
   NexTalk v5.1 — P2P E2EE Chat — BUG-FIX RELEASE
   Fixes:
   • Messaging silence: rehandshake now resets both send+recv
     counters atomically so replay-protection never falsely fires
   • File sharing: per-chunk send is now properly awaited in order
   • Friend requests: inboundQueue splice used index lookup by
     reference (always -1); replaced with filter-by-token
   • Voice isolation: now routes mic → Web Audio chain →
     MediaStreamDestination and replaceTrack()s every sender;
     restoring original mic track does the same in reverse
   • Settings: toggle-switch builder was broken; rebuilt cleanly
   • Protections (stripMetadata, randomIds, padding) are always
     on and are NOT exposed as toggleable settings
============================================================ */
"use strict";

/* ============================================================ SOURCE PROTECTION */
(function sourceProtection() {
  document.addEventListener("contextmenu", e => e.preventDefault());
  document.addEventListener("keydown", e => {
    const c = e.ctrlKey || e.metaKey;
    if (c && /^[suSU]$/.test(e.key)) { e.preventDefault(); return false; }
    if (e.key === "F12") { e.preventDefault(); return false; }
    if (c && e.shiftKey && /^[ijIJ]$/.test(e.key)) { e.preventDefault(); return false; }
    if (c && e.key === "p") { e.preventDefault(); return false; }
  });
  // Watermark canvas — flashes on PrintScreen / beforeprint
  (function () {
    const wm = document.createElement("div");
    wm.id = "wm-layer";
    wm.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:8500;overflow:hidden;opacity:0;transition:opacity .1s";
    const c = document.createElement("canvas"); c.width = 800; c.height = 600;
    const ctx = c.getContext("2d");
    ctx.save(); ctx.translate(400, 300); ctx.rotate(-0.4);
    ctx.font = "bold 38px sans-serif"; ctx.fillStyle = "rgba(0,0,0,0.88)"; ctx.textAlign = "center";
    ["NexTalk — CONFIDENTIAL", "UNAUTHORIZED REPRODUCTION", "PROHIBITED"].forEach((t, i) => ctx.fillText(t, 0, i * 52 - 52));
    ctx.restore();
    wm.appendChild(c); document.body.appendChild(wm);
    window.addEventListener("beforeprint", () => { wm.style.opacity = "1"; });
    window.addEventListener("afterprint",  () => { wm.style.opacity = "0"; });
    document.addEventListener("keyup", e => {
      if (e.key === "PrintScreen" || (e.metaKey && e.shiftKey && ["3","4","5"].includes(e.key))) {
        wm.style.opacity = "1"; setTimeout(() => { wm.style.opacity = "0"; }, 3000);
      }
    });
  })();
  const footer = document.createElement("div");
  footer.style.cssText = "position:fixed;bottom:4px;right:8px;font-size:9px;opacity:.06;pointer-events:none;z-index:9999;font-family:monospace;user-select:none";
  footer.textContent = "© NexTalk P2P 2025";
  document.body.appendChild(footer);
})();

/* ============================================================ CONSTANTS */
const CHUNK_SIZE = 12000;
const EMOJI_CATEGORIES = {
  "Smileys":["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😊","😇","🥰","😍","🤩","😘","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","😐","😑","😏","😒","🙄","😬","😌","😔","😪","😴","😷","🤒","🤕","🤢","🤮","🥵","🥶","😵","🤯","🤠","🥳","😎","🤓","🧐","😕","😟","🙁","☹️","😮","😲","😳","🥺","😦","😧","😨","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖"],
  "People":["👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","💅","🤳","💪","🦾","🦵","🦶","👂","🦻","👃","🧠","👀","👁️","👅","👄"],
  "Nature":["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐜","🌸","🌺","🌻","🌹","🌷","🌱","🌿","🍀","🌵","🌴","🌲","🍁","🍂","🍃","🌾","🍄","🌊","🌈","☀️","🌙","⭐","❄️"],
  "Food":["🍎","🍊","🍋","🍇","🍓","🍒","🍑","🥭","🍍","🥝","🍅","🥑","🍆","🥦","🌽","🥕","🧀","🥚","🍳","🥞","🍗","🍔","🍟","🍕","🍜","🍣","🍱","🧁","🎂","🍰","🍩","🍪","🍫","🍬","🍭","☕","🍺","🥂","🍷","🧃","🥤","🧋"],
  "Objects":["💎","🔮","💡","🔦","📱","💻","🖥️","📷","📸","📹","🎥","📞","☎️","📺","📻","🎙️","⏱️","⌚","🔋","🔌","💰","💳","🔑","🗝️","🔒","🔓","🔨","⚔️","🛡️","🔧","🔩","⚙️","🔬","🔭","📊","📈","📉"],
  "Symbols":["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","✨","⚡","🔥","💫","🌟","💥","🎉","🎊","🎈","🎁","🏆","🥇","🎯","🎮","🕹️","🎲","♠️","♥️","♦️","♣️","🎤","🎧","🎸","🎹","🥁","🎵","🎶"]
};

/* ============================================================ SETTINGS MANAGER
   NOTE: Privacy protections (metadata stripping, padding, random IDs)
   are always ON and cannot be disabled from settings. Only UX/call
   preferences are exposed as toggles.
============================================================ */
const settingsManager = (() => {
  const KEY = "nextalk_settings";
  const _defaults = {
    // Privacy — always on, not exposed in settings UI
    _stripImageMetadata: true,
    _randomFileIds:      true,
    _paddedEncryption:   true,
    // Reconnect
    rehandshakeMinutes: 10,
    // Call
    adaptiveBitrate: true,
    voiceIsolation:  false,
    pushToTalk:      false,
    pttKey:          " ",
    // UI
    inlineMediaDefault: true,
    showReactions:      true
  };
  let _s = { ..._defaults };
  function load()   { try { const r = localStorage.getItem(KEY); if (r) _s = { ..._defaults, ...JSON.parse(r) }; } catch {} return _s; }
  function save()   { localStorage.setItem(KEY, JSON.stringify(_s)); }
  function get(k)   { return _s[k]; }
  function set(k,v) { _s[k] = v; save(); }
  function clearAll(){ localStorage.removeItem(KEY); _s = { ..._defaults }; }
  return { load, get, set, clearAll };
})();

/* ============================================================ ACCOUNT MANAGER */
const accountManager = (() => {
  const KEY         = "nextalk_account";
  const EMOJI_KEY   = "nextalk_custom_emojis";
  const FRIENDS_KEY = "nextalk_friends";
  let _acc = null;

  function _def() {
    return { username:"Anonymous", avatar:null, preferences:{}, customEmojis:{}, friendKey:_genKey() };
  }
  function _genKey() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2,"0")).join("").toUpperCase();
  }
  function load() {
    try {
      const r = localStorage.getItem(KEY);
      if (r) { const p = JSON.parse(r); delete p.peerId; _acc = { ..._def(), ...p }; }
      else _acc = _def();
    } catch { _acc = _def(); }
    if (!_acc.friendKey) _acc.friendKey = _genKey();
    return _acc;
  }
  function save(u = {}) { delete u.peerId; Object.assign(_acc, u); localStorage.setItem(KEY, JSON.stringify(_acc)); }
  function get() { return _acc || load(); }

  function exportJSON() {
    const d = { ..._acc }; delete d.peerId;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], {type:"application/json"}));
    a.download = "nextalk-account.json"; a.click(); URL.revokeObjectURL(a.href);
  }
  function importJSON(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => {
        try {
          const p = JSON.parse(e.target.result); delete p.peerId;
          _acc = { ..._def(), ...p };
          localStorage.setItem(KEY, JSON.stringify(_acc));
          if (p.customEmojis) localStorage.setItem(EMOJI_KEY, JSON.stringify(p.customEmojis));
          res(_acc);
        } catch { rej(new Error("Invalid account file")); }
      };
      r.readAsText(file);
    });
  }
  function burnAccount() {
    localStorage.removeItem(KEY); localStorage.removeItem(EMOJI_KEY); localStorage.removeItem(FRIENDS_KEY);
    settingsManager.clearAll(); _acc = _def(); localStorage.setItem(KEY, JSON.stringify(_acc));
  }
  function refreshFriendKey() { _acc.friendKey = _genKey(); save(); return _acc.friendKey; }

  // Friends stored as [{friendKey, name, addedAt, lastPeerId?}]
  function getFriends()   { try { return JSON.parse(localStorage.getItem(FRIENDS_KEY)||"[]"); } catch { return []; } }
  function saveFriends(f) { localStorage.setItem(FRIENDS_KEY, JSON.stringify(f)); }
  function addFriend(friendKey, name) {
    const f = getFriends();
    if (!friendKey || f.find(x => x.friendKey === friendKey)) return false;
    f.push({ friendKey, name: name||"Friend", addedAt: Date.now(), lastPeerId: null });
    saveFriends(f); return true;
  }
  function removeFriend(friendKey) { saveFriends(getFriends().filter(f => f.friendKey !== friendKey)); }
  function updateFriendPeerId(friendKey, peerId) {
    const f = getFriends();
    const entry = f.find(x => x.friendKey === friendKey);
    if (entry) {
      entry.lastPeerId = peerId;
      const profile = peerManager.getProfile(peerId);
      if (profile && profile.username) entry.name = profile.username;
      saveFriends(f);
    }
  }
  function isFriend(friendKey) { return getFriends().some(f => f.friendKey === friendKey); }
  function saveCustomEmojis(e) { _acc.customEmojis = e; save({customEmojis:e}); }
  function getCustomEmojis()   {
    try { return _acc?.customEmojis || JSON.parse(localStorage.getItem(EMOJI_KEY)||"{}"); } catch { return {}; }
  }
  return { load, save, get, exportJSON, importJSON, burnAccount, refreshFriendKey,
           getFriends, addFriend, removeFriend, updateFriendPeerId, isFriend, saveFriends,
           saveCustomEmojis, getCustomEmojis };
})();

/* ============================================================ ENCRYPTION MANAGER
   Key design:
   • ECDH P-256 for initial key agreement (Diffie-Hellman)
   • ECDSA P-256 for message signing (authenticity/integrity)
   • Per-message forward-secret ratchet via HKDF
   • Counter-based replay protection
   • 256-byte payload padding (always on)
   • Periodic rehandshake (default 10 min, configurable)

   FIX: setSession() resets BOTH send counter and recv lastCounter
   to -1/0 so a rehandshake never triggers false replay errors.
============================================================ */
const encryptionManager = (() => {
  let _dhKP = null, _sigKP = null;
  const _send = {}, _recv = {}, _sigKeys = {}, _rhTimers = {};

  async function init() {
    [_dhKP, _sigKP] = await Promise.all([
      crypto.subtle.generateKey({name:"ECDH",  namedCurve:"P-256"}, true, ["deriveKey"]),
      crypto.subtle.generateKey({name:"ECDSA", namedCurve:"P-256"}, true, ["sign","verify"])
    ]);
  }

  async function getHandshakeBytes() {
    const [dh, sig] = await Promise.all([
      crypto.subtle.exportKey("raw", _dhKP.publicKey),
      crypto.subtle.exportKey("raw", _sigKP.publicKey)
    ]);
    return { dh: Array.from(new Uint8Array(dh)), sig: Array.from(new Uint8Array(sig)) };
  }

  async function _rootKey(bytes) {
    const rk = await crypto.subtle.importKey("raw", new Uint8Array(bytes), {name:"ECDH",namedCurve:"P-256"}, false, []);
    return crypto.subtle.deriveKey({name:"ECDH",public:rk}, _dhKP.privateKey, {name:"AES-GCM",length:256}, true, ["encrypt","decrypt"]);
  }

  async function _ratchet(key) {
    const raw  = await crypto.subtle.exportKey("raw", key);
    const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      {name:"HKDF", hash:"SHA-256", salt:new Uint8Array(32), info:new TextEncoder().encode("NexTalk-ratchet-v1")},
      base, {name:"AES-GCM",length:256}, true, ["encrypt","decrypt"]
    );
  }

  // FIX: reset both counters to clean state on every (re)handshake
  async function setSession(pid, dhBytes, sigBytes) {
    // Derive independent send/recv keys from the shared ECDH root
    const root = await _rootKey(dhBytes);

    // Send chain
    _send[pid] = { key: root, counter: 0 };

    // Recv chain (different HKDF info string → different key stream)
    const raw  = await crypto.subtle.exportKey("raw", root);
    const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
    const rk   = await crypto.subtle.deriveKey(
      {name:"HKDF", hash:"SHA-256", salt:new Uint8Array(32), info:new TextEncoder().encode("NexTalk-recv-v1")},
      base, {name:"AES-GCM",length:256}, true, ["encrypt","decrypt"]
    );
    // Always reset lastCounter to -1 so a rehandshake never causes replay errors
    _recv[pid]    = { key: rk, lastCounter: -1 };
    _sigKeys[pid] = await crypto.subtle.importKey("raw", new Uint8Array(sigBytes), {name:"ECDSA",namedCurve:"P-256"}, false, ["verify"]);

    _scheduleRH(pid);
  }

  function _scheduleRH(pid) {
    clearTimeout(_rhTimers[pid]);
    const mins = settingsManager.get("rehandshakeMinutes") || 10;
    if (!mins) return;
    _rhTimers[pid] = setTimeout(() => peerManager._rehandshake(pid), mins * 60 * 1000);
  }

  function hasSession(pid)    { return !!(_send[pid] && _recv[pid]); }
  function removeSession(pid) {
    delete _send[pid]; delete _recv[pid]; delete _sigKeys[pid];
    clearTimeout(_rhTimers[pid]); delete _rhTimers[pid];
  }

  // Padding — always on (privacy protection, not a toggle)
  function _pad(bytes) {
    const block = 256;
    const total = Math.ceil((bytes.length + 2) / block) * block;
    const out   = new Uint8Array(total);
    out[0] = (bytes.length >> 8) & 0xff; out[1] = bytes.length & 0xff;
    out.set(bytes, 2); return out;
  }
  function _unpad(bytes) {
    if (bytes.length < 2) return bytes;
    return bytes.slice(2, 2 + ((bytes[0] << 8) | bytes[1]));
  }

  async function encrypt(pid, obj) {
    const st = _send[pid]; if (!st) throw new Error("No send state: " + pid);
    // Ratchet forward BEFORE encrypting → each message has a unique key
    st.key = await _ratchet(st.key);
    const counter = st.counter++;
    const iv      = crypto.getRandomValues(new Uint8Array(12));
    const plain   = _pad(new TextEncoder().encode(JSON.stringify(obj)));
    const enc     = await crypto.subtle.encrypt({name:"AES-GCM", iv}, st.key, plain);
    const cb      = new Uint8Array(enc);

    // Sign: counter (8 bytes LE) || iv || ciphertext
    const sigIn = new Uint8Array(8 + 12 + cb.length);
    const dv    = new DataView(sigIn.buffer);
    dv.setUint32(0, 0); dv.setUint32(4, counter);
    sigIn.set(iv, 8); sigIn.set(cb, 20);
    const sigBuf = await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"}, _sigKP.privateKey, sigIn);

    return {
      iv:      btoa(String.fromCharCode(...iv)),
      data:    btoa(String.fromCharCode(...cb)),
      sig:     btoa(String.fromCharCode(...new Uint8Array(sigBuf))),
      counter
    };
  }

  async function decrypt(pid, payload) {
    const st = _recv[pid], sk = _sigKeys[pid];
    if (!st || !sk) throw new Error("No recv state: " + pid);
    const { iv:ivB64, data:dB64, sig:sB64, counter } = payload;
    if (typeof counter !== "number" || counter <= st.lastCounter)
      throw new Error("Replay: " + counter + " <= " + st.lastCounter);

    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
    const cb = Uint8Array.from(atob(dB64),  c => c.charCodeAt(0));
    const sb = Uint8Array.from(atob(sB64),  c => c.charCodeAt(0));

    const sigIn = new Uint8Array(8 + 12 + cb.length);
    const dv    = new DataView(sigIn.buffer);
    dv.setUint32(0, 0); dv.setUint32(4, counter);
    sigIn.set(iv, 8); sigIn.set(cb, 20);

    if (!await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"}, sk, sb, sigIn))
      throw new Error("Bad signature");

    const gap = counter - st.lastCounter - 1;
    if (gap > 50) throw new Error("Counter gap too large");
    // Fast-forward the ratchet to match sender position
    for (let i = 0; i <= gap; i++) st.key = await _ratchet(st.key);
    st.lastCounter = counter;

    const dec = await crypto.subtle.decrypt({name:"AES-GCM", iv}, st.key, cb);
    return JSON.parse(new TextDecoder().decode(_unpad(new Uint8Array(dec))));
  }

  return { init, getHandshakeBytes, setSession, hasSession, removeSession, encrypt, decrypt };
})();

/* ============================================================ IMAGE PROCESSOR
   Metadata stripping is always applied — not a user toggle.
============================================================ */
const imageProcessor = (() => {
  function stripMetadata(file) {
    return new Promise(resolve => {
      if (!file.type.startsWith("image/")) { resolve(file); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        c.toBlob(blob => resolve(new File([blob], file.name, {type:"image/jpeg",lastModified:Date.now()})), "image/jpeg", 0.92);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  return { stripMetadata };
})();

/* ============================================================ FILE PERMISSION MANAGER */
const filePermissionManager = (() => {
  const _pending = {};
  function _e(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  function handleRequest(fromPeer, {tokenId, fileName}) {
    const name = peerManager.getProfile(fromPeer).username || fromPeer.slice(0,8);
    const ov = document.createElement("div"); ov.className = "perm-dialog-overlay";
    ov.innerHTML = `<div class="perm-dialog"><div class="perm-icon">📥</div>
      <div class="perm-title">Download Request</div>
      <div class="perm-msg"><strong>${_e(name)}</strong> wants to download <em>${_e(fileName)}</em></div>
      <div class="perm-btns">
        <button class="btn btn-primary btn-sm pa">Allow</button>
        <button class="btn pd" style="background:var(--accent-red);color:#fff">Deny</button>
      </div></div>`;
    document.body.appendChild(ov);
    ov.querySelector(".pa").onclick = () => { ov.remove(); peerManager.sendTo(fromPeer, {type:"download-response", tokenId, approved:true}); };
    ov.querySelector(".pd").onclick = () => { ov.remove(); peerManager.sendTo(fromPeer, {type:"download-response", tokenId, approved:false}); };
  }
  function handleResponse({tokenId, approved}) {
    const p = _pending[tokenId]; if (!p) return;
    delete _pending[tokenId];
    if (!approved) uiController.toast("Download denied.");
    p.resolve(approved);
  }
  function requestPermission(pid, blob, name) {
    return new Promise(res => {
      const tokenId = crypto.randomUUID(); _pending[tokenId] = { resolve: res };
      peerManager.sendTo(pid, {type:"download-request", tokenId, fileName:name});
      setTimeout(() => { if (_pending[tokenId]) { delete _pending[tokenId]; res(false); uiController.toast("Request timed out."); } }, 30000);
    });
  }
  function executeDownload(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  return { handleRequest, handleResponse, requestPermission, executeDownload };
})();

/* ============================================================ PEER MANAGER + MESH */
const peerManager = (() => {
  let _peer = null, _myId = null;
  const _conns = {}, _profiles = {}, _pending = new Set();

  function init() {
    _peer = new Peer();
    _peer.on("open", async id => {
      _myId = id;
      uiController.setMyId(id);
      await encryptionManager.init();
      uiController.initAvatarDisplay();
      friendsManager.init();
      // Scan peers already connected (shouldn't happen at open, but belt-and-suspenders)
      friendsManager.reconcileConnectedPeers();
      _reconnectFriends();
    });
    _peer.on("connection", conn => _setup(conn));
    _peer.on("call",       call => callManager.handleIncomingCall(call));
    _peer.on("error",      e    => console.error("Peer:", e));
  }

  function _reconnectFriends() {
    const myId = _myId;
    accountManager.getFriends().forEach(f => {
      if (!f.lastPeerId || f.lastPeerId === myId) return;
      // Attempt connection; if the peer is offline this will fail silently via _teardown
      connectTo(f.lastPeerId);
    });
  }

  function getId()          { return _myId; }
  function getPeer()        { return _peer; }
  function getConnections() { return _conns; }
  function getProfile(pid)  { return _profiles[pid] || { username: pid?.slice(0,8)||"?", avatar:null, friendKey:null }; }

  function setProfile(pid, p) {
    _profiles[pid] = p;
    uiController.updatePeerList(_conns, _profiles);
    dmManager.onPeerProfileUpdate(pid, p);
    friendsManager.onPeerConnected(pid, p);
  }

  function connectTo(pid) {
    if (!pid || pid === _myId) return;
    if (_conns[pid] || _pending.has(pid)) return;
    _pending.add(pid);
    _setup(_peer.connect(pid, {reliable:true}));
  }

  function _setup(conn) {
    if (_conns[conn.peer]) { conn.close(); return; }
    _conns[conn.peer] = conn;
    uiController.updatePeerList(_conns, _profiles);
    conn.on("open", async () => {
      _pending.delete(conn.peer);
      const hs = await encryptionManager.getHandshakeBytes();
      conn.send({type:"ecdh-hello", dh:hs.dh, sig:hs.sig});
    });
    conn.on("data",  async raw => { try { await _handleRaw(conn, raw); } catch (e) { console.warn("Data:", e.message); } });
    conn.on("close", ()        => _teardown(conn.peer));
    conn.on("error", e         => { console.error("Conn:", e); _teardown(conn.peer); });
  }

  async function _handleRaw(conn, raw) {
    const pid = conn.peer;

    if (raw.type === "ecdh-hello") {
      await encryptionManager.setSession(pid, raw.dh, raw.sig);
      if (!raw._reply) {
        const hs = await encryptionManager.getHandshakeBytes();
        conn.send({type:"ecdh-hello", dh:hs.dh, sig:hs.sig, _reply:true});
      }
      const acc = accountManager.get();
      await _enc(conn, {type:"profile", user:acc.username, avatar:acc.avatar, friendKey:acc.friendKey});
      const known = Object.keys(_conns).filter(p => p !== pid);
      if (known.length) await _enc(conn, {type:"mesh-peers", peers:known});
      if (callManager.isInCall()) setTimeout(() => callManager.callPeer(pid), 400);
      return;
    }

    if (raw.type === "ecdh-rehandshake") {
      // Re-establish session — this resets both counters atomically
      await encryptionManager.setSession(pid, raw.dh, raw.sig);
      const hs = await encryptionManager.getHandshakeBytes();
      conn.send({type:"ecdh-hello", dh:hs.dh, sig:hs.sig, _reply:true});
      return;
    }

    if (raw.encrypted) {
      if (!encryptionManager.hasSession(pid)) return;
      try {
        _dispatch(conn, await encryptionManager.decrypt(pid, raw.payload));
      } catch (e) {
        console.warn("Decrypt failed:", e.message);
      }
      return;
    }

    _dispatch(conn, raw);
  }

  async function _rehandshake(pid) {
    const conn = _conns[pid]; if (!conn || !conn.open) return;
    const hs = await encryptionManager.getHandshakeBytes();
    conn.send({type:"ecdh-rehandshake", dh:hs.dh, sig:hs.sig});
  }

  function _dispatch(conn, data) {
    const pid = conn.peer;
    switch (data.type) {
      case "profile":
        setProfile(pid, {username:data.user||"Peer", avatar:data.avatar||null, friendKey:data.friendKey||null});
        break;
      case "mesh-peers":
        if (Array.isArray(data.peers)) data.peers.forEach(id => connectTo(id));
        break;
      case "message": {

        // ignore non-general packets
        if (data.channel && data.channel !== "general") break;

        // prevent duplicate renders
        if (!window.__seenGeneralMsgs)
          window.__seenGeneralMsgs = new Set();

        if (data.msgId && window.__seenGeneralMsgs.has(data.msgId))
          break;

        if (data.msgId)
          window.__seenGeneralMsgs.add(data.msgId);

        uiController.appendMessage({
          user: data.user,
          text: data.text,
          avatar: _profiles[pid]?.avatar || null,
          isSelf: false,
          msgId: data.msgId,
          ts: data.ts || Date.now()
        });

        // unread indicator when viewing DMs
        if (dmManager.getActivePid()) {
          const navMain = document.getElementById("nav-main");
          navMain?.classList.add("has-unread");
        }

        break;
      }
      case "message-edit":
        uiController.editMessage(data.msgId, data.newText);
        break;
      case "reaction":
        uiController.handleReaction(data);
        break;
      case "dm":
        dmManager.receiveMessage(pid, data);
        break;
      case "dm-image":
        dmManager.receiveImage(pid, data);
        break;
      case "file-meta":
        fileTransferManager.receiveMeta(pid, data);
        break;
      case "file-chunk":
        fileTransferManager.receiveChunk(data);
        break;
      case "file-end":
        fileTransferManager.receiveEnd(data, pid);
        break;
      case "call-state":
        callManager.handlePeerState(pid, data);
        break;
      case "download-request":
        filePermissionManager.handleRequest(pid, data);
        break;
      case "download-response":
        filePermissionManager.handleResponse(data);
        break;
      case "friend-request":
        friendsManager.handleIncomingRequest(pid, data);
        break;
      case "friend-accept":
        friendsManager.handleAccepted(pid, data);
        break;
      case "friend-decline":
        friendsManager.handleDeclined(pid, data);
        break;
    }
  }

  function _teardown(pid) {
    const hadSession = encryptionManager.hasSession(pid);
    delete _conns[pid]; _pending.delete(pid);
    encryptionManager.removeSession(pid);
    uiController.updatePeerList(_conns, _profiles);
    // Only announce departure if an encrypted session was actually established
    if (hadSession) uiController.appendSystemMessage("A peer left the mesh");
    callManager.removePeerCall(pid);
    friendsManager.onPeerDisconnected(pid);
  }

  async function _enc(conn, obj) {
    if (!conn.open || !encryptionManager.hasSession(conn.peer)) return;
    const payload = await encryptionManager.encrypt(conn.peer, obj);
    conn.send({encrypted:true, payload});
  }

  async function broadcast(obj, exclude = null) {
    for (const [pid, conn] of Object.entries(_conns)) {
      if (pid !== exclude && conn.open && encryptionManager.hasSession(pid))
        await _enc(conn, obj);
    }
  }
  async function sendTo(pid, obj) { const c = _conns[pid]; if (c) await _enc(c, obj); }

  function emergencyDisconnect() {
    Object.values(_conns).forEach(c => { try { c.close(); } catch {} });
    Object.keys(_conns).forEach(k => delete _conns[k]);
    try { _peer.destroy(); } catch {}
    _peer = null; _myId = null;
    callManager.leaveCall();
    uiController.updatePeerList({}, {});
    uiController.toast("🚨 Emergency disconnect");
    uiController.setMyId("DISCONNECTED");
  }

  return { init, getId, getPeer, getConnections, getProfile, setProfile, connectTo,
           broadcast, sendTo, emergencyDisconnect, _rehandshake };
})();

/* ============================================================ CALL MANAGER
   Voice isolation FIX:
   • Create AudioContext + source + HP/LP filters + MediaStreamDestination
   • Replace the audio sender track in every active RTCPeerConnection
   • Store original mic track separately so we can swap back cleanly
   • Do NOT mutate _ls tracks — keep _ls unchanged for WebRTC bookkeeping;
     only the RTP sender track is swapped
============================================================ */
const callManager = (() => {
  const _calls = {};
  let _ls = null, _inCall = false, _camOn = false, _muted = false,
      _deafened = false, _screen = false, _fsEl = null;
  let _audioCtx = null, _filteredTrack = null, _origMicTrack = null;
  let _pttActive = false, _pttDown = null, _pttUp = null;

  function isInCall()       { return _inCall; }
  function getLocalStream() { return _ls; }

  async function startCall() {
    if (_inCall) return;
    try {
      _ls = await navigator.mediaDevices.getUserMedia({
        audio:{noiseSuppression:true, echoCancellation:true, autoGainControl:true}, video:true
      });
    } catch {
      try { _ls = await navigator.mediaDevices.getUserMedia({audio:true, video:false}); }
      catch { uiController.toast("Mic denied."); return; }
    }
    _camOn = false; _muted = false; _deafened = false;
    _ls.getVideoTracks().forEach(t => { t.enabled = false; });

    // Apply voice isolation if already enabled in settings
    if (settingsManager.get("voiceIsolation")) await _applyVoiceIsolation(true);

    _inCall = true;
    uiController.updateCallUI(true, false, false, false, false);
    _addVideoEl("local", _ls, true);
    Object.keys(peerManager.getConnections()).forEach(pid => callPeer(pid));
    setTimeout(() => peerManager.broadcast({type:"call-state",inCall:true,cameraOn:false,muted:false,screenShare:false}), 100);
    _setupPTT();
    uiController.toast("Joined voice.");
  }

  /* Voice isolation: route mic audio through a bandpass chain,
     deliver filtered output to peers via replaceTrack.
     The _ls stream itself is NOT mutated. */
  async function _applyVoiceIsolation(enable) {
    if (!_ls) return;
    try {
      if (enable && !_audioCtx) {
        _audioCtx = new AudioContext();
        // Keep original mic track reference
        _origMicTrack = _ls.getAudioTracks()[0] || null;

        const src  = _audioCtx.createMediaStreamSource(_ls);
        // High-pass to cut rumble below 80 Hz
        const hp   = _audioCtx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 80; hp.Q.value = 0.7;
        // Low-pass to cut hiss above 8 kHz
        const lp   = _audioCtx.createBiquadFilter(); lp.type = "lowpass";  lp.frequency.value = 8000; lp.Q.value = 0.7;
        // Compressor to keep speech level consistent
        const comp = _audioCtx.createDynamicsCompressor();
        comp.threshold.value = -24; comp.knee.value = 10;
        comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.1;
        const dest = _audioCtx.createMediaStreamDestination();
        src.connect(hp); hp.connect(lp); lp.connect(comp); comp.connect(dest);
        _filteredTrack = dest.stream.getAudioTracks()[0];

        if (_filteredTrack) {
          // Replace audio track in every active peer sender
          _replaceAudioInCalls(_filteredTrack);
        }
      } else if (!enable && _audioCtx) {
        // Restore original mic track to all senders
        if (_origMicTrack) _replaceAudioInCalls(_origMicTrack);
        _audioCtx.close(); _audioCtx = null; _filteredTrack = null; _origMicTrack = null;
      }
    } catch (e) { console.warn("Voice isolation:", e); }
  }

  function _replaceAudioInCalls(newTrack) {
    Object.values(_calls).forEach(call => {
      const pc = call.peerConnection; if (!pc) return;
      const s = pc.getSenders().find(s => s.track?.kind === "audio");
      if (s) s.replaceTrack(newTrack).catch(() => {});
    });
  }

  function _teardownPTT() {
    if (_pttDown) { document.removeEventListener("keydown", _pttDown); _pttDown = null; }
    if (_pttUp)   { document.removeEventListener("keyup",   _pttUp);   _pttUp   = null; }
  }
  function _setupPTT() {
    _teardownPTT();
    if (!settingsManager.get("pushToTalk")) return;
    const key = settingsManager.get("pttKey") || " ";
    _pttDown = e => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === key && _inCall && _ls) {
        if (_pttActive) return; _pttActive = true;
        _ls.getAudioTracks().forEach(t => t.enabled = true);
        document.getElementById("ptt-indicator")?.classList.remove("hidden");
        document.getElementById("ptt-btn")?.classList.add("ptt-active");
        if (key === " ") e.preventDefault();
      }
    };
    _pttUp = e => {
      if (e.key === key && _pttActive) {
        _pttActive = false;
        if (!_inCall || _muted || _deafened) _ls?.getAudioTracks().forEach(t => t.enabled = false);
        document.getElementById("ptt-indicator")?.classList.add("hidden");
        document.getElementById("ptt-btn")?.classList.remove("ptt-active");
      }
    };
    document.addEventListener("keydown", _pttDown);
    document.addEventListener("keyup",   _pttUp);
  }
  function refreshPTT()      { if (_inCall) _setupPTT(); }
  function refreshMuteState(){ if (_ls) _ls.getAudioTracks().forEach(t => { t.enabled = !_muted && !_deafened; }); }

  function callPeer(pid) {
    if (_calls[pid] || !_ls) return;
    const p = peerManager.getPeer(); if (!p) return;
    const call = p.call(pid, _ls); if (!call) return;
    _setupCall(call);
    if (settingsManager.get("adaptiveBitrate")) setTimeout(() => _applyABR(call), 1500);
    // If voice isolation is active, replace audio track in new call too
    if (_audioCtx && _filteredTrack) {
      setTimeout(() => {
        const pc = call.peerConnection; if (!pc) return;
        const s = pc.getSenders().find(s => s.track?.kind === "audio");
        if (s) s.replaceTrack(_filteredTrack).catch(() => {});
      }, 800);
    }
  }
  function _applyABR(call) {
    try {
      const pc = call.peerConnection; if (!pc) return;
      pc.getSenders().forEach(async s => {
        if (s.track?.kind !== "video") return;
        const p = s.getParameters();
        if (!p.encodings?.length) return;
        p.encodings[0].maxBitrate = 800000; p.encodings[0].scaleResolutionDownBy = 1.0;
        await s.setParameters(p).catch(() => {});
      });
    } catch {}
  }
  function handleIncomingCall(call) {
    if (_calls[call.peer]) { try { _calls[call.peer].close(); } catch {} }
    call.answer(_ls || new MediaStream());
    _setupCall(call);
    if (!_inCall && _ls) { _inCall = true; uiController.updateCallUI(true, _camOn, _muted, _deafened, _screen); }
  }
  function _setupCall(call) {
    _calls[call.peer] = call;
    call.on("stream", stream => _addVideoEl(call.peer, stream, false));
    call.on("close",  ()     => _removeVideoEl(call.peer));
    call.on("error",  e      => { console.error("Call:", e); _removeVideoEl(call.peer); });
  }
  function removePeerCall(pid) {
    if (_calls[pid]) { try { _calls[pid].close(); } catch {}; delete _calls[pid]; }
    _removeVideoEl(pid);
  }
  function leaveCall() {
    if (_ls) { _ls.getTracks().forEach(t => t.stop()); _ls = null; }
    Object.values(_calls).forEach(c => { try { c.close(); } catch {} });
    Object.keys(_calls).forEach(k => delete _calls[k]);
    const vg = document.getElementById("video-grid");
    Array.from(vg.children).forEach(el => el.remove()); vg.classList.add("hidden");
    if (_fsEl) { _fsEl.remove(); _fsEl = null; }
    if (_audioCtx) { _audioCtx.close(); _audioCtx = null; _filteredTrack = null; _origMicTrack = null; }
    _teardownPTT(); _pttActive = false;
    document.getElementById("ptt-indicator")?.classList.add("hidden");
    document.getElementById("ptt-btn")?.classList.remove("ptt-active");
    _inCall = false; _camOn = false; _muted = false; _deafened = false; _screen = false;
    uiController.updateCallUI(false, false, false, false, false);
    peerManager.broadcast({type:"call-state",inCall:false,cameraOn:false,muted:false,screenShare:false});
    uiController.toast("Left voice.");
  }

  function toggleCamera() {
    if (!_inCall || !_ls) return; _camOn = !_camOn;
    _ls.getVideoTracks().forEach(t => { t.enabled = _camOn; });
    uiController.updateCallUI(_inCall, _camOn, _muted, _deafened, _screen);
    peerManager.broadcast({type:"call-state",inCall:_inCall,cameraOn:_camOn,muted:_muted,screenShare:_screen});
  }
  function toggleMute() {
    if (!_inCall || !_ls) return; _muted = !_muted;
    if (_deafened && !_muted) _deafened = false;
    _ls.getAudioTracks().forEach(t => { t.enabled = !_muted && !_deafened; });
    uiController.updateCallUI(_inCall, _camOn, _muted, _deafened, _screen);
    peerManager.broadcast({type:"call-state",inCall:_inCall,cameraOn:_camOn,muted:_muted,screenShare:_screen});
  }
  function toggleDeafen() {
    if (!_inCall || !_ls) return; _deafened = !_deafened;
    if (_deafened) _muted = true;
    _ls.getAudioTracks().forEach(t => { t.enabled = !_deafened && !_muted; });
    document.querySelectorAll(".video-grid video:not(.local-vid)").forEach(v => { v.muted = _deafened; });
    uiController.updateCallUI(_inCall, _camOn, _muted, _deafened, _screen);
    peerManager.broadcast({type:"call-state",inCall:_inCall,cameraOn:_camOn,muted:_muted,screenShare:_screen});
  }
  async function toggleNoise() {
    if (!_inCall || !_ls) return;
    const nv = !settingsManager.get("voiceIsolation"); settingsManager.set("voiceIsolation", nv);
    await _applyVoiceIsolation(nv);
    uiController.updateCallUI(_inCall, _camOn, _muted, _deafened, _screen);
    uiController.toast(nv ? "🎛 Voice isolation ON" : "🎛 Voice isolation OFF");
  }
  async function toggleScreen() {
    if (!_inCall || !_ls) return;
    if (!_screen) {
      try {
        const ss = await navigator.mediaDevices.getDisplayMedia({video:true, audio:false});
        mediaProtectionManager.onScreenShareStart();
        const st = ss.getVideoTracks()[0];
        _replaceVideoTrackInStream(_ls, st); _replaceVideoInCalls(st); _addVideoEl("local", _ls, true);
        st.onended = () => stopScreen(); _screen = true;
        uiController.updateCallUI(_inCall, _camOn, _muted, _deafened, _screen);
        peerManager.broadcast({type:"call-state",inCall:_inCall,cameraOn:_camOn,muted:_muted,screenShare:_screen});
      } catch { uiController.toast("Screen share cancelled."); }
    } else await stopScreen();
  }
  async function stopScreen() {
    if (!_screen) return; _screen = false; mediaProtectionManager.onScreenShareEnd();
    _ls.getVideoTracks().forEach(t => t.stop());
    let ct = null;
    try { const s = await navigator.mediaDevices.getUserMedia({video:true, audio:false}); ct = s.getVideoTracks()[0]; if (ct) ct.enabled = _camOn; } catch {}
    _replaceVideoTrackInStream(_ls, ct); if (ct) _replaceVideoInCalls(ct); _addVideoEl("local", _ls, true);
    uiController.updateCallUI(_inCall, _camOn, _muted, _deafened, _screen);
    peerManager.broadcast({type:"call-state",inCall:_inCall,cameraOn:_camOn,muted:_muted,screenShare:_screen});
  }
  function _replaceVideoTrackInStream(stream, newTrack) { stream.getVideoTracks().forEach(t => stream.removeTrack(t)); if (newTrack) stream.addTrack(newTrack); }
  function _replaceVideoInCalls(newTrack) {
    Object.values(_calls).forEach(call => {
      const pc = call.peerConnection; if (!pc) return;
      const s = pc.getSenders().find(s => s.track?.kind === "video");
      if (s) s.replaceTrack(newTrack).catch(() => {}); else if (newTrack) pc.addTrack(newTrack, _ls);
    });
  }
  function handlePeerState(pid, data) {
    const el = document.getElementById("vwrap-" + pid); if (!el) return;
    const lbl = el.querySelector(".video-label"); if (!lbl) return;
    const p = peerManager.getProfile(pid);
    lbl.textContent = (p?.username || pid.slice(0,8)) + (data.muted ? " 🔇" : "") + (data.cameraOn ? "" : "📷✕");
  }
  function _addVideoEl(id, stream, isLocal) {
    const vg = document.getElementById("video-grid");
    let wrap = document.getElementById("vwrap-" + id);
    if (wrap) { const v = wrap.querySelector("video"); if (v && v.srcObject !== stream) v.srcObject = stream; return; }
    wrap = document.createElement("div"); wrap.id = "vwrap-" + id; wrap.className = "video-wrap" + (isLocal ? " local-wrap" : "");
    const v = document.createElement("video"); v.srcObject = stream; v.autoplay = true; v.playsInline = true; v.muted = !!isLocal;
    if (isLocal) v.classList.add("local-vid");
    const lbl = document.createElement("div"); lbl.className = "video-label";
    lbl.textContent = isLocal ? "You" : (peerManager.getProfile(id)?.username || id.slice(0,8));
    const fsBtn = document.createElement("button"); fsBtn.className = "fs-btn"; fsBtn.textContent = "⛶ FS";
    fsBtn.onclick = e => { e.stopPropagation(); _goFS(v); }; v.ondblclick = () => _goFS(v);
    wrap.append(v, lbl, fsBtn); vg.appendChild(wrap); vg.classList.remove("hidden"); _resizeGrid();
    if (mediaProtectionManager.isDrmActive()) wrap.classList.add("drm-black");
  }
  function _removeVideoEl(id) {
    const el = document.getElementById("vwrap-" + id); if (el) el.remove();
    const vg = document.getElementById("video-grid");
    if (!vg.childElementCount) vg.classList.add("hidden"); _resizeGrid();
  }
  function _resizeGrid() {
    const vg = document.getElementById("video-grid"), n = vg.childElementCount;
    vg.style.maxHeight = n <= 2 ? "200px" : n <= 4 ? "300px" : "400px";
  }
  function _goFS(ve) {
    if (_fsEl) { _fsEl.remove(); _fsEl = null; }
    _fsEl = document.createElement("div"); _fsEl.className = "video-fullscreen";
    const cl = document.createElement("video"); cl.srcObject = ve.srcObject; cl.autoplay = true; cl.playsInline = true; cl.muted = ve.muted;
    const ex = document.createElement("button"); ex.className = "fs-exit-btn"; ex.textContent = "✕ Exit";
    ex.onclick = () => { _fsEl?.remove(); _fsEl = null; };
    const esc = e => { if (e.key === "Escape") { _fsEl?.remove(); _fsEl = null; document.removeEventListener("keydown", esc); } };
    document.addEventListener("keydown", esc); _fsEl.append(cl, ex); document.body.appendChild(_fsEl);
  }
  function applyDRMBlackout(active) {
    document.querySelectorAll(".video-wrap").forEach(w => w.classList.toggle("drm-black", active));
    document.getElementById("drm-overlay")?.classList.toggle("hidden", !active);
  }
  return { isInCall, startCall, callPeer, handleIncomingCall, removePeerCall, leaveCall,
           toggleCamera, toggleMute, toggleDeafen, toggleNoise, toggleScreen, stopScreen,
           handlePeerState, applyDRMBlackout, getLocalStream, refreshPTT, refreshMuteState };
})();

/* ============================================================ MEDIA PROTECTION */
const mediaProtectionManager = (() => {
  let _drm = false, _ss = false;
  function isDrmActive() { return _drm; }
  function _on()  { if (_drm) return; _drm = true;  callManager.applyDRMBlackout(true); }
  function _off() { if (!_drm || _ss) return; _drm = false; callManager.applyDRMBlackout(false); }
  function onScreenShareStart() { _ss = true; _on(); }
  function onScreenShareEnd()   { _ss = false; if (_drm && !_ss) _off(); }
  function init() {
    document.addEventListener("visibilitychange", () => { if (document.hidden) _on(); else _off(); });
    window.addEventListener("blur",  () => { if (callManager.isInCall()) _on(); });
    window.addEventListener("focus", () => _off());
    if (navigator.mediaDevices?.setCaptureHandleConfig) { try { navigator.mediaDevices.setCaptureHandleConfig({handle:"nextalk-protected"}); } catch {} }
    const orig = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = async function(c) {
      _on(); const s = await orig(c);
      s.getVideoTracks().forEach(t => t.addEventListener("ended", () => { if (!_ss) _off(); })); return s;
    };
  }
  return { init, isDrmActive, onScreenShareStart, onScreenShareEnd };
})();

/* ============================================================ FILE TRANSFER MANAGER
   FIX: _enc calls are properly awaited in sequence per peer.
   Random file IDs and metadata stripping are always applied.
============================================================ */
const fileTransferManager = (() => {
  const _in = {};
  function _sz(b) { if (!b) return ""; if (b < 1024) return b + " B"; if (b < 1048576) return (b/1024).toFixed(1) + " KB"; return (b/1048576).toFixed(1) + " MB"; }
  function _randId() { return crypto.randomUUID().replace(/-/g,"").slice(0,16); }

  async function sendFile(file, opts = {}, targetPeer = null) {
    // Always strip metadata from images
    if (file.type.startsWith("image/")) file = await imageProcessor.stripMetadata(file);

    const conns = peerManager.getConnections();
    const peers = targetPeer
      ? [conns[targetPeer]].filter(Boolean)
      : Object.values(conns).filter(c => c.open && encryptionManager.hasSession(c.peer));
    if (!peers.length) { uiController.toast("No connected peers."); return; }

    // Always use random transfer IDs
    const tid  = _randId();
    const acc  = accountManager.get();
    const meta = {type:"file-meta", id:tid, name:file.name, size:file.size, user:acc.username,
                  oneTime:!!opts.oneTime, spoiler:!!opts.spoiler, expiry:opts.expiry||0, mimeType:file.type};

    uiController.setFileProgress(true, file.name, 0);

    for (const conn of peers) {
      await _enc(conn, meta);
      let off = 0, idx = 0;
      while (off < file.size) {
        const s   = file.slice(off, off + CHUNK_SIZE);
        const buf = await s.arrayBuffer();
        // base64 encode each chunk — safe through JSON/encryption
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        await _enc(conn, {type:"file-chunk", id:tid, index:idx++, chunk:b64});
        off += CHUNK_SIZE;
        uiController.setFileProgress(true, file.name, Math.min(Math.round(off / file.size * 100), 100));
      }
      await _enc(conn, {type:"file-end", id:tid, totalChunks:idx});
    }

    uiController.setFileProgress(false);
    uiController.appendSystemMessage(`Sent: "${file.name}" (${_sz(file.size)})`);
  }

  async function _enc(conn, obj) {
    if (!conn.open || !encryptionManager.hasSession(conn.peer)) return;
    const payload = await encryptionManager.encrypt(conn.peer, obj);
    conn.send({encrypted:true, payload});
  }

  function receiveMeta(pid, data)  { _in[data.id] = {meta:data, chunks:[], peer:pid}; }
  function receiveChunk(data)      { if (_in[data.id]) _in[data.id].chunks[data.index] = data.chunk; }
  function receiveEnd(data, pid) {
    const entry = _in[data.id]; if (!entry) return;
    const {meta, chunks} = entry;
    const arrays = chunks.map(b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
    const total  = arrays.reduce((n, a) => n + a.length, 0);
    const merged = new Uint8Array(total); let off = 0;
    arrays.forEach(a => { merged.set(a, off); off += a.length; });
    const blob    = new Blob([merged], {type: meta.mimeType || "application/octet-stream"});
    const profile = peerManager.getProfile(pid);
    // Route file to DM container if the sender is the currently open DM peer
    // This ensures files sent in DM context appear in the DM view, not #general
    const isDMContext = dmManager.getActivePid() === pid || dmManager.hasDMWith(pid);
    if (isDMContext) {
      // Render as a DM image/file inside the DM conversation
      dmManager.receiveFile(pid, meta, blob);
    } else {
      uiController.appendFileMessage(profile.username||"Peer", meta.name, meta.size, blob,
                                     profile.avatar||null, pid,
                                     {oneTime:meta.oneTime, spoiler:meta.spoiler, expiry:meta.expiry});
    }
    delete _in[data.id];
  }
  return { sendFile, receiveMeta, receiveChunk, receiveEnd };
})();

/* ============================================================ DM MANAGER */
const dmManager = (() => {
  let _activePid = null;
  const _hist    = {};
  const _unread  = {};

  const dmView     = document.getElementById("dm-view");
  const dmMsgs     = document.getElementById("dm-messages");
  const dmInput    = document.getElementById("dm-input");
  const dmImgInput = document.getElementById("dm-img-input");

  document.getElementById("dm-send").addEventListener("click", send);
  dmInput.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });

  document.getElementById("dm-emoji-btn").addEventListener("click", e => {
    emojiManager.setTarget(dmInput);
    const picker = document.getElementById("emoji-picker");
    const r = e.currentTarget.getBoundingClientRect();
    picker.style.bottom = (window.innerHeight - r.top + 6) + "px";
    picker.style.left   = r.left + "px";
    picker.classList.toggle("hidden");
    e.stopPropagation();
  });

  dmImgInput.addEventListener("change", async function() {
    const f = this.files[0]; if (!f || !_activePid) return; this.value = "";
    // Always strip metadata
    const file = await imageProcessor.stripMetadata(f);
    const reader = new FileReader();
    reader.onload = async e => {
      const b64 = e.target.result.split(",")[1];
      const acc = accountManager.get();
      const msg = {type:"dm-image", user:acc.username, b64, mimeType:file.type, ts:Date.now(), msgId:crypto.randomUUID()};
      _store(_activePid, {...msg, isSelf:true, isImg:true});
      _renderImg({...msg, isSelf:true});
      await peerManager.sendTo(_activePid, msg);
    };
    reader.readAsDataURL(file);
  });

  function open(pid) {
    _activePid  = pid;
    _unread[pid] = 0;
    document.getElementById("chat-view").classList.add("hidden");
    dmView.classList.remove("hidden");
    // Always re-fetch profile in case username updated since last open
    const profile = peerManager.getProfile(pid);
    const name    = profile.username || pid.slice(0,8);
    document.getElementById("toolbar-channel").textContent = "@ " + name;
    document.getElementById("toolbar-desc").textContent    = "End-to-end encrypted · Direct message";
    dmMsgs.innerHTML = "";
    (_hist[pid] || []).forEach(m => m.isImg ? _renderImg(m) : _renderDM(m));
    dmMsgs.scrollTop = dmMsgs.scrollHeight;
    _navToDMs();
    _renderConvList();
    dmInput.focus();
  }

  function closeActiveDM() {
    _activePid = null;
    dmView.classList.add("hidden");
    document.getElementById("chat-view").classList.remove("hidden");
    document.getElementById("toolbar-channel").textContent = "# general";
    document.getElementById("toolbar-desc").textContent    = "End-to-end encrypted · Full mesh · Per-message ratchet";
    // Clear any general-chat unread indicator
    document.getElementById("nav-main")?.classList.remove("has-unread");
  }

  async function send() {
    const text = dmInput.value.trim(); if (!text || !_activePid) return;
    dmInput.value = "";
    const acc = accountManager.get();
    const msg = {type:"dm", user:acc.username, text, avatar:acc.avatar, msgId:crypto.randomUUID(), ts:Date.now()};
    _store(_activePid, {...msg, isSelf:true});
    _renderDM({...msg, isSelf:true});
    await peerManager.sendTo(_activePid, msg);
  }

  function receiveMessage(fromPid, data) {
    const profile = peerManager.getProfile(fromPid);
    const msg = {...data, isSelf:false, avatar:profile.avatar};
    _store(fromPid, msg);
    if (_activePid === fromPid) { _renderDM(msg); }
    else {
      _unread[fromPid] = (_unread[fromPid]||0) + 1;
      uiController.toast(`💬 DM from ${profile.username||"Peer"}: ${data.text.slice(0,40)}`);
      _notifDot(fromPid);
    }
    _renderConvList(); _updateDMBadge();
  }

  function receiveImage(fromPid, data) {
    const profile = peerManager.getProfile(fromPid);
    const msg = {...data, isSelf:false, avatar:profile.avatar, isImg:true};
    _store(fromPid, msg);
    if (_activePid === fromPid) { _renderImg(msg); }
    else {
      _unread[fromPid] = (_unread[fromPid]||0) + 1;
      uiController.toast(`🖼 Image from ${profile.username||"Peer"}`);
      _notifDot(fromPid);
    }
    _renderConvList(); _updateDMBadge();
  }

  function _store(pid, msg) { if (!_hist[pid]) _hist[pid] = []; _hist[pid].push(msg); }

  function _renderDM(msg) {
    uiController._appendMsgEl(dmMsgs, {user:msg.user, text:msg.text, avatar:msg.avatar, isSelf:msg.isSelf, isDM:true});
    dmMsgs.scrollTop = dmMsgs.scrollHeight;
  }

  function _renderImg(msg) {
    const wrap = document.createElement("div"); wrap.className = "message";
    const avi  = document.createElement("img"); avi.className = "msg-avatar";
    uiController._applyAvatar(avi, msg.user, msg.avatar);
    const right = document.createElement("div"); right.className = "msg-right";
    const hdr   = document.createElement("div"); hdr.className = "msg-header";
    const u     = document.createElement("span"); u.className = "username" + (msg.isSelf ? " self" : " dm-tag");
    u.textContent = msg.user + (msg.isSelf ? "" : " 🔒");
    const t = document.createElement("span"); t.className = "msg-time";
    t.textContent = new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
    hdr.append(u, t);
    const img = document.createElement("img");
    img.className = "msg-img"; img.src = `data:${msg.mimeType};base64,${msg.b64}`; img.alt = "Image";
    img.onclick = () => uiController.openLightbox(img.src);
    right.append(hdr, img); wrap.append(avi, right);
    dmMsgs.appendChild(wrap); dmMsgs.scrollTop = dmMsgs.scrollHeight;
  }

  function _notifDot(pid) {
    document.getElementById("nav-dms-badge")?.classList.remove("hidden");
    _renderConvList();
  }
  function _updateDMBadge() {
    const total = Object.values(_unread).reduce((a,b) => a+b, 0);
    const badge = document.getElementById("nav-dms-badge"); if (!badge) return;
    if (total > 0) { badge.textContent = total > 9 ? "9+" : total; badge.classList.remove("hidden"); }
    else badge.classList.add("hidden");
  }
  function _navToDMs() {
    ["nav-main","nav-account","nav-friends","nav-settings","nav-dms"].forEach(id => document.getElementById(id)?.classList.remove("active"));
    ["main-panel","account-panel","friends-panel","dms-panel"].forEach(id => document.getElementById(id)?.classList.add("hidden"));
    document.getElementById("nav-dms")?.classList.add("active");
    document.getElementById("dms-panel")?.classList.remove("hidden");
  }
  function _renderConvList() {
    const list = document.getElementById("dm-conversations-list");
    const hint = document.getElementById("dm-empty-hint"); if (!list) return;
    const pids = Object.keys(_hist);
    if (!pids.length) { if (hint) hint.style.display = "block"; list.innerHTML = ""; return; }
    if (hint) hint.style.display = "none";
    list.innerHTML = "";
    pids.forEach(pid => {
      const profile  = peerManager.getProfile(pid);
      const name     = profile.username || pid.slice(0,8);
      const msgs     = _hist[pid];
      const last     = msgs[msgs.length - 1];
      const unread   = _unread[pid] || 0;
      const isActive = pid === _activePid;
      const item     = document.createElement("div"); item.className = "dm-conv-item" + (isActive ? " active" : ""); item.dataset.peer = pid;
      const avi      = document.createElement("img"); avi.className = "dm-conv-avatar";
      uiController._applyAvatar(avi, name, profile.avatar||null);
      const body     = document.createElement("div"); body.className = "dm-conv-body";
      const nameEl   = document.createElement("div"); nameEl.className = "dm-conv-name"; nameEl.textContent = name;
      const preview  = document.createElement("div"); preview.className = "dm-conv-preview";
      if (last) { if (last.isImg) preview.textContent = "🖼 Image"; else preview.textContent = (last.isSelf ? "You: " : "") + ((last.text||"").slice(0,35)); }
      body.append(nameEl, preview);
      const meta = document.createElement("div"); meta.className = "dm-conv-meta";
      if (unread > 0) { const badge = document.createElement("span"); badge.className = "dm-unread-badge"; badge.textContent = unread > 9 ? "9+" : unread; meta.appendChild(badge); }
      item.append(avi, body, meta);
      item.addEventListener("click", () => { _unread[pid] = 0; _updateDMBadge(); open(pid); });
      list.appendChild(item);
    });
  }
  function onPeerProfileUpdate(pid, profile) {
    if (_activePid === pid) document.getElementById("toolbar-channel").textContent = "@ " + (profile.username || pid.slice(0,8));
    _renderConvList();
  }
  function receiveFile(fromPid, meta, blob) {
    const profile = peerManager.getProfile(fromPid);
    const isImg   = /\.(jpe?g|png|gif|webp|svg|avif)$/i.test(meta.name);
    if (isImg) {
      // Convert to base64 and render inline like a DM image
      const reader = new FileReader();
      reader.onload = e => {
        const b64     = e.target.result.split(",")[1];
        const mimeType = meta.mimeType || "image/jpeg";
        const msg = { user:profile.username||"Peer", b64, mimeType, isSelf:false, avatar:profile.avatar||null, isImg:true };
        _store(fromPid, msg);
        if (_activePid === fromPid) { _renderImg(msg); }
        else { _unread[fromPid] = (_unread[fromPid]||0)+1; uiController.toast(`🖼 File from ${profile.username||"Peer"}`); _notifDot(fromPid); }
        _renderConvList(); _updateDMBadge();
      };
      reader.readAsDataURL(blob);
    } else {
      // Non-image: render a file pill inside the DM conversation
      const wrap  = document.createElement("div"); wrap.className = "message";
      const avi   = document.createElement("img"); avi.className = "msg-avatar";
      uiController._applyAvatar(avi, profile.username||"Peer", profile.avatar||null);
      const right = document.createElement("div"); right.className = "msg-right";
      const hdr   = document.createElement("div"); hdr.className = "msg-header";
      const u     = document.createElement("span"); u.className = "username dm-tag"; u.textContent = (profile.username||"Peer") + " 🔒";
      const t     = document.createElement("span"); t.className = "msg-time"; t.textContent = new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
      hdr.append(u, t);
      const sz    = meta.size < 1024 ? meta.size+" B" : meta.size < 1048576 ? (meta.size/1024).toFixed(1)+" KB" : (meta.size/1048576).toFixed(1)+" MB";
      const row   = document.createElement("div"); row.className = "msg-file";
      row.innerHTML = `<span>📄</span><span class="file-name">${uiController._escapeHtml(meta.name)}</span><span class="file-size">${sz}</span>`;
      const dl = document.createElement("span"); dl.className = "file-hint"; dl.textContent = "↓"; dl.style.cursor = "pointer";
      dl.onclick = async () => { dl.textContent="…"; const ok=await filePermissionManager.requestPermission(fromPid,blob,meta.name); dl.textContent=ok?"✓":"↓"; if(ok)filePermissionManager.executeDownload(blob,meta.name); };
      row.appendChild(dl);
      right.append(hdr, row); wrap.append(avi, right);
      if (_activePid === fromPid) { dmMsgs.appendChild(wrap); dmMsgs.scrollTop = dmMsgs.scrollHeight; }
      else { _unread[fromPid] = (_unread[fromPid]||0)+1; uiController.toast(`📄 File from ${profile.username||"Peer"}: ${meta.name}`); _notifDot(fromPid); }
      _renderConvList(); _updateDMBadge();
    }
  }
  function hasDMWith(pid)  { return !!_hist[pid]; }
  function getActivePid()  { return _activePid; }
  return { open, closeActiveDM, send, receiveMessage, receiveImage, receiveFile, onPeerProfileUpdate, hasDMWith, getActivePid, _renderConvList };
})();

/* ============================================================ FRIENDS MANAGER
   FIX: _inboundQueue item removal now uses token-based filter
   instead of object-identity indexOf (which always returned -1).
============================================================ */
const friendsManager = (() => {
  const _outboundRequests = {}; // pid → { token, ts }
  let _inboundQueue = [];        // [{fromPid, data}]

  function init() {
    const kd  = document.getElementById("friend-key-display");
    const acc = accountManager.get();
    if (kd) kd.textContent = acc.friendKey || "—";

    document.getElementById("refresh-friend-key")?.addEventListener("click", () => {
      const nk = accountManager.refreshFriendKey();
      if (kd) kd.textContent = nk; uiController.toast("Friend key refreshed!");
    });
    document.getElementById("copy-friend-key")?.addEventListener("click", () => {
      const k = accountManager.get().friendKey;
      if (k) navigator.clipboard.writeText(k).then(() => uiController.toast("Friend key copied!"));
    });
    document.getElementById("add-friend-btn")?.addEventListener("click", () => {
      const inp = document.getElementById("add-friend-input");
      const k   = inp?.value.trim().toUpperCase(); if (!k) { uiController.toast("Enter a friend key."); return; }
      const ok  = accountManager.addFriend(k, "Friend");
      if (ok) { inp.value = ""; renderFriends(); uiController.toast("Friend added by key!"); }
      else uiController.toast("Already added or invalid key.");
    });
    renderFriends(); _renderFriendRequests();
  }

  function onPeerConnected(pid, profile) {
    if (!profile.friendKey) { renderFriends(); return; }
    const friends = accountManager.getFriends();
    const match = friends.find(f => f.friendKey === profile.friendKey);
    if (match) accountManager.updateFriendPeerId(match.friendKey, pid);
    renderFriends();
  }

  // Called at startup: scan all currently connected peers to resolve any friend matches
  // that arrived before friendsManager was fully initialised
  function reconcileConnectedPeers() {
    const conns    = peerManager.getConnections();
    const profiles = Object.fromEntries(Object.keys(conns).map(pid => [pid, peerManager.getProfile(pid)]));
    Object.entries(profiles).forEach(([pid, profile]) => {
      if (profile.friendKey) onPeerConnected(pid, profile);
    });
  }
  function onPeerDisconnected(pid) { renderFriends(); }

  let _renderPending = false;
  function renderFriends() {
    if (_renderPending) return;
    _renderPending = true;
    requestAnimationFrame(() => { _renderPending = false; _doRenderFriends(); });
  }
  function _doRenderFriends() {
    const list = document.getElementById("friends-list"); if (!list) return;
    const friends = accountManager.getFriends();
    const conns   = peerManager.getConnections();
    const onlineCount = friends.filter(f => f.lastPeerId && conns[f.lastPeerId]).length;
    const countEl = document.getElementById("online-friends-count");
    if (countEl) countEl.textContent = onlineCount + " online";
    list.innerHTML = "";
    if (!friends.length) { list.innerHTML = '<span class="empty-peers">No friends yet</span>'; return; }
    friends.forEach(f => {
      const isOnline = !!(f.lastPeerId && conns[f.lastPeerId]);
      const profile  = isOnline ? peerManager.getProfile(f.lastPeerId) : null;
      const name     = profile?.username || f.name || f.friendKey.slice(0,12);
      const item     = document.createElement("div"); item.className = "peer-item";
      const avi      = document.createElement("img"); avi.className = "peer-avatar";
      uiController._applyAvatar(avi, name, profile?.avatar||null);
      const dot  = document.createElement("span"); dot.className = "friend-online-dot" + (isOnline ? " online" : "");
      const lbl  = document.createElement("span"); lbl.textContent = name; lbl.style.flex = "1"; lbl.title = f.friendKey;
      const acts = document.createElement("div"); acts.className = "friend-item-actions";
      if (isOnline && f.lastPeerId) {
        const msgBtn = document.createElement("button"); msgBtn.className = "btn btn-sm btn-primary";
        msgBtn.textContent = "💬"; msgBtn.title = "Message"; msgBtn.style.padding = "2px 6px";
        msgBtn.onclick = e => { e.stopPropagation(); dmManager.open(f.lastPeerId); };
        acts.appendChild(msgBtn);
      }
      const rmBtn = document.createElement("button"); rmBtn.className = "btn btn-sm";
      rmBtn.textContent = "✕"; rmBtn.style.cssText = "background:var(--accent-red);color:#fff;padding:2px 6px;font-size:.7rem";
      rmBtn.onclick = e => { e.stopPropagation(); if (confirm("Remove friend?")) { accountManager.removeFriend(f.friendKey); renderFriends(); } };
      acts.appendChild(rmBtn);
      item.append(avi, dot, lbl, acts);
      item.addEventListener("click", e => { if (isOnline && f.lastPeerId && e.target === item) dmManager.open(f.lastPeerId); });
      list.appendChild(item);
    });
  }

  // Send a friend request via the profile popup
  function sendRequest(pid) {
    const acc   = accountManager.get();
    const token = crypto.randomUUID();
    _outboundRequests[pid] = {token, ts: Date.now()};
    peerManager.sendTo(pid, {type:"friend-request", token, senderKey:acc.friendKey, senderName:acc.username, senderAvatar:acc.avatar});
    uiController.toast("Friend request sent!");
  }

  // Received a request from a peer
  function handleIncomingRequest(fromPid, data) {
    // Auto-accept if we already have their friendKey saved
    if (accountManager.isFriend(data.senderKey)) { _acceptRequest(fromPid, data); return; }
    // Queue it and show the floating toast
    _inboundQueue.push({fromPid, data});
    _renderFriendRequests();
    _showNextRequestToast();
  }

  // Floating toast for the first item in queue
  let _toastVisible = false;
  function _showNextRequestToast() {
    if (_toastVisible || !_inboundQueue.length) return;
    _toastVisible = true;
    const {fromPid, data} = _inboundQueue[0];
    const toast   = document.getElementById("friend-req-toast");
    const profile = peerManager.getProfile(fromPid);
    uiController._applyAvatar(document.getElementById("frq-avatar"), data.senderName, data.senderAvatar || profile.avatar || null);
    document.getElementById("frq-name").textContent = data.senderName || profile.username || fromPid.slice(0,8);
    toast.classList.remove("hidden");

    document.getElementById("frq-accept").onclick = () => {
      _acceptRequest(fromPid, data);
      _dismissToast(data.token);
    };
    document.getElementById("frq-decline").onclick = () => {
      peerManager.sendTo(fromPid, {type:"friend-decline", token:data.token});
      _dismissToast(data.token);
      uiController.toast("Friend request declined.");
    };
  }

  // FIX: remove by token, not by object identity
  function _dismissToast(token) {
    document.getElementById("friend-req-toast").classList.add("hidden");
    _inboundQueue = _inboundQueue.filter(item => item.data.token !== token);
    _toastVisible = false;
    _renderFriendRequests();
    setTimeout(_showNextRequestToast, 400);
  }

  function _acceptRequest(fromPid, data) {
    const profile = peerManager.getProfile(fromPid);
    accountManager.addFriend(data.senderKey, data.senderName || profile.username || "Friend");
    accountManager.updateFriendPeerId(data.senderKey, fromPid);
    const acc = accountManager.get();
    peerManager.sendTo(fromPid, {type:"friend-accept", token:data.token,
                                  acceptorKey:acc.friendKey, acceptorName:acc.username, acceptorAvatar:acc.avatar});
    renderFriends();
    uiController.toast("✅ Friend accepted: " + (data.senderName || "Peer"));
  }

  function handleAccepted(fromPid, data) {
    const profile = peerManager.getProfile(fromPid);
    if (accountManager.addFriend(data.acceptorKey, data.acceptorName || profile.username || "Friend")) {
      accountManager.updateFriendPeerId(data.acceptorKey, fromPid);
      renderFriends();
      uiController.toast("✅ " + (data.acceptorName||"Peer") + " accepted your friend request!");
    }
    delete _outboundRequests[fromPid];
  }

  function handleDeclined(fromPid) {
    const profile = peerManager.getProfile(fromPid);
    delete _outboundRequests[fromPid];
    uiController.toast("❌ " + (profile.username||"Peer") + " declined your friend request.");
  }

  function hasOutboundRequest(pid) { return !!_outboundRequests[pid]; }

  // FIX: inline list accept/decline also use token-based removal
  function _renderFriendRequests() {
    const sec     = document.getElementById("friend-requests-section");
    const list    = document.getElementById("friend-requests-list");
    const cnt     = document.getElementById("req-count");
    const navBadge = document.getElementById("nav-friends-badge");
    if (!list) return;
    const n = _inboundQueue.length;
    if (!n) { if (sec) sec.style.display = "none"; navBadge?.classList.add("hidden"); return; }
    if (sec) sec.style.display = "block";
    if (cnt) cnt.textContent = n;
    if (navBadge) { navBadge.textContent = n; navBadge.classList.remove("hidden"); }
    list.innerHTML = "";
    _inboundQueue.forEach(({fromPid, data}) => {
      const profile = peerManager.getProfile(fromPid);
      const name    = data.senderName || profile.username || fromPid.slice(0,8);
      const row     = document.createElement("div"); row.className = "peer-item";
      const avi     = document.createElement("img"); avi.className = "peer-avatar";
      uiController._applyAvatar(avi, name, data.senderAvatar||null);
      const lbl = document.createElement("span"); lbl.textContent = name; lbl.style.flex = "1";
      const acc = document.createElement("button"); acc.className = "btn btn-sm btn-primary"; acc.textContent = "✓";
      acc.onclick = e => { e.stopPropagation(); _acceptRequest(fromPid, data); _dismissToast(data.token); };
      const dec = document.createElement("button"); dec.className = "btn btn-sm btn-secondary"; dec.textContent = "✕";
      dec.onclick = e => {
        e.stopPropagation();
        peerManager.sendTo(fromPid, {type:"friend-decline", token:data.token});
        _dismissToast(data.token);
      };
      row.append(avi, lbl, acc, dec); list.appendChild(row);
    });
  }

  return { init, renderFriends, onPeerConnected, onPeerDisconnected, reconcileConnectedPeers,
           sendRequest, handleIncomingRequest, handleAccepted, handleDeclined, hasOutboundRequest };
})();

/* ============================================================ EMBED RENDERER */
const embedRenderer = (() => {
  const YT     = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/;
  const IMG    = /\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i;
  const VID    = /\.(mp4|webm|ogg)(\?.*)?$/i;
  const URL_RE = /https?:\/\/[^\s<>"']+/g;
  function parseLinks(text) {
    return text.replace(URL_RE, url => { const s = url.replace(/</g,"&lt;").replace(/>/g,"&gt;"); return `<a href="${s}" target="_blank" rel="noopener noreferrer">${s}</a>`; });
  }
  function extractUrls(text) { return text.match(URL_RE) || []; }
  function buildEmbed(url) {
    const yt = url.match(YT);
    if (yt) { const f = document.createElement("iframe"); f.src = `https://www.youtube.com/embed/${yt[1]}`; f.width="320"; f.height="180"; f.style.cssText="border:none;border-radius:10px;display:block;margin-top:6px"; f.allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"; f.allowFullscreen=true; return f; }
    if (IMG.test(url)) { const img = document.createElement("img"); img.src=url; img.className="msg-img"; img.loading="lazy"; img.alt="Image"; img.onclick=()=>uiController.openLightbox(url); return img; }
    if (VID.test(url)) { const v = document.createElement("video"); v.src=url; v.controls=true; v.style.cssText="max-width:320px;border-radius:10px;display:block;margin-top:6px"; return v; }
    return null;
  }
  return { parseLinks, extractUrls, buildEmbed };
})();

/* ============================================================ EMOJI MANAGER */
const emojiManager = (() => {
  const picker  = document.getElementById("emoji-picker");
  const trigger = document.getElementById("emoji-btn");
  let _target   = document.getElementById("message");
  let _custom   = {};
  const _RECENT_KEY = "nextalk_recent_emoji";
  const MAX_RECENT  = 16;
  const _CODES = {smile:"😊",grin:"😁",laugh:"😂",heart:"❤️",fire:"🔥",check:"✅",wave:"👋",star:"⭐",sad:"😢",ok:"👌",clap:"👏",eyes:"👀",think:"🤔",party:"🎉","100":"💯",thumbsup:"👍",thumbsdown:"👎",skull:"💀",cry:"😭",love:"🥰",cool:"😎",angry:"😡",pray:"🙏",shrug:"🤷"};

  function _getRecent() { try { return JSON.parse(localStorage.getItem(_RECENT_KEY)||"[]"); } catch { return []; } }
  function _addRecent(e) { const r = _getRecent().filter(x => x !== e); r.unshift(e); r.splice(MAX_RECENT); localStorage.setItem(_RECENT_KEY, JSON.stringify(r)); }

  function setTarget(el) { _target = el; }

  function init() {
    _custom = accountManager.getCustomEmojis(); _buildPicker();
    trigger.addEventListener("click", e => {
      setTarget(document.getElementById("message"));
      const r = trigger.getBoundingClientRect();
      picker.style.bottom = (window.innerHeight - r.top + 6) + "px";
      picker.style.left   = r.left + "px";
      picker.style.removeProperty("top");
      picker.classList.toggle("hidden");
      e.stopPropagation();
    });
    document.addEventListener("click", e => {
      if (!picker.contains(e.target) && e.target !== trigger && e.target !== document.getElementById("dm-emoji-btn"))
        picker.classList.add("hidden");
    });
    document.getElementById("message").addEventListener("input", _autocomplete);
    document.getElementById("dm-input")?.addEventListener("input", _autocomplete);
  }

  function _buildPicker() {
    picker.innerHTML = "";
    const search = document.createElement("input"); search.className = "emoji-search"; search.placeholder = "Search emoji…";
    picker.appendChild(search);
    const recent = _getRecent();
    if (recent.length) {
      const rRow = document.createElement("div"); rRow.className = "emoji-recent";
      const rl = document.createElement("div"); rl.className = "emoji-recent-label"; rl.textContent = "RECENTLY USED"; rRow.appendChild(rl);
      recent.forEach(e => { const btn = document.createElement("span"); btn.className = "emoji-item"; btn.textContent = e; btn.onclick = () => { _insert(e, false); _addRecent(e); picker.classList.add("hidden"); }; rRow.appendChild(btn); });
      picker.appendChild(rRow);
    }
    const tabRow  = document.createElement("div"); tabRow.className = "emoji-tabs";
    const content = document.createElement("div"); content.className = "emoji-content";
    picker.appendChild(tabRow); picker.appendChild(content);
    const cats = {...EMOJI_CATEGORIES}; if (Object.keys(_custom).length) cats["Custom"] = Object.keys(_custom);
    const ICONS = {Smileys:"😊",People:"👋",Nature:"🐶",Food:"🍎",Objects:"💡",Symbols:"❤️",Custom:"⭐"};
    let activeTab = Object.keys(cats)[0];
    function show(cat) {
      activeTab = cat; content.innerHTML = "";
      tabRow.querySelectorAll(".emoji-tab").forEach(t => t.classList.toggle("active", t.dataset.cat === cat));
      const grid = document.createElement("div"); grid.className = "emoji-grid";
      const list = cat === "Custom" ? Object.keys(_custom) : (EMOJI_CATEGORIES[cat]||[]);
      list.forEach(e => {
        const btn = document.createElement("span"); btn.className = "emoji-item";
        if (cat === "Custom") { const img = document.createElement("img"); img.src = _custom[e]; img.style.cssText = "width:1.4em;height:1.4em;object-fit:contain"; btn.appendChild(img); } else btn.textContent = e;
        btn.onclick = () => { _insert(cat === "Custom" ? _custom[e] : e, cat === "Custom"); _addRecent(e); picker.classList.add("hidden"); };
        grid.appendChild(btn);
      });
      content.appendChild(grid);
    }
    Object.keys(cats).forEach((cat, i) => {
      const tab = document.createElement("button"); tab.className = "emoji-tab"; tab.dataset.cat = cat;
      tab.textContent = ICONS[cat]||cat[0]; tab.title = cat; tab.onclick = () => show(cat); tabRow.appendChild(tab);
      if (i === 0) show(cat);
    });
    const uploadRow = document.createElement("div"); uploadRow.className = "emoji-upload-row";
    const lbl = document.createElement("label"); lbl.className = "emoji-upload-btn"; lbl.innerHTML = "<span>＋ Custom</span>";
    const fi = document.createElement("input"); fi.type = "file"; fi.accept = "image/*"; fi.style.display = "none";
    fi.onchange = function() {
      const file = this.files[0]; if (!file) return;
      const name = prompt("Emoji name (no spaces):", file.name.split(".")[0].replace(/\s+/g,"_")); if (!name) return;
      const r = new FileReader(); r.onload = e => { _custom[name] = e.target.result; accountManager.saveCustomEmojis(_custom); _buildPicker(); uiController.toast(`:${name}: added!`); };
      r.readAsDataURL(file); this.value = "";
    };
    lbl.onclick = () => fi.click(); lbl.appendChild(fi); uploadRow.appendChild(lbl); picker.appendChild(uploadRow);
    search.addEventListener("input", () => {
      const q = search.value.toLowerCase(); content.innerHTML = "";
      if (!q) { show(activeTab); return; }
      const grid = document.createElement("div"); grid.className = "emoji-grid";
      Object.values(EMOJI_CATEGORIES).flat().filter(e => e.includes(q)).forEach(e => {
        const btn = document.createElement("span"); btn.className = "emoji-item"; btn.textContent = e;
        btn.onclick = () => { _insert(e, false); _addRecent(e); picker.classList.add("hidden"); };
        grid.appendChild(btn);
      });
      content.appendChild(grid);
    });
  }

  function _insert(val, isCustom) {
    if (!_target) return;
    if (isCustom) {
      const name = Object.keys(_custom).find(k => _custom[k] === val); if (!name) return;
      const p = _target.selectionStart||0; _target.value = _target.value.slice(0,p)+`:${name}:`+_target.value.slice(p);
      _target.focus(); _target.selectionStart = _target.selectionEnd = p + name.length + 2;
    } else {
      const p = _target.selectionStart||0; _target.value = _target.value.slice(0,p)+val+_target.value.slice(p);
      _target.focus(); _target.selectionStart = _target.selectionEnd = p + val.length;
    }
  }
  function _autocomplete(e) {
    const el = e.target, text = el.value; const m = text.match(/:([a-zA-Z0-9_]+)$/); if (!m) return;
    const key = m[1].toLowerCase();
    if (_custom[key]) { el.value = text.slice(0, text.lastIndexOf(":")) + `:${key}:`; return; }
    if (_CODES[key]) el.value = text.slice(0, text.lastIndexOf(":")) + _CODES[key];
  }
  function renderCustomEmojis(container) {
    if (!Object.keys(_custom).length) return;
    container.querySelectorAll(".msg-text").forEach(el => {
      Object.entries(_custom).forEach(([name, src]) => { el.innerHTML = el.innerHTML.replace(new RegExp(`:${name}:`,"g"), `<img src="${src}" class="custom-emoji-inline" alt=":${name}:" title=":${name}:">`); });
    });
  }
  return { init, setTarget, renderCustomEmojis };
})();

/* ============================================================ SETTINGS UI
   FIX: toggle-switch builder reconstructed cleanly.
   Privacy protections (metadata, padding, random IDs) are NOT
   exposed here — they are always enforced.
============================================================ */
const settingsUI = (() => {
  const panel = document.getElementById("settings-panel");
  const body  = document.getElementById("settings-body");

  function open()  { _render(); panel.classList.remove("hidden"); panel.style.transform = "translateX(0)"; }
  function close() { panel.style.transform = "translateX(100%)"; setTimeout(() => { panel.classList.add("hidden"); panel.style.transform = ""; }, 260); }

  // FIX: clean toggle builder — no broken setAttribute call
  function _toggle(key, label, desc, onChangeCb) {
    const row = document.createElement("div"); row.className = "setting-row";
    const lw  = document.createElement("div"); lw.className = "setting-label-wrap";
    const lb  = document.createElement("div"); lb.className = "setting-label"; lb.textContent = label;
    lw.appendChild(lb);
    if (desc) { const d = document.createElement("div"); d.className = "setting-desc"; d.textContent = desc; lw.appendChild(d); }
    const sw  = document.createElement("label"); sw.className = "toggle-switch";
    const inp = document.createElement("input"); inp.type = "checkbox"; inp.checked = !!settingsManager.get(key);
    inp.addEventListener("change", () => { settingsManager.set(key, inp.checked); if (onChangeCb) onChangeCb(inp.checked); });
    const sl  = document.createElement("span"); sl.className = "toggle-slider";
    sw.append(inp, sl); row.append(lw, sw); return row;
  }
  function _section(title, ...rows) {
    const sec = document.createElement("div"); sec.className = "settings-section";
    const t   = document.createElement("div"); t.className = "settings-section-title"; t.textContent = title;
    sec.appendChild(t); rows.forEach(r => sec.appendChild(r)); return sec;
  }

  function _render() {
    body.innerHTML = "";

    // Rehandshake interval (only configurable crypto setting)
    const rhRow = document.createElement("div"); rhRow.className = "setting-row";
    const rhl   = document.createElement("div"); rhl.className = "setting-label-wrap";
    const rhLbl = document.createElement("div"); rhLbl.className = "setting-label"; rhLbl.textContent = "Rehandshake interval (minutes)";
    const rhDesc = document.createElement("div"); rhDesc.className = "setting-desc"; rhDesc.textContent = "Keys rotate on every message + fully re-negotiate on this interval. 0 = timed renegotiation disabled.";
    rhl.append(rhLbl, rhDesc);
    const rhInp = document.createElement("input"); rhInp.type = "number"; rhInp.min = "0"; rhInp.max = "60";
    rhInp.value = settingsManager.get("rehandshakeMinutes") || 10;
    rhInp.style.cssText = "width:60px;background:var(--bg-input);border:1px solid var(--border);border-radius:4px;color:var(--text-hi);padding:4px 8px;font-family:var(--font-mono);font-size:.78rem;outline:none";
    rhInp.addEventListener("change", () => settingsManager.set("rehandshakeMinutes", parseInt(rhInp.value)||0));
    rhRow.append(rhl, rhInp);
    body.appendChild(_section("ENCRYPTION", rhRow));

    // Voice & Media
    body.appendChild(_section("VOICE & MEDIA",
      _toggle("adaptiveBitrate", "Adaptive bitrate", "Cap video call bitrate for stability"),
      _toggle("voiceIsolation",  "Voice isolation",  "HP/LP filter + compressor on mic to reduce background noise",
              v => { if (callManager.isInCall()) callManager.toggleNoise(); })
    ));

    // PTT section
    const pttSec = document.createElement("div"); pttSec.className = "settings-section";
    const pttTitle = document.createElement("div"); pttTitle.className = "settings-section-title"; pttTitle.textContent = "PUSH-TO-TALK";
    pttSec.appendChild(pttTitle);
    const pttRow = _toggle("pushToTalk", "Enable push-to-talk", "Mic stays muted unless PTT key held",
                            v => { if (callManager.isInCall()) { callManager.refreshPTT(); if (!v) callManager.refreshMuteState(); } });
    pttSec.appendChild(pttRow);

    // PTT key picker
    const keyRow = document.createElement("div"); keyRow.className = "setting-row";
    const keyLW  = document.createElement("div"); keyLW.className = "setting-label-wrap";
    const keyLbl = document.createElement("div"); keyLbl.className = "setting-label"; keyLbl.textContent = "PTT key";
    const keyDesc = document.createElement("div"); keyDesc.className = "setting-desc"; keyDesc.textContent = "Click and press a key to bind";
    keyLW.append(keyLbl, keyDesc);
    const keyBtn = document.createElement("button");
    keyBtn.style.cssText = "background:var(--bg-input);border:1px solid var(--border);border-radius:4px;color:var(--accent);font-family:var(--font-mono);font-size:.78rem;padding:4px 10px;cursor:pointer;min-width:60px";
    const curKey = settingsManager.get("pttKey") || " ";
    keyBtn.textContent = curKey === " " ? "[Space]" : curKey;
    keyBtn.onclick = () => {
      keyBtn.textContent = "Press a key…"; keyBtn.style.borderColor = "var(--accent)";
      function capture(e) {
        e.preventDefault(); e.stopPropagation();
        settingsManager.set("pttKey", e.key); keyBtn.textContent = e.key === " " ? "[Space]" : e.key;
        keyBtn.style.borderColor = "var(--border)";
        document.removeEventListener("keydown", capture, {capture:true});
        if (callManager.isInCall()) callManager.refreshPTT();
      }
      document.addEventListener("keydown", capture, {capture:true});
    };
    keyRow.append(keyLW, keyBtn); pttSec.appendChild(keyRow); body.appendChild(pttSec);

    // Interface
    body.appendChild(_section("INTERFACE",
      _toggle("inlineMediaDefault", "Show media inline",     "Images/videos show without clicking expand"),
      _toggle("showReactions",      "Message reactions",     "Enable emoji reactions on messages")
    ));

    // Danger zone
    const dangerSec = document.createElement("div"); dangerSec.className = "settings-section"; dangerSec.style.borderColor = "var(--accent-red)";
    const dt = document.createElement("div"); dt.className = "settings-section-title"; dt.textContent = "DANGER ZONE"; dangerSec.appendChild(dt);
    const clearBtn = document.createElement("button"); clearBtn.className = "btn btn-sm";
    clearBtn.style.cssText = "background:var(--accent-red);color:#fff;width:100%;margin-top:4px";
    clearBtn.textContent = "🗑 Clear All Local Data";
    clearBtn.onclick = () => { if (!confirm("Delete all local data?")) return; accountManager.burnAccount(); settingsManager.clearAll(); localStorage.clear(); uiController.toast("All data cleared."); setTimeout(() => location.reload(), 1200); };
    const eBtn = document.createElement("button"); eBtn.className = "btn btn-sm";
    eBtn.style.cssText = "background:#7a1a1a;color:#fff;width:100%;margin-top:6px";
    eBtn.textContent = "☠ Emergency Disconnect";
    eBtn.onclick = () => peerManager.emergencyDisconnect();
    dangerSec.append(clearBtn, eBtn); body.appendChild(dangerSec);
  }

  document.getElementById("settings-close")?.addEventListener("click", close);
  return { open, close };
})();

/* ============================================================ UI CONTROLLER */
const uiController = (() => {
  const myIdEl     = document.getElementById("my-id");
  const peersEl    = document.getElementById("peers");
  const messagesEl = document.getElementById("messages");
  const toastEl    = document.getElementById("toast");
  const myAviEl    = document.getElementById("my-avatar");
  const myAviMini  = document.getElementById("my-avatar-mini");
  const myUserDisp = document.getElementById("my-username-display");
  const joinBtn    = document.getElementById("join-call");
  const leaveBtn   = document.getElementById("leave-call");
  const btnCam     = document.getElementById("btn-camera");
  const btnMute    = document.getElementById("btn-mute");
  const btnDeaf    = document.getElementById("btn-deafen");
  const btnNoise   = document.getElementById("btn-noise");
  const btnScreen  = document.getElementById("btn-screen");
  const fpBar      = document.getElementById("file-progress-bar");
  const fpLabel    = document.getElementById("fp-label");
  const fpFill     = document.getElementById("fp-fill");
  const fpPct      = document.getElementById("fp-pct");
  const lightbox   = document.getElementById("lightbox");
  const lbImg      = document.getElementById("lightbox-img");
  const _msgEls    = {};    // general chat: msgId → wrap
  const _dmMsgEls  = {};    // DM chat: msgId → wrap

  function toast(msg, dur = 2600) {
    toastEl.textContent = msg; toastEl.classList.remove("hidden"); toastEl.classList.add("visible");
    clearTimeout(toastEl._t); toastEl._t = setTimeout(() => { toastEl.classList.remove("visible"); toastEl.classList.add("hidden"); }, dur);
  }
  function _col(n) { const cols=["#5b6aee","#e8519c","#3ecf6e","#f0a03a","#e8484b","#00b0f4","#ff7043","#ab47bc"]; let h=0; for(let i=0;i<(n||"").length;i++) h=n.charCodeAt(i)+((h<<5)-h); return cols[Math.abs(h)%cols.length]; }
  function _makeInitialsUrl(name, sz = 64) {
    const c = document.createElement("canvas"); c.width = c.height = sz;
    const x = c.getContext("2d");
    x.beginPath(); x.arc(sz/2,sz/2,sz/2,0,Math.PI*2); x.fillStyle=_col(name); x.fill();
    x.fillStyle="#fff"; x.font=`700 ${Math.round(sz*.38)}px Outfit,sans-serif`; x.textAlign="center"; x.textBaseline="middle";
    x.fillText((name||"?").trim().split(/\s+/).map(w=>w[0]).join("").toUpperCase().slice(0,2), sz/2, sz/2+1); return c.toDataURL();
  }
  function _applyAvatar(el, name, url) { el.src = url || _makeInitialsUrl(name||"?"); }

  function initAvatarDisplay() {
    const acc = accountManager.get();
    _applyAvatar(myAviEl,   acc.username, acc.avatar);
    _applyAvatar(myAviMini, acc.username, acc.avatar);
    myUserDisp.textContent = acc.username || "Anonymous";
    const ui = document.getElementById("username"); if (ui) ui.value = acc.username || "";
    const kd = document.getElementById("friend-key-display"); if (kd) kd.textContent = acc.friendKey || "—";
  }
  function setMyId(id) { myIdEl.textContent = id; }

  function showProfilePopup(pid, anchorEl) {
    const pp = document.getElementById("profile-popup"); if (!pp) return;
    const profile  = peerManager.getProfile(pid);
    _applyAvatar(document.getElementById("pp-avatar"), profile.username||pid.slice(0,8), profile.avatar||null);
    document.getElementById("pp-name").textContent   = profile.username || "Unknown";
    document.getElementById("pp-id").textContent     = pid.slice(0,20) + (pid.length > 20 ? "…" : "");
    const isFriend = profile.friendKey && accountManager.isFriend(profile.friendKey);
    document.getElementById("pp-status").textContent = isFriend ? "✅ Friend" : "";
    const actions = document.getElementById("pp-actions"); actions.innerHTML = "";
    const dmBtn = document.createElement("button"); dmBtn.className = "btn btn-primary btn-sm"; dmBtn.textContent = "💬 Message";
    dmBtn.onclick = () => { pp.classList.add("hidden"); dmManager.open(pid); }; actions.appendChild(dmBtn);
    if (!isFriend) {
      const hasPending = friendsManager.hasOutboundRequest(pid);
      const frBtn = document.createElement("button"); frBtn.className = "btn btn-secondary btn-sm";
      frBtn.textContent = hasPending ? "⏳ Requested" : "➕ Add Friend"; frBtn.disabled = hasPending;
      frBtn.onclick = () => { friendsManager.sendRequest(pid); frBtn.textContent = "⏳ Requested"; frBtn.disabled = true; };
      actions.appendChild(frBtn);
    }
    const rect = anchorEl?.getBoundingClientRect();
    if (rect) { const top = Math.min(rect.bottom+8, window.innerHeight-280); pp.style.top=top+"px"; pp.style.left=Math.min(rect.left, window.innerWidth-280)+"px"; }
    pp.classList.remove("hidden");
  }

  function updatePeerList(conns, profiles) {
    const ids = Object.keys(conns);
    const cnt = document.getElementById("peer-count"); if (cnt) cnt.textContent = ids.length;

    // Check if the peer set has changed — if not, just update existing items in place
    const existingItems = Array.from(peersEl.querySelectorAll(".peer-item"));
    const existingIds   = existingItems.map(el => el.dataset.peer);
    const sameSet = ids.length === existingIds.length && ids.every(id => existingIds.includes(id));

    if (sameSet) {
      // Fast path: just update avatar/name on existing DOM nodes
      ids.forEach(id => {
        const item = peersEl.querySelector(`.peer-item[data-peer="${id}"]`); if (!item) return;
        const p    = profiles[id] || {};
        const name = p.username || id.slice(0,10);
        const img  = item.querySelector(".peer-avatar"); if (img) _applyAvatar(img, name, p.avatar||null);
        const lbl  = item.querySelector("span:not(.dm-badge):not(.notif-dot)"); if (lbl) { lbl.textContent = name; lbl.title = id; }
      });
      return;
    }

    // Full rebuild needed (peers joined or left)
    peersEl.innerHTML = "";
    if (!ids.length) { peersEl.innerHTML = '<span class="empty-peers">No peers yet</span>'; return; }
    ids.forEach(id => {
      const p    = profiles[id] || {}; const name = p.username || id.slice(0,10);
      const item = document.createElement("div"); item.className = "peer-item"; item.dataset.peer = id;
      const img  = document.createElement("img"); img.className = "peer-avatar"; _applyAvatar(img, name, p.avatar||null);
      img.onclick  = e => { e.stopPropagation(); showProfilePopup(id, img); };
      const lbl  = document.createElement("span"); lbl.textContent = name; lbl.title = id; lbl.style.flex = "1";
      lbl.onclick = e => { e.stopPropagation(); showProfilePopup(id, lbl); };
      const dm   = document.createElement("span"); dm.className = "dm-badge"; dm.textContent = "DM →";
      item.append(img, lbl, dm);
      item.addEventListener("click", () => { item.querySelector(".notif-dot")?.remove(); dmManager.open(id); });
      peersEl.appendChild(item);
    });
  }

  function appendMessage({user, text, avatar, isSelf, msgId}) {
    _appendMsgEl(messagesEl, {user, text, avatar, isSelf, msgId});
    emojiManager.renderCustomEmojis(messagesEl);
  }

  function _appendMsgEl(container, {user, text, avatar, isSelf, isDM, msgId}) {
    const wrap = document.createElement("div"); wrap.className = "message";
    if (msgId) {
      wrap.dataset.msgId = msgId;
      // Store in the right map so reactions/edits target the correct element
      if (isDM || container === document.getElementById("dm-messages")) {
        _dmMsgEls[msgId] = wrap;
      } else {
        _msgEls[msgId] = wrap;
      }
    }
    const avi = document.createElement("img"); avi.className = "msg-avatar"; _applyAvatar(avi, user, avatar);
    avi.onclick = () => { if (avatar) openLightbox(avatar); };
    const right = document.createElement("div"); right.className = "msg-right";
    const hdr   = document.createElement("div"); hdr.className = "msg-header";
    const uEl   = document.createElement("span"); uEl.className = "username" + (isSelf?" self":"") + (isDM?" dm-tag":"");
    uEl.textContent = user + (isDM ? " 🔒" : "");
    if (!isSelf) { uEl.style.cursor = "pointer"; uEl.onclick = e => { const pid = Object.keys(peerManager.getConnections()).find(id => peerManager.getProfile(id).username === user); if (pid) showProfilePopup(pid, uEl); }; }
    const tEl = document.createElement("span"); tEl.className = "msg-time"; tEl.textContent = new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
    hdr.append(uEl, tEl);
    const body = document.createElement("div"); body.className = "msg-text"; body.innerHTML = embedRenderer.parseLinks(_escapeHtml(text));
    right.append(hdr, body);

    // Inline media embeds with toggle
    const showInline = settingsManager.get("inlineMediaDefault");
    embedRenderer.extractUrls(text).forEach(url => {
      const embed = embedRenderer.buildEmbed(url); if (!embed) return;
      if (!showInline) {
        embed.style.display = "none";
        const tb = document.createElement("button"); tb.className = "media-toggle-btn"; tb.textContent = "▶ Show media";
        let shown = false; tb.onclick = () => { shown=!shown; embed.style.display=shown?"block":"none"; tb.textContent=shown?"▼ Hide media":"▶ Show media"; };
        right.append(tb, embed);
      } else right.appendChild(embed);
    });

    // Edit button for own messages
    if (msgId && isSelf) {
      const actions = document.createElement("div"); actions.className = "msg-actions";
      const editBtn = document.createElement("button"); editBtn.className = "msg-action-btn"; editBtn.textContent = "✏"; editBtn.title = "Edit";
      editBtn.onclick = () => {
        const newText = prompt("Edit message:", text); if (newText === null || newText === text) return;
        body.innerHTML = embedRenderer.parseLinks(_escapeHtml(newText));
        let el = hdr.querySelector(".msg-edited");
        if (!el) { el = document.createElement("span"); el.className = "msg-edited"; el.textContent = "(edited)"; hdr.appendChild(el); }
        peerManager.broadcast({type:"message-edit", msgId, newText});
      };
      actions.appendChild(editBtn); wrap.appendChild(actions);
    }

    // Reaction row
    if (settingsManager.get("showReactions") && msgId) {
      const rr    = document.createElement("div"); rr.className = "msg-reactions"; rr.dataset.msgId = msgId;
      const addBtn = document.createElement("button"); addBtn.className = "add-reaction-btn"; addBtn.textContent = "＋"; addBtn.title = "React";
      addBtn.onclick = e => { e.stopPropagation(); _showReactionPicker(rr, addBtn, emoji => { _applyReaction(rr, emoji, true, msgId); peerManager.broadcast({type:"reaction",msgId,emoji,add:true}); }); };
      rr.appendChild(addBtn); right.appendChild(rr);
    }

    wrap.append(avi, right); container.appendChild(wrap); container.scrollTop = container.scrollHeight;
  }

  function _showReactionPicker(anchor, triggerBtn, onPick) {
    document.querySelectorAll(".reaction-picker-popup").forEach(p => p.remove());
    const QUICK = ["👍","👎","❤️","😂","😮","😢","🔥","🎉","✅","💯","🤔","👀","😎","🥰","😡","🙏"];
    const popup = document.createElement("div"); popup.className = "reaction-picker-popup";
    QUICK.forEach(e => {
      const btn = document.createElement("span"); btn.className = "emoji-item rp-item"; btn.textContent = e;
      btn.onclick = ev => { ev.stopPropagation(); popup.remove(); onPick(e); }; popup.appendChild(btn);
    });
    const rect = triggerBtn.getBoundingClientRect();
    popup.style.cssText = `position:fixed;top:${rect.bottom+4}px;left:${Math.min(rect.left,window.innerWidth-220)}px;z-index:3000`;
    document.body.appendChild(popup);
    function close(e) { if (!popup.contains(e.target) && e.target !== triggerBtn) { popup.remove(); document.removeEventListener("click", close, {capture:true}); } }
    setTimeout(() => document.addEventListener("click", close, {capture:true}), 10);
  }

  function editMessage(msgId, newText) {
    // Check both general and DM maps
    const wrap = _msgEls[msgId] || _dmMsgEls[msgId]; if (!wrap) return;
    const body = wrap.querySelector(".msg-text"); if (!body) return;
    body.innerHTML = embedRenderer.parseLinks(_escapeHtml(newText));
    const hdr = wrap.querySelector(".msg-header"); if (!hdr) return;
    let el = hdr.querySelector(".msg-edited");
    if (!el) { el = document.createElement("span"); el.className = "msg-edited"; el.textContent = "(edited)"; hdr.appendChild(el); }
  }

  function handleReaction(data) {
    const wrap = _msgEls[data.msgId] || _dmMsgEls[data.msgId]; if (!wrap) return;
    const rr   = wrap.querySelector(".msg-reactions"); if (!rr) return;
    _applyReaction(rr, data.emoji, false, data.msgId);
  }

  function _applyReaction(rr, emoji, isSelf, msgId) {
    let pill = rr.querySelector(`[data-emoji="${CSS.escape(emoji)}"]`);
    if (pill) {
      const cnt = pill.querySelector(".reaction-count"); cnt.textContent = parseInt(cnt.textContent||"1") + 1;
      if (isSelf) pill.classList.add("reacted");
    } else {
      pill = document.createElement("span"); pill.className = "reaction-pill" + (isSelf ? " reacted" : ""); pill.dataset.emoji = emoji;
      const es = document.createElement("span"); es.textContent = emoji;
      const cnt = document.createElement("span"); cnt.className = "reaction-count"; cnt.textContent = "1";
      pill.append(es, cnt);
      rr.insertBefore(pill, rr.querySelector(".add-reaction-btn")||null);
      pill.onclick = () => { cnt.textContent = parseInt(cnt.textContent||"1") + 1; pill.classList.add("reacted"); peerManager.broadcast({type:"reaction",msgId,emoji,add:true}); };
    }
  }

  function appendSystemMessage(text) {
    const wrap = document.createElement("div"); wrap.className = "message";
    const sys  = document.createElement("div"); sys.className = "msg-system"; sys.textContent = text;
    wrap.appendChild(sys); messagesEl.appendChild(wrap); messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendFileMessage(user, name, size, blob, avatar, senderPeer, opts = {}) {
    const wrap = document.createElement("div"); wrap.className = "message";
    const avi  = document.createElement("img"); avi.className = "msg-avatar"; _applyAvatar(avi, user, avatar);
    const right = document.createElement("div"); right.className = "msg-right";
    const hdr   = document.createElement("div"); hdr.className = "msg-header";
    const uEl   = document.createElement("span"); uEl.className = "username"; uEl.textContent = user;
    const tEl   = document.createElement("span"); tEl.className = "msg-time"; tEl.textContent = new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    hdr.append(uEl, tEl);
    const isImg = /\.(jpe?g|png|gif|webp|svg|avif)$/i.test(name);
    const isVid = /\.(mp4|webm|ogg)$/i.test(name);
    const _sz   = b => { if(!b)return"";if(b<1024)return b+" B";if(b<1048576)return(b/1024).toFixed(1)+" KB";return(b/1048576).toFixed(1)+" MB"; };
    const {oneTime=false, spoiler=false, expiry=0} = opts;

    function _dlBtn(b2, n2) {
      if (oneTime) return null;
      const btn = document.createElement("button"); btn.className = "media-dl-btn"; btn.textContent = "↓ Download";
      btn.onclick = async () => { btn.disabled=true; btn.textContent="Requesting…"; const ok=await filePermissionManager.requestPermission(senderPeer,b2,n2); if(ok){filePermissionManager.executeDownload(b2,n2);btn.textContent="✓ Done";}else{btn.disabled=false;btn.textContent="↓ Download";} };
      return btn;
    }

    if (isImg || isVid) {
      const url   = URL.createObjectURL(blob);
      const mWrap = document.createElement("div"); mWrap.className = "media-protected-wrap";
      let el;
      if (isImg) {
        el = document.createElement("img"); el.className="msg-img"; el.alt=name; el.loading="lazy";
        if (!spoiler && !oneTime) el.src = url;
        el.onclick = () => { if(oneTime){if(el.dataset.viewed)return;el.dataset.viewed="1";el.src=url;el.onclick=()=>{};mWrap.classList.add("onetime-viewed");}else openLightbox(url); };
      } else {
        el = document.createElement("video"); el.style.cssText="max-width:320px;border-radius:10px;display:block;margin-top:6px";
        if (!spoiler) el.src = url; if (!oneTime) el.controls = true;
      }
      if (spoiler) {
        const sw = document.createElement("div"); sw.className="spoiler-wrap";
        const so = document.createElement("div"); so.className="spoiler-overlay"; so.innerHTML='<span>👁 SPOILER</span><span style="font-size:.62rem">Click to reveal</span>';
        so.onclick = () => { so.classList.add("revealed"); el.src=url; if(isVid)el.controls=true; }; sw.append(el,so); mWrap.appendChild(sw);
      } else if (oneTime) {
        const ow = document.createElement("div"); ow.className="spoiler-wrap";
        const oo = document.createElement("div"); oo.className="onetime-overlay"; oo.innerHTML='<span>👁 ONE-TIME VIEW</span><span style="font-size:.62rem">Click to view once</span>';
        if (isImg) el.src="";
        oo.onclick=()=>{oo.style.display="none";if(isImg)el.src=url;else{el.src=url;el.controls=true;}setTimeout(()=>{el.src="";URL.revokeObjectURL(url);},30000);}; ow.append(el,oo); mWrap.appendChild(ow);
      } else mWrap.appendChild(el);
      const dl = _dlBtn(blob, name); if (dl) mWrap.appendChild(dl);
      if (expiry > 0) {
        let rem=expiry; const exp=document.createElement("div"); exp.className="file-expiry";
        exp.innerHTML=`⏱ Expires in <span class="exp-counter">${_fmtTime(rem)}</span>`;
        const cc=exp.querySelector(".exp-counter");
        const tmr=setInterval(()=>{rem--;cc.textContent=_fmtTime(rem);if(rem<=0){clearInterval(tmr);mWrap.innerHTML='<span style="font-family:var(--font-mono);font-size:.7rem;color:var(--accent-red)">⌛ File expired</span>';URL.revokeObjectURL(url);}},1000);
        mWrap.appendChild(exp);
      }
      right.append(hdr, mWrap);
    } else {
      const row = document.createElement("div"); row.className="msg-file";
      row.innerHTML=`<span>📄</span><span class="file-name">${_escapeHtml(name)}</span><span class="file-size">${_sz(size)}</span>`;
      if (!oneTime) {
        const dl=document.createElement("span"); dl.className="file-hint"; dl.textContent="↓"; dl.style.cursor="pointer";
        dl.onclick=async()=>{dl.textContent="…";const ok=await filePermissionManager.requestPermission(senderPeer,blob,name);dl.textContent=ok?"✓":"↓";if(ok)filePermissionManager.executeDownload(blob,name);};
        row.appendChild(dl);
      }
      if (expiry > 0) {
        let rem=expiry; const exp=document.createElement("div"); exp.className="file-expiry";
        exp.innerHTML=`⏱ <span class="exp-counter">${_fmtTime(rem)}</span>`;
        const cc=exp.querySelector(".exp-counter");
        const tmr=setInterval(()=>{rem--;cc.textContent=_fmtTime(rem);if(rem<=0){clearInterval(tmr);row.innerHTML='<span style="font-family:var(--font-mono);font-size:.7rem;color:var(--accent-red)">⌛ File expired</span>';}},1000);
        right.append(hdr, row, exp);
      } else right.append(hdr, row);
    }
    wrap.append(avi, right); messagesEl.appendChild(wrap); messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function _fmtTime(s) { if(s<=0)return"0s";if(s<60)return s+"s";return Math.floor(s/60)+"m "+(s%60)+"s"; }
  function _escapeHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

  function updateCallUI(inCall, camOn, muted, deafened, screen) {
    joinBtn.disabled = inCall; leaveBtn.disabled = !inCall;
    leaveBtn.classList.toggle("in-call",     inCall);
    leaveBtn.classList.toggle("not-in-call", !inCall);
    leaveBtn.innerHTML = inCall ? '<span>📵</span> Leave' : '<span>🔌</span> Leave';
    [btnCam, btnMute, btnDeaf, btnNoise, btnScreen].forEach(b => b.disabled = !inCall);
    btnCam.querySelector("small").textContent  = camOn ? "Cam On" : "Cam Off"; btnCam.classList.toggle("active", !camOn && inCall);
    btnMute.querySelector("span").textContent  = muted    ? "🚫" : "🎙"; btnMute.querySelector("small").textContent  = muted    ? "Unmute" : "Mute";    btnMute.classList.toggle("active",   muted);
    btnDeaf.querySelector("span").textContent  = deafened ? "🔇" : "🔊"; btnDeaf.querySelector("small").textContent  = deafened ? "Undeaf"  : "Deaf";   btnDeaf.classList.toggle("active",   deafened);
    const ni = settingsManager.get("voiceIsolation"); btnNoise.classList.toggle("active", !!ni && inCall); btnNoise.querySelector("small").textContent = ni ? "Noise✓" : "Noise";
    btnScreen.querySelector("small").textContent = screen ? "Stop" : "Share"; btnScreen.classList.toggle("screen-active", screen);
    const pttBtn = document.getElementById("ptt-btn"); if (pttBtn) { pttBtn.disabled = !inCall; pttBtn.classList.toggle("active", inCall && settingsManager.get("pushToTalk")); }
  }

  function setFileProgress(show, label = "", pct = 0) { fpBar.classList.toggle("hidden", !show); if(show){fpLabel.textContent=label;fpFill.style.width=pct+"%";fpPct.textContent=pct+"%";} }
  function openLightbox(src) { lbImg.src = src; lightbox.classList.remove("hidden"); }

  return { toast, initAvatarDisplay, setMyId, showProfilePopup, updatePeerList,
           appendMessage, appendSystemMessage, appendFileMessage, editMessage, handleReaction,
           updateCallUI, setFileProgress, openLightbox, _applyAvatar, _appendMsgEl, _escapeHtml };
})();

/* ============================================================ FILE SEND DIALOG */
function showFileSendDialog(file, callback) {
  const dlg = document.getElementById("file-confirm-dialog");
  document.getElementById("fcd-filename").textContent = file.name + " (" + _szGlobal(file.size) + ")";
  document.getElementById("fcd-onetime").checked = false;
  document.getElementById("fcd-spoiler").checked = false;
  document.getElementById("fcd-expiry").value    = "0";
  const pv = document.getElementById("fcd-preview"); pv.innerHTML = "";
  if (file.type.startsWith("image/")) {
    const img = document.createElement("img"); img.style.cssText = "max-width:200px;max-height:120px;border-radius:8px;object-fit:cover";
    const url = URL.createObjectURL(file); img.src = url; pv.appendChild(img); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  dlg.classList.remove("hidden");
  document.getElementById("fcd-send").onclick = () => {
    dlg.classList.add("hidden");
    callback({
      oneTime: document.getElementById("fcd-onetime").checked,
      spoiler: document.getElementById("fcd-spoiler").checked,
      expiry:  parseInt(document.getElementById("fcd-expiry").value) || 0
    });
  };
  document.getElementById("fcd-cancel").onclick = () => dlg.classList.add("hidden");
}
function _szGlobal(b) { if(!b)return"";if(b<1024)return b+" B";if(b<1048576)return(b/1024).toFixed(1)+" KB";return(b/1048576).toFixed(1)+" MB"; }

/* ============================================================ EVENT WIRING */
(function wireEvents() {
  function _nav(active) {
    ["nav-main","nav-account","nav-friends","nav-settings","nav-dms"].forEach(id => document.getElementById(id)?.classList.remove("active"));
    ["main-panel","account-panel","friends-panel","dms-panel"].forEach(id => document.getElementById(id)?.classList.add("hidden"));
    document.getElementById("settings-panel")?.classList.add("hidden");
    document.getElementById(active)?.classList.add("active");
  }

  document.getElementById("nav-main")?.addEventListener("click", () => {
    _nav("nav-main"); document.getElementById("main-panel")?.classList.remove("hidden");
    if (dmManager.getActivePid()) dmManager.closeActiveDM();
  });
  document.getElementById("nav-dms")?.addEventListener("click", () => {
    _nav("nav-dms"); document.getElementById("dms-panel")?.classList.remove("hidden");
    document.getElementById("nav-dms-badge")?.classList.add("hidden");
    dmManager._renderConvList();
  });
  document.getElementById("nav-account")?.addEventListener("click", () => {
    _nav("nav-account"); document.getElementById("account-panel")?.classList.remove("hidden");
  });
  document.getElementById("nav-friends")?.addEventListener("click", () => {
    _nav("nav-friends"); document.getElementById("friends-panel")?.classList.remove("hidden");
    friendsManager.renderFriends();
    document.getElementById("nav-friends-badge")?.classList.add("hidden");
  });
  document.getElementById("nav-settings")?.addEventListener("click", () => {
    document.getElementById("nav-settings").classList.add("active"); settingsUI.open();
  });

  // Profile popup close
  document.getElementById("pp-close")?.addEventListener("click", () => document.getElementById("profile-popup")?.classList.add("hidden"));
  document.addEventListener("click", e => {
    const pp = document.getElementById("profile-popup");
    if (pp && !pp.classList.contains("hidden") && !pp.contains(e.target)) pp.classList.add("hidden");
  });

  // Emergency
  document.getElementById("emergency-disconnect")?.addEventListener("click", () => {
    if (!confirm("☠ Emergency disconnect?")) return; peerManager.emergencyDisconnect();
  });

  // Copy ID
  document.getElementById("copy-id")?.addEventListener("click", () =>
    navigator.clipboard.writeText(document.getElementById("my-id").textContent).then(() => uiController.toast("Node ID copied!"))
  );

  // Room create / join
  document.getElementById("host")?.addEventListener("click", () => {
    const un = document.getElementById("username")?.value.trim();
    if (un) { accountManager.save({username:un}); uiController.initAvatarDisplay(); }
    uiController.appendSystemMessage("Room created — share your Node ID"); uiController.toast("Room ready!");
  });
  document.getElementById("join")?.addEventListener("click", () => {
    const un = document.getElementById("username")?.value.trim();
    if (un) { accountManager.save({username:un}); uiController.initAvatarDisplay(); }
    const hostId = document.getElementById("host-id").value.trim();
    if (!hostId) { uiController.toast("Paste a peer ID first."); return; }
    peerManager.connectTo(hostId); uiController.appendSystemMessage("Connecting to peer…");
  });
  document.getElementById("host-id")?.addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("join")?.click(); });

  // Username live preview
  document.getElementById("username")?.addEventListener("input", e => {
    const acc = accountManager.get();
    uiController._applyAvatar(document.getElementById("my-avatar"),      e.target.value||"?", acc.avatar);
    uiController._applyAvatar(document.getElementById("my-avatar-mini"), e.target.value||"?", acc.avatar);
    document.getElementById("my-username-display").textContent = e.target.value || "Anonymous";
  });

  // Account
  document.getElementById("acc-save")?.addEventListener("click", () => {
    const un = document.getElementById("username")?.value.trim() || "Anonymous";
    accountManager.save({username:un}); uiController.initAvatarDisplay(); uiController.toast("Account saved!");
    peerManager.broadcast({type:"profile",user:un,avatar:accountManager.get().avatar,friendKey:accountManager.get().friendKey});
  });
  document.getElementById("acc-export")?.addEventListener("click", () => accountManager.exportJSON());
  document.getElementById("acc-import")?.addEventListener("change", async function() {
    const f = this.files[0]; if (!f) return; this.value = "";
    try { const acc = await accountManager.importJSON(f); uiController.initAvatarDisplay(); emojiManager.init(); uiController.toast(`Account loaded: ${acc.username}`); }
    catch (e) { uiController.toast("Import failed: " + e.message); }
  });
  document.getElementById("acc-burn")?.addEventListener("click", () => {
    if (!confirm("🔥 Burn account? Deletes all local data.")) return;
    accountManager.burnAccount(); settingsManager.clearAll(); uiController.initAvatarDisplay(); friendsManager.renderFriends(); uiController.toast("Account burned.");
  });

  // Avatar uploads
  function _handleAvatarFile(file) {
    if (!file) return;
    const r = new FileReader(); r.onload = e => {
      const img = new Image(); img.src = e.target.result; img.onload = () => {
        const sz=64, c=document.createElement("canvas"); c.width=c.height=sz;
        const x=c.getContext("2d"); x.beginPath(); x.arc(sz/2,sz/2,sz/2,0,Math.PI*2); x.clip();
        const sc=Math.max(sz/img.width,sz/img.height), w=img.width*sc, h=img.height*sc;
        x.drawImage(img,(sz-w)/2,(sz-h)/2,w,h);
        const avatar=c.toDataURL("image/jpeg",.75);
        accountManager.save({avatar}); uiController.initAvatarDisplay();
        peerManager.broadcast({type:"profile",user:accountManager.get().username,avatar,friendKey:accountManager.get().friendKey});
        uiController.toast("Avatar updated!");
      };
    }; r.readAsDataURL(file);
  }
  document.getElementById("avatar-input")?.addEventListener("change",      function() { _handleAvatarFile(this.files[0]); this.value=""; });
  document.getElementById("avatar-input-mini")?.addEventListener("change", function() { _handleAvatarFile(this.files[0]); this.value=""; });

  // Voice controls
  document.getElementById("join-call")?.addEventListener("click",  () => callManager.startCall());
  document.getElementById("leave-call")?.addEventListener("click", () => callManager.leaveCall());
  document.getElementById("btn-camera")?.addEventListener("click",  () => callManager.toggleCamera());
  document.getElementById("btn-mute")?.addEventListener("click",    () => callManager.toggleMute());
  document.getElementById("btn-deafen")?.addEventListener("click",  () => callManager.toggleDeafen());
  document.getElementById("btn-noise")?.addEventListener("click",   () => callManager.toggleNoise());
  document.getElementById("btn-screen")?.addEventListener("click",  () => callManager.toggleScreen());
  document.getElementById("ptt-btn")?.addEventListener("click", () => {
    settingsManager.set("pushToTalk", !settingsManager.get("pushToTalk"));
    uiController.updateCallUI(callManager.isInCall(), false, false, false, false);
    uiController.toast(settingsManager.get("pushToTalk") ? "PTT ON (hold bound key)" : "PTT OFF");
    if (callManager.isInCall()) callManager.refreshPTT();
  });

  // Chat send
  document.getElementById("send")?.addEventListener("click", _sendChat);
  document.getElementById("message")?.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); _sendChat(); } });
  function _sendChat() {
  const input = document.getElementById("message");
  const text = input.value.trim();
  if (!text) return;

  input.value = "";

  const acc   = accountManager.get();
  const msgId = crypto.randomUUID();
  const ts    = Date.now();

  // local render
  uiController.appendMessage({
    user: acc.username,
    text,
    avatar: acc.avatar,
    isSelf: true,
    msgId,
    ts
  });

  // broadcast to mesh
  peerManager.broadcast({
    type: "message",
    channel: "general",
    user: acc.username,
    text,
    msgId,
    ts
  });
}

  // File send
  function _sendWithDialog(file) { showFileSendDialog(file, opts => fileTransferManager.sendFile(file, opts)); }
  document.getElementById("file-input")?.addEventListener("change", function() { const f=this.files[0];if(!f)return;this.value="";_sendWithDialog(f); });
  document.getElementById("file-input-chat")?.addEventListener("change", function() { const f=this.files[0];if(!f)return;this.value="";_sendWithDialog(f); });

  // Lightbox
  document.querySelector(".lightbox-bg")?.addEventListener("click",    () => document.getElementById("lightbox").classList.add("hidden"));
  document.querySelector(".lightbox-close")?.addEventListener("click", () => document.getElementById("lightbox").classList.add("hidden"));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      document.getElementById("lightbox")?.classList.add("hidden");
      document.querySelectorAll(".reaction-picker-popup").forEach(p => p.remove());
    }
  });
})();

/* ============================================================ INIT */
(function init() {
  settingsManager.load();
  accountManager.load();
  peerManager.init();
  emojiManager.init();
  mediaProtectionManager.init();
  uiController.updateCallUI(false, false, false, false, false);
  uiController.appendSystemMessage("NexTalk started — create a room or join a peer");
})();