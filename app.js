/* ============================================================
   NexTalk — Modular P2P E2EE Chat
   Modules: peerManager · meshNetwork · encryptionManager ·
            accountManager · fileTransferManager · mediaManager ·
            dmManager · embedRenderer · emojiSystem · uiController
============================================================ */
"use strict";

/* ============================================================
   SOURCE PROTECTION
============================================================ */
(function sourceProtection() {
  // Disable right-click
  document.addEventListener("contextmenu", e => e.preventDefault());

  // Block devtools shortcuts
  document.addEventListener("keydown", e => {
    const c = e.ctrlKey || e.metaKey;
    if (c && (e.key === "s" || e.key === "u" || e.key === "S" || e.key === "U")) {
      e.preventDefault(); return false;
    }
    if (e.key === "F12") { e.preventDefault(); return false; }
    if (c && e.shiftKey && (e.key === "i" || e.key === "j" || e.key === "I" || e.key === "J")) {
      e.preventDefault(); return false;
    }
  });

  // Detect visibility changes (tab switch, possible recording tools)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) mediaManager.applyDRMBlackout(true);
    else mediaManager.applyDRMBlackout(false);
  });

  // Copyright footer
  const footer = document.createElement("div");
  footer.style.cssText = "position:fixed;bottom:4px;right:8px;font-size:9px;opacity:.08;pointer-events:none;z-index:9999;font-family:monospace;user-select:none";
  footer.textContent = "© NexTalk P2P 2025 — Unauthorized reproduction prohibited";
  document.body.appendChild(footer);
})();

/* ============================================================
   CONSTANTS
============================================================ */
const CHUNK_SIZE = 12000; // bytes per file chunk (safe for PeerJS + AES overhead)
const EMOJI_CATEGORIES = {
  "Smileys": ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴","😵","🤯","🤠","🥳","😎","🤓","🧐","😕","😟","🙁","☹️","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖"],
  "People": ["👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","💅","🤳","💪","🦾","🦵","🦶","👂","🦻","👃","🧠","🫀","🫁","🦷","🦴","👀","👁️","👅","👄","🫦"],
  "Nature": ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐜","🦟","🦗","🌸","🌺","🌻","🌹","🌷","🌱","🌿","🍀","🌵","🌴","🌲","🍁","🍂","🍃","🌾","🍄","🌊","🌈","☀️","🌙","⭐","❄️","🌪️","🌬️","🌀"],
  "Food": ["🍎","🍊","🍋","🍇","🍓","🍒","🍑","🥭","🍍","🥝","🍅","🥑","🍆","🥦","🌽","🥕","🧅","🧄","🥔","🍠","🥐","🥖","🥨","🧀","🥚","🍳","🥞","🧇","🥓","🍗","🍖","🥩","🌭","🍔","🍟","🍕","🥙","🥪","🥗","🍜","🍝","🍛","🍣","🍱","🍤","🍙","🍚","🍘","🍥","🥮","🍡","🧁","🎂","🍰","🍩","🍪","🍫","🍬","🍭","🍮","🍯","🍵","☕","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧃","🥤","🧋"],
  "Objects": ["💎","🔮","🧿","💡","🔦","🕯️","🪔","📱","💻","🖥️","🖨️","⌨️","🖱️","🖲️","💾","💿","📀","📷","📸","📹","🎥","📽️","🎞️","📞","☎️","📟","📠","📺","📻","🎙️","🎚️","🎛️","🧭","⏱️","⌚","📡","🔋","🔌","💰","💳","🔑","🗝️","🔒","🔓","🔨","🪓","⚔️","🛡️","🔧","🔩","⚙️","🗜️","🔬","🔭","📊","📈","📉"],
  "Symbols": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","✨","⚡","🔥","💫","🌟","💥","🎉","🎊","🎈","🎁","🏆","🥇","🎯","🎮","🕹️","🎲","♠️","♥️","♦️","♣️","🃏","🀄","🎴","🎭","🎨","🖼️","🎬","🎤","🎧","🎷","🎸","🎹","🥁","🎺","🎻","🪕","🎼","🎵","🎶","🎙️"]
};

/* ============================================================
   ACCOUNT MANAGER
============================================================ */
const accountManager = (() => {
  const STORAGE_KEY = "nextalk_account";
  let _account = null;

  function defaultAccount() {
    return {
      username: "Anonymous",
      avatar: null,
      peerId: null,
      createdAt: Date.now(),
      preferences: {}
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) _account = JSON.parse(raw);
      else _account = defaultAccount();
    } catch { _account = defaultAccount(); }
    return _account;
  }

  function save(updates = {}) {
    Object.assign(_account, updates);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_account));
  }

  function get() { return _account || load(); }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(_account, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nextalk-account.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const parsed = JSON.parse(e.target.result);
          _account = { ...defaultAccount(), ...parsed };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(_account));
          resolve(_account);
        } catch { reject(new Error("Invalid account file")); }
      };
      reader.readAsText(file);
    });
  }

  return { load, save, get, exportJSON, importJSON };
})();

