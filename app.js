/* ============================================================
   NexTalk — Modular P2P E2EE Chat  v2.0
   Modules: accountManager · encryptionManager · peerManager ·
            meshNetwork · callManager · dmManager · filePermissionManager ·
            fileTransferManager · embedRenderer · emojiManager ·
            mediaProtectionManager · uiController
============================================================ */
"use strict";

/* ============================================================
   SOURCE PROTECTION
============================================================ */
(function sourceProtection() {
  document.addEventListener("contextmenu", e => e.preventDefault());
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
  const EMOJI_KEY   = "nextalk_custom_emojis";
  let _account = null;

  function _defaultAccount() {
    return {
      username: "Anonymous",
      avatar: null,
      preferences: {},
      encryptionKeys: null,
      customEmojis: {}
      // NOTE: peerId is intentionally excluded from exported accounts
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Strip any accidentally-saved peerId/session state on load
        delete parsed.peerId;
        _account = { ..._defaultAccount(), ...parsed };
      } else {
        _account = _defaultAccount();
      }
    } catch { _account = _defaultAccount(); }
    return _account;
  }

  function save(updates = {}) {
    // Never persist session identifiers
    delete updates.peerId;
    Object.assign(_account, updates);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_account));
  }

  function get() { return _account || load(); }

  function exportJSON() {
    // Ensure no peerId in export
    const exportData = { ..._account };
    delete exportData.peerId;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
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
          // Strip session data from imported file
          delete parsed.peerId;
          _account = { ..._defaultAccount(), ...parsed };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(_account));
          // Restore custom emojis
          if (parsed.customEmojis) {
            localStorage.setItem(EMOJI_KEY, JSON.stringify(parsed.customEmojis));
          }
          resolve(_account);
        } catch { reject(new Error("Invalid account file")); }
      };
      reader.readAsText(file);
    });
  }

  function saveCustomEmojis(emojis) {
    _account.customEmojis = emojis;
    save({ customEmojis: emojis });
  }

  function getCustomEmojis() {
    try {
      return _account?.customEmojis || JSON.parse(localStorage.getItem(EMOJI_KEY) || "{}");
    } catch { return {}; }
  }

  return { load, save, get, exportJSON, importJSON, saveCustomEmojis, getCustomEmojis };
})();

/* ============================================================
   ENCRYPTION MANAGER
============================================================ */
const encryptionManager = (() => {
  let _keyPair = null;
  const _sessionKeys = {};

  async function init() {
    _keyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]
    );
  }

  async function getPublicKeyBytes() {
    const raw = await crypto.subtle.exportKey("raw", _keyPair.publicKey);
    return Array.from(new Uint8Array(raw));
  }

  async function setKey(peerId, remotePubBytes) {
    const buf = new Uint8Array(remotePubBytes).buffer;
    const remotePub = await crypto.subtle.importKey(
      "raw", buf, { name: "ECDH", namedCurve: "P-256" }, false, []
    );
    _sessionKeys[peerId] = await crypto.subtle.deriveKey(
      { name: "ECDH", public: remotePub },
      _keyPair.privateKey,
      { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  }

  function hasKey(peerId) { return !!_sessionKeys[peerId]; }
  function removeKey(peerId) { delete _sessionKeys[peerId]; }

  async function encrypt(peerId, obj) {
    const key = _sessionKeys[peerId];
    if (!key) throw new Error("No session key for " + peerId);
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, raw);
    return {
      iv:   btoa(String.fromCharCode(...iv)),
      data: btoa(String.fromCharCode(...new Uint8Array(enc)))
    };
  }

  async function decrypt(peerId, payload) {
    const key  = _sessionKeys[peerId];
    if (!key) throw new Error("No session key for " + peerId);
    const iv   = Uint8Array.from(atob(payload.iv),   c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(payload.data), c => c.charCodeAt(0));
    const dec  = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return JSON.parse(new TextDecoder().decode(dec));
  }

  return { init, getPublicKeyBytes, setKey, hasKey, removeKey, encrypt, decrypt };
})();

