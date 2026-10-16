/**
 * Congklak Nusantara 1 vs 1 Game Engine & Real-Time Multiplayer
 * Features:
 * - POV (Point of View) Architecture:
 *   - Mode di Tempat: Sudut pandang tetap Atas (Player 2) & Bawah (Player 1)
 *   - Mode Online/Undangan: SEMUA player melihat baris miliknya di BAWAH!
 * - Player Name & ID registration (saved in localStorage)
 * - Mabar Jarak Jauh / Beda Tempat support (LAN Wi-Fi IP & Share link generator)
 * - Real-time WebSocket Lobby & Player List
 * - Direct invitations by Player ID or through Online Lobby
 * - Multi-pair concurrent rooms support
 * - Sowing rules with Clockwise rotation, Extra turns, and BOOM / NEMBAK captures
 * - Multi-Round Ngacang / Burnt Pits (Lubang Terbakar/Hangus) for loser of previous round
 *   - Loser's pits that cannot be filled to full 7 are burnt/closed and skipped during sowing
 *   - Leftover shells of loser go to the winner's storehouse
 *   - Continues round after round until both players agree to stop
 */

class CongklakGame {
  constructor() {
    // Player Profile
    this.playerId = localStorage.getItem('congklak_playerId') || '';
    this.playerName = localStorage.getItem('congklak_playerName') || '';

    // Match & Round state
    this.currentRound = 1;
    this.burntPits = {
      top: [false, false, false, false, false, false, false],
      bottom: [false, false, false, false, false, false, false]
    };
    this.nextRoundData = null;

    // Board state
    this.topPits = [7, 7, 7, 7, 7, 7, 7];
    this.bottomPits = [7, 7, 7, 7, 7, 7, 7];
    this.storeTop = 0;       // Right storehouse (Player 2 / Atas)
    this.storeBottom = 0;    // Left storehouse (Player 1 / Bawah)

    this.currentPlayer = null; // 'bottom' or 'top'
    this.isAnimating = false;
    this.gameMode = 'pvp';     // 'pvp' | 'ai' | 'online'
    this.animationSpeed = 220; // ms per drop
    this.p2Flipped = localStorage.getItem('congklak_p2_flipped') !== 'false'; // default true: berhadapan

    // Multiplayer Room State
    this.socket = null;
    this.currentRoomId = null;
    this.myRole = null;        // 'bottom' (P1) or 'top' (P2) when in online room
    this.opponent = null;      // { id, name }
    this.pendingInviteFrom = null; // { id, name }

    // Define 16-slot clockwise cycle
    this.CYCLE = [
      { type: 'pit', side: 'top', index: 0 },
      { type: 'pit', side: 'top', index: 1 },
      { type: 'pit', side: 'top', index: 2 },
      { type: 'pit', side: 'top', index: 3 },
      { type: 'pit', side: 'top', index: 4 },
      { type: 'pit', side: 'top', index: 5 },
      { type: 'pit', side: 'top', index: 6 },
      { type: 'store', side: 'top' },           // Rumah Kanan (P2)
      { type: 'pit', side: 'bottom', index: 6 },
      { type: 'pit', side: 'bottom', index: 5 },
      { type: 'pit', side: 'bottom', index: 4 },
      { type: 'pit', side: 'bottom', index: 3 },
      { type: 'pit', side: 'bottom', index: 2 },
      { type: 'pit', side: 'bottom', index: 1 },
      { type: 'pit', side: 'bottom', index: 0 },
      { type: 'store', side: 'bottom' }         // Rumah Kiri (P1)
    ];

    this.initDOM();
    this.bindEvents();
    this.initProfile();
    this.initWebSocket();
    this.checkUrlInvite();
    this.startNewGame(false);
  }

  initDOM() {
    this.boardContainerEl = document.getElementById('board-container');

    // Stores
    this.storeLeftEl = document.getElementById('store-left-count');
    this.storeRightEl = document.getElementById('store-right-count');
    this.storeLeftBox = document.getElementById('storehouse-left');
    this.storeRightBox = document.getElementById('storehouse-right');

    // Rows
    this.topRowEl = document.getElementById('top-pits-row');
    this.bottomRowEl = document.getElementById('bottom-pits-row');

    // Banners & status
    this.turnMessageEl = document.getElementById('turn-message');
    this.roundIndicatorEl = document.getElementById('round-indicator');
    this.cardBottomEl = document.getElementById('card-bottom');
    this.cardTopEl = document.getElementById('card-top');
    this.handHudEl = document.getElementById('hand-hud');
    this.handCountEl = document.getElementById('hand-count');

    // Boom & HUD
    this.boomOverlayEl = document.getElementById('boom-overlay');
    this.boomCountEl = document.getElementById('boom-captured-count');
    this.logStreamEl = document.getElementById('log-stream');

    // Header Profile & Online elements
    this.displayProfileName = document.getElementById('display-profile-name');
    this.displayProfileId = document.getElementById('display-profile-id');
    this.onlineBadge = document.getElementById('online-count-badge');
    this.roomBarEl = document.getElementById('room-indicator-bar');
    this.roomIdTag = document.getElementById('room-id-tag');
    this.roomOpponentTag = document.getElementById('room-opponent-tag');
    this.currentModeLabel = document.getElementById('current-mode-label');
    this.btnToggleP2Flip = document.getElementById('btn-toggle-p2-flip');

    // Modals
    this.rulesModal = document.getElementById('rules-modal');
    this.coinModal = document.getElementById('coin-modal');
    this.winnerModal = document.getElementById('winner-modal');
    this.profileModal = document.getElementById('profile-modal');
    this.lobbyModal = document.getElementById('lobby-modal');
    this.inviteModal = document.getElementById('incoming-invite-modal');
    this.modeModal = document.getElementById('mode-modal');
    this.confirmModal = document.getElementById('confirm-modal');

    // Winner modal elements
    this.nextRoundDescEl = document.getElementById('next-round-desc');
    this.btnNextRound = document.getElementById('btn-next-round');
    this.btnEndMatch = document.getElementById('btn-end-match');

    // Lobby & profile inputs
    this.inputPlayerName = document.getElementById('input-player-name');
    this.inputPlayerId = document.getElementById('input-player-id');
    this.inputTargetId = document.getElementById('input-target-id');
    this.myLobbyId = document.getElementById('my-lobby-id');
    this.playersListContainer = document.getElementById('players-list-container');
    this.btnCopyShareLink = document.getElementById('btn-copy-share-link');

    this.renderPitsDOM();
  }

  renderPitsDOM() {
    this.topRowEl.innerHTML = '<span class="row-label-tag">BARIS PLAYER ATAS</span>';
    this.bottomRowEl.innerHTML = '<span class="row-label-tag">BARIS PLAYER BAWAH</span>';

    this.pitElements = { top: [], bottom: [] };
    this.badgeElements = { top: [], bottom: [] };
    this.shellContainerElements = { top: [], bottom: [] };
    this.cachedCounts = { top: new Array(7).fill(-1), bottom: new Array(7).fill(-1) };
    this.cachedBurnt = { top: new Array(7).fill(null), bottom: new Array(7).fill(null) };
    this.cachedStoreTop = -1;
    this.cachedStoreBottom = -1;

    // Top Pits (0 to 6)
    for (let i = 0; i < 7; i++) {
      const pitEl = document.createElement('div');
      pitEl.className = 'pit';
      pitEl.id = `pit-top-${i}`;
      pitEl.dataset.side = 'top';
      pitEl.dataset.index = i;
      pitEl.innerHTML = `
        <span class="pit-index-num">A${i + 1}</span>
        <div class="shells-container" id="shells-top-${i}"></div>
        <span class="pit-count-badge" id="badge-top-${i}">7</span>
      `;
      this.topRowEl.appendChild(pitEl);

      this.pitElements.top[i] = pitEl;
      this.badgeElements.top[i] = pitEl.querySelector('.pit-count-badge');
      this.shellContainerElements.top[i] = pitEl.querySelector('.shells-container');
    }

    // Bottom Pits (0 to 6)
    for (let i = 0; i < 7; i++) {
      const pitEl = document.createElement('div');
      pitEl.className = 'pit';
      pitEl.id = `pit-bottom-${i}`;
      pitEl.dataset.side = 'bottom';
      pitEl.dataset.index = i;
      pitEl.innerHTML = `
        <span class="pit-index-num">B${i + 1}</span>
        <div class="shells-container" id="shells-bottom-${i}"></div>
        <span class="pit-count-badge" id="badge-bottom-${i}">7</span>
      `;
      this.bottomRowEl.appendChild(pitEl);

      this.pitElements.bottom[i] = pitEl;
      this.badgeElements.bottom[i] = pitEl.querySelector('.pit-count-badge');
      this.shellContainerElements.bottom[i] = pitEl.querySelector('.shells-container');
    }
  }

