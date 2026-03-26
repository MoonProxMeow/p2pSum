"use strict";

/* ============================================================
   UTIL
============================================================ */
const esc = s => String(s).replace(/[&<>]/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[m]));

/* ============================================================
   MEDIA PROTECTION MANAGER (FIXED)
============================================================ */
const mediaProtectionManager = (() => {
  let triggered = false;
  const overlay = document.getElementById("drm-overlay");

  function trigger() {
    if (triggered) return;
    triggered = true;
    overlay.classList.remove("hidden");
    blackoutMedia(true);
  }

  function restore() {
    triggered = false;
    overlay.classList.add("hidden");
    blackoutMedia(false);
  }

  function blackoutMedia(state){
    document.querySelectorAll("video").forEach(v=>{
      v.style.filter = state ? "brightness(0)" : "";
    });
  }

  /* --- SAFE DETECTION --- */

  let lastBlur = 0;

  window.addEventListener("blur", () => {
    lastBlur = Date.now();
    trigger();
  });

  window.addEventListener("focus", () => {
    if (Date.now() - lastBlur > 300) {
      restore();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      trigger();
    } else {
      setTimeout(restore, 300);
    }
  });

  /* --- SCREEN SHARE DETECTION --- */
  if (navigator.mediaDevices?.getDisplayMedia) {
    const orig = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);

    navigator.mediaDevices.getDisplayMedia = async (...args) => {
      trigger();
      return orig(...args);
    };
  }

  return { trigger, restore };
})();

/* ============================================================
   PEER MANAGER
============================================================ */
const peerManager = (() => {
  const peer = new Peer();
  const conns = {};
  let id;

  peer.on("open", i=>{
    id = i;
    document.getElementById("my-id").textContent = i;
  });

  function connect(pid){
    if(!pid || pid===id || conns[pid]) return;
    const c = peer.connect(pid);
    setup(c);
  }

  function setup(conn){
    conns[conn.peer]=conn;

    conn.on("data", d=>{
      messageManager.handle(conn.peer,d);
    });

    conn.on("close",()=>delete conns[conn.peer]);
  }

  peer.on("connection",setup);
  peer.on("call",callManager.receive);

  function sendAll(data){
    Object.values(conns).forEach(c=>c.send(data));
  }

  return { connect, sendAll, id:()=>id, peer };
})();

/* ============================================================
   MESSAGE MANAGER (WITH DELETE SECURITY)
============================================================ */
const messageManager = (() => {
  const seenDeletes = new Set();

  function send(text){
    if(!text.trim()) return;

    const msg = {
      type:"msg",
      id:crypto.randomUUID(),
      from:peerManager.id(),
      text
    };

    peerManager.sendAll(msg);
    uiController.addMessage(msg,true);
  }

  function handle(from,data){
    if(!data || typeof data!=="object") return;

    if(data.type==="msg"){
      uiController.addMessage(data,false);
    }

    if(data.type==="delete"){
      if(seenDeletes.has(data.id)) return;
      seenDeletes.add(data.id);
      uiController.deleteMessage(data.id);
    }

    if(data.type==="img"){
      uiController.addImage(data,false);
    }
  }

  function requestDelete(msg){
    if(msg.from!==peerManager.id()) return;

    peerManager.sendAll({type:"delete",id:msg.id});
    uiController.deleteMessage(msg.id);
  }

  return { send, handle, requestDelete };
})();

/* ============================================================
   EMOJI MANAGER
============================================================ */
const emojiManager = (() => {
  let custom = JSON.parse(localStorage.getItem("emojis")||"{}");

  function save(){localStorage.setItem("emojis",JSON.stringify(custom));}

  function add(name,data){
    custom[name]=data;
    save();
  }

  function parse(text){
    return text.replace(/:([a-z0-9_]+):/gi,(m,n)=>{
      if(custom[n]) return `<img src="${custom[n]}" class="custom-emoji-inline">`;
      return m;
    });
  }

  return { add, parse, custom };
})();

