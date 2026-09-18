// =============================================
// EU PONKALA — Socket.IO real-time chat
// =============================================
const { run, get, all } = require('./db');

// Track connected users: userId -> Set of socketIds
const onlineUsers = new Map();

function initSocket(server) {
    const { Server } = require('socket.io');
    const io = new Server(server, {
        cors: { origin: '*', credentials: true }
    });

    io.on('connection', (socket) => {
        console.log('🔌 Socket connected:', socket.id);

        // User announces who they are
        socket.on('register', (userId) => {
            if (!userId) return;
            socket.userId = userId;

            if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
            onlineUsers.get(userId).add(socket.id);

            // Join personal room for direct messaging
            socket.join('user:' + userId);

            // Broadcast online status
            io.emit('user-online', { userId });

            // Send the current online users to the newly connected client
            socket.emit('online-users', Array.from(onlineUsers.keys()));

            console.log(`👤 User ${userId} online (${onlineUsers.get(userId).size} sockets)`);
        });

        // Send a message
        socket.on('send-message', async (payload, ack) => {
            try {
                const { conversation_id, sender_user_id, body } = payload;
                if (!conversation_id || !sender_user_id || !body) {
                    if (ack) ack({ status: 'error', message: 'Missing fields' });
                    return;
                }

                // Save message to DB
                const result = await run(
                    `INSERT INTO messages (conversation_id, sender_user_id, body) VALUES (?, ?, ?)`,
                    [conversation_id, sender_user_id, body]
                );

                // Update conversation's last_message_at
                await run(
                    `UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE conversation_id = ?`,
                    [conversation_id]
                );

                // Fetch the saved message for return
                const message = await get('SELECT * FROM messages WHERE message_id = ?', [result.lastID]);

                // Find participants
                const conv = await get(
                    `SELECT c.*, 
                            su.user_id AS student_user_id,
                            lu.user_id AS landlord_user_id
                     FROM conversations c
                     LEFT JOIN students s ON c.student_id = s.student_id
                     LEFT JOIN users su ON s.user_id = su.user_id
                     LEFT JOIN landlords l ON c.landlord_id = l.landlord_id
                     LEFT JOIN users lu ON l.user_id = lu.user_id
                     WHERE c.conversation_id = ?`,
                    [conversation_id]
                );

                // Broadcast to both parties
                if (conv) {
                    if (conv.student_user_id) {
                        io.to('user:' + conv.student_user_id).emit('new-message', message);
                    }
                    if (conv.landlord_user_id) {
                        io.to('user:' + conv.landlord_user_id).emit('new-message', message);
                    }
                    // Admins get everything
                    io.to('admins').emit('new-message', message);
                }

                if (ack) ack({ status: 'success', data: message });

            } catch (err) {
                console.error('send-message error:', err);
                if (ack) ack({ status: 'error', message: err.message });
            }
        });

        // Mark conversation as read
        socket.on('mark-read', async ({ conversation_id, user_id }) => {
            try {
                await run(
                    `UPDATE messages SET is_read = 1 
                     WHERE conversation_id = ? AND sender_user_id != ? AND is_read = 0`,
                    [conversation_id, user_id]
                );
                io.to('user:' + user_id).emit('messages-read', { conversation_id });
            } catch (err) {
                console.error('mark-read error:', err);
            }
        });

        // Typing indicator
        socket.on('typing', ({ conversation_id, user_id, is_typing }) => {
            socket.broadcast.emit('typing', { conversation_id, user_id, is_typing });
        });

        // Disconnect
        socket.on('disconnect', () => {
            if (socket.userId && onlineUsers.has(socket.userId)) {
                const sockets = onlineUsers.get(socket.userId);
                sockets.delete(socket.id);
                if (sockets.size === 0) {
                    onlineUsers.delete(socket.userId);
                    io.emit('user-offline', { userId: socket.userId });
                }
            }
            console.log('❌ Socket disconnected:', socket.id);
        });
    });

    return io;
}

module.exports = { initSocket, onlineUsers };