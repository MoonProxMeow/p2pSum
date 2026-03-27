/* ============================================================
   NexTalk — P2P E2EE Chat  v3.0
   Security: ECDH + ECDSA key pairs, per-message key ratchet,
             replay protection, message signing, padded payloads.
   Call fix: deferred callPeer, proper stream lifecycle,
             clean re-negotiation on screen-share stop.
============================================================ */
"use strict";

/* ============================================================
   SOURCE PROTECTION
============================================================ */
(function sourceProtection() {
  document.addEventListener("contextmenu", e => e.preventDefault());
  document.addEventListener("keydown", e => {
    const c = e.ctrlKey || e.metaKey;
    if (c && /^[suSU]$/.test(e.key)) { e.preventDefault(); return false; }
    if (e.key === "F12") { e.preventDefault(); return false; }
    if (c && e.shiftKey && /^[ijIJ]$/.test(e.key)) { e.preventDefault(); return false; }
  });
  const footer = document.createElement("div");
  footer.style.cssText = "position:fixed;bottom:4px;right:8px;font-size:9px;opacity:.08;pointer-events:none;z-index:9999;font-family:monospace;user-select:none";
  footer.textContent = "© NexTalk P2P 2025 — Unauthorized reproduction prohibited";
  document.body.appendChild(footer);
})();

/* ============================================================
   CONSTANTS
============================================================ */
const CHUNK_SIZE = 12000;
const EMOJI_CATEGORIES = {
  "Smileys": ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴","😵","🤯","🤠","🥳","😎","🤓","🧐","😕","😟","🙁","☹️","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖"],
  "People":  ["👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","💅","🤳","💪","🦾","🦵","🦶","👂","🦻","👃","🧠","🫀","🫁","🦷","🦴","👀","👁️","👅","👄","🫦"],
  "Nature":  ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐜","🦟","🦗","🌸","🌺","🌻","🌹","🌷","🌱","🌿","🍀","🌵","🌴","🌲","🍁","🍂","🍃","🌾","🍄","🌊","🌈","☀️","🌙","⭐","❄️","🌪️","🌬️","🌀"],
  "Food":    ["🍎","🍊","🍋","🍇","🍓","🍒","🍑","🥭","🍍","🥝","🍅","🥑","🍆","🥦","🌽","🥕","🧅","🧄","🥔","🍠","🥐","🥖","🥨","🧀","🥚","🍳","🥞","🧇","🥓","🍗","🍖","🥩","🌭","🍔","🍟","🍕","🥙","🥪","🥗","🍜","🍝","🍛","🍣","🍱","🍤","🍙","🍚","🍘","🍥","🥮","🍡","🧁","🎂","🍰","🍩","🍪","🍫","🍬","🍭","🍮","🍯","🍵","☕","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧃","🥤","🧋"],
  "Objects": ["💎","🔮","🧿","💡","🔦","🕯️","🪔","📱","💻","🖥️","🖨️","⌨️","🖱️","🖲️","💾","💿","📀","📷","📸","📹","🎥","📽️","🎞️","📞","☎️","📟","📠","📺","📻","🎙️","🎚️","🎛️","🧭","⏱️","⌚","📡","🔋","🔌","💰","💳","🔑","🗝️","🔒","🔓","🔨","🪓","⚔️","🛡️","🔧","🔩","⚙️","🗜️","🔬","🔭","📊","📈","📉"],
  "Symbols": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","✨","⚡","🔥","💫","🌟","💥","🎉","🎊","🎈","🎁","🏆","🥇","🎯","🎮","🕹️","🎲","♠️","♥️","♦️","♣️","🃏","🀄","🎴","🎭","🎨","🖼️","🎬","🎤","🎧","🎷","🎸","🎹","🥁","🎺","🎻","🪕","🎼","🎵","🎶","🎙️"]
};

/* ============================================================
   ACCOUNT MANAGER
============================================================ */
const accountManager = (() => {
  const STORAGE_KEY = "nextalk_account";
  const EMOJI_KEY   = "nextalk_custom_emojis";
  let _account = null;

  function _defaultAccount() {
    return { username: "Anonymous", avatar: null, preferences: {}, customEmojis: {} };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        delete p.peerId;
        _account = { ..._defaultAccount(), ...p };
      } else { _account = _defaultAccount(); }
    } catch { _account = _defaultAccount(); }
    return _account;
  }

  function save(updates = {}) {
    delete updates.peerId;
    Object.assign(_account, updates);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_account));
  }

  function get() { return _account || load(); }

  function exportJSON() {
    const data = { ..._account }; delete data.peerId;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = "nextalk-account.json"; a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const p = JSON.parse(e.target.result);
          delete p.peerId;
          _account = { ..._defaultAccount(), ...p };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(_account));
          if (p.customEmojis) localStorage.setItem(EMOJI_KEY, JSON.stringify(p.customEmojis));
          resolve(_account);
        } catch { reject(new Error("Invalid account file")); }
      };
      reader.readAsText(file);
    });
  }

  function saveCustomEmojis(emojis) { _account.customEmojis = emojis; save({ customEmojis: emojis }); }
  function getCustomEmojis() {
    try { return _account?.customEmojis || JSON.parse(localStorage.getItem(EMOJI_KEY) || "{}"); }
    catch { return {}; }
  }

  return { load, save, get, exportJSON, importJSON, saveCustomEmojis, getCustomEmojis };
})();

