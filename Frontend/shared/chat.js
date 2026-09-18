// =============================================
// EU PONKALA — Shared Chat Widget (v2.2)
// Include with:
//   <script src="/socket.io/socket.io.js"></script>
//   <script src="/shared/chat.js"></script>
//   <script>EU_CHAT.init({ userId, userType });</script>
// =============================================
window.EU_CHAT = (function () {
    let socket = null;
    let userId = null;
    let userType = null;
    let conversations = [];
    let activeConvId = null;
    let panelOpen = false;

    // ─── Build the DOM once ───
    function buildWidget() {
        if (document.getElementById('euChatBtn')) return;

        const html = `
            <div id="euChatBtn" class="eu-chat-btn" onclick="EU_CHAT.toggle()">
                <i class="fas fa-comment-dots"></i>
                <span id="euChatBadge" class="eu-chat-badge" style="display:none;">0</span>
            </div>

            <div id="euChatPanel" class="eu-chat-panel">
                <div class="eu-chat-header">
                    <div>
                        <div style="font-weight:700;font-size:15px;">Messages</div>
                        <div style="font-size:12px;opacity:0.7;" id="euChatHeaderSub">Chat with landlords &amp; students</div>
                    </div>
                    <button onclick="EU_CHAT.close()" style="background:none;border:none;color:white;font-size:18px;cursor:pointer;">✕</button>
                </div>

                <div class="eu-chat-body">
                    <div id="euChatList" class="eu-chat-list"></div>

                    <div id="euChatRoom" class="eu-chat-room" style="display:none;">
                        <div class="eu-chat-room-header">
                            <button onclick="EU_CHAT.backToList()" style="background:none;border:none;color:#f5a623;font-size:20px;cursor:pointer;">‹</button>
                            <div>
                                <div style="font-weight:700;font-size:14px;" id="euChatRoomName">Conversation</div>
                                <div style="font-size:11px;color:#6b7280;" id="euChatRoomSub"></div>
                            </div>
                        </div>

                        <div id="euChatMessages" class="eu-chat-messages"></div>

                        <div class="eu-chat-input">
                            <input id="euChatInput" type="text" placeholder="Type a message…" onkeypress="if(event.key==='Enter')EU_CHAT.send()">
                            <button onclick="EU_CHAT.send()"><i class="fas fa-paper-plane"></i></button>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .eu-chat-btn {
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #f5a623, #d4951f);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 26px;
                    cursor: pointer;
                    box-shadow: 0 10px 30px rgba(245,166,35,0.45);
                    z-index: 9998;
                    transition: 0.3s;
                }
                .eu-chat-btn:hover { transform: scale(1.08); box-shadow: 0 14px 40px rgba(245,166,35,0.6); }
                .eu-chat-badge {
                    position: absolute;
                    top: -4px;
                    right: -4px;
                    background: #dc2626;
                    color: white;
                    font-size: 11px;
                    font-weight: 700;
                    padding: 2px 8px;
                    border-radius: 20px;
                    border: 2px solid white;
                }
                .eu-chat-panel {
                    position: fixed;
                    bottom: 96px;
                    right: 24px;
                    width: 380px;
                    max-width: calc(100vw - 32px);
                    height: 540px;
                    max-height: calc(100vh - 130px);
                    background: white;
                    border-radius: 20px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
                    display: none;
                    flex-direction: column;
                    overflow: hidden;
                    z-index: 9999;
                    animation: euChatIn 0.25s ease;
                }
                .eu-chat-panel.open { display: flex; }
                @keyframes euChatIn {
                    from { opacity: 0; transform: translateY(20px) scale(0.96); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .eu-chat-header {
                    background: linear-gradient(135deg, #0f0c29, #302b63);
                    color: white;
                    padding: 16px 20px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .eu-chat-body { flex: 1; overflow: hidden; position: relative; }
                .eu-chat-list { padding: 8px; height: 100%; overflow-y: auto; }
                .eu-chat-conv {
                    padding: 12px 14px;
                    border-radius: 12px;
                    cursor: pointer;
                    transition: 0.2s;
                    margin-bottom: 4px;
                    display: flex;
                    justify-content: space-between;
                    gap: 10px;
                }
                .eu-chat-conv:hover { background: #f8f9fa; }
                .eu-chat-conv.active { background: #fef3c7; }
                .eu-chat-conv .info .name { font-weight: 700; font-size: 14px; color: #0f0c29; }
                .eu-chat-conv .info .last { font-size: 12px; color: #6b7280; margin-top: 2px; }
                .eu-chat-conv .unread {
                    background: #dc2626; color: white;
                    font-size: 10px; font-weight: 700;
                    padding: 2px 8px; border-radius: 20px;
                    align-self: center;
                }
                .eu-chat-room { height: 100%; display: flex; flex-direction: column; }
                .eu-chat-room-header {
                    padding: 12px 16px;
                    border-bottom: 1px solid #eef2f6;
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }
                .eu-chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 16px;
                    background: #f8f9fa;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .eu-msg {
                    max-width: 75%;
                    padding: 10px 14px;
                    border-radius: 16px;
                    font-size: 14px;
                    line-height: 1.5;
                    word-wrap: break-word;
                }
                .eu-msg.mine {
                    background: #f5a623;
                    color: white;
                    align-self: flex-end;
                    border-bottom-right-radius: 4px;
                }
                .eu-msg.theirs {
                    background: white;
                    color: #1a1a2e;
                    align-self: flex-start;
                    border-bottom-left-radius: 4px;
                    border: 1px solid #eef2f6;
                }
                .eu-msg .meta {
                    font-size: 10px;
                    opacity: 0.7;
                    margin-top: 4px;
                }
                .eu-chat-input {
                    display: flex;
                    padding: 10px 12px;
                    gap: 8px;
                    border-top: 1px solid #eef2f6;
                    background: white;
                }
                .eu-chat-input input {
                    flex: 1;
                    padding: 10px 14px;
                    border: 1px solid #eef2f6;
                    border-radius: 12px;
                    font-size: 14px;
                    font-family: inherit;
                    outline: none;
                }
                .eu-chat-input input:focus { border-color: #f5a623; }
                .eu-chat-input button {
                    background: #f5a623;
                    color: white;
                    border: none;
                    border-radius: 12px;
                    padding: 0 16px;
                    cursor: pointer;
                    transition: 0.2s;
                }
                .eu-chat-input button:hover { background: #d4951f; }
                @media (max-width: 480px) {
                    .eu-chat-btn { bottom: 16px; right: 16px; width: 54px; height: 54px; font-size: 22px; }
                    .eu-chat-panel { bottom: 80px; right: 16px; width: calc(100vw - 32px); height: calc(100vh - 130px); }
                }
            </style>
        `;

        const div = document.createElement('div');
        div.innerHTML = html;
        while (div.firstChild) document.body.appendChild(div.firstChild);
    }

    // ─── Connect to socket ───
    function connectSocket() {
        if (typeof io === 'undefined') {
            console.warn('Socket.IO client not loaded — chat will use REST fallback');
            return;
        }
        socket = io();

        socket.on('connect', () => {
            console.log('💬 Chat socket connected');
            socket.emit('register', userId);
        });

        socket.on('new-message', (msg) => {
            if (msg.conversation_id === activeConvId) {
                appendMessage(msg);
                socket.emit('mark-read', { conversation_id: activeConvId, user_id: userId });
            }
            loadConversations();
        });

        socket.on('messages-read', () => loadConversations());
    }

    // ─── Load conversation list ───
    async function loadConversations() {
        if (!userId) return;
        try {
            const res = await fetch(`/api/conversations/${userId}`);
            const data = await res.json();
            conversations = data.data || [];
            renderConversations();
            updateBadge();
        } catch (e) { console.error(e); }
    }

    function renderConversations() {
        const list = document.getElementById('euChatList');
        if (!list) return;

        if (!conversations.length) {
            list.innerHTML = '<div style="padding:32px;text-align:center;color:#9ca3af;font-size:14px;">No conversations yet.<br/><br/>Start one from any property.</div>';
            return;
        }

        list.innerHTML = '';
        conversations.forEach(c => {
            const div = document.createElement('div');
            div.className = 'eu-chat-conv' + (c.conversation_id === activeConvId ? ' active' : '');
            div.onclick = () => openConversation(c);
            const preview = c.last_message ? c.last_message.slice(0, 40) + (c.last_message.length > 40 ? '…' : '') : 'No messages yet';
            div.innerHTML = `
                <div class="info">
                    <div class="name">${c.other_name || 'Conversation'}</div>
                    <div class="last">${preview}</div>
                </div>
                ${c.unread > 0 ? `<div class="unread">${c.unread}</div>` : ''}
            `;
            list.appendChild(div);
        });
    }

    // ─── Open a conversation ───
    async function openConversation(c) {
        activeConvId = c.conversation_id;
        document.getElementById('euChatList').style.display = 'none';
        document.getElementById('euChatRoom').style.display = 'flex';
        document.getElementById('euChatRoomName').textContent = c.other_name || 'Conversation';
        document.getElementById('euChatRoomSub').textContent = c.property_name || '';

        const res = await fetch(`/api/conversations/${c.conversation_id}/messages`);
        const data = await res.json();
        const messages = data.data || [];

        const container = document.getElementById('euChatMessages');
        container.innerHTML = '';
        messages.forEach(m => appendMessage(m, true));
        container.scrollTop = container.scrollHeight;

        if (socket) socket.emit('mark-read', { conversation_id: c.conversation_id, user_id: userId });
    }

    function appendMessage(m, skipScroll) {
        const container = document.getElementById('euChatMessages');
        if (!container) return;
        const mine = m.sender_user_id == userId;
        const div = document.createElement('div');
        div.className = 'eu-msg ' + (mine ? 'mine' : 'theirs');
        const time = new Date(m.sent_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        div.innerHTML = `${m.body}<div class="meta">${time}</div>`;
        container.appendChild(div);
        if (!skipScroll) container.scrollTop = container.scrollHeight;
    }

    // ─── Send message ───
    function send() {
        const input = document.getElementById('euChatInput');
        const body = input.value.trim();
        if (!body || !activeConvId) return;

        if (socket) {
            socket.emit('send-message', {
                conversation_id: activeConvId,
                sender_user_id: userId,
                body
            }, (ack) => {
                if (ack && ack.status === 'error') console.error('Send failed:', ack.message);
            });
        } else {
            fetch(`/api/conversations/${activeConvId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sender_user_id: userId, body })
            }).then(() => loadMessagesREST());
        }

        input.value = '';
    }

    async function loadMessagesREST() {
        if (!activeConvId) return;
        const res = await fetch(`/api/conversations/${activeConvId}/messages`);
        const data = await res.json();
        const container = document.getElementById('euChatMessages');
        container.innerHTML = '';
        (data.data || []).forEach(m => appendMessage(m, true));
        container.scrollTop = container.scrollHeight;
    }

    // ─── UI helpers ───
    function toggle() {
        panelOpen = !panelOpen;
        document.getElementById('euChatPanel').classList.toggle('open', panelOpen);
        if (panelOpen) loadConversations();
    }
    function close() {
        panelOpen = false;
        document.getElementById('euChatPanel').classList.remove('open');
    }
    function backToList() {
        activeConvId = null;
        document.getElementById('euChatList').style.display = 'block';
        document.getElementById('euChatRoom').style.display = 'none';
        loadConversations();
    }

    async function updateBadge() {
        try {
            const res = await fetch(`/api/messages/unread/${userId}`);
            const data = await res.json();
            const badge = document.getElementById('euChatBadge');
            if (!badge) return;
            if (data.count > 0) {
                badge.textContent = data.count;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        } catch (e) {}
    }

    // ─── Public API ───
    function init(opts) {
        userId = opts.userId;
        userType = opts.userType;
        buildWidget();
        connectSocket();
        loadConversations();
        setInterval(updateBadge, 30000);
    }

    async function startConversation(landlordUserId, propertyId, subject) {
        const res = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_user_id: userId,
                landlord_user_id: landlordUserId,
                property_id: propertyId,
                subject
            })
        });
        const data = await res.json();
        if (data.status === 'success') {
            close();
            setTimeout(() => { toggle(); openConversation(data.data); }, 100);
        }
        return data.data;
    }

    return { init, toggle, close, backToList, send, loadConversations, startConversation };
})();