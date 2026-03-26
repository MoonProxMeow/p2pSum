"use strict";

/* ============================================================
   UTIL
============================================================ */
const esc = s => String(s).replace(/[&<>]/g, m => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;"
}[m]));

/* ============================================================
   MEDIA PROTECTION MANAGER (STABLE)
============================================================ */
const mediaProtectionManager = (() => {
  let active = false;
  const overlay = document.getElementById("drm-overlay");

  function set(state) {
    active = state;
    overlay.classList.toggle("hidden", !state);

    document.querySelectorAll("video").forEach(v=>{
      v.style.filter = state ? "brightness(0)" : "";
    });
  }

  let blurCount = 0;
  let lastBlur = 0;

  window.addEventListener("blur", () => {
    const now = Date.now();
    blurCount = (now - lastBlur < 400) ? blurCount + 1 : 1;
    lastBlur = now;

    if (blurCount >= 3) set(true);
  });

  window.addEventListener("focus", () => {
    setTimeout(() => {
      blurCount = 0;
      set(false);
    }, 500);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && blurCount >= 2) set(true);
  });

  // screen share hook
  if (navigator.mediaDevices?.getDisplayMedia) {
    const orig = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = async (...args) => {
      set(true);
      return orig(...args);
    };
  }

  return { trigger:()=>set(true), restore:()=>set(false) };
})();

/* ============================================================
   PEER MANAGER
============================================================ */
const peerManager = (() => {
  const peer = new Peer();
  const conns = {};
  let id;

  peer.on("open", i => {
    id = i;
    document.getElementById("my-id").textContent = i;
  });

  function connect(pid){
    if (!pid || pid===id || conns[pid]) return;
    const conn = peer.connect(pid);
    setup(conn);
  }

  function setup(conn){
    conns[conn.peer] = conn;

    conn.on("data", data => {
      messageManager.handle(conn.peer, data);
    });

    conn.on("close", () => delete conns[conn.peer]);
  }

  peer.on("connection", setup);
  peer.on("call", callManager.receive);

  function broadcast(data){
    Object.values(conns).forEach(c => c.send(data));
  }

  function getPeers(){
    return Object.keys(conns);
  }

  return { connect, broadcast, getPeers, id:()=>id, peer };
})();

/* ============================================================
   MESSAGE MANAGER
============================================================ */
const messageManager = (() => {
  const seenDeletes = new Set();

  function send(text){
    if (!text.trim()) return;

    const msg = {
      type:"msg",
      id:crypto.randomUUID(),
      from:peerManager.id(),
      text
    };

    peerManager.broadcast(msg);
    uiController.addMessage(msg, true);
  }

  function handle(from, data){
    if (!data || typeof data !== "object") return;

    if (data.type === "msg") {
      uiController.addMessage(data, false);
    }

    if (data.type === "delete") {
      if (seenDeletes.has(data.id)) return;
      seenDeletes.add(data.id);
      uiController.deleteMessage(data.id);
    }

    if (data.type === "img") {
      uiController.addImage(data, false);
    }
  }

  function requestDelete(msg){
    if (msg.from !== peerManager.id()) return;

    peerManager.broadcast({ type:"delete", id:msg.id });
    uiController.deleteMessage(msg.id);
  }

  return { send, handle, requestDelete };
})();

/* ============================================================
   EMOJI MANAGER
============================================================ */
const emojiManager = (() => {
  let custom = JSON.parse(localStorage.getItem("emojis") || "{}");

  function save(){
    localStorage.setItem("emojis", JSON.stringify(custom));
  }

  function add(name, data){
    custom[name] = data;
    save();
  }

  function parse(text){
    return text.replace(/:([a-z0-9_]+):/gi, (m,n)=>{
      if (custom[n]) {
        return `<img src="${custom[n]}" class="custom-emoji-inline">`;
      }
      return m;
    });
  }

  return { add, parse, custom };
})();

