<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Digoo · Equipe</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=Bebas+Neue&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'IBM Plex Mono', monospace;
  padding: 20px 28px 60px;
  min-height: 100vh;
  transition: background 0.3s, color 0.3s;
}
body {
  --bg: #000; --bg2: #0a0a0a; --bg3: #111;
  --border: #2a2a2a; --border2: #333;
  --text: #fff; --text2: #ccc; --text3: #888; --sub: #666;
  --done: #888; --sep: rgba(255,255,255,0.08);
  --c-d: #00ffe5; --hbg-d: #0a2820;
  --c-b: #9d7fff; --hbg-b: #12103a;
  --c-l: #ff1f7a; --hbg-l: #280818;
  --pu: #ff0000; --pi: #ffe600; --pn: #00ff77;
  background: var(--bg); color: var(--text);
}
body.light {
  --bg: #f2f2ee; --bg2: #e8e8e4; --bg3: #fff;
  --border: #d0d0cc; --border2: #bbb;
  --text: #111; --text2: #333; --text3: #666; --sub: #666;
  --done: #888; --sep: rgba(0,0,0,0.07);
  --c-d: #009688; --hbg-d: #d4f0ed;
  --c-b: #5c35cc; --hbg-b: #e0d9f8;
  --c-l: #cc0055; --hbg-l: #f8d9e8;
  --pu: #cc0000; --pi: #cc8800; --pn: #007744;
  background: var(--bg); color: var(--text);
}
.toggle-wrap { display: flex; justify-content: flex-end; max-width: 1280px; margin: 0 auto 16px; }
.toggle-track { width: 48px; height: 26px; border-radius: 13px; background: var(--border2); border: 1px solid var(--border2); cursor: pointer; position: relative; transition: background 0.3s, border-color 0.3s; flex-shrink: 0; }
.toggle-thumb { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #777; transition: transform 0.25s cubic-bezier(.4,0,.2,1), background 0.25s; display: flex; align-items: center; justify-content: center; font-size: 11px; line-height: 1; }
body.light .toggle-track { background: #e0ddd5; border-color: #ccc; }
body.light .toggle-thumb { transform: translateX(22px); background: #fff; }
header { text-align: center; margin-bottom: 24px; }
.sub { font-size: 10px; letter-spacing: 6px; color: var(--text); margin-bottom: 6px; text-transform: uppercase; opacity: 0.5; }
h1 { font-family: 'Bebas Neue', sans-serif; font-size: 44px; letter-spacing: 5px; color: var(--text); }
.sync { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--pn); margin-left: 10px; vertical-align: middle; box-shadow: 0 0 10px var(--pn); animation: pulse 2s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
@keyframes siren { 0%,100%{opacity:1} 50%{opacity:0.15} }
.grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; max-width: 1280px; margin: 0 auto; align-items: start; }
.card { border-radius: 10px; border: 1px solid var(--border); overflow: hidden; transition: border-color 0.3s, box-shadow 0.3s; }
@keyframes cardFlash { 0%,100% { box-shadow: none; } 50% { box-shadow: 0 0 40px var(--c), 0 0 80px var(--c); border-color: var(--c) !important; } }
.card.flashing { animation: cardFlash 0.9s ease-in-out infinite; }
.card-header { padding: 16px 14px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--sep); cursor: pointer; transition: filter 0.15s; user-select: none; }
.card-header:hover { filter: brightness(1.08); }
.avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 500; letter-spacing: 1px; flex-shrink: 0; }
.member-name { font-family: 'Bebas Neue', sans-serif; font-size: 22px; letter-spacing: 3px; }
.dots { display: flex; gap: 5px; margin-top: 4px; min-height: 8px; align-items: center; }
.dot { width: 7px; height: 7px; border-radius: 50%; }
.chevron { margin-left: auto; font-size: 11px; color: var(--text2); transition: transform 0.2s; }
.chevron.open { transform: rotate(180deg); }
.unread-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.panel { background: var(--bg2); padding: 16px; display: none; }
.panel.open { display: block; }
.pin-wrap { text-align: center; padding: 20px 0; }
.pin-icon { font-size: 26px; margin-bottom: 12px; color: var(--text2); }
.pin-wrap p { font-size: 12px; color: var(--text); margin-bottom: 16px; letter-spacing: 1px; opacity: 0.7; }
.pin-input { background: var(--bg3); border: 1px solid var(--border2); border-radius: 5px; color: var(--text); font-size: 18px; padding: 8px 14px; text-align: center; outline: none; width: 140px; letter-spacing: 8px; font-family: inherit; }
.pin-btn { display: block; margin: 12px auto 0; padding: 7px 20px; border: none; border-radius: 4px; font-size: 10px; letter-spacing: 2px; cursor: pointer; font-family: inherit; font-weight: 500; }
@keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-6px)} 40%,80%{transform:translateX(6px)} }
.shake { animation: shake 0.35s ease; }
.task-row { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--sep); }
.task-row:last-of-type { border-bottom: none; }
.task-check { width: 28px; height: 28px; border-radius: 5px; border: 1.5px solid var(--border2); background: none; cursor: pointer; flex-shrink: 0; padding: 0; transition: all 0.15s; touch-action: manipulation; display: flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent; }
.task-check.done::after { content: '✓'; color: #000; font-size: 11px; font-weight: 700; }
.task-check.progress::after { content: ''; }
.task-text { flex: 1; font-size: 13px; color: var(--text); line-height: 1.4; }
.task-text.done { text-decoration: line-through; color: var(--text); opacity: 0.5; }
.task-prio { display: flex; align-items: center; gap: 4px; margin-top: 3px; }
.task-prio .dot { width: 5px; height: 5px; }
.task-prio span { font-size: 9px; opacity: 0.85; letter-spacing: 1px; }
.del-btn { background: none; border: none; color: var(--border2); cursor: pointer; font-size: 18px; padding: 0; opacity: 0; transition: opacity 0.12s; flex-shrink: 0; line-height: 1; }
.task-row:hover .del-btn { opacity: 1; }
.done-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.done-label { font-size: 10px; color: var(--text); letter-spacing: 2px; font-weight: 500; opacity: 0.7; }
.clear-btn { background: none; border: none; color: var(--text); font-size: 10px; letter-spacing: 1.5px; cursor: pointer; font-family: inherit; opacity: 0.6; }
.task-row.done-row { opacity: 0.65; }
.section { margin-top: 14px; border-top: 1px solid var(--sep); padding-top: 12px; }
.section-label { font-size: 10px; color: var(--text); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 10px; font-weight: 500; opacity: 0.7; }
.input-box { background: var(--bg3); border: 1px solid var(--border2); border-radius: 6px; padding: 12px; margin-top: 6px; }
.input-box input { width: 100%; background: none; border: none; outline: none; color: var(--text); font-size: 13px; margin-bottom: 10px; padding: 0; font-family: inherit; }
.input-box input::placeholder { color: var(--text3); }
.prio-row { display: flex; gap: 5px; margin-bottom: 10px; flex-wrap: wrap; }
.prio-btn { padding: 3px 10px; border-radius: 3px; border: 1px solid var(--border2); background: none; color: var(--text2); font-size: 9px; letter-spacing: 1px; cursor: pointer; font-family: inherit; transition: all 0.12s; }
.who-row { display: flex; gap: 6px; margin-bottom: 10px; }
.who-btn { padding: 4px 14px; border-radius: 3px; border: 1px solid var(--border2); background: none; color: var(--text2); font-size: 11px; letter-spacing: 1px; cursor: pointer; font-family: inherit; transition: all 0.12s; }
.btn-row { display: flex; gap: 6px; }
.btn-primary { flex: 1; border: none; border-radius: 5px; padding: 8px; font-size: 10px; letter-spacing: 2px; cursor: pointer; font-family: inherit; font-weight: 500; transition: all 0.12s; }
.btn-primary:disabled { background: var(--bg2) !important; color: var(--text3) !important; cursor: not-allowed; }
.btn-cancel { background: none; border: 1px solid var(--border2); color: var(--text3); border-radius: 5px; padding: 8px 12px; font-size: 12px; cursor: pointer; }
.add-dashed { width: 100%; background: none; border-radius: 5px; padding: 10px; font-size: 12px; cursor: pointer; letter-spacing: 1.5px; transition: all 0.15s; font-family: inherit; border-style: dashed; border-width: 1px; margin-top: 4px; color: var(--text); border-color: var(--text2); opacity: 0.75; }
.msg-row { display: flex; align-items: flex-start; gap: 8px; padding: 9px 10px; margin-bottom: 5px; border-radius: 5px; border: 1px solid var(--border); background: var(--bg3); position: relative; }
.msg-row:hover .del-btn { opacity: 1; }
.msg-from { font-size: 9px; letter-spacing: 1px; white-space: nowrap; margin-top: 2px; font-weight: 500; }
.msg-text { flex: 1; font-size: 12px; color: var(--text); line-height: 1.5; }
.msg-text.read { color: var(--text3); }
.msg-ts { font-size: 9px; color: var(--text2); margin-top: 3px; }
.msg-btn { background: none; border: 1px solid var(--border2); border-radius: 4px; color: var(--text3); cursor: pointer; font-size: 13px; padding: 3px 7px; flex-shrink: 0; transition: all 0.15s; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.msg-btn.has-msg { border-color: var(--c-b); color: var(--c-b); }
.task-msg-form { background: var(--bg3); border: 1px solid var(--border2); border-radius: 5px; padding: 10px; margin-top: 6px; }
.task-msg-form input { width: 100%; background: none; border: none; outline: none; color: var(--text); font-size: 12px; padding: 0; font-family: inherit; margin-bottom: 8px; }
.task-msg-form input::placeholder { color: var(--text3); }
.ml-subtabs { display: flex; gap: 0; border-bottom: 1px solid var(--sep); margin-bottom: 16px; }
.ml-subtab { padding: 8px 16px; background: none; border: none; font-family: inherit; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; cursor: pointer; color: var(--text3); border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 0.15s; }
.ml-subtab.active { color: var(--text); border-bottom-color: var(--text); }
.ml-subtab .badge { display: inline-block; background: var(--text3); color: var(--bg); border-radius: 10px; padding: 1px 6px; font-size: 9px; margin-left: 4px; font-weight: 700; }
.ml-subtab.active .badge { background: var(--text); }
.ml-tab { padding: 14px 0; }
.ml-connect-btn { display: block; width: 100%; padding: 12px; background: none; border: 1px solid #fff15544; color: #fff155; border-radius: 6px; font-family: inherit; font-size: 11px; letter-spacing: 2px; cursor: pointer; text-align: center; transition: all 0.15s; margin-bottom: 12px; }
.ml-connect-btn:hover { background: #fff15511; }
.ml-card { background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; margin-bottom: 6px; display: flex; align-items: flex-start; gap: 10px; }
.ml-card:hover { border-color: #fff15544; }
.ml-badge { font-size: 9px; padding: 2px 7px; border-radius: 3px; letter-spacing: 1px; white-space: nowrap; flex-shrink: 0; }
.ml-link { background: none; border: none; color: #fff155; cursor: pointer; font-size: 10px; letter-spacing: 1px; font-family: inherit; padding: 0; text-decoration: underline; margin-top: 4px; display: block; }
@keyframes spin { to { transform: rotate(360deg); } }
.spinning { animation: spin 1s linear infinite; display: inline-block; }
@keyframes borderPulse { 0%,100% { border-color: #2a2a2a; } 50% { border-color: #fff; } }
.tabs { display: flex; gap: 0; margin-bottom: 14px; border-bottom: 1px solid var(--sep); }
.tab-btn { padding: 8px 14px; background: none; border: none; font-family: inherit; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; color: var(--text3); border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 0.15s; }
.tab-btn.active { color: var(--text); border-bottom-color: var(--text); }
.corner-btn { display: block; margin-top: 12px; margin-left: auto; background: none; border: 1px solid var(--border); border-radius: 50%; width: 22px; height: 22px; font-size: 14px; cursor: pointer; transition: all 0.15s; touch-action: manipulation; font-family: inherit; line-height: 20px; text-align: center; padding: 0; color: var(--text2); }
.corner-btn:hover { border-color: var(--border2); color: var(--text2); }
#identity-screen { position: fixed; inset: 0; background: var(--bg); display: flex; align-items: center; justify-content: center; z-index: 9999; flex-direction: column; gap: 0; }
.id-title { font-family: 'Bebas Neue', sans-serif; font-size: 36px; letter-spacing: 4px; color: var(--text); margin-bottom: 8px; }
.id-sub { font-size: 10px; color: var(--text3); letter-spacing: 3px; margin-bottom: 40px; }
.id-btn { width: 220px; padding: 16px; margin-bottom: 10px; border: 1px solid; border-radius: 8px; background: none; font-family: 'Bebas Neue', sans-serif; font-size: 22px; letter-spacing: 3px; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 14px; }
.id-btn:hover { filter: brightness(1.2); transform: translateX(4px); }
.id-avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 500; letter-spacing: 1px; flex-shrink: 0; font-family: 'IBM Plex Mono', monospace; }
.alert-row { display: flex; align-items: center; gap: 10px; padding: 9px 10px; margin-bottom: 4px; border-radius: 5px; background: var(--bg3); border: 1px solid rgba(0,255,119,0.3); }
#ml-modal { position:fixed;inset:0;background:var(--bg);z-index:9000;display:none;flex-direction:column; }
#ml-modal.open { display:flex; }
#ml-modal-header { padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #fff15533;background:#0a0900;flex-shrink:0; }
#ml-modal-body { flex:1;overflow-y:auto;padding:20px; }
.ml-modal-tab { padding:8px 18px;background:none;border:none;font-family:inherit;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;color:var(--text3);border-bottom:2px solid transparent;margin-bottom:-1px;transition:all 0.15s; }
.ml-modal-tab.active { color:#fff155;border-bottom-color:#fff155; }
.ml-modal-subtabs { display:flex;border-bottom:1px solid var(--sep);margin-bottom:20px; }
/* Chat assistente */
.chat-modal {
  position:fixed; bottom:0; width:460px; max-height:680px; height:680px;
  background:var(--bg3); border:1px solid var(--border2);
  border-radius:12px 12px 0 0; box-shadow:0 -4px 30px rgba(0,0,0,0.5);
  display:flex; flex-direction:column; z-index:7000;
  transition:transform 0.2s ease;
}
@media(max-width:960px) { .chat-modal { width:92vw; right:4vw !important; } }
.chat-modal.hidden { transform:translateY(100%); }
.chat-header {
  padding:10px 14px; display:flex; align-items:center;
  justify-content:space-between; border-bottom:1px solid var(--sep);
  flex-shrink:0; border-radius:12px 12px 0 0;
}
.chat-messages {
  flex:1; overflow-y:auto; padding:12px; display:flex;
  flex-direction:column; gap:8px;
}
.chat-bubble {
  max-width:88%; padding:10px 14px; border-radius:10px;
  font-size:13px; line-height:1.65;
}
.chat-bubble.user { align-self:flex-end; }
.chat-bubble.assistant { align-self:flex-start; background:var(--bg2); color:var(--text); border:1px solid var(--border); }
.chat-input-row {
  display:flex; gap:6px; padding:10px 12px;
  border-top:1px solid var(--sep); flex-shrink:0;
}
.chat-input {
  flex:1; background:var(--bg2); border:1px solid var(--border2);
  border-radius:6px; padding:7px 10px; color:var(--text);
  font-size:12px; font-family:inherit; outline:none; resize:none;
}
.chat-send {
  border:none; border-radius:6px; padding:7px 12px;
  font-size:13px; cursor:pointer; flex-shrink:0; font-weight:700;
}
.chat-btn {
  position:absolute; bottom:10px; left:12px;
  width:26px; height:26px; border-radius:50%;
  border:1.5px solid; background:none; cursor:pointer;
  font-size:13px; display:flex; align-items:center;
  justify-content:center; transition:all 0.15s; z-index:10;
}
.chat-btn:hover { transform:scale(1.15); }
.chat-typing { font-size:11px; color:var(--text3); padding:4px 12px; }

#ml-fullscreen { position:fixed;inset:0;background:var(--bg);z-index:8000;display:none;flex-direction:column; }
#ml-fullscreen.open { display:flex; }
#ml-fullscreen-header { padding:14px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #fff15533;background:#0a0900;flex-shrink:0; }
#ml-fullscreen-body { flex:1;overflow-y:auto;padding:20px; }
footer { margin-top: 40px; text-align: center; font-size: 10px; color: var(--text); letter-spacing: 3px; text-transform: uppercase; opacity: 0.5; }
#user-label { cursor: pointer; color: var(--text); opacity: 0.5; }
::-webkit-scrollbar { width: 3px; }
::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }
@media(max-width:700px) { .grid { grid-template-columns: 1fr; } }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>
</head>
<body>

<div class="toggle-wrap">
  <div class="toggle-track" id="toggle-track" onclick="toggleTheme()" title="Alternar tema">
    <div class="toggle-thumb" id="toggle-thumb">
      <svg id="toggle-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#aaa;flex-shrink:0">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    </div>
  </div>
</div>

<header>
  <div class="sub">Digoo Brasil</div>
  <h1>EQUIPE <span class="sync" id="sync-dot"></span></h1>
</header>

<div id="identity-screen"></div>
<div class="grid" id="cards"></div>

<footer>Digoo Brasil · Porto Alegre<br><span id="user-label"></span></footer>

<!-- Chat Modals por membro -->
<div id="chat-Diogo" class="chat-modal hidden" style="right:20px;"></div>
<div id="chat-Bruno" class="chat-modal hidden" style="right:20px;"></div>
<div id="chat-Larissa" class="chat-modal hidden" style="right:20px;"></div>

<!-- ML Fullscreen Panel -->
<div id="ml-fullscreen">
  <div id="ml-fullscreen-header">
    <div style="display:flex;align-items:center;gap:10px;">
      <span style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:4px;color:#fff155;">MERCADO LIVRE</span>
    </div>
    <div style="display:flex;gap:8px;align-items:center;">
      <div id="ml-fs-subtabs" style="display:flex;border-bottom:none;"></div>
      <button onclick="toggleMLMax()" style="background:none;border:1px solid #fff15544;border-radius:4px;padding:4px 10px;color:#fff155;font-size:12px;cursor:pointer;" title="Minimizar">⤡</button>
    </div>
  </div>
  <div id="ml-fullscreen-body"></div>
</div>

<!-- ML Modal Fullscreen -->
<div id="ml-modal">
  <div id="ml-modal-header">
    <div style="display:flex;align-items:center;gap:12px;">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="6" fill="#fff155" opacity="0.1"/>
        <ellipse cx="16" cy="16" rx="12" ry="8" stroke="#fff155" stroke-width="1.5" fill="none"/>
        <path d="M8 16 Q12 10 16 16 Q20 22 24 16" stroke="#fff155" stroke-width="2" fill="none" stroke-linecap="round"/>
      </svg>
      <span style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:4px;color:#fff155;">MERCADO LIVRE</span>
    </div>
    <button onclick="fecharML()" style="background:none;border:1px solid #fff15544;border-radius:50%;width:30px;height:30px;color:#fff155;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
  </div>
  <div id="ml-modal-body"></div>
</div>

<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, push, remove, update, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBbaxrk7TXl9BiAZJzHwnJ6vI_LA5g-zzk",
  authDomain: "digoo-equipe.firebaseapp.com",
  databaseURL: "https://digoo-equipe-default-rtdb.firebaseio.com",
  projectId: "digoo-equipe",
  storageBucket: "digoo-equipe.firebasestorage.app",
  messagingSenderId: "152821168439",
  appId: "1:152821168439:web:6712b7821b1de4517782b2"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const PIN = "845278";
const STORAGE_KEY = "digoo_identity_v1";
const THEME_KEY = "digoo_theme_v1";
const origTitle = "Digoo · Equipe";
const VERCEL_BACKEND = "https://digoo-backend.vercel.app";

const MEMBERS = [
  { name:"Diogo",   initials:"DG", locked:true,  phone:null },
  { name:"Bruno",   initials:"BR", locked:false, phone:null },
  { name:"Larissa", initials:"LA", locked:false, phone:"55991774483" },
];
const PRIO = { superurgente:{label:"Super Urgente"}, urgente:{label:"Urgente"}, importante:{label:"Importante"}, normal:{label:"Normal"} };

function themeColor(name) {
  const light = document.body.classList.contains("light");
  return ({Diogo:light?"#009688":"#00ffe5",Bruno:light?"#5c35cc":"#9d7fff",Larissa:light?"#cc0055":"#ff1f7a"})[name]||"#fff";
}
function themeHbg(name) {
  const light = document.body.classList.contains("light");
  return ({Diogo:light?"#d4f0ed":"#0a2820",Bruno:light?"#e0d9f8":"#12103a",Larissa:light?"#f8d9e8":"#280818"})[name]||"#111";
}
function themePrio(p) {
  const light = document.body.classList.contains("light");
  return ({superurgente:light?"#e6003c":"#ff0033",urgente:light?"#cc0000":"#ff0000",importante:light?"#cc8800":"#ffe600",normal:light?"#007744":"#00ff77"})[p]||"#aaa";
}

window.toggleTheme = function() {
  const isLight = document.body.classList.toggle("light");
  localStorage.setItem(THEME_KEY, isLight?"light":"dark");
  const thumb=document.getElementById("toggle-thumb"), icon=document.getElementById("toggle-icon");
  thumb.style.transform=isLight?"translateX(22px)":"translateX(0)";
  thumb.style.background=isLight?"#fff":"#777";
  icon.textContent=isLight?"☀️":"🌙";
  render();
};
if (localStorage.getItem(THEME_KEY)==="light") {
  document.body.classList.add("light");
  const thumb=document.getElementById("toggle-thumb"),icon=document.getElementById("toggle-icon");
  if(thumb){thumb.style.transform="translateX(22px)";thumb.style.background="#fff";}
  if(icon){icon.innerHTML='<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';icon.style.color='#cc8800';}
}

let currentUser = localStorage.getItem(STORAGE_KEY)||null;

function setupIdentityScreen() {
  const screen=document.getElementById("identity-screen");
  screen.innerHTML="";
  if(currentUser){screen.style.display="none";requestNotif();return;}
  screen.style.display="flex";
  const title=document.createElement("div");title.className="id-title";title.textContent="DIGOO BRASIL";screen.appendChild(title);
  const sub=document.createElement("div");sub.className="id-sub";sub.textContent="QUEM É VOCÊ?";screen.appendChild(sub);
  MEMBERS.forEach(m=>{
    const btn=document.createElement("button");btn.className="id-btn";
    btn.style.cssText=`border-color:${themeColor(m.name)}66;color:${themeColor(m.name)};`;
    const av=document.createElement("div");av.className="id-avatar";
    av.style.cssText=`background:${themeColor(m.name)}22;border:1.5px solid ${themeColor(m.name)};color:${themeColor(m.name)};`;
    av.textContent=m.initials;btn.appendChild(av);btn.appendChild(document.createTextNode(m.name));
    btn.addEventListener("click",()=>{currentUser=m.name;localStorage.setItem(STORAGE_KEY,m.name);screen.style.display="none";requestNotif();render();});
    screen.appendChild(btn);
  });
}
function requestNotif(){if("Notification"in window&&Notification.permission==="default")Notification.requestPermission();}

let state={tasks:{},messages:{},flashes:{}};
let prevTasks={},flashQueue={},completionAlerts={},openCard=null,diogoPinUnlocked=false,tabFlashInterval=null,faviconInterval=null;
const syncDot=document.getElementById("sync-dot");
function setSyncing(v){syncDot.style.opacity=v?"0.4":"1";}

onValue(ref(db,"/"),snap=>{
  const d=snap.val()||{};
  d.tasks=d.tasks||{};d.messages=d.messages||{};d.flashes=d.flashes||{};d.notices=d.notices||{};d.ml_token=d.ml_token||null;d.ml_cache=d.ml_cache||null;
  const seenTasks=JSON.parse(localStorage.getItem("digoo_seen_tasks")||"{}");
  let seenChanged=false;
  Object.entries(d.tasks).filter(([,t])=>t!=null).forEach(([id,task])=>{
    if(!seenTasks[id]&&task.member===currentUser&&currentUser!=="Diogo"&&Object.keys(prevTasks).length>0)
      sendNotif("Digoo · Nova Tarefa",`Nova tarefa de ${task.delegatedBy||"Diogo"}: ${task.text}`,themeColor(currentUser));
    seenTasks[id]=true;seenChanged=true;
  });
  if(seenChanged)localStorage.setItem("digoo_seen_tasks",JSON.stringify(seenTasks));
  const seenNotices=JSON.parse(localStorage.getItem("digoo_seen_notices")||"{}");
  let noticesChanged=false;
  Object.entries(d.notices||{}).filter(([,n])=>n!=null).forEach(([id,notice])=>{
    if(!seenNotices[id]&&notice.forMember===currentUser&&Object.keys(window._prevNotices||{}).length>0)
      sendNotif("Digoo · Tarefa Concluída",`${notice.by} concluiu: ${notice.text}`,"#00ff88");
    seenNotices[id]=true;noticesChanged=true;
  });
  if(noticesChanged)localStorage.setItem("digoo_seen_notices",JSON.stringify(seenNotices));
  window._prevNotices={...(d.notices||{})};
  const seenMsgs=JSON.parse(localStorage.getItem("digoo_seen_msgs")||"{}");
  let seenMsgsChanged=false;
  Object.entries(d.messages||{}).filter(([,m])=>m!=null).forEach(([id,msg])=>{
    if(!seenMsgs[id]&&msg.recipient===currentUser&&Object.keys(window._prevMsgs||{}).length>0)
      sendNotif("Digoo · Nova Mensagem",`${msg.from}: ${msg.text}`,themeColor(msg.from));
    seenMsgs[id]=true;seenMsgsChanged=true;
  });
  if(seenMsgsChanged)localStorage.setItem("digoo_seen_msgs",JSON.stringify(seenMsgs));
  window._prevMsgs={...(d.messages||{})};
  Object.entries(d.tasks).filter(([,t])=>t!=null).forEach(([id,task])=>{
    const prev=prevTasks[id];
    if(prev&&!prev.done&&task.done&&task.member!=="Diogo"){
      completionAlerts[id]={member:task.member,text:task.text};
      set(ref(db,`/flashes/Diogo`),{ts:Date.now(),msg:`${task.member} concluiu uma tarefa!`});
      if(currentUser==="Diogo")sendNotif("Digoo · Tarefa Concluída",`${task.member} concluiu: ${task.text}`,themeColor("Diogo"));
    }
  });
  Object.entries(d.flashes).forEach(([member,val])=>{
    if(val!=null){
      const wasFlashing=flashQueue[member];flashQueue[member]=true;
      if(!wasFlashing&&val.msg){startTabFlash(val.msg,themeColor(member));if(currentUser===member)sendNotif("Digoo · Nova Tarefa",val.msg,themeColor(member));}
    }
  });
  Object.keys(flashQueue).forEach(m=>{if(!d.flashes[m])delete flashQueue[m];});
  prevTasks={...d.tasks};state=d;render();
},()=>{syncDot.style.background="#f87171";});

function addTask(member,text,prio,sender){
  setSyncing(true);push(ref(db,"/tasks"),{member,text,prio,done:false,delegatedBy:sender||null});
  if(member!=="Diogo"){const from=sender||"Diogo";set(ref(db,`/flashes/${member}`),{ts:Date.now(),msg:`Nova tarefa de ${from}!`});startTabFlash(`Tarefa delegada para ${member}!`,themeColor(member));}
  else if(member==="Diogo"&&sender)set(ref(db,`/flashes/Diogo`),{ts:Date.now(),msg:`Nova tarefa de ${sender}!`});
}
function toggleTask(id,done,progress,isRecorrente){
  setSyncing(true);
  if(done){
    // concluído -> pendente (só via botão reabrir para recorrentes)
    if(!isRecorrente){
      update(ref(db,`/tasks/${id}`),{done:false,progress:false});
    }
    return;
  } else if(progress){
    // progresso -> concluído
    update(ref(db,`/tasks/${id}`),{done:true,progress:false});
  } else {
    // pendente -> em progresso
    update(ref(db,`/tasks/${id}`),{done:false,progress:true});
    return;
  }
  if(!done){
    const task=state.tasks&&state.tasks[id];
    if(task&&task.delegatedBy&&task.delegatedBy!=="Diogo"&&task.delegatedBy!==task.member){
      push(ref(db,"/notices"),{forMember:task.delegatedBy,text:task.text,by:task.member,ts:new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}),ts_raw:Date.now()});
      set(ref(db,`/flashes/${task.delegatedBy}`),{ts:Date.now(),msg:`${task.member} concluiu sua tarefa!`});
    }
    setTimeout(()=>{Object.entries(state.messages||{}).forEach(([msgId,msg])=>{if(msg!=null&&msg.taskId===id)update(ref(db,`/messages/${msgId}`),{closed:true});});},30000);
  }
}
function deleteTask(id){setSyncing(true);remove(ref(db,`/tasks/${id}`));}
function clearDone(member){Object.entries(state.tasks).forEach(([id,t])=>{if(t&&t.member===member&&t.done)remove(ref(db,`/tasks/${id}`));});}
function sendMessage(from,text,taskId,taskText,recipient,delegatedBy){
  setSyncing(true);const rcpt=recipient||"Diogo";
  push(ref(db,"/messages"),{from,text,taskId,taskText,recipient:rcpt,delegatedBy:delegatedBy||null,read:false,ts:new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}),ts_raw:Date.now()});
  set(ref(db,`/flashes/${rcpt}`),{ts:Date.now(),msg:`Mensagem de ${from}!`});
}
function deleteMsg(id){setSyncing(true);remove(ref(db,`/messages/${id}`));}
function tasksFor(name){return Object.entries(state.tasks).filter(([,t])=>t!=null&&t.member===name).map(([id,t])=>({...t,id})).sort((a,b)=>({superurgente:0,urgente:1,importante:2,normal:3}[a.prio]-{superurgente:0,urgente:1,importante:2,normal:3}[b.prio]));}
function msgsFor(name){return Object.entries(state.messages).filter(([,m])=>m!=null&&m.from===name).map(([id,m])=>({...m,id})).sort((a,b)=>b.ts_raw-a.ts_raw);}

function makeIcon(color,size){const c=document.createElement("canvas");c.width=c.height=size;const ctx=c.getContext("2d");const r=size/2;ctx.shadowColor=color;ctx.shadowBlur=size*0.25;ctx.beginPath();ctx.arc(r,r,r*0.75,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();return c.toDataURL();}
function sendNotif(title,body,color){if(!("Notification"in window)||Notification.permission!=="granted")return;const n=new Notification(title,{body,icon:makeIcon(color,64),tag:"digoo-task",requireInteraction:true});n.onclick=()=>{window.focus();n.close();};}
function setFavicon(color){const c=document.createElement("canvas");c.width=c.height=32;const ctx=c.getContext("2d");ctx.shadowColor=color;ctx.shadowBlur=10;ctx.beginPath();ctx.arc(16,16,12,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.shadowBlur=0;ctx.beginPath();ctx.arc(16,16,6,0,Math.PI*2);ctx.fillStyle="#fff";ctx.globalAlpha=0.5;ctx.fill();ctx.globalAlpha=1;let l=document.querySelector("link[rel*='icon']");if(!l){l=document.createElement("link");l.rel="icon";document.head.appendChild(l);}l.href=c.toDataURL();}
function resetFavicon(){const c=document.createElement("canvas");c.width=c.height=32;const ctx=c.getContext("2d");ctx.beginPath();ctx.arc(16,16,12,0,Math.PI*2);ctx.fillStyle="#333";ctx.fill();let l=document.querySelector("link[rel*='icon']");if(!l){l=document.createElement("link");l.rel="icon";document.head.appendChild(l);}l.href=c.toDataURL();}
function startFaviconCycle(colors){if(faviconInterval)clearInterval(faviconInterval);let idx=0,on=true;setFavicon(colors[0]);faviconInterval=setInterval(()=>{if(on)resetFavicon();else{idx=(idx+1)%colors.length;setFavicon(colors[idx]);}on=!on;},600);}
function stopFaviconFlash(){if(faviconInterval){clearInterval(faviconInterval);faviconInterval=null;}resetFavicon();}
function startTabFlash(msg,color){let alt=false,flashes=0;if(tabFlashInterval)clearInterval(tabFlashInterval);tabFlashInterval=setInterval(()=>{document.title=alt?origTitle:msg;alt=!alt;flashes++;if(flashes>=10){clearInterval(tabFlashInterval);tabFlashInterval=null;document.title=origTitle;}},800);if(color)startFaviconCycle([color]);}

// ---- ML ----
let mlSubTab="canceladas";
let mlCanceladas=null,mlDevolucoes=null,mlReclamacoes=null,mlLoadingTab=null;
let finData=null,finLoading=false,finMonth=new Date().toISOString().slice(0,7);
let diogomltab="devolucoes", diogoDevolucoes=null, diogoDevolLoading=false;
let diogoCustoData=null; // dados processados do Excel
let estoqueExcelData=null;
let estoqueExpanded=false;
let estoqueFullscreen=false;
let estoqueBlingData=null;
let estoqueBlingLoading=false;
let estoqueBlingErro=null;
let estoqueLoc="filial"; // "filial" ou "matriz"
let matrizRows=[]; // dados do relatório Bling Matriz RS
let matrizFileName="";
const BLING_PROXY="https://digoo-backend.vercel.app";
let digoMLOpen=false;
let digoMLMax=false; // modo fullscreen
let vendasData=null, vendasLoading=false, vendasDays=7;
let recorrentesChecked = false; // flag pra não criar duplicado na sessão
// Chat por membro: { messages: [], open: false, loading: false }
let chatState = { Diogo:{messages:[],open:false,loading:false}, Bruno:{messages:[],open:false,loading:false}, Larissa:{messages:[],open:false,loading:false} };

async function fetchMLData(tab){
  mlLoadingTab=tab;render();
  try{
    const token=state.ml_token?.access_token;
    if(!token){
      if(tab==="canceladas")mlCanceladas={error:"token ausente"};
      else if(tab==="devolucoes")mlDevolucoes={error:"token ausente"};
      else if(tab==="reclamacoes")mlReclamacoes={error:"token ausente"};
      mlLoadingTab=null;render();return;
    }
    const r=await fetch(`${VERCEL_BACKEND}/api/ml-${tab}?token=${token}`);
    const data=await r.json();
    if(tab==="canceladas")mlCanceladas=data;
    else if(tab==="devolucoes")mlDevolucoes=data;
    else if(tab==="reclamacoes")mlReclamacoes=data;
  }catch(e){
    if(tab==="canceladas")mlCanceladas={error:e.message};
    else if(tab==="devolucoes")mlDevolucoes={error:e.message};
    else if(tab==="reclamacoes")mlReclamacoes={error:e.message};
  }
  mlLoadingTab=null;render();
}

// Cores e labels para status de devolução
function returnStatusStyle(key){
  const map={
    transit:  {bg:"#a78bfa22",color:"#a78bfa",border:"#a78bfa44"},
    delivered:{bg:"#4ade8022",color:"#4ade80",border:"#4ade8044"},
    review:   {bg:"#fbbf2422",color:"#fbbf24",border:"#fbbf2444"},
    waiting:  {bg:"#fbbf2422",color:"#fbbf24",border:"#fbbf2444"},
    dispute:  {bg:"#f8717122",color:"#f87171",border:"#f8717144"},
    lost:     {bg:"#f8717122",color:"#f87171",border:"#f8717144"},
    cancelled:{bg:"#88888822",color:"#888",border:"#88888844"},
    default:  {bg:"#88888822",color:"#888",border:"#88888844"},
  };
  return map[key||"default"]||map.default;
}

window.toggleMLMax = function() {
  digoMLMax = !digoMLMax;
  const fs = document.getElementById("ml-fullscreen");
  if(digoMLMax) {
    fs.classList.add("open");
    renderMLFullscreen();
  } else {
    fs.classList.remove("open");
  }
};

function renderMLFullscreen() {
  // Sub-abas no header
  const fsSubtabs = document.getElementById("ml-fs-subtabs");
  if(fsSubtabs) {
    fsSubtabs.innerHTML = "";
    ["devolucoes","custos"].forEach(tab => {
      const btn = document.createElement("button");
      btn.style.cssText = `padding:6px 14px;background:none;border:none;font-family:inherit;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;color:${diogomltab===tab?"#fff155":"var(--text3)"};border-bottom:2px solid ${diogomltab===tab?"#fff155":"transparent"};transition:all 0.15s;`;
      btn.textContent = tab==="devolucoes"?"Devoluções":"Custo de Devoluções";
      btn.addEventListener("click",()=>{ diogomltab=tab; renderMLFullscreen(); });
      fsSubtabs.appendChild(btn);
    });
  }
  const body = document.getElementById("ml-fullscreen-body");
  if(!body) return;
  body.innerHTML = "";
  if(diogomltab==="devolucoes") renderDiogoDevTab(body,"#fff155");
  else renderDiogoCustoTab(body,"#fff155");
}

window.fecharML = function() {
  digoMLOpen = false;
  document.getElementById("ml-modal").classList.remove("open");
};

window.abrirML = function() {
  digoMLOpen = true;
  if(!diogoDevolucoes && !diogoDevolLoading) fetchDiogoDevolucoes();
  renderMLModal();
  document.getElementById("ml-modal").classList.add("open");
};

function renderMLModal() {
  const body = document.getElementById("ml-modal-body");
  if(!body) return;
  body.innerHTML = "";

  // Sub-abas
  const subTabs = document.createElement("div");
  subTabs.className = "ml-modal-subtabs";
  ["devolucoes","custos"].forEach(tab => {
    const btn = document.createElement("button");
    btn.className = "ml-modal-tab" + (diogomltab===tab?" active":"");
    btn.textContent = tab==="devolucoes"?"Devoluções":"Custo de Devoluções";
    btn.addEventListener("click", () => { diogomltab=tab; renderMLModal(); });
    subTabs.appendChild(btn);
  });
  body.appendChild(subTabs);

  if(diogomltab==="devolucoes") renderDiogoDevTab(body, "#fff155");
  else renderDiogoCustoTab(body, "#fff155");
}

async function fetchDiogoDevolucoes(){
  diogoDevolLoading=true; render();
  try {
    const token = state.ml_token?.access_token;
    if(!token){ diogoDevolucoes={error:"token ausente"}; diogoDevolLoading=false; render(); return; }
    const r = await fetch(`${VERCEL_BACKEND}/api/ml-financeiro?token=${token}&month=${finMonth}`);
    diogoDevolucoes = await r.json();
  } catch(e){ diogoDevolucoes={error:e.message}; }
  diogoDevolLoading=false; render();
}

async function fetchFinanceiro(month){
  finLoading=true;render();
  try{
    const token=state.ml_token?.access_token;
    if(!token){finData={error:"token ausente"};finLoading=false;render();return;}
    const r=await fetch(`${VERCEL_BACKEND}/api/ml-financeiro?token=${token}&month=${month}`);
    finData=await r.json();
  }catch(e){finData={error:e.message};}
  finLoading=false;render();
}

function renderDiogoML(container, color) {
  // Botão discreto com logo ML
  const mlBtn = document.createElement("button");
  mlBtn.style.cssText = `display:flex;align-items:center;gap:6px;background:none;border:1px solid #fff15533;border-radius:5px;padding:5px 12px;cursor:pointer;font-family:inherit;font-size:10px;color:#fff155;letter-spacing:1px;margin-top:12px;transition:all 0.15s;`;
  mlBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="4" fill="#fff155" opacity="0.15"/><text x="16" y="22" text-anchor="middle" font-size="14" font-weight="700" fill="#fff155">ML</text></svg> MERCADO LIVRE`;
  mlBtn.addEventListener("mouseenter", () => { mlBtn.style.background="#fff15511"; });
  mlBtn.addEventListener("mouseleave", () => { mlBtn.style.background="none"; });
  mlBtn.addEventListener("click", () => {
    digoMLOpen = !digoMLOpen;
    if(digoMLOpen && !diogoDevolucoes && !diogoDevolLoading) fetchDiogoDevolucoes();
    render();
  });
  container.appendChild(mlBtn);

  if(!digoMLOpen) return;

  // Painel ML
  const mlPanel = document.createElement("div");
  mlPanel.style.cssText = "background:var(--bg3);border:1px solid #fff15533;border-radius:6px;padding:14px;margin-top:8px;";

  // Sub-abas
  const subTabs = document.createElement("div");
  subTabs.style.cssText = "display:flex;gap:0;border-bottom:1px solid var(--sep);margin-bottom:14px;";
  ["devolucoes","custos"].forEach(tab => {
    const btn = document.createElement("button");
    btn.style.cssText = `padding:6px 14px;background:none;border:none;font-family:inherit;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;color:${diogomltab===tab?"#fff155":"var(--text3)"};border-bottom:2px solid ${diogomltab===tab?"#fff155":"transparent"};margin-bottom:-1px;transition:all 0.15s;`;
    btn.textContent = tab === "devolucoes" ? "Devoluções" : "Custo de Devoluções";
    btn.addEventListener("click", () => { diogomltab = tab; render(); });
    subTabs.appendChild(btn);
  });
  mlPanel.appendChild(subTabs);

  if(diogomltab === "devolucoes") {
    renderDiogoDevTab(mlPanel, color);
  } else {
    renderDiogoCustoTab(mlPanel, color);
  }

  container.appendChild(mlPanel);
}

async function checkAndCreateRecorrentes() {
  if(recorrentesChecked) return;
  recorrentesChecked = true;

  try {
    const hoje = new Date().toISOString().slice(0,10); // "2026-06-16"
    const logKey = `recorrentes_log/${hoje.replace(/-/g,"_")}`;

    // Verifica se já criou hoje
    const logSnap = await new Promise(resolve => {
      const ref2 = ref(db, logKey);
      onValue(ref2, snap => resolve(snap.val()), { onlyOnce: true });
    });
    if(logSnap) return; // já criou hoje

    // Busca recorrentes configuradas
    const recSnap = await new Promise(resolve => {
      const ref2 = ref(db, "/recorrentes");
      onValue(ref2, snap => resolve(snap.val()), { onlyOnce: true });
    });
    if(!recSnap) return;

    const hoje2 = new Date();
    const diaSemana = hoje2.getDay(); // 0=dom, 1=seg...
    const diaMes = hoje2.getDate();

    const recorrentes = Object.values(recSnap).filter(r => {
      if(!r || !r.active) return false;
      if(r.frequency === "daily") return true;
      if(r.frequency === "weekly") return r.dayOfWeek === diaSemana;
      if(r.frequency === "monthly") return r.dayOfMonth === diaMes;
      return false;
    });

    // Verifica tarefas recorrentes já existentes hoje (evita duplicata)
    const tasksSnap = await new Promise(resolve => {
      onValue(ref(db, "/tasks"), snap => resolve(snap.val()), { onlyOnce: true });
    });
    const existingTexts = Object.values(tasksSnap || {})
      .filter(t => t && t.isRecorrente)
      .map(t => t.text?.toLowerCase());

    // Cria as tarefas do dia
    for(const rec of recorrentes) {
      // Pula se já existe
      if(existingTexts.includes(rec.text?.toLowerCase())) continue;
      await push(ref(db, "/tasks"), {
        member: rec.member || "Diogo",
        text: rec.text,
        prio: rec.prio || "importante",
        done: false,
        progress: false,
        delegatedBy: null,
        isRecorrente: true,
        recorrenteId: rec.id || null,
        frequency: rec.frequency,
      });
    }

    // Registra log do dia ANTES de criar (evita race condition)
    await set(ref(db, logKey), { createdAt: new Date().toISOString(), count: recorrentes.length });
    console.log(`Recorrentes criadas: ${recorrentes.length}`);
  } catch(e) {
    console.error("Erro ao criar recorrentes:", e.message);
  }
}

async function fetchVendas(days) {
  vendasLoading=true; render();
  try {
    const token=state.ml_token?.access_token;
    if(!token){vendasData={error:"token ausente"};vendasLoading=false;render();return;}
    const r=await fetch(`${VERCEL_BACKEND}/api/ml-vendas?token=${token}&days=${days}`);
    vendasData=await r.json();
  }catch(e){vendasData={error:e.message};}
  vendasLoading=false; render();
}

function renderVendasTab(panel, color) {
  if(!vendasData&&!vendasLoading&&state.ml_token?.access_token) fetchVendas(vendasDays);

  // Filtro de período
  const header=document.createElement("div");
  header.style.cssText="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;";
  const filterWrap=document.createElement("div");
  filterWrap.style.cssText="display:flex;gap:6px;";
  [7,14,30].forEach(d=>{
    const btn=document.createElement("button");
    btn.textContent=d===7?"7 dias":d===14?"14 dias":"30 dias";
    btn.style.cssText=`padding:4px 12px;background:${vendasDays===d?"#fff15522":"none"};border:1px solid ${vendasDays===d?"#fff155":"var(--border2)"};color:${vendasDays===d?"#fff155":"var(--text3)"};border-radius:4px;font-size:10px;cursor:pointer;font-family:inherit;letter-spacing:1px;`;
    btn.addEventListener("click",()=>{vendasDays=d;vendasData=null;fetchVendas(d);});
    filterWrap.appendChild(btn);
  });
  const refBtn=document.createElement("button");
  refBtn.style.cssText="background:none;border:1px solid var(--border2);color:var(--text3);border-radius:4px;padding:4px 10px;font-size:10px;cursor:pointer;font-family:inherit;";
  refBtn.textContent="↻";
  refBtn.addEventListener("click",()=>{vendasData=null;fetchVendas(vendasDays);});
  header.appendChild(filterWrap);header.appendChild(refBtn);
  panel.appendChild(header);

  if(vendasLoading){
    const l=document.createElement("div");l.style.cssText="text-align:center;padding:40px;color:var(--text3);font-size:12px;";
    l.innerHTML='<span class="spinning">↻</span> Carregando...';panel.appendChild(l);return;
  }
  if(!vendasData||vendasData.error){
    const err=document.createElement("p");err.style.cssText="color:#f87171;font-size:12px;padding:14px 0;";
    err.textContent=vendasData?.error||"Erro ao carregar";panel.appendChild(err);return;
  }

  // Cards de resumo
  const summaryGrid=document.createElement("div");
  summaryGrid.style.cssText="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px;";
  [
    {label:"FATURAMENTO",value:`R$ ${vendasData.summary.totalRevenue.toLocaleString("pt-BR",{minimumFractionDigits:2})}`,color:"#4ade80"},
    {label:"VENDAS",value:vendasData.summary.totalOrders,color:"#38bdf8"},
    {label:"TICKET MÉDIO",value:`R$ ${vendasData.summary.avgTicket.toLocaleString("pt-BR",{minimumFractionDigits:2})}`,color:"#a78bfa"},
  ].forEach(s=>{
    const card=document.createElement("div");
    card.style.cssText=`background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;border-top:2px solid ${s.color};`;
    card.innerHTML=`<div style="font-size:8px;color:var(--text3);letter-spacing:2px;margin-bottom:6px;">${s.label}</div><div style="font-size:18px;font-family:'Bebas Neue',sans-serif;letter-spacing:2px;color:${s.color};">${s.value}</div>`;
    summaryGrid.appendChild(card);
  });
  panel.appendChild(summaryGrid);

  // Gráfico de barras
  if(vendasData.dailyEvolution?.length){
    const chartWrap=document.createElement("div");
    chartWrap.style.cssText="margin-bottom:20px;";
    const chartTitle=document.createElement("div");
    chartTitle.style.cssText="font-size:9px;color:var(--text3);letter-spacing:2px;margin-bottom:10px;";
    chartTitle.textContent="FATURAMENTO POR DIA";
    chartWrap.appendChild(chartTitle);

    const maxRev=Math.max(...vendasData.dailyEvolution.map(d=>d.revenue),1);
    const chartArea=document.createElement("div");
    chartArea.style.cssText="display:flex;align-items:flex-end;gap:4px;height:120px;padding-bottom:20px;position:relative;";

    vendasData.dailyEvolution.forEach(day=>{
      const barWrap=document.createElement("div");
      barWrap.style.cssText="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;position:relative;";
      const pct=day.revenue/maxRev;
      const bar=document.createElement("div");
      bar.style.cssText=`width:100%;background:linear-gradient(to top,#fff15544,#fff15522);border:1px solid #fff15566;border-radius:3px 3px 0 0;height:${Math.max(pct*100,2)}%;transition:height 0.3s;cursor:default;position:relative;`;
      bar.title=`${day.label}: R$ ${day.revenue.toLocaleString("pt-BR",{minimumFractionDigits:2})}`;
      // Tooltip on hover
      bar.addEventListener("mouseenter",()=>{
        bar.style.background="linear-gradient(to top,#fff15588,#fff15544)";
        const tip=document.createElement("div");
        tip.id="chart-tip";
        tip.style.cssText="position:absolute;bottom:105%;left:50%;transform:translateX(-50%);background:#0a0a0a;border:1px solid #fff15544;border-radius:4px;padding:4px 8px;font-size:9px;color:#fff155;white-space:nowrap;z-index:100;";
        tip.textContent=`R$ ${day.revenue.toLocaleString("pt-BR",{minimumFractionDigits:2})}`;
        bar.appendChild(tip);
      });
      bar.addEventListener("mouseleave",()=>{
        bar.style.background="linear-gradient(to top,#fff15544,#fff15522)";
        const tip=bar.querySelector("#chart-tip");if(tip)tip.remove();
      });
      const label=document.createElement("div");
      label.style.cssText="position:absolute;bottom:-18px;font-size:8px;color:var(--text3);white-space:nowrap;";
      label.textContent=day.label;
      barWrap.appendChild(bar);barWrap.appendChild(label);
      chartArea.appendChild(barWrap);
    });
    chartWrap.appendChild(chartArea);
    panel.appendChild(chartWrap);
  }

  // Top Sellers
  if(vendasData.topSellers?.length){
    const sec=document.createElement("div");sec.style.cssText="margin-bottom:20px;";
    const t=document.createElement("div");t.style.cssText="font-size:9px;color:var(--text3);letter-spacing:2px;margin-bottom:10px;";t.textContent="🏆 CAMPEÕES DE VENDAS";
    sec.appendChild(t);
    vendasData.topSellers.slice(0,5).forEach((p,i)=>{
      const row=document.createElement("div");
      row.style.cssText="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg2);border-radius:5px;margin-bottom:5px;border-left:2px solid #4ade80;";
      row.innerHTML=`
        <span style="font-size:11px;color:#4ade8066;width:16px;text-align:center;">${i+1}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.title}</div>
          <div style="font-size:9px;color:var(--text3);margin-top:2px;">${p.sku!=="—"?p.sku:""}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:12px;color:#4ade80;font-weight:500;">${p.qty} un.</div>
          <div style="font-size:9px;color:var(--text3);">R$ ${p.revenue.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
        </div>`;
      sec.appendChild(row);
    });
    panel.appendChild(sec);
  }

  // Produtos parados
  if(vendasData.stoppedItems?.length){
    const sec=document.createElement("div");sec.style.cssText="margin-bottom:20px;";
    const t=document.createElement("div");t.style.cssText="font-size:9px;color:var(--text3);letter-spacing:2px;margin-bottom:10px;";t.textContent="⚠ ANÚNCIOS SEM VENDA NO PERÍODO";
    sec.appendChild(t);
    vendasData.stoppedItems.slice(0,5).forEach(p=>{
      const row=document.createElement("div");
      row.style.cssText="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg2);border-radius:5px;margin-bottom:5px;border-left:2px solid #f87171;";
      row.innerHTML=`
        <div style="flex:1;min-width:0;">
          <div style="font-size:11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.title}</div>
          <div style="font-size:9px;color:var(--text3);margin-top:2px;">Estoque: ${p.available_quantity} · Total vendido: ${p.sold_quantity}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:12px;color:#f87171;">R$ ${p.price?.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
        </div>`;
      sec.appendChild(row);
    });
    panel.appendChild(sec);
  }

  // Botão analisar com Claude
  if(vendasData.summary){
    const claudeBtn=document.createElement("button");
    claudeBtn.style.cssText="width:100%;padding:10px;background:#da775611;border:1px solid #da7756;border-radius:6px;color:#da7756;font-family:inherit;font-size:10px;letter-spacing:2px;cursor:pointer;margin-top:8px;transition:all 0.15s;";
    claudeBtn.textContent="✦ ANALISAR COM CLAUDE";
    claudeBtn.addEventListener("click",()=>{
      const resumo=`Analise os dados de vendas dos últimos ${vendasDays} dias:
- Faturamento: R$ ${vendasData.summary.totalRevenue.toLocaleString("pt-BR",{minimumFractionDigits:2})}
- Pedidos: ${vendasData.summary.totalOrders}
- Ticket médio: R$ ${vendasData.summary.avgTicket.toLocaleString("pt-BR",{minimumFractionDigits:2})}
- Top produto: ${vendasData.topSellers?.[0]?.title} (${vendasData.topSellers?.[0]?.qty} un.)
- Anúncios parados: ${vendasData.stoppedItems?.length}
Dê insights e recomendações.`;
      chatState["Diogo"].messages.push({role:"user",content:resumo});
      chatState["Diogo"].open=true;
      renderChatModal("Diogo","#00ffe5");
      // Dispara a resposta do Claude
      setTimeout(async()=>{
        chatState["Diogo"].loading=true;renderChatModal("Diogo","#00ffe5");
        try{
          const r=await fetch(`${VERCEL_BACKEND}/api/claude-chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({member:"Diogo",message:resumo,history:[],context:buildContext("Diogo")})});
          const data=await r.json();
          chatState["Diogo"].messages.push({role:"assistant",content:data.reply||data.error});
        }catch(e){chatState["Diogo"].messages.push({role:"assistant",content:"Erro de conexão."});}
        chatState["Diogo"].loading=false;renderChatModal("Diogo","#00ffe5");
      },100);
    });
    panel.appendChild(claudeBtn);
  }
}

function renderDiogoDevTab(panel, color) {
  // Seletor de mês
  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;";
  const monthWrap = document.createElement("div");
  monthWrap.style.cssText = "display:flex;align-items:center;gap:8px;";
  const prevBtn = document.createElement("button");
  prevBtn.textContent = "‹";
  prevBtn.style.cssText = "background:none;border:1px solid var(--border2);color:var(--text2);border-radius:4px;padding:2px 8px;cursor:pointer;font-size:16px;";
  const monthLabel = document.createElement("span");
  monthLabel.style.cssText = "font-size:11px;color:var(--text);letter-spacing:2px;";
  const [y,m] = finMonth.split("-");
  const monthNames = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  monthLabel.textContent = `${monthNames[Number(m)-1]} ${y}`;
  const nextBtn = document.createElement("button");
  nextBtn.textContent = "›";
  nextBtn.style.cssText = "background:none;border:1px solid var(--border2);color:var(--text2);border-radius:4px;padding:2px 8px;cursor:pointer;font-size:16px;";
  prevBtn.addEventListener("click", () => {
    const d = new Date(`${finMonth}-01`); d.setMonth(d.getMonth()-1);
    finMonth = d.toISOString().slice(0,7); diogoDevolucoes=null; fetchDiogoDevolucoes();
  });
  nextBtn.addEventListener("click", () => {
    const d = new Date(`${finMonth}-01`); d.setMonth(d.getMonth()+1);
    finMonth = d.toISOString().slice(0,7); diogoDevolucoes=null; fetchDiogoDevolucoes();
  });
  const refBtn = document.createElement("button");
  refBtn.style.cssText = "background:none;border:1px solid var(--border2);color:var(--text3);border-radius:4px;padding:4px 10px;font-size:10px;cursor:pointer;font-family:inherit;letter-spacing:1px;";
  refBtn.textContent = "↻";
  refBtn.addEventListener("click", () => { diogoDevolucoes=null; fetchDiogoDevolucoes(); });
  monthWrap.appendChild(prevBtn); monthWrap.appendChild(monthLabel); monthWrap.appendChild(nextBtn);
  header.appendChild(monthWrap); header.appendChild(refBtn);
  panel.appendChild(header);

  if(diogoDevolLoading) {
    const l = document.createElement("div");
    l.style.cssText = "text-align:center;padding:30px;color:var(--text3);font-size:12px;";
    l.innerHTML = '<span class="spinning">↻</span> Carregando...';
    panel.appendChild(l); return;
  }
  if(!diogoDevolucoes || diogoDevolucoes.error) {
    const err = document.createElement("p");
    err.style.cssText = "color:#f87171;font-size:12px;padding:14px 0;";
    err.textContent = diogoDevolucoes?.error || "Erro ao carregar";
    panel.appendChild(err); return;
  }
  if(!diogoDevolucoes.data?.length) {
    const e = document.createElement("p");
    e.style.cssText = "color:#4ade80;text-align:center;padding:20px 0;font-size:12px;";
    e.textContent = "✓ Nenhuma devolução no período";
    panel.appendChild(e); return;
  }

  // Total
  const totalDiv = document.createElement("div");
  totalDiv.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg2);border-radius:5px;margin-bottom:12px;";
  totalDiv.innerHTML = `<span style="font-size:10px;color:var(--text3);letter-spacing:1px">${diogoDevolucoes.count} devoluções</span><span style="font-size:16px;font-family:'Bebas Neue',sans-serif;color:#f87171;letter-spacing:2px;">-R$ ${diogoDevolucoes.totalCost.toLocaleString("pt-BR",{minimumFractionDigits:2})}</span>`;
  panel.appendChild(totalDiv);

  // Lista
  const grid = document.createElement("div");
  grid.style.cssText = "display:flex;flex-direction:column;gap:6px;";
  diogoDevolucoes.data.forEach(dev => {
    const card = document.createElement("div");
    card.style.cssText = `display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--bg2);border-radius:4px;border-left:2px solid ${dev.refundedAmount>0?"#f87171":"#4ade80"};`;
    const date = dev.closedAt ? new Date(dev.closedAt).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}) : "—";
    card.innerHTML = `
      <div style="flex:1;min-width:0;">
        <div style="font-size:11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${dev.product}</div>
        <div style="font-size:9px;color:var(--text3);margin-top:2px;">${dev.buyer} · ${date}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-left:8px;flex-shrink:0;">
        <span style="font-size:11px;color:${dev.refundedAmount>0?'#f87171':'#4ade80'};">${dev.refundedAmount>0?'-R$ '+dev.refundedAmount.toFixed(2).replace('.',','):'R$ 0,00'}</span>
        <a href="${dev.permalink}" target="_blank" style="color:#fff155;font-size:10px;text-decoration:none;">→</a>
      </div>`;
    grid.appendChild(card);
  });
  panel.appendChild(grid);
}

function renderDiogoCustoTab(panel, color) {
  // Upload da planilha
  const uploadSection = document.createElement("div");
  uploadSection.style.cssText = "margin-bottom:14px;";

  const uploadLabel = document.createElement("p");
  uploadLabel.style.cssText = "font-size:10px;color:var(--text3);letter-spacing:1px;margin-bottom:8px;";
  uploadLabel.textContent = "Faça upload do Excel de vendas do ML (filtrado por Devoluções)";
  uploadSection.appendChild(uploadLabel);

  const uploadBtn = document.createElement("label");
  uploadBtn.style.cssText = "display:inline-block;padding:7px 14px;background:none;border:1px dashed #fff15566;border-radius:5px;color:#fff155;font-size:10px;letter-spacing:1.5px;cursor:pointer;font-family:inherit;transition:all 0.15s;";
  uploadBtn.textContent = diogoCustoData ? "↑ Trocar planilha" : "↑ Importar planilha";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".xlsx,.xls";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if(!file) return;
    processarPlanilhaML(file);
  });
  uploadBtn.appendChild(fileInput);
  uploadSection.appendChild(uploadBtn);

  if(diogoCustoData?.fileName) {
    const fname = document.createElement("span");
    fname.style.cssText = "font-size:9px;color:var(--text3);margin-left:10px;";
    fname.textContent = diogoCustoData.fileName;
    uploadSection.appendChild(fname);
  }
  panel.appendChild(uploadSection);

  if(!diogoCustoData) return;

  // Resultado
  const totalCard = document.createElement("div");
  totalCard.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:var(--bg2);border-radius:6px;margin-bottom:12px;";
  totalCard.innerHTML = `
    <div>
      <div style="font-size:9px;color:var(--text3);letter-spacing:2px;margin-bottom:4px">CUSTO REAL DE DEVOLUÇÕES</div>
      <div style="font-size:9px;color:var(--text3);">${diogoCustoData.negCount} devoluções com frete negativo</div>
    </div>
    <div style="font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:2px;color:#f87171;">
      R$ ${Math.abs(diogoCustoData.totalNeg).toLocaleString("pt-BR",{minimumFractionDigits:2})}
    </div>`;
  panel.appendChild(totalCard);

  // Lista das negativas
  if(diogoCustoData.negItems?.length) {
    const grid = document.createElement("div");
    grid.style.cssText = "display:flex;flex-direction:column;gap:5px;";
    diogoCustoData.negItems.forEach(item => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:var(--bg2);border-radius:4px;border-left:2px solid #f87171;";
      row.innerHTML = `
        <div style="flex:1;min-width:0;">
          <div style="font-size:11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.titulo}</div>
          <div style="font-size:9px;color:var(--text3);margin-top:2px;">${item.status} · ${item.data}</div>
        </div>
        <span style="font-size:12px;color:#f87171;margin-left:8px;flex-shrink:0;">R$ ${Math.abs(item.total).toLocaleString("pt-BR",{minimumFractionDigits:2})}</span>`;
      grid.appendChild(row);
    });
    panel.appendChild(grid);
  }
}

async function processarPlanilhaML(file) {
  // Usa SheetJS para ler o Excel no browser
  const arrayBuffer = await file.arrayBuffer();
  const XLSX = await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Encontra linha de header (tem "N.º de venda")
  let headerIdx = -1;
  for(let i=0; i<rows.length; i++) {
    if(rows[i].some(c => String(c||"").includes("N.º de venda"))) { headerIdx=i; break; }
  }
  if(headerIdx === -1) { alert("Formato de planilha não reconhecido"); return; }

  const headers = rows[headerIdx];
  const colTotal = headers.findIndex(h => String(h||"").includes("Total (BRL)"));
  const colStatus = headers.findIndex(h => String(h||"") === "Estado");
  const colTitulo = headers.findIndex(h => String(h||"").includes("Título do anúncio"));
  const colData = headers.findIndex(h => String(h||"").includes("Data da venda"));
  const colCancel = headers.findIndex(h => String(h||"").includes("Cancelamentos e reembolsos"));

  const dataRows = rows.slice(headerIdx+1).filter(r => r[colTotal] !== undefined && r[colTotal] !== "");
  const negItems = dataRows
    .filter(r => Number(r[colTotal]) < 0)
    .map(r => ({
      titulo: String(r[colTitulo]||"—").slice(0,50),
      status: String(r[colStatus]||"—"),
      data: r[colData] ? String(r[colData]).slice(0,10) : "—",
      total: Number(r[colTotal]),
      cancel: Number(r[colCancel]||0),
    }))
    .sort((a,b) => a.total - b.total);

  const totalNeg = negItems.reduce((s,i) => s + i.total, 0);

  diogoCustoData = {
    fileName: file.name,
    negCount: negItems.length,
    totalNeg: Math.round(totalNeg*100)/100,
    negItems,
  };
  render();
}

function renderFinanceiroTab(panel,color){
  // Header com mês e total
  if(!finData&&!finLoading&&state.ml_token?.access_token){
    fetchFinanceiro(finMonth);
  }

  // Seletor de mês
  const header=document.createElement("div");
  header.style.cssText="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;";

  const monthWrap=document.createElement("div");
  monthWrap.style.cssText="display:flex;align-items:center;gap:8px;";
  const prevBtn=document.createElement("button");
  prevBtn.textContent="‹";
  prevBtn.style.cssText=`background:none;border:1px solid var(--border2);color:var(--text2);border-radius:4px;padding:2px 8px;cursor:pointer;font-size:16px;`;
  const monthLabel=document.createElement("span");
  monthLabel.style.cssText="font-size:11px;color:var(--text);letter-spacing:2px;";
  const [y,m]=finMonth.split("-");
  const monthNames=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  monthLabel.textContent=`${monthNames[Number(m)-1]} ${y}`;
  const nextBtn=document.createElement("button");
  nextBtn.textContent="›";
  nextBtn.style.cssText=`background:none;border:1px solid var(--border2);color:var(--text2);border-radius:4px;padding:2px 8px;cursor:pointer;font-size:16px;`;

  prevBtn.addEventListener("click",()=>{
    const d=new Date(`${finMonth}-01`);d.setMonth(d.getMonth()-1);
    finMonth=d.toISOString().slice(0,7);finData=null;fetchFinanceiro(finMonth);
  });
  nextBtn.addEventListener("click",()=>{
    const d=new Date(`${finMonth}-01`);d.setMonth(d.getMonth()+1);
    finMonth=d.toISOString().slice(0,7);finData=null;fetchFinanceiro(finMonth);
  });

  monthWrap.appendChild(prevBtn);monthWrap.appendChild(monthLabel);monthWrap.appendChild(nextBtn);

  const refBtn=document.createElement("button");
  refBtn.style.cssText=`background:none;border:1px solid var(--border2);color:var(--text3);border-radius:4px;padding:4px 10px;font-size:10px;cursor:pointer;font-family:inherit;letter-spacing:1px;`;
  refBtn.textContent="↻ Atualizar";
  refBtn.addEventListener("click",()=>{finData=null;fetchFinanceiro(finMonth);});

  header.appendChild(monthWrap);header.appendChild(refBtn);
  panel.appendChild(header);

  if(finLoading){
    const loading=document.createElement("div");
    loading.style.cssText="text-align:center;padding:40px;color:var(--text3);font-size:12px;";
    loading.innerHTML='<span class="spinning">↻</span> Carregando...';
    panel.appendChild(loading);return;
  }

  if(!finData||finData.error){
    if(!state.ml_token?.access_token||finData?.error==="token ausente"){
      const msg=document.createElement("p");msg.style.cssText="font-size:11px;color:var(--text3);margin-bottom:12px;";msg.textContent="Conecte o Mercado Livre no card da Larissa.";panel.appendChild(msg);
    }else{
      const err=document.createElement("p");err.style.cssText="color:#f87171;font-size:12px;padding:20px 0;";err.textContent=finData?.error||"Erro ao carregar";panel.appendChild(err);
    }
    return;
  }

  // Card de total
  const totalCard=document.createElement("div");
  totalCard.style.cssText=`background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;`;
  const totalLabel=document.createElement("div");
  totalLabel.innerHTML=`<div style="font-size:9px;color:var(--text3);letter-spacing:2px;margin-bottom:4px">CUSTO DE DEVOLUÇÕES</div><div style="font-size:9px;color:var(--text3);letter-spacing:1px">${finData.count} devoluções concluídas</div>`;
  const totalValue=document.createElement("div");
  totalValue.style.cssText=`font-size:22px;font-family:'Bebas Neue',sans-serif;letter-spacing:2px;color:${finData.totalCost>0?"#f87171":"#4ade80"};`;
  totalValue.textContent=`-R$ ${finData.totalCost.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  totalCard.appendChild(totalLabel);totalCard.appendChild(totalValue);
  panel.appendChild(totalCard);

  if(!finData.data?.length){
    const empty=document.createElement("p");empty.style.cssText="color:#4ade80;text-align:center;padding:30px 0;font-size:13px;";empty.textContent="✓ Nenhuma devolução no período";panel.appendChild(empty);return;
  }

  // Lista de devoluções
  const grid=document.createElement("div");
  grid.style.cssText="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;";
  panel.appendChild(grid);

  finData.data.forEach(dev=>{
    const card=document.createElement("div");
    card.className="ml-card";
    const hasCost=dev.refundedAmount>0;
    card.style.borderLeftColor=hasCost?"#f87171":"#4ade80";
    card.style.borderLeftWidth="3px";

    const date=dev.closedAt?new Date(dev.closedAt).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}):"—";

    card.innerHTML=`
      <div style="flex:1">
        <div style="font-size:12px;color:var(--text);margin-bottom:4px;line-height:1.4">${dev.product}</div>
        <div style="font-size:10px;color:var(--text3);margin-bottom:6px">
          ${dev.buyer} · <span style="color:var(--text3)">${date}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span class="ml-badge" style="background:${hasCost?"#f8717122":"#4ade8022"};color:${hasCost?"#f87171":"#4ade80"};border:1px solid ${hasCost?"#f8717144":"#4ade8044"}">
            ${hasCost?`-R$ ${dev.refundedAmount.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"R$ 0,00"}
          </span>
          <a href="${dev.permalink}" target="_blank" class="ml-link" style="margin-top:0">Ver →</a>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

function renderMLInPanel(panel,color){
  const subTabs=document.createElement("div");subTabs.className="ml-subtabs";
  const tabs=[
    {id:"canceladas",label:"Canceladas",data:mlCanceladas},
    {id:"devolucoes",label:"Devoluções",data:mlDevolucoes},
    {id:"reclamacoes",label:"Reclamações",data:mlReclamacoes},
  ];
  const currentDataMap={canceladas:mlCanceladas,devolucoes:mlDevolucoes,reclamacoes:mlReclamacoes};
  if(!currentDataMap[mlSubTab]&&mlLoadingTab!==mlSubTab&&state.ml_token?.access_token){fetchMLData(mlSubTab);}
  tabs.forEach(t=>{
    const btn=document.createElement("button");btn.className="ml-subtab"+(mlSubTab===t.id?" active":"");
    let count=t.data?.data?.length;
    if(t.id==="devolucoes"&&t.data?.data){count=t.data.data.filter(d=>d.needsReview).length;}
    btn.innerHTML=t.label+(count>0?`<span class="badge">${count}</span>`:"");
    btn.addEventListener("click",()=>{mlSubTab=t.id;if(!t.data)fetchMLData(t.id);else render();});
    subTabs.appendChild(btn);
  });
  panel.appendChild(subTabs);

  const currentTab=tabs.find(t=>t.id===mlSubTab);
  const data=currentTab?.data;

  if(mlLoadingTab===mlSubTab){
    const loading=document.createElement("div");
    loading.style.cssText="text-align:center;padding:40px;color:var(--text3);font-size:12px;";
    loading.innerHTML='<span class="spinning">↻</span> Carregando...';
    panel.appendChild(loading);
    return;
  }

  if(!data){
    if(!state.ml_token?.access_token){
      const msg=document.createElement("p");msg.style.cssText="font-size:11px;color:var(--text3);margin-bottom:12px;line-height:1.6;";msg.textContent="Conecte sua conta do Mercado Livre para ver os dados.";panel.appendChild(msg);
      const btn=document.createElement("button");btn.className="ml-connect-btn";btn.textContent="Conectar Mercado Livre";btn.addEventListener("click",()=>{window.open(`${VERCEL_BACKEND}/api/ml-auth`,"_blank");});panel.appendChild(btn);
    }else{
      const loadBtn=document.createElement("button");loadBtn.className="ml-connect-btn";loadBtn.textContent=`↻ Carregar ${currentTab?.label}`;loadBtn.addEventListener("click",()=>fetchMLData(mlSubTab));panel.appendChild(loadBtn);
    }
    return;
  }

  if(data.error){
    if(data.error==="token ausente"||data.error.toLowerCase().includes("token")||data.error.toLowerCase().includes("not valid json")||data.error.toLowerCase().includes("unexpected")){
      const msg=document.createElement("p");msg.style.cssText="font-size:11px;color:var(--text3);margin-bottom:12px;line-height:1.6;";msg.textContent="Conecte sua conta do Mercado Livre para ver os dados.";panel.appendChild(msg);
      const btn=document.createElement("button");btn.className="ml-connect-btn";btn.textContent="Conectar Mercado Livre";btn.addEventListener("click",()=>{window.open(`${VERCEL_BACKEND}/api/ml-auth`,"_blank");});panel.appendChild(btn);
    }else{
      const err=document.createElement("p");err.style.cssText="color:#f87171;font-size:12px;padding:20px 0;";err.textContent=data.error;panel.appendChild(err);
    }
    return;
  }

  if(!data.data?.length){
    const empty=document.createElement("p");empty.style.cssText="color:#4ade80;text-align:center;padding:40px 0;font-size:13px;";empty.textContent="✓ Nenhum item encontrado";panel.appendChild(empty);
    return;
  }

  if(data.updated_at){
    const upd=document.createElement("div");upd.style.cssText="font-size:9px;color:var(--text3);margin-bottom:12px;";
    const displayCount = mlSubTab === "devolucoes" ? data.data.filter(d=>d.needsReview).length : data.data.length;
  upd.textContent=`${displayCount} itens · Atualizado: ${new Date(data.updated_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`;
    panel.appendChild(upd);
  }

  const cardsGrid=document.createElement("div");
  cardsGrid.style.cssText="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;";
  panel.appendChild(cardsGrid);

  // Para devoluções: filtra só pendentes de revisão, resto mostra tudo
  const displayData = mlSubTab === "devolucoes"
    ? data.data.filter(d => d.needsReview)
    : data.data;

  if(mlSubTab === "devolucoes" && displayData.length === 0){
    const empty=document.createElement("p");empty.style.cssText="color:#4ade80;text-align:center;padding:30px 0;font-size:13px;";empty.textContent="✓ Nenhuma devolução pendente de revisão";panel.appendChild(empty);
    const refBtn2=document.createElement("button");refBtn2.style.cssText="margin-top:8px;background:none;border:1px solid var(--border2);color:var(--text3);border-radius:4px;padding:6px 14px;font-size:10px;cursor:pointer;font-family:inherit;letter-spacing:1px;width:100%;";refBtn2.textContent="↻ Atualizar";refBtn2.addEventListener("click",()=>fetchMLData(mlSubTab));panel.appendChild(refBtn2);return;
  }

  displayData.forEach(dev=>{
    const stageColors={"waiting_seller":"#f87171","seller":"#f87171","buyer":"#fbbf24","dispute":"#ff2222","resolved":"#4ade80"};
    const stageLabels={"waiting_seller":"Aguarda você","seller":"Aguarda você","buyer":"Aguarda comprador","dispute":"Em disputa","resolved":"Resolvida"};
    const sc=stageColors[dev.stage]||"#888";
    const sl=stageLabels[dev.stage]||dev.stage||dev.status;

    const card=document.createElement("div");card.className="ml-card";

    // Cor da borda pelo status de revisão
    let borderColor = sc;
    if(dev.needsReview) borderColor = "#fbbf24";
    if(dev.returnStatusKey === "dispute") borderColor = "#f87171";
    card.style.borderLeftColor=borderColor;card.style.borderLeftWidth="3px";

    // Badge de status
    let statusBadgeHtml="";
    if(dev.returnStatusLabel&&dev.returnStatusKey!=="default"){
      const rs=returnStatusStyle(dev.returnStatusKey);
      statusBadgeHtml=`<span class="ml-badge" style="background:${rs.bg};color:${rs.color};border:1px solid ${rs.border}">${dev.returnStatusLabel}</span>`;
    }else{
      statusBadgeHtml=`<span class="ml-badge" style="background:${sc}22;color:${sc};border:1px solid ${sc}44">${sl}</span>`;
    }

    // Badge de prazo
    let dueBadgeHtml="";
    let cardUrgent=false;
    if(dev.dueDate){
      try{
        const d=new Date(dev.dueDate);const today=new Date();
        today.setHours(0,0,0,0);d.setHours(0,0,0,0);
        const diff=Math.ceil((d-today)/(1000*60*60*24));
        if(diff<=0){
          cardUrgent=true;
          dueBadgeHtml=`<span class="ml-badge" style="background:#a3e63515;color:#a3e635;border:1px solid #a3e63533">até hoje</span>`;
        } else {
          const label=`até ${d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})}`;
          dueBadgeHtml=`<span class="ml-badge" style="background:#38bdf815;color:#38bdf8;border:1px solid #38bdf833">${label}</span>`;
        }
      }catch{}
    }
    if(cardUrgent) card.style.animation="borderPulse 1.5s ease-in-out infinite";

    // Botões de ação para devoluções pendentes
    const actionBtnsId = `dev-actions-${dev.id}`;

    card.innerHTML=`
      <div style="flex:1">
        <div style="font-size:13px;color:var(--text);margin-bottom:4px;line-height:1.4">${dev.product}</div>
        <div style="font-size:10px;color:var(--text3);margin-bottom:6px">
          Comprador: <span style="color:var(--text2)">${dev.buyer}</span>
          ${dev.returnQty ? ` · <span style="color:var(--text2)">${Math.round(Number(dev.returnQty))} un.</span>` : ""}
          ${dev.valor?` · <span style="color:#fbbf24">R$ ${Number(dev.valor).toFixed(2)}</span>`:""}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
          ${statusBadgeHtml}
          ${dueBadgeHtml}
        </div>
        ${dev.needsReview ? `<div id="${actionBtnsId}" style="display:flex;gap:6px;flex-wrap:wrap;">
          <button onclick="window._reviewDev('${dev.id}','ok')" style="background:#4ade8022;border:1px solid #4ade8066;color:#4ade80;border-radius:4px;padding:5px 12px;font-size:10px;cursor:pointer;font-family:inherit;letter-spacing:1px;">✓ Chegou ok</button>
          <button onclick="window._reviewDev('${dev.id}','fail')" style="background:#f8717122;border:1px solid #f8717166;color:#f87171;border-radius:4px;padding:5px 12px;font-size:10px;cursor:pointer;font-family:inherit;letter-spacing:1px;">✗ Reportar problema</button>
        </div>` : `<a href="${dev.permalink}" target="_blank" class="ml-link">Abrir no ML →</a>`}
      </div>`;
    cardsGrid.appendChild(card);
  });

  // Função global para revisar devolução
  window._reviewDev = async function(claimId, action) {
    const token = state.ml_token?.access_token;
    if (!token) return alert("Token não encontrado");
    const btn = document.querySelector(`#dev-actions-${claimId}`);
    if (btn) btn.innerHTML = '<span style="font-size:11px;color:var(--text3)">Processando...</span>';
    try {
      const r = await fetch(`${VERCEL_BACKEND}/api/ml-revisar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, claim_id: claimId, action }),
      });
      const data = await r.json();
      if (data.ok) {
        if (btn) btn.innerHTML = `<span style="font-size:11px;color:#4ade80">✓ ${data.message}</span>`;
        // Atualiza a lista após 2s
        setTimeout(() => { mlDevolucoes = null; fetchMLData("devolucoes"); }, 2000);
      } else {
        if (btn) btn.innerHTML = `<span style="font-size:11px;color:#f87171">Erro: ${data.error}</span>`;
      }
    } catch(e) {
      if (btn) btn.innerHTML = `<span style="font-size:11px;color:#f87171">Erro: ${e.message}</span>`;
    }
  };

  const refBtn=document.createElement("button");
  refBtn.style.cssText="margin-top:16px;background:none;border:1px solid var(--border2);color:var(--text3);border-radius:4px;padding:6px 14px;font-size:10px;cursor:pointer;font-family:inherit;letter-spacing:1px;width:100%;";
  refBtn.textContent="↻ Atualizar";
  refBtn.addEventListener("click",()=>fetchMLData(mlSubTab));
  panel.appendChild(refBtn);
}

// ---- CHAT ASSISTENTE ----
function buildContext(memberName) {
  const tasks = tasksFor(memberName);
  const active = tasks.filter(t=>!t.done);
  const done = tasks.filter(t=>t.done);
  let ctx = `Membro: ${memberName}
`;
  ctx += `Tarefas ativas (${active.length}): ${active.map(t=>`"${t.text}" [${t.prio}]`).join(", ") || "nenhuma"}
`;
  ctx += `Tarefas concluídas hoje (${done.length}): ${done.map(t=>`"${t.text}"`).join(", ") || "nenhuma"}
`;

  if(memberName === "Diogo") {
    if(diogoDevolucoes?.data) {
      ctx += `
Devoluções do mês: ${diogoDevolucoes.count} devoluções, custo total R$ ${diogoDevolucoes.totalCost?.toFixed(2)}
`;
      const urgent = diogoDevolucoes.data.filter(d=>d.refundedAmount>0).length;
      ctx += `Com custo: ${urgent}
`;
    }
    if(mlReclamacoes?.data) {
      const aguarda = mlReclamacoes.data.filter(d=>d.stage==="waiting_seller"||d.returnStatusKey==="waiting");
      ctx += `
Reclamações abertas: ${mlReclamacoes.data.length} total, ${aguarda.length} aguardando você
`;
    }
    if(mlCanceladas?.data) {
      ctx += `Cancelamentos abertos: ${mlCanceladas.data.length}
`;
    }
    if(estoqueExcelData?.rows?.length) {
      const rows = estoqueExcelData.rows;
      let totalValor=0, totalAptas=0, semCusto=0;
      const enriched = rows.map(r=>{
        const custo = estoqueBlingData ? (estoqueBlingData[r.sku]||0) : 0;
        const valor = custo * r.aptas;
        if(!custo) semCusto++;
        totalValor += valor; totalAptas += r.aptas;
        const vendas30 = r.vendas30||0;
        const dias = vendas30>0 ? Math.round(r.aptas/(vendas30/30)) : 999;
        return {...r, custo, valor, dias};
      });
      ctx += `
ESTOQUE Filial SP (ML Full): ${rows.length} SKUs, valor total R$ ${totalValor.toFixed(2)}, ${totalAptas} unidades aptas, ${semCusto} SKUs sem custo cadastrado no Bling
`;
      const parados = enriched.filter(r=>r.dias>=999 && r.aptas>0).slice(0,10);
      if(parados.length) ctx += `Sem venda nos últimos 30 dias (${parados.length}): ${parados.map(r=>r.sku).join(", ")}
`;
      const acabando = enriched.filter(r=>r.dias<=15 && r.aptas>0).sort((a,b)=>a.dias-b.dias).slice(0,10);
      if(acabando.length) ctx += `Estoque acabando rápido (<=15 dias de giro): ${acabando.map(r=>`${r.sku} (${r.dias}d)`).join(", ")}
`;
    } else {
      ctx += `
ESTOQUE Filial SP: nenhuma planilha importada ainda na aba Estoque.
`;
    }
    if(matrizRows?.length) {
      const totalValorM = matrizRows.reduce((s,r)=>s+r.valor,0);
      const totalQtyM = matrizRows.reduce((s,r)=>s+r.qty,0);
      ctx += `ESTOQUE Matriz RS: ${matrizRows.length} SKUs, valor total R$ ${totalValorM.toFixed(2)}, ${totalQtyM} unidades
`;
    }
  }
  if(memberName === "Larissa") {
    if(mlDevolucoes?.data) {
      const pendentes = mlDevolucoes.data.filter(d=>d.needsReview);
      ctx += `
Devoluções pendentes de revisão: ${pendentes.length}
`;
      pendentes.forEach(d=>{ ctx += `- ${d.product} (${d.buyer})${d.dueDate?`, prazo: ${new Date(d.dueDate).toLocaleDateString("pt-BR")}`:""})
`; });
    }
    if(mlReclamacoes?.data) {
      ctx += `
Reclamações abertas: ${mlReclamacoes.data.length}
`;
    }
  }
  return ctx;
}

function formatChatMsg(text) {
  const lines = text.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      if (out.length > 0) out.push('<div style="height:16px;"></div>');
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      out.push('<hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">');
      continue;
    }
    const hMatch = line.match(/^#{1,3} (.+)$/);
    if (hMatch) {
      out.push('<div style="font-weight:500;color:var(--text);margin:14px 0 6px;">' + hMatch[1] + '</div>');
      continue;
    }
    const liMatch = line.match(/^[-•] (.+)$/);
    if (liMatch) {
      out.push('<div style="padding:4px 0 4px 12px;border-left:2px solid var(--border);margin:6px 0;color:var(--text2);">' + liMatch[1] + '</div>');
      continue;
    }
    const numMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) {
      out.push('<div style="padding:4px 0 4px 12px;border-left:2px solid var(--border);margin:6px 0;color:var(--text2);"><strong style="color:var(--text);">' + numMatch[1] + '.</strong> ' + numMatch[2] + '</div>');
      continue;
    }
    let l = line
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background:var(--bg2);padding:1px 5px;border-radius:3px;font-size:11px;font-family:monospace;">$1</code>');
    out.push('<div style="line-height:1.75;">' + l + '</div>');
  }
  return out.join("");
}

function renderChatModal(memberName, color) {
  const modal = document.getElementById(`chat-${memberName}`);
  if(!modal) return;
  const cs = chatState[memberName];
  if(!cs.open) { modal.classList.add("hidden"); return; }
  modal.classList.remove("hidden");
  modal.innerHTML = "";

  // Header
  const header = document.createElement("div");
  header.className = "chat-header";
  header.style.background = `${color}11`;
  header.innerHTML = `<div style="display:flex;align-items:center;gap:8px;"><span style="color:${color};font-size:14px;">✦</span><span style="font-size:11px;letter-spacing:2px;color:${color};">ASSISTENTE · ${memberName.toUpperCase()}</span></div>`;
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;";
  closeBtn.addEventListener("click", () => { cs.open=false; renderChatModal(memberName,color); });
  header.appendChild(closeBtn);
  modal.appendChild(header);

  // Messages
  const msgs = document.createElement("div");
  msgs.className = "chat-messages";
  msgs.id = `chat-msgs-${memberName}`;

  if(cs.messages.length === 0) {
    const welcome = document.createElement("div");
    welcome.className = "chat-bubble assistant";
    welcome.textContent = `Olá${memberName==="Diogo"?", Diogo":memberName==="Larissa"?", Lari":""} 👋 Como posso ajudar?`;
    msgs.appendChild(welcome);
  }

  cs.messages.forEach(msg => {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${msg.role}`;
    if(msg.role === "user") {
      bubble.style.cssText = `background:${color}22;color:${color};border:1px solid ${color}44;align-self:flex-end;`;
    }
    bubble.innerHTML = formatChatMsg(msg.content);
    msgs.appendChild(bubble);
  });

  if(cs.loading) {
    const typing = document.createElement("div");
    typing.className = "chat-typing";
    typing.innerHTML = '<span class="spinning">↻</span> Digitando...';
    msgs.appendChild(typing);
  }

  modal.appendChild(msgs);
  setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 50);

  // Input
  const inputRow = document.createElement("div");
  inputRow.className = "chat-input-row";
  const input = document.createElement("textarea");
  input.className = "chat-input";
  input.placeholder = "Mensagem...";
  input.rows = 1;
  input.style.maxHeight = "80px";
  input.addEventListener("input", () => { input.style.height="auto"; input.style.height=input.scrollHeight+"px"; });
  const sendBtn = document.createElement("button");
  sendBtn.className = "chat-send";
  sendBtn.style.cssText = `background:${color};color:#000;`;
  sendBtn.textContent = "↑";
  sendBtn.disabled = cs.loading;

  const doSend = async () => {
    const text = input.value.trim();
    if(!text || cs.loading) return;
    input.value = ""; input.style.height="auto";
    cs.messages.push({ role:"user", content:text });
    cs.loading = true;
    renderChatModal(memberName, color);

    try {
      const r = await fetch(`${VERCEL_BACKEND}/api/claude-chat`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          member: memberName,
          message: text,
          history: cs.messages.slice(-10),
          context: buildContext(memberName),
        }),
      });
      const data = await r.json();
      cs.messages.push({ role:"assistant", content: data.reply || data.error || "Erro" });
    } catch(e) {
      cs.messages.push({ role:"assistant", content:"Erro de conexão. Tente novamente." });
    }
    cs.loading = false;
    renderChatModal(memberName, color);
  };

  sendBtn.addEventListener("click", doSend);
  input.addEventListener("keydown", e => { if(e.key==="Enter" && !e.shiftKey) { e.preventDefault(); doSend(); } });
  inputRow.appendChild(input); inputRow.appendChild(sendBtn);
  modal.appendChild(inputRow);
  setTimeout(()=>input.focus(), 100);
}

function render(){
  try{
  setSyncing(false);
  const container=document.getElementById("cards");container.innerHTML="";
  const pendingMembers=MEMBERS.filter(m=>!m.locked&&Object.values(state.tasks||{}).some(t=>t!=null&&t.member===m.name&&!t.done));
  if(pendingMembers.length>0)startFaviconCycle(pendingMembers.map(m=>themeColor(m.name)));else stopFaviconFlash();
  const lbl=document.getElementById("user-label");if(lbl)lbl.textContent=currentUser?`logado como ${currentUser} · trocar`:"";

  // Esconde outros cards quando Diogo está em Mercado Livre
  const diogoPinOk = diogoPinUnlocked;
  const diogIsML = openCard==="Diogo" && diogoPinOk && window._diogotab==="mercadolivre";
  const diogIsEstoque = openCard==="Diogo" && diogoPinOk && window._diogotab==="estoque" && estoqueFullscreen;

  MEMBERS.forEach(member=>{
    const color=themeColor(member.name),hbg=themeHbg(member.name);
    const active=tasksFor(member.name).filter(t=>!t.done),done=tasksFor(member.name).filter(t=>t.done);
    const isOpen=openCard===member.name,isFlashing=!member.locked&&!!flashQueue[member.name];
    const hasPending=!member.locked&&active.filter(t=>!t.progress).length>0;
    const unreadMsgs=!member.locked?msgsFor(member.name).filter(m=>!m.read):[];

    // Esconde Bruno e Larissa quando Diogo está na aba ML
    if(diogIsML && member.name !== "Diogo") return;
    if(diogIsEstoque && member.name !== "Diogo") return;

    const card=document.createElement("div");card.className="card"+(hasPending||isFlashing?" flashing":"");
    card.style.setProperty("--c",color);
    card.style.borderColor=isOpen?color+"88":(hasPending||isFlashing)?color:"var(--border)";

    const header=document.createElement("div");header.className="card-header";header.style.background=hbg;
    const avatar=document.createElement("div");avatar.className="avatar";avatar.style.cssText=`background:${color}22;border:1.5px solid ${color};color:${color};`;avatar.textContent=member.initials;
    const nameWrap=document.createElement("div");nameWrap.style.flex="1";
    const nameEl=document.createElement("div");nameEl.className="member-name";nameEl.style.color=color;nameEl.textContent=member.name;
    const dotsEl=document.createElement("div");dotsEl.className="dots";
    if(active.length>0||done.length>0){
      ["superurgente","urgente","importante","normal"].forEach(p=>{active.filter(t=>t.prio===p).slice(0,5).forEach(()=>{const d=document.createElement("span");d.className="dot";const pc=themePrio(p);d.style.cssText=`background:${pc};box-shadow:0 0 8px ${pc};${p==="superurgente"?"animation:siren 0.6s infinite;":""}`;dotsEl.appendChild(d);});});
      if(done.length>0&&active.length===0){const s=document.createElement("span");s.style.cssText=`font-size:10px;color:${color}88;`;s.textContent="✓";dotsEl.appendChild(s);}
    }
    nameWrap.appendChild(nameEl);nameWrap.appendChild(dotsEl);header.appendChild(avatar);header.appendChild(nameWrap);
    if(unreadMsgs.length>0&&!isOpen){const ud=document.createElement("span");ud.className="unread-dot";ud.style.cssText=`background:${color};box-shadow:0 0 8px ${color};`;header.appendChild(ud);}

    // Botão chat assistente — só quando card está aberto e é o usuário atual
    
    const chev=document.createElement("span");chev.className="chevron"+(isOpen?" open":"");chev.textContent="";
    // Botão Claude no header
    if(isOpen&&currentUser===member.name){
      const chatBtn=document.createElement("button");
      chatBtn.style.cssText="background:none;border:0.5px solid rgba(255,255,255,0.25);border-radius:50%;width:26px;height:26px;color:rgba(255,255,255,0.4);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;margin-right:6px;flex-shrink:0;transition:all 0.15s;";
      chatBtn.textContent="✦";
      chatBtn.title="Assistente Claude";
      chatBtn.addEventListener("click",(e)=>{e.stopPropagation();chatState[member.name].open=!chatState[member.name].open;renderChatModal(member.name,color);});
      header.appendChild(chatBtn);
    }
    // Botão expandir estoque
    if(member.locked&&isOpen&&window._diogotab==="estoque"){
      const expBtn=document.createElement("button");
      expBtn.style.cssText="background:none;border:0.5px solid rgba(255,255,255,0.25);border-radius:4px;padding:2px 8px;color:rgba(255,255,255,0.4);font-size:12px;cursor:pointer;font-family:inherit;margin-right:6px;";
      expBtn.textContent=estoqueFullscreen?"⤡":"⤢";
      expBtn.title=estoqueExpanded?"Minimizar":"Expandir";
      expBtn.addEventListener("click",(e)=>{e.stopPropagation();estoqueFullscreen=!estoqueFullscreen;render();});
      header.appendChild(expBtn);
    }
    header.appendChild(chev);
    header.addEventListener("click",()=>{openCard=openCard===member.name?null:member.name;if(!isOpen&&member.locked)diogoPinUnlocked=false;if(flashQueue[member.name]){delete flashQueue[member.name];remove(ref(db,`/flashes/${member.name}`));}render();});
    card.appendChild(header);

    if(isOpen){
      const panel=document.createElement("div");panel.className="panel open";

      if(member.locked&&!diogoPinUnlocked){
        panel.innerHTML=`<div class="pin-wrap"><div class="pin-icon">◈</div><p>Digite o PIN para acessar</p><input class="pin-input" type="password" inputmode="numeric" autocomplete="new-password" name="digoo-pin-${Date.now()}" data-lpignore="true" data-form-type="other" maxlength="10" placeholder="••••••" id="pin-field" readonly><div style="font-size:10px;color:#f87171;margin-top:8px;letter-spacing:1px;display:none" id="pin-err">PIN incorreto</div><button class="pin-btn" style="background:${color};color:#000" id="pin-btn">ENTRAR</button></div>`;
        setTimeout(()=>{
          const f=document.getElementById("pin-field"),e=document.getElementById("pin-err"),b=document.getElementById("pin-btn");
          if(f){f.value="";f.removeAttribute("readonly");f.focus();}
          const try_=()=>{if(f.value===PIN){diogoPinUnlocked=true;render();}else{f.classList.add("shake");f.value="";e.style.display="block";setTimeout(()=>f.classList.remove("shake"),400);}};
          if(b)b.addEventListener("click",try_);if(f)f.addEventListener("keydown",e2=>{if(e2.key==="Enter")try_();});
        },50);
      }else{
        if(member.locked){
          if(!window._diogotab)window._diogotab="tarefas";
          const tabs=document.createElement("div");tabs.className="tabs";
          ["tarefas","concluidas","conversas","estoque"].forEach(tab=>{
            const btn=document.createElement("button");
            btn.className="tab-btn"+(window._diogotab===tab?" active":"");
            if(tab==="concluidas"){
              btn.innerHTML='<span style="line-height:1.3;display:inline-block;text-align:center;">Concluidas<br>Equipe</span>';
            } else if(tab==="tarefas"){
              btn.textContent="Minhas Tarefas";
            } else if(tab==="estoque") {
              btn.textContent="Estoque";
            } else {
              btn.textContent="Conversas";
            }
            btn.addEventListener("click",()=>{window._diogotab=tab;render();});
            tabs.appendChild(btn);
          });
          panel.appendChild(tabs);
          const todayStart=new Date();todayStart.setHours(0,0,0,0);

          if(window._diogotab==="mercadolivre"){
            card.style.gridColumn="1 / -1";
          } else {
            card.style.gridColumn="";
          }
          if(window._diogotab==="tarefas"){
            // Verifica recorrentes ao abrir a aba de tarefas
            if(currentUser==="Diogo") checkAndCreateRecorrentes();
            // Recorrentes: inclui done pra não sumir ao concluir
            const allOwnTasksActive=active.filter(t=>!t.delegatedBy||t.delegatedBy==="Diogo");
            const allOwnTasksDone=done.filter(t=>(!t.delegatedBy||t.delegatedBy==="Diogo")&&t.isRecorrente);
            const allOwnTasksDoneManual=done.filter(t=>(!t.delegatedBy||t.delegatedBy==="Diogo")&&!t.isRecorrente);
            const recTasks=[...allOwnTasksActive.filter(t=>t.isRecorrente),...allOwnTasksDone];
            const manualTasks=[...allOwnTasksActive.filter(t=>!t.isRecorrente),...allOwnTasksDoneManual];
            const allOwnTasks=manualTasks; // alias para o código abaixo
            const teamTasks=active.filter(t=>t.delegatedBy&&t.delegatedBy!=="Diogo");

            // Seção recorrentes
            if(recTasks.length>0){
              const recSec=document.createElement("div");
              recSec.style.cssText="margin-bottom:14px;";
              const recLabel=document.createElement("div");
              recLabel.style.cssText="font-size:8px;letter-spacing:2px;color:#00ffe544;text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;gap:6px;";
              recLabel.innerHTML='recorrentes de hoje <span style="flex:1;height:1px;background:#ffffff08;display:inline-block;margin-left:6px;"></span>';
              recLabel.style.color="var(--text3)";
              recSec.appendChild(recLabel);
              recTasks.forEach(task=>{
                const pc=themePrio(task.prio);
                const row=document.createElement("div");row.className="task-row";
                const chk=document.createElement("button");chk.className="task-check"+(task.done?" done":task.progress?" progress":"");
                chk.style.borderColor="#3b82f6";
                if(task.done) chk.style.background="#3b82f6";
                else if(task.progress) chk.style.background=`linear-gradient(to top, #3b82f6 50%, transparent 50%)`;
                else chk.style.background="none";
                chk.addEventListener("click",()=>toggleTask(task.id,task.done,task.progress,true));
                const tw=document.createElement("div");tw.style.flex="1";
                const tt=document.createElement("div");tt.className="task-text"+(task.done?" done":"");tt.textContent=task.text;tw.appendChild(tt);
                row.appendChild(chk);row.appendChild(tw);
                // Botões reabrir + OK quando concluída — na ponta direita
                if(task.done){
                  const btnWrap=document.createElement("div");
                  btnWrap.style.cssText="display:flex;gap:5px;flex-shrink:0;";
                  const reopen=document.createElement("button");
                  reopen.style.cssText="background:none;border:1px solid #3b82f644;border-radius:3px;color:#3b82f677;font-size:8px;letter-spacing:1px;padding:2px 7px;cursor:pointer;font-family:inherit;";
                  reopen.textContent="Reabrir";
                  reopen.addEventListener("click",(e)=>{e.stopPropagation();update(ref(db,`/tasks/${task.id}`),{done:false,progress:false});});
                  const okBtn=document.createElement("button");
                  okBtn.style.cssText="background:#3b82f6;border:none;border-radius:3px;color:#000;font-size:8px;font-weight:700;letter-spacing:1px;padding:2px 7px;cursor:pointer;font-family:inherit;";
                  okBtn.textContent="OK";
                  okBtn.addEventListener("click",(e)=>{e.stopPropagation();remove(ref(db,`/tasks/${task.id}`));});
                  btnWrap.appendChild(reopen);btnWrap.appendChild(okBtn);
                  row.appendChild(btnWrap);
                }
                recSec.appendChild(row);
              });
              panel.appendChild(recSec);
            }

            // Seção tarefas manuais
            const ownTasks=manualTasks;
            if(ownTasks.length===0&&recTasks.length===0){const e=document.createElement("p");e.style.cssText="font-size:11px;color:var(--text3);padding:10px 0 4px;";e.textContent="Nenhuma tarefa sua ainda";panel.appendChild(e);}
            if(ownTasks.length>0){
              const manLabel=document.createElement("div");
              manLabel.style.cssText="font-size:8px;letter-spacing:2px;color:#ffffff33;text-transform:uppercase;margin-bottom:8px;margin-top:4px;display:flex;align-items:center;gap:6px;";
              manLabel.innerHTML='minhas tarefas <span style="flex:1;height:1px;background:#ffffff08;display:inline-block;"></span>';
              panel.appendChild(manLabel);
            }
            ownTasks.forEach(task=>{
              const pc=themePrio(task.prio);const row=document.createElement("div");row.className="task-row";
              const chk=document.createElement("button");chk.className="task-check"+(task.done?" done":task.progress?" progress":"");
              chk.style.borderColor=pc;
              if(task.done) chk.style.background=pc;
              else if(task.progress) chk.style.background=`linear-gradient(to top, ${pc} 50%, transparent 50%)`;
              else chk.style.background="none";
              chk.addEventListener("click",()=>toggleTask(task.id,task.done,task.progress));
              const tw=document.createElement("div");tw.style.flex="1";const tt=document.createElement("div");tt.className="task-text"+(task.done?" done":"");tt.textContent=task.text;tw.appendChild(tt);
              const pb=document.createElement("div");pb.className="task-prio";const puls=task.prio==="superurgente"?"animation:siren 0.6s infinite;":"";pb.innerHTML=`<span class="dot" style="background:${pc};${puls}"></span><span style="color:${pc};font-weight:${task.prio==="superurgente"?"700":"400"};${puls}">${PRIO[task.prio].label}</span>`;tw.appendChild(pb);
              row.appendChild(chk);row.appendChild(tw);
              if(task.done){
                const btnWrap=document.createElement("div");
                btnWrap.style.cssText="display:flex;gap:5px;flex-shrink:0;";
                const reopen=document.createElement("button");
                reopen.style.cssText=`background:none;border:1px solid ${pc}44;border-radius:3px;color:${pc}99;font-size:8px;letter-spacing:1px;padding:2px 7px;cursor:pointer;font-family:inherit;`;
                reopen.textContent="Reabrir";
                reopen.addEventListener("click",(e)=>{e.stopPropagation();update(ref(db,`/tasks/${task.id}`),{done:false,progress:false});});
                const okBtn=document.createElement("button");
                okBtn.style.cssText=`background:${pc};border:none;border-radius:3px;color:#000;font-size:8px;font-weight:700;letter-spacing:1px;padding:2px 7px;cursor:pointer;font-family:inherit;`;
                okBtn.textContent="OK";
                okBtn.addEventListener("click",(e)=>{e.stopPropagation();deleteTask(task.id);});
                btnWrap.appendChild(reopen);btnWrap.appendChild(okBtn);
                row.appendChild(btnWrap);
              }else{
                const del=document.createElement("button");del.className="del-btn";del.textContent="×";del.addEventListener("click",()=>deleteTask(task.id));
                row.appendChild(del);
              }
              panel.appendChild(row);
            });
            if(teamTasks.length>0){
              const divider=document.createElement("div");divider.className="section";divider.innerHTML=`<div class="section-label">Mensagem da equipe</div>`;
              teamTasks.forEach(task=>{
                const card2=document.createElement("div");card2.style.cssText=`background:var(--bg3);border:1px solid ${themeColor(task.delegatedBy)}44;border-left:3px solid ${themeColor(task.delegatedBy)};border-radius:6px;padding:10px 12px;margin-bottom:6px;`;
                const hdr=document.createElement("div");hdr.style.cssText="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;";hdr.innerHTML=`<span style="font-size:10px;color:${themeColor(task.delegatedBy)};letter-spacing:1px;font-weight:500">${task.delegatedBy}</span><span style="font-size:9px;color:var(--text3)">${PRIO[task.prio].label}</span>`;card2.appendChild(hdr);
                const tt2=document.createElement("div");tt2.style.cssText="font-size:13px;color:var(--text);line-height:1.4;margin-bottom:8px;";tt2.textContent=task.text;card2.appendChild(tt2);
                const threadMsgs=Object.values(state.messages||{}).filter(m=>m!=null&&m.taskId===task.id).sort((a,b)=>(a.ts_raw||0)-(b.ts_raw||0));
                if(threadMsgs.length>0){const thread=document.createElement("div");thread.style.cssText="border-top:1px solid var(--sep);padding-top:8px;margin-bottom:8px;";threadMsgs.forEach(msg=>{const isMine=msg.from==="Diogo";const mEl=document.createElement("div");mEl.style.cssText=`display:flex;flex-direction:${isMine?"row-reverse":"row"};margin-bottom:5px;`;const bubble=document.createElement("div");bubble.style.cssText=`max-width:75%;padding:5px 9px;border-radius:${isMine?"9px 9px 2px 9px":"9px 9px 9px 2px"};background:${isMine?themeColor("Diogo")+"22":"var(--bg2)"};border:1px solid ${isMine?themeColor("Diogo")+"44":"var(--border)"};`;bubble.innerHTML=`<div style="font-size:12px;color:var(--text);line-height:1.4">${msg.text}</div><div style="font-size:9px;color:var(--text3);margin-top:2px;text-align:${isMine?"right":"left"}">${msg.ts}</div>`;mEl.appendChild(bubble);thread.appendChild(mEl);});card2.appendChild(thread);}
                const actions=document.createElement("div");actions.style.cssText="display:flex;gap:6px;";
                const replyBtn=document.createElement("button");replyBtn.textContent="↩ Responder";replyBtn.style.cssText=`background:none;border:1px solid ${themeColor(task.delegatedBy)}66;color:${themeColor(task.delegatedBy)};border-radius:4px;padding:4px 10px;font-size:10px;cursor:pointer;font-family:inherit;letter-spacing:1px;`;
                const closeBtn=document.createElement("button");closeBtn.textContent="✓ Encerrar";closeBtn.style.cssText="background:none;border:1px solid #4ade8066;color:#4ade80;border-radius:4px;padding:4px 10px;font-size:10px;cursor:pointer;font-family:inherit;letter-spacing:1px;";
                closeBtn.addEventListener("click",()=>{push(ref(db,"/notices"),{forMember:task.delegatedBy,text:task.text,by:"Diogo",ts:new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}),ts_raw:Date.now()});set(ref(db,`/flashes/${task.delegatedBy}`),{ts:Date.now(),msg:`Diogo concluiu sua tarefa!`});Object.entries(state.messages||{}).forEach(([mid,m])=>{if(m!=null&&m.taskId===task.id)remove(ref(db,`/messages/${mid}`));});deleteTask(task.id);});
                actions.appendChild(replyBtn);actions.appendChild(closeBtn);card2.appendChild(actions);
                const mf=document.createElement("div");mf.style.cssText="display:none;margin-top:8px;";const mi=document.createElement("input");mi.placeholder="Sua resposta...";mi.style.cssText="width:100%;background:var(--bg);border:1px solid var(--border2);border-radius:4px;padding:6px 8px;color:var(--text);font-size:12px;font-family:inherit;outline:none;margin-bottom:6px;";
                const mbr=document.createElement("div");mbr.style.cssText="display:flex;gap:6px;";const sb=document.createElement("button");sb.className="btn-primary";sb.style.cssText=`background:${color};color:#000;font-size:9px;letter-spacing:2px;border:none;border-radius:4px;padding:6px;cursor:pointer;font-family:inherit;flex:1;`;sb.textContent="ENVIAR";const cb=document.createElement("button");cb.className="btn-cancel";cb.textContent="✕";mbr.appendChild(sb);mbr.appendChild(cb);mf.appendChild(mi);mf.appendChild(mbr);
                const submit=()=>{if(!mi.value.trim())return;sendMessage("Diogo",mi.value.trim(),task.id,task.text,task.delegatedBy,task.delegatedBy);mi.value="";mf.style.display="none";};
                sb.addEventListener("click",submit);cb.addEventListener("click",()=>{mf.style.display="none";replyBtn.textContent="↩ Responder";});mi.addEventListener("keydown",e=>{if(e.key==="Enter")submit();if(e.key==="Escape"){mf.style.display="none";}});
                replyBtn.addEventListener("click",()=>{const vis=mf.style.display!=="none";mf.style.display=vis?"none":"block";replyBtn.textContent=vis?"↩ Responder":"✕ Cancelar";if(!vis)setTimeout(()=>mi.focus(),50);});
                card2.appendChild(mf);divider.appendChild(card2);
              });
              panel.appendChild(divider);
            }
            // Wrapper lado a lado
            const btnWrapper=document.createElement("div");
            btnWrapper.style.cssText="display:flex;gap:8px;margin-top:20px;border-top:1px solid #1a1a1a;padding-top:12px;";
            const taskSec=document.createElement("div");taskSec.style.cssText="flex:1;transition:flex 0.15s;";
            const delSec=document.createElement("div");delSec.style.cssText="flex:1;transition:flex 0.15s;";
            appendAddTask(taskSec,color,"","+ minha tarefa",null,(text,prio)=>addTask("Diogo",text,prio),true,delSec);
            appendDelegate(delSec,color,true,taskSec);
            btnWrapper.appendChild(taskSec);
            btnWrapper.appendChild(delSec);
            panel.appendChild(btnWrapper);
            active.length=0;
          }else if(window._diogotab==="estoque"){
            if(estoqueFullscreen){card.style.gridColumn="1 / -1";panel.style.maxHeight="none";panel.style.overflowY="auto";}else{card.style.gridColumn="";panel.style.maxHeight="";panel.style.overflowY="";}
            renderEstoqueTab(panel, color);
          }else if(window._diogotab==="concluidas"){
            if(Object.keys(completionAlerts).length>0){
              const sec=document.createElement("div");sec.style.marginBottom="12px";sec.innerHTML=`<div class="section-label" style="color:#00e676;margin-bottom:8px">Novas conclusões</div>`;
              Object.entries(completionAlerts).forEach(([id,a])=>{const row=document.createElement("div");row.className="alert-row";row.innerHTML=`<span style="font-size:10px;color:${themeColor(a.member)};letter-spacing:1px">${a.member}</span><span style="flex:1;font-size:12px;color:var(--text2);text-decoration:line-through;margin:0 8px">${a.text}</span>`;const ok=document.createElement("button");ok.textContent="OK";ok.style.cssText="background:#00e676;color:#000;border:none;border-radius:3px;padding:3px 10px;font-size:9px;letter-spacing:1.5px;cursor:pointer;font-family:inherit;font-weight:700;";ok.addEventListener("click",()=>{delete completionAlerts[id];render();});row.appendChild(ok);sec.appendChild(row);});panel.appendChild(sec);
            }
            if(Object.keys(completionAlerts).length===0){const e=document.createElement("p");e.style.cssText="font-size:11px;color:var(--text3);text-align:center;padding:14px 0;";e.textContent="Nenhuma conclusão nova";panel.appendChild(e);}
          }else if(window._diogotab==="conversas"){
            const todayMsgs=Object.entries(state.messages||{}).filter(([,m])=>m!=null&&(m.ts_raw>=todayStart.getTime()||!m.ts_raw)).map(([id,m])=>({...m,id})).sort((a,b)=>b.ts_raw-a.ts_raw);
            if(todayMsgs.length===0){const e=document.createElement("p");e.style.cssText="font-size:11px;color:var(--text3);text-align:center;padding:14px 0;";e.textContent="Nenhuma conversa hoje";panel.appendChild(e);}
            const dThreads={};
            todayMsgs.forEach(msg=>{const key=msg.taskId||"general";if(!dThreads[key])dThreads[key]={taskText:msg.taskText,delegatedBy:msg.delegatedBy,msgs:[]};dThreads[key].msgs.push(msg);});
            Object.entries(dThreads).forEach(([taskId,thread])=>{
              const tw=document.createElement("div");tw.style.cssText="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:8px;";
              const hdr=document.createElement("div");hdr.style.cssText="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--sep);";
              const hdrText=document.createElement("div");hdrText.style.cssText="font-size:9px;color:var(--text3);flex:1;";hdrText.innerHTML=thread.taskText?`re: <span style="color:var(--text2)">${thread.taskText}</span>${thread.delegatedBy?` <span style="opacity:0.6">· de ${thread.delegatedBy}</span>`:""}` : "Conversa";
              const closeBtn=document.createElement("button");closeBtn.textContent="×";closeBtn.style.cssText="background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;padding:0 0 0 8px;line-height:1;opacity:0.6;";closeBtn.addEventListener("click",()=>{thread.msgs.forEach(msg=>deleteMsg(msg.id));});
              hdr.appendChild(hdrText);hdr.appendChild(closeBtn);tw.appendChild(hdr);
              thread.msgs.forEach(msg=>{const isDiogo=msg.from==="Diogo";const me=document.createElement("div");me.style.cssText=`display:flex;flex-direction:${isDiogo?"row-reverse":"row"};gap:6px;margin-bottom:6px;`;const nameEl=document.createElement("div");nameEl.style.cssText=`font-size:9px;color:${themeColor(msg.from)};align-self:flex-end;white-space:nowrap;`;nameEl.textContent=msg.from;const bubble=document.createElement("div");bubble.style.cssText=`max-width:70%;padding:6px 10px;border-radius:10px;background:${isDiogo?themeColor("Diogo")+"22":"var(--bg2)"};border:1px solid ${isDiogo?themeColor("Diogo")+"44":"var(--border)"};`;bubble.innerHTML=`<div style="font-size:12px;color:var(--text);line-height:1.4">${msg.text}</div><div style="font-size:9px;color:var(--text3);margin-top:2px">${msg.ts}${msg.recipient&&msg.recipient!=="Diogo"?` → <span style="color:${themeColor(msg.recipient)}">${msg.recipient}</span>`:""}</div>`;me.appendChild(nameEl);me.appendChild(bubble);tw.appendChild(me);});
              const rw=document.createElement("div");rw.style.cssText="display:flex;gap:6px;margin-top:8px;padding-top:6px;border-top:1px solid var(--sep);";const ri=document.createElement("input");ri.placeholder="Responder...";ri.style.cssText="flex:1;background:var(--bg);border:1px solid var(--border2);border-radius:4px;padding:5px 8px;color:var(--text);font-size:11px;font-family:inherit;outline:none;";const rb=document.createElement("button");rb.textContent="↑";rb.style.cssText=`background:${themeColor("Diogo")};color:#000;border:none;border-radius:4px;padding:5px 10px;cursor:pointer;font-size:13px;font-weight:700;`;
              const lastMsg=thread.msgs[thread.msgs.length-1];const replyTo=lastMsg.from==="Diogo"?lastMsg.recipient:lastMsg.from;
              const doR=()=>{if(!ri.value.trim())return;sendMessage("Diogo",ri.value.trim(),taskId,thread.taskText,replyTo,thread.delegatedBy);ri.value="";};rb.addEventListener("click",doR);ri.addEventListener("keydown",e=>{if(e.key==="Enter")doR();});rw.appendChild(ri);rw.appendChild(rb);tw.appendChild(rw);panel.appendChild(tw);
            });
          }
        }else{
          if(member.name==="Larissa"){
            if(!window._larissatab)window._larissatab="tarefas";
            const lTabs=document.createElement("div");lTabs.className="tabs";
            ["tarefas","ml"].forEach(tab=>{const btn=document.createElement("button");btn.className="tab-btn"+(window._larissatab===tab?" active":"");btn.textContent=tab==="tarefas"?"Tarefas":"Mercado Livre";btn.addEventListener("click",()=>{window._larissatab=tab;render();});lTabs.appendChild(btn);});
            panel.appendChild(lTabs);
            if(window._larissatab==="ml"){
              card.style.gridColumn="1 / -1";panel.style.maxHeight="75vh";panel.style.overflowY="auto";
              renderMLInPanel(panel,color);card.appendChild(panel);container.appendChild(card);return;
            }else{card.style.gridColumn="";panel.style.maxHeight="";panel.style.overflowY="";}
          }
          if(active.length===0&&done.length===0){const e=document.createElement("p");e.style.cssText="font-size:11px;color:var(--text3);text-align:center;padding:14px 0;";e.textContent="Nenhuma tarefa delegada";panel.appendChild(e);}
        }

        if(!member.locked){
          active.forEach(task=>{
            const pc=themePrio(task.prio);const row=document.createElement("div");row.className="task-row";
            const chk=document.createElement("button");chk.className="task-check"+(task.done?" done":task.progress?" progress":"");
            chk.style.borderColor=pc;
            if(task.done) chk.style.background=pc;
            else if(task.progress) chk.style.background=`linear-gradient(to top, ${pc} 50%, transparent 50%)`;
            else chk.style.background="none";
            chk.addEventListener("click",()=>toggleTask(task.id,task.done,task.progress));
            const tw=document.createElement("div");tw.style.flex="1";const tt=document.createElement("div");tt.className="task-text";tt.textContent=task.text;tw.appendChild(tt);
            if(task.delegatedBy){const dbb=document.createElement("div");dbb.style.cssText=`font-size:9px;color:${themeColor(task.delegatedBy)};margin-top:3px;letter-spacing:1px;`;dbb.textContent=`de ${task.delegatedBy}`;tw.appendChild(dbb);}
            row.appendChild(chk);row.appendChild(tw);
            const taskMsgs=Object.values(state.messages||{}).filter(m=>m!=null&&m.taskId===task.id);
            const mb=document.createElement("button");mb.className="msg-btn"+(taskMsgs.length>0?" has-msg":"");mb.textContent=taskMsgs.length>0?`💬 ${taskMsgs.length}`:"💬";
            const mf=document.createElement("div");mf.className="task-msg-form";mf.style.display="none";const mi=document.createElement("input");mi.placeholder="Recado sobre essa tarefa...";
            const mbr=document.createElement("div");mbr.style.cssText="display:flex;gap:6px;";const sb=document.createElement("button");sb.className="btn-primary";sb.style.cssText=`background:${color};color:#000;font-size:9px;letter-spacing:2px;border:none;border-radius:4px;padding:6px;cursor:pointer;font-family:inherit;flex:1;`;sb.textContent="ENVIAR";const cbt=document.createElement("button");cbt.className="btn-cancel";cbt.textContent="✕";mbr.appendChild(sb);mbr.appendChild(cbt);mf.appendChild(mi);mf.appendChild(mbr);
            const submit=()=>{if(mi.value.trim()){sendMessage(member.name,mi.value.trim(),task.id,task.text,task.delegatedBy||"Diogo",task.delegatedBy||"Diogo");mi.value="";mf.style.display="none";}};
            sb.addEventListener("click",submit);cbt.addEventListener("click",()=>{mf.style.display="none";});mi.addEventListener("keydown",e=>{if(e.key==="Enter")submit();if(e.key==="Escape")mf.style.display="none";});mb.addEventListener("click",()=>{const vis=mf.style.display!=="none";mf.style.display=vis?"none":"block";if(!vis)setTimeout(()=>mi.focus(),50);});
            row.appendChild(mb);const rw=document.createElement("div");rw.appendChild(row);rw.appendChild(mf);panel.appendChild(rw);
          });
          if(done.length>0){
            const sec=document.createElement("div");sec.className="section";sec.innerHTML=`<div class="done-header"><span class="done-label">CONCLUÍDAS</span><button class="clear-btn" id="clr-${member.name}">LIMPAR</button></div>`;
            done.forEach(task=>{const row=document.createElement("div");row.className="task-row done-row";const chk=document.createElement("button");chk.className="task-check done";chk.style.cssText="background:#4ade80;border-color:#4ade80;";chk.addEventListener("click",()=>toggleTask(task.id,task.done));const t=document.createElement("div");t.className="task-text done";t.style.flex="1";t.textContent=task.text;row.appendChild(chk);row.appendChild(t);sec.appendChild(row);});
            panel.appendChild(sec);setTimeout(()=>{const cb=document.getElementById(`clr-${member.name}`);if(cb)cb.addEventListener("click",()=>clearDone(member.name));},50);
          }
          const myNotices=Object.entries(state.notices||{}).filter(([,n])=>n!=null&&n.forMember===member.name).map(([id,n])=>({...n,id})).sort((a,b)=>b.ts_raw-a.ts_raw);
          if(myNotices.length>0){
            const nsec=document.createElement("div");nsec.className="section";nsec.innerHTML=`<div class="section-label">Tarefas concluídas</div>`;
            myNotices.forEach(notice=>{const el=document.createElement("div");el.style.cssText="display:flex;align-items:center;gap:10px;padding:9px 10px;margin-bottom:4px;border-radius:5px;background:#00140a;border:1px solid #00e67644;";el.innerHTML=`<span style="color:#00e676;font-size:13px">✓</span><div style="flex:1"><div style="font-size:12px;color:var(--text2);text-decoration:line-through">${notice.text}</div><div style="font-size:9px;color:var(--text3);margin-top:2px">${notice.by} concluiu · ${notice.ts}</div></div>`;const ok=document.createElement("button");ok.textContent="OK";ok.style.cssText="background:#00e676;color:#000;border:none;border-radius:3px;padding:3px 10px;font-size:9px;letter-spacing:1.5px;cursor:pointer;font-family:inherit;font-weight:700;";ok.addEventListener("click",()=>remove(ref(db,`/notices/${notice.id}`)));el.appendChild(ok);nsec.appendChild(el);});panel.appendChild(nsec);
          }
          const threadMsgs=Object.entries(state.messages||{}).filter(([,m])=>m!=null&&!m.closed&&(m.recipient===member.name||m.from===member.name)).map(([id,m])=>({...m,id})).sort((a,b)=>(a.ts_raw||0)-(b.ts_raw||0));
          const threads={};threadMsgs.forEach(msg=>{const key=msg.taskId||"general";if(!threads[key])threads[key]={taskText:msg.taskText,delegatedBy:msg.delegatedBy,msgs:[]};threads[key].msgs.push(msg);});
          if(Object.keys(threads).length>0){
            const sec=document.createElement("div");sec.className="section";sec.innerHTML=`<div class="section-label">Mensagens</div>`;
            Object.entries(threads).forEach(([taskId,thread])=>{
              const threadWrap=document.createElement("div");threadWrap.style.cssText="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:8px;";
              const hdr=document.createElement("div");hdr.style.cssText="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--sep);";const hdrText=document.createElement("div");hdrText.style.cssText="font-size:9px;color:var(--text3);letter-spacing:0.5px;flex:1;";hdrText.innerHTML=thread.taskText?`re: <span style="color:var(--text2)">${thread.taskText}</span>${thread.delegatedBy?` <span style="opacity:0.6">· de ${thread.delegatedBy}</span>`:""}` : "Conversa";const closeBtn=document.createElement("button");closeBtn.textContent="×";closeBtn.style.cssText="background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;padding:0 0 0 8px;line-height:1;opacity:0.6;";closeBtn.addEventListener("click",()=>{thread.msgs.forEach(msg=>deleteMsg(msg.id));});hdr.appendChild(hdrText);hdr.appendChild(closeBtn);threadWrap.appendChild(hdr);
              thread.msgs.forEach(msg=>{const isMine=msg.from===member.name;const msgEl=document.createElement("div");msgEl.style.cssText=`display:flex;flex-direction:${isMine?"row-reverse":"row"};gap:6px;margin-bottom:6px;align-items:flex-end;`;const bubble=document.createElement("div");bubble.style.cssText=`max-width:75%;padding:6px 10px;border-radius:${isMine?"10px 10px 2px 10px":"10px 10px 10px 2px"};background:${isMine?themeColor(member.name)+"22":"var(--bg2)"};border:1px solid ${isMine?themeColor(member.name)+"44":"var(--border)"};`;bubble.innerHTML=`<div style="font-size:12px;color:var(--text);line-height:1.4">${msg.text}</div><div style="font-size:9px;color:var(--text3);margin-top:2px;text-align:${isMine?"right":"left"}">${msg.ts}</div>`;msgEl.appendChild(bubble);threadWrap.appendChild(msgEl);});
              const replyWrap=document.createElement("div");replyWrap.style.cssText="display:flex;gap:6px;margin-top:8px;padding-top:6px;border-top:1px solid var(--sep);";const replyInp=document.createElement("input");replyInp.placeholder="Responder...";replyInp.style.cssText="flex:1;background:var(--bg);border:1px solid var(--border2);border-radius:4px;padding:5px 8px;color:var(--text);font-size:11px;font-family:inherit;outline:none;";const replyBtn=document.createElement("button");replyBtn.textContent="↑";replyBtn.style.cssText=`background:${themeColor(member.name)};color:#000;border:none;border-radius:4px;padding:5px 10px;cursor:pointer;font-size:13px;font-weight:700;`;
              const lastMsg=thread.msgs[thread.msgs.length-1];const replyTo=lastMsg.from===member.name?lastMsg.recipient:lastMsg.from;const doReply=()=>{if(!replyInp.value.trim())return;sendMessage(member.name,replyInp.value.trim(),taskId,thread.taskText,replyTo,thread.delegatedBy);replyInp.value="";};replyBtn.addEventListener("click",doReply);replyInp.addEventListener("keydown",e=>{if(e.key==="Enter")doReply();});replyWrap.appendChild(replyInp);replyWrap.appendChild(replyBtn);threadWrap.appendChild(replyWrap);sec.appendChild(threadWrap);
            });
            panel.appendChild(sec);
          }
          appendCornerDelegate(panel,color,member.name);
        }
      }
      card.appendChild(panel);
    }

    container.appendChild(card);
  });
  }catch(e){console.error("Render error:",e);}
}

function makeAddBtn(color,label){const btn=document.createElement("button");btn.className="add-dashed";btn.textContent=label;btn.style.cssText=`border-color:${color};color:${color};opacity:0.85;text-shadow:0 0 8px ${color}88;box-shadow:inset 0 0 12px ${color}11;`;btn.addEventListener("mouseenter",()=>{btn.style.opacity="1";btn.style.boxShadow=`inset 0 0 20px ${color}22`;});btn.addEventListener("mouseleave",()=>{btn.style.opacity="0.85";btn.style.boxShadow=`inset 0 0 12px ${color}11`;});return btn;}

function appendAddTask(container,color,sectionLabel,btnLabel,who,onAdd,_unused,sibling){
  const sec=document.createElement("div");sec.style.cssText="";sec.innerHTML="";
  const btn=makeAddBtn(color,btnLabel);const form=document.createElement("div");form.className="input-box";form.style.display="none";let prio="importante";
  form.innerHTML=`<input placeholder="Descrição..."><div class="prio-row">${Object.entries(PRIO).map(([k])=>`<button class="prio-btn" data-p="${k}" style="border-color:${k==="importante"?themePrio(k)+"66":"var(--border2)"};color:${k==="importante"?themePrio(k):"var(--text3)"};background:${k==="importante"?themePrio(k)+"22":"none"}">${PRIO[k].label}</button>`).join("")}</div><div class="btn-row"><button class="btn-primary" style="background:${color};color:#000">ADICIONAR</button><button class="btn-cancel">✕</button></div>`;
  form.querySelectorAll(".prio-btn").forEach(b=>b.addEventListener("click",()=>{prio=b.dataset.p;form.querySelectorAll(".prio-btn").forEach(x=>{const pc=themePrio(x.dataset.p);x.style.borderColor=x.dataset.p===prio?pc+"66":"var(--border2)";x.style.color=x.dataset.p===prio?pc:"var(--text3)";x.style.background=x.dataset.p===prio?pc+"22":"none";});}));
  const inp=form.querySelector("input");
  const closeExpanded=()=>{if(sibling)sibling.style.display="";container.style.flex="1";};
  const submit=()=>{if(inp.value.trim()){onAdd(inp.value.trim(),prio);inp.value="";form.style.display="none";btn.style.display="";closeExpanded();}};const cancel=()=>{form.style.display="none";btn.style.display="";inp.value="";closeExpanded();};
  form.querySelector(".btn-primary").addEventListener("click",submit);form.querySelector(".btn-cancel").addEventListener("click",cancel);inp.addEventListener("keydown",e=>{if(e.key==="Enter")submit();if(e.key==="Escape")cancel();});
  btn.addEventListener("click",()=>{btn.style.display="none";form.style.display="block";if(sibling)sibling.style.display="none";container.style.flex="1 1 100%";setTimeout(()=>inp.focus(),50);});sec.appendChild(btn);sec.appendChild(form);container.appendChild(sec);
}

function appendDelegate(container,color,_unused,sibling){
  const sec=document.createElement("div");sec.style.cssText="";sec.innerHTML="";
  const btn=makeAddBtn(color,"+ delegar");const form=document.createElement("div");form.className="input-box";form.style.display="none";let prio="importante",who="Bruno";const others=MEMBERS.filter(m=>!m.locked);
  form.innerHTML=`<div class="who-row">${others.map(m=>`<button class="who-btn" data-w="${m.name}" style="border-color:${m.name==="Bruno"?themeColor(m.name)+"66":"var(--border2)"};color:${m.name==="Bruno"?themeColor(m.name):"var(--text3)"};background:${m.name==="Bruno"?themeColor(m.name)+"22":"none"}">${m.name}</button>`).join("")}</div><input placeholder="Descrição..."><div class="prio-row">${Object.entries(PRIO).map(([k])=>`<button class="prio-btn" data-p="${k}" style="border-color:${k==="importante"?themePrio(k)+"66":"var(--border2)"};color:${k==="importante"?themePrio(k):"var(--text3)"};background:${k==="importante"?themePrio(k)+"22":"none"}">${PRIO[k].label}</button>`).join("")}</div><div class="btn-row"><button class="btn-primary btn-del" style="background:${themeColor("Bruno")};color:#000">DELEGAR</button><button class="btn-cancel">✕</button></div>`;
  form.querySelectorAll(".who-btn").forEach(b=>b.addEventListener("click",()=>{who=b.dataset.w;const mc=themeColor(who);form.querySelectorAll(".who-btn").forEach(x=>{const xc=themeColor(x.dataset.w);x.style.borderColor=x.dataset.w===who?xc+"66":"var(--border2)";x.style.color=x.dataset.w===who?xc:"var(--text3)";x.style.background=x.dataset.w===who?xc+"22":"none";});const db2=form.querySelector(".btn-del");if(db2)db2.style.background=mc;}));
  form.querySelectorAll(".prio-btn").forEach(b=>b.addEventListener("click",()=>{prio=b.dataset.p;form.querySelectorAll(".prio-btn").forEach(x=>{const pc=themePrio(x.dataset.p);x.style.borderColor=x.dataset.p===prio?pc+"66":"var(--border2)";x.style.color=x.dataset.p===prio?pc:"var(--text3)";x.style.background=x.dataset.p===prio?pc+"22":"none";});}));
  const inp=form.querySelector("input");
  const closeExpanded=()=>{if(sibling)sibling.style.display="";container.style.flex="1";};
  const submit=()=>{if(inp.value.trim()){addTask(who,inp.value.trim(),prio,"Diogo");inp.value="";form.style.display="none";btn.style.display="";closeExpanded();}};const cancel=()=>{form.style.display="none";btn.style.display="";inp.value="";closeExpanded();};
  form.querySelector(".btn-del").addEventListener("click",submit);form.querySelector(".btn-cancel").addEventListener("click",cancel);inp.addEventListener("keydown",e=>{if(e.key==="Enter")submit();if(e.key==="Escape")cancel();});
  btn.addEventListener("click",()=>{btn.style.display="none";form.style.display="block";if(sibling)sibling.style.display="none";container.style.flex="1 1 100%";setTimeout(()=>inp.focus(),50);});sec.appendChild(btn);sec.appendChild(form);container.appendChild(sec);
}

function appendCornerDelegate(container,color,senderName){
  const btn=document.createElement("button");btn.className="corner-btn";btn.textContent="+";btn.title="Delegar tarefa";
  const form=document.createElement("div");form.className="input-box";form.style.display="none";form.style.marginTop="10px";let prio="importante",who=MEMBERS.filter(m=>m.name!==senderName)[0].name;const others=MEMBERS.filter(m=>m.name!==senderName);
  form.innerHTML=`<div style="font-size:8px;color:var(--text3);letter-spacing:2px;margin-bottom:10px">DELEGAR PARA</div><div class="who-row">${others.map(m=>`<button class="who-btn" data-w="${m.name}" style="border-color:${m.name===who?themeColor(m.name)+"66":"var(--border2)"};color:${m.name===who?themeColor(m.name):"var(--text3)"};background:${m.name===who?themeColor(m.name)+"22":"none"}">${m.name}</button>`).join("")}</div><input placeholder="Descrição..."><div class="prio-row">${Object.entries(PRIO).map(([k])=>`<button class="prio-btn" data-p="${k}" style="border-color:${k==="importante"?themePrio(k)+"66":"var(--border2)"};color:${k==="importante"?themePrio(k):"var(--text3)"};background:${k==="importante"?themePrio(k)+"22":"none"}">${PRIO[k].label}</button>`).join("")}</div><div class="btn-row"><button class="btn-primary btn-del" style="background:${themeColor(who)};color:#000">DELEGAR</button><button class="btn-cancel">✕</button></div>`;
  form.querySelectorAll(".who-btn").forEach(b=>b.addEventListener("click",()=>{who=b.dataset.w;const mc=themeColor(who);form.querySelectorAll(".who-btn").forEach(x=>{const xc=themeColor(x.dataset.w);x.style.borderColor=x.dataset.w===who?xc+"66":"var(--border2)";x.style.color=x.dataset.w===who?xc:"var(--text3)";x.style.background=x.dataset.w===who?xc+"22":"none";});const db2=form.querySelector(".btn-del");if(db2)db2.style.background=mc;}));
  form.querySelectorAll(".prio-btn").forEach(b=>b.addEventListener("click",()=>{prio=b.dataset.p;form.querySelectorAll(".prio-btn").forEach(x=>{const pc=themePrio(x.dataset.p);x.style.borderColor=x.dataset.p===prio?pc+"66":"var(--border2)";x.style.color=x.dataset.p===prio?pc:"var(--text3)";x.style.background=x.dataset.p===prio?pc+"22":"none";});}));
  const inp=form.querySelector("input");const submit=()=>{if(inp.value.trim()){addTask(who,inp.value.trim(),prio,senderName);inp.value="";form.style.display="none";}};const cancel=()=>{form.style.display="none";inp.value="";};
  form.querySelector(".btn-del").addEventListener("click",submit);form.querySelector(".btn-cancel").addEventListener("click",cancel);inp.addEventListener("keydown",e=>{if(e.key==="Enter")submit();if(e.key==="Escape")cancel();});
  btn.addEventListener("click",()=>{const vis=form.style.display!=="none";form.style.display=vis?"none":"block";if(!vis)setTimeout(()=>inp.focus(),60);});container.appendChild(btn);container.appendChild(form);
}

async function processarExcelEstoque(file) {
  const arrayBuffer = await file.arrayBuffer();
  const XLSX = await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  // SheetJS ignora col A vazia → índices deslocados -1
  // idx 2=SKU, idx 5=Produto, idx 17=Aptas, idx 15=Transf, idx 14=Pendente

  // Encontra primeira linha com SKU real em idx 2
  let startIdx = 0;
  for (let i = 0; i < raw.length; i++) {
    const v = String(raw[i][2] || "").trim();
    if (v && /[A-Za-z]/.test(v) && !["SKU","Código ML","Status","Boa","Total","Produto"].includes(v)) {
      startIdx = i;
      break;
    }
  }

  const dados = [];
  let lastSku = "";
  for (let i = startIdx; i < raw.length; i++) {
    const row   = raw[i];
    const sku     = String(row[2] || "").trim();
    const produto = String(row[5] || "").trim();

    // SKU vazio mas produto preenchido = célula mesclada no Excel
    // usa SKU da linha anterior ou gera um a partir do produto
    const skuReal = sku || lastSku + "_v2";
    if (sku) lastSku = sku;

    if (!produto) continue;

    const aptas    = Number(row[17]) || 0;
    const transf   = Number(row[15]) || 0;
    const pendente = Number(row[14]) || 0;

    // Só inclui se tem produto válido
    if (!skuReal) continue;

    // Agrega linhas com mesmo SKU (células mescladas aparecem em linhas separadas)
    const existing = dados.find(d => d.sku === skuReal);
    if (existing) {
      existing.aptas    += aptas;
      existing.transf   += transf;
      existing.pendente += pendente;
      existing.vendas30 = (existing.vendas30||0) + (Number(row[10])||0);
    } else {
      const vendas30 = Number(row[10]) || 0;
      dados.push({ sku: skuReal, produto, aptas, transf, pendente, vendas30 });
    }
  }

  estoqueExcelData = { fileName: file.name, rows: dados };
  if (!estoqueBlingData && !estoqueBlingLoading) await fetchBlingProdutos();
  render();
}

// ── BLING /produtos ──────────────────────────────────────────
// ── Parser Matriz RS ──────────────────────────────────────────
async function processarRelatorioMatriz(file) {
  const arrayBuffer = await file.arrayBuffer();
  const XLSX = await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const dados = [];
  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    const sku = String(row[0] || "").trim();
    const produto = String(row[1] || "").trim();
    if (!produto || produto.toLowerCase().includes("totai")) continue;
    const parseNum = v => parseFloat(String(v||"0").replace(/\./g,"").replace(",",".")) || 0;
    const qty = Math.round(parseNum(row[3]));
    const custo = parseNum(row[4]);
    const valor = parseNum(row[5]);
    if (qty <= 0) continue; // só produtos com estoque positivo
    dados.push({ sku: sku || "—", produto, qty, custo, valor });
  }
  return dados;
}

async function fetchBlingProdutos() {
  estoqueBlingLoading = true;
  estoqueBlingErro = null;
  render();

  try {
    const r = await fetch(`${BLING_PROXY}/api/bling-produtos`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    if (data.erro) throw new Error(data.erro);

    // Monta mapa SKU → precoCusto
    const mapa = {};
    (data.data || []).forEach(p => {
      const sku = String(p.codigo || "").trim();
      const custo = Number(p.precoCusto) || 0;
      if (sku) mapa[sku] = custo;
    });

    estoqueBlingData = mapa;
  } catch (e) {
    estoqueBlingErro = e.message;
  }

  estoqueBlingLoading = false;
  render();
}

// ── RENDER CARD ESTOQUE ──────────────────────────────────────
function renderEstoqueTab(panel, color) {

  // ── Abas de localização: Filial SP / Matriz RS ──────────────
  const locWrap = document.createElement("div");
  locWrap.style.cssText = "display:flex;border-bottom:1px solid var(--sep);margin-bottom:14px;";
  ["filial","matriz"].forEach(loc => {
    const btn = document.createElement("button");
    const active = estoqueLoc === loc;
    btn.style.cssText = `padding:8px 16px;background:none;border:none;font-family:inherit;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;color:${active?"var(--text)":"var(--text3)"};border-bottom:2px solid ${active?"var(--text)":"transparent"};margin-bottom:-1px;transition:all 0.15s;`;
    btn.textContent = loc === "filial" ? "Filial SP" : "Matriz RS";
    btn.addEventListener("click", () => { estoqueLoc = loc; render(); });
    locWrap.appendChild(btn);
  });
  panel.appendChild(locWrap);

  if (estoqueLoc === "filial") {
    renderFilialSP(panel, color);
  } else {
    renderMatrizRS(panel, color);
  }
}

function renderFilialSP(panel, color) {
  // ── Upload planilha Full ML ──────────────────────────────────
  const uploadWrap = document.createElement("div");
  uploadWrap.style.cssText = "margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;";

  const uploadLabel = document.createElement("label");
  uploadLabel.style.cssText = `display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:none;border:1px dashed ${color}66;border-radius:5px;color:${color};font-size:10px;letter-spacing:1.5px;cursor:pointer;`;
  uploadLabel.innerHTML = `<span>↑</span><span>Trocar planilha</span>`;
  const fileInput = document.createElement("input");
  fileInput.type = "file"; fileInput.accept = ".xlsx,.xls"; fileInput.style.display = "none";
  fileInput.addEventListener("change", async e => {
    const file = e.target.files[0]; if (!file) return;
    await processarExcelEstoque(file);
  });
  uploadLabel.appendChild(fileInput);
  uploadWrap.appendChild(uploadLabel);

  if (estoqueExcelData?.fileName) {
    const fn = document.createElement("span");
    fn.style.cssText = "font-size:9px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px;";
    fn.textContent = estoqueExcelData.fileName;
    uploadWrap.appendChild(fn);
  }

  // Status Bling
  const blingStatus = document.createElement("div");
  blingStatus.style.cssText = "display:flex;align-items:center;gap:6px;margin-left:auto;font-size:9px;";

  if (estoqueBlingLoading) {
    blingStatus.innerHTML = `<span class="spinning" style="color:var(--text3)">↻</span><span style="color:var(--text3)">Carregando Bling...</span>`;
  } else if (estoqueBlingErro) {
    blingStatus.innerHTML = `<span style="color:#f87171">⚠ Bling: ${estoqueBlingErro}</span>`;
    const authBtn = document.createElement("button");
    authBtn.textContent = "Renovar token";
    authBtn.style.cssText = "background:none;border:1px solid #fbbf2466;color:#fbbf24;border-radius:3px;padding:2px 8px;font-size:9px;cursor:pointer;letter-spacing:1px;margin-left:4px;";
    authBtn.addEventListener("click", () => window.open("https://digoo-backend.vercel.app/api/bling-auth", "_blank"));
    blingStatus.appendChild(authBtn);
  } else if (estoqueBlingData) {
    const count = Object.keys(estoqueBlingData).length;
    blingStatus.innerHTML = `<span style="color:#3dd68c">●</span><span style="color:var(--text3)">${count} SKUs Bling</span>`;
    const refBtn = document.createElement("button");
    refBtn.textContent = "↻";
    refBtn.style.cssText = "background:none;border:1px solid var(--border2);color:var(--text3);border-radius:3px;padding:2px 7px;font-size:10px;cursor:pointer;";
    refBtn.addEventListener("click", () => { estoqueBlingData = null; fetchBlingProdutos(); });
    blingStatus.appendChild(refBtn);
    const renewBtn = document.createElement("button");
    renewBtn.textContent = "Renovar token";
    renewBtn.style.cssText = "background:none;border:1px solid #fbbf2444;color:#fbbf2488;border-radius:3px;padding:2px 8px;font-size:9px;cursor:pointer;letter-spacing:1px;margin-left:4px;";
    renewBtn.addEventListener("click", () => window.open("https://digoo-backend.vercel.app/api/bling-auth", "_blank"));
    blingStatus.appendChild(renewBtn);
  } else {
    blingStatus.innerHTML = `<span style="color:var(--text3)">Bling desconectado</span>`;
    const connectBtn = document.createElement("button");
    connectBtn.textContent = "Conectar";
    connectBtn.style.cssText = "background:none;border:1px solid var(--border2);color:var(--text3);border-radius:3px;padding:2px 8px;font-size:9px;cursor:pointer;letter-spacing:1px;";
    connectBtn.addEventListener("click", () => fetchBlingProdutos());
    blingStatus.appendChild(connectBtn);
    const authBtn = document.createElement("button");
    authBtn.textContent = "Autorizar Bling";
    authBtn.style.cssText = "background:none;border:1px solid #fbbf2466;color:#fbbf24;border-radius:3px;padding:2px 8px;font-size:9px;cursor:pointer;letter-spacing:1px;margin-left:4px;";
    authBtn.addEventListener("click", () => window.open("https://digoo-backend.vercel.app/api/bling-auth", "_blank"));
    blingStatus.appendChild(authBtn);
  }

  uploadWrap.appendChild(blingStatus);
  panel.appendChild(uploadWrap);

  if (!estoqueExcelData || !estoqueExcelData.rows || estoqueExcelData.rows.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "text-align:center;padding:40px 0;color:var(--text3);font-size:11px;";
    empty.textContent = "Importe a planilha Full ML para ver o estoque";
    panel.appendChild(empty);
    return;
  }

  const rows = estoqueExcelData.rows;

  // ── Cards resumo ─────────────────────────────────────────────
  const resumo = document.createElement("div");
  resumo.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;";
  let totalValor = 0, totalAptas = 0, skusSemCusto = 0;
  const temCusto = rows.some(r => estoqueBlingData && estoqueBlingData[r.sku]);
  const enriched = rows.map(r => {
    const custo = estoqueBlingData ? (estoqueBlingData[r.sku] || 0) : null;
    const valor = custo !== null ? r.aptas * custo : null;
    if (custo === 0 || custo === null) skusSemCusto++;
    if (valor !== null) totalValor += valor;
    totalAptas += r.aptas;
    return { ...r, custo, valor };
  });

  [
    { label:"VALOR EM ESTOQUE", value: estoqueBlingData ? `R$ ${totalValor.toLocaleString("pt-BR",{minimumFractionDigits:2})}` : "—", color:"#3dd68c", sub: skusSemCusto > 0 ? `${skusSemCusto} SKUs sem custo` : "todos com custo" },
    { label:"UNIDADES APTAS", value: totalAptas.toLocaleString("pt-BR"), color:"#378ADD", sub:`${rows.length} SKUs` },
    { label:"CUSTO MÉDIO/UN", value: estoqueBlingData && totalAptas > 0 ? `R$ ${(totalValor/totalAptas).toLocaleString("pt-BR",{minimumFractionDigits:2})}` : "—", color:"#7F77DD", sub:"ponderado" },
  ].forEach(s => {
    const card = document.createElement("div");
    card.style.cssText = `background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px 16px;border-top:2px solid ${s.color};`;
    card.innerHTML = `<div style="font-size:10px;color:var(--text3);letter-spacing:2px;margin-bottom:8px;text-transform:uppercase;">${s.label}</div><div style="font-size:24px;font-weight:600;color:${s.color};text-shadow:0 0 16px ${s.color}66;">${s.value}</div><div style="font-size:11px;color:var(--text3);margin-top:4px;">${s.sub}</div>`;
    resumo.appendChild(card);
  });
  panel.appendChild(resumo);

  // ── Sub-abas Estoque / Saúde ──────────────────────────────────
  if (!window._estoqueSubTab) window._estoqueSubTab = "estoque";
  const subTabWrap = document.createElement("div");
  subTabWrap.style.cssText = "display:flex;border-bottom:1px solid var(--sep);margin-bottom:14px;";
  ["estoque","saude"].forEach(st => {
    const btn = document.createElement("button");
    const active = window._estoqueSubTab === st;
    btn.style.cssText = `padding:7px 14px;background:none;border:none;font-family:inherit;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;color:${active?"var(--text)":"var(--text3)"};border-bottom:2px solid ${active?"var(--text)":"transparent"};margin-bottom:-1px;transition:all 0.15s;`;
    btn.textContent = st === "estoque" ? "Estoque" : "Saúde";
    btn.addEventListener("click", () => { window._estoqueSubTab = st; render(); });
    subTabWrap.appendChild(btn);
  });
  panel.appendChild(subTabWrap);

  if (window._estoqueSubTab !== "saude") {
    // ── Tabela estoque ───────────────────────────────────────────
    const tableWrap = document.createElement("div");
    tableWrap.style.cssText = "overflow-x:auto;";
    const table = document.createElement("table");
    table.style.cssText = "width:100%;border-collapse:collapse;";
    table.innerHTML = `<thead><tr style="border-bottom:1px solid var(--sep);">
      <th style="text-align:left;padding:6px 8px;font-size:9px;color:var(--text3);font-weight:400;letter-spacing:1.5px;">SKU</th>
      <th style="text-align:left;padding:6px 8px;font-size:9px;color:var(--text3);font-weight:400;letter-spacing:1.5px;">PRODUTO</th>
      <th style="text-align:center;padding:6px 8px;font-size:9px;color:var(--text3);font-weight:400;letter-spacing:1.5px;">APTAS</th>
      <th style="text-align:center;padding:6px 8px;font-size:9px;color:var(--text3);font-weight:400;letter-spacing:1.5px;">TRANSF</th>
      <th style="text-align:center;padding:6px 8px;font-size:9px;color:var(--text3);font-weight:400;letter-spacing:1.5px;">PEND</th>
      <th style="text-align:right;padding:6px 8px;font-size:9px;color:var(--text3);font-weight:400;letter-spacing:1.5px;">CUSTO</th>
      <th style="text-align:right;padding:6px 8px;font-size:9px;color:var(--text3);font-weight:400;letter-spacing:1.5px;">VALOR</th>
    </tr></thead><tbody id="estoque-tbody"></tbody>`;
    tableWrap.appendChild(table);
    panel.appendChild(tableWrap);

    const tbody = table.querySelector("#estoque-tbody");
    enriched.forEach(r => {
      const semCusto = !r.custo;
      const custoStr = r.custo > 0 ? `R$ ${r.custo.toLocaleString("pt-BR",{minimumFractionDigits:2})}` : `<span style="color:#f87171;font-size:9px;">sem custo</span>`;
      const valorStr = r.valor > 0 ? `R$ ${r.valor.toLocaleString("pt-BR",{minimumFractionDigits:2})}` : "—";
      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid var(--sep2)";
      tr.innerHTML = `
        <td style="padding:8px 8px;color:#e8e8e8;font-size:11px;white-space:nowrap;font-weight:600;">${r.sku}</td>
        <td style="padding:8px 8px;color:var(--text2);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">${r.produto}</td>
        <td style="padding:8px 8px;text-align:center;color:${r.aptas>0?"var(--text)":"var(--text3)"};font-weight:${r.aptas>0?"500":"400"};">${r.aptas||"—"}</td>
        <td style="padding:8px 8px;text-align:center;color:var(--text3);">${r.transf||"—"}</td>
        <td style="padding:8px 8px;text-align:center;color:${r.pendente>0?"#fbbf24":"var(--text3)"};font-weight:${r.pendente>0?"500":"400"};">${r.pendente||"—"}</td>
        <td style="padding:8px 8px;text-align:right;color:${semCusto?"#f87171":"var(--text2)"};">${custoStr}</td>
        <td style="padding:8px 8px;text-align:right;color:${semCusto?"var(--text3)":r.valor>5000?"#3dd68c":r.valor>1000?"#3dd68c":"var(--text2)"};font-weight:500;">${valorStr}</td>`;
      tbody.appendChild(tr);
    });

    if (skusSemCusto > 0 && estoqueBlingData) {
      const warn = document.createElement("div");
      warn.style.cssText = "margin-top:12px;padding:8px 12px;background:#f8711408;border:1px solid #f8711422;border-radius:5px;font-size:10px;color:#f87171;";
      warn.textContent = `⚠ ${skusSemCusto} SKUs sem custo no Bling — verifique o campo "Preço de Custo" no cadastro do produto.`;
      panel.appendChild(warn);
    }
  } else {
    // ── Saúde (filial SP) ────────────────────────────────────────
    renderSaudeChart(panel, enriched.filter(r => r.aptas > 0));
  }
}

function renderMatrizRS(panel, color) {
  // ── Upload relatório Bling Matriz ────────────────────────────
  const uploadWrap = document.createElement("div");
  uploadWrap.style.cssText = "margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;";

  const uploadLabel = document.createElement("label");
  uploadLabel.style.cssText = `display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:none;border:1px dashed ${color}66;border-radius:5px;color:${color};font-size:10px;letter-spacing:1.5px;cursor:pointer;`;
  uploadLabel.innerHTML = `<span>↑</span><span>Trocar relatório</span>`;
  const fileInput = document.createElement("input");
  fileInput.type = "file"; fileInput.accept = ".xlsx,.xls"; fileInput.style.display = "none";
  fileInput.addEventListener("change", async e => {
    const file = e.target.files[0]; if (!file) return;
    matrizFileName = file.name;
    try {
      matrizRows = await processarRelatorioMatriz(file);
      render();
    } catch(err) {
      console.error("Erro ao ler relatório:", err);
    }
  });
  uploadLabel.appendChild(fileInput);
  uploadWrap.appendChild(uploadLabel);

  if (matrizFileName) {
    const fn = document.createElement("span");
    fn.style.cssText = "font-size:9px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px;";
    fn.textContent = matrizFileName;
    uploadWrap.appendChild(fn);
  }
  panel.appendChild(uploadWrap);

  if (!matrizRows || matrizRows.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "text-align:center;padding:40px 0;color:var(--text3);font-size:11px;";
    empty.textContent = "Importe o relatório de estoque do Bling (Matriz RS)";
    panel.appendChild(empty);
    return;
  }

  // ── Cards resumo Matriz ──────────────────────────────────────
  const totalValor = matrizRows.reduce((s,r) => s + r.valor, 0);
  const totalQty   = matrizRows.reduce((s,r) => s + r.qty, 0);
  const custoMedio = totalQty > 0 ? totalValor / totalQty : 0;
  const resumo = document.createElement("div");
  resumo.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;";
  [
    { label:"VALOR EM ESTOQUE", value:`R$ ${totalValor.toLocaleString("pt-BR",{minimumFractionDigits:2})}`, color:"#3dd68c", sub:`${matrizRows.length} SKUs` },
    { label:"UNIDADES", value: totalQty.toLocaleString("pt-BR"), color:"#378ADD", sub:"peças" },
    { label:"CUSTO MÉDIO/UN", value:`R$ ${custoMedio.toLocaleString("pt-BR",{minimumFractionDigits:2})}`, color:"#7F77DD", sub:"ponderado" },
  ].forEach(s => {
    const card = document.createElement("div");
    card.style.cssText = `background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px 16px;border-top:2px solid ${s.color};`;
    card.innerHTML = `<div style="font-size:10px;color:var(--text3);letter-spacing:2px;margin-bottom:8px;text-transform:uppercase;">${s.label}</div><div style="font-size:24px;font-weight:600;color:${s.color};text-shadow:0 0 16px ${s.color}66;">${s.value}</div><div style="font-size:11px;color:var(--text3);margin-top:4px;">${s.sub}</div>`;
    resumo.appendChild(card);
  });
  panel.appendChild(resumo);

  // ── Sub-abas Estoque / Saúde Matriz ──────────────────────────
  if (!window._matrizSubTab) window._matrizSubTab = "estoque";
  const subTabWrap = document.createElement("div");
  subTabWrap.style.cssText = "display:flex;border-bottom:1px solid var(--sep);margin-bottom:14px;";
  ["estoque","saude"].forEach(st => {
    const btn = document.createElement("button");
    const active = window._matrizSubTab === st;
    btn.style.cssText = `padding:7px 14px;background:none;border:none;font-family:inherit;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;color:${active?"var(--text)":"var(--text3)"};border-bottom:2px solid ${active?"var(--text)":"transparent"};margin-bottom:-1px;transition:all 0.15s;`;
    btn.textContent = st === "estoque" ? "Estoque" : "Saúde";
    btn.addEventListener("click", () => { window._matrizSubTab = st; render(); });
    subTabWrap.appendChild(btn);
  });
  panel.appendChild(subTabWrap);

  if (window._matrizSubTab !== "saude") {
    // ── Tabela estoque Matriz ────────────────────────────────────
    const tableWrap = document.createElement("div");
    tableWrap.style.cssText = "overflow-x:auto;";
    const table = document.createElement("table");
    table.style.cssText = "width:100%;border-collapse:collapse;";
    table.innerHTML = `<thead><tr style="border-bottom:1px solid var(--sep);">
      <th style="text-align:left;padding:6px 8px;font-size:9px;color:var(--text3);font-weight:400;letter-spacing:1.5px;">SKU</th>
      <th style="text-align:left;padding:6px 8px;font-size:9px;color:var(--text3);font-weight:400;letter-spacing:1.5px;">PRODUTO</th>
      <th style="text-align:center;padding:6px 8px;font-size:9px;color:var(--text3);font-weight:400;letter-spacing:1.5px;">QTD</th>
      <th style="text-align:right;padding:6px 8px;font-size:9px;color:var(--text3);font-weight:400;letter-spacing:1.5px;">CUSTO</th>
      <th style="text-align:right;padding:6px 8px;font-size:9px;color:var(--text3);font-weight:400;letter-spacing:1.5px;">VALOR</th>
    </tr></thead><tbody></tbody>`;
    tableWrap.appendChild(table);
    panel.appendChild(tableWrap);

    const tbody = table.querySelector("tbody");
    [...matrizRows].sort((a,b) => b.valor - a.valor).forEach(r => {
      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid var(--sep2)";
      tr.innerHTML = `
        <td style="padding:8px 8px;color:#e8e8e8;font-size:11px;white-space:nowrap;font-weight:600;">${r.sku}</td>
        <td style="padding:8px 8px;color:var(--text2);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">${r.produto}</td>
        <td style="padding:8px 8px;text-align:center;color:${r.qty>0?"var(--text)":"var(--text3)"};font-weight:${r.qty>0?"500":"400"};">${r.qty||"—"}</td>
        <td style="padding:8px 8px;text-align:right;color:var(--text2);">${r.custo>0?`R$ ${r.custo.toLocaleString("pt-BR",{minimumFractionDigits:2})}`:"—"}</td>
        <td style="padding:8px 8px;text-align:right;color:${r.valor>5000?"#3dd68c":r.valor>1000?"#3dd68c":"var(--text2)"};font-weight:500;">${r.valor>0?`R$ ${r.valor.toLocaleString("pt-BR",{minimumFractionDigits:2})}`:"—"}</td>`;
      tbody.appendChild(tr);
    });
  } else {
    // ── Saúde Matriz ─────────────────────────────────────────────
    // Usa vendas da filial SP como referência de giro
    const filialVendas = {};
    if (estoqueExcelData?.rows) {
      estoqueExcelData.rows.forEach(r => { filialVendas[r.sku] = r.vendas30 || 0; });
    }
    const matrizEnriched = matrizRows.map(r => ({
      ...r,
      aptas: r.qty,
      vendas30: filialVendas[r.sku] || 0,
      custo: r.custo,
      valor: r.valor,
    }));
    renderSaudeChart(panel, matrizEnriched.filter(r => (r.aptas||r.qty||0) > 0));
  }
}

function renderSaudeChart(panel, enriched) {
  const saudeWrap = document.createElement("div");
  saudeWrap.style.cssText = "font-family:system-ui,-apple-system,sans-serif;";

  // Legenda
  const leg = document.createElement("div");
  leg.style.cssText = "display:flex;gap:14px;margin-bottom:14px;font-size:10px;flex-wrap:wrap;";
  [{c:"#3dd68c",l:"<15d — subir"},{c:"#EF9F27",l:"15–90d — acompanhar"},{c:"#E24B4A",l:">90d — baixar"}].forEach(({c,l}) => {
    const s = document.createElement("span");
    s.style.cssText = "display:flex;align-items:center;gap:4px;color:var(--text3);";
    s.innerHTML = '<span style="width:8px;height:8px;border-radius:2px;background:' + c + ';display:inline-block;flex-shrink:0;"></span>' + l;
    leg.appendChild(s);
  });
  saudeWrap.appendChild(leg);

  // Grade de chips
  const grade = document.createElement("div");
  grade.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;";

  // Card de detalhe (aparece abaixo da grade)
  const detWrap = document.createElement("div");

  const saudeRows = [...enriched].map(r => {
    const vendas30 = Number(r.vendas30) || 0;
    const aptas = Number(r.aptas || r.qty || 0);
    const dias = vendas30 > 0 ? Math.round(aptas / (vendas30 / 30)) : 999;
    return {...r, vendas30, aptas, dias};
  }).sort((a,b) => b.dias - a.dias);

  const cor = d => d.dias <= 15 ? "#3dd68c" : d.dias <= 90 ? "#EF9F27" : "#E24B4A";
  const badgeText = d => d.dias <= 15 ? "↑ SUBIR" : d.dias <= 90 ? "~ ACOMPANHAR" : "↓ BAIXAR";
  const diasLabel = d => d.dias >= 999 ? "sem vendas" : d.dias + "d";

  let activeChip = null;
  let activeDet = null;

  saudeRows.forEach(d => {
    const c = cor(d);
    const chip = document.createElement("div");
    chip.style.cssText = "display:flex;flex-direction:column;gap:3px;padding:8px 10px;border-radius:6px;border:1px solid " + c + "44;background:" + c + "10;cursor:pointer;min-width:110px;transition:all 0.15s;";
    chip.innerHTML =
      '<div style="font-size:9px;color:' + c + ';font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px;">' + d.sku + '</div>' +
      '<div style="font-size:12px;font-weight:600;color:' + c + ';">' + diasLabel(d) + '</div>' +
      '<div style="font-size:9px;color:var(--text3);">R$' + Math.round(d.valor / 1000) + 'k · ' + d.vendas30 + '/mês</div>';

    chip.addEventListener("click", () => {
      if (activeDet) activeDet.remove();
      if (activeChip) activeChip.style.outline = "none";
      if (activeChip === chip) { activeChip = null; activeDet = null; return; }

      chip.style.outline = "2px solid " + c;
      activeChip = chip;

      const msg = d.dias >= 999
        ? "Nenhuma venda nos últimos 30 dias. Avalie promoção ou liquidação."
        : d.dias >= 90
        ? "Com " + d.vendas30 + " vendas/mês e " + d.aptas + " un, leva ~" + d.dias + " dias pra zerar. Considere reduzir o preço."
        : d.dias <= 15
        ? "Acabando rápido. Dura só " + d.dias + " dias. Considere subir o preço ou antecipar reposição."
        : "Giro equilibrado. Com " + d.vendas30 + " vendas/mês dura ~" + d.dias + " dias.";

      const det = document.createElement("div");
      det.style.cssText = "margin-top:12px;padding:12px 16px;background:var(--bg3);border-left:3px solid " + c + ";border-radius:0 8px 8px 0;";
      det.innerHTML =
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">' +
          '<div style="font-size:13px;font-weight:600;color:' + c + ';">' + d.sku + '</div>' +
          '<span style="background:' + c + '22;color:' + c + ';border:1px solid ' + c + '55;border-radius:4px;padding:3px 10px;font-size:10px;letter-spacing:1px;font-weight:500;">' + badgeText(d) + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:10px;">' +
          '<div><div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:3px;">VALOR EM ESTOQUE</div><div style="font-size:16px;font-weight:600;color:' + c + ';">' + (d.valor > 0 ? "R$ " + d.valor.toLocaleString("pt-BR") : "—") + '</div></div>' +
          '<div><div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:3px;">VENDAS 30D</div><div style="font-size:16px;font-weight:500;color:var(--text);">' + d.vendas30 + ' un</div></div>' +
          '<div><div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:3px;">DIAS ESTOQUE</div><div style="font-size:16px;font-weight:600;color:' + c + ';">' + diasLabel(d) + '</div></div>' +
          '<div><div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:3px;">UNIDADES</div><div style="font-size:16px;font-weight:500;color:var(--text);">' + d.aptas + '</div></div>' +
        '</div>' +
        '<div style="font-size:12px;color:var(--text3);line-height:1.6;font-family:system-ui,sans-serif;">' + msg + '</div>';

      detWrap.appendChild(det);
      activeDet = det;
    });

    grade.appendChild(chip);
  });

  saudeWrap.appendChild(grade);
  saudeWrap.appendChild(detWrap);
  panel.appendChild(saudeWrap);
}



document.getElementById("user-label").addEventListener("click",()=>{localStorage.removeItem(STORAGE_KEY);currentUser=null;const s=document.getElementById("identity-screen");s.innerHTML="";s.style.display="flex";setupIdentityScreen();});

const urlParams=new URLSearchParams(window.location.search);
if(urlParams.get("ml_connected")==="1"){window.history.replaceState({},"",window.location.pathname);}
if(urlParams.get("ml_error")){alert("Erro ao conectar ML: "+urlParams.get("ml_error"));window.history.replaceState({},"",window.location.pathname);}

setupIdentityScreen();
</script>
</body>
</html>
