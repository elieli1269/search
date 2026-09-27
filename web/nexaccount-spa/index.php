<?php
// NexAccount Semantic Browser SPA frontend.
// Keep real Groq keys on the server/database; do not hard-code them in this file.
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NexAccount Semantic Browser</title>
  <style>
    :root{--bg:#0b0f19;--panel:#111827;--line:#1f2937;--text:#f8fafc;--muted:#94a3b8;--blue:#3b82f6;--green:#10b981;--danger:#ef4444}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at top,#172554,var(--bg) 45%);color:var(--text);font-family:Inter,system-ui,Segoe UI,sans-serif}.app{height:100vh;display:grid;grid-template-columns:76px 310px 1fr}.rail,.sidebar,.chat{border-right:1px solid var(--line);background:rgba(17,24,39,.84);backdrop-filter:blur(18px)}.rail{display:flex;flex-direction:column;align-items:center;gap:14px;padding:18px 10px}.logo{width:42px;height:42px;border-radius:16px;background:linear-gradient(135deg,var(--blue),var(--green));box-shadow:0 0 34px #10b98155}.rail button,.sidebar button,.composer button{border:0;border-radius:14px;background:#1f2937;color:var(--text);padding:11px 14px;cursor:pointer;font-weight:800}.rail button.active{background:var(--blue)}.sidebar{padding:18px;display:flex;flex-direction:column;gap:14px}.sidebar h2{margin:0;font-size:15px;color:var(--muted);text-transform:uppercase;letter-spacing:.12em}.conversation{padding:12px;border:1px solid var(--line);border-radius:16px;background:#0f172a;cursor:pointer}.conversation.active{border-color:var(--green)}.chat{display:grid;grid-template-rows:auto 1fr auto;border-right:0;background:rgba(11,15,25,.72)}.top{padding:18px 22px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}.messages{overflow:auto;padding:24px;display:flex;flex-direction:column;gap:14px}.msg{max-width:760px;padding:14px 16px;border-radius:18px;line-height:1.5;white-space:pre-wrap}.user{align-self:flex-end;background:#1d4ed8}.assistant{align-self:flex-start;background:#111827;border:1px solid var(--line)}.composer{padding:16px;border-top:1px solid var(--line);display:flex;gap:12px}.composer textarea{flex:1;min-height:62px;resize:vertical;border:1px solid var(--line);border-radius:18px;background:#020617;color:var(--text);padding:14px}.settings{display:none;padding:22px;gap:12px;flex-direction:column}.settings.active{display:flex}.settings input{width:100%;border:1px solid var(--line);border-radius:14px;background:#020617;color:var(--text);padding:12px}.badge{color:var(--green)}
  </style>
</head>
<body>
  <div class="app">
    <nav class="rail"><div class="logo"></div><button id="chatTab" class="active">Chat</button><button id="settingsTab">⚙</button></nav>
    <aside class="sidebar"><h2>Discussions</h2><button id="newConversation">+ Nouvelle discussion</button><div id="conversationList"></div></aside>
    <main class="chat" id="chatView"><header class="top"><strong>NexAccount Chat</strong><span id="mode" class="badge">Mode invité</span></header><section id="messages" class="messages"></section><form id="composer" class="composer"><textarea id="prompt" placeholder="Écris ton message… Entrée pour envoyer"></textarea><button>Envoyer</button></form></main>
    <section class="settings" id="settingsView"><h1>Paramètres</h1><input id="username" placeholder="Nom utilisateur"><input id="email" placeholder="Email"><input id="password" type="password" placeholder="Mot de passe"><input id="groqApiKey" type="password" placeholder="Clé Groq personnelle"><label><input id="studentMode" type="checkbox"> Mode Étudiant</label><button id="login">Connexion</button><button id="register">Inscription</button><button id="saveSettings">Sauver paramètres</button><button id="logout">Déconnexion</button><p id="settingsState"></p></section>
  </div>
  <script>
    const API = 'https://nexaccount.alwaysdata.net/';
    let token = localStorage.getItem('nexaccount_token');
    let activeConversation = null;
    let guestMessages = [];
    const qs = (id) => document.getElementById(id);
    async function api(path, options = {}) {
      const headers = { Accept: 'application/json', ...(options.headers || {}) };
      if (options.body) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(API + path, { ...options, headers });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
      return data;
    }
    function addMessage(sender, content){ const el=document.createElement('div'); el.className=`msg ${sender}`; el.textContent=content; qs('messages').appendChild(el); qs('messages').scrollTop=qs('messages').scrollHeight; }
    async function refreshConversations(){ if(!token){ qs('conversationList').innerHTML='<div class="conversation active">Invité temporaire</div>'; return; } const data=await api('chat.php?action=conversations'); qs('conversationList').innerHTML=(data.conversations||data||[]).map(c=>`<div class="conversation" data-id="${c.id}">${c.title}</div>`).join(''); }
    async function send(prompt){ addMessage('user', prompt); if(!token){ guestMessages.push({role:'user',content:prompt}); addMessage('assistant','Mode invité: configurez une clé côté serveur ou connectez-vous pour sauvegarder.'); return; } const data=await api('chat.php?action=send_message',{method:'POST',body:JSON.stringify({conversation_id:activeConversation,prompt,history:[]})}); addMessage('assistant', data.answer || data.message || data.content || JSON.stringify(data)); await refreshConversations(); }
    qs('composer').addEventListener('submit', e=>{ e.preventDefault(); const p=qs('prompt').value.trim(); if(p){ qs('prompt').value=''; send(p).catch(err=>addMessage('assistant',err.message)); }});
    qs('prompt').addEventListener('keydown', e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); qs('composer').requestSubmit(); }});
    qs('newConversation').onclick=async()=>{ if(!token){ qs('messages').innerHTML=''; guestMessages=[]; return; } const d=await api('chat.php?action=create_conversation',{method:'POST',body:JSON.stringify({title:'Nouvelle discussion'})}); activeConversation=d.id||d.conversation?.id; await refreshConversations(); };
    qs('conversationList').onclick=async(e)=>{ const row=e.target.closest('[data-id]'); if(!row)return; activeConversation=row.dataset.id; qs('messages').innerHTML=''; const d=await api(`chat.php?action=messages&id=${activeConversation}`); (d.messages||d||[]).forEach(m=>addMessage(m.sender,m.content)); };
    qs('login').onclick=async()=>{ const d=await api('auth.php?action=login',{method:'POST',body:JSON.stringify({email:qs('email').value,password:qs('password').value})}); token=d.token; localStorage.setItem('nexaccount_token',token); qs('mode').textContent='Connecté'; await refreshConversations(); };
    qs('register').onclick=async()=>{ const d=await api('auth.php?action=register',{method:'POST',body:JSON.stringify({username:qs('username').value,email:qs('email').value,password:qs('password').value})}); token=d.token; localStorage.setItem('nexaccount_token',token); qs('mode').textContent='Connecté'; await refreshConversations(); };
    qs('saveSettings').onclick=async()=>{ await api('auth.php?action=update_settings',{method:'POST',body:JSON.stringify({groqApiKey:qs('groqApiKey').value,studentMode:qs('studentMode').checked})}); qs('settingsState').textContent='Paramètres enregistrés'; };
    qs('logout').onclick=()=>{ token=null; localStorage.removeItem('nexaccount_token'); qs('mode').textContent='Mode invité'; refreshConversations(); };
    qs('settingsTab').onclick=()=>{ qs('chatView').style.display='none'; qs('settingsView').classList.add('active'); };
    qs('chatTab').onclick=()=>{ qs('chatView').style.display='grid'; qs('settingsView').classList.remove('active'); };
    refreshConversations();
  </script>
</body>
</html>
