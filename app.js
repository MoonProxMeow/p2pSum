/* =========================
   Peer Setup
========================= */

const peer = new Peer();

let username = "Anonymous";
let isHost = false;

const connections = {};
const mediaCalls = {};

let localStream = null;

/* =========================
   UI Elements
========================= */

const myIdEl = document.getElementById("my-id");
const peersEl = document.getElementById("peers");
const messagesEl = document.getElementById("messages");
const messageInput = document.getElementById("message");
const audioContainer = document.getElementById("audio-container");

/* =========================
   Helpers
========================= */

function logMessage(user, text) {
  const div = document.createElement("div");
  div.className = "message";
  div.innerHTML =
    `<span class="username">${user}:</span> ${text}`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updatePeerList() {
  peersEl.innerHTML = "<b>Connected:</b><br>";
  Object.keys(connections).forEach(id => {
    peersEl.innerHTML += id + "<br>";
  });
}

function broadcast(data, exclude = null) {
  Object.values(connections).forEach(c => {
    if (c.open && c.peer !== exclude) {
      c.send(data);
    }
  });
}

/* =========================
   Peer Events
========================= */

peer.on("open", id => {
  myIdEl.textContent = id;
});

peer.on("connection", conn => {
  setupConnection(conn);
});

peer.on("call", call => {
  if (!localStream) return;

  call.answer(localStream);
  setupMediaCall(call);
});

/* =========================
   Connections
========================= */

function setupConnection(conn) {
  connections[conn.peer] = conn;
  updatePeerList();

  conn.on("data", data => handleData(conn, data));

  conn.on("open", () => {
    if (localStream) {
      const call = peer.call(conn.peer, localStream);
      setupMediaCall(call);
    }
  });

  conn.on("close", () => {
    delete connections[conn.peer];
    updatePeerList();
  });
}

function handleData(conn, data) {

  if (data.type === "join" && isHost) {
    broadcast({
      type: "peer-list",
      peers: Object.keys(connections)
    });
  }

  if (data.type === "peer-list") {
    data.peers.forEach(id => {
      if (!connections[id] && id !== peer.id) {
        const newConn = peer.connect(id);
        setupConnection(newConn);
      }
    });
  }

  if (data.type === "message") {
    logMessage(data.user, data.text);
    broadcast(data, conn.peer);
  }
}

/* =========================
   Voice Calls
========================= */

function setupMediaCall(call) {
  mediaCalls[call.peer] = call;

  call.on("stream", stream => addAudio(call.peer, stream));

  call.on("close", () => {
    removeAudio(call.peer);
    delete mediaCalls[call.peer];
  });
}

function addAudio(id, stream) {
  if (document.getElementById("audio-" + id)) return;

  const audio = document.createElement("audio");
  audio.id = "audio-" + id;
  audio.srcObject = stream;
  audio.autoplay = true;

  audioContainer.appendChild(audio);
}

function removeAudio(id) {
  const el = document.getElementById("audio-" + id);
  if (el) el.remove();
}

/* =========================
   Messaging
========================= */

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  messageInput.value = "";

  const data = {
    type: "message",
    user: username,
    text
  };

  logMessage(username, text);
  broadcast(data);
}

document.getElementById("send").onclick = sendMessage;

messageInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMessage();
  }
});

/* =========================
   Buttons
========================= */

document.getElementById("host").onclick = () => {
  username =
    document.getElementById("username").value || "Host";

  isHost = true;
  logMessage("SYSTEM", "Room created. Share your ID.");
};

document.getElementById("join").onclick = () => {
  username =
    document.getElementById("username").value || "User";

  const hostId =
    document.getElementById("host-id").value;

  const conn = peer.connect(hostId);
  setupConnection(conn);

  conn.on("open", () => {
    conn.send({ type: "join" });
  });
};

/* =========================
   Voice Buttons
========================= */

document.getElementById("join-call").onclick =
async () => {

  localStream =
    await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });

  Object.values(connections).forEach(conn => {
    const call = peer.call(conn.peer, localStream);
    setupMediaCall(call);
  });
};

document.getElementById("leave-call").onclick =
() => {

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  Object.values(mediaCalls).forEach(c => c.close());

  audioContainer.innerHTML = "";
};