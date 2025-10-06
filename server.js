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

// 核心改动：用一个Map来管理所有房间，取代了单一的gameState
const rooms = new Map();

// 创建一个新房间的默认数据结构
function createNewRoomState() {
    return {
        hostSocketId: null,
        question: '主持人尚未出题...',
        clues: new Map(),
        chatHistory: [], // 新增：用于存储聊天记录
        clueCounter: 0
    };
}

io.on('connection', (socket) => {
    // 当一个新用户连接时，不再立即同步状态，而是等待他加入房间

    socket.on('joinRoom', (roomID) => {
        if (!roomID) return;

        // 让socket加入Socket.IO的房间
        socket.join(roomID);
        console.log(`用户 ${socket.id} 加入了房间 ${roomID}`);

        // 如果房间不存在，则创建一个新的
        if (!rooms.has(roomID)) {
            rooms.set(roomID, createNewRoomState());
        }

        const room = rooms.get(roomID);
        // 准备要发送给客户端的状态，需要将Map转换为数组
        const roomStateForClient = {
            question: room.question,
            clues: Array.from(room.clues.values()),
            chatHistory: room.chatHistory
        };

        // 告知客户端加入成功，并同步当前房间的所有数据
        socket.emit('joinSuccess', {
            isHostAvailable: room.hostSocketId === null,
            roomState: roomStateForClient
        });
    });
    
    socket.on('becomeHost', (roomID) => {
        if (rooms.has(roomID)) {
            const room = rooms.get(roomID);
            if (!room.hostSocketId) {
                room.hostSocketId = socket.id;
                socket.emit('roleConfirmed', 'host');
                // 广播给房间里的所有人，主持人已就位
                io.to(roomID).emit('hostConnected', true);
                console.log(`用户 ${socket.id} 成为了房间 ${roomID} 的主持人`);
            }
        }
    });

    socket.on('updateQuestion', ({ roomID, questionText }) => {
        if (rooms.has(roomID)) {
            const room = rooms.get(roomID);
            if (socket.id === room.hostSocketId) {
                room.question = questionText;
                io.to(roomID).emit('questionUpdated', room.question);
            }
        }
    });

    socket.on('sendMessage', ({ roomID, messageData }) => {
        if (rooms.has(roomID)) {
            const room = rooms.get(roomID);
            room.chatHistory.push(messageData); // 保存聊天记录
            io.to(roomID).emit('newMessage', messageData);
        }
    });

    socket.on('addClue', ({ roomID, clueText }) => {
        if (rooms.has(roomID)) {
            const room = rooms.get(roomID);
            if (socket.id === room.hostSocketId) {
                room.clueCounter++;
                const clueId = `clue-${room.clueCounter}`;
                room.clues.set(clueId, { id: clueId, text: clueText, highlighted: false });
                io.to(roomID).emit('cluesUpdated', Array.from(room.clues.values()));
            }
        }
    });
    
    socket.on('deleteClue', ({ roomID, clueId }) => {
        if (rooms.has(roomID)) {
            const room = rooms.get(roomID);
            if (socket.id === room.hostSocketId && room.clues.has(clueId)) {
                room.clues.delete(clueId);
                io.to(roomID).emit('cluesUpdated', Array.from(room.clues.values()));
            }
        }
    });

    socket.on('toggleHighlightClue', ({ roomID, clueId }) => {
        if (rooms.has(roomID)) {
            const room = rooms.get(roomID);
            if (socket.id === room.hostSocketId && room.clues.has(clueId)) {
                const clue = room.clues.get(clueId);
                clue.highlighted = !clue.highlighted;
                io.to(roomID).emit('cluesUpdated', Array.from(room.clues.values()));
            }
        }
    });

    socket.on('announceResult', ({ roomID, result }) => {
        if (rooms.has(roomID)) {
            const room = rooms.get(roomID);
            if (socket.id === room.hostSocketId) {
                io.to(roomID).emit('resultAnnounced', result);
            }
        }
    });

    socket.on('resetGame', (roomID) => {
        if (rooms.has(roomID)) {
            const room = rooms.get(roomID);
            if (socket.id === room.hostSocketId) {
                // 彻底删除服务器上的房间数据
                rooms.delete(roomID);
                // 通知房间里的所有客户端游戏已重置
                io.to(roomID).emit('gameReset');
                console.log(`房间 ${roomID} 已被主持人重置并清除`);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`用户 ${socket.id} 断开连接`);
        // 当用户断开连接时，检查他是否是某个房间的主持人
        for (const [roomID, room] of rooms.entries()) {
            if (room.hostSocketId === socket.id) {
                // 如果是主持人，则重置该房间
                rooms.delete(roomID);
                io.to(roomID).emit('gameReset');
                console.log(`房间 ${roomID} 的主持人已断开，房间已重置`);
                break;
            }
        }
    });
});

server.listen(PORT, () => { console.log(`服务器正在监听端口 ${PORT}`); });