/* ============================================================
   ENCRYPTION MANAGER
   Security model:
   - ECDH P-256 for initial key agreement
   - ECDSA P-256 for message signing (authenticity)
   - Per-message key ratchet: each message derives a new AES-GCM
     key from the previous one via HKDF, providing forward secrecy
   - Replay protection: each peer tracks the last seen counter
   - Padded payloads: all messages padded to 256-byte boundary
============================================================ */
const encryptionManager = (() => {
  // ECDH key pair (key agreement)
  let _dhKeyPair   = null;
  // ECDSA key pair (message signing)
  let _sigKeyPair  = null;

  // Per-peer state
  const _sendState = {};  // peerId → { key: CryptoKey, counter: number }
  const _recvState = {};  // peerId → { key: CryptoKey, lastCounter: number }
  const _peerSigKeys = {}; // peerId → CryptoKey (their ECDSA public key)

  // -----------------------------------------------------------
  // Initialisation
  // -----------------------------------------------------------
  async function init() {
    [_dhKeyPair, _sigKeyPair] = await Promise.all([
      crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]),
      crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
    ]);
  }

  // Public key bytes for handshake: DH pub + sig pub (both raw, concatenated with lengths)
  async function getHandshakeBytes() {
    const [dh, sig] = await Promise.all([
      crypto.subtle.exportKey("raw", _dhKeyPair.publicKey),
      crypto.subtle.exportKey("raw", _sigKeyPair.publicKey)
    ]);
    return {
      dh:  Array.from(new Uint8Array(dh)),
      sig: Array.from(new Uint8Array(sig))
    };
  }

  // -----------------------------------------------------------
  // Key derivation from ECDH shared secret
  // -----------------------------------------------------------
  async function _deriveRootKey(remoteDhPubBytes) {
    const buf = new Uint8Array(remoteDhPubBytes).buffer;
    const remotePub = await crypto.subtle.importKey(
      "raw", buf, { name: "ECDH", namedCurve: "P-256" }, false, []
    );
    // Derive a root key material via ECDH
    return crypto.subtle.deriveKey(
      { name: "ECDH", public: remotePub },
      _dhKeyPair.privateKey,
      { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
    );
  }

  // -----------------------------------------------------------
  // Ratchet: derive next key from current key via HKDF
  // We export the raw key bytes and use them as HKDF input material.
  // -----------------------------------------------------------
  async function _ratchetKey(currentKey) {
    const raw = await crypto.subtle.exportKey("raw", currentKey);
    const baseKey = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(32),         // fixed salt — per-message IV provides randomness
        info: new TextEncoder().encode("NexTalk-ratchet-v1")
      },
      baseKey,
      { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
    );
  }

  // -----------------------------------------------------------
  // Store peer's ECDSA public key for verification
  // -----------------------------------------------------------
  async function setPeerSigKey(peerId, sigPubBytes) {
    _peerSigKeys[peerId] = await crypto.subtle.importKey(
      "raw", new Uint8Array(sigPubBytes),
      { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]
    );
  }

  // -----------------------------------------------------------
  // Set up symmetric session from ECDH handshake
  // -----------------------------------------------------------
  async function setSession(peerId, remoteDhPubBytes, remoteSigPubBytes) {
    const rootKey = await _deriveRootKey(remoteDhPubBytes);
    _sendState[peerId] = { key: rootKey, counter: 0 };
    // Derive a separate receive-direction key so both sides use different keys
    const raw = await crypto.subtle.exportKey("raw", rootKey);
    const baseKey = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
    const recvKey = await crypto.subtle.deriveKey(
      {
        name: "HKDF", hash: "SHA-256",
        salt: new Uint8Array(32),
        info: new TextEncoder().encode("NexTalk-recv-v1")
      },
      baseKey,
      { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
    );
    _recvState[peerId] = { key: recvKey, lastCounter: -1 };
    await setPeerSigKey(peerId, remoteSigPubBytes);
  }

  function hasSession(peerId) { return !!(_sendState[peerId] && _recvState[peerId]); }

  function removeSession(peerId) {
    delete _sendState[peerId];
    delete _recvState[peerId];
    delete _peerSigKeys[peerId];
  }

  // -----------------------------------------------------------
  // Padding: pad/unpad plaintext to nearest 256-byte boundary
  // Prevents size-based traffic analysis
  // -----------------------------------------------------------
  function _pad(bytes) {
    const block = 256;
    const total = Math.ceil((bytes.length + 2) / block) * block;
    const out   = new Uint8Array(total);
    const len   = bytes.length;
    out[0] = (len >> 8) & 0xff;
    out[1] = len & 0xff;
    out.set(bytes, 2);
    return out;
  }

  function _unpad(bytes) {
    const len = (bytes[0] << 8) | bytes[1];
    return bytes.slice(2, 2 + len);
  }

  // -----------------------------------------------------------
  // Encrypt: ratchet send key, encrypt with fresh IV, sign counter+ciphertext
  // -----------------------------------------------------------
  async function encrypt(peerId, obj) {
    const state = _sendState[peerId];
    if (!state) throw new Error("No send state for " + peerId);

    // Ratchet the key forward
    state.key = await _ratchetKey(state.key);
    const counter = state.counter++;

    const iv      = crypto.getRandomValues(new Uint8Array(12));
    const plain   = _pad(new TextEncoder().encode(JSON.stringify(obj)));
    const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, state.key, plain);
    const cipherBytes = new Uint8Array(cipherBuf);

    // Sign: counter (8 bytes big-endian) || iv || ciphertext
    const sigInput = new Uint8Array(8 + 12 + cipherBytes.length);
    const cv = new DataView(sigInput.buffer);
    cv.setUint32(0, 0); cv.setUint32(4, counter);   // 64-bit counter
    sigInput.set(iv, 8);
    sigInput.set(cipherBytes, 20);

    const sigBuf = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" }, _sigKeyPair.privateKey, sigInput
    );

    return {
      iv:      btoa(String.fromCharCode(...iv)),
      data:    btoa(String.fromCharCode(...cipherBytes)),
      sig:     btoa(String.fromCharCode(...new Uint8Array(sigBuf))),
      counter
    };
  }

  // -----------------------------------------------------------
  // Decrypt: verify signature, check replay, ratchet recv key
  // -----------------------------------------------------------
  async function decrypt(peerId, payload) {
    const state   = _recvState[peerId];
    const sigKey  = _peerSigKeys[peerId];
    if (!state || !sigKey) throw new Error("No recv state for " + peerId);

    const { iv: ivB64, data: dataB64, sig: sigB64, counter } = payload;

    // Replay protection
    if (typeof counter !== "number" || counter <= state.lastCounter) {
      throw new Error(`Replay detected: counter=${counter} last=${state.lastCounter}`);
    }

    const iv          = Uint8Array.from(atob(ivB64),   c => c.charCodeAt(0));
    const cipherBytes = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0));
    const sigBytes    = Uint8Array.from(atob(sigB64),  c => c.charCodeAt(0));

    // Reconstruct sig input and verify
    const sigInput = new Uint8Array(8 + 12 + cipherBytes.length);
    const cv = new DataView(sigInput.buffer);
    cv.setUint32(0, 0); cv.setUint32(4, counter);
    sigInput.set(iv, 8); sigInput.set(cipherBytes, 20);

    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" }, sigKey, sigBytes, sigInput
    );
    if (!valid) throw new Error("Signature verification failed");

    // Ratchet receive key to match sender's counter
    // Fast-forward if we missed messages (gap tolerance: up to 50)
    const gap = counter - state.lastCounter - 1;
    if (gap > 50) throw new Error("Counter gap too large: possible attack");
    for (let i = 0; i <= gap; i++) {
      state.key = await _ratchetKey(state.key);
    }
    state.lastCounter = counter;

    const decBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, state.key, cipherBytes);
    const unpadded = _unpad(new Uint8Array(decBuf));
    return JSON.parse(new TextDecoder().decode(unpadded));
  }

  return { init, getHandshakeBytes, setSession, hasSession, removeSession, encrypt, decrypt };
})();

