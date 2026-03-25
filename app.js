/* ============================================================
   NexTalk — P2P E2EE Chat
   Per-connection AES-256-GCM encryption (ECDH key exchange)
============================================================ */

/* ============================================================
   PEER SETUP
============================================================ */
const peer = new Peer();

let username = "Anonymous";
let isHost   = false;

const connections  = {};   // peerId → DataConnection
const mediaCalls   = {};   // peerId → MediaConnection
let   localStream  = null;
let   isInCall     = false;

/* Per-peer AES-GCM session keys (established via ECDH) */
const sessionKeys  = {};   // peerId → CryptoKey

/* ECDH key pairs for key exchange */
let myECDHKeyPair  = null; // { publicKey, privateKey }
const peerECDHPub  = {};   // peerId → raw ArrayBuffer of peer's ECDH public key

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

/* ============================================================
   MEDIA STATE
============================================================ */
let isMuted       = false;
let isDeafened    = false;
let isScreenShare = false;
let cameraOn      = true;

/* ============================================================
   TOAST
============================================================ */
function showToast(msg, duration = 2200) {
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
   MESSAGES
============================================================ */
function logMessage(user, text, isSystem = false, isSelf = false) {
  const wrap  = document.createElement("div");
  wrap.className = "message";

  const header = document.createElement("div");
  header.className = "msg-header";

  const uEl = document.createElement("span");
  uEl.className = "username" + (isSystem ? " system" : isSelf ? " self" : "");
  uEl.textContent = user;

  const tEl = document.createElement("span");
  tEl.className = "msg-time";
  tEl.textContent = new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});

  header.append(uEl, tEl);

  const body = document.createElement("div");
  body.className = "msg-text" + (isSystem ? " system-text" : "");
  body.textContent = text;

  wrap.append(header, body);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function logFileLink(user, name, blob) {
  const wrap  = document.createElement("div");
  wrap.className = "message";

  const header = document.createElement("div");
  header.className = "msg-header";
  const uEl = document.createElement("span");
  uEl.className = "username";
  uEl.textContent = user;
  const tEl = document.createElement("span");
  tEl.className = "msg-time";
  tEl.textContent = new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
  header.append(uEl, tEl);

  const a = document.createElement("a");
  a.className = "msg-file";
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.innerHTML = `📄 <span class="file-name">${name}</span><span class="file-hint">↓ download</span>`;

  wrap.append(header, a);
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
    const div = document.createElement("div");
    div.className = "peer-item";
    div.textContent = id.slice(0, 20) + (id.length > 20 ? "…" : "");
    div.title = id;
    peersEl.appendChild(div);
  });
}

/* ============================================================
   ENCRYPTION — ECDH + AES-256-GCM
============================================================ */
async function initECDH() {
  myECDHKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );
}

async function exportECDHPublic() {
  return crypto.subtle.exportKey("raw", myECDHKeyPair.publicKey);
}

async function deriveAESKey(remotePubRaw) {
  const remotePub = await crypto.subtle.importKey(
    "raw", remotePubRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: remotePub },
    myECDHKeyPair.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptData(peerId, obj) {
  const key  = sessionKeys[peerId];
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const enc  = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(enc)) };
}

async function decryptData(peerId, payload) {
  const key = sessionKeys[peerId];
  const iv  = new Uint8Array(payload.iv);
  const buf = new Uint8Array(payload.data);
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, buf);
  return JSON.parse(new TextDecoder().decode(dec));
}

/* Send encrypted to one connection */
async function sendEncrypted(conn, obj) {
  if (!conn.open) return;
  const peerId = conn.peer;
  if (!sessionKeys[peerId]) { conn.send(obj); return; }
  const payload = await encryptData(peerId, obj);
  conn.send({ encrypted: true, payload });
}

/* Broadcast encrypted to all (optionally excluding one) */
function broadcastEncrypted(obj, exclude = null) {
  Object.entries(connections).forEach(([id, conn]) => {
    if (id !== exclude && conn.open && sessionKeys[id]) {
      sendEncrypted(conn, obj);
    }
  });
}

/* ============================================================
   PEER EVENTS
============================================================ */
peer.on("open", id => {
  myIdEl.textContent = id;
  initECDH();
});

peer.on("connection", conn => setupConnection(conn));

