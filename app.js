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
function logMessage(user, text){
  const div = document.createElement("div");
  div.className="message";
  div.innerHTML = `<span class="username">${user}:</span> ${text}`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function broadcast(data, exclude=null){
  Object.values(connections).forEach(c=>{
    if(c.open && c.peer!==exclude) c.send(data);
  });
}

function updatePeerList(){
  peersEl.innerHTML="<b>Connected:</b><br>";
  Object.keys(connections).forEach(id=>{
    peersEl.innerHTML+=id+"<br>";
  });
}

/* =========================
   Peer Events
========================= */
peer.on("open", id => myIdEl.textContent=id);

peer.on("connection", conn=>{
  setupConnection(conn);
});

peer.on("call", call=>{
  if(!localStream) return;
  call.answer(localStream);
  setupMediaCall(call);
});

/* =========================
   Connections
========================= */
function setupConnection(conn){
  connections[conn.peer] = conn;
  updatePeerList();

  conn.on("data", data=>handleData(conn,data));

  conn.on("open", ()=>{
    if(localStream){
      const call = peer.call(conn.peer, localStream);
      setupMediaCall(call);
    }
  });

  conn.on("close", ()=>{
    delete connections[conn.peer];
    updatePeerList();
  });
}

function handleData(conn,data){
  if(data.type==="message"){
    logMessage(data.user,data.text);
    broadcast(data, conn.peer);
  }

  /* File Sharing */
  if(data.type==="file-meta"){
    receiveFileMeta[data.id] = data;
    receivedBuffers[data.id] = [];
  }
  if(data.type==="file-chunk"){
    receivedBuffers[data.id].push(data.chunk);
  }
  if(data.type==="file-end"){
    const blob = new Blob(receivedBuffers[data.id]);
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = receiveFileMeta[data.id].name;
    a.textContent = `Download ${receiveFileMeta[data.id].name}`;
    messagesEl.appendChild(a);

    delete receivedBuffers[data.id];
  }
}

/* =========================
   Messaging
========================= */
function sendMessage(){
  const text = messageInput.value.trim();
  if(!text) return;
  messageInput.value="";

  const data = { type:"message", user:username, text };
  logMessage(username,text);
  broadcast(data);
}

document.getElementById("send").onclick=sendMessage;
messageInput.addEventListener("keydown", e=>{
  if(e.key==="Enter"){ e.preventDefault(); sendMessage(); }
});

/* =========================
   Voice/Video/Screen
========================= */
let isMuted=false;
let isDeafened=false;
let isScreenSharing=false;

async function startMedia(video=false){
  localStream = await navigator.mediaDevices.getUserMedia({
    audio:{ noiseSuppression:true, echoCancellation:true, autoGainControl:true },
    video:video
  });

  Object.values(connections).forEach(conn=>{
    const call = peer.call(conn.peer, localStream);
    setupMediaCall(call);
  });

  addVideo("local", localStream, true);
}

function setupMediaCall(call){
  mediaCalls[call.peer] = call;
  call.on("stream", stream => addVideo(call.peer, stream, false));
  call.on("close", ()=>{ removeVideo(call.peer); });
}

/* Video elements */
function addVideo(id, stream, muted=false){
  if(document.getElementById("video-"+id)) return;
  const video = document.createElement("video");
  video.id="video-"+id;
  video.srcObject=stream;
  video.autoplay=true;
  video.playsInline=true;
  video.muted=muted;
  audioContainer.appendChild(video);
}
function removeVideo(id){
  const el = document.getElementById("video-"+id);
  if(el) el.remove();
}

/* =========================
   Voice Buttons
========================= */
document.getElementById("join-call").onclick = ()=>startMedia(false);
document.getElementById("leave-call").onclick = ()=>{
  if(localStream){ localStream.getTracks().forEach(t=>t.stop()); localStream=null; }
  Object.values(mediaCalls).forEach(c=>c.close());
  audioContainer.innerHTML="";
};

/* =========================
   Extra Buttons
========================= */
const voiceBar = document.querySelector(".voice-bar");

const videoBtn = document.createElement("button");
videoBtn.textContent="Start Video";

const muteBtn = document.createElement("button");
muteBtn.textContent="Mute";

const deafenBtn = document.createElement("button");
deafenBtn.textContent="Deafen";

const screenBtn = document.createElement("button");
screenBtn.textContent="Share Screen";

const fileInput = document.createElement("input");
fileInput.type="file";

voiceBar.append(videoBtn,muteBtn,deafenBtn,screenBtn,fileInput);

/* Video Button */
videoBtn.onclick = ()=>startMedia(true);

/* Mute Button */
muteBtn.onclick = ()=>{
  if(!localStream) return;
  isMuted=!isMuted;
  localStream.getAudioTracks().forEach(t=>t.enabled=!isMuted);
  muteBtn.textContent=isMuted?"Unmute":"Mute";
};

/* Deafen Button */
deafenBtn.onclick = ()=>{
  if(!localStream) return;
  isDeafened=!isDeafened;
  localStream.getAudioTracks().forEach(t=>t.enabled=!isDeafened);
  document.querySelectorAll("video,audio").forEach(el=>{
    if(el.id!=="video-local") el.muted=isDeafened;
  });
  deafenBtn.textContent=isDeafened?"Undeafen":"Deafen";
};

/* Screen Share */
screenBtn.onclick = async ()=>{
  if(!localStream) return;
  if(!isScreenSharing){
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video:true });
    const screenTrack = screenStream.getVideoTracks()[0];
    replaceVideoTrack(screenTrack);
    addVideo("local",screenStream,true);
    screenTrack.onended=stopScreenShare;
    isScreenSharing=true;
    screenBtn.textContent="Stop Share";
  } else stopScreenShare();
};

function replaceVideoTrack(newTrack){
  Object.values(mediaCalls).forEach(call=>{
    const sender = call.peerConnection.getSenders().find(s=>s.track && s.track.kind==="video");
    if(sender) sender.replaceTrack(newTrack);
  });
}

async function stopScreenShare(){
  const camStream = await navigator.mediaDevices.getUserMedia({ video:true, audio:false });
  const camTrack = camStream.getVideoTracks()[0];
  replaceVideoTrack(camTrack);
  addVideo("local",camStream,true);
  isScreenSharing=false;
  screenBtn.textContent="Share Screen";
}

/* =========================
   File Sharing
========================= */
const receiveFileMeta={};
const receivedBuffers={};

fileInput.onchange = async ()=>{
  const file = fileInput.files[0];
  const id = Math.random().toString(36);

  broadcast({ type:"file-meta", id, name:file.name });

  const chunkSize = 16000;
  let offset = 0;
  while(offset < file.size){
    const slice = file.slice(offset,offset+chunkSize);
    const buffer = await slice.arrayBuffer();
    broadcast({ type:"file-chunk", id, chunk:buffer });
    offset += chunkSize;
  }
  broadcast({ type:"file-end", id });
  logMessage("SYSTEM","Sent file: "+file.name);
};

/* =========================
   Host / Join
========================= */
document.getElementById("host").onclick = ()=>{
  username = document.getElementById("username").value || "Host";
  isHost = true;
};

document.getElementById("join").onclick = ()=>{
  username = document.getElementById("username").value || "User";
  const hostId = document.getElementById("host-id").value;
  const conn = peer.connect(hostId);
  setupConnection(conn);
};