/* ============================================================
   FILE PERMISSION MANAGER
============================================================ */
const filePermissionManager = (() => {
  const _pending = {};

  function _esc(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  function handleRequest(fromPeer, { tokenId, fileName }) {
    const name = peerManager.getProfile(fromPeer).username || fromPeer.slice(0,8);
    const overlay = document.createElement("div");
    overlay.className = "perm-dialog-overlay";
    overlay.innerHTML = `<div class="perm-dialog">
      <div class="perm-icon">📥</div>
      <div class="perm-title">Download Request</div>
      <div class="perm-msg"><strong>${_esc(name)}</strong> wants to download<br><em>${_esc(fileName)}</em></div>
      <div class="perm-btns">
        <button class="btn btn-primary btn-sm perm-allow">Allow</button>
        <button class="btn perm-deny" style="background:var(--accent-red);color:#fff">Deny</button>
      </div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector(".perm-allow").onclick = () => {
      overlay.remove();
      peerManager.sendTo(fromPeer, { type: "download-response", tokenId, approved: true });
    };
    overlay.querySelector(".perm-deny").onclick = () => {
      overlay.remove();
      peerManager.sendTo(fromPeer, { type: "download-response", tokenId, approved: false });
    };
  }

  function handleResponse({ tokenId, approved }) {
    const p = _pending[tokenId]; if (!p) return;
    delete _pending[tokenId];
    if (!approved) uiController.toast("Download denied by sender.");
    p.resolve(approved);
  }

  function requestPermission(senderPeerId, blob, name) {
    return new Promise(resolve => {
      const tokenId = crypto.randomUUID();
      _pending[tokenId] = { resolve };
      peerManager.sendTo(senderPeerId, { type: "download-request", tokenId, fileName: name });
      setTimeout(() => {
        if (_pending[tokenId]) { delete _pending[tokenId]; resolve(false); uiController.toast("Request timed out."); }
      }, 30000);
    });
  }

  function executeDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  return { handleRequest, handleResponse, requestPermission, executeDownload };
})();

/* ============================================================
   PEER MANAGER + MESH NETWORK
============================================================ */
const peerManager = (() => {
  let _peer = null;
  let _myId = null;
  const _connections   = {};
  const _peerProfiles  = {};
  const _pendingConns  = new Set();

  function init() {
    _peer = new Peer();
    _peer.on("open", async id => {
      _myId = id;
      uiController.setMyId(id);
      await encryptionManager.init();
      uiController.initAvatarDisplay();
    });
    _peer.on("connection", conn => _setupConn(conn));
    _peer.on("call", call => callManager.handleIncomingCall(call));
    _peer.on("error", e => console.error("Peer error:", e));
  }

  function getId()          { return _myId; }
  function getPeer()        { return _peer; }
  function getConnections() { return _connections; }
  function getProfile(pid)  { return _peerProfiles[pid] || { username: pid?.slice(0,8) || "?", avatar: null }; }

  function setProfile(pid, profile) {
    _peerProfiles[pid] = profile;
    uiController.updatePeerList(_connections, _peerProfiles);
    dmManager.updatePeerProfile(pid, profile);
  }

  function connectTo(peerId) {
    if (!peerId || peerId === _myId) return;
    if (_connections[peerId] || _pendingConns.has(peerId)) return;
    _pendingConns.add(peerId);
    _setupConn(_peer.connect(peerId, { reliable: true }));
  }

  function _setupConn(conn) {
    if (_connections[conn.peer]) { conn.close(); return; }
    _connections[conn.peer] = conn;
    uiController.updatePeerList(_connections, _peerProfiles);

    conn.on("open", async () => {
      _pendingConns.delete(conn.peer);
      // Send ECDH + ECDSA public keys together
      const hs = await encryptionManager.getHandshakeBytes();
      conn.send({ type: "ecdh-hello", dh: hs.dh, sig: hs.sig });
    });

    conn.on("data", async raw => {
      try { await _handleRaw(conn, raw); }
      catch (e) { console.warn("Data error:", e.message); }
    });

    conn.on("close", () => _teardown(conn.peer));
    conn.on("error", e => { console.error("Conn error:", e); _teardown(conn.peer); });
  }

  async function _handleRaw(conn, raw) {
    const pid = conn.peer;

    // ECDH + ECDSA handshake (plaintext)
    if (raw.type === "ecdh-hello") {
      await encryptionManager.setSession(pid, raw.dh, raw.sig);

      if (!raw._reply) {
        const hs = await encryptionManager.getHandshakeBytes();
        conn.send({ type: "ecdh-hello", dh: hs.dh, sig: hs.sig, _reply: true });
      }

      // Send profile over encrypted channel
      await _sendEnc(conn, {
        type: "profile",
        user: accountManager.get().username,
        avatar: accountManager.get().avatar
      });

      // Mesh discovery
      const known = Object.keys(_connections).filter(p => p !== pid);
      if (known.length) await _sendEnc(conn, { type: "mesh-peers", peers: known });

      // If already in a call, ring the new peer (deferred so stream is ready)
      if (callManager.isInCall()) {
        setTimeout(() => callManager.callPeer(pid), 400);
      }
      return;
    }

    if (raw.encrypted) {
      if (!encryptionManager.hasSession(pid)) return;
      const obj = await encryptionManager.decrypt(pid, raw.payload);
      _dispatch(conn, obj);
      return;
    }

    _dispatch(conn, raw);
  }

  function _dispatch(conn, data) {
    const pid = conn.peer;
    switch (data.type) {
      case "profile":
        setProfile(pid, { username: data.user || "Peer", avatar: data.avatar || null });
        break;
      case "mesh-peers":
        if (Array.isArray(data.peers)) data.peers.forEach(id => connectTo(id));
        break;
      case "message":
        uiController.appendMessage({ user: data.user, text: data.text, avatar: _peerProfiles[pid]?.avatar || null, isSelf: false });
        break;
      case "dm":
        dmManager.receiveMessage(pid, data);
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
    }
  }

  function _teardown(pid) {
    delete _connections[pid];
    _pendingConns.delete(pid);
    encryptionManager.removeSession(pid);
    uiController.updatePeerList(_connections, _peerProfiles);
    uiController.appendSystemMessage("A peer left the mesh");
    callManager.removePeerCall(pid);
  }

  async function _sendEnc(conn, obj) {
    if (!conn.open || !encryptionManager.hasSession(conn.peer)) return;
    const payload = await encryptionManager.encrypt(conn.peer, obj);
    conn.send({ encrypted: true, payload });
  }

  async function broadcast(obj, exclude = null) {
    for (const [pid, conn] of Object.entries(_connections)) {
      if (pid !== exclude && conn.open && encryptionManager.hasSession(pid))
        await _sendEnc(conn, obj);
    }
  }

  async function sendTo(peerId, obj) {
    const conn = _connections[peerId];
    if (conn) await _sendEnc(conn, obj);
  }

  return { init, getId, getPeer, getConnections, getProfile, setProfile, connectTo, broadcast, sendTo };
})();

/* ============================================================
   CALL MANAGER
   Key fixes vs v2:
   1. _addVideoEl always updates srcObject — no silent no-op on
      existing elements.
   2. handleIncomingCall does NOT set _inCall if we have no local
      stream; it just shows the remote video.
   3. stopScreen properly rebuilds _localStream in-place (replaces
      video track) rather than constructing a new MediaStream object,
      so existing peer RTCPeerConnections stay bound to the same stream.
   4. _broadcastCallState is only called after awaiting encryption
      readiness — deferred via setTimeout(0) after startCall.
   5. callPeer guards against calling before our stream is ready.
============================================================ */
const callManager = (() => {
  const _calls     = {};   // peerId → MediaConnection
  let _localStream = null;
  let _inCall      = false;
  let _cameraOn    = false;
  let _muted       = false;
  let _deafened    = false;
  let _screenShare = false;
  let _fsEl        = null;

  function isInCall() { return _inCall; }
  function getLocalStream() { return _localStream; }

  // -----------------------------------------------------------------
  // START CALL
  // -----------------------------------------------------------------
  async function startCall() {
    if (_inCall) return;

    // Get audio+video (camera off by default; we disable video tracks below)
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
        video: true
      });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        uiController.toast("Microphone access denied.");
        return;
      }
    }

    _localStream = stream;
    _cameraOn    = false;
    _muted       = false;
    _deafened    = false;
    // Camera off by default
    _localStream.getVideoTracks().forEach(t => { t.enabled = false; });

    _inCall = true;
    uiController.updateCallUI(true, false, false, false, false);
    _addVideoEl("local", _localStream, true);

    // Ring all connected peers (async — sessions already established)
    const pids = Object.keys(peerManager.getConnections());
    for (const pid of pids) callPeer(pid);

    // Broadcast state after a tick to ensure encryption is warmed up
    setTimeout(_broadcastCallState, 100);
    uiController.toast("Joined voice.");
  }

  // -----------------------------------------------------------------
  // CALL ONE PEER
  // -----------------------------------------------------------------
  function callPeer(pid) {
    if (_calls[pid]) return;               // already called
    if (!_localStream) return;             // no stream yet
    const peer = peerManager.getPeer();
    if (!peer) return;
    const call = peer.call(pid, _localStream);
    if (!call) return;
    _setupCall(call);
  }

  // -----------------------------------------------------------------
  // INCOMING CALL
  // -----------------------------------------------------------------
  function handleIncomingCall(call) {
    // Prevent duplicate call objects for same peer
    if (_calls[call.peer]) {
      // Close old one and replace
      try { _calls[call.peer].close(); } catch {}
    }

    // Answer with our stream if in a call, else empty stream
    const answerStream = _localStream || new MediaStream();
    call.answer(answerStream);
    _setupCall(call);

    // If we weren't in a call, we're now passively in one — show controls
    if (!_inCall && _localStream) {
      _inCall = true;
      uiController.updateCallUI(true, _cameraOn, _muted, _deafened, _screenShare);
    }
  }

  // -----------------------------------------------------------------
  // SETUP A MEDIA CALL OBJECT
  // -----------------------------------------------------------------
  function _setupCall(call) {
    _calls[call.peer] = call;

    call.on("stream", stream => {
      // Always update — even if element already exists (re-negotiation)
      _addVideoEl(call.peer, stream, false);
    });

    call.on("close",  ()  => _removeVideoEl(call.peer));
    call.on("error",  e   => { console.error("Call error:", e); _removeVideoEl(call.peer); });
  }

  // -----------------------------------------------------------------
  // REMOVE A PEER'S CALL (called when peer disconnects)
  // -----------------------------------------------------------------
  function removePeerCall(pid) {
    if (_calls[pid]) {
      try { _calls[pid].close(); } catch {}
      delete _calls[pid];
    }
    _removeVideoEl(pid);
  }

  // -----------------------------------------------------------------
  // LEAVE CALL
  // -----------------------------------------------------------------
  function leaveCall() {
    if (_localStream) {
      _localStream.getTracks().forEach(t => t.stop());
      _localStream = null;
    }
    Object.values(_calls).forEach(c => { try { c.close(); } catch {} });
    Object.keys(_calls).forEach(k => delete _calls[k]);

    const vg = document.getElementById("video-grid");
    Array.from(vg.children).forEach(el => el.remove());
    vg.classList.add("hidden");

    if (_fsEl) { _fsEl.remove(); _fsEl = null; }

    _inCall = false; _cameraOn = false; _muted = false;
    _deafened = false; _screenShare = false;

    uiController.updateCallUI(false, false, false, false, false);
    _broadcastCallState();
    uiController.toast("Left voice.");
  }

  // -----------------------------------------------------------------
  // CONTROLS
  // -----------------------------------------------------------------
  function toggleCamera() {
    if (!_inCall || !_localStream) return;
    _cameraOn = !_cameraOn;
    _localStream.getVideoTracks().forEach(t => { t.enabled = _cameraOn; });
    uiController.updateCallUI(_inCall, _cameraOn, _muted, _deafened, _screenShare);
    _broadcastCallState();
  }

  function toggleMute() {
    if (!_inCall || !_localStream) return;
    _muted = !_muted;
    if (_deafened && !_muted) _deafened = false;  // unmuting clears deafen
    _localStream.getAudioTracks().forEach(t => { t.enabled = !_muted; });
    uiController.updateCallUI(_inCall, _cameraOn, _muted, _deafened, _screenShare);
    _broadcastCallState();
  }

  function toggleDeafen() {
    if (!_inCall || !_localStream) return;
    _deafened = !_deafened;
    if (_deafened) _muted = true;
    _localStream.getAudioTracks().forEach(t => { t.enabled = !_deafened && !_muted; });
    document.querySelectorAll(".video-grid video:not(.local-vid)").forEach(v => { v.muted = _deafened; });
    uiController.updateCallUI(_inCall, _cameraOn, _muted, _deafened, _screenShare);
    _broadcastCallState();
  }

  // -----------------------------------------------------------------
  // SCREEN SHARE
  // Fix: we keep _localStream as the same object throughout.
  // For screen share: swap the video track *inside* _localStream.
  // For stop: re-acquire camera, swap back.
  // This keeps RTCPeerConnection senders attached to the same stream.
  // -----------------------------------------------------------------
  async function toggleScreen() {
    if (!_inCall || !_localStream) return;
    if (!_screenShare) {
      try {
        const ss = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        mediaProtectionManager.onScreenShareStart();
        const screenTrack = ss.getVideoTracks()[0];

        // Swap video track in _localStream
        _replaceVideoTrackInStream(_localStream, screenTrack);

        // Replace in all RTCPeerConnection senders
        _replaceVideoInCalls(screenTrack);

        // Update local preview (srcObject is still _localStream — just refresh)
        _addVideoEl("local", _localStream, true);

        screenTrack.onended = () => stopScreen();
        _screenShare = true;
        uiController.updateCallUI(_inCall, _cameraOn, _muted, _deafened, _screenShare);
        _broadcastCallState();
      } catch { uiController.toast("Screen share cancelled."); }
    } else {
      await stopScreen();
    }
  }

  async function stopScreen() {
    if (!_screenShare) return;
    _screenShare = false;
    mediaProtectionManager.onScreenShareEnd();

    // Stop all current video tracks
    _localStream.getVideoTracks().forEach(t => t.stop());

    // Try to re-acquire camera
    let camTrack = null;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      camTrack = s.getVideoTracks()[0];
      if (camTrack) camTrack.enabled = _cameraOn;
    } catch { /* no camera */ }

    // Swap track in _localStream
    _replaceVideoTrackInStream(_localStream, camTrack);

    // Replace in all RTCPeerConnection senders
    if (camTrack) _replaceVideoInCalls(camTrack);

    // Refresh local preview
    _addVideoEl("local", _localStream, true);

    uiController.updateCallUI(_inCall, _cameraOn, _muted, _deafened, _screenShare);
    _broadcastCallState();
  }

  // Remove all video tracks from a stream and optionally add a new one
  function _replaceVideoTrackInStream(stream, newTrack) {
    stream.getVideoTracks().forEach(t => stream.removeTrack(t));
    if (newTrack) stream.addTrack(newTrack);
  }

  // Replace or add video sender in all active peer connections
  function _replaceVideoInCalls(newTrack) {
    Object.values(_calls).forEach(call => {
      const pc = call.peerConnection;
      if (!pc) return;
      const sender = pc.getSenders().find(s => s.track?.kind === "video");
      if (sender) {
        sender.replaceTrack(newTrack).catch(e => console.warn("replaceTrack:", e));
      } else if (newTrack) {
        pc.addTrack(newTrack, _localStream);
      }
    });
  }

  // -----------------------------------------------------------------
  // BROADCAST CALL STATE (for peer UI indicators)
  // -----------------------------------------------------------------
  function _broadcastCallState() {
    peerManager.broadcast({
      type: "call-state",
      inCall: _inCall, cameraOn: _cameraOn,
      muted: _muted, screenShare: _screenShare
    });
  }

  function handlePeerState(pid, data) {
    const el = document.getElementById("vwrap-" + pid);
    if (!el) return;
    const label = el.querySelector(".video-label");
    if (label) {
      const profile = peerManager.getProfile(pid);
      label.textContent = (profile?.username || pid.slice(0,8))
        + (data.muted ? " 🔇" : "")
        + (!data.cameraOn ? " 📷✕" : "");
    }
  }

  // -----------------------------------------------------------------
  // VIDEO ELEMENT MANAGEMENT
  // Always sets srcObject even if element already exists (fix v2 bug)
  // -----------------------------------------------------------------
  function _addVideoEl(id, stream, isLocal) {
    const vg   = document.getElementById("video-grid");
    let wrap   = document.getElementById("vwrap-" + id);

    if (wrap) {
      // Update stream on existing element
      const v = wrap.querySelector("video");
      if (v && v.srcObject !== stream) v.srcObject = stream;
      return;
    }

    wrap = document.createElement("div");
    wrap.id        = "vwrap-" + id;
    wrap.className = "video-wrap" + (isLocal ? " local-wrap" : "");

    const v = document.createElement("video");
    v.srcObject   = stream;
    v.autoplay    = true;
    v.playsInline = true;
    v.muted       = !!isLocal;
    if (isLocal) v.classList.add("local-vid");

    const label = document.createElement("div");
    label.className = "video-label";
    label.textContent = isLocal ? "You" : (peerManager.getProfile(id)?.username || id.slice(0,8));

    const fsBtn = document.createElement("button");
    fsBtn.className   = "fs-btn";
    fsBtn.textContent = "⛶ FS";
    fsBtn.onclick = e => { e.stopPropagation(); _goFullscreen(v, label.textContent); };
    v.ondblclick = () => _goFullscreen(v, label.textContent);

    wrap.append(v, label, fsBtn);
    vg.appendChild(wrap);
    vg.classList.remove("hidden");
    _resizeGrid();

    if (mediaProtectionManager.isDrmActive()) wrap.classList.add("drm-black");
  }

  function _removeVideoEl(id) {
    const el = document.getElementById("vwrap-" + id);
    if (el) el.remove();
    const vg = document.getElementById("video-grid");
    if (!vg.childElementCount) vg.classList.add("hidden");
    _resizeGrid();
  }

  function _resizeGrid() {
    const vg = document.getElementById("video-grid");
    const n  = vg.childElementCount;
    vg.style.maxHeight = n <= 2 ? "200px" : n <= 4 ? "300px" : "400px";
  }

  function _goFullscreen(videoEl, label) {
    if (_fsEl) { _fsEl.remove(); _fsEl = null; }
    _fsEl = document.createElement("div");
    _fsEl.className = "video-fullscreen";
    const clone = document.createElement("video");
    clone.srcObject   = videoEl.srcObject;
    clone.autoplay    = true;
    clone.playsInline = true;
    clone.muted       = videoEl.muted;
    const exitBtn = document.createElement("button");
    exitBtn.className   = "fs-exit-btn";
    exitBtn.textContent = "✕ Exit Fullscreen";
    exitBtn.onclick = () => { _fsEl?.remove(); _fsEl = null; };
    const esc = e => { if (e.key === "Escape") { _fsEl?.remove(); _fsEl = null; document.removeEventListener("keydown", esc); } };
    document.addEventListener("keydown", esc);
    _fsEl.append(clone, exitBtn);
    document.body.appendChild(_fsEl);
  }

  function applyDRMBlackout(active) {
    document.querySelectorAll(".video-wrap").forEach(w => w.classList.toggle("drm-black", active));
    document.getElementById("drm-overlay")?.classList.toggle("hidden", !active);
  }

  return {
    isInCall, startCall, callPeer, handleIncomingCall, removePeerCall, leaveCall,
    toggleCamera, toggleMute, toggleDeafen, toggleScreen, stopScreen,
    handlePeerState, applyDRMBlackout, getLocalStream
  };
})();

// Alias
const mediaManager = callManager;

/* ============================================================
   MEDIA PROTECTION MANAGER
============================================================ */
const mediaProtectionManager = (() => {
  let _drmActive        = false;
  let _screenShareActive = false;

  function isDrmActive() { return _drmActive; }

  function _activate(reason) {
    if (_drmActive) return;
    _drmActive = true;
    callManager.applyDRMBlackout(true);
    console.info("[DRM] activated:", reason);
  }

  function _deactivate() {
    if (!_drmActive || _screenShareActive) return;
    _drmActive = false;
    callManager.applyDRMBlackout(false);
  }

  function onScreenShareStart() { _screenShareActive = true; _activate("screen share started"); }
  function onScreenShareEnd()   { _screenShareActive = false; _deactivate(); }

  function init() {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) _activate("tab hidden");
      else _deactivate();
    });
    window.addEventListener("blur",  () => { if (callManager.isInCall()) _activate("focus lost"); });
    window.addEventListener("focus", () => _deactivate());

    if (navigator.mediaDevices?.setCaptureHandleConfig) {
      try { navigator.mediaDevices.setCaptureHandleConfig({ handle: "nextalk-protected" }); } catch {}
    }

    const _origGDM = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = async function(c) {
      _activate("getDisplayMedia");
      const stream = await _origGDM(c);
      stream.getVideoTracks().forEach(t => t.addEventListener("ended", () => { if (!_screenShareActive) _deactivate(); }));
      return stream;
    };
  }

  return { init, isDrmActive, onScreenShareStart, onScreenShareEnd };
})();

/* ============================================================
   FILE TRANSFER MANAGER
============================================================ */
const fileTransferManager = (() => {
  const _incoming = {};

  function _sz(b) {
    if (!b) return "";
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b/1024).toFixed(1) + " KB";
    return (b/1048576).toFixed(1) + " MB";
  }

  async function sendFile(file, targetPeer = null) {
    const conns = peerManager.getConnections();
    const peers = targetPeer
      ? [conns[targetPeer]].filter(Boolean)
      : Object.values(conns).filter(c => c.open && encryptionManager.hasSession(c.peer));

    if (!peers.length) { uiController.toast("No connected peers."); return; }

    const id   = crypto.randomUUID();
    const acc  = accountManager.get();
    uiController.setFileProgress(true, file.name, 0);

    for (const conn of peers) {
      await _enc(conn, { type: "file-meta", id, name: file.name, size: file.size, user: acc.username });
      let offset = 0, idx = 0;
      while (offset < file.size) {
        const slice  = file.slice(offset, offset + CHUNK_SIZE);
        const buf    = await slice.arrayBuffer();
        const b64    = btoa(String.fromCharCode(...new Uint8Array(buf)));
        await _enc(conn, { type: "file-chunk", id, index: idx++, chunk: b64 });
        offset += CHUNK_SIZE;
        uiController.setFileProgress(true, file.name, Math.min(Math.round(offset / file.size * 100), 100));
      }
      await _enc(conn, { type: "file-end", id, totalChunks: idx });
    }

    uiController.setFileProgress(false);
    uiController.appendSystemMessage(`Sent: "${file.name}" (${_sz(file.size)})`);
  }

  async function _enc(conn, obj) {
    if (!conn.open || !encryptionManager.hasSession(conn.peer)) return;
    const payload = await encryptionManager.encrypt(conn.peer, obj);
    conn.send({ encrypted: true, payload });
  }

  function receiveMeta(pid, data) { _incoming[data.id] = { meta: data, chunks: [], peer: pid }; }

  function receiveChunk(data) {
    if (_incoming[data.id]) _incoming[data.id].chunks[data.index] = data.chunk;
  }

  function receiveEnd(data, pid) {
    const entry = _incoming[data.id]; if (!entry) return;
    const { meta, chunks } = entry;
    const arrays = chunks.map(b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
    const total  = arrays.reduce((n, a) => n + a.length, 0);
    const merged = new Uint8Array(total);
    let off = 0; arrays.forEach(a => { merged.set(a, off); off += a.length; });
    const profile = peerManager.getProfile(pid);
    uiController.appendFileMessage(profile.username || "Peer", meta.name, meta.size, new Blob([merged]), profile.avatar || null, pid);
    delete _incoming[data.id];
  }

  return { sendFile, receiveMeta, receiveChunk, receiveEnd };
})();

/* ============================================================
   DM MANAGER
============================================================ */
const dmManager = (() => {
  let _activePeer = null;
  const _history  = {};
  const panel     = document.getElementById("dm-panel");
  const dmMsgs    = document.getElementById("dm-messages");
  const dmInput   = document.getElementById("dm-input");
  const dmName    = document.getElementById("dm-name");
  const dmAvi     = document.getElementById("dm-avatar");

  document.getElementById("dm-send").onclick = send;
  dmInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); send(); } });
  document.getElementById("dm-close").onclick = close;

  function open(pid) {
    _activePeer = pid;
    const p = peerManager.getProfile(pid);
    dmName.textContent = p.username || pid.slice(0,8);
    uiController._applyAvatar(dmAvi, p.username, p.avatar);
    dmMsgs.innerHTML = "";
    (_history[pid] || []).forEach(m => _render(m));
    panel.classList.remove("hidden");
    panel.style.transform = "translateX(0)";
    dmInput.focus();
  }

  function close() {
    _activePeer = null;
    panel.style.transform = "translateX(100%)";
    setTimeout(() => { panel.classList.add("hidden"); panel.style.transform = ""; }, 260);
    document.getElementById("message")?.focus();
  }

  async function send() {
    const text = dmInput.value.trim();
    if (!text || !_activePeer) return;
    dmInput.value = "";
    const acc = accountManager.get();
    const msg = { type:"dm", user:acc.username, text, avatar:acc.avatar, msgId:crypto.randomUUID(), ts:Date.now() };
    _store(_activePeer, { ...msg, isSelf:true });
    _render({ ...msg, isSelf:true });
    await peerManager.sendTo(_activePeer, msg);
  }

  function receiveMessage(fromPeer, data) {
    const p   = peerManager.getProfile(fromPeer);
    const msg = { ...data, isSelf:false, avatar:p.avatar };
    _store(fromPeer, msg);
    if (_activePeer === fromPeer) { _render(msg); }
    else {
      uiController.toast(`DM from ${p.username || "Peer"}: ${data.text.slice(0,40)}`);
      const item = document.querySelector(`.peer-item[data-peer="${fromPeer}"]`);
      if (item && !item.querySelector(".notif-dot")) {
        const dot = document.createElement("span"); dot.className = "notif-dot"; item.appendChild(dot);
      }
    }
  }

  function _store(pid, msg) { if (!_history[pid]) _history[pid] = []; _history[pid].push(msg); }

  function _render(msg) { uiController._appendMsgEl(dmMsgs, { user:msg.user, text:msg.text, avatar:msg.avatar, isSelf:msg.isSelf, isDM:true }); }

  function updatePeerProfile(pid, p) {
    if (_activePeer === pid) { dmName.textContent = p.username || pid.slice(0,8); uiController._applyAvatar(dmAvi, p.username, p.avatar); }
  }

  return { open, close, receiveMessage, updatePeerProfile };
})();

/* ============================================================
   EMBED RENDERER
============================================================ */
const embedRenderer = (() => {
  const YT_RE  = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/;
  const IMG_RE = /\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i;
  const VID_RE = /\.(mp4|webm|ogg)(\?.*)?$/i;
  const URL_RE = /https?:\/\/[^\s<>"']+/g;

  function parseLinks(text) {
    return text.replace(URL_RE, url => {
      const safe = url.replace(/</g,"&lt;").replace(/>/g,"&gt;");
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
    });
  }

  function extractUrls(text) { return text.match(URL_RE) || []; }

  function buildEmbed(url) {
    const yt = url.match(YT_RE);
    if (yt) {
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube.com/embed/${yt[1]}`;
      iframe.width = "320"; iframe.height = "180";
      iframe.style.cssText = "border:none;border-radius:10px;display:block;margin-top:6px";
      iframe.allow = "accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture";
      iframe.allowFullscreen = true;
      return iframe;
    }
    if (IMG_RE.test(url)) {
      const img = document.createElement("img");
      img.src = url; img.className = "msg-img"; img.loading = "lazy"; img.alt = "Image";
      img.onclick = () => uiController.openLightbox(url);
      return img;
    }
    if (VID_RE.test(url)) {
      const v = document.createElement("video");
      v.src = url; v.controls = true;
      v.style.cssText = "max-width:320px;border-radius:10px;display:block;margin-top:6px";
      return v;
    }
    return null;
  }

  return { parseLinks, extractUrls, buildEmbed };
})();