/* ============================================================
   FILE PERMISSION MANAGER
   Implements P2P download permission requests
============================================================ */
const filePermissionManager = (() => {
  // token → { resolve, blob, name }
  const _pendingApprovals = {};
  // one-use download tokens
  const _tokens = {};

  // Called on sender: receive a download request from a peer
  function handleRequest(fromPeer, { tokenId, fileName }) {
    const profile = peerManager.getProfile(fromPeer);
    const senderName = profile.username || fromPeer.slice(0, 8);

    // Show approval dialog
    const overlay = document.createElement("div");
    overlay.className = "perm-dialog-overlay";
    overlay.innerHTML = `
      <div class="perm-dialog">
        <div class="perm-icon">📥</div>
        <div class="perm-title">Download Request</div>
        <div class="perm-msg"><strong>${_esc(senderName)}</strong> wants to download<br><em>${_esc(fileName)}</em></div>
        <div class="perm-btns">
          <button class="btn btn-primary btn-sm perm-allow">Allow</button>
          <button class="btn perm-deny" style="background:var(--accent-red);color:#fff">Deny</button>
        </div>
      </div>`;
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

  // Called on requester: received response to our download request
  function handleResponse({ tokenId, approved }) {
    const pending = _pendingApprovals[tokenId];
    if (!pending) return;
    delete _pendingApprovals[tokenId];
    if (approved) {
      pending.resolve(true);
    } else {
      pending.resolve(false);
      uiController.toast("Download denied by sender.");
    }
  }

  // Called on requester: ask sender for permission, returns Promise<bool>
  function requestPermission(senderPeerId, blob, name) {
    return new Promise(resolve => {
      const tokenId = crypto.randomUUID();
      _pendingApprovals[tokenId] = { resolve, blob, name };
      peerManager.sendTo(senderPeerId, {
        type: "download-request",
        tokenId,
        fileName: name
      });
      // Timeout after 30s
      setTimeout(() => {
        if (_pendingApprovals[tokenId]) {
          delete _pendingApprovals[tokenId];
          resolve(false);
          uiController.toast("Download request timed out.");
        }
      }, 30000);
    });
  }

  // Execute a permitted download
  function executeDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href    = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function _esc(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  return { handleRequest, handleResponse, requestPermission, executeDownload };
})();

/* ============================================================
   PEER MANAGER + MESH NETWORK
============================================================ */
const peerManager = (() => {
  let _peer = null;
  let _myId = null;

  const _connections  = {};
  const _peerProfiles = {};
  const _pendingConns = new Set();

  function init() {
    _peer = new Peer();
    _peer.on("open", async id => {
      _myId = id;
      // Note: we do NOT save peerId to account
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
  function getProfile(peerId) {
    return _peerProfiles[peerId] || { username: peerId?.slice(0, 8), avatar: null };
  }
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
    if (_connections[conn.peer]) { conn.close(); return; }
    _connections[conn.peer] = conn;
    uiController.updatePeerList(_connections, _peerProfiles);

    conn.on("open", async () => {
      _pendingConns.delete(conn.peer);
      const pub = await encryptionManager.getPublicKeyBytes();
      conn.send({ type: "ecdh-hello", pub });
    });

    conn.on("data", async raw => {
      try { await _handleRaw(conn, raw); }
      catch (e) { console.warn("Data error:", e); }
    });

    conn.on("close", () => _teardown(conn.peer));
    conn.on("error", e => { console.error("Conn error:", e); _teardown(conn.peer); });
  }

  async function _handleRaw(conn, raw) {
    const pid = conn.peer;

    if (raw.type === "ecdh-hello") {
      await encryptionManager.setKey(pid, raw.pub);
      if (!raw._reply) {
        const pub = await encryptionManager.getPublicKeyBytes();
        conn.send({ type: "ecdh-hello", pub, _reply: true });
      }
      await sendEncrypted(conn, {
        type: "profile",
        user: accountManager.get().username,
        avatar: accountManager.get().avatar
      });
      const knownPeers = Object.keys(_connections).filter(p => p !== pid);
      if (knownPeers.length) {
        await sendEncrypted(conn, { type: "mesh-peers", peers: knownPeers });
      }
      if (callManager.isInCall()) {
        callManager.callPeer(pid);
      }
      return;
    }

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
        if (Array.isArray(data.peers)) data.peers.forEach(id => connectTo(id));
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

  function _teardown(peerId) {
    delete _connections[peerId];
    _pendingConns.delete(peerId);
    encryptionManager.removeKey(peerId);
    uiController.updatePeerList(_connections, _peerProfiles);
    uiController.appendSystemMessage("A peer left the mesh");
    callManager.removePeerCall(peerId);
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
   CALL MANAGER (refactored from mediaManager)
============================================================ */
const callManager = (() => {
  const _calls      = {};
  let _localStream  = null;
  let _inCall       = false;
  let _cameraOn     = false;
  let _muted        = false;
  let _deafened     = false;
  let _screenShare  = false;
  let _fsEl         = null;

  function isInCall() { return _inCall; }

  async function startCall() {
    if (_inCall) return;
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
    _cameraOn = false;
    _localStream.getVideoTracks().forEach(t => { t.enabled = false; });
    _inCall = true;
    uiController.updateCallUI(true, false, false, false, false);
    _addVideoEl("local", _localStream, true);

    // Call all connected mesh peers
    Object.keys(peerManager.getConnections()).forEach(pid => callPeer(pid));
    // Broadcast call state
    _broadcastCallState();
    uiController.toast("Joined voice channel.");
  }

  function callPeer(pid) {
    if (_calls[pid] || !_localStream) return;
    const call = peerManager.getPeer().call(pid, _localStream);
    _setupCall(call);
  }

  function handleIncomingCall(call) {
    // Prevent duplicate call objects
    if (_calls[call.peer]) { call.close(); return; }
    call.answer(_localStream || new MediaStream());
    _setupCall(call);
    if (!_inCall) {
      _inCall = true;
      uiController.updateCallUI(true, _cameraOn, _muted, _deafened, _screenShare);
    }
  }

  function _setupCall(call) {
    _calls[call.peer] = call;
    call.on("stream", stream => {
      // Prevent duplicate stream elements
      _addVideoEl(call.peer, stream, false);
    });
    call.on("close",  () => _removeVideoEl(call.peer));
    call.on("error",  e  => { console.error("Call error:", e); _removeVideoEl(call.peer); });
  }

  function removePeerCall(peerId) {
    if (_calls[peerId]) {
      try { _calls[peerId].close(); } catch {}
      delete _calls[peerId];
    }
    _removeVideoEl(peerId);
  }

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
    _localStream.getAudioTracks().forEach(t => { t.enabled = !_muted; });
    if (_muted) _deafened = false;
    uiController.updateCallUI(_inCall, _cameraOn, _muted, _deafened, _screenShare);
    _broadcastCallState();
  }

  function toggleDeafen() {
    if (!_inCall || !_localStream) return;
    _deafened = !_deafened;
    document.querySelectorAll(".video-grid video:not(.local-vid)").forEach(v => { v.muted = _deafened; });
    if (_deafened) {
      _muted = true;
      _localStream.getAudioTracks().forEach(t => { t.enabled = false; });
    } else {
      _localStream.getAudioTracks().forEach(t => { t.enabled = !_muted; });
    }
    uiController.updateCallUI(_inCall, _cameraOn, _muted, _deafened, _screenShare);
    _broadcastCallState();
  }

  async function toggleScreen() {
    if (!_inCall || !_localStream) return;
    if (!_screenShare) {
      try {
        const ss = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        // Activate DRM since screen sharing is now active on the other end
        mediaProtectionManager.onScreenShareStart();
        const st = ss.getVideoTracks()[0];
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
        _broadcastCallState();
      } catch { uiController.toast("Screen share cancelled."); }
    } else {
      stopScreen();
    }
  }

  async function stopScreen() {
    if (!_screenShare) return;
    _screenShare = false;
    mediaProtectionManager.onScreenShareEnd();
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
    _broadcastCallState();
  }

  // Broadcast our call state to all peers for UI sync
  function _broadcastCallState() {
    peerManager.broadcast({
      type: "call-state",
      inCall: _inCall,
      cameraOn: _cameraOn,
      muted: _muted,
      screenShare: _screenShare
    });
  }

  // Receive a peer's call state for UI indicator
  function handlePeerState(peerId, data) {
    const el = document.getElementById("vwrap-" + peerId);
    if (el) {
      el.dataset.muted  = data.muted ? "1" : "0";
      el.dataset.camera = data.cameraOn ? "1" : "0";
      const label = el.querySelector(".video-label");
      if (label) {
        const profile = peerManager.getProfile(peerId);
        label.textContent = (profile?.username || peerId.slice(0,8))
          + (data.muted ? " 🔇" : "")
          + (data.cameraOn ? "" : " 📷✕");
      }
    }
  }

  function _addVideoEl(id, stream, isLocal) {
    const vg = document.getElementById("video-grid");
    let wrap = document.getElementById("vwrap-" + id);
    if (wrap) {
      wrap.querySelector("video").srcObject = stream;
      return;
    }

    wrap = document.createElement("div");
    wrap.id = "vwrap-" + id;
    wrap.className = "video-wrap" + (isLocal ? " local-wrap" : "");

    const v = document.createElement("video");
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    v.muted = !!isLocal;
    if (isLocal) v.classList.add("local-vid");

    const label = document.createElement("div");
    label.className = "video-label";
    const profile = isLocal ? { username: accountManager.get().username } : peerManager.getProfile(id);
    label.textContent = isLocal ? "You" : (profile?.username || id.slice(0, 8));

    const fsBtn = document.createElement("button");
    fsBtn.className = "fs-btn";
    fsBtn.textContent = "⛶ FS";
    fsBtn.onclick = e => { e.stopPropagation(); _goFullscreen(v, label.textContent); };
    v.ondblclick = () => _goFullscreen(v, label.textContent);

    wrap.append(v, label, fsBtn);
    vg.appendChild(wrap);
    vg.classList.remove("hidden");

    // Reflow grid size based on participant count
    _resizeGrid();

    if (mediaProtectionManager.isDrmActive()) {
      wrap.classList.add("drm-black");
    }
  }

  function _removeVideoEl(id) {
    const el = document.getElementById("vwrap-" + id);
    if (el) el.remove();
    const vg = document.getElementById("video-grid");
    if (!vg.childElementCount) vg.classList.add("hidden");
    _resizeGrid();
  }

  function _resizeGrid() {
    const vg   = document.getElementById("video-grid");
    const count = vg.childElementCount;
    // Adjust max-height based on participant count
    if (count <= 2) vg.style.maxHeight = "200px";
    else if (count <= 4) vg.style.maxHeight = "300px";
    else vg.style.maxHeight = "400px";
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
    const escHandler = e => {
      if (e.key === "Escape") { _fsEl?.remove(); _fsEl = null; document.removeEventListener("keydown", escHandler); }
    };
    document.addEventListener("keydown", escHandler);
    _fsEl.append(clone, exitBtn);
    document.body.appendChild(_fsEl);
  }

  function applyDRMBlackout(active) {
    document.querySelectorAll(".video-wrap").forEach(w => w.classList.toggle("drm-black", active));
    const overlay = document.getElementById("drm-overlay");
    if (overlay) overlay.classList.toggle("hidden", !active);
  }

  function getLocalStream() { return _localStream; }

  return {
    isInCall, startCall, callPeer, handleIncomingCall, removePeerCall, leaveCall,
    toggleCamera, toggleMute, toggleDeafen, toggleScreen, stopScreen,
    handlePeerState, applyDRMBlackout, getLocalStream
  };
})();

// Alias for legacy compatibility
const mediaManager = callManager;

/* ============================================================
   MEDIA PROTECTION MANAGER
   Best-effort screen capture deterrence
============================================================ */
const mediaProtectionManager = (() => {
  let _drmActive   = false;
  let _screenShareActive = false;

  function isDrmActive() { return _drmActive; }

  function _activate(reason) {
    if (_drmActive) return;
    _drmActive = true;
    callManager.applyDRMBlackout(true);
    console.info("[DRM] Protection activated:", reason);
  }

  function _deactivate() {
    if (!_drmActive) return;
    _drmActive = false;
    // Only deactivate if no screen share is active
    if (!_screenShareActive) {
      callManager.applyDRMBlackout(false);
    }
  }

  function onScreenShareStart() {
    _screenShareActive = true;
    _activate("local screen share started");
  }

  function onScreenShareEnd() {
    _screenShareActive = false;
    if (_drmActive && !_screenShareActive) {
      _deactivate();
    }
  }

  function init() {
    // Visibility change — tab hidden may mean screen capture tool active
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) _activate("tab hidden");
      else _deactivate();
    });

    // Focus loss can indicate screen recording or alt-tab during capture
    window.addEventListener("blur", () => {
      // Only flag if video streams are active
      if (callManager.isInCall()) _activate("window lost focus");
    });
    window.addEventListener("focus", () => {
      if (!_screenShareActive) _deactivate();
    });

    // Capture handle API (Chrome) — detect if this page is being captured
    if (navigator.mediaDevices?.setCaptureHandleConfig) {
      try {
        navigator.mediaDevices.setCaptureHandleConfig({ handle: "nextalk-protected" });
      } catch {}
    }

    // Monitor display media via getDisplayMedia interception
    const _origGDM = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = async function(constraints) {
      _activate("getDisplayMedia called");
      const stream = await _origGDM(constraints);
      // If the user stops screen share externally
      stream.getVideoTracks().forEach(t => {
        t.addEventListener("ended", () => {
          if (!_screenShareActive) _deactivate();
        });
      });
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

  function _humanSize(bytes) {
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
      await _sendEnc(conn, meta);
      let offset = 0, chunkIndex = 0;
      while (offset < file.size) {
        const slice  = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await slice.arrayBuffer();
        const b64    = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        await _sendEnc(conn, { type: "file-chunk", id, index: chunkIndex, chunk: b64 });
        offset += CHUNK_SIZE;
        chunkIndex++;
        uiController.setFileProgress(true, file.name, Math.min(Math.round((offset / file.size) * 100), 100));
      }
      await _sendEnc(conn, { type: "file-end", id, totalChunks: chunkIndex });
    }

    uiController.setFileProgress(false);
    uiController.appendSystemMessage(`Sent: "${file.name}" (${_humanSize(file.size)})`);
  }

  async function _sendEnc(conn, obj) {
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
    const blob    = new Blob([merged]);
    const profile = peerManager.getProfile(pid);
    uiController.appendFileMessage(
      profile.username || "Peer",
      meta.name,
      meta.size,
      blob,
      profile.avatar || null,
      pid   // pass sender peer ID for permission requests
    );
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
  const _listeners = {};

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
    dmName.textContent = profile.username || peerId.slice(0, 8);
    uiController._applyAvatar(dmAvi, profile.username, profile.avatar);
    dmMsgs.innerHTML = "";
    (_history[peerId] || []).forEach(m => _renderDM(m));
    panel.classList.remove("hidden");
    panel.style.transform = "translateX(0)";
    dmInput.focus();
  }

  function close() {
    if (!_activePeer) return;

    // Clean up DM-specific listeners
    const pid = _activePeer;
    if (_listeners[pid]) {
      _listeners[pid].forEach(fn => fn());
      delete _listeners[pid];
    }

    _activePeer = null;

    // Animate out then hide
    panel.style.transform = "translateX(100%)";
    setTimeout(() => {
      panel.classList.add("hidden");
      panel.style.transform = "";
    }, 260);

    // Return focus to main chat
    document.getElementById("message")?.focus();
  }

  async function send() {
    const text = dmInput.value.trim();
    if (!text || !_activePeer) return;
    dmInput.value = "";
    const acc = accountManager.get();
    const msg = {
      type: "dm", user: acc.username, text,
      avatar: acc.avatar, msgId: crypto.randomUUID(), ts: Date.now()
    };
    _store(_activePeer, { ...msg, isSelf: true });
    _renderDM({ ...msg, isSelf: true });
    await peerManager.sendTo(_activePeer, msg);
  }

  function receiveMessage(fromPeer, data) {
    const profile = peerManager.getProfile(fromPeer);
    const msg = { ...data, isSelf: false, avatar: profile.avatar };
    _store(fromPeer, msg);
    if (_activePeer === fromPeer) {
      _renderDM(msg);
    } else {
      uiController.toast(`DM from ${profile.username || "Peer"}: ${data.text.slice(0, 40)}`);
      // Notification dot
      const item = document.querySelector(`.peer-item[data-peer="${fromPeer}"]`);
      if (item) {
        let dot = item.querySelector(".notif-dot");
        if (!dot) {
          dot = document.createElement("span");
          dot.className = "notif-dot";
          item.appendChild(dot);
        }
      }
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
      dmName.textContent = profile.username || peerId.slice(0, 8);
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

  function extractUrls(text) { return text.match(URL_RE) || []; }

  function buildEmbed(url) {
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
   Improved: horizontal scroll, custom emoji, :shortcode: autocomplete
============================================================ */
const emojiManager = (() => {
  const picker  = document.getElementById("emoji-picker");
  const trigger = document.getElementById("emoji-btn");
  let _target   = document.getElementById("message");
  let _customEmojis = {};  // name → dataURL

  // Build a rich shortcode map from built-in categories
  const _SHORTCODE_MAP = {
    smile:"😊", grin:"😁", laugh:"😂", heart:"❤️", fire:"🔥",
    check:"✅", wave:"👋", star:"⭐", sad:"😢", ok:"👌",
    clap:"👏", eyes:"👀", think:"🤔", party:"🎉", 100:"💯",
    thumbsup:"👍", thumbsdown:"👎", skull:"💀", shrug:"🤷",
    cry:"😭", love:"🥰", cool:"😎", angry:"😡", pray:"🙏"
  };

  function init() {
    _customEmojis = accountManager.getCustomEmojis();
    _buildPicker();
    trigger.onclick = toggle;
    document.addEventListener("click", e => {
      if (!picker.contains(e.target) && e.target !== trigger) {
        picker.classList.add("hidden");
      }
    });
    document.getElementById("message").addEventListener("input", _handleAutocomplete);
  }

  function setTarget(el) { _target = el; }

  function toggle() { picker.classList.toggle("hidden"); }

  function _buildPicker() {
    picker.innerHTML = "";

    // Search
    const search = document.createElement("input");
    search.className = "emoji-search";
    search.placeholder = "Search emoji…";
    picker.appendChild(search);

    // Tab row
    const tabRow = document.createElement("div");
    tabRow.className = "emoji-tabs";
    picker.appendChild(tabRow);

    // Category content
    const content = document.createElement("div");
    content.className = "emoji-content";
    picker.appendChild(content);

    const categories = { ...EMOJI_CATEGORIES };
    if (Object.keys(_customEmojis).length) {
      categories["Custom"] = Object.keys(_customEmojis);
    }

    let activeTab = null;

    function showCategory(catName) {
      activeTab = catName;
      content.innerHTML = "";
      tabRow.querySelectorAll(".emoji-tab").forEach(t => {
        t.classList.toggle("active", t.dataset.cat === catName);
      });

      const emojis = catName === "Custom"
        ? Object.keys(_customEmojis)
        : EMOJI_CATEGORIES[catName] || [];

      const grid = document.createElement("div");
      grid.className = "emoji-grid";
      emojis.forEach(e => {
        const btn = document.createElement("span");
        btn.className = "emoji-item";
        if (catName === "Custom") {
          const img = document.createElement("img");
          img.src = _customEmojis[e];
          img.style.cssText = "width:1.4em;height:1.4em;object-fit:contain";
          img.title = ":" + e + ":";
          btn.appendChild(img);
          btn.title = ":" + e + ":";
        } else {
          btn.textContent = e;
          btn.title = e;
        }
        btn.onclick = () => {
          _insertEmoji(catName === "Custom" ? _customEmojis[e] : e, catName === "Custom");
          picker.classList.add("hidden");
        };
        grid.appendChild(btn);
      });
      content.appendChild(grid);
    }

    Object.keys(categories).forEach((cat, i) => {
      const tab = document.createElement("button");
      tab.className = "emoji-tab";
      tab.dataset.cat = cat;
      tab.title = cat;
      // Icon for tab
      const icons = { Smileys:"😊", People:"👋", Nature:"🐶", Food:"🍎", Objects:"💡", Symbols:"❤️", Custom:"⭐" };
      tab.textContent = icons[cat] || cat[0];
      tab.onclick = () => showCategory(cat);
      tabRow.appendChild(tab);
      if (i === 0) showCategory(cat);
    });

    // Upload custom emoji
    const uploadRow = document.createElement("div");
    uploadRow.className = "emoji-upload-row";
    const uploadLabel = document.createElement("label");
    uploadLabel.className = "emoji-upload-btn";
    uploadLabel.innerHTML = `<span>＋ Custom Emoji</span>`;
    const fileInput = document.createElement("input");
    fileInput.type = "file"; fileInput.accept = "image/*";
    fileInput.style.display = "none";
    fileInput.onchange = function() {
      const file = this.files[0]; if (!file) return;
      const name = prompt("Emoji shortcode name (no spaces):", file.name.split(".")[0].replace(/\s+/g,"_"));
      if (!name) return;
      const reader = new FileReader();
      reader.onload = e => {
        _customEmojis[name] = e.target.result;
        accountManager.saveCustomEmojis(_customEmojis);
        _buildPicker();
        uiController.toast(`Custom emoji :${name}: added!`);
      };
      reader.readAsDataURL(file);
      this.value = "";
    };
    uploadLabel.appendChild(fileInput);
    uploadLabel.onclick = () => fileInput.click();
    uploadRow.appendChild(uploadLabel);
    picker.appendChild(uploadRow);

    // Search behavior — filters all categories
    search.addEventListener("input", () => {
      const q = search.value.toLowerCase();
      content.innerHTML = "";
      if (!q) { showCategory(activeTab || Object.keys(categories)[0]); return; }
      const grid = document.createElement("div");
      grid.className = "emoji-grid";
      Object.entries(EMOJI_CATEGORIES).forEach(([, emojis]) => {
        emojis.filter(e => e.includes(q)).forEach(e => {
          const btn = document.createElement("span");
          btn.className = "emoji-item";
          btn.textContent = e; btn.title = e;
          btn.onclick = () => { _insertEmoji(e, false); picker.classList.add("hidden"); };
          grid.appendChild(btn);
        });
      });
      content.appendChild(grid);
    });
  }

  function _insertEmoji(val, isCustom) {
    if (!_target) return;
    if (isCustom) {
      // Insert as image tag — not suitable for raw input; insert the :name: shortcode
      const name = Object.keys(_customEmojis).find(k => _customEmojis[k] === val);
      if (name) {
        const p = _target.selectionStart || 0;
        _target.value = _target.value.slice(0, p) + `:${name}:` + _target.value.slice(p);
        _target.focus();
        _target.selectionStart = _target.selectionEnd = p + name.length + 2;
      }
    } else {
      const p = _target.selectionStart || 0;
      _target.value = _target.value.slice(0, p) + val + _target.value.slice(p);
      _target.focus();
      _target.selectionStart = _target.selectionEnd = p + val.length;
    }
  }

  function _handleAutocomplete(e) {
    const el   = e.target;
    const text = el.value;
    const colonMatch = text.match(/:([a-zA-Z0-9_]+)$/);
    if (!colonMatch) return;
    const key = colonMatch[1].toLowerCase();

    // Check custom emojis first
    if (_customEmojis[key]) {
      el.value = text.slice(0, text.lastIndexOf(":")) + `:${key}:`;
      return;
    }
    // Check shortcode map
    if (_SHORTCODE_MAP[key]) {
      el.value = text.slice(0, text.lastIndexOf(":")) + _SHORTCODE_MAP[key];
    }
  }

  // Render custom emoji shortcodes in message text into images
  function renderCustomEmojis(container) {
    if (!Object.keys(_customEmojis).length) return;
    container.querySelectorAll(".msg-text").forEach(el => {
      Object.entries(_customEmojis).forEach(([name, src]) => {
        el.innerHTML = el.innerHTML.replace(
          new RegExp(`:${name}:`, "g"),
          `<img src="${src}" class="custom-emoji-inline" alt=":${name}:" title=":${name}:">`
        );
      });
    });
  }

  function getCustomEmojis() { return _customEmojis; }

  return { init, setTarget, toggle, renderCustomEmojis, getCustomEmojis };
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

  function _initialsColor(name) {
    const colors = ["#5b6aee","#e8519c","#3ecf6e","#f0a03a","#e8484b","#00b0f4","#ff7043","#ab47bc"];
    let h = 0;
    for (let i = 0; i < (name||"").length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
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
    const initials = (name||"?").trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
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
    const unInput = document.getElementById("username");
    if (unInput) unInput.value = acc.username || "";
  }

  function setMyId(id) { myIdEl.textContent = id; }

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
      const name = p.username || id.slice(0, 10);

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
        const dot = item.querySelector(".notif-dot");
        if (dot) dot.remove();
        dmManager.open(id);
      };
      peersEl.appendChild(item);
    });
  }

  function appendMessage({ user, text, avatar, isSelf, msgId }) {
    _appendMsgEl(messagesEl, { user, text, avatar, isSelf });
    emojiManager.renderCustomEmojis(messagesEl);
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
    tEl.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    hdr.append(uEl, tEl);

    const body = document.createElement("div");
    body.className = "msg-text";
    body.innerHTML = embedRenderer.parseLinks(_escapeHtml(text));

    right.append(hdr, body);

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

  function appendFileMessage(user, name, size, blob, avatar, senderPeer) {
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
    tEl.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    hdr.append(uEl, tEl);

    const isImg  = /\.(jpe?g|png|gif|webp|svg|avif)$/i.test(name);
    const isVid  = /\.(mp4|webm|ogg)$/i.test(name);
    const szText = _humanSizeLocal(size);

    if (isImg) {
      const url = URL.createObjectURL(blob);
      const imgWrap = document.createElement("div");
      imgWrap.className = "media-protected-wrap";

      const img = document.createElement("img");
      img.src = url; img.className = "msg-img"; img.loading = "lazy"; img.alt = name;
      img.onclick = () => openLightbox(url);

      const dlBtn = document.createElement("button");
      dlBtn.className = "media-dl-btn";
      dlBtn.textContent = "↓ Download";
      dlBtn.onclick = async () => {
        dlBtn.disabled = true; dlBtn.textContent = "Requesting…";
        const allowed = await filePermissionManager.requestPermission(senderPeer, blob, name);
        if (allowed) {
          filePermissionManager.executeDownload(blob, name);
          dlBtn.textContent = "✓ Downloading";
        } else {
          dlBtn.disabled = false; dlBtn.textContent = "↓ Download";
        }
      };

      imgWrap.append(img, dlBtn);
      right.append(hdr, imgWrap);
    } else if (isVid) {
      const url    = URL.createObjectURL(blob);
      const vidWrap = document.createElement("div");
      vidWrap.className = "media-protected-wrap";

      const v = document.createElement("video");
      v.src = url; v.controls = true;
      v.style.cssText = "max-width:320px;border-radius:10px;display:block;margin-top:6px";

      const dlBtn = document.createElement("button");
      dlBtn.className = "media-dl-btn";
      dlBtn.textContent = "↓ Download";
      dlBtn.onclick = async () => {
        dlBtn.disabled = true; dlBtn.textContent = "Requesting…";
        const allowed = await filePermissionManager.requestPermission(senderPeer, blob, name);
        if (allowed) {
          filePermissionManager.executeDownload(blob, name);
          dlBtn.textContent = "✓ Downloading";
        } else {
          dlBtn.disabled = false; dlBtn.textContent = "↓ Download";
        }
      };

      vidWrap.append(v, dlBtn);
      right.append(hdr, vidWrap);
    } else {
      // Non-media file: still uses permission system
      const fileRow = document.createElement("div");
      fileRow.className = "msg-file";
      fileRow.innerHTML = `<span>📄</span><span class="file-name">${_escapeHtml(name)}</span><span class="file-size">${szText}</span>`;
      const dlBtn = document.createElement("span");
      dlBtn.className = "file-hint";
      dlBtn.textContent = "↓";
      dlBtn.style.cursor = "pointer";
      dlBtn.onclick = async () => {
        dlBtn.textContent = "…";
        const allowed = await filePermissionManager.requestPermission(senderPeer, blob, name);
        if (allowed) {
          filePermissionManager.executeDownload(blob, name);
          dlBtn.textContent = "✓";
        } else {
          dlBtn.textContent = "↓";
        }
      };
      fileRow.appendChild(dlBtn);
      right.append(hdr, fileRow);
    }

    wrap.append(avi, right);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function _humanSizeLocal(bytes) {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function _escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function updateCallUI(inCall, camOn, muted, deafened, screen) {
    joinBtn.disabled  = inCall;
    leaveBtn.disabled = !inCall;
    leaveBtn.classList.toggle("in-call", inCall);
    leaveBtn.classList.toggle("not-in-call", !inCall);
    leaveBtn.innerHTML = inCall ? '<span>📵</span> Leave' : '<span>🔌</span> Leave';

    [btnCam, btnMute, btnDeaf, btnScreen].forEach(b => b.disabled = !inCall);

    btnCam.querySelector("small").textContent = camOn ? "Cam On" : "Cam Off";
    btnCam.classList.toggle("active", !camOn && inCall);
    btnCam.querySelector("span").textContent = camOn ? "📷" : "📷";

    btnMute.querySelector("span").textContent  = muted ? "🚫" : "🎙";
    btnMute.querySelector("small").textContent = muted ? "Unmute" : "Mute";
    btnMute.classList.toggle("active", muted);

    btnDeaf.querySelector("span").textContent  = deafened ? "🔇" : "🔊";
    btnDeaf.querySelector("small").textContent = deafened ? "Undeaf" : "Deaf";
    btnDeaf.classList.toggle("active", deafened);

    btnScreen.querySelector("small").textContent = screen ? "Stop" : "Share";
    btnScreen.classList.toggle("screen-active", screen);

    // Disable deafen-while-muted edge cases
    if (!inCall) {
      btnCam.title = ""; btnMute.title = ""; btnDeaf.title = ""; btnScreen.title = "";
    }
  }

  function setFileProgress(show, label = "", pct = 0) {
    fpBar.classList.toggle("hidden", !show);
    if (show) {
      fpLabel.textContent = label;
      fpFill.style.width  = pct + "%";
      fpPct.textContent   = pct + "%";
    }
  }

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

  /* Account export — excludes peerId */
  document.getElementById("acc-export").onclick = () => accountManager.exportJSON();

  /* Account import */
  document.getElementById("acc-import").onchange = async function() {
    const file = this.files[0]; if (!file) return;
    this.value = "";
    try {
      const acc = await accountManager.importJSON(file);
      uiController.initAvatarDisplay();
      emojiManager.init(); // Rebuild picker with imported custom emojis
      uiController.toast(`Account loaded: ${acc.username}`);
    } catch (e) { uiController.toast("Import failed: " + e.message); }
  };

  /* Avatar uploads */
  document.getElementById("avatar-input").onchange = function() {
    _handleAvatarFile(this.files[0]); this.value = "";
  };
  document.getElementById("avatar-input-mini").onchange = function() {
    _handleAvatarFile(this.files[0]); this.value = "";
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
  document.getElementById("join-call").onclick  = () => callManager.startCall();
  document.getElementById("leave-call").onclick = () => callManager.leaveCall();
  document.getElementById("btn-camera").onclick  = () => callManager.toggleCamera();
  document.getElementById("btn-mute").onclick    = () => callManager.toggleMute();
  document.getElementById("btn-deafen").onclick  = () => callManager.toggleDeafen();
  document.getElementById("btn-screen").onclick  = () => callManager.toggleScreen();

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

  /* File inputs */
  document.getElementById("file-input").onchange = function() {
    const file = this.files[0]; if (!file) return; this.value = "";
    fileTransferManager.sendFile(file);
  };
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
  emojiManager.init();
  mediaProtectionManager.init();
  uiController.updateCallUI(false, false, false, false, false);
  uiController.appendSystemMessage("NexTalk started — create a room or join a peer");
})();
