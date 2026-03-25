/* =========================
   Peer Setup
========================= */
const peer = new Peer();

let username = "Anonymous";
let isHost = false;

const connections = {};      // Data connections
const mediaCalls = {};       // Media connections
let localStream = null;

const sessionKeys = {};      // AES keys per peer

/* =========================
   UI Elements
========================= */
const myIdEl = document.getElementById("my-id");
const peersEl = document.getElementById("peers");
const messagesEl = document.getElementById("messages");
const messageInput = document.getElementById("message");
const audioContainer = document.getElementById("audio-container");

const joinCallBtn = document.getElementById("join-call");
const leaveCallBtn = document.getElementById("leave-call");

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

function updatePeerList(){
  peersEl.innerHTML="<b>Connected:</b><br>";
  Object.keys(connections).forEach(id=>{
    peersEl.innerHTML+=id+"<br>";
  });
}

function broadcastEncrypted(data, exclude=null){
  Object.entries(connections).forEach(([peerId, conn])=>{
    if(conn.open && peerId!==exclude){
      if(sessionKeys[peerId]){
        encryptData(conn.peer, data).then(encrypted=>{
          conn.send({ encrypted:true, payload:encrypted });
        });
      }
    }
  });
}

/* =========================
   Encryption Utilities
========================= */
async function generateAESKey(){
  return crypto.subtle.generateKey(
    {name:"AES-GCM", length:256},
    true,
    ["encrypt","decrypt"]
  );
}

async function exportKey(key){
  return crypto.subtle.exportKey("raw", key);
}

async function importKey(raw){
  return crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt","decrypt"]);
}

async function encryptData(peerId, obj){
  const key = sessionKeys[peerId];
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const encrypted = await crypto.subtle.encrypt({name:"AES-GCM", iv}, key, data);
  return {iv:Array.from(iv), data:Array.from(new Uint8Array(encrypted))};
}

async function decryptData(peerId, payload){
  const key = sessionKeys[peerId];
  const iv = new Uint8Array(payload.iv);
  const data = new Uint8Array(payload.data);
  const decrypted = await crypto.subtle.decrypt({name:"AES-GCM", iv}, key, data);
  return JSON.parse(new TextDecoder().decode(decrypted));
}

/* =========================
   Peer Events
========================= */
peer.on("open", id => myIdEl.textContent=id);

peer.on("connection", conn=>{
  setupConnection(conn);
});

peer.on("call", call=>{
  if(localStream) call.answer(localStream);
  setupMediaCall(call);
});

/* =========================
   Connections
========================= */
function setupConnection(conn){
  connections[conn.peer] = conn;
  updatePeerList();

  conn.on("data", async data=>{
    // Setup AES key if first connection
    if(data.type==="key"){
      sessionKeys[conn.peer] = await importKey(new Uint8Array(data.key).buffer);
    }

    // Handle encrypted messages
    if(data.encrypted){
      if(sessionKeys[conn.peer]){
        const obj = await decryptData(conn.peer, data.payload);
        handleData(conn, obj);
      }
    } else handleData(conn,data);
  });

  conn.on("open", async ()=>{
    // generate session key for this connection
    const key = await generateAESKey();
    sessionKeys[conn.peer] = key;
    const raw = new Uint8Array(await exportKey(key));
    conn.send({type:"key", key:raw});

    // initiate media
    if(localStream){
      const call = peer.call(conn.peer, localStream);
      setupMediaCall(call);
    }
  });

  conn.on("close", ()=>{
    delete connections[conn.peer];
    delete sessionKeys[conn.peer];
    updatePeerList();
  });
}

/* =========================
   Chat
========================= */
function handleData(conn,data){
  if(data.type==="message"){
    logMessage(data.user,data.text);
  }
}

function sendMessage(){
  const text = messageInput.value.trim();
  if(!text) return;
  messageInput.value="";
  const data = { type:"message", user:username, text };
  logMessage(username,text);
  broadcastEncrypted(data);
}