peer.on("call", call => {
  if (localStream) call.answer(localStream);
  setupMediaCall(call);
});

/* ============================================================
   DATA CONNECTION SETUP
============================================================ */
function setupConnection(conn) {
  connections[conn.peer] = conn;
  updatePeerList();

  conn.on("open", async () => {
    /* ECDH handshake — send our public key */
    const pubRaw = await exportECDHPublic();
    conn.send({ type: "ecdh-hello", pub: Array.from(new Uint8Array(pubRaw)) });
  });

  conn.on("data", async raw => {
    /* ECDH key exchange */
    if (raw.type === "ecdh-hello") {
      const remotePubRaw = new Uint8Array(raw.pub).buffer;
      peerECDHPub[conn.peer] = remotePubRaw;
      const key = await deriveAESKey(remotePubRaw);
      sessionKeys[conn.peer] = key;

      /* Reply with our public key if we haven't yet */
      if (!raw._reply) {
        const pubRaw = await exportECDHPublic();
        conn.send({ type: "ecdh-hello", pub: Array.from(new Uint8Array(pubRaw)), _reply: true });
      }

      /* If in call, initiate media */
      if (localStream) {
        const call = peer.call(conn.peer, localStream);
        setupMediaCall(call);
      }
      return;
    }

    /* Decrypt and handle */
    if (raw.encrypted && sessionKeys[conn.peer]) {
      try {
        const obj = await decryptData(conn.peer, raw.payload);
        handleData(conn, obj);
      } catch (e) {
        console.warn("Decrypt error:", e);
      }
    } else {
      handleData(conn, raw);
    }
  });

  conn.on("close", () => {
    delete connections[conn.peer];
    delete sessionKeys[conn.peer];
    delete peerECDHPub[conn.peer];
    updatePeerList();
    logMessage("SYSTEM", `Peer disconnected: ${conn.peer.slice(0,12)}…`, true);
  });

  conn.on("error", err => console.error("Conn error:", err));
}

/* ============================================================
   DATA HANDLER
============================================================ */
const receiveFileMeta    = {};
const receivedBuffers    = {};

function handleData(conn, data) {
  switch (data.type) {

    case "message":
      logMessage(data.user, data.text);
      break;

    case "file-meta":
      receiveFileMeta[data.id]    = { name: data.name, from: data.user };
      receivedBuffers[data.id]    = [];
      break;

    case "file-chunk":
      if (receivedBuffers[data.id]) {
        receivedBuffers[data.id].push(new Uint8Array(data.chunk));
      }
      break;

    case "file-end": {
      const meta = receiveFileMeta[data.id];
      const chunks = receivedBuffers[data.id];
      if (!meta || !chunks) break;
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      chunks.forEach(c => { merged.set(c, offset); offset += c.length; });
      const blob = new Blob([merged]);
      logFileLink(meta.from || "Peer", meta.name, blob);
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
  if (!text || Object.keys(connections).length === 0) return;
  messageInput.value = "";
  const data = { type: "message", user: username, text };
  logMessage(username, text, false, true);
  broadcastEncrypted(data);
}

document.getElementById("send").onclick = sendMessage;
messageInput.addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); sendMessage(); }
});

/* ============================================================
   HOST / JOIN
============================================================ */
document.getElementById("host").onclick = () => {
  const val = document.getElementById("username").value.trim();
  username = val || "Host";
  isHost   = true;
  logMessage("SYSTEM", `Room created. Share your ID: ${myIdEl.textContent}`, true);
  showToast("Room created! Share your ID.");
};

document.getElementById("join").onclick = () => {
  const val    = document.getElementById("username").value.trim();
  username     = val || "User";
  const hostId = document.getElementById("host-id").value.trim();
  if (!hostId) { showToast("Paste a host ID first."); return; }
  const conn = peer.connect(hostId, { reliable: true });
  setupConnection(conn);
  logMessage("SYSTEM", `Connecting to ${hostId.slice(0,16)}…`, true);
};

/* Copy ID */
document.getElementById("copy-id").onclick = () => {
  navigator.clipboard.writeText(myIdEl.textContent).then(() => showToast("ID copied!"));
};

