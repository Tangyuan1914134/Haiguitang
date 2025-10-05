const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // 允许来自任何源的连接
    methods: ["GET", "POST"] // 允许的请求方法
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

let gameState = { hostSocketId: null, question: '主持人尚未出题...', clues: new Map() };
let clueCounter = 0;

function getCluesArray() { return Array.from(gameState.clues.values()); }

io.on('connection', (socket) => {
    console.log(`一个用户连接: ${socket.id}`);
    socket.emit('gameStateSync', { question: gameState.question, clues: getCluesArray() });
    socket.on('selectRole', (role) => {
        if (role === 'host' && !gameState.hostSocketId) {
            gameState.hostSocketId = socket.id;
            console.log(`主持人已指定: ${socket.id}`);
            socket.emit('roleConfirmed', 'host');
            io.emit('hostConnected', true);
        } else {
            socket.emit('roleConfirmed', 'player');
        }
    });
    socket.on('updateQuestion', (questionText) => { if (socket.id === gameState.hostSocketId) { gameState.question = questionText; io.emit('questionUpdated', gameState.question); } });
    socket.on('sendMessage', (messageData) => { io.emit('newMessage', messageData); });
    socket.on('addClue', (clueText) => { if (socket.id === gameState.hostSocketId) { clueCounter++; const clueId = `clue-${clueCounter}`; gameState.clues.set(clueId, { id: clueId, text: clueText, highlighted: false }); io.emit('cluesUpdated', getCluesArray()); } });
    socket.on('deleteClue', (clueId) => { if (socket.id === gameState.hostSocketId) { gameState.clues.delete(clueId); io.emit('cluesUpdated', getCluesArray()); } });
    socket.on('toggleHighlightClue', (clueId) => { if (socket.id === gameState.hostSocketId && gameState.clues.has(clueId)) { const clue = gameState.clues.get(clueId); clue.highlighted = !clue.highlighted; io.emit('cluesUpdated', getCluesArray()); } });
    socket.on('announceResult', (result) => { if (socket.id === gameState.hostSocketId) { io.emit('resultAnnounced', result); } });
    socket.on('resetGame', () => { if (socket.id === gameState.hostSocketId) { gameState.hostSocketId = null; gameState.question = '主持人尚未出题...'; gameState.clues.clear(); clueCounter = 0; io.emit('gameReset'); console.log('游戏已由主持人重置'); } });
    socket.on('disconnect', () => { console.log(`一个用户断开连接: ${socket.id}`); if (socket.id === gameState.hostSocketId) { console.log('主持人已断开连接，游戏重置。'); gameState.hostSocketId = null; io.emit('hostConnected', false); } });
});

server.listen(PORT, () => { console.log(`服务器正在监听端口 ${PORT}`); });        question: gameState.question,
        clues: getCluesArray()
    });

    // 监听角色选择
    socket.on('selectRole', (role) => {
        if (role === 'host' && !gameState.hostSocketId) {
            gameState.hostSocketId = socket.id;
            console.log(`主持人已指定: ${socket.id}`);
            socket.emit('roleConfirmed', 'host');
            io.emit('hostConnected', true); // 广播给所有人主持人上线了
        } else {
            socket.emit('roleConfirmed', 'player');
        }
    });

    // 监听主持人更新题目
    socket.on('updateQuestion', (questionText) => {
        if (socket.id === gameState.hostSocketId) {
            gameState.question = questionText;
            io.emit('questionUpdated', gameState.question); // 广播给所有人
        }
    });

    // 监听新消息
    socket.on('sendMessage', (messageData) => {
        // 直接广播消息给所有人
        io.emit('newMessage', messageData);
    });

    // 监听添加线索
    socket.on('addClue', (clueText) => {
        if (socket.id === gameState.hostSocketId) {
            clueCounter++;
            const clueId = `clue-${clueCounter}`;
            gameState.clues.set(clueId, { id: clueId, text: clueText, highlighted: false });
            io.emit('cluesUpdated', getCluesArray()); // 广播更新后的线索列表
        }
    });

    // 监听删除线索
    socket.on('deleteClue', (clueId) => {
        if (socket.id === gameState.hostSocketId) {
            gameState.clues.delete(clueId);
            io.emit('cluesUpdated', getCluesArray());
        }
    });

    // 监听高亮线索
    socket.on('toggleHighlightClue', (clueId) => {
        if (socket.id === gameState.hostSocketId && gameState.clues.has(clueId)) {
            const clue = gameState.clues.get(clueId);
            clue.highlighted = !clue.highlighted;
            io.emit('cluesUpdated', getCluesArray());
        }
    });
    
    // 监听宣布结果
    socket.on('announceResult', (result) => {
        if (socket.id === gameState.hostSocketId) {
            io.emit('resultAnnounced', result);
        }
    });

    // 监听重置游戏
    socket.on('resetGame', () => {
        if (socket.id === gameState.hostSocketId) {
            // 重置服务器状态
            gameState.hostSocketId = null;
            gameState.question = '主持人尚未出题...';
            gameState.clues.clear();
            clueCounter = 0;
            // 通知所有客户端重置
            io.emit('gameReset');
            console.log('游戏已由主持人重置');
        }
    });

    // 监听断开连接
    socket.on('disconnect', () => {
        console.log(`一个用户断开连接: ${socket.id}`);
        if (socket.id === gameState.hostSocketId) {
            // 如果是主持人断开连接，重置游戏
            console.log('主持人已断开连接，游戏重置。');
            gameState.hostSocketId = null;
            io.emit('hostConnected', false); // 通知所有人主持人已掉线
        }
    });
});

server.listen(PORT, () => {
    console.log(`服务器正在监听端口 ${PORT}`);
});
