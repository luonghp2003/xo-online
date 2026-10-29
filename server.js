const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const rooms = new Map();

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, time: new Date().toISOString() });
});

function normalizeRoomCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 6 }, () => alphabet[crypto.randomInt(0, alphabet.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function makeToken() {
  return crypto.randomBytes(18).toString('base64url');
}

function createRoom(code) {
  const room = {
    code,
    board: Array(9).fill(null),
    turn: 'X',
    winner: null,
    draw: false,
    players: { X: null, O: null },
    rematchVotes: new Set(),
    updatedAt: Date.now()
  };
  rooms.set(code, room);
  return room;
}

function publicRoom(room) {
  return {
    code: room.code,
    board: room.board,
    turn: room.turn,
    winner: room.winner,
    draw: room.draw,
    players: {
      X: room.players.X ? { connected: room.players.X.connected } : null,
      O: room.players.O ? { connected: room.players.O.connected } : null
    },
    rematchVotes: room.rematchVotes.size
  };
}

function findWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { symbol: board[a], line: [a, b, c] };
    }
  }
  return null;
}

function getPlayerByToken(room, token) {
  if (!token) return null;
  if (room.players.X?.token === token) return { symbol: 'X', player: room.players.X };
  if (room.players.O?.token === token) return { symbol: 'O', player: room.players.O };
  return null;
}

function emitRoom(room) {
  io.to(room.code).emit('room_state', publicRoom(room));
}

function maybeDeleteRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const noPlayersConnected = ['X', 'O'].every((s) => !room.players[s] || !room.players[s].connected);
  if (noPlayersConnected && Date.now() - room.updatedAt > 30 * 60 * 1000) {
    rooms.delete(roomCode);
  }
}

setInterval(() => {
  for (const code of rooms.keys()) maybeDeleteRoom(code);
}, 5 * 60 * 1000).unref();

io.on('connection', (socket) => {
  socket.on('create_room', (payload = {}, callback = () => {}) => {
    try {
      const code = makeRoomCode();
      const room = createRoom(code);
      const token = makeToken();
      room.players.X = { token, socketId: socket.id, connected: true };
      room.updatedAt = Date.now();
      socket.join(code);
      socket.data.roomCode = code;
      socket.data.symbol = 'X';
      callback({ ok: true, code, symbol: 'X', token, room: publicRoom(room) });
      emitRoom(room);
    } catch (err) {
      callback({ ok: false, message: 'Không thể tạo phòng.' });
    }
  });

  socket.on('join_room', (payload = {}, callback = () => {}) => {
    const code = normalizeRoomCode(payload.code);
    const existingToken = String(payload.token || '');
    const room = rooms.get(code);

    if (!room) {
      callback({ ok: false, message: 'Không tìm thấy phòng này.' });
      return;
    }

    const known = getPlayerByToken(room, existingToken);
    if (known) {
      known.player.socketId = socket.id;
      known.player.connected = true;
      socket.join(code);
      socket.data.roomCode = code;
      socket.data.symbol = known.symbol;
      room.updatedAt = Date.now();
      callback({ ok: true, code, symbol: known.symbol, token: existingToken, room: publicRoom(room) });
      emitRoom(room);
      return;
    }

    let symbol = null;
    if (!room.players.X) symbol = 'X';
    else if (!room.players.O) symbol = 'O';

    if (!symbol) {
      callback({ ok: false, message: 'Phòng đã đủ 2 người.' });
      return;
    }

    const token = makeToken();
    room.players[symbol] = { token, socketId: socket.id, connected: true };
    room.updatedAt = Date.now();
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.symbol = symbol;
    callback({ ok: true, code, symbol, token, room: publicRoom(room) });
    emitRoom(room);
  });

  socket.on('play_move', (payload = {}, callback = () => {}) => {
    const code = normalizeRoomCode(socket.data.roomCode);
    const symbol = socket.data.symbol;
    const index = Number(payload.index);
    const room = rooms.get(code);

    if (!room || !symbol || !Number.isInteger(index) || index < 0 || index > 8) {
      callback({ ok: false, message: 'Nước đi không hợp lệ.' });
      return;
    }

    const player = room.players[symbol];
    if (!player || player.socketId !== socket.id || !player.connected) {
      callback({ ok: false, message: 'Phiên người chơi không hợp lệ.' });
      return;
    }

    if (!room.players.X || !room.players.O || !room.players.X.connected || !room.players.O.connected) {
      callback({ ok: false, message: 'Cần đủ 2 người đang kết nối để chơi.' });
      return;
    }

    if (room.winner || room.draw) {
      callback({ ok: false, message: 'Ván chơi đã kết thúc.' });
      return;
    }

    if (room.turn !== symbol) {
      callback({ ok: false, message: 'Chưa đến lượt của bạn.' });
      return;
    }

    if (room.board[index]) {
      callback({ ok: false, message: 'Ô này đã được đánh.' });
      return;
    }

    room.board[index] = symbol;
    const result = findWinner(room.board);
    if (result) {
      room.winner = result;
    } else if (room.board.every(Boolean)) {
      room.draw = true;
    } else {
      room.turn = symbol === 'X' ? 'O' : 'X';
    }

    room.rematchVotes.clear();
    room.updatedAt = Date.now();
    callback({ ok: true });
    emitRoom(room);
  });

  socket.on('rematch', (_payload = {}, callback = () => {}) => {
    const code = normalizeRoomCode(socket.data.roomCode);
    const symbol = socket.data.symbol;
    const room = rooms.get(code);

    if (!room || !symbol || !room.players[symbol]) {
      callback({ ok: false, message: 'Không còn ở trong phòng.' });
      return;
    }

    room.rematchVotes.add(symbol);
    room.updatedAt = Date.now();

    if (room.rematchVotes.has('X') && room.rematchVotes.has('O')) {
      room.board = Array(9).fill(null);
      room.winner = null;
      room.draw = false;
      room.turn = Math.random() < 0.5 ? 'X' : 'O';
      room.rematchVotes.clear();
    }

    callback({ ok: true });
    emitRoom(room);
  });

  socket.on('leave_room', (_payload = {}, callback = () => {}) => {
    const code = normalizeRoomCode(socket.data.roomCode);
    const symbol = socket.data.symbol;
    const room = rooms.get(code);
    if (room && symbol && room.players[symbol]?.socketId === socket.id) {
      room.players[symbol] = null;
      room.rematchVotes.delete(symbol);
      room.updatedAt = Date.now();
      socket.leave(code);
      socket.data.roomCode = null;
      socket.data.symbol = null;
      emitRoom(room);
    }
    callback({ ok: true });
  });

  socket.on('disconnect', () => {
    const code = normalizeRoomCode(socket.data.roomCode);
    const symbol = socket.data.symbol;
    const room = rooms.get(code);
    if (!room || !symbol) return;
    const player = room.players[symbol];
    if (player && player.socketId === socket.id) {
      player.connected = false;
      room.updatedAt = Date.now();
      emitRoom(room);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`XO Online dang chay tai http://localhost:${PORT}`);
});