/* ============================================================
   VOICE / VIDEO
============================================================ */
async function startMedia() {
  /* Always request audio + video so camera toggle works */
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
      video: true
    });
  } catch (e) {
    /* Video denied — fall back to audio only */
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
        video: false
      });
    } catch (e2) {
      showToast("Microphone access denied.");
      return;
    }
  }

  isInCall = true;
  cameraOn = localStream.getVideoTracks().length > 0;
  updateCallUI(true);
  setVideoEl("local", localStream, true);

  /* Call all existing peers */
  Object.values(connections).forEach(conn => {
    if (conn.open) {
      const call = peer.call(conn.peer, localStream);
      setupMediaCall(call);
    }
  });
}

function setupMediaCall(call) {
  mediaCalls[call.peer] = call;
  call.on("stream", stream => addVideoEl(call.peer, stream, false));
  call.on("close",  ()    => removeVideoEl(call.peer));
  call.on("error",  e     => console.error("Media call error:", e));
}

/* ============================================================
   VIDEO ELEMENT MANAGEMENT
============================================================ */
function setVideoEl(id, stream, isLocal = false) {
  let video = document.getElementById("vid-" + id);
  if (video) {
    /* Element exists — just swap the stream (used by screen share) */
    video.srcObject = stream;
    return;
  }
  video             = document.createElement("video");
  video.id          = "vid-" + id;
  video.srcObject   = stream;
  video.autoplay    = true;
  video.playsInline = true;
  video.muted       = isLocal || isDeafened;
  if (isLocal) video.classList.add("local-video");
  videoGrid.appendChild(video);
  videoGrid.classList.remove("hidden");
}

/* Keep old name as alias so setupMediaCall still works */
function addVideoEl(id, stream, isLocal = false) {
  setVideoEl(id, stream, isLocal);
}

function removeVideoEl(id) {
  const el = document.getElementById("vid-" + id);
  if (el) el.remove();
  if (videoGrid.childElementCount === 0) videoGrid.classList.add("hidden");
}

/* ============================================================
   MEDIA CONTROLS
============================================================ */
/* Join Voice */
joinCallBtn.onclick = () => startMedia();

/* Leave Voice */
leaveCallBtn.onclick = () => {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  Object.values(mediaCalls).forEach(c => c.close());
  Object.keys(mediaCalls).forEach(k => delete mediaCalls[k]);
  /* Clear videos */
  Array.from(videoGrid.children).forEach(el => el.remove());
  videoGrid.classList.add("hidden");

  isInCall      = false;
  isMuted       = false;
  isDeafened    = false;
  isScreenShare = false;
  cameraOn      = true;
  updateCallUI(false);
  showToast("Left voice channel.");
};

/* Toggle camera */
btnCamera.onclick = () => {
  if (!localStream) return;
  cameraOn = !cameraOn;
  localStream.getVideoTracks().forEach(t => t.enabled = cameraOn);
  btnCamera.querySelector("span").textContent = cameraOn ? "📷" : "📷";
  btnCamera.querySelector("small").textContent = cameraOn ? "Camera" : "Cam Off";
  btnCamera.classList.toggle("active", !cameraOn);
};

/* Mute */
btnMute.onclick = () => {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  btnMute.querySelector("span").textContent = isMuted ? "🚫" : "🎙";
  btnMute.querySelector("small").textContent = isMuted ? "Unmute" : "Mute";
  btnMute.classList.toggle("active", isMuted);
};

/* Deafen — mutes mic AND silences all incoming audio */
btnDeafen.onclick = () => {
  if (!localStream) return;
  isDeafened = !isDeafened;
  /* Mute own mic too when deafened */
  localStream.getAudioTracks().forEach(t => t.enabled = !isDeafened);
  /* Silence all remote videos */
  document.querySelectorAll("#video-grid video").forEach(el => {
    if (!el.classList.contains("local-video")) el.muted = isDeafened;
  });
  btnDeafen.querySelector("span").textContent = isDeafened ? "🔇" : "🔊";
  btnDeafen.querySelector("small").textContent = isDeafened ? "Undeafen" : "Deafen";
  btnDeafen.classList.toggle("active", isDeafened);
  /* Sync mute button visual */
  if (isDeafened) {
    btnMute.classList.add("active");
    btnMute.querySelector("small").textContent = "Muted";
  } else {
    btnMute.classList.remove("active");
    btnMute.querySelector("small").textContent = isMuted ? "Unmute" : "Mute";
  }
};

