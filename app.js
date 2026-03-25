const peer = new Peer();

let username = "Anonymous";
let connections = {};
let isHost = false;

const myIdEl = document.getElementById("my-id");
const messagesEl = document.getElementById("messages");
const peersEl = document.getElementById("peers");

function logMessage(user, text) {
  const div = document.createElement("div");
  div.className = "message";
  div.innerHTML = `<span class="username">${user}:</span> ${text}`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updatePeerList() {
  peersEl.innerHTML = "<b>Connected:</b><br>";
  Object.keys(connections).forEach(id => {
    peersEl.innerHTML += id + "<br>";
  });
}

peer.on("open", id => {
  myIdEl.textContent = id;
});

peer.on("connection", conn => setupConnection(conn));

function setupConnection(conn) {
  connections[conn.peer] = conn;
  updatePeerList();

  conn.on("data", data => {
    handleData(conn, data);
  });

  conn.on("close", () => {
    delete connections[conn.peer];
    updatePeerList();
  });
}

function handleData(conn, data) {

  // Host shares peer list
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

function broadcast(data, exclude=null) {
  Object.values(connections).forEach(c => {
    if (c.peer !== exclude && c.open)
      c.send(data);
  });
}

/* ---------- UI ---------- */

document.getElementById("host").onclick = () => {
  username = document.getElementById("username").value || "Host";
  isHost = true;
  logMessage("SYSTEM", "Room created. Share your ID.");
};

document.getElementById("join").onclick = () => {
  username = document.getElementById("username").value || "User";
  const hostId = document.getElementById("host-id").value;

  const conn = peer.connect(hostId);
  setupConnection(conn);

  conn.on("open", () => {
    conn.send({ type: "join" });
  });
};

document.getElementById("send").onclick = () => {
  const input = document.getElementById("message");
  const text = input.value;
  input.value = "";

  const data = {
    type: "message",
    user: username,
    text: text
  };

  logMessage(username, text);
  broadcast(data);
};