/* ============================================================
   ENCRYPTION MANAGER
============================================================ */
const encryptionManager = (() => {
  let _keyPair = null;
  const _sessionKeys = {}; // peerId → CryptoKey

  async function init() {
    _keyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]
    );
  }

  async function getPublicKeyBytes() {
    const raw = await crypto.subtle.exportKey("raw", _keyPair.publicKey);
    return Array.from(new Uint8Array(raw));
  }

  async function deriveKey(remotePubBytes) {
    const buf = new Uint8Array(remotePubBytes).buffer;
    const remotePub = await crypto.subtle.importKey(
      "raw", buf, { name: "ECDH", namedCurve: "P-256" }, false, []
    );
    return crypto.subtle.deriveKey(
      { name: "ECDH", public: remotePub },
      _keyPair.privateKey,
      { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  }

  async function setKey(peerId, remotePubBytes) {
    _sessionKeys[peerId] = await deriveKey(remotePubBytes);
  }

  function hasKey(peerId) { return !!_sessionKeys[peerId]; }
  function removeKey(peerId) { delete _sessionKeys[peerId]; }

  async function encrypt(peerId, obj) {
    const key = _sessionKeys[peerId];
    if (!key) throw new Error("No session key for " + peerId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, raw);
    return {
      iv: btoa(String.fromCharCode(...iv)),
      data: btoa(String.fromCharCode(...new Uint8Array(enc)))
    };
  }

  async function decrypt(peerId, payload) {
    const key = _sessionKeys[peerId];
    if (!key) throw new Error("No session key for " + peerId);
    const iv   = Uint8Array.from(atob(payload.iv),   c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(payload.data), c => c.charCodeAt(0));
    const dec  = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return JSON.parse(new TextDecoder().decode(dec));
  }

  return { init, getPublicKeyBytes, setKey, hasKey, removeKey, encrypt, decrypt };
})();

/* ============================================================
   PEER MANAGER + MESH NETWORK
============================================================ */
const peerManager = (() => {
  let _peer = null;
  let _myId = null;

  const _connections  = {};    // peerId → DataConnection
  const _peerProfiles = {};    // peerId → { username, avatar }
  const _pendingConns = new Set(); // prevent duplicate connections

  function init() {
    _peer = new Peer();
    _peer.on("open", async id => {
      _myId = id;
      accountManager.save({ peerId: id });
      uiController.setMyId(id);
      await encryptionManager.init();
      uiController.initAvatarDisplay();
    });
    _peer.on("connection", conn => _setupConn(conn));
    _peer.on("call", call => mediaManager.handleIncomingCall(call));
    _peer.on("error", e => console.error("Peer error:", e));
  }

  function getId() { return _myId; }
  function getPeer() { return _peer; }
  function getConnections() { return _connections; }
  function getProfile(peerId) { return _peerProfiles[peerId] || { username: peerId?.slice(0,8), avatar: null }; }
  function setProfile(peerId, profile) {
    _peerProfiles[peerId] = profile;
    uiController.updatePeerList(_connections, _peerProfiles);
    dmManager.updatePeerProfile(peerId, profile);
  }

  function connectTo(peerId) {
    if (!peerId || peerId === _myId) return;
    if (_connections[peerId] || _pendingConns.has(peerId)) return;
    _pendingConns.add(peerId);
    const conn = _peer.connect(peerId, { reliable: true });
    _setupConn(conn);
  }

  function _setupConn(conn) {
    // Prevent duplicate
    if (_connections[conn.peer]) { conn.close(); return; }
    _connections[conn.peer] = conn;
    uiController.updatePeerList(_connections, _peerProfiles);

    conn.on("open", async () => {
      _pendingConns.delete(conn.peer);
      // ECDH handshake
      const pub = await encryptionManager.getPublicKeyBytes();
      conn.send({ type: "ecdh-hello", pub });
    });

    conn.on("data", async raw => {
      try {
        await _handleRaw(conn, raw);
      } catch (e) { console.warn("Data error:", e); }
    });

    conn.on("close", () => _teardown(conn.peer));
    conn.on("error", e => {
      console.error("Conn error:", e);
      _teardown(conn.peer);
    });
  }

  async function _handleRaw(conn, raw) {
    const pid = conn.peer;

    // ECDH handshake (plaintext)
    if (raw.type === "ecdh-hello") {
      await encryptionManager.setKey(pid, raw.pub);
      if (!raw._reply) {
        const pub = await encryptionManager.getPublicKeyBytes();
        conn.send({ type: "ecdh-hello", pub, _reply: true });
      }
      // Share our profile
      await sendEncrypted(conn, {
        type: "profile",
        user: accountManager.get().username,
        avatar: accountManager.get().avatar
      });
      // Broadcast our peer list for mesh
      const knownPeers = Object.keys(_connections).filter(p => p !== pid);
      if (knownPeers.length) {
        await sendEncrypted(conn, { type: "mesh-peers", peers: knownPeers });
      }
      // If in call, ring this peer
      if (mediaManager.isInCall()) {
        mediaManager.callPeer(pid);
      }
      return;
    }

    // Encrypted envelope
    if (raw.encrypted) {
      if (!encryptionManager.hasKey(pid)) return;
      const obj = await encryptionManager.decrypt(pid, raw.payload);
      _handleDecrypted(conn, obj);
      return;
    }

    _handleDecrypted(conn, raw);
  }

  function _handleDecrypted(conn, data) {
    const pid = conn.peer;
    switch (data.type) {
      case "profile":
        setProfile(pid, { username: data.user || "Peer", avatar: data.avatar || null });
        break;
      case "mesh-peers":
        // Connect to peers we don't know yet (full mesh)
        if (Array.isArray(data.peers)) {
          data.peers.forEach(id => connectTo(id));
        }
        break;
      case "message":
        uiController.appendMessage({
          user: data.user,
          text: data.text,
          avatar: _peerProfiles[pid]?.avatar || null,
          isSelf: false,
          msgId: data.msgId
        });
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
    }
  }

  function _teardown(peerId) {
    delete _connections[peerId];
    _pendingConns.delete(peerId);
    encryptionManager.removeKey(peerId);
    uiController.updatePeerList(_connections, _peerProfiles);
    uiController.appendSystemMessage(`A peer left the mesh`);
  }

  async function sendEncrypted(conn, obj) {
    if (!conn.open || !encryptionManager.hasKey(conn.peer)) return;
    const payload = await encryptionManager.encrypt(conn.peer, obj);
    conn.send({ encrypted: true, payload });
  }

  async function broadcast(obj, exclude = null) {
    for (const [pid, conn] of Object.entries(_connections)) {
      if (pid !== exclude && conn.open && encryptionManager.hasKey(pid)) {
        await sendEncrypted(conn, obj);
      }
    }
  }

  async function sendTo(peerId, obj) {
    const conn = _connections[peerId];
    if (conn) await sendEncrypted(conn, obj);
  }

  return { init, getId, getPeer, getConnections, getProfile, setProfile, connectTo, broadcast, sendTo };
})();

