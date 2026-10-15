/**
 * Simple Lightweight JSON Database for Congklak
 * Persists registered player IDs, names, stats, and match history
 */

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'congklak_db.json');

class SimpleDB {
  constructor() {
    this.data = {
      players: {},      // { [id]: { id, name, registeredAt, lastSeen, matches, wins } }
      matchHistory: []  // [ { roomId, p1, p2, winner, rounds, endedAt } ]
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = {
          players: parsed.players || {},
          matchHistory: parsed.matchHistory || []
        };
        console.log(`[DB] Database loaded successfully (${Object.keys(this.data.players).length} players).`);
      } else {
        this.save();
        console.log(`[DB] Created new database file at ${DB_FILE}`);
      }
    } catch (err) {
      console.error('[DB] Error reading database file:', err.message);
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('[DB] Error saving database file:', err.message);
    }
  }

  upsertPlayer(playerId, playerName) {
    if (!playerId) return null;
    const cleanId = String(playerId).trim().toUpperCase().replace(/^#/, '');
    const cleanName = String(playerName || cleanId).trim();

    if (!this.data.players[cleanId]) {
      this.data.players[cleanId] = {
        id: cleanId,
        name: cleanName,
        registeredAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        matches: 0,
        wins: 0
      };
    } else {
      this.data.players[cleanId].name = cleanName;
      this.data.players[cleanId].lastSeen = new Date().toISOString();
    }

    this.save();
    return this.data.players[cleanId];
  }

  getPlayer(playerId) {
    if (!playerId) return null;
    const cleanId = String(playerId).trim().toUpperCase().replace(/^#/, '');
    return this.data.players[cleanId] || null;
  }

  deletePlayer(playerId) {
    if (!playerId) return;
    const cleanId = String(playerId).trim().toUpperCase().replace(/^#/, '');
    if (this.data.players[cleanId]) {
      delete this.data.players[cleanId];
      this.save();
    }
  }

  cleanInactivePlayers(activePlayerIds = []) {
    const activeSet = new Set(activePlayerIds.map(id => String(id).trim().toUpperCase().replace(/^#/, '')));
    let changed = false;
    for (const id of Object.keys(this.data.players)) {
      if (!activeSet.has(id)) {
        delete this.data.players[id];
        changed = true;
      }
    }
    if (changed) {
      this.save();
    }
  }

  findPlayer(query) {
    if (!query) return null;
    const clean = String(query).trim().toLowerCase().replace(/^#/, '');

    // 1. Direct ID match
    for (const [id, player] of Object.entries(this.data.players)) {
      if (id.toLowerCase() === clean) return player;
    }

    // 2. Direct Name match
    for (const player of Object.values(this.data.players)) {
      if (player.name && player.name.trim().toLowerCase() === clean) return player;
    }

    // 3. Partial Name match
    for (const player of Object.values(this.data.players)) {
      if (player.name && player.name.trim().toLowerCase().includes(clean)) return player;
    }

    return null;
  }

  getAllPlayers() {
    return Object.values(this.data.players).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
  }

  recordMatchResult(roomId, p1Id, p2Id, winnerSide, roundCount) {
    const cleanP1 = String(p1Id).trim().toUpperCase().replace(/^#/, '');
    const cleanP2 = String(p2Id).trim().toUpperCase().replace(/^#/, '');

    if (this.data.players[cleanP1]) {
      this.data.players[cleanP1].matches = (this.data.players[cleanP1].matches || 0) + 1;
      if (winnerSide === 'bottom') {
        this.data.players[cleanP1].wins = (this.data.players[cleanP1].wins || 0) + 1;
      }
    }

    if (this.data.players[cleanP2]) {
      this.data.players[cleanP2].matches = (this.data.players[cleanP2].matches || 0) + 1;
      if (winnerSide === 'top') {
        this.data.players[cleanP2].wins = (this.data.players[cleanP2].wins || 0) + 1;
      }
    }

    this.data.matchHistory.push({
      roomId,
      p1: cleanP1,
      p2: cleanP2,
      winner: winnerSide,
      rounds: roundCount,
      endedAt: new Date().toISOString()
    });

    // Keep last 100 matches
    if (this.data.matchHistory.length > 100) {
      this.data.matchHistory.shift();
    }

    this.save();
  }
}

module.exports = new SimpleDB();