/* ============================================================
   EMOJI MANAGER
============================================================ */
const emojiManager = (() => {
  const picker  = document.getElementById("emoji-picker");
  const trigger = document.getElementById("emoji-btn");
  let _target   = document.getElementById("message");
  let _custom   = {};

  const _CODES = {
    smile:"😊", grin:"😁", laugh:"😂", heart:"❤️", fire:"🔥",
    check:"✅", wave:"👋", star:"⭐", sad:"😢", ok:"👌",
    clap:"👏", eyes:"👀", think:"🤔", party:"🎉", 100:"💯",
    thumbsup:"👍", thumbsdown:"👎", skull:"💀", cry:"😭",
    love:"🥰", cool:"😎", angry:"😡", pray:"🙏", shrug:"🤷"
  };

  function init() {
    _custom = accountManager.getCustomEmojis();
    _buildPicker();
    trigger.onclick = () => picker.classList.toggle("hidden");
    document.addEventListener("click", e => {
      if (!picker.contains(e.target) && e.target !== trigger) picker.classList.add("hidden");
    });
    document.getElementById("message").addEventListener("input", _autocomplete);
  }

  function _buildPicker() {
    picker.innerHTML = "";

    const search = document.createElement("input");
    search.className = "emoji-search"; search.placeholder = "Search emoji…";
    picker.appendChild(search);

    const tabRow  = document.createElement("div"); tabRow.className  = "emoji-tabs";
    const content = document.createElement("div"); content.className = "emoji-content";
    picker.appendChild(tabRow); picker.appendChild(content);

    const cats = { ...EMOJI_CATEGORIES };
    if (Object.keys(_custom).length) cats["Custom"] = Object.keys(_custom);
    const ICONS = { Smileys:"😊", People:"👋", Nature:"🐶", Food:"🍎", Objects:"💡", Symbols:"❤️", Custom:"⭐" };
    let activeTab = Object.keys(cats)[0];

    function show(cat) {
      activeTab = cat;
      content.innerHTML = "";
      tabRow.querySelectorAll(".emoji-tab").forEach(t => t.classList.toggle("active", t.dataset.cat === cat));
      const grid = document.createElement("div"); grid.className = "emoji-grid";
      const list = cat === "Custom" ? Object.keys(_custom) : (EMOJI_CATEGORIES[cat] || []);
      list.forEach(e => {
        const btn = document.createElement("span"); btn.className = "emoji-item";
        if (cat === "Custom") {
          const img = document.createElement("img"); img.src = _custom[e];
          img.style.cssText = "width:1.4em;height:1.4em;object-fit:contain"; img.title = ":" + e + ":";
          btn.appendChild(img);
        } else { btn.textContent = e; btn.title = e; }
        btn.onclick = () => { _insert(cat === "Custom" ? _custom[e] : e, cat === "Custom"); picker.classList.add("hidden"); };
        grid.appendChild(btn);
      });
      content.appendChild(grid);
    }

    Object.keys(cats).forEach((cat, i) => {
      const tab = document.createElement("button");
      tab.className = "emoji-tab"; tab.dataset.cat = cat;
      tab.textContent = ICONS[cat] || cat[0]; tab.title = cat;
      tab.onclick = () => show(cat);
      tabRow.appendChild(tab);
      if (i === 0) show(cat);
    });

    // Upload custom emoji
    const uploadRow = document.createElement("div"); uploadRow.className = "emoji-upload-row";
    const lbl = document.createElement("label"); lbl.className = "emoji-upload-btn";
    lbl.innerHTML = "<span>＋ Custom</span>";
    const fi = document.createElement("input"); fi.type = "file"; fi.accept = "image/*"; fi.style.display = "none";
    fi.onchange = function() {
      const file = this.files[0]; if (!file) return;
      const name = prompt("Emoji name (no spaces):", file.name.split(".")[0].replace(/\s+/g,"_"));
      if (!name) return;
      const r = new FileReader(); r.onload = e => { _custom[name] = e.target.result; accountManager.saveCustomEmojis(_custom); _buildPicker(); uiController.toast(`:${name}: added!`); };
      r.readAsDataURL(file); this.value = "";
    };
    lbl.onclick = () => fi.click(); lbl.appendChild(fi); uploadRow.appendChild(lbl);
    picker.appendChild(uploadRow);

    search.addEventListener("input", () => {
      const q = search.value.toLowerCase(); content.innerHTML = "";
      if (!q) { show(activeTab); return; }
      const grid = document.createElement("div"); grid.className = "emoji-grid";
      Object.values(EMOJI_CATEGORIES).flat().filter(e => e.includes(q)).forEach(e => {
        const btn = document.createElement("span"); btn.className = "emoji-item";
        btn.textContent = e; btn.onclick = () => { _insert(e, false); picker.classList.add("hidden"); };
        grid.appendChild(btn);
      });
      content.appendChild(grid);
    });
  }

  function _insert(val, isCustom) {
    if (!_target) return;
    if (isCustom) {
      const name = Object.keys(_custom).find(k => _custom[k] === val);
      if (!name) return;
      const p = _target.selectionStart || 0;
      _target.value = _target.value.slice(0,p) + `:${name}:` + _target.value.slice(p);
      _target.focus(); _target.selectionStart = _target.selectionEnd = p + name.length + 2;
    } else {
      const p = _target.selectionStart || 0;
      _target.value = _target.value.slice(0,p) + val + _target.value.slice(p);
      _target.focus(); _target.selectionStart = _target.selectionEnd = p + val.length;
    }
  }

  function _autocomplete(e) {
    const el = e.target, text = el.value;
    const m  = text.match(/:([a-zA-Z0-9_]+)$/);
    if (!m) return;
    const key = m[1].toLowerCase();
    if (_custom[key]) { el.value = text.slice(0, text.lastIndexOf(":")) + `:${key}:`; return; }
    if (_CODES[key])  { el.value = text.slice(0, text.lastIndexOf(":")) + _CODES[key]; }
  }

  function renderCustomEmojis(container) {
    if (!Object.keys(_custom).length) return;
    container.querySelectorAll(".msg-text").forEach(el => {
      Object.entries(_custom).forEach(([name, src]) => {
        el.innerHTML = el.innerHTML.replace(
          new RegExp(`:${name}:`, "g"),
          `<img src="${src}" class="custom-emoji-inline" alt=":${name}:" title=":${name}:">`
        );
      });
    });
  }

  return { init, renderCustomEmojis };
})();