/* ============================================================
   MEDIA MANAGER
============================================================ */
const mediaManager = (() => {
  const _calls      = {};   // peerId → MediaConnection
  let _localStream  = null;
  let _inCall       = false;
  let _cameraOn     = false;
  let _muted        = false;
  let _deafened     = false;
  let _screenShare  = false;
  let _drmActive    = false;
  let _fsEl         = null; // fullscreen element

  function isInCall() { return _inCall; }

  async function startCall() {
    try {
      _localStream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
        video: true
      });
    } catch {
      try {
        _localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        uiController.toast("Microphone access denied.");
        return;
      }
    }
    // Camera OFF by default
    _cameraOn = false;
    _localStream.getVideoTracks().forEach(t => { t.enabled = false; });

    _inCall = true;
    uiController.updateCallUI(true, false, false, false, false);
    _addVideoEl("local", _localStream, true);

    // Call all mesh peers
    Object.keys(peerManager.getConnections()).forEach(pid => callPeer(pid));
  }

  function callPeer(pid) {
    if (_calls[pid] || !_localStream) return;
    const call = peerManager.getPeer().call(pid, _localStream);
    _setupCall(call);
  }

  function handleIncomingCall(call) {
    call.answer(_localStream || new MediaStream());
    _setupCall(call);
  }

  function _setupCall(call) {
    _calls[call.peer] = call;
    call.on("stream", stream => _addVideoEl(call.peer, stream, false));
    call.on("close",  ()     => _removeVideoEl(call.peer));
    call.on("error",  e      => console.error("Call error:", e));
  }

  function leaveCall() {
    if (_localStream) { _localStream.getTracks().forEach(t => t.stop()); _localStream = null; }
    Object.values(_calls).forEach(c => c.close());
    Object.keys(_calls).forEach(k => delete _calls[k]);
    const vg = document.getElementById("video-grid");
    Array.from(vg.children).forEach(el => el.remove());
    vg.classList.add("hidden");
    _inCall = false; _cameraOn = false; _muted = false;
    _deafened = false; _screenShare = false;
    uiController.updateCallUI(false, false, false, false, false);
    uiController.toast("Left voice.");
  }

  function toggleCamera() {
    if (!_localStream) return;
    _cameraOn = !_cameraOn;
    _localStream.getVideoTracks().forEach(t => { t.enabled = _cameraOn; });
    uiController.updateCallUI(_inCall, _cameraOn, _muted, _deafened, _screenShare);
  }

  function toggleMute() {
    if (!_localStream) return;
    _muted = !_muted;
    _localStream.getAudioTracks().forEach(t => { t.enabled = !_muted; });
    uiController.updateCallUI(_inCall, _cameraOn, _muted, _deafened, _screenShare);
  }

  function toggleDeafen() {
    if (!_localStream) return;
    _deafened = !_deafened;
    _localStream.getAudioTracks().forEach(t => { t.enabled = !_deafened; });
    document.querySelectorAll(".video-grid video:not(.local-vid)").forEach(v => { v.muted = _deafened; });
    if (_deafened) _muted = true;
    uiController.updateCallUI(_inCall, _cameraOn, _muted, _deafened, _screenShare);
  }

  async function toggleScreen() {
    if (!_localStream) return;
    if (!_screenShare) {
      try {
        const ss = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const st = ss.getVideoTracks()[0];
        // DRM: detect if screen share is our own app (loop prevention)
        const combined = new MediaStream([st, ..._localStream.getAudioTracks()]);
        Object.values(_calls).forEach(call => {
          const pc = call.peerConnection;
          if (!pc) return;
          const sender = pc.getSenders().find(s => s.track?.kind === "video");
          if (sender) sender.replaceTrack(st);
          else pc.addTrack(st, combined);
        });
        _addVideoEl("local", combined, true);
        st.onended = () => stopScreen();
        _screenShare = true;
        uiController.updateCallUI(_inCall, _cameraOn, _muted, _deafened, _screenShare);
      } catch { uiController.toast("Screen share cancelled."); }
    } else { stopScreen(); }
  }

  async function stopScreen() {
    if (!_screenShare) return;
    _screenShare = false;
    let camTrack = null;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      camTrack = s.getVideoTracks()[0];
      if (camTrack) camTrack.enabled = _cameraOn;
    } catch {}
    Object.values(_calls).forEach(call => {
      const pc = call.peerConnection;
      if (!pc) return;
      const sender = pc.getSenders().find(s => s.track?.kind === "video");
      if (sender && camTrack) sender.replaceTrack(camTrack);
    });
    _localStream.getVideoTracks().forEach(t => { t.stop(); _localStream.removeTrack(t); });
    if (camTrack) _localStream.addTrack(camTrack);
    _addVideoEl("local", _localStream, true);
    uiController.updateCallUI(_inCall, _cameraOn, _muted, _deafened, _screenShare);
  }

  function _addVideoEl(id, stream, isLocal) {
    const vg = document.getElementById("video-grid");
    let wrap = document.getElementById("vwrap-" + id);
    if (wrap) { wrap.querySelector("video").srcObject = stream; return; }

    wrap = document.createElement("div");
    wrap.id = "vwrap-" + id;
    wrap.className = "video-wrap" + (isLocal ? " local-wrap" : "");

    const v = document.createElement("video");
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    v.muted = !!isLocal;
    if (isLocal) v.classList.add("local-vid");

    const label = document.createElement("div");
    label.className = "video-label";
    const profile = isLocal
      ? { username: accountManager.get().username }
      : peerManager.getProfile(id);
    label.textContent = isLocal ? "You" : (profile?.username || id.slice(0, 8));

    const fsBtn = document.createElement("button");
    fsBtn.className = "fs-btn";
    fsBtn.textContent = "⛶ FS";
    fsBtn.onclick = (e) => { e.stopPropagation(); _goFullscreen(v, label.textContent); };

    v.ondblclick = () => _goFullscreen(v, label.textContent);

    wrap.append(v, label, fsBtn);
    vg.appendChild(wrap);
    vg.classList.remove("hidden");

    if (_drmActive) wrap.classList.add("drm-black");
  }

  function _removeVideoEl(id) {
    const el = document.getElementById("vwrap-" + id);
    if (el) el.remove();
    const vg = document.getElementById("video-grid");
    if (!vg.childElementCount) vg.classList.add("hidden");
  }

  function _goFullscreen(videoEl, label) {
    if (_fsEl) { _fsEl.remove(); _fsEl = null; }
    _fsEl = document.createElement("div");
    _fsEl.className = "video-fullscreen";
    const clone = document.createElement("video");
    clone.srcObject = videoEl.srcObject;
    clone.autoplay = true; clone.playsInline = true; clone.muted = videoEl.muted;
    const exitBtn = document.createElement("button");
    exitBtn.className = "fs-exit-btn";
    exitBtn.textContent = "✕ Exit Fullscreen";
    exitBtn.onclick = () => { _fsEl?.remove(); _fsEl = null; };
    document.addEventListener("keydown", function escFs(e) {
      if (e.key === "Escape") { _fsEl?.remove(); _fsEl = null; document.removeEventListener("keydown", escFs); }
    });
    _fsEl.append(clone, exitBtn);
    document.body.appendChild(_fsEl);
  }

  function applyDRMBlackout(active) {
    _drmActive = active;
    document.querySelectorAll(".video-wrap").forEach(w => w.classList.toggle("drm-black", active));
    const overlay = document.getElementById("drm-overlay");
    if (overlay) overlay.classList.toggle("hidden", !active);
  }

  function getLocalStream() { return _localStream; }

  return {
    isInCall, startCall, callPeer, handleIncomingCall, leaveCall,
    toggleCamera, toggleMute, toggleDeafen, toggleScreen, stopScreen,
    applyDRMBlackout, getLocalStream
  };
})();