  // Update POV based on Mode (Di Tempat vs Online vs AI)
  updatePOV() {
    const topTag = document.querySelector('#top-pits-row .row-label-tag');
    const bottomTag = document.querySelector('#bottom-pits-row .row-label-tag');
    const storeLeftLabel = document.querySelector('#storehouse-left .store-label');
    const storeLeftOwner = document.querySelector('#storehouse-left .store-owner');
    const storeRightLabel = document.querySelector('#storehouse-right .store-label');
    const storeRightOwner = document.querySelector('#storehouse-right .store-owner');

    if (this.gameMode === 'online') {
      this.boardContainerEl.classList.remove('mode-local-face-to-face');
      document.body.classList.remove('mode-local-face-to-face');
      if (this.btnToggleP2Flip) this.btnToggleP2Flip.style.display = 'none';

      if (this.myRole === 'top') {
        // Player 2 POV: Flip board 180deg so Player 2's pits are at the BOTTOM!
        this.boardContainerEl.classList.add('pov-flip');
        if (topTag) topTag.textContent = 'BARIS ANDA (PLAYER 2)';
        if (bottomTag) bottomTag.textContent = 'BARIS LAWAN (PLAYER 1)';
        if (storeRightLabel) storeRightLabel.textContent = 'RUMAH ANDA';
        if (storeRightOwner) storeRightOwner.textContent = '(Player 2)';
        if (storeLeftLabel) storeLeftLabel.textContent = 'RUMAH LAWAN';
        if (storeLeftOwner) storeLeftOwner.textContent = '(Player 1)';
      } else {
        // Player 1 POV: Normal orientation, Player 1's pits are at the BOTTOM!
        this.boardContainerEl.classList.remove('pov-flip');
        if (topTag) topTag.textContent = 'BARIS LAWAN (PLAYER 2)';
        if (bottomTag) bottomTag.textContent = 'BARIS ANDA (PLAYER 1)';
        if (storeLeftLabel) storeLeftLabel.textContent = 'RUMAH ANDA';
        if (storeLeftOwner) storeLeftOwner.textContent = '(Player 1)';
        if (storeRightLabel) storeRightLabel.textContent = 'RUMAH LAWAN';
        if (storeRightOwner) storeRightOwner.textContent = '(Player 2)';
      }
    } else if (this.gameMode === 'ai') {
      this.boardContainerEl.classList.remove('pov-flip');
      this.boardContainerEl.classList.remove('mode-local-face-to-face');
      document.body.classList.remove('mode-local-face-to-face');
      if (this.btnToggleP2Flip) this.btnToggleP2Flip.style.display = 'none';

      if (topTag) topTag.textContent = 'BARIS KOMPUTER (AI)';
      if (bottomTag) bottomTag.textContent = 'BARIS ANDA (P1)';
      if (storeLeftLabel) storeLeftLabel.textContent = 'RUMAH ANDA';
      if (storeLeftOwner) storeLeftOwner.textContent = '(Player 1)';
      if (storeRightLabel) storeRightLabel.textContent = 'RUMAH KOMPUTER';
      if (storeRightOwner) storeRightOwner.textContent = '(AI)';
    } else {
      // Mode di Tempat (Lokal 1 HP / Berhadapan)
      this.boardContainerEl.classList.remove('pov-flip');

      if (this.btnToggleP2Flip) {
        this.btnToggleP2Flip.style.display = 'inline-flex';
        this.btnToggleP2Flip.innerHTML = this.p2Flipped 
          ? '🔄 POV P2: Berhadapan' 
          : '👥 POV P2: Berdampingan';
        this.btnToggleP2Flip.title = this.p2Flipped
          ? 'Player Atas diputar 180° agar tidak terbalik saat main berhadapan. Klik untuk ubah ke berdampingan.'
          : 'Player Atas normal (menghadap bawah). Klik untuk putar 180° berhadapan.';
      }

      if (this.p2Flipped) {
        // Putar baris atas, lubang A1-A7, dan Rumah Kanan 180°
        this.boardContainerEl.classList.add('mode-local-face-to-face');
        document.body.classList.add('mode-local-face-to-face');
        if (topTag) {
          topTag.textContent = 'BARIS PLAYER ATAS (P2) ↻';
          topTag.title = 'Teks diputar 180° untuk pemain atas. Klik untuk ubah arah.';
        }
      } else {
        this.boardContainerEl.classList.remove('mode-local-face-to-face');
        document.body.classList.remove('mode-local-face-to-face');
        if (topTag) {
          topTag.textContent = 'BARIS PLAYER ATAS (P2)';
          topTag.title = 'Teks normal. Klik untuk putar 180° berhadapan.';
        }
      }

      if (bottomTag) bottomTag.textContent = 'BARIS PLAYER BAWAH (P1)';
      if (storeLeftLabel) storeLeftLabel.textContent = 'RUMAH KIRI';
      if (storeLeftOwner) storeLeftOwner.textContent = '(Player Bawah)';
      if (storeRightLabel) storeRightLabel.textContent = 'RUMAH KANAN';
      if (storeRightOwner) storeRightOwner.textContent = '(Player Atas)';
    }
  }

  /* Profile Management */
  initProfile() {
    // Use sessionStorage so multiple tabs in the same browser have unique player IDs!
    let sId = sessionStorage.getItem('congklak_playerId');
    let sName = sessionStorage.getItem('congklak_playerName');

    if (!sId || !sName) {
      const randNum = Math.floor(1000 + Math.random() * 9000);
      sId = 'CONG-' + randNum;
      sName = 'Pemain-' + randNum;

      sessionStorage.setItem('congklak_playerId', sId);
      sessionStorage.setItem('congklak_playerName', sName);
    }

    this.playerId = sId;
    this.playerName = sName;
    this.updateProfileUI();
  }

  updateProfileUI() {
    this.displayProfileName.textContent = this.playerName;
    this.displayProfileId.textContent = `#${this.playerId}`;
    this.myLobbyId.textContent = `#${this.playerId}`;
  }

  openProfileModal() {
    this.inputPlayerName.value = this.playerName;
    this.inputPlayerId.value = this.playerId;
    this.showModal(this.profileModal);
  }

  saveProfile() {
    const name = this.inputPlayerName.value.trim();
    let id = this.inputPlayerId.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');

    if (!name) {
      this.showAlert({
        title: 'Nama Diperlukan',
        message: 'Silakan masukkan nama atau panggilan Anda terlebih dahulu!',
        type: 'warning',
        icon: '⚠️'
      });
      return;
    }
    if (!id) {
      id = 'CONG-' + Math.floor(1000 + Math.random() * 9000);
    }

    this.playerName = name;
    this.playerId = id;
    sessionStorage.setItem('congklak_playerName', this.playerName);
    sessionStorage.setItem('congklak_playerId', this.playerId);
    localStorage.setItem('congklak_playerName', this.playerName);
    localStorage.setItem('congklak_playerId', this.playerId);

    this.updateProfileUI();
    this.hideModal(this.profileModal);
    this.addLog(`Profil diperbarui: ${this.playerName} (#${this.playerId})`, 'bonus');

    this.sendWS({
      type: 'register',
      playerId: this.playerId,
      playerName: this.playerName
    });
  }

