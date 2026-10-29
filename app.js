const socket = io();

const state = {
  roomCode: null,
  symbol: null,
  token: null,
  room: null
};

const el = {
  lobbyView: document.getElementById('lobbyView'),
  gameView: document.getElementById('gameView'),
  connectionBadge: document.getElementById('connectionBadge'),
  createRoomBtn: document.getElementById('createRoomBtn'),
  joinForm: document.getElementById('joinForm'),
  roomCodeInput: document.getElementById('roomCodeInput'),
  roomCodeText: document.getElementById('roomCodeText'),
  copyLinkBtn: document.getElementById('copyLinkBtn'),
  leaveBtn: document.getElementById('leaveBtn'),
  xStatus: document.getElementById('xStatus'),
  oStatus: document.getElementById('oStatus'),
  playerXBox: document.getElementById('playerXBox'),
  playerOBox: document.getElementById('playerOBox'),
  mySymbol: document.getElementById('mySymbol'),
  gameStatus: document.getElementById('gameStatus'),
  board: document.getElementById('board'),
  cells: Array.from(document.querySelectorAll('.cell')),
  rematchBtn: document.getElementById('rematchBtn'),
  toast: document.getElementById('toast')
};

function cleanCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function tokenKey(code) {
  return `xo-token:${code}`;
}

function showToast(message) {
  el.toast.textContent = message || '';
  if (!message) return;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    if (el.toast.textContent === message) el.toast.textContent = '';
  }, 2600);
}

function setInGame(inGame) {
  el.lobbyView.classList.toggle('hidden', inGame);
  el.gameView.classList.toggle('hidden', !inGame);
}

function updateUrl(code) {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  history.replaceState(null, '', url);
}

function joinRoom(code) {
  const cleaned = cleanCode(code);
  if (cleaned.length !== 6) {
    showToast('Mã phòng phải có 6 ký tự.');
    return;
  }

  const savedToken = localStorage.getItem(tokenKey(cleaned)) || '';
  socket.emit('join_room', { code: cleaned, token: savedToken }, (result) => {
    if (!result?.ok) {
      showToast(result?.message || 'Không thể vào phòng.');
      return;
    }
    enterRoom(result);
  });
}

function enterRoom(result) {
  state.roomCode = result.code;
  state.symbol = result.symbol;
  state.token = result.token;
  state.room = result.room;
  localStorage.setItem(tokenKey(result.code), result.token);
  el.roomCodeText.textContent = result.code;
  el.mySymbol.textContent = result.symbol;
  setInGame(true);
  updateUrl(result.code);
  renderRoom();
}

function roomIsReady() {
  return Boolean(state.room?.players?.X?.connected && state.room?.players?.O?.connected);
}

function renderRoom() {
  if (!state.room) return;
  const room = state.room;
  const ready = roomIsReady();

  el.xStatus.textContent = room.players.X ? (room.players.X.connected ? 'Đã kết nối' : 'Mất kết nối') : 'Chưa vào';
  el.oStatus.textContent = room.players.O ? (room.players.O.connected ? 'Đã kết nối' : 'Mất kết nối') : 'Chưa vào';
  el.playerXBox.classList.toggle('active', room.turn === 'X' && ready && !room.winner && !room.draw);
  el.playerOBox.classList.toggle('active', room.turn === 'O' && ready && !room.winner && !room.draw);

  const winningLine = room.winner?.line || [];
  el.cells.forEach((cell, index) => {
    const value = room.board[index];
    cell.textContent = value || '';
    cell.classList.toggle('x', value === 'X');
    cell.classList.toggle('o', value === 'O');
    cell.classList.toggle('win', winningLine.includes(index));
    cell.disabled = !ready || Boolean(value) || Boolean(room.winner) || room.draw || room.turn !== state.symbol;
  });

  if (!ready) {
    el.gameStatus.textContent = 'Đang chờ đủ 2 người chơi...';
  } else if (room.winner) {
    el.gameStatus.textContent = room.winner.symbol === state.symbol ? 'Bạn thắng! 🎉' : `Người chơi ${room.winner.symbol} thắng.`;
  } else if (room.draw) {
    el.gameStatus.textContent = 'Hòa!';
  } else if (room.turn === state.symbol) {
    el.gameStatus.textContent = 'Đến lượt bạn.';
  } else {
    el.gameStatus.textContent = `Đang chờ người chơi ${room.turn}...`;
  }

  const ended = Boolean(room.winner || room.draw);
  el.rematchBtn.disabled = !ended || !ready;
  el.rematchBtn.textContent = room.rematchVotes > 0 ? `Chơi lại (${room.rematchVotes}/2)` : 'Chơi lại';
}

el.createRoomBtn.addEventListener('click', () => {
  socket.emit('create_room', {}, (result) => {
    if (!result?.ok) {
      showToast(result?.message || 'Không thể tạo phòng.');
      return;
    }
    enterRoom(result);
  });
});

el.joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  joinRoom(el.roomCodeInput.value);
});

el.roomCodeInput.addEventListener('input', () => {
  el.roomCodeInput.value = cleanCode(el.roomCodeInput.value);
});

el.cells.forEach((cell) => {
  cell.addEventListener('click', () => {
    const index = Number(cell.dataset.index);
    socket.emit('play_move', { index }, (result) => {
      if (!result?.ok) showToast(result?.message || 'Không thể đánh ô này.');
    });
  });
});

el.rematchBtn.addEventListener('click', () => {
  socket.emit('rematch', {}, (result) => {
    if (!result?.ok) showToast(result?.message || 'Không thể yêu cầu chơi lại.');
  });
});

el.leaveBtn.addEventListener('click', () => {
  socket.emit('leave_room', {}, () => {
    state.roomCode = null;
    state.symbol = null;
    state.token = null;
    state.room = null;
    updateUrl(null);
    setInGame(false);
  });
});

el.copyLinkBtn.addEventListener('click', async () => {
  const url = new URL(window.location.href);
  url.searchParams.set('room', state.roomCode);
  try {
    await navigator.clipboard.writeText(url.toString());
    showToast('Đã sao chép link mời.');
  } catch {
    showToast(url.toString());
  }
});

socket.on('room_state', (room) => {
  if (!state.roomCode || room.code !== state.roomCode) return;
  state.room = room;
  renderRoom();
});

socket.on('connect', () => {
  el.connectionBadge.textContent = 'Đã kết nối';
  el.connectionBadge.className = 'badge online';
  if (state.roomCode && state.token) {
    socket.emit('join_room', { code: state.roomCode, token: state.token }, (result) => {
      if (result?.ok) enterRoom(result);
    });
  }
});

socket.on('disconnect', () => {
  el.connectionBadge.textContent = 'Mất kết nối';
  el.connectionBadge.className = 'badge offline';
});

const roomFromUrl = cleanCode(new URL(window.location.href).searchParams.get('room'));
if (roomFromUrl.length === 6) {
  el.roomCodeInput.value = roomFromUrl;
  joinRoom(roomFromUrl);
}