/* ============================================================
   UI CONTROLLER
============================================================ */
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
  const btnScreen  = document.getElementById("btn-screen");
  const fpBar      = document.getElementById("file-progress-bar");
  const fpLabel    = document.getElementById("fp-label");
  const fpFill     = document.getElementById("fp-fill");
  const fpPct      = document.getElementById("fp-pct");
  const lightbox   = document.getElementById("lightbox");
  const lbImg      = document.getElementById("lightbox-img");

  /* Toast */
  function toast(msg, dur = 2600) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden"); toastEl.classList.add("visible");
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => { toastEl.classList.remove("visible"); toastEl.classList.add("hidden"); }, dur);
  }

  /* Avatar helpers */
  function _col(name) {
    const cols = ["#5b6aee","#e8519c","#3ecf6e","#f0a03a","#e8484b","#00b0f4","#ff7043","#ab47bc"];
    let h = 0; for (let i = 0; i < (name||"").length; i++) h = name.charCodeAt(i) + ((h<<5)-h);
    return cols[Math.abs(h) % cols.length];
  }

  function _makeInitialsUrl(name, sz = 64) {
    const c = document.createElement("canvas"); c.width = c.height = sz;
    const x = c.getContext("2d");
    x.beginPath(); x.arc(sz/2,sz/2,sz/2,0,Math.PI*2); x.fillStyle = _col(name); x.fill();
    x.fillStyle = "#fff"; x.font = `700 ${Math.round(sz*.38)}px Outfit,sans-serif`;
    x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText((name||"?").trim().split(/\s+/).map(w=>w[0]).join("").toUpperCase().slice(0,2), sz/2, sz/2+1);
    return c.toDataURL();
  }

  function _applyAvatar(el, name, url) { el.src = url || _makeInitialsUrl(name || "?"); }

  function initAvatarDisplay() {
    const acc = accountManager.get();
    _applyAvatar(myAviEl,   acc.username, acc.avatar);
    _applyAvatar(myAviMini, acc.username, acc.avatar);
    myUserDisp.textContent = acc.username || "Anonymous";
    const ui = document.getElementById("username"); if (ui) ui.value = acc.username || "";
  }

  function setMyId(id) { myIdEl.textContent = id; }

  /* Peer list */
  function updatePeerList(connections, profiles) {
    const ids = Object.keys(connections);
    const cnt = document.getElementById("peer-count"); if (cnt) cnt.textContent = ids.length;
    peersEl.innerHTML = "";
    if (!ids.length) { peersEl.innerHTML = '<span class="empty-peers">No peers yet</span>'; return; }
    ids.forEach(id => {
      const p    = profiles[id] || {};
      const name = p.username || id.slice(0,10);
      const item = document.createElement("div"); item.className = "peer-item"; item.dataset.peer = id;
      const img  = document.createElement("img"); img.className = "peer-avatar"; _applyAvatar(img, name, p.avatar||null);
      const lbl  = document.createElement("span"); lbl.textContent = name; lbl.title = id; lbl.style.flex = "1";
      const dm   = document.createElement("span"); dm.className = "dm-badge"; dm.textContent = "DM →";
      item.append(img, lbl, dm);
      item.onclick = () => { item.querySelector(".notif-dot")?.remove(); dmManager.open(id); };
      peersEl.appendChild(item);
    });
  }

  /* Messages */
  function appendMessage({ user, text, avatar, isSelf }) {
    _appendMsgEl(messagesEl, { user, text, avatar, isSelf });
    emojiManager.renderCustomEmojis(messagesEl);
  }

  function _appendMsgEl(container, { user, text, avatar, isSelf, isDM }) {
    const wrap = document.createElement("div"); wrap.className = "message";
    const avi  = document.createElement("img"); avi.className = "msg-avatar";
    _applyAvatar(avi, user, avatar); avi.onclick = () => { if (avatar) openLightbox(avatar); };

    const right = document.createElement("div"); right.className = "msg-right";
    const hdr   = document.createElement("div"); hdr.className = "msg-header";
    const uEl   = document.createElement("span");
    uEl.className = "username" + (isSelf?" self":"") + (isDM?" dm-tag":"");
    uEl.textContent = user + (isDM?" 🔒":"");
    const tEl   = document.createElement("span"); tEl.className = "msg-time";
    tEl.textContent = new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    hdr.append(uEl, tEl);
    const body  = document.createElement("div"); body.className = "msg-text";
    body.innerHTML = embedRenderer.parseLinks(_escapeHtml(text));
    right.append(hdr, body);
    embedRenderer.extractUrls(text).forEach(url => { const e = embedRenderer.buildEmbed(url); if (e) right.appendChild(e); });
    wrap.append(avi, right); container.appendChild(wrap); container.scrollTop = container.scrollHeight;
  }

  function appendSystemMessage(text) {
    const wrap = document.createElement("div"); wrap.className = "message";
    const sys  = document.createElement("div"); sys.className = "msg-system"; sys.textContent = text;
    wrap.appendChild(sys); messagesEl.appendChild(wrap); messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendFileMessage(user, name, size, blob, avatar, senderPeer) {
    const wrap = document.createElement("div"); wrap.className = "message";
    const avi  = document.createElement("img"); avi.className = "msg-avatar"; _applyAvatar(avi, user, avatar);
    const right = document.createElement("div"); right.className = "msg-right";
    const hdr   = document.createElement("div"); hdr.className = "msg-header";
    const uEl   = document.createElement("span"); uEl.className = "username"; uEl.textContent = user;
    const tEl   = document.createElement("span"); tEl.className = "msg-time";
    tEl.textContent = new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    hdr.append(uEl,tEl);

    const _sz = b => { if(!b)return""; if(b<1024)return b+" B"; if(b<1048576)return(b/1024).toFixed(1)+" KB"; return(b/1048576).toFixed(1)+" MB"; };
    const isImg = /\.(jpe?g|png|gif|webp|svg|avif)$/i.test(name);
    const isVid = /\.(mp4|webm|ogg)$/i.test(name);

    function _dlBtn(blob2, name2) {
      const b = document.createElement("button"); b.className = "media-dl-btn"; b.textContent = "↓ Download";
      b.onclick = async () => {
        b.disabled = true; b.textContent = "Requesting…";
        const ok = await filePermissionManager.requestPermission(senderPeer, blob2, name2);
        if (ok) { filePermissionManager.executeDownload(blob2, name2); b.textContent = "✓ Done"; }
        else { b.disabled = false; b.textContent = "↓ Download"; }
      };
      return b;
    }

    if (isImg) {
      const url = URL.createObjectURL(blob);
      const w2  = document.createElement("div"); w2.className = "media-protected-wrap";
      const img = document.createElement("img"); img.src=url; img.className="msg-img"; img.loading="lazy"; img.alt=name;
      img.onclick = () => openLightbox(url);
      w2.append(img, _dlBtn(blob, name)); right.append(hdr, w2);
    } else if (isVid) {
      const url = URL.createObjectURL(blob);
      const w2  = document.createElement("div"); w2.className = "media-protected-wrap";
      const v   = document.createElement("video"); v.src=url; v.controls=true; v.style.cssText="max-width:320px;border-radius:10px;display:block;margin-top:6px";
      w2.append(v, _dlBtn(blob, name)); right.append(hdr, w2);
    } else {
      const row = document.createElement("div"); row.className = "msg-file";
      row.innerHTML = `<span>📄</span><span class="file-name">${_escapeHtml(name)}</span><span class="file-size">${_sz(size)}</span>`;
      const dl = document.createElement("span"); dl.className = "file-hint"; dl.textContent = "↓"; dl.style.cursor = "pointer";
      dl.onclick = async () => {
        dl.textContent = "…";
        const ok = await filePermissionManager.requestPermission(senderPeer, blob, name);
        dl.textContent = ok ? "✓" : "↓"; if (ok) filePermissionManager.executeDownload(blob, name);
      };
      row.appendChild(dl); right.append(hdr, row);
    }

    wrap.append(avi, right); messagesEl.appendChild(wrap); messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function _escapeHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  /* Call UI */
  function updateCallUI(inCall, camOn, muted, deafened, screen) {
    joinBtn.disabled  = inCall;
    leaveBtn.disabled = !inCall;
    leaveBtn.classList.toggle("in-call",     inCall);
    leaveBtn.classList.toggle("not-in-call", !inCall);
    leaveBtn.innerHTML = inCall ? '<span>📵</span> Leave' : '<span>🔌</span> Leave';

    [btnCam, btnMute, btnDeaf, btnScreen].forEach(b => b.disabled = !inCall);

    btnCam.querySelector("small").textContent  = camOn ? "Cam On" : "Cam Off";
    btnCam.classList.toggle("active", !camOn && inCall);

    btnMute.querySelector("span").textContent  = muted ? "🚫" : "🎙";
    btnMute.querySelector("small").textContent = muted ? "Unmute" : "Mute";
    btnMute.classList.toggle("active", muted);

    btnDeaf.querySelector("span").textContent  = deafened ? "🔇" : "🔊";
    btnDeaf.querySelector("small").textContent = deafened ? "Undeaf" : "Deaf";
    btnDeaf.classList.toggle("active", deafened);

    btnScreen.querySelector("small").textContent = screen ? "Stop" : "Share";
    btnScreen.classList.toggle("screen-active", screen);
  }

  /* File progress */
  function setFileProgress(show, label="", pct=0) {
    fpBar.classList.toggle("hidden", !show);
    if (show) { fpLabel.textContent = label; fpFill.style.width = pct+"%"; fpPct.textContent = pct+"%"; }
  }

  /* Lightbox */
  function openLightbox(src) { lbImg.src = src; lightbox.classList.remove("hidden"); }

  return {
    toast, initAvatarDisplay, setMyId, updatePeerList,
    appendMessage, appendSystemMessage, appendFileMessage,
    updateCallUI, setFileProgress, openLightbox,
    _applyAvatar, _appendMsgEl, _escapeHtml
  };
})();

