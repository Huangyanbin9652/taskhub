// ===== 八十分 前端 UI + AI =====
// 依赖 eightzero.js 引擎，驱动牌桌渲染、出牌、AI

(function(){
  const EZ = window.EightZero;
  let selectedTrump = null;
  let mySelectedCards = [];   // 玩家选中的牌（出牌）
  let selectedBottom = [];    // 扣底选择的牌
  let bottoming = false;      // 是否处于扣底阶段
  let mySeat = 0;

  // ===== 主渲染入口（页面切换到 game 时调用）=====
  window.GameUI = {
    renderLobby,
    renderTable,
    renderRules: showGameRules,
    showGameRules,
    loadGameHistory,
    currentState: null,
    // 交互
    declareTrump,
    selectCard,
    confirmPlay,
    newGame,
  };

  // 大厅页
  function renderLobby(){
    if(!currentUser){ return `<div class="empty" style="padding-top:80px;"><div class="emoji">🔒</div><p>请先登录才能玩八十分</p><br><button class="btn btn-primary" style="max-width:200px;margin:0 auto;" onclick="navigate('auth')">去登录</button></div>`; }
    return `
      <div class="hero">
        <h1>🃏 八十分（升级）</h1>
        <p>经典升级扑克，2副牌108张 · 你和3个AI对战</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:8px;">
        <button class="btn btn-primary" onclick="startGame('2')">▶️ 开始新牌局（打 2）</button>
        <button class="btn btn-outline" onclick="showGameRules()">📖 游戏规则</button>
        <button class="btn btn-outline" onclick="loadGameHistory()">🏆 我的战绩</button>
      </div>
      <div id="game-history" style="margin-top:16px;"></div>
      <div id="game-status" style="margin-top:16px;"></div>
    `;
  }

  // 规则说明
  function showGameRules(){
    const el = document.getElementById('page-content');
    el.innerHTML = `
      <div class="detail-back" onclick="navigate('game')">← 返回</div>
      <h2 style="font-size:1.2rem;margin-bottom:12px;">📖 游戏规则</h2>
      <div class="task-card" style="line-height:1.8;font-size:0.88rem;">
        <b>基础</b><br>2副牌108张，4人两两组队，对家搭档。每人25张，8张底牌。<br><br>
        <b>计分牌</b><br>5=5分，10=10分，K=10分，共200分。<br><br>
        <b>级别</b><br>2→3→...→J→Q→K→A→2，共13级。<br><br>
        <b>叫主</b><br>先亮者为定主花色。主牌=当前级别牌(全花色)+主花色牌。大小王为最大主牌。<br><br>
        <b>升降级</b>（看闲家抓分）<br>
        0分=大光，庄家升5级<br>
        1-39分=小光，庄家升3级<br>
        40-79分，庄家升1级<br>
        80-119分，庄家下台闲家上台不升级<br>
        120-159分，闲家升1级<br>
        160-199分，闲家升3级<br>
        200分，闲家升5级<br>
        <b>原打2时闲家赢不升级（2必打）</b><br><br>
        <b>必打级：2、J、A</b><br>升级不能跳过，被阻挡部分由对方退级。<br><br>
        <b>勾底</b>（打J或A时）<br>
        正=主花色，负=其他花色。<br>
        闲家最后一轮出正J且最大→庄家勾到底(回2)<br>
        闲家最后一轮出负J且最大→庄家勾三级<br>
        闲家最后一轮出正A且最大→庄家尖三级<br>
        负A无效。<br>
        勾底后庄家继续坐庄只是降级。<br><br>
        <b>抠底</b><br>闲家最后一轮赢且底牌有分，底牌分×2。
      </div>
    `;
  }

  // 牌桌主界面
  function renderTable(){
    const s = EZ.STATE;
    const hands = s.playerHands;
    // 玩家手牌（按牌力排序）
    const myHand = [...hands[0]].sort((a,b)=>cardSortKey(a)-cardSortKey(b));
    return `
      <div class="game-table">
        ${renderTopArea(s)}
        <div class="game-center" id="game-center">${renderCenter(s)}</div>
        <div class="my-hand" id="my-hand">${renderHand(myHand)}</div>
      </div>
      <div class="game-status" id="game-status">${renderStatus(s)}</div>
    `;
  }

  function cardSortKey(card){
    return EZ.cardPower(card);
  }

  // 顶部区域：对家、上家、下家、级别、计分
  function renderTopArea(s){
    return `
      <div class="game-info">
        <div class="game-level">打 <b>${s.level}</b> ${s.trumpSuit?('｜主:'+EZ.SUIT_CH[s.trumpSuit]):'（等待叫主）'}</div>
        <div class="game-score">
          <span class="sc-me">我方 ${s.scores[0]}</span>
          <span class="sc-them">对方 ${s.scores[1]}</span>
        </div>
        <div class="game-round">第 ${s.trickCount+1}/13 轮</div>
      </div>
      <div class="opponents">
        <div class="oppo oppo-top">对家(庄家位)<br>${s.players[2]} <span class="hand-count">${s.playerHands[2].length}张</span></div>
        <div class="oppo oppo-right">下家<br>${s.players[1]} <span class="hand-count">${s.playerHands[1].length}张</span></div>
        <div class="oppo oppo-left">上家<br>${s.players[3]} <span class="hand-count">${s.playerHands[3].length}张</span></div>
      </div>
    `;
  }

  // 中央区域：本轮出的牌 + 叫主按钮
  function renderCenter(s){
    let html = '';
    if(s.phase === 'bidding'){
      html = `<div class="bid-area">
        <p>请叫主（先亮者为主）</p>
        <div class="bid-suits">
          ${['S','H','D','C'].map(suit=>`<button class="bid-suit" onclick="GameUI.declareTrump('${suit}')">${EZ.SUIT_NAMES[suit]}</button>`).join('')}
        </div>
      </div>`;
    } else {
      // 已出的牌
      html = `<div class="trick-area">`;
      if(s.trick.length){
        for(const p of s.trick){
          html += `<div class="trick-card pos-${p.player}">${cardFace(p.card)}</div>`;
        }
      }
      html += `</div>`;
    }
    return html;
  }

  function cardFace(card){
    const s = EZ.STATE;
    const cs = card[0];
    const cr = card.slice(1);
    const isTr = EZ.isTrump(card);
    if(cs==='J') return `<div class="card joker-big">🃏</div>`;
    if(cs==='K') return `<div class="card joker-small">👑</div>`;
    return `<div class="card ${isTr?'card-trump':'card-'+(cs==='H'||cs==='D'?'red':'black')}">${EZ.SUIT_NAMES[cs]}${cr}</div>`;
  }

  // 玩家手牌
  function renderHand(hand){
    return hand.map((card,i)=>`
      <div class="hand-card" data-card="${card}" data-idx="${i}" onclick="GameUI.selectCard('${card}')">
        ${cardFaceMini(card)}
      </div>
    `).join('');
  }

  function cardFaceMini(card){
    const cs = card[0];
    const cr = card.slice(1);
    if(cs==='J') return `<div class="mini joker">🃏</div>`;
    if(cs==='K') return `<div class="mini joker">👑</div>`;
    const red = cs==='H'||cs==='D';
    return `<div class="mini ${red?'r':'b'}">${EZ.SUIT_NAMES[cs]}${cr}</div>`;
  }

  function renderStatus(s){
    if(s.phase==='ended'){
      const r = s.result;
      return `<div class="result-box">
        <div class="result-msg">${r.msg}</div>
        <div class="result-detail">闲家抓 ${r.yjScore} 分</div>
        ${r.nextLevel ? `<div class="result-next">下一局打 <b>${r.nextLevel}</b></div>` : ''}
        <div style="display:flex;gap:10px;margin-top:12px;">
          <button class="btn btn-primary" onclick="GameUI.newGame()">再来一局</button>
          <button class="btn btn-outline" onclick="navigate('game')">返回大厅</button>
        </div>
      </div>`;
    }
    if(s.phase==='playing'){
      // 判断当前是不是玩家出牌
      if(s.turn === 0){
        return `<div class="status-turn">轮到你出牌 <button class="btn btn-primary" style="max-width:120px;margin-left:8px;" onclick="GameUI.confirmPlay()">出牌</button></div>`;
      } else {
        return `<div class="status-wait">${s.players[s.turn]} 思考中...</div>`;
      }
    }
    return '';
  }

  // ===== 交互 =====
  function declareTrump(suit){
    EZ.declareTrump(suit);
    rerender();
    // 如果轮到 AI 出牌
    if(EZ.STATE.turn !== 0) aiTurn();
  }

  function selectCard(card){
    // 选择/取消选择
    if(EZ.STATE.phase !== 'playing') return;
    if(EZ.STATE.turn !== 0) return; // 不是玩家回合
    const idx = mySelectedCards.indexOf(card);
    const el = document.querySelector(`.hand-card[data-card="${card}"]`);
    if(idx > -1){
      mySelectedCards.splice(idx,1);
      el.classList.remove('selected');
    } else {
      mySelectedCards.push(card);
      el.classList.add('selected');
    }
  }

  // 确认出牌
  function confirmPlay(){
    if(EZ.STATE.phase !== 'playing' || EZ.STATE.turn !== 0) return;
    if(mySelectedCards.length === 0){ toast('请选择一张牌'); return; }
    const card = mySelectedCards[0];
    if(!EZ.playCard(0, card)){
      toast('不符合出牌规则，请重选');
      return;
    }
    mySelectedCards = [];
    // 检查是否一轮结束
    if(EZ.STATE.trick.length === 4){
      EZ.endTrick();
      if(EZ.STATE.phase === 'ended'){
        saveResult();
        rerender();
        return;
      }
    }
    rerender();
    // AI 回合
    aiTurn();
  }

  // AI 出牌主循环
  function aiTurn(){
    if(EZ.STATE.phase !== 'playing') return;
    if(EZ.STATE.turn === 0) return;
    const aiIdx = EZ.STATE.turn;
    const card = aiChooseCard(aiIdx);
    EZ.playCard(aiIdx, card);
    if(EZ.STATE.trick.length === 4){
      EZ.endTrick();
      if(EZ.STATE.phase === 'ended'){
        saveResult();
        rerender();
        return;
      }
    }
    rerender();
    // 继续 AI 或等玩家
    if(EZ.STATE.turn !== 0 && EZ.STATE.phase === 'playing'){
      setTimeout(aiTurn, 500);
    }
  }

  // AI 选牌策略（简化：跟首出花色/主牌）
  function aiChooseCard(aiIdx){
    const hand = EZ.STATE.playerHands[aiIdx];
    const leadSuit = EZ.STATE.currentTrickSuit;
    // 如果有首出花色，跟之
    if(leadSuit){
      const candidates = hand.filter(c => (leadSuit==='TRUMP' ? EZ.isTrump(c) : (c[0]===leadSuit)));
      if(candidates.length){
        return candidates.sort((a,b)=>EZ.cardPower(a)-EZ.cardPower(b))[0]; // 出最小
      }
    }
    // 无花色，出最小牌
    return hand.sort((a,b)=>EZ.cardPower(a)-EZ.cardPower(b))[0];
  }

  // 重新渲染
  function rerender(){
    const content = document.getElementById('page-content');
    if(content) content.innerHTML = renderTable();
    const status = document.getElementById('game-status');
    if(status) status.innerHTML = renderStatus(EZ.STATE);
  }

  // 新游戏
  function newGame(){
    mySelectedCards = [];
    EZ.startNewGame('2');
    rerender();
  }

  // 保存战绩
  async function saveResult(){
    try {
      await API.post('/api/game/records', {
        start_level: EZ.STATE.startLevel,
        end_level: EZ.STATE.level,
        result: EZ.STATE.result.result,
        yj_score: EZ.STATE.result.yjScore,
        msg: EZ.STATE.result.msg
      });
    } catch(e){}
  }

  // 战绩
  async function loadGameHistory(){
    const el = document.getElementById('game-history');
    if(!el) return;
    el.innerHTML = `<div class="empty"><div class="emoji">⏳</div><p>加载中...</p></div>`;
    const res = await API.get('/api/game/stats');
    if(res.error){ el.innerHTML = `<p style="color:var(--danger);">${res.error}</p>`; return; }
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px;">
        <div class="stat-card"><b>${res.games||0}</b><br>总局数</div>
        <div class="stat-card"><b>${res.wins||0}</b><br>我方胜</div>
        <div class="stat-card"><b>${res.dagguang||0}</b><br>大光</div>
      </div>
      <div id="game-records-list"></div>
    `;
    const listEl = document.getElementById('game-records-list');
    const rec = await API.get('/api/game/records');
    if(rec.records && rec.records.length){
      listEl.innerHTML = rec.records.slice(0,20).map(r=>`
        <div class="task-card" style="padding:10px 12px;font-size:0.82rem;">
          ${r.msg} <span style="color:var(--text-light);float:right;">${formatTime(r.created_at)}</span>
        </div>
      `).join('');
    } else {
      listEl.innerHTML = `<div class="empty"><div class="emoji">📭</div><p>暂无对局记录</p></div>`;
    }
  }
})();
