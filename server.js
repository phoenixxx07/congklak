/**
 * Congklak Nusantara Multiplayer Server
 * - Serves static game files (HTTP)
 * - Real-time WebSocket server for multi-pair rooms, player registration, and invites
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const db = require('./db');

const PORT = process.env.PORT || 9090;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// HTTP Static Server & REST API for Database
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];

  // Simple REST API to query database
  if (reqPath === '/api/players') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({
      success: true,
      players: db.getAllPlayers()
    }));
    return;
  }

  if (reqPath === '/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({
      success: true,
      totalRegistered: db.getAllPlayers().length,
      onlinePlayers: players.size,
      activeRooms: rooms.size
    }));
    return;
  }

  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  const filePath = path.join(__dirname, reqPath);

  // Security: prevent path traversal outside current dir
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store, no-cache, must-revalidate' });
    fs.createReadStream(filePath).pipe(res);
  });
});

// WebSocket Server
const wss = new WebSocketServer({ server });

// State
// players: Map(playerId -> { socket, playerId, playerName, status: 'available'|'playing'|'in_invite', currentRoomId: null })
const players = new Map();
// rooms: Map(roomId -> { id, p1: playerId, p2: playerId, p1Name, p2Name, startingPlayer, createdAt })
const rooms = new Map();

function findPlayer(query) {
  if (!query) return null;
  const clean = String(query).trim().toLowerCase().replace(/^#/, '');

  // 1. Direct match by ID in active players
  for (const [id, player] of players.entries()) {
    if (String(id).trim().toLowerCase().replace(/^#/, '') === clean) {
      return { ...player, isOnline: true };
    }
  }

  // 2. Match by Player Name in active players
  for (const player of players.values()) {
    if (player.playerName && player.playerName.trim().toLowerCase() === clean) {
      return { ...player, isOnline: true };
    }
  }

  // 3. Partial match by name in active players
  for (const player of players.values()) {
    if (player.playerName && player.playerName.trim().toLowerCase().includes(clean)) {
      return { ...player, isOnline: true };
    }
  }

  // 4. Query Database for registered player
  const dbMatch = db.findPlayer(clean);
  if (dbMatch) {
    return {
      playerId: dbMatch.id,
      playerName: dbMatch.name,
      isOnline: false,
      socket: null,
      dbData: dbMatch
    };
  }

  return null;
}

function broadcastPlayerList() {
  const playerList = [];
  players.forEach(p => {
    playerList.push({
      id: p.playerId,
      name: p.playerName,
      status: p.status
    });
  });

  const waitingSessions = [];
  let activeMatchCount = 0;
  rooms.forEach(r => {
    if (r.p2) {
      activeMatchCount++;
    } else {
      waitingSessions.push({
        sessionId: r.id,
        hostId: r.p1,
        hostName: r.p1Name
      });
    }
  });

  // Recent registered players in DB (offline)
  const allDbPlayers = db.getAllPlayers();
  const offlinePlayers = allDbPlayers
    .filter(dp => !players.has(dp.id))
    .slice(0, 10);

  const payload = JSON.stringify({
    type: 'player_list',
    players: playerList,
    offlinePlayers,
    waitingSessions,
    activeMatchCount
  });

  players.forEach(p => {
    if (p.socket.readyState === WebSocket.OPEN) {
      p.socket.send(payload);
    }
  });
}

function sendTo(playerId, data) {
  const p = players.get(playerId);
  if (p && p.socket.readyState === WebSocket.OPEN) {
    p.socket.send(JSON.stringify(data));
    return true;
  }
  return false;
}

wss.on('connection', (ws) => {
  let boundPlayerId = null;

  ws.on('message', (messageRaw) => {
    let msg;
    try {
      msg = JSON.parse(messageRaw);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      // Create a named Session Room
      case 'create_custom_session': {
        const { sessionId, playerId, playerName } = msg;
        if (!playerId || !sessionId) return;

        if (rooms.has(sessionId)) {
          ws.send(JSON.stringify({
            type: 'session_failed',
            reason: `Sesi ID "${sessionId}" sudah digunakan. Gunakan ID sesi lain!`
          }));
          return;
        }

        const player = players.get(playerId);
        if (player) {
          player.status = 'waiting_session';
          player.currentRoomId = sessionId;
        }

        rooms.set(sessionId, {
          id: sessionId,
          p1: playerId,
          p1Name: playerName,
          p2: null,
          p2Name: null,
          startingPlayer: null
        });

        ws.send(JSON.stringify({
          type: 'session_created_ack',
          sessionId
        }));

        broadcastPlayerList();
        break;
      }

      // Join an existing Session Room by Session ID
      case 'join_custom_session': {
        const { sessionId, playerId, playerName } = msg;
        const room = rooms.get(sessionId);
        const joiner = players.get(playerId);

        if (!room) {
          ws.send(JSON.stringify({
            type: 'session_failed',
            reason: `Sesi ID "${sessionId}" tidak ditemukan.`
          }));
          return;
        }

        if (room.p1 === playerId) {
          ws.send(JSON.stringify({
            type: 'session_failed',
            reason: `Anda adalah pembuat sesi ini. Menunggu lawan masuk...`
          }));
          return;
        }

        if (room.p2) {
          ws.send(JSON.stringify({
            type: 'session_failed',
            reason: `Sesi ID "${sessionId}" sudah penuh.`
          }));
          return;
        }

        const host = players.get(room.p1);
        if (!host || host.socket.readyState !== WebSocket.OPEN) {
          rooms.delete(sessionId);
          ws.send(JSON.stringify({
            type: 'session_failed',
            reason: `Pembuat sesi sudah offline.`
          }));
          broadcastPlayerList();
          return;
        }

        // Room is ready! Host is Bottom (P1), Joiner is Top (P2)
        const startingPlayer = Math.random() < 0.5 ? 'bottom' : 'top';
        room.p2 = playerId;
        room.p2Name = playerName;
        room.startingPlayer = startingPlayer;

        if (joiner) {
          joiner.status = 'playing';
          joiner.currentRoomId = sessionId;
        }
        host.status = 'playing';
        host.currentRoomId = sessionId;

        host.socket.send(JSON.stringify({
          type: 'game_start',
          roomId: sessionId,
          myRole: 'bottom',
          opponent: { id: playerId, name: playerName },
          startingPlayer
        }));

        ws.send(JSON.stringify({
          type: 'game_start',
          roomId: sessionId,
          myRole: 'top',
          opponent: { id: host.playerId, name: host.playerName },
          startingPlayer
        }));

        broadcastPlayerList();
        break;
      }

      // Cancel a waiting session
      case 'cancel_session': {
        const { sessionId, playerId } = msg;
        if (rooms.has(sessionId)) {
          const room = rooms.get(sessionId);
          if (room.p1 === playerId) {
            rooms.delete(sessionId);
            const p = players.get(playerId);
            if (p) {
              p.status = 'available';
              p.currentRoomId = null;
            }
            broadcastPlayerList();
          }
        }
        break;
      }
      // 1. Player registers their name and ID
      case 'register': {
        const { playerId, playerName } = msg;
        if (!playerId || !playerName) return;

        // Save / persist in lightweight database
        const dbPlayer = db.upsertPlayer(playerId, playerName);

        // If player already connected, close old
        if (players.has(playerId)) {
          const old = players.get(playerId);
          if (old.socket !== ws && old.socket.readyState === WebSocket.OPEN) {
            old.socket.close();
          }
        }

        boundPlayerId = playerId;
        players.set(playerId, {
          socket: ws,
          playerId,
          playerName,
          status: 'available',
          currentRoomId: null,
          dbPlayer
        });

        ws.send(JSON.stringify({
          type: 'registered_ack',
          playerId,
          playerName,
          stats: dbPlayer
        }));

        broadcastPlayerList();
        break;
      }

      // 2. Request active player list
      case 'get_players': {
        broadcastPlayerList();
        break;
      }

      // 3. Send invitation to another player
      case 'invite': {
        const { fromId, toId } = msg;
        const sender = findPlayer(fromId) || (boundPlayerId ? players.get(boundPlayerId) : null);
        const target = findPlayer(toId);

        if (!sender) {
          ws.send(JSON.stringify({
            type: 'invite_failed',
            reason: 'Sesi Anda terputus. Silakan segarkan halaman.'
          }));
          return;
        }

        if (!target) {
          ws.send(JSON.stringify({
            type: 'invite_failed',
            reason: `Player dengan ID atau Nama "${toId}" tidak ditemukan di database.`
          }));
          return;
        }

        if (target.playerId === sender.playerId) {
          ws.send(JSON.stringify({
            type: 'invite_failed',
            reason: 'Anda tidak dapat mengundang diri sendiri.'
          }));
          return;
        }

        if (!target.isOnline || !target.socket || target.socket.readyState !== WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'invite_failed',
            reason: `Player "${target.playerName}" (#${target.playerId}) terdaftar di database tetapi sedang offline.`
          }));
          return;
        }

        if (target.status === 'playing') {
          ws.send(JSON.stringify({
            type: 'invite_failed',
            reason: `${target.playerName} sedang bermain di pertandingan lain.`
          }));
          return;
        }

        // Forward invite to target
        target.socket.send(JSON.stringify({
          type: 'incoming_invite',
          fromId: sender.playerId,
          fromName: sender.playerName
        }));

        ws.send(JSON.stringify({
          type: 'invite_sent_ack',
          toId: target.playerId,
          toName: target.playerName
        }));
        break;
      }

      // 4. Respond to invitation (Accept / Reject)
      case 'invite_response': {
        const { fromId, toId, accepted } = msg;
        const responder = findPlayer(fromId) || (boundPlayerId ? players.get(boundPlayerId) : null);
        const inviter = findPlayer(toId);

        if (!inviter || inviter.socket.readyState !== WebSocket.OPEN) {
          if (responder) {
            responder.socket.send(JSON.stringify({
              type: 'info_toast',
              message: 'Pengundang sudah tidak online.'
            }));
          }
          return;
        }

        if (!accepted) {
          inviter.socket.send(JSON.stringify({
            type: 'invite_rejected',
            byName: responder ? responder.playerName : 'Lawan'
          }));
          return;
        }

        // Accepted! Create a new Game Room for this pair
        const roomId = 'room_' + Math.random().toString(36).substring(2, 9);
        const startingPlayer = Math.random() < 0.5 ? 'bottom' : 'top';

        // Inviter is Bottom (Player 1), Responder is Top (Player 2)
        responder.status = 'playing';
        responder.currentRoomId = roomId;
        inviter.status = 'playing';
        inviter.currentRoomId = roomId;

        rooms.set(roomId, {
          id: roomId,
          p1: inviter.playerId,
          p1Name: inviter.playerName,
          p2: responder.playerId,
          p2Name: responder.playerName,
          startingPlayer
        });

        // Notify Inviter (Role: Bottom)
        inviter.socket.send(JSON.stringify({
          type: 'game_start',
          roomId,
          myRole: 'bottom',
          opponent: {
            id: responder.playerId,
            name: responder.playerName
          },
          startingPlayer
        }));

        // Notify Responder (Role: Top)
        responder.socket.send(JSON.stringify({
          type: 'game_start',
          roomId,
          myRole: 'top',
          opponent: {
            id: inviter.playerId,
            name: inviter.playerName
          },
          startingPlayer
        }));

        broadcastPlayerList();
        break;
      }

      // 5. In-game Move synchronization
      case 'game_move': {
        const { roomId, side, index, playerId } = msg;
        const room = rooms.get(roomId);
        if (!room) return;

        // Forward to the other player in this room
        const opponentId = room.p1 === playerId ? room.p2 : room.p1;
        sendTo(opponentId, {
          type: 'opponent_move',
          side,
          index
        });
        break;
      }

      // Animation speed synchronization
      case 'speed_change': {
        const { roomId, playerId, speed } = msg;
        const room = rooms.get(roomId);
        if (!room) return;
        room.speed = speed;
        const opponentId = room.p1 === playerId ? room.p2 : room.p1;
        sendTo(opponentId, { type: 'speed_change', speed });
        break;
      }

      // 6. In-game Chat message
      case 'room_chat': {
        const { roomId, text, senderName, senderId } = msg;
        const room = rooms.get(roomId);
        if (!room) return;

        const opponentId = room.p1 === senderId ? room.p2 : room.p1;
        sendTo(opponentId, {
          type: 'room_chat',
          senderName,
          text
        });
        break;
      }

      // 7. Leave room / Finish match
      case 'leave_room': {
        const { roomId, playerId } = msg;
        const room = rooms.get(roomId);
        if (!room) return;

        const opponentId = room.p1 === playerId ? room.p2 : room.p1;
        sendTo(opponentId, {
          type: 'opponent_left',
          message: 'Lawan telah meninggalkan permainan.'
        });

        const p1 = players.get(room.p1);
        if (p1) { p1.status = 'available'; p1.currentRoomId = null; }
        const p2 = players.get(room.p2);
        if (p2) { p2.status = 'available'; p2.currentRoomId = null; }

        rooms.delete(roomId);
        broadcastPlayerList();
        break;
      }

      // 8. Next Round Progression (Ngacang / Burnt Pits)
      case 'next_round_vote': {
        const { roomId, playerId, roundData } = msg;
        const room = rooms.get(roomId);
        if (!room) return;

        if (!room.nextRoundVotes) {
          room.nextRoundVotes = new Map();
        }
        room.nextRoundVotes.set(playerId, roundData || true);

        const opponentId = room.p1 === playerId ? room.p2 : room.p1;
        sendTo(opponentId, {
          type: 'opponent_voted_next_round'
        });

        // Both players agreed to proceed to next round!
        if (room.nextRoundVotes.size >= 2) {
          room.nextRoundVotes.clear();
          room.round = (room.round || 1) + 1;

          // Compute starting player: winner of previous round goes first (traditional) or random
          const startingPlayer = roundData.winner === 'bottom' ? 'bottom' : (roundData.winner === 'top' ? 'top' : (Math.random() < 0.5 ? 'bottom' : 'top'));

          const nextRoundPayload = {
            type: 'start_next_round',
            roundNumber: room.round,
            burntPits: roundData.burntPits,
            topPits: roundData.topPits,
            bottomPits: roundData.bottomPits,
            storeTop: roundData.storeTop,
            storeBottom: roundData.storeBottom,
            startingPlayer,
            lastRoundSummary: roundData.summary
          };

          sendTo(room.p1, nextRoundPayload);
          sendTo(room.p2, nextRoundPayload);
        }
        break;
      }

      // 9. End Match (both agree to finish)
      case 'end_match': {
        const { roomId, playerId, winner } = msg;
        const room = rooms.get(roomId);
        if (!room) return;

        if (room.p1 && room.p2) {
          db.recordMatchResult(roomId, room.p1, room.p2, winner || 'tie', room.round || 1);
        }

        const sender = players.get(playerId);
        const opponentId = room.p1 === playerId ? room.p2 : room.p1;

        sendTo(opponentId, {
          type: 'match_ended_by_player',
          byName: sender ? sender.playerName : 'Lawan'
        });
        sendTo(playerId, {
          type: 'match_ended_by_player',
          byName: 'Anda'
        });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (boundPlayerId && players.has(boundPlayerId)) {
      const p = players.get(boundPlayerId);
      if (p.currentRoomId && rooms.has(p.currentRoomId)) {
        const room = rooms.get(p.currentRoomId);
        const opponentId = room.p1 === boundPlayerId ? room.p2 : room.p1;
        sendTo(opponentId, {
          type: 'opponent_left',
          message: 'Lawan terputus dari jaringan.'
        });
        const opp = players.get(opponentId);
        if (opp) {
          opp.status = 'available';
          opp.currentRoomId = null;
        }
        rooms.delete(p.currentRoomId);
      }
      players.delete(boundPlayerId);
      broadcastPlayerList();
    }
  });
});

server.listen(PORT, () => {
  console.log(`[Congklak Server] Berjalan di http://localhost:${PORT}`);
});