/* ============================================================
   CALL MANAGER (FIXED)
============================================================ */
const callManager = (() => {
  let localStream=null;
  const calls={};

  async function start(){
    if(localStream) return;

    localStream = await navigator.mediaDevices.getUserMedia({audio:true,video:true});

    addVideo(localStream,true);

    Object.keys(peerManager.peer.connections).forEach(pid=>{
      callPeer(pid);
    });
  }

  function callPeer(pid){
    if(!localStream) return;

    const call = peerManager.peer.call(pid,localStream);
    if(!call) return;

    setup(call);
  }

  function receive(call){
    if(!localStream){
      navigator.mediaDevices.getUserMedia({audio:true,video:true}).then(stream=>{
        localStream = stream;
        addVideo(localStream,true);
        call.answer(stream);
        setup(call);
      });
    } else {
      call.answer(localStream);
      setup(call);
    }
  }

  function setup(call){
    calls[call.peer]=call;

    call.on("stream",s=>{
      addVideo(s,false);
    });

    call.on("close",()=>{
      delete calls[call.peer];
      renderVideos();
    });
  }

  function leave(){
    Object.values(calls).forEach(c=>c.close());
    Object.keys(calls).forEach(k=>delete calls[k]);

    localStream?.getTracks().forEach(t=>t.stop());
    localStream=null;

    renderVideos();
  }

  function renderVideos(){
    document.getElementById("video-grid").innerHTML="";
    if(localStream) addVideo(localStream,true);
  }

  function addVideo(stream,self){
    const v=document.createElement("video");
    v.srcObject=stream;
    v.autoplay=true;
    v.playsInline=true;
    if(self) v.muted=true;

    document.getElementById("video-grid").appendChild(v);
  }

  return { start, leave, receive };
})();

/* ============================================================
   DM MANAGER (IMAGES)
============================================================ */
const dmManager = (() => {
  function sendImage(file){
    if(!file) return;

    const reader=new FileReader();
    reader.onload=()=>{
      const payload = {
        type:"img",
        id:crypto.randomUUID(),
        from:peerManager.id(),
        data:reader.result
      };

      peerManager.sendAll(payload);
      uiController.addImage(payload,true);
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

  function addMessage(msg,self){
    const el=document.createElement("div");
    el.dataset.id=msg.id;

    el.innerHTML = `<b>${self?"Me":esc(msg.from)}</b>: ${emojiManager.parse(esc(msg.text))}`;

    el.oncontextmenu=e=>{
      e.preventDefault();
      messageManager.requestDelete(msg);
    };

    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  function deleteMessage(id){
    const el=document.querySelector(`[data-id="${id}"]`);
    if(el){
      el.textContent="Message deleted";
    }
  }

  function addImage(msg,self){
    const el=document.createElement("img");
    el.src=msg.data;
    el.className="msg-img";

    el.onclick=()=>{
      document.getElementById("lightbox-img").src=msg.data;
      document.getElementById("lightbox").classList.remove("hidden");
    };

    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  return { addMessage, deleteMessage, addImage };
})();

/* ============================================================
   EVENTS
============================================================ */
document.getElementById("send-btn").onclick=()=>{
  const input=document.getElementById("msg-input");
  messageManager.send(input.value);
  input.value="";
};

document.getElementById("connect-btn").onclick=()=>{
  peerManager.connect(document.getElementById("peer-id-input").value);
};

document.getElementById("img-btn").onclick=()=>{
  document.getElementById("img-input").click();
};

document.getElementById("img-input").onchange=e=>{
  dmManager.sendImage(e.target.files[0]);
};

document.getElementById("join-call").onclick=()=>callManager.start();
document.getElementById("leave-call").onclick=()=>callManager.leave();

document.getElementById("lightbox").onclick=()=>{
  document.getElementById("lightbox").classList.add("hidden");
};