/* ============================================================
   EVENT WIRING
============================================================ */
(function wireEvents() {
  /* Nav */
  document.getElementById("nav-main").onclick = () => {
    document.getElementById("nav-main").classList.add("active");
    document.getElementById("nav-account").classList.remove("active");
    document.getElementById("main-panel").classList.remove("hidden");
    document.getElementById("account-panel").classList.add("hidden");
  };
  document.getElementById("nav-account").onclick = () => {
    document.getElementById("nav-account").classList.add("active");
    document.getElementById("nav-main").classList.remove("active");
    document.getElementById("account-panel").classList.remove("hidden");
    document.getElementById("main-panel").classList.add("hidden");
  };

  document.getElementById("copy-id").onclick = () =>
    navigator.clipboard.writeText(document.getElementById("my-id").textContent).then(() => uiController.toast("Node ID copied!"));

  document.getElementById("host").onclick = () => {
    const un = document.getElementById("username")?.value.trim();
    if (un) { accountManager.save({ username: un }); uiController.initAvatarDisplay(); }
    uiController.appendSystemMessage("Room created — share your Node ID");
    uiController.toast("Room ready! Share your ID.");
  };

  document.getElementById("join").onclick = () => {
    const un     = document.getElementById("username")?.value.trim();
    if (un) { accountManager.save({ username: un }); uiController.initAvatarDisplay(); }
    const hostId = document.getElementById("host-id").value.trim();
    if (!hostId) { uiController.toast("Paste a peer ID first."); return; }
    peerManager.connectTo(hostId);
    uiController.appendSystemMessage("Connecting to peer…");
  };

  const unInput = document.getElementById("username");
  if (unInput) unInput.addEventListener("input", e => {
    const acc = accountManager.get();
    uiController._applyAvatar(document.getElementById("my-avatar"), e.target.value||"?", acc.avatar);
    uiController._applyAvatar(document.getElementById("my-avatar-mini"), e.target.value||"?", acc.avatar);
    document.getElementById("my-username-display").textContent = e.target.value || "Anonymous";
  });

  document.getElementById("acc-save").onclick = () => {
    const un = document.getElementById("username")?.value.trim() || "Anonymous";
    accountManager.save({ username: un }); uiController.initAvatarDisplay(); uiController.toast("Account saved!");
    peerManager.broadcast({ type:"profile", user:un, avatar:accountManager.get().avatar });
  };

  document.getElementById("acc-export").onclick = () => accountManager.exportJSON();

  document.getElementById("acc-import").onchange = async function() {
    const file = this.files[0]; if (!file) return; this.value = "";
    try {
      const acc = await accountManager.importJSON(file);
      uiController.initAvatarDisplay(); emojiManager.init(); uiController.toast(`Account loaded: ${acc.username}`);
    } catch(e) { uiController.toast("Import failed: "+e.message); }
  };

  function _handleAvatarFile(file) {
    if (!file) return;
    const r = new FileReader(); r.onload = e => {
      const img = new Image(); img.src = e.target.result; img.onload = () => {
        const sz=64, c=document.createElement("canvas"); c.width=c.height=sz;
        const x=c.getContext("2d");
        x.beginPath(); x.arc(sz/2,sz/2,sz/2,0,Math.PI*2); x.clip();
        const sc=Math.max(sz/img.width,sz/img.height), w=img.width*sc, h=img.height*sc;
        x.drawImage(img,(sz-w)/2,(sz-h)/2,w,h);
        const avatar=c.toDataURL("image/jpeg",.75);
        accountManager.save({avatar}); uiController.initAvatarDisplay();
        peerManager.broadcast({type:"profile",user:accountManager.get().username,avatar});
        uiController.toast("Avatar updated!");
      };
    }; r.readAsDataURL(file);
  }

  document.getElementById("avatar-input").onchange      = function() { _handleAvatarFile(this.files[0]); this.value=""; };
  document.getElementById("avatar-input-mini").onchange = function() { _handleAvatarFile(this.files[0]); this.value=""; };

  /* Voice */
  document.getElementById("join-call").onclick  = () => callManager.startCall();
  document.getElementById("leave-call").onclick = () => callManager.leaveCall();
  document.getElementById("btn-camera").onclick  = () => callManager.toggleCamera();
  document.getElementById("btn-mute").onclick    = () => callManager.toggleMute();
  document.getElementById("btn-deafen").onclick  = () => callManager.toggleDeafen();
  document.getElementById("btn-screen").onclick  = () => callManager.toggleScreen();

  /* Chat */
  document.getElementById("send").onclick = _sendChat;
  document.getElementById("message").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); _sendChat(); }
  });

  function _sendChat() {
    const text = document.getElementById("message").value.trim(); if (!text) return;
    document.getElementById("message").value = "";
    const acc = accountManager.get();
    uiController.appendMessage({ user:acc.username, text, avatar:acc.avatar, isSelf:true });
    peerManager.broadcast({ type:"message", user:acc.username, text, msgId:crypto.randomUUID() });
  }

  /* Files */
  document.getElementById("file-input").onchange = function() {
    const f=this.files[0]; if(!f)return; this.value=""; fileTransferManager.sendFile(f);
  };
  document.getElementById("file-input-chat").onchange = function() {
    const f=this.files[0]; if(!f)return; this.value=""; fileTransferManager.sendFile(f);
  };

  /* Lightbox */
  document.querySelector(".lightbox-bg").onclick    = () => document.getElementById("lightbox").classList.add("hidden");
  document.querySelector(".lightbox-close").onclick = () => document.getElementById("lightbox").classList.add("hidden");
  document.addEventListener("keydown", e => { if (e.key==="Escape") document.getElementById("lightbox").classList.add("hidden"); });

  document.getElementById("host-id").addEventListener("keydown", e => { if (e.key==="Enter") document.getElementById("join").click(); });
})();

/* ============================================================
   INIT
============================================================ */
(function init() {
  accountManager.load();
  peerManager.init();
  emojiManager.init();
  mediaProtectionManager.init();
  uiController.updateCallUI(false, false, false, false, false);
  uiController.appendSystemMessage("NexTalk started — create a room or join a peer");
})();
