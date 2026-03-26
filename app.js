"use strict";

/* ============================================================
   UTIL
============================================================ */
const esc = s => String(s).replace(/[&<>]/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[m]));

/* ============================================================
   MEDIA PROTECTION MANAGER
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

  document.addEventListener("visibilitychange", ()=> {
    if (document.hidden) trigger();
    else restore();
  });

  window.addEventListener("blur", trigger);
  window.addEventListener("focus", restore);

  setInterval(()=>{
    const t = performance.now();
    debugger;
    if (performance.now() - t > 100) trigger();
  },2000);

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
    if(conns[pid]) return;
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

  return { connect, sendAll, id:()=>id };
})();

/* ============================================================
   MESSAGE MANAGER
============================================================ */
const messageManager = (() => {
  const seenDeletes = new Set();

  function send(text){
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
      uiController.addImage(data);
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
   CALL MANAGER
============================================================ */
const callManager = (() => {
  let localStream=null;
  const calls={};

  async function start(){
    localStream = await navigator.mediaDevices.getUserMedia({audio:true,video:true});
    Object.keys(peerManager).forEach(p=>callPeer(p));
    addVideo(localStream,true);
  }

  function callPeer(pid){
    const call = peerManager.peer?.call(pid,localStream);
    if(!call) return;
    setup(call);
  }

  function receive(call){
    call.answer(localStream);
    setup(call);
  }

  function setup(call){
    calls[call.peer]=call;

    call.on("stream",s=>{
      addVideo(s,false);
    });

    call.on("close",()=>removeVideo(call.peer));
  }

  function leave(){
    Object.values(calls).forEach(c=>c.close());
    calls.clear;
    localStream?.getTracks().forEach(t=>t.stop());
  }

  function addVideo(stream,self){
    const v=document.createElement("video");
    v.srcObject=stream;
    v.autoplay=true;
    document.getElementById("video-grid").appendChild(v);
  }

  function removeVideo(pid){
    document.getElementById("video-grid").innerHTML="";
  }

  return { start, leave, receive };
})();

/* ============================================================
   DM MANAGER (with images)
============================================================ */
const dmManager = (() => {
  function sendImage(file){
    const reader=new FileReader();
    reader.onload=()=>{
      peerManager.sendAll({
        type:"img",
        data:reader.result
      });
      uiController.addImage({data:reader.result},true);
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