/* ============================================================
   FILE TRANSFER MANAGER
============================================================ */
const fileTransferManager = (() => {
  const _incoming = {}; // id → { meta, chunks[] }

  function humanSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  async function sendFile(file, targetPeer = null) {
    const conns = peerManager.getConnections();
    const peers = targetPeer
      ? [conns[targetPeer]].filter(Boolean)
      : Object.values(conns).filter(c => c.open && encryptionManager.hasKey(c.peer));

    if (!peers.length) { uiController.toast("No connected peers."); return; }

    const id   = crypto.randomUUID();
    const acc  = accountManager.get();
    const meta = { type: "file-meta", id, name: file.name, size: file.size, user: acc.username };

    uiController.setFileProgress(true, file.name, 0);

    for (const conn of peers) {
      await _sendEncrypted(conn, meta);

      let offset = 0, chunkIndex = 0;
      while (offset < file.size) {
        const slice  = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await slice.arrayBuffer();
        const b64    = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        await _sendEncrypted(conn, { type: "file-chunk", id, index: chunkIndex, chunk: b64 });
        offset += CHUNK_SIZE;
        chunkIndex++;
        const pct = Math.round((offset / file.size) * 100);
        uiController.setFileProgress(true, file.name, Math.min(pct, 100));
      }

      await _sendEncrypted(conn, { type: "file-end", id, totalChunks: chunkIndex });
    }

    uiController.setFileProgress(false);
    uiController.appendSystemMessage(`Sent: "${file.name}" (${humanSize(file.size)})`);
  }

  async function _sendEncrypted(conn, obj) {
    if (!conn.open || !encryptionManager.hasKey(conn.peer)) return;
    const payload = await encryptionManager.encrypt(conn.peer, obj);
    conn.send({ encrypted: true, payload });
  }

  function receiveMeta(pid, data) {
    _incoming[data.id] = { meta: data, chunks: [], peer: pid };
  }

  function receiveChunk(data) {
    if (_incoming[data.id]) _incoming[data.id].chunks[data.index] = data.chunk;
  }

  function receiveEnd(data, pid) {
    const entry = _incoming[data.id];
    if (!entry) return;
    const { meta, chunks } = entry;
    const arrays = chunks.map(b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
    const total  = arrays.reduce((n, a) => n + a.length, 0);
    const merged = new Uint8Array(total);
    let off = 0;
    arrays.forEach(a => { merged.set(a, off); off += a.length; });
    const blob = new Blob([merged]);
    const profile = peerManager.getProfile(pid);
    uiController.appendFileMessage(profile.username || "Peer", meta.name, meta.size, blob, profile.avatar || null);
    delete _incoming[data.id];
  }

  return { sendFile, receiveMeta, receiveChunk, receiveEnd };
})();

/* ============================================================
   DM MANAGER
============================================================ */
const dmManager = (() => {
  let _activePeer = null;
  const _history  = {}; // peerId → messages[]

  const panel   = document.getElementById("dm-panel");
  const dmMsgs  = document.getElementById("dm-messages");
  const dmInput = document.getElementById("dm-input");
  const dmName  = document.getElementById("dm-name");
  const dmAvi   = document.getElementById("dm-avatar");

  document.getElementById("dm-send").onclick = send;
  dmInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); send(); } });
  document.getElementById("dm-close").onclick = close;

  function open(peerId) {
    _activePeer = peerId;
    const profile = peerManager.getProfile(peerId);
    dmName.textContent = profile.username || peerId.slice(0,8);
    uiController._applyAvatar(dmAvi, profile.username, profile.avatar);
    dmMsgs.innerHTML = "";
    (_history[peerId] || []).forEach(m => _renderDM(m));
    panel.classList.remove("hidden");
    setTimeout(() => { panel.style.transform = "translateX(0)"; }, 10);
    dmInput.focus();
  }

  function close() {
    _activePeer = null;
    panel.classList.add("hidden");
  }

  async function send() {
    const text = dmInput.value.trim();
    if (!text || !_activePeer) return;
    dmInput.value = "";
    const acc = accountManager.get();
    const msg = { type: "dm", user: acc.username, text, avatar: acc.avatar, msgId: crypto.randomUUID(), ts: Date.now() };
    _store(_activePeer, { ...msg, isSelf: true });
    _renderDM({ ...msg, isSelf: true });
    await peerManager.sendTo(_activePeer, msg);
  }

  function receiveMessage(fromPeer, data) {
    const profile = peerManager.getProfile(fromPeer);
    const msg = { ...data, isSelf: false, avatar: profile.avatar };
    _store(fromPeer, msg);
    if (_activePeer === fromPeer) _renderDM(msg);
    else uiController.toast(`DM from ${profile.username}: ${data.text.slice(0,40)}`);
    // Notification dot on peer item
    const item = document.querySelector(`.peer-item[data-peer="${fromPeer}"]`);
    if (item && _activePeer !== fromPeer) {
      let dot = item.querySelector(".notif-dot");
      if (!dot) { dot = document.createElement("span"); dot.className = "notif-dot"; item.appendChild(dot); }
    }
  }

  function _store(peerId, msg) {
    if (!_history[peerId]) _history[peerId] = [];
    _history[peerId].push(msg);
  }

  function _renderDM(msg) {
    uiController._appendMsgEl(dmMsgs, {
      user: msg.user, text: msg.text,
      avatar: msg.avatar, isSelf: msg.isSelf,
      isDM: true
    });
  }

  function updatePeerProfile(peerId, profile) {
    if (_activePeer === peerId) {
      dmName.textContent = profile.username || peerId.slice(0,8);
      uiController._applyAvatar(dmAvi, profile.username, profile.avatar);
    }
  }

  return { open, close, receiveMessage, updatePeerProfile };
})();

