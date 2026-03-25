/* ============================================================
   NexTalk — P2P E2EE Chat
   Per-connection AES-256-GCM encryption (ECDH key exchange)
============================================================ */

/* ============================================================
   STATE
============================================================ */
const peer = new Peer();

let username        = "Anonymous";
let myAvatar        = null;       // base64 data URL or null

const connections   = {};         // peerId → DataConnection
const mediaCalls    = {};         // peerId → MediaConnection
const peerUsernames = {};         // peerId → string
const peerAvatars   = {};         // peerId → base64 or null

let localStream     = null;
let isInCall        = false;

const sessionKeys   = {};         // peerId → CryptoKey (AES-256-GCM)
let myECDHKeyPair   = null;

/* Media state — camera OFF by default */
let isMuted       = false;
let isDeafened    = false;
let isScreenShare = false;
let cameraOn      = false;

/* ============================================================
   UI REFS
============================================================ */
const myIdEl       = document.getElementById("my-id");
const peersEl      = document.getElementById("peers");
const messagesEl   = document.getElementById("messages");
const messageInput = document.getElementById("message");
const videoGrid    = document.getElementById("video-grid");
const toastEl      = document.getElementById("toast");
const joinCallBtn  = document.getElementById("join-call");
const leaveCallBtn = document.getElementById("leave-call");
const btnCamera    = document.getElementById("btn-camera");
const btnMute      = document.getElementById("btn-mute");
const btnDeafen    = document.getElementById("btn-deafen");
const btnScreen    = document.getElementById("btn-screen");
const fileInput    = document.getElementById("file-input");
const avatarInput  = document.getElementById("avatar-input");
const myAvatarEl   = document.getElementById("my-avatar");

/* ============================================================
   TOAST
============================================================ */
function showToast(msg, duration = 2400) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  toastEl.classList.add("visible");
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => {
    toastEl.classList.remove("visible");
    toastEl.classList.add("hidden");
  }, duration);
}

/* ============================================================
   AVATAR HELPERS
============================================================ */
function getInitials(name) {
  return (name || "?").trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function initialsColor(name) {
  const colors = ["#5865f2","#eb459e","#57f287","#fee75c","#ed4245","#00b0f4","#ff7043","#ab47bc"];
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function makeInitialsDataUrl(name, size = 64) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = initialsColor(name);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.round(size * 0.38)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(getInitials(name), size / 2, size / 2 + 1);
  return canvas.toDataURL();
}

/* Set an <img> to a circular avatar — handles real image or initials fallback */
function applyAvatar(imgEl, name, dataUrl) {
  if (dataUrl) {
    imgEl.src = dataUrl;
  } else {
    imgEl.src = makeInitialsDataUrl(name || "?");
  }
}

/* ============================================================
   AVATAR UPLOAD
============================================================ */
avatarInput.onchange = () => {
  const file = avatarInput.files[0];
  if (!file) return;
  avatarInput.value = "";
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.src = e.target.result;
    img.onload = () => {
      const sz = 64;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = sz;
      const ctx = canvas.getContext("2d");
      ctx.beginPath();
      ctx.arc(sz / 2, sz / 2, sz / 2, 0, Math.PI * 2);
      ctx.clip();
      const scale = Math.max(sz / img.width, sz / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (sz - w) / 2, (sz - h) / 2, w, h);
      myAvatar = canvas.toDataURL("image/jpeg", 0.75);
      applyAvatar(myAvatarEl, username, myAvatar);
      broadcastEncrypted({ type: "profile", user: username, avatar: myAvatar });
      showToast("Avatar updated!");
    };
  };
  reader.readAsDataURL(file);
};

