const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
app.use(express.static('public'));

const rooms = new Map();

function createNewRoomState() {
    return {
        hostSocketId: null,
        question: '主持人尚未出题...',
        clues: new Map(),
        chatHistory: [],
        clueCounter: 0,
        players: new Map() // 用于追踪玩家
    };
}

io.on('connection', (socket) => {
    socket.on('joinRoom', (roomID) => {
        if (!roomID) return;
        socket.join(roomID);
        console.log(`用户 ${socket.id} 加入了房间 ${roomID}`);

        if (!rooms.has(roomID)) {
            rooms.set(roomID, createNewRoomState());
        }
        const room = rooms.get(roomID);
        
        socket.emit('joinSuccess', { hasHost: !!room.hostSocketId });
    });
    
    socket.on('selectRole', ({ roomID, role }) => {
        if (!rooms.has(roomID)) return;
        const room = rooms.get(roomID);

        if (role === 'host') {
            if (!room.hostSocketId) {
                room.hostSocketId = socket.id;
                const hostName = "主持人";
                room.players.set(socket.id, hostName);

                socket.emit('roleConfirmed', 'host');
                io.to(roomID).emit('hostUpdate', true);
                
                // 优化2：广播主持人就位消息
                const joinMessage = { text: `${hostName} 已就位。`, sender: '系统', role: 'system' };
                room.chatHistory.push(joinMessage);
                io.to(roomID).emit('newMessage', joinMessage);

                console.log(`用户 ${socket.id} 成为了房间 ${roomID} 的主持人`);
            } else {
                socket.emit('roleRejected', 'host');
            }
        } else {
            const playerName = `玩家${Math.floor(1000 + Math.random() * 9000)}`;
            room.players.set(socket.id, playerName);

            socket.emit('roleConfirmed', 'player');
            
            // 优化2：广播新玩家加入消息
            const joinMessage = { text: `${playerName} 已加入游戏。`, sender: '系统', role: 'system' };
            room.chatHistory.push(joinMessage);
            io.to(roomID).emit('newMessage', joinMessage);
        }
        
        const roomStateForClient = {
            question: room.question,
            clues: Array.from(room.clues.values()),
            chatHistory: room.chatHistory,
            // 传递当前玩家自己的名字
            myName: room.players.get(socket.id)
        };
        socket.emit('gameStateSync', roomStateForClient);
    });

    socket.on('updateQuestion', ({ roomID, questionText }) => { if (rooms.has(roomID)) { const room = rooms.get(roomID); if (socket.id === room.hostSocketId) { room.question = questionText; io.to(roomID).emit('questionUpdated', room.question); } } });
    
    socket.on('sendMessage', ({ roomID, messageData }) => { 
        if (rooms.has(roomID)) { 
            const room = rooms.get(roomID);
            // 确保发送者名字是服务器分配的，防止作弊
            messageData.sender = room.players.get(socket.id) || "未知玩家";
            room.chatHistory.push(messageData); 
            io.to(roomID).emit('newMessage', messageData); 
        } 
    });

    socket.on('addClue', ({ roomID, clueText }) => { if (rooms.has(roomID)) { const room = rooms.get(roomID); if (socket.id === room.hostSocketId) { room.clueCounter++; const clueId = `clue-${room.clueCounter}`; room.clues.set(clueId, { id: clueId, text: clueText, highlighted: false }); io.to(roomID).emit('cluesUpdated', Array.from(room.clues.values())); } } });
    socket.on('deleteClue', ({ roomID, clueId }) => { if (rooms.has(roomID)) { const room = rooms.get(roomID); if (socket.id === room.hostSocketId && room.clues.has(clueId)) { room.clues.delete(clueId); io.to(roomID).emit('cluesUpdated', Array.from(room.clues.values())); } } });
    socket.on('toggleHighlightClue', ({ roomID, clueId }) => { if (rooms.has(roomID)) { const room = rooms.get(roomID); if (socket.id === room.hostSocketId && room.clues.has(clueId)) { const clue = room.clues.get(clueId); clue.highlighted = !clue.highlighted; io.to(roomID).emit('cluesUpdated', Array.from(room.clues.values())); } } });
    socket.on('announceResult', ({ roomID, result }) => { if (rooms.has(roomID)) { const room = rooms.get(roomID); if (socket.id === room.hostSocketId) { io.to(roomID).emit('resultAnnounced', result); } } });
    socket.on('resetGame', (roomID) => { if (rooms.has(roomID)) { const room = rooms.get(roomID); if (socket.id === room.hostSocketId) { rooms.delete(roomID); io.to(roomID).emit('gameReset'); console.log(`房间 ${roomID} 已被主持人重置并清除`); } } });
    
    socket.on('disconnect', () => {
        console.log(`用户 ${socket.id} 断开连接`);
        for (const [roomID, room] of rooms.entries()) {
            if (room.players.has(socket.id)) {
                const disconnectedPlayerName = room.players.get(socket.id);
                room.players.delete(socket.id);

                const leaveMessage = { text: `${disconnectedPlayerName} 已离开游戏。`, sender: '系统', role: 'system' };
                room.chatHistory.push(leaveMessage);
                io.to(roomID).emit('newMessage', leaveMessage);

                if (room.hostSocketId === socket.id) {
                    rooms.delete(roomID);
                    io.to(roomID).emit('gameReset');
                    console.log(`房间 ${roomID} 的主持人已断开，房间已重置`);
                }
                break;
            }
        }
    });
});

server.listen(PORT, () => { console.log(`服务器正在监听端口 ${PORT}`); });