/* Screen Share */
btnScreen.onclick = async () => {
  if (!localStream) return;
  if (!isScreenShare) {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack  = screenStream.getVideoTracks()[0];
      /* Replace track in all active peer connections */
      replaceVideoTrack(screenTrack);
      /* Swap local preview to screen stream */
      setVideoEl("local", screenStream, true);
      screenTrack.onended = stopScreenShare;
      isScreenShare = true;
      btnScreen.querySelector("small").textContent = "Stop Share";
      btnScreen.classList.add("screen-active");
    } catch (e) {
      showToast("Screen share cancelled.");
    }
  } else {
    stopScreenShare();
  }
};

function replaceVideoTrack(newTrack) {
  Object.values(mediaCalls).forEach(call => {
    const pc = call.peerConnection;
    if (!pc) return;
    const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
    if (sender) sender.replaceTrack(newTrack);
  });
}

async function stopScreenShare() {
  if (!isScreenShare) return;
  isScreenShare = false;
  try {
    /* Get a fresh camera track */
    const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const camTrack  = camStream.getVideoTracks()[0];
    /* Swap into localStream so future state is correct */
    const oldVideo = localStream.getVideoTracks()[0];
    if (oldVideo) { localStream.removeTrack(oldVideo); oldVideo.stop(); }
    localStream.addTrack(camTrack);
    /* Replace in peer connections */
    replaceVideoTrack(camTrack);
    /* Restore local preview */
    setVideoEl("local", localStream, true);
  } catch (e) {
    /* Camera unavailable — just show whatever localStream has */
    setVideoEl("local", localStream, true);
  }
  btnScreen.querySelector("small").textContent = "Screen";
  btnScreen.classList.remove("screen-active");
}

/* ============================================================
   UPDATE CALL UI STATE
============================================================ */
function updateCallUI(inCall) {
  joinCallBtn.disabled  = inCall;
  leaveCallBtn.disabled = !inCall;

  /* Update Leave button label and style to reflect state */
  if (inCall) {
    leaveCallBtn.classList.remove("not-in-call");
    leaveCallBtn.classList.add("in-call");
    leaveCallBtn.innerHTML = '<span class="vc-icon">📵</span> Leave Voice';
  } else {
    leaveCallBtn.classList.remove("in-call");
    leaveCallBtn.classList.add("not-in-call");
    leaveCallBtn.innerHTML = '<span class="vc-icon">📵</span> Leave Voice';
  }

  [btnCamera, btnMute, btnDeafen, btnScreen].forEach(b => b.disabled = !inCall);

  /* Reset icon states */
  btnCamera.querySelector("small").textContent = "Camera";
  btnCamera.classList.remove("active");
  btnMute.querySelector("small").textContent   = "Mute";
  btnMute.classList.remove("active");
  btnDeafen.querySelector("small").textContent = "Deafen";
  btnDeafen.classList.remove("active");
  btnScreen.querySelector("small").textContent = "Screen";
  btnScreen.classList.remove("screen-active");
}

/* ============================================================
   FILE SHARING
============================================================ */
async function sendToPeer(conn, obj) {
  /* Awaitable single-peer encrypted send */
  return new Promise(async (resolve) => {
    if (!conn.open || !sessionKeys[conn.peer]) { resolve(); return; }
    const payload = await encryptData(conn.peer, obj);
    conn.send({ encrypted: true, payload });
    resolve();
  });
}

fileInput.onchange = async () => {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.value = "";

  const peerList  = Object.values(connections).filter(c => c.open && sessionKeys[c.peer]);
  if (peerList.length === 0) { showToast("No peers connected."); return; }

  const id        = Math.random().toString(36).slice(2);
  const chunkSize = 16000;

  /* Send sequentially to every peer so chunks arrive in order */
  for (const conn of peerList) {
    await sendToPeer(conn, { type: "file-meta", id, name: file.name, user: username });

    let offset = 0;
    while (offset < file.size) {
      const slice  = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();
      await sendToPeer(conn, { type: "file-chunk", id, chunk: Array.from(new Uint8Array(buffer)) });
      offset += chunkSize;
    }

    await sendToPeer(conn, { type: "file-end", id });
  }

  logMessage("SYSTEM", `File sent: ${file.name}`, true);
  showToast(`Sent: ${file.name}`);
};

/* ============================================================
   INITIAL STATE
============================================================ */
updateCallUI(false);