/* ============================================================
   MESSAGES
============================================================ */
function logMessage(user, text, isSystem, isSelf, avatarDataUrl) {
  const wrap = document.createElement("div");
  wrap.className = "message";

  if (isSystem) {
    const sys = document.createElement("div");
    sys.className = "msg-system";
    sys.textContent = text;
    wrap.appendChild(sys);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return;
  }

  const avi = document.createElement("img");
  avi.className = "msg-avatar";
  applyAvatar(avi, user, avatarDataUrl || null);

  const right = document.createElement("div");
  right.className = "msg-right";

  const hdr = document.createElement("div");
  hdr.className = "msg-header";

  const uEl = document.createElement("span");
  uEl.className = "username" + (isSelf ? " self" : "");
  uEl.textContent = user;

  const tEl = document.createElement("span");
  tEl.className = "msg-time";
  tEl.textContent = new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});

  hdr.append(uEl, tEl);

  const body = document.createElement("div");
  body.className = "msg-text";
  body.textContent = text;

  right.append(hdr, body);
  wrap.append(avi, right);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function logFileLink(user, name, blob, avatarDataUrl) {
  const wrap = document.createElement("div");
  wrap.className = "message";

  const avi = document.createElement("img");
  avi.className = "msg-avatar";
  applyAvatar(avi, user, avatarDataUrl || null);

  const right = document.createElement("div");
  right.className = "msg-right";

  const hdr = document.createElement("div");
  hdr.className = "msg-header";

  const uEl = document.createElement("span");
  uEl.className = "username";
  uEl.textContent = user;

  const tEl = document.createElement("span");
  tEl.className = "msg-time";
  tEl.textContent = new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});

  hdr.append(uEl, tEl);

  const a = document.createElement("a");
  a.className = "msg-file";
  a.href      = URL.createObjectURL(blob);
  a.download  = name;
  a.target    = "_blank";
  a.rel       = "noopener noreferrer";
  a.innerHTML = `<span class="file-icon">📄</span><span class="file-name">${name}</span><span class="file-hint">↓ download</span>`;

  right.append(hdr, a);
  wrap.append(avi, right);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/* ============================================================
   PEER LIST
============================================================ */
function updatePeerList() {
  const ids = Object.keys(connections);
  peersEl.innerHTML = "";
  if (ids.length === 0) {
    peersEl.innerHTML = '<span class="empty-peers">No peers yet</span>';
    return;
  }
  ids.forEach(id => {
    const name   = peerUsernames[id] || id.slice(0, 10) + "…";
    const avatar = peerAvatars[id]   || null;

    const item = document.createElement("div");
    item.className = "peer-item";

    const img = document.createElement("img");
    img.className = "peer-avatar";
    applyAvatar(img, name, avatar);

    const label = document.createElement("span");
    label.textContent = name;
    label.title = id;

    item.append(img, label);
    peersEl.appendChild(item);
  });
}

/* ============================================================
   ENCRYPTION — ECDH + AES-256-GCM
============================================================ */
async function initECDH() {
  myECDHKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]
  );
}

async function exportECDHPublic() {
  return crypto.subtle.exportKey("raw", myECDHKeyPair.publicKey);
}

async function deriveAESKey(remotePubRaw) {
  const remotePub = await crypto.subtle.importKey(
    "raw", remotePubRaw,
    { name: "ECDH", namedCurve: "P-256" }, false, []
  );
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: remotePub },
    myECDHKeyPair.privateKey,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

/* Encrypt obj → { iv: base64, data: base64 } */
async function encryptData(peerId, obj) {
  const key  = sessionKeys[peerId];
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const raw  = new TextEncoder().encode(JSON.stringify(obj));
  const enc  = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, raw);
  return {
    iv:   btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(enc)))
  };
}

/* Decrypt { iv: base64, data: base64 } → obj */
async function decryptData(peerId, payload) {
  const key  = sessionKeys[peerId];
  const iv   = Uint8Array.from(atob(payload.iv),   c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(payload.data), c => c.charCodeAt(0));
  const dec  = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return JSON.parse(new TextDecoder().decode(dec));
}

/* ============================================================
   SEND HELPERS
============================================================ */

/* Await-able encrypted send to a single peer */
async function sendEncrypted(conn, obj) {
  if (!conn.open || !sessionKeys[conn.peer]) return;
  const payload = await encryptData(conn.peer, obj);
  conn.send({ encrypted: true, payload });
}

/* Broadcast encrypted to all connected peers */
function broadcastEncrypted(obj) {
  Object.entries(connections).forEach(([id, conn]) => {
    if (conn.open && sessionKeys[id]) sendEncrypted(conn, obj);
  });
}

/* ============================================================
   PEER EVENTS
============================================================ */
peer.on("open", id => {
  myIdEl.textContent = id;
  initECDH();
  applyAvatar(myAvatarEl, username, null);
});

peer.on("connection", conn => setupConnection(conn));

