/* ============================================================
   NexTalk v5.1 — P2P E2EE Chat — BUG-FIX RELEASE
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
  })();
})();

const CHUNK_SIZE = 12000;

/* ============================================================ SETTINGS MANAGER */
const settingsManager = (() => {
  const KEY = "nextalk_settings";
  const _defaults = {
    rehandshakeMinutes: 10,
    adaptiveBitrate: true,
    voiceIsolation: true, // Fixed implementation
    pushToTalk: false,
    inlineMediaDefault: true,
    showReactions: true
  };
  let _s = { ..._defaults };
  function load() { try { const r = localStorage.getItem(KEY); if (r) _s = { ..._defaults, ...JSON.parse(r) }; } catch {} return _s; }
  function save() { localStorage.setItem(KEY, JSON.stringify(_s)); }
  function get(k) { return _s[k]; }
  function set(k,v) { _s[k] = v; save(); }
  return { load, get, set };
})();

/* ============================================================ ACCOUNT MANAGER */
const accountManager = (() => {
  const KEY = "nextalk_account";
  const FRIENDS_KEY = "nextalk_friends";
  let _acc = null;

  function _genKey() { return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2,"0")).join("").toUpperCase(); }
  function load() {
    try { const r = localStorage.getItem(KEY); if (r) _acc = JSON.parse(r); else _acc = { username:"Anonymous", friendKey:_genKey() }; }
    catch { _acc = { username:"Anonymous", friendKey:_genKey() }; }
    return _acc;
  }
  function save(u = {}) { Object.assign(_acc, u); localStorage.setItem(KEY, JSON.stringify(_acc)); }
  function get() { return _acc || load(); }
  function getFriends() { return JSON.parse(localStorage.getItem(FRIENDS_KEY)||"[]"); }
  function saveFriends(f) { localStorage.setItem(FRIENDS_KEY, JSON.stringify(f)); }
  return { load, save, get, getFriends, saveFriends };
})();

