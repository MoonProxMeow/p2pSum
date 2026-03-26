"use strict";

/* =========================
   STATE
========================= */
const state = {
  peer: null,
  id: null,
  conns: {},
  calls: {},
  localStream: null
};

/* =========================
   INIT PEER
========================= */
function initPeer() {
  state.peer = new Peer();

  state.peer.on("open", id => {
    state.id = id;
    document.getElementById("my-id").textContent = id;
  });

  state.peer.on("connection", conn => {
    setupConn(conn);
  });

  state.peer.on("call", call => {
    handleIncomingCall(call);
  });
}

/* =========================
   CONNECTIONS
========================= */
function connectToPeer(id) {
  if (!id || id === state.id || state.conns[id]) return;

  const conn = state.peer.connect(id);
  setupConn(conn);
}

function setupConn(conn) {
  state.conns[conn.peer] = conn;

  conn.on("data", data => handleData(conn.peer, data));

  conn.on("close", () => {
    delete state.conns[conn.peer];
  });
}

function broadcast(data) {
  Object.values(state.conns).forEach(c => c.send(data));
}

/* =========================
   MESSAGES
========================= */
function sendMessage(text) {
  if (!text.trim()) return;

  const msg = {
    type: "msg",
    id: crypto.randomUUID(),
    from: state.id,
    text
  };

  broadcast(msg);
  renderMessage(msg, true);
}

function handleData(from, data) {
  if (!data || typeof data !== "object") return;

  if (data.type === "msg") {
    renderMessage(data, false);
  }

  if (data.type === "img") {
    renderImage(data);
  }
}

/* =========================
   UI RENDER
========================= */
const messagesEl = document.getElementById("messages");

function renderMessage(msg, self) {
  const el = document.createElement("div");
  el.innerHTML = `<b>${self ? "Me" : msg.from}</b>: ${escapeHTML(msg.text)}`;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderImage(msg) {
  const img = document.createElement("img");
  img.src = msg.data;
  img.style.maxWidth = "200px";

  img.onclick = () => {
    document.getElementById("lightbox-img").src = msg.data;
    document.getElementById("lightbox").classList.remove("hidden");
  };

  messagesEl.appendChild(img);
}

/* =========================
   IMAGE SEND
========================= */
function sendImage(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const payload = {
      type: "img",
      data: reader.result
    };

    broadcast(payload);
    renderImage(payload);
  };

  reader.readAsDataURL(file);
}

/* =========================
   CALL SYSTEM (STABLE)
========================= */
const videoGrid = document.getElementById("video-grid");

async function startCall() {
  if (state.localStream) return;

  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
  } catch (e) {
    alert("Camera/mic blocked");
    return;
  }

  addVideo(state.localStream, true);

  Object.keys(state.conns).forEach(pid => {
    const call = state.peer.call(pid, state.localStream);
    setupCall(call);
  });
}

function handleIncomingCall(call) {
  if (!state.localStream) {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        state.localStream = stream;
        addVideo(stream, true);
        call.answer(stream);
        setupCall(call);
      });
  } else {
    call.answer(state.localStream);
    setupCall(call);
  }
}

function setupCall(call) {
  state.calls[call.peer] = call;

  call.on("stream", stream => {
    addVideo(stream);
  });

  call.on("close", () => {
    delete state.calls[call.peer];
    renderVideos();
  });
}

function leaveCall() {
  Object.values(state.calls).forEach(c => c.close());
  state.calls = {};

  if (state.localStream) {
    state.localStream.getTracks().forEach(t => t.stop());
    state.localStream = null;
  }

  renderVideos();
}

function renderVideos() {
  videoGrid.innerHTML = "";
}

function addVideo(stream, self = false) {
  const v = document.createElement("video");
  v.srcObject = stream;
  v.autoplay = true;
  v.playsInline = true;
  if (self) v.muted = true;

  videoGrid.appendChild(v);
}

/* =========================
   UTILS
========================= */
function escapeHTML(str) {
  return str.replace(/[&<>]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;"
  })[c]);
}

/* =========================
   EVENTS
========================= */
document.getElementById("send-btn").onclick = () => {
  const input = document.getElementById("msg-input");
  sendMessage(input.value);
  input.value = "";
};

document.getElementById("connect-btn").onclick = () => {
  connectToPeer(document.getElementById("peer-id-input").value);
};

document.getElementById("img-btn").onclick = () => {
  document.getElementById("img-input").click();
};

document.getElementById("img-input").onchange = e => {
  sendImage(e.target.files[0]);
};

document.getElementById("join-call").onclick = startCall;
document.getElementById("leave-call").onclick = leaveCall;

document.getElementById("lightbox").onclick = () => {
  document.getElementById("lightbox").classList.add("hidden");
};

/* =========================
   START
========================= */
initPeer();