peer.on("call", call => {
  call.answer(localStream || new MediaStream());
  setupMediaCall(call);
});

/* ============================================================
   CONNECTION SETUP
============================================================ */
function setupConnection(conn) {
  connections[conn.peer] = conn;
  updatePeerList();

  conn.on("open", async () => {
    const pubRaw = await exportECDHPublic();
    conn.send({ type: "ecdh-hello", pub: Array.from(new Uint8Array(pubRaw)) });
  });

  conn.on("data", async raw => {
    /* ECDH handshake — plaintext */
    if (raw.type === "ecdh-hello") {
      const remotePubRaw = new Uint8Array(raw.pub).buffer;
      sessionKeys[conn.peer] = await deriveAESKey(remotePubRaw);

      if (!raw._reply) {
        const pubRaw = await exportECDHPublic();
        conn.send({ type: "ecdh-hello", pub: Array.from(new Uint8Array(pubRaw)), _reply: true });
      }

      /* Send our profile now that we have a shared key */
      await sendEncrypted(conn, { type: "profile", user: username, avatar: myAvatar });

      /* If already in call, ring this peer */
      if (localStream) {
        const call = peer.call(conn.peer, localStream);
        setupMediaCall(call);
      }
      return;
    }

    /* Encrypted messages */
    if (raw.encrypted) {
      if (!sessionKeys[conn.peer]) return;
      try {
        const obj = await decryptData(conn.peer, raw.payload);
        handleData(conn, obj);
      } catch (e) {
        console.warn("Decrypt error:", e);
      }
      return;
    }

    handleData(conn, raw);
  });

  conn.on("close", () => {
    delete connections[conn.peer];
    delete sessionKeys[conn.peer];
    delete peerUsernames[conn.peer];
    delete peerAvatars[conn.peer];
    updatePeerList();
    logMessage("SYSTEM", "A peer disconnected", true);
  });

  conn.on("error", e => console.error("Conn error:", e));
}

/* ============================================================
   DATA HANDLER
============================================================ */
const receiveFileMeta = {};
const receivedBuffers = {};

function handleData(conn, data) {
  switch (data.type) {

    case "profile":
      peerUsernames[conn.peer] = data.user  || "Peer";
      peerAvatars[conn.peer]   = data.avatar || null;
      updatePeerList();
      break;

    case "message":
      logMessage(data.user, data.text, false, false, peerAvatars[conn.peer] || null);
      break;

    case "file-meta":
      receiveFileMeta[data.id] = { name: data.name, from: data.user, peer: conn.peer };
      receivedBuffers[data.id] = [];
      break;

    case "file-chunk":
      if (receivedBuffers[data.id] !== undefined) {
        receivedBuffers[data.id].push(data.chunk); /* base64 string */
      }
      break;

    case "file-end": {
      const meta   = receiveFileMeta[data.id];
      const chunks = receivedBuffers[data.id];
      if (!meta || !chunks) break;
      /* Decode base64 chunks → Uint8Arrays → merge */
      const arrays = chunks.map(b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
      const total  = arrays.reduce((n, a) => n + a.length, 0);
      const merged = new Uint8Array(total);
      let off = 0;
      arrays.forEach(a => { merged.set(a, off); off += a.length; });
      const blob = new Blob([merged]);
      logFileLink(meta.from || "Peer", meta.name, blob, peerAvatars[meta.peer] || null);
      delete receiveFileMeta[data.id];
      delete receivedBuffers[data.id];
      break;
    }
  }
}

/* ============================================================
   CHAT
============================================================ */
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  messageInput.value = "";
  logMessage(username, text, false, true, myAvatar);
  broadcastEncrypted({ type: "message", user: username, text });
}

document.getElementById("send").onclick = sendMessage;
messageInput.addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); sendMessage(); }
});

/* ============================================================
   HOST / JOIN
============================================================ */
document.getElementById("host").onclick = () => {
  username = document.getElementById("username").value.trim() || "Host";
  applyAvatar(myAvatarEl, username, myAvatar);
  logMessage("SYSTEM", "Room created — share your ID with peers", true);
  showToast("Room created! Share your ID.");
};

