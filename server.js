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

let gameState = { 
    hostSocketId: null, 
    question: '主持人尚未出题...', 
    clues: new Map() 
};
let clueCounter = 0;

function getCluesArray() { 
    return Array.from(gameState.clues.values()); 
}

io.on('connection', (socket) => {
    console.log(`一个用户连接: ${socket.id}`);

    socket.emit('gameStateSync', { 
        question: gameState.question, 
        clues: getCluesArray() 
    });

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

    socket.on('updateQuestion', (questionText) => { 
        if (socket.id === gameState.hostSocketId) { 
            gameState.question = questionText; 
            io.emit('questionUpdated', gameState.question); 
        } 
    });

    socket.on('sendMessage', (messageData) => { 
        io.emit('newMessage', messageData); 
    });

    socket.on('addClue', (clueText) => { 
        if (socket.id === gameState.hostSocketId) { 
            clueCounter++; 
            const clueId = `clue-${clueCounter}`; 
            gameState.clues.set(clueId, { id: clueId, text: clueText, highlighted: false }); 
            io.emit('cluesUpdated', getCluesArray()); 
        } 
    });

    socket.on('deleteClue', (clueId) => { 
        if (socket.id === gameState.hostSocketId) { 
            gameState.clues.delete(clueId); 
            io.emit('cluesUpdated', getCluesArray()); 
        } 
    });

    socket.on('toggleHighlightClue', (clueId) => { 
        if (socket.id === gameState.hostSocketId && gameState.clues.has(clueId)) { 
            const clue = gameState.clues.get(clueId); 
            clue.highlighted = !clue.highlighted; 
            io.emit('cluesUpdated', getCluesArray()); 
        } 
    });

    socket.on('announceResult', (result) => { 
        if (socket.id === gameState.hostSocketId) { 
            io.emit('resultAnnounced', result); 
        } 
    });

    socket.on('resetGame', () => { 
        if (socket.id === gameState.hostSocketId) { 
            gameState.hostSocketId = null; 
            gameState.question = '主持人尚未出题...'; 
            gameState.clues.clear(); 
            clueCounter = 0; 
            io.emit('gameReset'); 
            console.log('游戏已由主持人重置'); 
        } 
    });

    socket.on('disconnect', () => { 
        console.log(`一个用户断开连接: ${socket.id}`); 
        if (socket.id === gameState.hostSocketId) { 
            console.log('主持人已断开连接，游戏重置。'); 
            gameState.hostSocketId = null; 
            io.emit('hostConnected', false); 
        } 
    });
});

server.listen(PORT, () => { 
    console.log(`服务器正在监听端口 ${PORT}`); 
});