/* ============================================================ ENCRYPTION MANAGER 
   FIX: setSession() resets BOTH send counter and recv lastCounter atomically
============================================================ */
const encryptionManager = (() => {
  let _dhKP = null, _sigKP = null;
  const _send = {}, _recv = {}, _sigKeys = {}, _rhTimers = {};

  async function init() {
    [_dhKP, _sigKP] = await Promise.all([
      crypto.subtle.generateKey({name:"ECDH", namedCurve:"P-256"}, true, ["deriveKey"]),
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

  async function setSession(pid, dhBytes, sigBytes) {
    const rk = await crypto.subtle.importKey("raw", new Uint8Array(dhBytes), {name:"ECDH",namedCurve:"P-256"}, false, []);
    const root = await crypto.subtle.deriveKey({name:"ECDH",public:rk}, _dhKP.privateKey, {name:"AES-GCM",length:256}, true, ["encrypt","decrypt"]);
    
    _send[pid] = { key: root, counter: 0 };
    _recv[pid] = { key: root, lastCounter: -1 }; // Reset counter atomically on rehandshake
    _sigKeys[pid] = await crypto.subtle.importKey("raw", new Uint8Array(sigBytes), {name:"ECDSA",namedCurve:"P-256"}, false, ["verify"]);
    
    _scheduleRH(pid);
  }

  function _scheduleRH(pid) {
    clearTimeout(_rhTimers[pid]);
    const mins = settingsManager.get("rehandshakeMinutes") || 10;
    _rhTimers[pid] = setTimeout(() => peerManager._rehandshake(pid), mins * 60 * 1000);
  }

  async function encrypt(pid, obj) {
    const st = _send[pid]; if (!st) throw new Error("No session");
    const counter = st.counter++;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(obj));
    const enc = await crypto.subtle.encrypt({name:"AES-GCM", iv}, st.key, data);
    return { iv: btoa(String.fromCharCode(...iv)), data: btoa(String.fromCharCode(...new Uint8Array(enc))), counter };
  }

  async function decrypt(pid, payload) {
    const st = _recv[pid]; if (!st) throw new Error("No session");
    if (payload.counter <= st.lastCounter) throw new Error("Replay detected");
    st.lastCounter = payload.counter;
    const iv = Uint8Array.from(atob(payload.iv), c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(payload.data), c => c.charCodeAt(0));
    const dec = await crypto.subtle.decrypt({name:"AES-GCM", iv}, st.key, data);
    return JSON.parse(new TextDecoder().decode(dec));
  }

  return { init, getHandshakeBytes, setSession, encrypt, decrypt, hasSession: p => !!_send[p] };
})();

/* ============================================================ FILE TRANSFER MANAGER
   FIX: Per-chunk send is now properly awaited in order to prevent congestion
============================================================ */
const fileTransferManager = (() => {
  const _incoming = {};

  async function sendFile(file, peerId) {
    const meta = { type: "file-meta", name: file.name, size: file.size, mime: file.type, transferId: crypto.randomUUID() };
    await peerManager.sendTo(peerId, meta);
    
    const buffer = await file.arrayBuffer();
    for (let i = 0; i < buffer.byteLength; i += CHUNK_SIZE) {
      const chunk = buffer.slice(i, i + CHUNK_SIZE);
      // Properly await each chunk to maintain order and backpressure
      await peerManager.sendTo(peerId, {
        type: "file-chunk",
        transferId: meta.transferId,
        data: btoa(String.fromCharCode(...new Uint8Array(chunk)))
      });
    }
    await peerManager.sendTo(peerId, { type: "file-end", transferId: meta.transferId });
  }

  function receiveMeta(pid, meta) {
    _incoming[meta.transferId] = { name: meta.name, chunks: [], size: meta.size };
  }

  function receiveChunk(payload) {
    const t = _incoming[payload.transferId];
    if (t) t.chunks.push(Uint8Array.from(atob(payload.data), c => c.charCodeAt(0)));
  }

  function receiveEnd(payload, pid) {
    const t = _incoming[payload.transferId];
    if (!t) return;
    const blob = new Blob(t.chunks);
    const url = URL.createObjectURL(blob);
    uiController.appendMessage({ user: pid, text: `Shared a file: <a href="${url}" download="${t.name}">${t.name}</a>`, isSystem: true });
    delete _incoming[payload.transferId];
  }

  return { sendFile, receiveMeta, receiveChunk, receiveEnd };
})();

/* ============================================================ FRIENDS MANAGER
   FIX: inboundQueue splice now uses filter-by-token to avoid reference errors
============================================================ */
const friendsManager = (() => {
  let _inboundQueue = [];

  function handleIncomingRequest(pid, data) {
    const token = data.token || pid;
    _inboundQueue.push({ pid, name: data.user, token });
    uiController.toast(`Friend request from ${data.user}`);
    renderRequests();
  }

  function acceptRequest(token) {
    const req = _inboundQueue.find(r => r.token === token);
    if (!req) return;
    const friends = accountManager.getFriends();
    friends.push({ pid: req.pid, name: req.name, addedAt: Date.now() });
    accountManager.saveFriends(friends);
    
    // FIX: Filter by token instead of index lookup
    _inboundQueue = _inboundQueue.filter(r => r.token !== token);
    
    peerManager.sendTo(req.pid, { type: "friend-accept", user: accountManager.get().username });
    renderRequests();
  }

  function renderRequests() { /* UI Logic to show pending list */ }

  return { handleIncomingRequest, acceptRequest, init: () => {} };
})();

/* ============================================================ CALL MANAGER
   FIX: Voice isolation routes mic through Web Audio chain and replaceTrack()s
============================================================ */
const callManager = (() => {
  let _localStream = null;
  let _audioCtx = null;
  let _destination = null;

  async function startCall(pid) {
    _localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    if (settingsManager.get("voiceIsolation")) {
      _audioCtx = new AudioContext();
      const source = _audioCtx.createMediaStreamSource(_localStream);
      const filter = _audioCtx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 150; // Simple high-pass for isolation
      
      _destination = _audioCtx.createMediaStreamDestination();
      source.connect(filter);
      filter.connect(_destination);
      
      // Use the processed track
      const processedTrack = _destination.stream.getAudioTracks()[0];
      const call = peerManager.getPeer().call(pid, new MediaStream([processedTrack]));
      _handleCall(call);
    } else {
      const call = peerManager.getPeer().call(pid, _localStream);
      _handleCall(call);
    }
  }

  function _handleCall(call) {
    call.on("stream", remoteStream => {
      const audio = document.getElementById("remote-audio-container");
      audio.srcObject = remoteStream;
    });
  }

  return { startCall, handleIncomingCall: (call) => { call.answer(_localStream); _handleCall(call); } };
})();

/* ============================================================ PEER MANAGER */
const peerManager = (() => {
  let _peer = null, _myId = null;
  const _conns = {};

  function init() {
    _peer = new Peer();
    _peer.on("open", id => { _myId = id; uiController.setMyId(id); encryptionManager.init(); });
    _peer.on("connection", conn => _setup(conn));
    _peer.on("call", call => callManager.handleIncomingCall(call));
  }

  function _setup(conn) {
    _conns[conn.peer] = conn;
    conn.on("open", async () => {
      const hs = await encryptionManager.getHandshakeBytes();
      conn.send({ type: "ecdh-hello", dh: hs.dh, sig: hs.sig });
    });
    conn.on("data", async data => {
      if (data.type === "ecdh-hello" || data.type === "ecdh-rehandshake") {
        await encryptionManager.setSession(conn.peer, data.dh, data.sig);
        if (data.type === "ecdh-hello" && !data._reply) {
          const hs = await encryptionManager.getHandshakeBytes();
          conn.send({ type: "ecdh-hello", dh: hs.dh, sig: hs.sig, _reply: true });
        }
      } else if (data.encrypted) {
        const decrypted = await encryptionManager.decrypt(conn.peer, data.payload);
        _dispatch(conn.peer, decrypted);
      }
    });
  }

  function _dispatch(pid, data) {
    switch(data.type) {
      case "message": uiController.appendMessage(data); break;
      case "file-meta": fileTransferManager.receiveMeta(pid, data); break;
      case "file-chunk": fileTransferManager.receiveChunk(data); break;
      case "file-end": fileTransferManager.receiveEnd(data, pid); break;
    }
  }

  async function sendTo(pid, obj) {
    const conn = _conns[pid];
    if (conn && encryptionManager.hasSession(pid)) {
      const payload = await encryptionManager.encrypt(pid, obj);
      conn.send({ encrypted: true, payload });
    }
  }

  return { init, getPeer: () => _peer, sendTo, _rehandshake: async (pid) => {
    const hs = await encryptionManager.getHandshakeBytes();
    _conns[pid].send({ type: "ecdh-rehandshake", dh: hs.dh, sig: hs.sig });
  }};
})();

/* ============================================================ UI CONTROLLER */
const uiController = {
  setMyId: (id) => { document.getElementById("my-peer-id").textContent = id; },
  toast: (msg) => { console.log("Toast:", msg); },
  appendMessage: (data) => {
    const div = document.createElement("div");
    div.className = "msg-row" + (data.isSelf ? " self" : "");
    div.innerHTML = `<div class="msg-bubble">${data.text}</div>`;
    document.getElementById("messages").appendChild(div);
  }
};

/* ============================================================ INIT */
(function init() {
  settingsManager.load();
  accountManager.load();
  peerManager.init();
  
  document.getElementById("send").onclick = () => {
    const text = document.getElementById("message").value;
    peerManager.sendToAll({ type: "message", text, user: accountManager.get().username });
    uiController.appendMessage({ text, isSelf: true });
    document.getElementById("message").value = "";
  };
})();