document.getElementById("join").onclick = () => {
  username = document.getElementById("username").value.trim() || "User";
  applyAvatar(myAvatarEl, username, myAvatar);
  const hostId = document.getElementById("host-id").value.trim();
  if (!hostId) { showToast("Paste a host ID first."); return; }
  setupConnection(peer.connect(hostId, { reliable: true }));
  logMessage("SYSTEM", "Connecting to room…", true);
};

document.getElementById("username").addEventListener("input", e => {
  applyAvatar(myAvatarEl, e.target.value || "?", myAvatar);
});

document.getElementById("copy-id").onclick = () => {
  navigator.clipboard.writeText(myIdEl.textContent).then(() => showToast("ID copied!"));
};

/* ============================================================
   VOICE / VIDEO
============================================================ */
async function startMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
      video: true
    });
  } catch {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      showToast("Microphone access denied.");
      return;
    }
  }

  /* Camera OFF by default */
  cameraOn = false;
  localStream.getVideoTracks().forEach(t => { t.enabled = false; });

  isInCall = true;
  updateCallUI(true);
  setVideoEl("local", localStream, true);

  Object.values(connections).forEach(conn => {
    if (conn.open) setupMediaCall(peer.call(conn.peer, localStream));
  });
}

function setupMediaCall(call) {
  mediaCalls[call.peer] = call;
  call.on("stream", stream => setVideoEl(call.peer, stream, false));
  call.on("close",  ()     => removeVideoEl(call.peer));
  call.on("error",  e      => console.error("Media error:", e));
}

/* ============================================================
   VIDEO ELEMENTS
============================================================ */
function setVideoEl(id, stream, isLocal) {
  let v = document.getElementById("vid-" + id);
  if (v) { v.srcObject = stream; return; }
  v             = document.createElement("video");
  v.id          = "vid-" + id;
  v.srcObject   = stream;
  v.autoplay    = true;
  v.playsInline = true;
  v.muted       = !!isLocal;
  if (isLocal) v.classList.add("local-video");
  videoGrid.appendChild(v);
  videoGrid.classList.remove("hidden");
}

function removeVideoEl(id) {
  const el = document.getElementById("vid-" + id);
  if (el) el.remove();
  if (!videoGrid.childElementCount) videoGrid.classList.add("hidden");
}

/* ============================================================
   MEDIA CONTROLS
============================================================ */
joinCallBtn.onclick = startMedia;

leaveCallBtn.onclick = () => {
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  Object.values(mediaCalls).forEach(c => c.close());
  Object.keys(mediaCalls).forEach(k => delete mediaCalls[k]);
  Array.from(videoGrid.children).forEach(el => el.remove());
  videoGrid.classList.add("hidden");
  isInCall = false; isMuted = false; isDeafened = false; isScreenShare = false; cameraOn = false;
  updateCallUI(false);
  showToast("Left voice channel.");
};

btnCamera.onclick = () => {
  if (!localStream) return;
  cameraOn = !cameraOn;
  localStream.getVideoTracks().forEach(t => { t.enabled = cameraOn; });
  btnCamera.querySelector("small").textContent = cameraOn ? "Cam On" : "Cam Off";
  btnCamera.classList.toggle("active", !cameraOn);
};

btnMute.onclick = () => {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(t => { t.enabled = !isMuted; });
  btnMute.querySelector("span").textContent  = isMuted ? "🚫" : "🎙";
  btnMute.querySelector("small").textContent = isMuted ? "Unmute" : "Mute";
  btnMute.classList.toggle("active", isMuted);
};

btnDeafen.onclick = () => {
  if (!localStream) return;
  isDeafened = !isDeafened;
  localStream.getAudioTracks().forEach(t => { t.enabled = !isDeafened; });
  document.querySelectorAll("#video-grid video:not(.local-video)").forEach(v => { v.muted = isDeafened; });
  btnDeafen.querySelector("span").textContent  = isDeafened ? "🔇" : "🔊";
  btnDeafen.querySelector("small").textContent = isDeafened ? "Undeafen" : "Deafen";
  btnDeafen.classList.toggle("active", isDeafened);
  btnMute.classList.toggle("active", isDeafened || isMuted);
  btnMute.querySelector("small").textContent = (isDeafened || isMuted) ? "Unmute" : "Mute";
};