document.getElementById("send").onclick = sendMessage;
messageInput.addEventListener("keydown", e=>{
  if(e.key==="Enter"){ e.preventDefault(); sendMessage(); }
});

/* =========================
   Voice / Video / Screen
========================= */
let isMuted=false;
let isDeafened=false;
let isScreenSharing=false;
let cameraEnabled=true;

async function startMedia(video=false){
  localStream = await navigator.mediaDevices.getUserMedia({
    audio:{ noiseSuppression:true, echoCancellation:true, autoGainControl:true },
    video:video
  });
  addVideo("local", localStream, true);

  Object.values(connections).forEach(conn=>{
    const call = peer.call(conn.peer, localStream);
    setupMediaCall(call);
  });
}

function setupMediaCall(call){
  mediaCalls[call.peer] = call;
  call.on("stream", stream => addVideo(call.peer, stream, false));
  call.on("close", ()=>removeVideo(call.peer));
}

/* =========================
   Video Elements
========================= */
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
  const el=document.getElementById("video-"+id);
  if(el) el.remove();
}

/* =========================
   Media Controls
========================= */
joinCallBtn.onclick = ()=>startMedia(false);

leaveCallBtn.onclick = ()=>{
  if(localStream){
    localStream.getTracks().forEach(t=>t.stop());
    localStream=null;
  }
  Object.values(mediaCalls).forEach(c=>c.close());
  audioContainer.innerHTML="";
  leaveCallBtn.textContent="Leave Voice";
};

const voiceBar = document.querySelector(".voice-bar");
const videoBtn=document.createElement("button");
videoBtn.textContent="Toggle Camera";
const muteBtn=document.createElement("button");
muteBtn.textContent="Mute";
const deafenBtn=document.createElement("button");
deafenBtn.textContent="Deafen";
const screenBtn=document.createElement("button");
screenBtn.textContent="Share Screen";
const fileInput=document.createElement("input");
fileInput.type="file";

voiceBar.append(videoBtn,muteBtn,deafenBtn,screenBtn,fileInput);

/* Toggle camera */
videoBtn.onclick = ()=>{
  if(!localStream) return;
  cameraEnabled = !cameraEnabled;
  localStream.getVideoTracks().forEach(t=>t.enabled=cameraEnabled);
  videoBtn.textContent = cameraEnabled ? "Camera On" : "Camera Off";
};

/* Mute */
muteBtn.onclick = ()=>{
  if(!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(t=>t.enabled=!isMuted);
  muteBtn.textContent = isMuted ? "Unmute" : "Mute";
};

/* Deafen */
deafenBtn.onclick = ()=>{
  if(!localStream) return;
  isDeafened = !isDeafened;
  localStream.getAudioTracks().forEach(t=>t.enabled=!isDeafened);
  document.querySelectorAll("video,audio").forEach(el=>{
    if(el.id!=="video-local") el.muted=isDeafened;
  });
  deafenBtn.textContent = isDeafened ? "Undeafen" : "Deafen";
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
  if(!localStream) return;
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
  const chunkSize = 16000;

  for(const peerId in connections){
    broadcastEncrypted({type:"file-meta",id,name:file.name});
  }

  let offset=0;
  while(offset<file.size){
    const slice = file.slice(offset,offset+chunkSize);
    const buffer = await slice.arrayBuffer();
    for(const peerId in connections){
      broadcastEncrypted({type:"file-chunk",id,chunk:Array.from(new Uint8Array(buffer))});
    }
    offset+=chunkSize;
  }

  for(const peerId in connections){
    broadcastEncrypted({type:"file-end",id});
  }

  logMessage("SYSTEM","Sent file: "+file.name);
};

/* =========================
   Host / Join
========================= */
document.getElementById("host").onclick = ()=>{
  username = document.getElementById("username").value || "Host";
  isHost=true;
};

document.getElementById("join").onclick = ()=>{
  username = document.getElementById("username").value || "User";
  const hostId=document.getElementById("host-id").value;
  const conn = peer.connect(hostId);
  setupConnection(conn);
};