/* ============================================================
   EMBED RENDERER
============================================================ */
const embedRenderer = (() => {
  const YT_RE  = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/;
  const IMG_RE  = /\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i;
  const VID_RE  = /\.(mp4|webm|ogg)(\?.*)?$/i;
  const URL_RE  = /https?:\/\/[^\s<>"']+/g;

  function parseLinks(text) {
    return text.replace(URL_RE, url => {
      const safe = url.replace(/</g,"&lt;").replace(/>/g,"&gt;");
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
    });
  }

  function extractUrls(text) {
    return text.match(URL_RE) || [];
  }

  function buildEmbed(url) {
    // YouTube
    const ytMatch = url.match(YT_RE);
    if (ytMatch) {
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube.com/embed/${ytMatch[1]}`;
      iframe.width = "320"; iframe.height = "180";
      iframe.style.cssText = "border:none;border-radius:10px;display:block;margin-top:6px";
      iframe.allow = "accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture";
      iframe.allowFullscreen = true;
      return iframe;
    }
    // Inline image
    if (IMG_RE.test(url)) {
      const img = document.createElement("img");
      img.src = url; img.className = "msg-img"; img.loading = "lazy";
      img.alt = "Image";
      img.onclick = () => uiController.openLightbox(url);
      return img;
    }
    // Inline video
    if (VID_RE.test(url)) {
      const v = document.createElement("video");
      v.src = url; v.controls = true; v.style.cssText = "max-width:320px;border-radius:10px;display:block;margin-top:6px";
      return v;
    }
    return null;
  }

  return { parseLinks, extractUrls, buildEmbed };
})();

/* ============================================================
   EMOJI SYSTEM
============================================================ */
const emojiSystem = (() => {
  const picker  = document.getElementById("emoji-picker");
  const trigger = document.getElementById("emoji-btn");
  let _target   = document.getElementById("message");

  function init() {
    _buildPicker();
    trigger.onclick = toggle;
    document.addEventListener("click", e => {
      if (!picker.contains(e.target) && e.target !== trigger) picker.classList.add("hidden");
    });
    // Autocomplete :emoji:
    document.getElementById("message").addEventListener("input", _autocomplete);
  }

  function setTarget(el) { _target = el; }

  function toggle() { picker.classList.toggle("hidden"); }

  function _buildPicker() {
    const search = document.createElement("input");
    search.className = "emoji-search";
    search.placeholder = "Search emoji…";
    picker.appendChild(search);

    const grid = document.createElement("div");
    grid.className = "emoji-grid";
    picker.appendChild(grid);

    const allEmoji = Object.entries(EMOJI_CATEGORIES).flatMap(([cat, emojis]) =>
      emojis.map(e => ({ e, cat }))
    );

    function render(filter) {
      grid.innerHTML = "";
      const filtered = filter
        ? allEmoji.filter(x => x.e.includes(filter))
        : allEmoji;

      let lastCat = null;
      filtered.forEach(({ e, cat }) => {
        if (!filter && cat !== lastCat) {
          const lbl = document.createElement("div");
          lbl.className = "emoji-section-label";
          lbl.style.gridColumn = "1/-1";
          lbl.textContent = cat.toUpperCase();
          grid.appendChild(lbl);
          lastCat = cat;
        }
        const btn = document.createElement("span");
        btn.className = "emoji-item";
        btn.textContent = e;
        btn.title = e;
        btn.onclick = () => {
          if (_target) {
            const p = _target.selectionStart;
            _target.value = _target.value.slice(0, p) + e + _target.value.slice(p);
            _target.focus();
            _target.selectionStart = _target.selectionEnd = p + e.length;
          }
          picker.classList.add("hidden");
        };
        grid.appendChild(btn);
      });
    }

    render("");
    search.addEventListener("input", () => render(search.value));
  }

  function _autocomplete(e) {
    const el = e.target;
    const text = el.value;
    const colonMatch = text.match(/:([a-zA-Z_]+)$/);
    if (!colonMatch) return;
    // Simple substitution for a few common ones
    const map = { smile:"😊", heart:"❤️", fire:"🔥", check:"✅", wave:"👋", star:"⭐", sad:"😢", ok:"👌" };
    const key = colonMatch[1].toLowerCase();
    if (map[key]) {
      el.value = text.slice(0, text.lastIndexOf(":")) + map[key];
    }
  }

  return { init, setTarget };
})();

/* ============================================================
   UI CONTROLLER
============================================================ */
const uiController = (() => {
  // Element refs
  const myIdEl    = document.getElementById("my-id");
  const peersEl   = document.getElementById("peers");
  const messagesEl= document.getElementById("messages");
  const msgInput  = document.getElementById("message");
  const toastEl   = document.getElementById("toast");
  const myAviEl   = document.getElementById("my-avatar");
  const myAviMini = document.getElementById("my-avatar-mini");
  const myUserDisp= document.getElementById("my-username-display");
  const joinBtn   = document.getElementById("join-call");
  const leaveBtn  = document.getElementById("leave-call");
  const btnCam    = document.getElementById("btn-camera");
  const btnMute   = document.getElementById("btn-mute");
  const btnDeaf   = document.getElementById("btn-deafen");
  const btnScreen = document.getElementById("btn-screen");
  const fpBar     = document.getElementById("file-progress-bar");
  const fpLabel   = document.getElementById("fp-label");
  const fpFill    = document.getElementById("fp-fill");
  const fpPct     = document.getElementById("fp-pct");
  const lightbox  = document.getElementById("lightbox");
  const lbImg     = document.getElementById("lightbox-img");

  /* Toasts */
  function toast(msg, duration = 2600) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    toastEl.classList.add("visible");
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => {
      toastEl.classList.remove("visible");
      toastEl.classList.add("hidden");
    }, duration);
  }

  /* Avatar helpers */
  function _initialsColor(name) {
    const colors = ["#5b6aee","#e8519c","#3ecf6e","#f0a03a","#e8484b","#00b0f4","#ff7043","#ab47bc"];
    let h = 0;
    for (let i = 0; i < (name||"").length; i++) h = name.charCodeAt(i) + ((h<<5)-h);
    return colors[Math.abs(h) % colors.length];
  }

  function _makeInitialsUrl(name, sz = 64) {
    const c = document.createElement("canvas");
    c.width = c.height = sz;
    const x = c.getContext("2d");
    x.beginPath(); x.arc(sz/2, sz/2, sz/2, 0, Math.PI*2);
    x.fillStyle = _initialsColor(name); x.fill();
    x.fillStyle = "#fff";
    x.font = `700 ${Math.round(sz*.38)}px Outfit,sans-serif`;
    x.textAlign = "center"; x.textBaseline = "middle";
    const initials = (name||"?").trim().split(/\s+/).map(w=>w[0]).join("").toUpperCase().slice(0,2);
    x.fillText(initials, sz/2, sz/2+1);
    return c.toDataURL();
  }

  function _applyAvatar(el, name, dataUrl) {
    el.src = dataUrl || _makeInitialsUrl(name || "?");
  }

  function initAvatarDisplay() {
    const acc = accountManager.get();
    _applyAvatar(myAviEl, acc.username, acc.avatar);
    _applyAvatar(myAviMini, acc.username, acc.avatar);
    myUserDisp.textContent = acc.username || "Anonymous";
    if (document.getElementById("username")) {
      document.getElementById("username").value = acc.username || "";
    }
  }

  function setMyId(id) { myIdEl.textContent = id; }

  /* Peer list */
  function updatePeerList(connections, profiles) {
    const ids = Object.keys(connections);
    const countEl = document.getElementById("peer-count");
    if (countEl) countEl.textContent = ids.length;
    peersEl.innerHTML = "";
    if (!ids.length) {
      peersEl.innerHTML = '<span class="empty-peers">No peers yet</span>';
      return;
    }
    ids.forEach(id => {
      const p = profiles[id] || {};
      const name = p.username || id.slice(0,10);

      const item = document.createElement("div");
      item.className = "peer-item";
      item.dataset.peer = id;

      const img = document.createElement("img");
      img.className = "peer-avatar";
      _applyAvatar(img, name, p.avatar || null);

      const label = document.createElement("span");
      label.textContent = name;
      label.title = id;
      label.style.flex = "1";

      const dmBadge = document.createElement("span");
      dmBadge.className = "dm-badge";
      dmBadge.textContent = "DM →";

      item.append(img, label, dmBadge);
      item.onclick = () => {
        // Remove notif dot
        const dot = item.querySelector(".notif-dot");
        if (dot) dot.remove();
        dmManager.open(id);
      };
      peersEl.appendChild(item);
    });
  }

  /* Messages */
  function appendMessage({ user, text, avatar, isSelf, msgId, isDM }) {
    _appendMsgEl(messagesEl, { user, text, avatar, isSelf, isDM });
  }

  function _appendMsgEl(container, { user, text, avatar, isSelf, isDM }) {
    const wrap = document.createElement("div");
    wrap.className = "message";

    const avi = document.createElement("img");
    avi.className = "msg-avatar";
    _applyAvatar(avi, user, avatar);
    avi.onclick = () => { if (avatar) openLightbox(avatar); };

    const right = document.createElement("div");
    right.className = "msg-right";

    const hdr = document.createElement("div");
    hdr.className = "msg-header";

    const uEl = document.createElement("span");
    uEl.className = "username" + (isSelf ? " self" : "") + (isDM ? " dm-tag" : "");
    uEl.textContent = user + (isDM ? " 🔒" : "");

    const tEl = document.createElement("span");
    tEl.className = "msg-time";
    tEl.textContent = new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});

    hdr.append(uEl, tEl);

    const body = document.createElement("div");
    body.className = "msg-text";
    body.innerHTML = embedRenderer.parseLinks(_escapeHtml(text));

    right.append(hdr, body);

    // Render embeds
    const urls = embedRenderer.extractUrls(text);
    urls.forEach(url => {
      const embed = embedRenderer.buildEmbed(url);
      if (embed) right.appendChild(embed);
    });

    wrap.append(avi, right);
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  }

  function appendSystemMessage(text) {
    const wrap = document.createElement("div");
    wrap.className = "message";
    const sys = document.createElement("div");
    sys.className = "msg-system";
    sys.textContent = text;
    wrap.appendChild(sys);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendFileMessage(user, name, size, blob, avatar) {
    const wrap = document.createElement("div");
    wrap.className = "message";

    const avi = document.createElement("img");
    avi.className = "msg-avatar";
    _applyAvatar(avi, user, avatar);

    const right = document.createElement("div");
    right.className = "msg-right";

    const hdr = document.createElement("div");
    hdr.className = "msg-header";
    const uEl = document.createElement("span");
    uEl.className = "username"; uEl.textContent = user;
    const tEl = document.createElement("span");
    tEl.className = "msg-time";
    tEl.textContent = new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
    hdr.append(uEl, tEl);

    // Check if inline image
    const isImg = /\.(jpe?g|png|gif|webp|svg|avif)$/i.test(name);
    if (isImg) {
      const url = URL.createObjectURL(blob);
      const img = document.createElement("img");
      img.src = url; img.className = "msg-img"; img.loading = "lazy";
      img.alt = name;
      img.onclick = () => openLightbox(url);
      right.append(hdr, img);
    } else {
      const a = document.createElement("a");
      a.className = "msg-file";
      a.href = URL.createObjectURL(blob);
      a.download = name; a.target = "_blank"; a.rel = "noopener noreferrer";
      const szText = fileTransferManager ? _humanSize(size) : "";
      a.innerHTML = `<span>📄</span><span class="file-name">${_escapeHtml(name)}</span><span class="file-size">${szText}</span><span class="file-hint">↓</span>`;
      right.append(hdr, a);
    }

    wrap.append(avi, right);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function _humanSize(bytes) {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes/1024).toFixed(1) + " KB";
    return (bytes/1048576).toFixed(1) + " MB";
  }

  function _escapeHtml(s) {
    return String(s)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;");
  }

  /* Call UI */
  function updateCallUI(inCall, camOn, muted, deafened, screen) {
    joinBtn.disabled  = inCall;
    leaveBtn.disabled = !inCall;
    leaveBtn.classList.toggle("in-call", inCall);
    leaveBtn.classList.toggle("not-in-call", !inCall);
    leaveBtn.innerHTML = inCall ? '<span>📵</span> Leave' : '<span>🔌</span> Leave';

    [btnCam, btnMute, btnDeaf, btnScreen].forEach(b => b.disabled = !inCall);

    // Camera: active (red) = OFF, normal = ON
    btnCam.querySelector("small").textContent = camOn ? "Cam On" : "Cam Off";
    btnCam.classList.toggle("active", !camOn);
    btnCam.querySelector("span").textContent = camOn ? "📷" : "📷";

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
  function setFileProgress(show, label = "", pct = 0) {
    fpBar.classList.toggle("hidden", !show);
    if (show) {
      fpLabel.textContent = label;
      fpFill.style.width  = pct + "%";
      fpPct.textContent   = pct + "%";
    }
  }

  /* Lightbox */
  function openLightbox(src) {
    lbImg.src = src;
    lightbox.classList.remove("hidden");
  }

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

  /* Navigation */
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

  /* Copy ID */
  document.getElementById("copy-id").onclick = () => {
    navigator.clipboard.writeText(document.getElementById("my-id").textContent)
      .then(() => uiController.toast("Node ID copied!"));
  };

  /* Create room */
  document.getElementById("host").onclick = () => {
    const un = document.getElementById("username")?.value.trim();
    if (un) { accountManager.save({ username: un }); uiController.initAvatarDisplay(); }
    uiController.appendSystemMessage("Room created — share your Node ID");
    uiController.toast("Room ready! Share your ID.");
  };

  /* Join room */
  document.getElementById("join").onclick = () => {
    const un = document.getElementById("username")?.value.trim();
    if (un) { accountManager.save({ username: un }); uiController.initAvatarDisplay(); }
    const hostId = document.getElementById("host-id").value.trim();
    if (!hostId) { uiController.toast("Paste a peer ID first."); return; }
    peerManager.connectTo(hostId);
    uiController.appendSystemMessage("Connecting to peer…");
  };

  /* Username live update */
  const unInput = document.getElementById("username");
  if (unInput) {
    unInput.addEventListener("input", e => {
      const acc = accountManager.get();
      uiController._applyAvatar(document.getElementById("my-avatar"), e.target.value || "?", acc.avatar);
      uiController._applyAvatar(document.getElementById("my-avatar-mini"), e.target.value || "?", acc.avatar);
      document.getElementById("my-username-display").textContent = e.target.value || "Anonymous";
    });
  }

  /* Account save */
  document.getElementById("acc-save").onclick = () => {
    const un = document.getElementById("username")?.value.trim() || "Anonymous";
    accountManager.save({ username: un });
    uiController.initAvatarDisplay();
    uiController.toast("Account saved!");
    peerManager.broadcast({ type: "profile", user: un, avatar: accountManager.get().avatar });
  };

  /* Account export */
  document.getElementById("acc-export").onclick = () => accountManager.exportJSON();

  /* Account import */
  document.getElementById("acc-import").onchange = async function() {
    const file = this.files[0];
    if (!file) return;
    this.value = "";
    try {
      const acc = await accountManager.importJSON(file);
      uiController.initAvatarDisplay();
      uiController.toast(`Account loaded: ${acc.username}`);
    } catch (e) { uiController.toast("Import failed: " + e.message); }
  };

  /* Avatar upload (account panel) */
  document.getElementById("avatar-input").onchange = function() {
    _handleAvatarFile(this.files[0]);
    this.value = "";
  };
  /* Avatar upload (mini, sidebar) */
  document.getElementById("avatar-input-mini").onchange = function() {
    _handleAvatarFile(this.files[0]);
    this.value = "";
  };

  function _handleAvatarFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const sz = 64, canvas = document.createElement("canvas");
        canvas.width = canvas.height = sz;
        const ctx = canvas.getContext("2d");
        ctx.beginPath(); ctx.arc(sz/2, sz/2, sz/2, 0, Math.PI*2); ctx.clip();
        const sc = Math.max(sz/img.width, sz/img.height);
        const w = img.width*sc, h = img.height*sc;
        ctx.drawImage(img, (sz-w)/2, (sz-h)/2, w, h);
        const avatar = canvas.toDataURL("image/jpeg", 0.75);
        accountManager.save({ avatar });
        uiController.initAvatarDisplay();
        peerManager.broadcast({ type: "profile", user: accountManager.get().username, avatar });
        uiController.toast("Avatar updated!");
      };
    };
    reader.readAsDataURL(file);
  }

  /* Voice controls */
  document.getElementById("join-call").onclick  = () => mediaManager.startCall();
  document.getElementById("leave-call").onclick = () => mediaManager.leaveCall();
  document.getElementById("btn-camera").onclick  = () => mediaManager.toggleCamera();
  document.getElementById("btn-mute").onclick    = () => mediaManager.toggleMute();
  document.getElementById("btn-deafen").onclick  = () => mediaManager.toggleDeafen();
  document.getElementById("btn-screen").onclick  = () => mediaManager.toggleScreen();

  /* Chat send */
  document.getElementById("send").onclick = sendChat;
  document.getElementById("message").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });

  function sendChat() {
    const text = document.getElementById("message").value.trim();
    if (!text) return;
    document.getElementById("message").value = "";
    const acc = accountManager.get();
    uiController.appendMessage({ user: acc.username, text, avatar: acc.avatar, isSelf: true });
    peerManager.broadcast({ type: "message", user: acc.username, text, msgId: crypto.randomUUID() });
  }

  /* File input (toolbar) */
  document.getElementById("file-input").onchange = function() {
    const file = this.files[0]; if (!file) return; this.value = "";
    fileTransferManager.sendFile(file);
  };
  /* File input (chat bar) */
  document.getElementById("file-input-chat").onchange = function() {
    const file = this.files[0]; if (!file) return; this.value = "";
    fileTransferManager.sendFile(file);
  };

  /* Lightbox close */
  document.querySelector(".lightbox-bg").onclick = () => {
    document.getElementById("lightbox").classList.add("hidden");
  };
  document.querySelector(".lightbox-close").onclick = () => {
    document.getElementById("lightbox").classList.add("hidden");
  };
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") document.getElementById("lightbox").classList.add("hidden");
  });

  /* host-id enter key */
  document.getElementById("host-id").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("join").click();
  });

})();

/* ============================================================
   INIT
============================================================ */
(function init() {
  accountManager.load();
  peerManager.init();
  emojiSystem.init();
  uiController.updateCallUI(false, false, false, false, false);
  uiController.appendSystemMessage("NexTalk started — create a room or join a peer");
})();