/* ============================================================
   SCREEN SHARE
   Build a combined MediaStream (screen video + local audio),
   replace or add the video sender on every active RTCPeerConnection.
   On stop, restore the camera track back into localStream.
============================================================ */
btnScreen.onclick = async () => {
  if (!localStream) return;
  if (!isScreenShare) {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack  = screenStream.getVideoTracks()[0];

      /* Combined stream for local preview */
      const combined = new MediaStream([screenTrack, ...localStream.getAudioTracks()]);

      /* Replace video track in every active peer connection */
      Object.values(mediaCalls).forEach(call => {
        const pc = call.peerConnection;
        if (!pc) return;
        const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
        if (sender) {
          sender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, combined);
        }
      });

      setVideoEl("local", combined, true);
      screenTrack.onended = stopScreenShare;

      isScreenShare = true;
      btnScreen.querySelector("small").textContent = "Stop Share";
      btnScreen.classList.add("screen-active");
    } catch {
      showToast("Screen share cancelled.");
    }
  } else {
    stopScreenShare();
  }
};

async function stopScreenShare() {
  if (!isScreenShare) return;
  isScreenShare = false;

  let camTrack = null;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    camTrack = s.getVideoTracks()[0];
    if (camTrack) camTrack.enabled = cameraOn;
  } catch { /* no camera */ }

  /* Swap track in peer connections */
  Object.values(mediaCalls).forEach(call => {
    const pc = call.peerConnection;
    if (!pc) return;
    const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
    if (sender && camTrack) sender.replaceTrack(camTrack);
  });

  /* Rebuild localStream */
  localStream.getVideoTracks().forEach(t => { t.stop(); localStream.removeTrack(t); });
  if (camTrack) localStream.addTrack(camTrack);
  setVideoEl("local", localStream, true);

  btnScreen.querySelector("small").textContent = "Screen";
  btnScreen.classList.remove("screen-active");
}

/* ============================================================
   UPDATE CALL UI
============================================================ */
function updateCallUI(inCall) {
  joinCallBtn.disabled  = inCall;
  leaveCallBtn.disabled = !inCall;
  leaveCallBtn.classList.toggle("in-call",     inCall);
  leaveCallBtn.classList.toggle("not-in-call", !inCall);
  leaveCallBtn.innerHTML = inCall
    ? '<span class="vc-icon">📵</span> Leave Voice'
    : '<span class="vc-icon">🔌</span> Leave Voice';

  [btnCamera, btnMute, btnDeafen, btnScreen].forEach(b => b.disabled = !inCall);
  /* Camera starts active (off/red) */
  btnCamera.querySelector("small").textContent = "Cam Off";
  btnCamera.classList.toggle("active", inCall);
  btnMute.querySelector("span").textContent    = "🎙";
  btnMute.querySelector("small").textContent   = "Mute";
  btnMute.classList.remove("active");
  btnDeafen.querySelector("span").textContent  = "🔊";
  btnDeafen.querySelector("small").textContent = "Deafen";
  btnDeafen.classList.remove("active");
  btnScreen.querySelector("small").textContent = "Screen";
  btnScreen.classList.remove("screen-active");
}

/* ============================================================
   FILE SHARING
   Key fix: chunks are sent as base64 strings, not number arrays.
   Each chunk is awaited sequentially to guarantee order.
   Chunk size (12 KB) leaves headroom after base64 expansion
   and AES-GCM overhead, staying well under PeerJS's ~16 KB limit.
============================================================ */
fileInput.onchange = async () => {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.value = "";

  const peers = Object.values(connections).filter(c => c.open && sessionKeys[c.peer]);
  if (!peers.length) { showToast("No connected peers."); return; }

  const id    = Math.random().toString(36).slice(2);
  const CHUNK = 12000;

  showToast(`Sending "${file.name}"…`);

  for (const conn of peers) {
    await sendEncrypted(conn, { type: "file-meta", id, name: file.name, user: username });

    let offset = 0;
    while (offset < file.size) {
      const slice  = file.slice(offset, offset + CHUNK);
      const buffer = await slice.arrayBuffer();
      const b64    = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      await sendEncrypted(conn, { type: "file-chunk", id, chunk: b64 });
      offset += CHUNK;
    }

    await sendEncrypted(conn, { type: "file-end", id });
  }

  logMessage("SYSTEM", `File sent: "${file.name}"`, true);
  showToast(`✓ "${file.name}" sent`);
};

/* ============================================================
   INITIAL STATE
============================================================ */
updateCallUI(false);