/* ============================================================
   CALL MANAGER (FULL FIX)
============================================================ */
const callManager = (() => {
  let localStream = null;
  const calls = {};
  const videoGrid = document.getElementById("video-grid");

  async function start(){
    if (localStream) return;

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio:true,
        video:true
      });
    } catch {
      alert("Camera/Mic required");
      return;
    }

    render();

    peerManager.getPeers().forEach(pid => callPeer(pid));
  }

  function callPeer(pid){
    if (!localStream) return;

    const call = peerManager.peer.call(pid, localStream);
    if (!call) return;

    setup(call);
  }

  function receive(call){
    if (!localStream) {
      navigator.mediaDevices.getUserMedia({audio:true,video:true})
        .then(stream=>{
          localStream = stream;
          render();
          call.answer(stream);
          setup(call);
        });
    } else {
      call.answer(localStream);
      setup(call);
    }
  }

  function setup(call){
    calls[call.peer] = call;

    call.on("stream", stream=>{
      call._stream = stream;
      render();
    });

    call.on("close", ()=>{
      delete calls[call.peer];
      render();
    });
  }

  function leave(){
    Object.values(calls).forEach(c => c.close());
    Object.keys(calls).forEach(k => delete calls[k]);

    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }

    render();
  }

  function render(){
    videoGrid.innerHTML = "";

    if (localStream) {
      addVideo(localStream, true);
    }

    Object.values(calls).forEach(call=>{
      if (call._stream) addVideo(call._stream);
    });
  }

  function addVideo(stream, self=false){
    const v = document.createElement("video");
    v.srcObject = stream;
    v.autoplay = true;
    v.playsInline = true;
    if (self) v.muted = true;

    videoGrid.appendChild(v);
  }

  return { start, leave, receive };
})();

/* ============================================================
   DM MANAGER (IMAGES)
============================================================ */
const dmManager = (() => {
  function sendImage(file){
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const payload = {
        type:"img",
        id:crypto.randomUUID(),
        from:peerManager.id(),
        data:reader.result
      };

      peerManager.broadcast(payload);
      uiController.addImage(payload, true);
    };
    reader.readAsDataURL(file);
  }

  return { sendImage };
})();

/* ============================================================
   UI CONTROLLER
============================================================ */
const uiController = (() => {
  const messages = document.getElementById("messages");

  function addMessage(msg, self){
    const el = document.createElement("div");
    el.dataset.id = msg.id;

    el.innerHTML = `<b>${self ? "Me" : esc(msg.from)}</b>: ${emojiManager.parse(esc(msg.text))}`;

    el.oncontextmenu = e => {
      e.preventDefault();
      messageManager.requestDelete(msg);
    };

    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  function deleteMessage(id){
    const el = document.querySelector(`[data-id="${id}"]`);
    if (el) el.textContent = "Message deleted";
  }

  function addImage(msg){
    const img = document.createElement("img");
    img.src = msg.data;
    img.className = "msg-img";

    img.onclick = () => {
      document.getElementById("lightbox-img").src = msg.data;
      document.getElementById("lightbox").classList.remove("hidden");
    };

    messages.appendChild(img);
    messages.scrollTop = messages.scrollHeight;
  }

  return { addMessage, deleteMessage, addImage };
})();

/* ============================================================
   EVENTS
============================================================ */
document.getElementById("send-btn").onclick = () => {
  const input = document.getElementById("msg-input");
  messageManager.send(input.value);
  input.value = "";
};

document.getElementById("connect-btn").onclick = () => {
  peerManager.connect(document.getElementById("peer-id-input").value);
};

document.getElementById("img-btn").onclick = () => {
  document.getElementById("img-input").click();
};

document.getElementById("img-input").onchange = e => {
  dmManager.sendImage(e.target.files[0]);
};

document.getElementById("join-call").onclick = () => callManager.start();
document.getElementById("leave-call").onclick = () => callManager.leave();

document.getElementById("lightbox").onclick = () => {
  document.getElementById("lightbox").classList.add("hidden");
};