  generateRandomId() {
    const prefixes = ['CONG', 'JAWARA', 'SULTAN', 'GARUDA', 'NUSA', 'MASTER'];
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${p}-${num}`;
  }

  checkUrlInvite() {
    const params = new URLSearchParams(window.location.search);
    const inviteId = params.get('invite');
    if (inviteId) {
      setTimeout(() => {
        this.inputTargetId.value = inviteId;
        this.showModal(this.lobbyModal);
        this.addLog(`Tautan mabar terdeteksi! Siap mengundang #${inviteId}.`, 'bonus');
      }, 700);
    }
  }

  /* WebSocket Multiplayer Engine */
  initWebSocket() {
    if (!window.location.host || window.location.protocol === 'file:') {
      if (this.onlineBadge) this.onlineBadge.innerHTML = '⚪ Offline (Lokal)';
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      this.socket = new WebSocket(wsUrl);
      this.wsReconnectDelay = this.wsReconnectDelay || 3000;

      this.socket.onopen = () => {
        this.wsReconnectDelay = 3000;
        this.sendWS({
          type: 'register',
          playerId: this.playerId,
          playerName: this.playerName
        });
      };

      this.socket.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        this.handleWSMessage(msg);
      };

      this.socket.onclose = () => {
        if (this.onlineBadge) this.onlineBadge.innerHTML = '⚪ Offline';
        if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
        this.wsReconnectTimer = setTimeout(() => {
          this.wsReconnectDelay = Math.min(30000, this.wsReconnectDelay * 1.5);
          this.initWebSocket();
        }, this.wsReconnectDelay);
      };

      this.socket.onerror = () => {
        if (this.onlineBadge) this.onlineBadge.innerHTML = '⚪ Offline';
      };
    } catch (e) {
      console.warn('WebSocket connection error:', e);
    }
  }

  sendWS(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
      return true;
    }
    console.warn('[Congklak WS] Socket tidak terhubung (readyState:', this.socket ? this.socket.readyState : 'null', ')');
    return false;
  }

  handleWSMessage(msg) {
    switch (msg.type) {
      case 'registered_ack':
        this.onlineBadge.innerHTML = '🟢 Terhubung';
        if (msg.stats) {
          this.addLog(`ID Anda terdaftar di database: #${msg.playerId} (${msg.playerName})`, 'system');
        }
        break;

      case 'session_created_ack':
        this.showAlert({
          title: 'Sesi Berhasil Dibuat',
          message: `Sesi pertandingan #${msg.sessionId} berhasil dibuat!\nBagikan Sesi ID ini kepada teman Anda atau tunggu pemain lain bergabung.`,
          type: 'success',
          icon: '🎉'
        });
        this.addLog(`Sesi #${msg.sessionId} dibuat. Menunggu lawan masuk...`, 'bonus');
        this.turnMessageEl.innerHTML = `⏳ Sesi #${msg.sessionId}: Menunggu lawan bergabung...`;
        break;

      case 'session_failed':
        this.showAlert({
          title: 'Gagal Masuk/Buat Sesi',
          message: msg.reason || 'Terjadi kendala pada sesi permainan.',
          type: 'danger',
          icon: '❌'
        });
        break;

      case 'player_list':
        this.updateLobbyPlayerList(msg.players || [], msg.offlinePlayers || [], msg.waitingSessions || [], msg.activeMatchCount || 0);
        break;

      case 'incoming_invite':
        this.pendingInviteFrom = { id: msg.fromId, name: msg.fromName };
        document.getElementById('invite-desc-text').innerHTML = `
          <strong>${this.escapeHtml(msg.fromName)}</strong> (<code>#${this.escapeHtml(msg.fromId)}</code>) mengundang Anda bermain Congklak 1 vs 1!
        `;
        window.soundFx.playBonus();
        this.showModal(this.inviteModal);
        break;

      case 'invite_sent_ack':
        this.showAlert({
          title: 'Undangan Terkirim',
          message: `Undangan berhasil dikirim ke ${msg.toName} (#${msg.toId}). Menunggu respons lawan...`,
          type: 'info',
          icon: '✉️'
        });
        this.turnMessageEl.innerHTML = `⏳ Menunggu jawaban undangan dari ${msg.toName}...`;
        break;

      case 'invite_failed':
        this.showAlert({
          title: 'Gagal Mengundang',
          message: `Gagal mengundang lawan: ${msg.reason}`,
          type: 'danger',
          icon: '❌'
        });
        break;

      case 'invite_rejected':
        this.showAlert({
          title: 'Undangan Ditolak',
          message: `${msg.byName} menolak undangan pertandingan.`,
          type: 'warning',
          icon: '✋'
        });
        break;

      case 'game_start':
        this.hideModal(this.inviteModal);
        this.hideModal(this.lobbyModal);
        this.hideModal(this.modeModal);

        this.gameMode = 'online';
        this.currentModeLabel.textContent = 'Online';
        this.currentRoomId = msg.roomId;
        this.myRole = msg.myRole;
        this.opponent = msg.opponent;
        this.currentRound = 1;
        this.resetBurntPits();

        // Update POV: Player 2 rotated 180deg so both see their own row at the bottom!
        this.updatePOV();

        this.roomBarEl.classList.add('active');
        this.roomIdTag.textContent = `Kamar: #${msg.roomId}`;
        this.roomOpponentTag.textContent = `⚔️ Lawan: ${msg.opponent.name} (#${msg.opponent.id}) [${this.myRole === 'bottom' ? 'Player Atas' : 'Player Bawah'}]`;

        if (this.myRole === 'bottom') {
          document.querySelector('#card-bottom .player-meta h3').textContent = `${this.playerName} (Anda)`;
          document.querySelector('#card-top .player-meta h3').textContent = `${this.opponent.name} (Lawan)`;
        } else {
          document.querySelector('#card-top .player-meta h3').textContent = `${this.playerName} (Anda)`;
          document.querySelector('#card-bottom .player-meta h3').textContent = `${this.opponent.name} (Lawan)`;
        }

        this.clearLog();
        // Host menjadi acuan kecepatan agar kedua pemain sinkron
        if (this.myRole === 'bottom') {
          this.setAnimationSpeed(this.animationSpeed, true);
        }
        this.addLog(`=== KEDUA PEMAIN TELAH BERGABUNG ===`, 'boom');
        this.addLog(`Kamar #${msg.roomId}: Kedua pemain bergabung. Memulai kocokan giliran pertama...`, 'bonus');

        this.topPits = [7, 7, 7, 7, 7, 7, 7];
        this.bottomPits = [7, 7, 7, 7, 7, 7, 7];
        this.storeTop = 0;
        this.storeBottom = 0;
        this.isAnimating = false;
        this.remoteMoveQueue = [];
        this.hideFloatingHand();
        this.clearAllHighlights();
        this.updateRoundBadge();
        this.updateBoardDisplay();

        // KOCOKAN DIMULAI SETELAH KEDUA PLAYER BERGABUNG
        this.currentPlayer = msg.startingPlayer;
        this.showCoinTossAnimation(msg.startingPlayer);
        break;

      case 'speed_change':
        this.setAnimationSpeed(msg.speed, false);
        this.addLog(`Kecepatan animasi disinkronkan oleh lawan.`, 'system');
        break;

      case 'opponent_move':
        if (this.gameMode === 'online') {
          this.executeMove(msg.side, msg.index, true);
        }
        break;

      case 'opponent_voted_next_round':
        this.btnNextRound.textContent = '⚔️ Lawan Siap Lanjut! Klik untuk Setuju';
        this.btnNextRound.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        break;

      case 'start_next_round':
        this.applyNextRound(msg);
        break;

      case 'match_ended_by_player':
        this.hideModal(this.winnerModal);
        this.showAlert({
          title: 'Pertandingan Diakhiri',
          message: `Pertandingan Congklak diakhiri oleh ${msg.byName}.\nPertandingan selesai atas kesepakatan kedua pemain!`,
          type: 'info',
          icon: '🏁'
        });
        this.leaveRoom(false);
        break;

      case 'opponent_left':
        this.showAlert({
          title: 'Lawan Meninggalkan Sesi',
          message: msg.message || 'Lawan telah meninggalkan kamar pertandingan.',
          type: 'warning',
          icon: '🚪'
        });
        this.addLog(`Lawan telah meninggalkan kamar. Pertandingan selesai.`, 'system');
        this.leaveRoom(false);
        break;
    }
  }

  updateLobbyPlayerList(players, offlinePlayers = [], waitingSessions = [], activeMatchCount = 0) {
    const totalOnline = players.length;
    this.onlineBadge.innerHTML = `🟢 ${totalOnline} Online ${activeMatchCount > 0 ? `| ⚔️ ${activeMatchCount} Sesi Aktif` : ''}`;

    this.playersListContainer.innerHTML = '';

    // 1. Render Waiting Sessions if any!
    if (waitingSessions && waitingSessions.length > 0) {
      const sessionSection = document.createElement('div');
      sessionSection.style.marginBottom = '12px';
      sessionSection.innerHTML = `<div style="font-size:11px; font-weight:800; color:#ffd700; text-transform:uppercase; margin-bottom:6px; letter-spacing:0.5px;">🎮 Sesi Terbuka Menunggu Lawan:</div>`;

      waitingSessions.forEach(s => {
        const isMySession = s.hostId === this.playerId;
        const item = document.createElement('div');
        item.className = 'player-list-item';
        item.style.borderColor = 'rgba(255, 215, 0, 0.4)';
        item.innerHTML = `
          <div class="player-list-info">
            <span style="font-size:20px;">🚪</span>
            <div>
              <div class="item-name">Sesi: ${this.escapeHtml(s.sessionId)}</div>
              <div class="item-id">Host: ${this.escapeHtml(s.hostName)} (#${this.escapeHtml(s.hostId)})</div>
            </div>
          </div>
          <div>
            ${isMySession ? 
              `<button class="btn btn-cancel-my-session" data-session="${this.escapeHtml(s.sessionId)}" style="padding:5px 10px; font-size:11.5px; background:rgba(239,68,68,0.25); border-color:#ef4444;">Batal Sesi</button>` :
              `<button class="btn btn-primary btn-join-waiting-session" data-session="${this.escapeHtml(s.sessionId)}" style="padding:5px 10px; font-size:11.5px;">Masuk Sesi ⚔️</button>`
            }
          </div>
        `;
        sessionSection.appendChild(item);
      });
      this.playersListContainer.appendChild(sessionSection);
    }

    // 2. Render Online Players
    const otherPlayers = players.filter(p => p.id !== this.playerId);

    if (otherPlayers.length > 0) {
      const playersHeader = document.createElement('div');
      playersHeader.style.fontSize = '11px';
      playersHeader.style.fontWeight = '800';
      playersHeader.style.color = 'var(--text-muted)';
      playersHeader.style.textTransform = 'uppercase';
      playersHeader.style.margin = '6px 0 4px 0';
      playersHeader.textContent = '🟢 Pemain Sedang Online (Siap Diundang):';
      this.playersListContainer.appendChild(playersHeader);

      otherPlayers.forEach(p => {
        const item = document.createElement('div');
        item.className = 'player-list-item';
        
        const isAvailable = p.status === 'available';
        item.innerHTML = `
          <div class="player-list-info">
            <div class="player-status-dot ${isAvailable ? 'available' : 'playing'}"></div>
            <div>
              <div class="item-name">${this.escapeHtml(p.name)}</div>
              <div class="item-id">#${this.escapeHtml(p.id)}</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="status-badge ${isAvailable ? 'available' : 'playing'}">${isAvailable ? 'Tersedia' : 'Sedang Main'}</span>
            <button class="btn btn-primary btn-invite-player" data-id="${this.escapeHtml(p.id)}" style="padding: 5px 10px; font-size: 11.5px;" ${!isAvailable ? 'disabled' : ''}>
              ⚔️ Undang
            </button>
          </div>
        `;
        this.playersListContainer.appendChild(item);
      });
    }

    if (otherPlayers.length === 0 && (!waitingSessions || waitingSessions.length === 0)) {
      this.playersListContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 24px; font-size: 13px;">
          Belum ada pemain lain yang sedang online.<br>
          <span style="font-size: 12px; opacity: 0.8;">Buka link permainan di perangkat/tab lain atau buat Sesi Kamar Baru!</span>
        </div>
      `;
    }
  }

  sendInvite(targetId, btnEl = null) {
    if (!targetId) return;
    const cleanTarget = String(targetId).trim().toUpperCase().replace(/^#/, '');
    if (cleanTarget === this.playerId.replace(/^#/, '')) {
      this.showAlert({
        title: 'Tidak Bisa Mengundang Diri Sendiri',
        message: 'Anda tidak dapat mengundang ID Anda sendiri.',
        type: 'warning',
        icon: '⚠️'
      });
      return;
    }

    if (btnEl) {
      const origText = btnEl.textContent;
      btnEl.textContent = '⏳ Mengundang...';
      btnEl.disabled = true;
      setTimeout(() => {
        if (btnEl) {
          btnEl.textContent = origText;
          btnEl.disabled = false;
        }
      }, 4000);
    }

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.showAlert({
        title: 'Koneksi Terputus',
        message: 'Koneksi ke server belum terhubung. Menghubungkan ulang...',
        type: 'warning',
        icon: '🔌'
      });
      this.initWebSocket();
      return;
    }

    this.sendWS({
      type: 'invite',
      fromId: this.playerId,
      fromName: this.playerName,
      toId: cleanTarget
    });
  }

  leaveRoom(notifyServer = true) {
    if (notifyServer && this.currentRoomId) {
      this.sendWS({
        type: 'leave_room',
        roomId: this.currentRoomId,
        playerId: this.playerId
      });
    }

    this.currentRoomId = null;
    this.myRole = null;
    this.opponent = null;
    this.gameMode = 'pvp';
    this.currentModeLabel.textContent = 'Di Tempat';
    this.currentRound = 1;
    this.resetBurntPits();
    this.roomBarEl.classList.remove('active');

    // Restore POV to fixed local
    this.updatePOV();

    document.querySelector('#card-bottom .player-meta h3').textContent = 'Player Bawah (P1)';
    document.querySelector('#card-top .player-meta h3').textContent = 'Player Atas (P2)';

    this.addLog(`Keluar dari kamar online. Kembali ke mode di tempat (lokal).`, 'system');
    this.startNewGame();
  }

  resetBurntPits() {
    this.burntPits = {
      top: [false, false, false, false, false, false, false],
      bottom: [false, false, false, false, false, false, false]
    };
  }

  updateRoundBadge() {
    this.roundIndicatorEl.textContent = `Ronde ${this.currentRound}`;
  }

  bindEvents() {
    // Pit click handler
    document.getElementById('board-container').addEventListener('click', (e) => {
      const pit = e.target.closest('.pit');
      if (!pit || this.isAnimating) return;

      const side = pit.dataset.side;
      const index = parseInt(pit.dataset.index, 10);

      if (this.burntPits[side][index]) {
        this.addLog(`Lubang ini hangus/mati dan wajib dilewati!`, 'system');
        return;
      }

      if (this.gameMode === 'online') {
        if (side !== this.myRole) {
          this.addLog(`Ini bukan baris Anda! Anda adalah Player ${this.myRole === 'bottom' ? 'Bawah' : 'Atas'}.`, 'system');
          return;
        }
        if (side !== this.currentPlayer) {
          this.addLog(`Sedang giliran lawan, harap menunggu...`, 'system');
          return;
        }
      } else {
        if (side !== this.currentPlayer) {
          this.addLog(`Bukan giliran ${side === 'top' ? 'Player Atas' : 'Player Bawah'}!`, 'system');
          return;
        }
        if (this.gameMode === 'ai' && this.currentPlayer === 'top') {
          return;
        }
      }

      const count = side === 'top' ? this.topPits[index] : this.bottomPits[index];
      if (count <= 0) {
        this.addLog(`Lubang ini kosong, pilih lubang lain yang ada kerangnya!`, 'system');
        return;
      }

      if (this.gameMode === 'online') {
        this.sendWS({
          type: 'game_move',
          roomId: this.currentRoomId,
          side,
          index,
          playerId: this.playerId
        });
      }

      this.executeMove(side, index, false);
    });

    // Profile & Lobby buttons
    document.getElementById('btn-edit-profile').addEventListener('click', () => this.openProfileModal());
    document.getElementById('btn-close-profile').addEventListener('click', () => this.hideModal(this.profileModal));
    document.getElementById('btn-save-profile').addEventListener('click', () => this.saveProfile());
    document.getElementById('btn-random-id').addEventListener('click', () => {
      this.inputPlayerId.value = this.generateRandomId();
    });

    document.getElementById('btn-open-lobby').addEventListener('click', () => {
      this.sendWS({ type: 'get_players' });
      this.showModal(this.lobbyModal);
    });
    document.getElementById('btn-close-lobby').addEventListener('click', () => this.hideModal(this.lobbyModal));
    document.getElementById('btn-refresh-players').addEventListener('click', () => {
      this.sendWS({ type: 'get_players' });
    });

    // Mode selection modal
    document.getElementById('btn-choose-mode').addEventListener('click', () => {
      this.showModal(this.modeModal);
    });
    document.getElementById('btn-close-mode').addEventListener('click', () => this.hideModal(this.modeModal));

    // Toggle POV Player Atas (Berhadapan vs Berdampingan) pada Mode Di Tempat
    if (this.btnToggleP2Flip) {
      this.btnToggleP2Flip.addEventListener('click', () => {
        this.p2Flipped = !this.p2Flipped;
        localStorage.setItem('congklak_p2_flipped', this.p2Flipped);
        this.updatePOV();
        this.addLog(
          this.p2Flipped 
            ? 'POV Player Atas diputar 180° (Mode Berhadapan).' 
            : 'POV Player Atas dinormalkan (Mode Berdampingan).', 
          'system'
        );
      });
    }

    if (this.topRowEl) {
      this.topRowEl.addEventListener('click', (e) => {
        if (e.target.closest('.row-label-tag')) {
          if (this.gameMode === 'pvp') {
            this.p2Flipped = !this.p2Flipped;
            localStorage.setItem('congklak_p2_flipped', this.p2Flipped);
            this.updatePOV();
            this.addLog(
              this.p2Flipped 
                ? 'POV Player Atas diputar 180° (Mode Berhadapan).' 
                : 'POV Player Atas dinormalkan (Mode Berdampingan).', 
              'system'
            );
          }
        }
      });
    }

    const selectModeEl = document.getElementById('select-mode');

    document.getElementById('card-mode-local').addEventListener('click', () => {
      this.hideModal(this.modeModal);
      if (this.gameMode === 'online') {
        this.leaveRoom(true);
      }
      this.gameMode = 'pvp';
      if (selectModeEl) selectModeEl.value = 'pvp';
      this.currentModeLabel.textContent = 'Di Tempat';
      this.updatePOV();
      this.startNewGame(true);
    });

    const cardAi = document.getElementById('card-mode-ai');
    if (cardAi) {
      cardAi.addEventListener('click', () => {
        this.hideModal(this.modeModal);
        if (this.gameMode === 'online') {
          this.leaveRoom(true);
        }
        this.gameMode = 'ai';
        if (selectModeEl) selectModeEl.value = 'ai';
        this.currentModeLabel.textContent = 'vs Komputer';
        this.updatePOV();
        this.startNewGame(true);
      });
    }

    document.getElementById('card-mode-online').addEventListener('click', () => {
      this.hideModal(this.modeModal);
      this.gameMode = 'online';
      this.currentModeLabel.textContent = 'Online';
      this.turnMessageEl.innerHTML = '⏳ Mode Online: Buka Lobi & undang pemain lain untuk bertanding.';
      this.sendWS({ type: 'get_players' });
      this.showModal(this.lobbyModal);
    });

    // Refresh players button
    const btnRefresh = document.getElementById('btn-refresh-players');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => {
        btnRefresh.textContent = '⏳ Memuat...';
        this.sendWS({ type: 'get_players' });
        setTimeout(() => { btnRefresh.textContent = '🔄 Segarkan'; }, 800);
      });
    }

    // Event Delegation for Lobby Players and Sessions (immune to DOM re-renders!)
    if (this.playersListContainer) {
      this.playersListContainer.addEventListener('click', (e) => {
        const inviteBtn = e.target.closest('.btn-invite-player');
        if (inviteBtn && !inviteBtn.disabled) {
          const targetId = inviteBtn.dataset.id;
          this.sendInvite(targetId, inviteBtn);
          return;
        }

        const joinBtn = e.target.closest('.btn-join-waiting-session');
        if (joinBtn && !joinBtn.disabled) {
          const sid = joinBtn.dataset.session;
          joinBtn.textContent = '⏳ Masuk...';
          joinBtn.disabled = true;
          this.sendWS({
            type: 'join_custom_session',
            sessionId: sid,
            playerId: this.playerId,
            playerName: this.playerName
          });
          return;
        }

        const cancelBtn = e.target.closest('.btn-cancel-my-session');
        if (cancelBtn) {
          const sid = cancelBtn.dataset.session;
          this.sendWS({
            type: 'cancel_session',
            sessionId: sid,
            playerId: this.playerId
          });
          return;
        }
      });
    }

    // Copy Share Link for Remote Play
    if (this.btnCopyShareLink) {
      this.btnCopyShareLink.addEventListener('click', () => {
        const shareUrl = `${window.location.origin}/?invite=${this.playerId}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
          this.showAlert({ title: 'Tautan Tersalin', message: `Tautan mabar berhasil disalin:\n${shareUrl}\n\nKirimkan ke teman Anda melalui WhatsApp atau Telegram!`, type: 'success', icon: '🔗' });
        });
      });
    }

    // Direct Invite button
    const btnDirectInvite = document.getElementById('btn-send-invite');
    if (btnDirectInvite) {
      btnDirectInvite.addEventListener('click', () => {
        const target = this.inputTargetId.value.trim();
        if (!target) {
          this.showAlert({ title: 'ID Lawan Kosong', message: 'Masukkan ID atau Nama Player lawan!', type: 'warning', icon: '⚠️' });
          return;
        }
        this.sendInvite(target, btnDirectInvite);
        this.inputTargetId.value = '';
      });
    }

    document.getElementById('btn-copy-id').addEventListener('click', () => {
      navigator.clipboard.writeText(this.playerId).then(() => {
        this.showAlert({ title: 'ID Tersalin', message: `ID #${this.playerId} berhasil disalin ke clipboard! Bagikan kepada teman Anda.`, type: 'success', icon: '📋' });
      });
    });

    // Sesi ID (Room Code) buttons
    const inputSessionId = document.getElementById('input-session-id');
    const btnCreateSession = document.getElementById('btn-create-session');
    const btnJoinSession = document.getElementById('btn-join-session');

    if (btnCreateSession) {
      btnCreateSession.addEventListener('click', () => {
        let sid = inputSessionId.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        if (!sid) {
          sid = 'SESI-' + Math.floor(1000 + Math.random() * 9000);
          inputSessionId.value = sid;
        }
        btnCreateSession.textContent = '⏳ Membuat...';
        btnCreateSession.disabled = true;
        this.sendWS({
          type: 'create_custom_session',
          sessionId: sid,
          playerId: this.playerId,
          playerName: this.playerName
        });
        setTimeout(() => {
          btnCreateSession.textContent = '➕ Buat Sesi Baru';
          btnCreateSession.disabled = false;
        }, 3000);
      });
    }

    if (btnJoinSession) {
      btnJoinSession.addEventListener('click', () => {
        const sid = inputSessionId.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        if (!sid) {
          this.showAlert({ title: 'ID Sesi Kosong', message: 'Masukkan ID Sesi yang ingin Anda ikuti!', type: 'warning', icon: '⚠️' });
          return;
        }
        btnJoinSession.textContent = '⏳ Masuk...';
        btnJoinSession.disabled = true;
        this.sendWS({
          type: 'join_custom_session',
          sessionId: sid,
          playerId: this.playerId,
          playerName: this.playerName
        });
        setTimeout(() => {
          btnJoinSession.textContent = '🚪 Masuk Sesi';
          btnJoinSession.disabled = false;
        }, 3000);
      });
    }

    document.getElementById('btn-accept-invite').addEventListener('click', () => {
      if (this.pendingInviteFrom) {
        this.sendWS({
          type: 'invite_response',
          fromId: this.playerId,
          toId: this.pendingInviteFrom.id,
          accepted: true
        });
      }
      this.hideModal(this.inviteModal);
    });

    document.getElementById('btn-reject-invite').addEventListener('click', () => {
      if (this.pendingInviteFrom) {
        this.sendWS({
          type: 'invite_response',
          fromId: this.playerId,
          toId: this.pendingInviteFrom.id,
          accepted: false
        });
      }
      this.hideModal(this.inviteModal);
    });

    document.getElementById('btn-leave-room').addEventListener('click', async () => {
      const ok = await this.showConfirm({
        title: 'Tinggalkan Kamar?',
        message: 'Yakin ingin meninggalkan kamar pertandingan ini?',
        confirmText: '🚪 Ya, Keluar',
        type: 'danger',
        icon: '🚪'
      });
      if (ok) this.leaveRoom(true);
    });

    // Controls
    document.getElementById('btn-new-game').addEventListener('click', async () => {
      if (this.gameMode === 'online') {
        const ok = await this.showConfirm({
          title: 'Mulai Ulang?',
          message: 'Mulai baru akan me-reset pertandingan online ini ke Ronde 1. Lanjutkan?',
          confirmText: '🔄 Ya, Mulai Baru',
          type: 'warning',
          icon: '🔄'
        });
        if (ok) this.leaveRoom(true);
      } else {
        this.currentRound = 1;
        this.resetBurntPits();
        this.startNewGame(true);
      }
    });

    document.getElementById('btn-rules').addEventListener('click', () => this.showModal(this.rulesModal));
    document.getElementById('btn-close-rules').addEventListener('click', () => this.hideModal(this.rulesModal));

    // Next Round action
    this.btnNextRound.addEventListener('click', () => {
      if (!this.nextRoundData) return;

      if (this.gameMode === 'online') {
        this.btnNextRound.textContent = '⏳ Menunggu Persetujuan Lawan...';
        this.btnNextRound.disabled = true;

        this.sendWS({
          type: 'next_round_vote',
          roomId: this.currentRoomId,
          playerId: this.playerId,
          roundData: this.nextRoundData
        });
      } else {
        this.hideModal(this.winnerModal);
        this.applyNextRound(this.nextRoundData);
      }
    });

    // End match action
    this.btnEndMatch.addEventListener('click', async () => {
      if (this.gameMode === 'online') {
        const ok = await this.showConfirm({
          title: 'Akhiri Pertandingan?',
          message: 'Pertandingan Congklak ini akan diakhiri untuk kedua pemain.',
          confirmText: '🛑 Ya, Akhiri',
          type: 'danger',
          icon: '🛑'
        });
        if (ok) {
          this.sendWS({
            type: 'end_match',
            roomId: this.currentRoomId,
            playerId: this.playerId
          });
        }
      } else {
        this.hideModal(this.winnerModal);
        this.currentRound = 1;
        this.resetBurntPits();
        this.startNewGame();
        this.showAlert({ title: 'Pertandingan Selesai', message: 'Terima kasih telah bermain!', type: 'success', icon: '🏆' });
      }
    });

    const soundBtn = document.getElementById('btn-sound-toggle');
    soundBtn.addEventListener('click', () => {
      const isEnabled = window.soundFx.toggle();
      soundBtn.innerHTML = isEnabled ? '🔊 Suara: Nyala' : '🔇 Suara: Mati';
    });

    document.getElementById('select-speed').addEventListener('change', (e) => {
      this.setAnimationSpeed(e.target.value, true);
    });

    document.getElementById('select-mode').addEventListener('change', (e) => {
      if (this.gameMode === 'online') {
        this.showAlert({ title: 'Sedang di Kamar Online', message: 'Anda sedang berada dalam kamar online. Silakan klik "Keluar Kamar" terlebih dahulu.', type: 'warning', icon: '🚪' });
        return;
      }
      this.gameMode = e.target.value;
      this.currentModeLabel.textContent = this.gameMode === 'ai' ? 'vs Komputer' : 'Di Tempat';
      this.currentRound = 1;
      this.resetBurntPits();
      this.updatePOV();
      this.startNewGame();
    });

    // Mobile Landscape & Orientation Handlers
    const landscapeOverlay = document.getElementById('landscape-prompt');
    const btnRequestFullscreen = document.getElementById('btn-request-fullscreen');
    const btnDismissLandscape = document.getElementById('btn-dismiss-landscape');
    const btnToggleFullscreen = document.getElementById('btn-toggle-fullscreen');
    const btnQuickRotate = document.getElementById('btn-quick-rotate');

    const triggerLandscapeMode = () => {
      const doc = document.documentElement;
      const rfs = doc.requestFullscreen || doc.webkitRequestFullscreen || doc.mozRequestFullScreen || doc.msRequestFullscreen;

      if (rfs) {
        rfs.call(doc).then(() => {
          if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
          }
        }).catch(() => {});
      }

      if (landscapeOverlay) {
        landscapeOverlay.classList.add('dismissed');
      }
    };

    if (btnRequestFullscreen) {
      btnRequestFullscreen.addEventListener('click', triggerLandscapeMode);
    }
    if (btnQuickRotate) {
      btnQuickRotate.addEventListener('click', triggerLandscapeMode);
    }
    if (btnToggleFullscreen) {
      btnToggleFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          triggerLandscapeMode();
        } else {
          if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        }
      });
    }

    if (btnDismissLandscape) {
      btnDismissLandscape.addEventListener('click', () => {
        if (landscapeOverlay) {
          landscapeOverlay.classList.add('dismissed');
        }
      });
    }

    // Auto-dismiss landscape prompt when device is rotated to landscape
    const checkOrientation = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      if (isLandscape && landscapeOverlay) {
        landscapeOverlay.classList.add('dismissed');
      }
    };

    window.addEventListener('resize', checkOrientation);
    if (screen.orientation) {
      screen.orientation.addEventListener('change', checkOrientation);
    }

    [this.rulesModal, this.profileModal, this.lobbyModal, this.modeModal].forEach(modal => {
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) this.hideModal(modal);
        });
      }
    });
  }

  clearLog() {
    if (this.logStreamEl) this.logStreamEl.innerHTML = '';
  }

  setAnimationSpeed(value, broadcast = false) {
    const v = parseInt(value, 10);
    if (!v) return;
    this.animationSpeed = v;
    const sel = document.getElementById('select-speed');
    if (sel && sel.value !== String(v)) sel.value = String(v);
    if (broadcast && this.gameMode === 'online' && this.currentRoomId) {
      this.sendWS({
        type: 'speed_change',
        roomId: this.currentRoomId,
        playerId: this.playerId,
        speed: v
      });
    }
  }

  startNewGame(triggerToss = true) {
    this.clearLog();
    this.topPits = [7, 7, 7, 7, 7, 7, 7];
    this.bottomPits = [7, 7, 7, 7, 7, 7, 7];
    this.storeTop = 0;
    this.storeBottom = 0;
    this.isAnimating = false;
    this.remoteMoveQueue = [];
    this.hideFloatingHand();
    this.clearAllHighlights();
    this.updateRoundBadge();
    this.updatePOV();
    this.updateBoardDisplay();

    if (this.gameMode === 'online') {
      this.turnMessageEl.innerHTML = `⏳ Mode Online: Menunggu kedua pemain bergabung ke kamar...`;
      return;
    }

    this.addLog(`=== PERMAINAN BARU (RONDE ${this.currentRound}) DIMULAI ===`, 'bonus');
    this.addLog(`Masing-masing lubang aktif berisi 7 kerang. Rumah kosongan.`, 'system');

    if (triggerToss) {
      this.randomizeStartingPlayer();
    } else {
      this.currentPlayer = 'bottom';
      this.updateTurnUI();
    }
  }

  randomizeStartingPlayer() {
    const startsBottom = Math.random() < 0.5 ? 'bottom' : 'top';
    this.showCoinTossAnimation(startsBottom);
  }

  showCoinTossAnimation(starter) {
    this.showModal(this.coinModal);
    const coinDisc = document.getElementById('coin-disc');
    const coinResult = document.getElementById('coin-result');
    const modalTitle = document.querySelector('#coin-modal .modal-title');
    
    coinDisc.classList.add('spinning');

    if (this.gameMode === 'online') {
      if (modalTitle) modalTitle.innerHTML = '🪙 Kocokan Giliran (Kedua Pemain Sudah Bergabung)';
      coinResult.innerHTML = 'Kedua pemain telah bergabung!<br><span style="font-size:12px; opacity:0.8;">Mengocok siapa yang jalan duluan...</span>';
    } else {
      if (modalTitle) modalTitle.innerHTML = '🪙 Undian Giliran Pertama';
      coinResult.textContent = 'Mengacak siapa jalan duluan...';
    }

    window.soundFx.playCoinFlip();

    setTimeout(() => {
      coinDisc.classList.remove('spinning');
      this.currentPlayer = starter;

      let starterName;
      if (this.gameMode === 'online') {
        starterName = starter === this.myRole ? `${this.playerName} (Anda)` : `${this.opponent.name} (Lawan)`;
      } else {
        starterName = starter === 'bottom' ? 'Player Bawah (P1)' : (this.gameMode === 'ai' ? 'Komputer AI (Atas)' : 'Player Atas (P2)');
      }

      coinResult.innerHTML = `🎉 <strong>${this.escapeHtml(starterName)}</strong> Menang Kocokan & Jalan Duluan!`;

      setTimeout(() => {
        this.hideModal(this.coinModal);
        this.addLog(`${starterName} memenangkan kocokan dan jalan duluan pada ronde ini!`, starter === 'bottom' ? 'p1' : 'p2');
        this.updateTurnUI();

        if (this.gameMode === 'ai' && this.currentPlayer === 'top') {
          setTimeout(() => this.triggerAIMove(), 800);
        }
      }, 1500);
    }, 1800);
  }

  findCycleIndex(side, index) {
    return this.CYCLE.findIndex(slot => slot.type === 'pit' && slot.side === side && slot.index === index);
  }

  async executeMove(startSide, startIndex, isRemote = false) {
    // Jika masih ada animasi berjalan (mis. kecepatan lambat), antrikan langkah lawan
    if (isRemote && (this.isAnimating || this.isMoveRunning)) {
      this.remoteMoveQueue = this.remoteMoveQueue || [];
      this.remoteMoveQueue.push({ startSide, startIndex });
      return;
    }

    this.isMoveRunning = true;
    try {
      await this.runMove(startSide, startIndex, isRemote);
    } finally {
      this.isMoveRunning = false;
    }

    const next = this.remoteMoveQueue && this.remoteMoveQueue.shift();
    if (next && !this.isAnimating) {
      this.executeMove(next.startSide, next.startIndex, true);
    }
  }

  async runMove(startSide, startIndex, isRemote = false) {
    this.isAnimating = true;
    this.updateTurnUI();

    let heldShells = startSide === 'top' ? this.topPits[startIndex] : this.bottomPits[startIndex];
    if (startSide === 'top') this.topPits[startIndex] = 0;
    else this.bottomPits[startIndex] = 0;

    const startPitEl = (this.pitElements && this.pitElements[startSide]) ? this.pitElements[startSide][startIndex] : document.getElementById(`pit-${startSide}-${startIndex}`);
    startPitEl.classList.add('active-pickup');
    window.soundFx.playScoop();
    this.updateBoardDisplay({ type: 'pit', side: startSide, index: startIndex });

    let actorName;
    if (this.gameMode === 'online') {
      actorName = startSide === this.myRole ? `${this.playerName} (Anda)` : `${this.opponent.name} (Lawan)`;
    } else {
      actorName = startSide === 'bottom' ? 'Player Bawah' : 'Player Atas';
    }

    this.addLog(`${actorName} mengambil ${heldShells} kerang dari lubang ${startSide === 'top' ? 'A' : 'B'}${startIndex + 1}.`, startSide === 'bottom' ? 'p1' : 'p2');

    this.showFloatingHand(startPitEl, heldShells);
    await this.sleep(this.animationSpeed * 1.4);
    startPitEl.classList.remove('active-pickup');

    let currentCycleIdx = this.findCycleIndex(startSide, startIndex);

    let loopActive = true;
    while (loopActive) {
      currentCycleIdx = (currentCycleIdx + 1) % this.CYCLE.length;
      const targetSlot = this.CYCLE[currentCycleIdx];

      // 1. Pass storehouse: skip opponent's storehouse!
      if (targetSlot.type === 'store') {
        if (targetSlot.side !== this.currentPlayer) {
          continue;
        }
      }

      // 2. Pass burnt / hangus pits
      if (targetSlot.type === 'pit') {
        if (this.burntPits[targetSlot.side][targetSlot.index]) {
          continue;
        }
      }

      // Drop 1 shell
      heldShells--;
      let targetEl;
      if (targetSlot.type === 'store') {
        if (targetSlot.side === 'top') {
          this.storeTop++;
          targetEl = this.storeRightBox;
        } else {
          this.storeBottom++;
          targetEl = this.storeLeftBox;
        }
      } else {
        if (targetSlot.side === 'top') {
          this.topPits[targetSlot.index]++;
        } else {
          this.bottomPits[targetSlot.index]++;
        }
        targetEl = (this.pitElements && this.pitElements[targetSlot.side]) ? this.pitElements[targetSlot.side][targetSlot.index] : document.getElementById(`pit-${targetSlot.side}-${targetSlot.index}`);
      }

      window.soundFx.playShellDrop(targetSlot.type === 'store' ? 1.4 : 1.0);
      this.highlightSlot(targetEl);
      this.updateFloatingHand(targetEl, heldShells);
      this.updateBoardDisplay(targetSlot);

      await this.sleep(this.animationSpeed);

      if (heldShells === 0) {
        this.hideFloatingHand();

        // Condition A: Lands in Player's OWN storehouse -> Extra turn!
        if (targetSlot.type === 'store' && targetSlot.side === this.currentPlayer) {
          window.soundFx.playBonus();
          this.addLog(`✨ Kerang terakhir jatuh di RUMAH SENDIRI! ${actorName} dapat GILIRAN BONUS!`, 'bonus');
          this.flashBanner(`Giliran Bonus untuk ${actorName}!`);
          await this.sleep(700);

          if (this.hasValidMoves(this.currentPlayer)) {
            this.isAnimating = false;
            this.updateTurnUI();
            if (this.gameMode === 'ai' && this.currentPlayer === 'top') {
              setTimeout(() => this.triggerAIMove(), 600);
            }
            return;
          } else {
            this.addLog(`Tidak ada kerang di lubang ${actorName}, giliran berpindah.`, 'system');
            this.switchPlayer();
            return;
          }
        }

        // Condition B: Lands in a small pit
        if (targetSlot.type === 'pit') {
          const side = targetSlot.side;
          const index = targetSlot.index;
          const pitCount = side === 'top' ? this.topPits[index] : this.bottomPits[index];

          // Rule 4: Pit already had shells -> continue
          if (pitCount > 1) {
            heldShells = pitCount;
            if (side === 'top') this.topPits[index] = 0;
            else this.bottomPits[index] = 0;

            const scoopPitEl = (this.pitElements && this.pitElements[side]) ? this.pitElements[side][index] : document.getElementById(`pit-${side}-${index}`);
            scoopPitEl.classList.add('active-pickup');
            window.soundFx.playScoop();
            this.updateBoardDisplay({ type: 'pit', side, index });
            this.addLog(`Kerang habis di lubang ${side === 'top' ? 'A' : 'B'}${index + 1} (berisi ${heldShells} kerang). Lanjut jalan...`, this.currentPlayer === 'bottom' ? 'p1' : 'p2');
            this.showFloatingHand(scoopPitEl, heldShells);

            await this.sleep(this.animationSpeed * 1.3);
            scoopPitEl.classList.remove('active-pickup');
            continue;
          }

          // Rule 5: Lands in EMPTY pit -> NEMBAK / BOOM
          if (pitCount === 1) {
            if (side === this.currentPlayer) {
              const oppositeSide = side === 'top' ? 'bottom' : 'top';
              const oppIndex = index;
              const isOppBurnt = this.burntPits[oppositeSide][oppIndex];
              const oppCount = isOppBurnt ? 0 : (oppositeSide === 'top' ? this.topPits[oppIndex] : this.bottomPits[oppIndex]);

              if (oppCount > 0) {
                const totalCaptured = 1 + oppCount;
                if (side === 'top') {
                  this.topPits[index] = 0;
                  this.bottomPits[oppIndex] = 0;
                  this.storeTop += totalCaptured;
                } else {
                  this.bottomPits[index] = 0;
                  this.topPits[oppIndex] = 0;
                  this.storeBottom += totalCaptured;
                }

                await this.triggerBoomEffect(totalCaptured, actorName);
                this.addLog(`💥 BOOM! NEMBAK! ${actorName} menembak lubang seberang (+${totalCaptured} kerang masuk rumah). Giliran selesai, kini giliran lawan!`, 'boom');
              } else {
                this.addLog(`Kerang terakhir jatuh di lubang kosong sendiri, namun seberang kosong. Tidak dapat apa-apa.`, 'system');
              }
            } else {
              this.addLog(`Kerang terakhir jatuh di lubang kosong milik lawan. Giliran berakhir.`, 'system');
            }

            loopActive = false;
            break;
          }
        }
      }
    }

    this.clearAllHighlights();
    this.updateBoardDisplay();

    if (this.checkGameOver()) return;

    this.switchPlayer();
  }

  switchPlayer() {
    this.currentPlayer = this.currentPlayer === 'bottom' ? 'top' : 'bottom';

    if (!this.hasValidMoves(this.currentPlayer)) {
      const skippedPlayer = this.currentPlayer === 'bottom' ? 'Player Bawah' : 'Player Atas';
      this.addLog(`Semua lubang ${skippedPlayer} kosong! Lewat giliran.`, 'system');

      this.currentPlayer = this.currentPlayer === 'bottom' ? 'top' : 'bottom';
      if (!this.hasValidMoves(this.currentPlayer)) {
        this.endGame();
        return;
      }
    }

    this.isAnimating = false;
    this.updateTurnUI();

    if (this.gameMode === 'ai' && this.currentPlayer === 'top') {
      setTimeout(() => this.triggerAIMove(), 800);
    }
  }

  hasValidMoves(player) {
    const pits = player === 'top' ? this.topPits : this.bottomPits;
    return pits.some((count, idx) => !this.burntPits[player][idx] && count > 0);
  }

  checkGameOver() {
    const topHasMoves = this.hasValidMoves('top');
    const bottomHasMoves = this.hasValidMoves('bottom');

    if (!topHasMoves && !bottomHasMoves) {
      this.endGame();
      return true;
    }
    return false;
  }

  endGame() {
    this.isAnimating = true;

    let remainingTop = this.topPits.reduce((a, b) => a + b, 0);
    let remainingBottom = this.bottomPits.reduce((a, b) => a + b, 0);

    this.storeTop += remainingTop;
    this.storeBottom += remainingBottom;
    this.topPits = [0, 0, 0, 0, 0, 0, 0];
    this.bottomPits = [0, 0, 0, 0, 0, 0, 0];
    this.updateBoardDisplay();

    window.soundFx.playVictory();

    const scoreBottom = this.storeBottom;
    const scoreTop = this.storeTop;

    let winnerTitle = '';
    let winnerDesc = '';
    let winnerSide = null;

    if (scoreBottom > scoreTop) {
      winnerSide = 'bottom';
      if (this.gameMode === 'online') {
        winnerTitle = this.myRole === 'bottom' ? `🏆 Anda Memenangkan Ronde ${this.currentRound}!` : `🏆 ${this.opponent.name} Memenangkan Ronde ${this.currentRound}!`;
      } else {
        winnerTitle = `🏆 Player Bagian Bawah Memenangkan Ronde ${this.currentRound}!`;
      }
      winnerDesc = `Skor Ronde: ${scoreBottom} vs ${scoreTop}`;
    } else if (scoreTop > scoreBottom) {
      winnerSide = 'top';
      if (this.gameMode === 'online') {
        winnerTitle = this.myRole === 'top' ? `🏆 Anda Memenangkan Ronde ${this.currentRound}!` : `🏆 ${this.opponent.name} Memenangkan Ronde ${this.currentRound}!`;
      } else {
        winnerTitle = this.gameMode === 'ai' ? `🤖 Komputer AI Memenangkan Ronde ${this.currentRound}!` : `🏆 Player Bagian Atas Memenangkan Ronde ${this.currentRound}!`;
      }
      winnerDesc = `Skor Ronde: ${scoreTop} vs ${scoreBottom}`;
    } else {
      winnerSide = 'draw';
      winnerTitle = `🤝 Ronde ${this.currentRound} Seri (Draw)!`;
      winnerDesc = `Kedua pemain seimbang dengan masing-masing 49 kerang.`;
    }

    document.getElementById('winner-title').textContent = winnerTitle;
    document.getElementById('winner-sub').textContent = winnerDesc;
    document.getElementById('winner-score-bottom').textContent = scoreBottom;
    document.getElementById('winner-score-top').textContent = scoreTop;

    this.computeNextRoundState(winnerSide, scoreBottom, scoreTop);

    this.addLog(`=== RONDE ${this.currentRound} SELESAI ===`, 'bonus');
    this.addLog(`Hasil Ronde - Player Bawah: ${scoreBottom} | Player Atas: ${scoreTop}`, 'boom');

    this.btnNextRound.textContent = '⚔️ Lanjut Ronde Berikutnya';
    this.btnNextRound.disabled = false;
    this.btnNextRound.style.background = '';

    setTimeout(() => {
      this.showModal(this.winnerModal);
    }, 600);
  }

  computeNextRoundState(winnerSide, scoreBottom, scoreTop) {
    let newBurnt = {
      top: [false, false, false, false, false, false, false],
      bottom: [false, false, false, false, false, false, false]
    };
    let newTopPits = [0, 0, 0, 0, 0, 0, 0];
    let newBottomPits = [0, 0, 0, 0, 0, 0, 0];
    let newStoreTop = 0;
    let newStoreBottom = 0;
    let summaryHtml = '';

    let bottomName = 'Player Bawah (P1)';
    let topName = this.gameMode === 'ai' ? 'Komputer AI (P2)' : 'Player Atas (P2)';

    if (this.gameMode === 'online') {
      bottomName = this.myRole === 'bottom' ? `${this.playerName} (Anda)` : `${this.opponent.name} (Lawan)`;
      topName = this.myRole === 'top' ? `${this.playerName} (Anda)` : `${this.opponent.name} (Lawan)`;
    }

    if (winnerSide === 'bottom') {
      // Bottom Won, Top Lost
      const winnerName = bottomName;
      const loserName = topName;
      const scoreWinner = scoreBottom;
      const scoreLoser = scoreTop;

      const activePitsLoser = Math.min(7, Math.floor(scoreLoser / 7));
      const burntCountLoser = 7 - activePitsLoser;
      const remainderLoser = scoreLoser % 7;
      const winnerExcess = scoreWinner - 49;
      const totalWinnerStore = winnerExcess + remainderLoser;

      // Pits closest to Top store (index 6 down) filled first; furthest burnt
      for (let i = 0; i < 7; i++) {
        if (i < burntCountLoser) {
          newBurnt.top[i] = true;
          newTopPits[i] = 0;
        } else {
          newBurnt.top[i] = false;
          newTopPits[i] = 7;
        }
      }

      // Winner fills all 7 pits with 7 shells
      for (let i = 0; i < 7; i++) {
        newBurnt.bottom[i] = false;
        newBottomPits[i] = 7;
      }

      newStoreTop = 0;
      newStoreBottom = totalWinnerStore;

      summaryHtml = `
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div style="background:rgba(239,68,68,0.12); border-left:3px solid #ef4444; border-radius:8px; padding:8px 10px; font-size:12.5px; line-height:1.5;">
            <strong style="color:#fca5a5;">📉 ${this.escapeHtml(loserName)} (Kalah - Total ${scoreLoser} Kerang):</strong><br>
            • Mengisi <strong>${activePitsLoser} lubang</strong> dengan masing-masing genap 7 kerang (${activePitsLoser * 7} kerang).<br>
            • 🔥 <strong>${burntCountLoser} lubang dikosongkan (hangus/dilewati)</strong> karena tidak genap 7.<br>
            • 🐚 Sisa <strong>${remainderLoser} kerang</strong> yang tidak genap 7 masuk ke rumah pemenang (${this.escapeHtml(winnerName)})!
          </div>

          <div style="background:rgba(16,185,129,0.12); border-left:3px solid #10b981; border-radius:8px; padding:8px 10px; font-size:12.5px; line-height:1.5;">
            <strong style="color:#6ee7b7;">📈 ${this.escapeHtml(winnerName)} (Menang - Total ${scoreWinner} Kerang):</strong><br>
            • Mengisi penuh seluruh <strong>7 lubang</strong> (49 kerang).<br>
            • 🐚 Kelebihan kerang sendiri (${winnerExcess} kerang) + sisa ${remainderLoser} kerang pemain kalah = <strong>${totalWinnerStore} kerang</strong>.<br>
            • 🏠 <strong>${totalWinnerStore} kerang langsung masuk ke Rumah/Lumbung ${this.escapeHtml(winnerName)}</strong> sebagai modal awal Ronde ${this.currentRound + 1}!
          </div>
        </div>
      `;
    } else if (winnerSide === 'top') {
      // Top Won, Bottom Lost
      const winnerName = topName;
      const loserName = bottomName;
      const scoreWinner = scoreTop;
      const scoreLoser = scoreBottom;

      const activePitsLoser = Math.min(7, Math.floor(scoreLoser / 7));
      const burntCountLoser = 7 - activePitsLoser;
      const remainderLoser = scoreLoser % 7;
      const winnerExcess = scoreWinner - 49;
      const totalWinnerStore = winnerExcess + remainderLoser;

      // Pits closest to Bottom store (index 0 up) filled first; furthest burnt
      for (let i = 0; i < 7; i++) {
        if (i < activePitsLoser) {
          newBurnt.bottom[i] = false;
          newBottomPits[i] = 7;
        } else {
          newBurnt.bottom[i] = true;
          newBottomPits[i] = 0;
        }
      }

      // Winner fills all 7 pits with 7 shells
      for (let i = 0; i < 7; i++) {
        newBurnt.top[i] = false;
        newTopPits[i] = 7;
      }

      newStoreBottom = 0;
      newStoreTop = totalWinnerStore;

      summaryHtml = `
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div style="background:rgba(239,68,68,0.12); border-left:3px solid #ef4444; border-radius:8px; padding:8px 10px; font-size:12.5px; line-height:1.5;">
            <strong style="color:#fca5a5;">📉 ${this.escapeHtml(loserName)} (Kalah - Total ${scoreLoser} Kerang):</strong><br>
            • Mengisi <strong>${activePitsLoser} lubang</strong> dengan masing-masing genap 7 kerang (${activePitsLoser * 7} kerang).<br>
            • 🔥 <strong>${burntCountLoser} lubang dikosongkan (hangus/dilewati)</strong> karena tidak genap 7.<br>
            • 🐚 Sisa <strong>${remainderLoser} kerang</strong> yang tidak genap 7 masuk ke rumah pemenang (${this.escapeHtml(winnerName)})!
          </div>

          <div style="background:rgba(16,185,129,0.12); border-left:3px solid #10b981; border-radius:8px; padding:8px 10px; font-size:12.5px; line-height:1.5;">
            <strong style="color:#6ee7b7;">📈 ${this.escapeHtml(winnerName)} (Menang - Total ${scoreWinner} Kerang):</strong><br>
            • Mengisi penuh seluruh <strong>7 lubang</strong> (49 kerang).<br>
            • 🐚 Kelebihan kerang sendiri (${winnerExcess} kerang) + sisa ${remainderLoser} kerang pemain kalah = <strong>${totalWinnerStore} kerang</strong>.<br>
            • 🏠 <strong>${totalWinnerStore} kerang langsung masuk ke Rumah/Lumbung ${this.escapeHtml(winnerName)}</strong> sebagai modal awal Ronde ${this.currentRound + 1}!
          </div>
        </div>
      `;
    } else {
      for (let i = 0; i < 7; i++) {
        newTopPits[i] = 7;
        newBottomPits[i] = 7;
      }
      summaryHtml = `Kedua pemain seimbang (49 kerang). Semua lubang terisi 7 kerang kembali.`;
    }

    this.nextRoundDescEl.innerHTML = summaryHtml;

    this.nextRoundData = {
      roundNumber: this.currentRound + 1,
      burntPits: newBurnt,
      topPits: newTopPits,
      bottomPits: newBottomPits,
      storeTop: newStoreTop,
      storeBottom: newStoreBottom,
      winner: winnerSide,
      summary: summaryHtml
    };
  }

  applyNextRound(data) {
    this.hideModal(this.winnerModal);
    this.currentRound = data.roundNumber;
    this.burntPits = data.burntPits;
    this.topPits = data.topPits;
    this.bottomPits = data.bottomPits;
    this.storeTop = data.storeTop;
    this.storeBottom = data.storeBottom;
    this.isAnimating = false;
    this.remoteMoveQueue = [];
    this.hideFloatingHand();
    this.clearAllHighlights();

    this.updateRoundBadge();
    this.updatePOV();
    this.updateBoardDisplay();

    this.clearLog();
    this.addLog(`=== MEMULAI RONDE ${this.currentRound} ===`, 'bonus');
    if (data.winner === 'bottom') {
      const winnerName = this.gameMode === 'online' ? (this.myRole === 'bottom' ? `${this.playerName} (Anda)` : `${this.opponent.name} (Lawan)`) : 'Player Bawah';
      this.addLog(`🏠 Lumbung ${winnerName} terisi ${this.storeBottom} kerang (kelebihan menang + sisa tidak genap 7 pemain kalah).`, 'boom');
    } else if (data.winner === 'top') {
      const winnerName = this.gameMode === 'online' ? (this.myRole === 'top' ? `${this.playerName} (Anda)` : `${this.opponent.name} (Lawan)`) : 'Player Atas';
      this.addLog(`🏠 Lumbung ${winnerName} terisi ${this.storeTop} kerang (kelebihan menang + sisa tidak genap 7 pemain kalah).`, 'boom');
    }
    this.addLog(`Lubang hangus telah dikosongkan & ditutup. Lubang tersebut wajib dilewati saat memutar.`, 'system');

    const starter = data.startingPlayer || (data.winner === 'bottom' ? 'bottom' : (data.winner === 'top' ? 'top' : (Math.random() < 0.5 ? 'bottom' : 'top')));
    this.currentPlayer = starter;
    this.showCoinTossAnimation(starter);
  }

  triggerAIMove() {
    if (this.currentPlayer !== 'top' || !this.isAnimating) {
      const validIndices = [];
      for (let i = 0; i < 7; i++) {
        if (!this.burntPits.top[i] && this.topPits[i] > 0) validIndices.push(i);
      }

      if (validIndices.length === 0) {
        this.switchPlayer();
        return;
      }

      let chosenIdx = validIndices[0];
      let bestScore = -999;

      for (const idx of validIndices) {
        const count = this.topPits[idx];
        let score = count;
        const distToStore = 7 - idx;
        if (count === distToStore) score += 50;
        if (!this.burntPits.bottom[idx] && this.bottomPits[idx] >= 4) score += 10;

        if (score > bestScore) {
          bestScore = score;
          chosenIdx = idx;
        }
      }

      this.executeMove('top', chosenIdx);
    }
  }

  async triggerBoomEffect(capturedCount, playerName) {
    window.soundFx.playCapture();
    this.boomCountEl.textContent = `+${capturedCount} Kerang Masuk Lumbung!`;
    this.boomOverlayEl.classList.add('show');
    document.getElementById('congklak-board').style.animation = 'boomShake 0.5s ease-in-out';
    await this.sleep(900);
    this.boomOverlayEl.classList.remove('show');
    document.getElementById('congklak-board').style.animation = '';
  }

  updateBoardDisplay(target = null) {
    if (this.storeBottom !== this.cachedStoreBottom) {
      this.storeLeftEl.textContent = this.storeBottom;
      this.cachedStoreBottom = this.storeBottom;
    }
    if (this.storeTop !== this.cachedStoreTop) {
      this.storeRightEl.textContent = this.storeTop;
      this.cachedStoreTop = this.storeTop;
    }

    // Targeted single slot update during sowing
    if (target) {
      if (target.type === 'pit') {
        this.updateSinglePitDisplay(target.side, target.index);
      }
      return;
    }

    // Full state diff check
    for (let i = 0; i < 7; i++) {
      this.updateSinglePitDisplay('top', i);
      this.updateSinglePitDisplay('bottom', i);
    }
  }

  updateSinglePitDisplay(side, i) {
    if (!this.pitElements || !this.pitElements[side] || !this.pitElements[side][i]) return;

    const isBurnt = this.burntPits[side][i];
    const count = isBurnt ? 0 : (side === 'top' ? this.topPits[i] : this.bottomPits[i]);
    const prevCount = this.cachedCounts[side][i];
    const prevBurnt = this.cachedBurnt[side][i];

    if (count === prevCount && isBurnt === prevBurnt) {
      return; // Skip DOM update if unchanged
    }

    this.cachedCounts[side][i] = count;
    this.cachedBurnt[side][i] = isBurnt;

    const pitEl = this.pitElements[side][i];
    if (isBurnt !== prevBurnt) {
      pitEl.classList.toggle('burnt', isBurnt);
    }

    const badgeEl = this.badgeElements[side][i];
    if (badgeEl) badgeEl.textContent = count;

    const container = this.shellContainerElements[side][i];
    if (container) {
      this.renderShellsGraphic(container, count);
    }
  }

  renderShellsGraphic(container, count) {
    if (!container) return;
    const visualNodes = Math.min(count, 12);
    if (container._visualCount === visualNodes) {
      return; // Skip innerHTML wipe if count didn't cross visual threshold
    }
    container._visualCount = visualNodes;
    container.innerHTML = '';

    for (let i = 0; i < visualNodes; i++) {
      const shell = document.createElement('div');
      shell.className = 'shell-node';

      const angle = (i / visualNodes) * 2 * Math.PI + (i * 0.4);
      const radius = visualNodes > 1 ? Math.min(18, 5 + visualNodes * 1.2) : 0;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const rot = (i * 47) % 360;

      shell.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${rot}deg)`;
      container.appendChild(shell);
    }
  }

  updateTurnUI() {
    const isBottom = this.currentPlayer === 'bottom';
    this.cardBottomEl.classList.toggle('active', isBottom);
    this.cardTopEl.classList.toggle('active', !isBottom);

    let playerName;
    if (this.gameMode === 'online') {
      const isMyTurn = this.currentPlayer === this.myRole;
      playerName = isMyTurn ? `${this.playerName} (Anda)` : `${this.opponent.name} (Lawan)`;
    } else {
      playerName = isBottom ? 'Player Bawah (P1)' : (this.gameMode === 'ai' ? 'Komputer AI (P2)' : 'Player Atas (P2)');
    }

    this.turnMessageEl.innerHTML = this.isAnimating 
      ? `Sedang memutar kerang...` 
      : `Giliran: <span style="color:#ffd700">${playerName}</span> — Silakan pilih lubang`;

    for (let i = 0; i < 7; i++) {
      const topPit = this.pitElements ? this.pitElements.top[i] : document.getElementById(`pit-top-${i}`);
      const bottomPit = this.pitElements ? this.pitElements.bottom[i] : document.getElementById(`pit-bottom-${i}`);

      const isTopBurnt = this.burntPits.top[i];
      const isBottomBurnt = this.burntPits.bottom[i];

      if (this.gameMode === 'online') {
        const canPickTop = !this.isAnimating && !isBottom && this.myRole === 'top' && !isTopBurnt && this.topPits[i] > 0;
        const canPickBottom = !this.isAnimating && isBottom && this.myRole === 'bottom' && !isBottomBurnt && this.bottomPits[i] > 0;
        if (topPit) topPit.classList.toggle('selectable', canPickTop);
        if (bottomPit) bottomPit.classList.toggle('selectable', canPickBottom);
      } else {
        const canPickTop = !this.isAnimating && !isBottom && !isTopBurnt && this.topPits[i] > 0 && this.gameMode !== 'ai';
        const canPickBottom = !this.isAnimating && isBottom && !isBottomBurnt && this.bottomPits[i] > 0;
        if (topPit) topPit.classList.toggle('selectable', canPickTop);
        if (bottomPit) bottomPit.classList.toggle('selectable', canPickBottom);
      }
    }
  }

  highlightSlot(element) {
    this.clearAllHighlights();
    if (!element) return;
    if (element.classList.contains('pit')) {
      element.classList.add('active-sowing');
    } else if (element.classList.contains('storehouse')) {
      element.classList.add('highlight');
    }
  }

  clearAllHighlights() {
    document.querySelectorAll('.pit.active-sowing').forEach(p => p.classList.remove('active-sowing'));
    document.querySelectorAll('.storehouse.highlight').forEach(s => s.classList.remove('highlight'));
  }

  showFloatingHand(targetEl, count) {
    const rect = targetEl.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top);
    this.handHudEl.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -120%)`;
    this.handCountEl.textContent = count;
    this.handHudEl.classList.add('visible');
  }

  updateFloatingHand(targetEl, count) {
    const rect = targetEl.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top);
    this.handHudEl.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -120%)`;
    this.handCountEl.textContent = count;
  }

  hideFloatingHand() {
    this.handHudEl.classList.remove('visible');
  }

  flashBanner(msg) {
    this.turnMessageEl.innerHTML = `<span style="color:#ffd700; font-size:18px;">✨ ${msg}</span>`;
  }

  addLog(message, type = 'system') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    entry.innerHTML = `<span style="opacity:0.6; font-size:11px;">[${time}]</span> ${message}`;
    this.logStreamEl.appendChild(entry);
    this.logStreamEl.scrollTop = this.logStreamEl.scrollHeight;
  }

  showModal(modal) {
    if (modal) modal.classList.add('active');
  }

  hideModal(modal) {
    if (modal) modal.classList.remove('active');
  }

  /**
   * Tampilkan dialog konfirmasi dengan UI mewah bertema Nusantara
   * @param {Object} options
   * @param {string} [options.title='Konfirmasi Tindakan'] Judul dialog
   * @param {string} [options.message='Apakah Anda yakin ingin melanjutkan?'] Pesan dialog
   * @param {string} [options.confirmText='✓ Ya, Lanjutkan'] Teks tombol konfirmasi
   * @param {string} [options.cancelText='✕ Batal'] Teks tombol batal
   * @param {'primary'|'danger'|'warning'|'success'|'info'} [options.type='warning'] Tipe styling dialog
   * @param {string} [options.icon='⚠️'] Icon emoji
   * @returns {Promise<boolean>}
   */
  showConfirm({
    title = 'Konfirmasi Tindakan',
    message = 'Apakah Anda yakin ingin melanjutkan?',
    confirmText = '✓ Ya, Lanjutkan',
    cancelText = '✕ Batal',
    type = 'warning',
    icon = '⚠️'
  } = {}) {
    return new Promise((resolve) => {
      const modal = this.confirmModal || document.getElementById('confirm-modal');
      const titleEl = document.getElementById('confirm-title');
      const messageEl = document.getElementById('confirm-message');
      const iconEl = document.getElementById('confirm-icon');
      const iconWrapper = document.getElementById('confirm-icon-wrapper');
      const btnOk = document.getElementById('btn-confirm-ok');
      const btnCancel = document.getElementById('btn-confirm-cancel');
      const btnClose = document.getElementById('btn-close-confirm');

      if (!modal) {
        resolve(window.confirm(message));
        return;
      }

      if (titleEl) titleEl.textContent = title;
      if (messageEl) messageEl.textContent = message;
      if (iconEl) iconEl.textContent = icon;
      if (iconWrapper) iconWrapper.className = `confirm-icon-wrapper ${type}`;

      if (btnOk) {
        btnOk.textContent = confirmText;
        btnOk.className = type === 'danger' ? 'btn btn-danger confirm-btn' : 'btn btn-primary confirm-btn';
      }

      if (btnCancel) {
        btnCancel.style.display = 'inline-flex';
        btnCancel.textContent = cancelText;
      }

      let isDone = false;
      const cleanup = () => {
        if (isDone) return;
        isDone = true;
        this.hideModal(modal);
        if (btnOk) btnOk.removeEventListener('click', onOk);
        if (btnCancel) btnCancel.removeEventListener('click', onCancel);
        if (btnClose) btnClose.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
        window.removeEventListener('keydown', onKeyDown);
      };

      const onOk = () => {
        cleanup();
        if (window.soundFx && window.soundFx.playStore) {
          window.soundFx.playStore();
        }
        resolve(true);
      };

      const onCancel = () => {
        cleanup();
        resolve(false);
      };

      const onBackdrop = (e) => {
        if (e.target === modal) {
          onCancel();
        }
      };

      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          onCancel();
        } else if (e.key === 'Enter') {
          onOk();
        }
      };

      if (btnOk) btnOk.addEventListener('click', onOk);
      if (btnCancel) btnCancel.addEventListener('click', onCancel);
      if (btnClose) btnClose.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
      window.addEventListener('keydown', onKeyDown);

      this.showModal(modal);
      if (btnOk) btnOk.focus();
    });
  }

  /**
   * Tampilkan dialog pemberitahuan / alert dengan UI mewah bertema Nusantara
   * @param {Object} options
   * @param {string} [options.title='Pemberitahuan']
   * @param {string} [options.message='']
   * @param {string} [options.buttonText='✓ Mengerti']
   * @param {'primary'|'danger'|'warning'|'success'|'info'} [options.type='info']
   * @param {string} [options.icon='ℹ️']
   * @returns {Promise<void>}
   */
  showAlert({
    title = 'Pemberitahuan',
    message = '',
    buttonText = '✓ Mengerti',
    type = 'info',
    icon = 'ℹ️'
  } = {}) {
    return new Promise((resolve) => {
      const modal = this.confirmModal || document.getElementById('confirm-modal');
      const titleEl = document.getElementById('confirm-title');
      const messageEl = document.getElementById('confirm-message');
      const iconEl = document.getElementById('confirm-icon');
      const iconWrapper = document.getElementById('confirm-icon-wrapper');
      const btnOk = document.getElementById('btn-confirm-ok');
      const btnCancel = document.getElementById('btn-confirm-cancel');
      const btnClose = document.getElementById('btn-close-confirm');

      if (!modal) {
        window.alert(message);
        resolve();
        return;
      }

      if (titleEl) titleEl.textContent = title;
      if (messageEl) messageEl.textContent = message;
      if (iconEl) iconEl.textContent = icon;
      if (iconWrapper) iconWrapper.className = `confirm-icon-wrapper ${type}`;

      if (btnOk) {
        btnOk.textContent = buttonText;
        btnOk.className = 'btn btn-primary confirm-btn';
      }

      if (btnCancel) {
        btnCancel.style.display = 'none';
      }

      let isDone = false;
      const cleanup = () => {
        if (isDone) return;
        isDone = true;
        this.hideModal(modal);
        if (btnOk) btnOk.removeEventListener('click', onOk);
        if (btnClose) btnClose.removeEventListener('click', onOk);
        modal.removeEventListener('click', onBackdrop);
        window.removeEventListener('keydown', onKeyDown);
      };

      const onOk = () => {
        cleanup();
        if (window.soundFx && window.soundFx.playDrop) {
          window.soundFx.playDrop();
        }
        resolve();
      };

      const onBackdrop = (e) => {
        if (e.target === modal) {
          onOk();
        }
      };

      const onKeyDown = (e) => {
        if (e.key === 'Escape' || e.key === 'Enter') {
          onOk();
        }
      };

      if (btnOk) btnOk.addEventListener('click', onOk);
      if (btnClose) btnClose.addEventListener('click', onOk);
      modal.addEventListener('click', onBackdrop);
      window.addEventListener('keydown', onKeyDown);

      this.showModal(modal);
      if (btnOk) btnOk.focus();
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.congklak = new CongklakGame();
});
