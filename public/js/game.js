// ===== 八十分 前端 UI + 驱动 =====
// 依赖 eightzero.js 引擎：发牌动画、亮主/反主、埋底、出牌交互、AI 调度

(function(){
  const EZ = window.EightZero;
  const FAST = () => !!window.__TEST_FAST__; // 测试加速开关
  const DEAL_MS = () => FAST() ? 12 : 120;    // 发牌间隔
  const AI_MS = () => FAST() ? 30 : 750;      // AI 思考
  const TRICK_MS = () => FAST() ? 40 : 600;   // 收墩停顿
  let mySelectedCards = [];   // 出牌选中
  let selectedBottom = [];    // 埋底选中
  let dealTimer = null;       // 发牌定时器
  let aiTimer = null;         // AI 出牌定时器
  let dealingStarted = false; // 本局是否已启动发牌

  window.GameUI = {
    renderLobby,
    renderTable,
    showGameRules,
    loadGameHistory,
    currentState: null,
    // 交互
    declareTrump,
    selectCard,
    confirmPlay,
    newGame,
    skipDealing,
    confirmBottom,
    restartDealing,
  };

  // ===== 大厅 =====
  function renderLobby(){
    if(!currentUser){ return `<div class="empty" style="padding-top:80px;"><div class="emoji">🔒</div><p>请先登录才能玩八十分</p><br><button class="btn btn-primary" style="max-width:200px;margin:0 auto;" onclick="navigate('auth')">去登录</button></div>`; }
    return `
      <div class="hero">
        <h1>🃏 八十分（升级）</h1>
        <p>经典拖拉机规则 · 逐张发牌 / 亮主反主 / 埋底 / 拖拉机连对</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:8px;">
        <button class="btn btn-primary" onclick="GameUI.newGame()">▶️ 开始新牌局（打 ${EZ.STATE.phase !== 'idle' ? EZ.STATE.level : '2'}）</button>
        <button class="btn btn-outline" onclick="GameUI.showGameRules()">📖 游戏规则</button>
        <button class="btn btn-outline" onclick="GameUI.loadGameHistory()">🏆 我的战绩</button>
      </div>
      <div id="game-history" style="margin-top:16px;"></div>
      <div id="game-status" style="margin-top:16px;"></div>
    `;
  }

  // ===== 规则 =====
  function showGameRules(){
    const el = document.getElementById('page-content');
    el.innerHTML = `
      <div class="detail-back" onclick="navigate('game')">← 返回</div>
      <h2 style="font-size:1.2rem;margin-bottom:12px;">📖 游戏规则（拖拉机完整规则）</h2>
      <div class="task-card" style="line-height:1.9;font-size:0.88rem;">
        <b>牌与阵营</b><br>2副牌108张（含大小王），4人两两组队，对家是队友。每人25张，8张底牌。你和AI轮庄。<br><br>        <b>发牌与报主</b><br>一张一张发牌。发牌过程中摸到<b>级牌</b>（当前打的那张点数）可以<b>报牌亮主</b>，先亮者定主花色；已有亮主后，持有<b>两张同花色级牌</b>可以<b>反主</b>。若无人亮主，发完后翻底牌第一张定主。<br><br>
        <b>埋底</b><br>庄家收下8张底牌（手牌变33张），再选8张扣为底牌。底牌有分被抠底时翻倍，慎埋分牌。<br><br>
        <b>主牌大小</b><br>大王 &gt; 小王 &gt; 主花色级牌 &gt; 其他花色级牌 &gt; 主花色A~3。级牌全花色都是主。<br><br>
        <b>出牌</b><br>可出<b>单张</b>、<b>对子</b>、<b>拖拉机</b>（同花色相邻连对，如5566、778899，最多四连对）。主牌中王对、级牌对、主花色连对也构成拖拉机。<br>
        跟牌规则：必须跟首出花色；首出对子时手里有对必跟对；首出拖拉机时有拖拉机必跟、没有则尽量跟对；无该花色可垫牌或用主牌毙。<br><br>
        <b>计分</b><br>5=5分、10=10分、K=10分，全场共200分。<b>只有闲家抓分才算数</b>，庄家赢墩收走的分仅消耗不给对方。<br><br>
        <b>升降级</b>（看闲家抓分）<br>
        0分 = 大光，庄家升5级<br>
        1-39分 = 小光，庄家升3级<br>
        40-79分 = 庄家升1级<br>
        80-119分 = 闲家上台，不升级<br>
        120-159分 = 闲家升1级<br>
        160-199分 = 闲家升3级<br>
        ≥200分 = 闲家升5级<br>
        <b>打2必打</b>：原打2时闲家赢不升级。<br><br>
        <b>必打级 2、J、A</b><br>升级不能跳过，被阻挡时只能停在必打级。<br><br>
        <b>勾底</b>（打J或A时，闲家赢最后一墩且最大牌是级别牌）<br>
        正J（主花色J）→ 庄家勾到底，从2重打<br>
        负J → 庄家勾三级，继续坐庄<br>
        正A → 尖三级，庄家继续坐庄<br>
        负A无效。勾底后庄家不换。<br><br>
        <b>抠底</b><br>闲家赢最后一墩，底牌分数×2计入闲家。
      </div>
    `;
  }

  // ===== 牌桌 =====
  function renderTable(){
    const s = EZ.STATE;
    // 进入牌桌时若在发牌阶段且未启动动画 → 启动
    if(s.phase === 'dealing' && !dealingStarted){
      dealingStarted = true;
      setTimeout(startDealing, 50);
    }
    let body = '';
    if(s.phase === 'dealing') body = renderDealing(s);
    else if(s.phase === 'bottoming') body = renderBottoming(s);
    else if(s.phase === 'playing' || s.phase === 'ended') body = renderPlaying(s);
    else body = renderDealing(s);
    return `
      <div class="game-table">
        ${renderGameInfo(s)}
        ${renderOpponents(s)}
        <div class="game-center" id="game-center">${body}</div>
        <div class="my-hand" id="my-hand">${renderHand(sortHand(s.playerHands[0]))}</div>
      </div>
      <div class="game-status" id="game-status">${renderStatus(s)}</div>
    `;
  }

  // 顶部信息栏（id 定点更新，绝不整块重建 opponents）
  function renderGameInfo(s){
    const trump = s.trumpSuit ? `主 ${EZ.SUIT_CH[s.trumpSuit]}` : '等待定主';
    return `
      <div class="game-info" id="game-info">
        <div class="game-level">打 <b>${s.level}</b> ｜ ${trump}</div>
        <div class="game-score"><span class="sc-them">闲家 ${s.yjScore} 分</span><span class="sc-note">/80 上台</span></div>
        <div class="game-round">${s.phase==='playing' ? `第 ${s.trickCount+1} 轮` : (s.phase==='dealing' ? `发牌 ${s.dealCount}/100` : '')}</div>
      </div>
    `;
  }

  // 三家信息（牌数 span 带 id，发牌时只更新文本）
  function renderOpponents(s){
    const dealerTag = i => i === s.dealer ? '<span class="dealer-tag">庄</span>' : '';
    return `
      <div class="opponents">
        <div class="oppo oppo-top">${dealerTag(2)}对家<br>${s.players[2]} <span class="hand-count" id="hand-count-2">${s.playerHands[2].length}张</span></div>
        <div class="oppo oppo-right">${dealerTag(1)}下家<br>${s.players[1]} <span class="hand-count" id="hand-count-1">${s.playerHands[1].length}张</span></div>
        <div class="oppo oppo-left">${dealerTag(3)}上家<br>${s.players[3]} <span class="hand-count" id="hand-count-3">${s.playerHands[3].length}张</span></div>
      </div>
    `;
  }

  // ===== 发牌阶段 =====
  function renderDealing(s){
    let html = `<div class="deal-info">🃏 发牌中…（${s.dealCount}/100）</div>`;
    if(s.trumpSuit){
      const who = s.trumpDeclaredBy >= 0 ? s.players[s.trumpDeclaredBy] : '底牌';
      const how = s.trumpDeclaredCount === 2 ? '反主' : '报主';
      html += `<div class="trump-declared">主：${EZ.SUIT_CH[s.trumpSuit]}（${who}${s.trumpDeclaredCount ? ' '+how : ' 翻底'}）</div>`;
    }
    // 亮主 / 反主按钮
    const canDec = EZ.canDeclare(0);
    const canOvr = EZ.canOverride(0);
    if(canDec.length || canOvr.length){
      html += `<div class="bid-area"><p>${canOvr.length ? '可反主（两张同花色级牌）' : '摸到级牌可报主'}</p><div class="bid-suits">`;
      for(const suit of canDec) html += `<button class="bid-suit" onclick="GameUI.declareTrump('${suit}',1)">${EZ.SUIT_NAMES[suit]} 报主</button>`;
      for(const suit of canOvr) html += `<button class="bid-suit bid-override" onclick="GameUI.declareTrump('${suit}',2)">${EZ.SUIT_NAMES[suit]} 反主</button>`;
      html += `</div></div>`;
    }
    html += `<div style="margin-top:10px;"><button class="btn btn-outline" style="max-width:180px;font-size:0.8rem;" onclick="GameUI.skipDealing()">⏩ 跳过发牌</button></div>`;
    return html;
  }

  // ===== 埋底阶段 =====
  function renderBottoming(s){
    if(s.dealer !== 0){
      // AI 庄家自动埋底（应在进入时已处理）
      return `<div class="deal-info">🤖 AI 庄家埋底中…</div>`;
    }
    const bottomCards = s.bottom.map(c => cardFace(c, true)).join('');
    const handCount = s.playerHands[0].length;
    return `
      <div class="deal-info" id="bottom-count">📥 你是庄家：已收 8 张底牌入手（现 ${handCount} 张），请选 <b>8 张</b> 埋底（已选 ${selectedBottom.length}/8），埋完剩 25 张开始出牌</div>
      <div class="bottom-pool"><span class="pool-label">底牌</span>${bottomCards}</div>
      <div style="margin-top:10px;">
        <button class="btn ${selectedBottom.length===8 ? 'btn-primary' : 'btn-outline'}" onclick="GameUI.confirmBottom()">✅ 确认埋底（${selectedBottom.length}/8）</button>
      </div>
    `;
  }

  // ===== 出牌阶段 =====
  function renderPlaying(s){
    let html = `<div class="trick-area">`;
    if(s.trick.length){
      for(const p of s.trick){
        html += `<div class="played-cards pos-${p.player}">${p.cards.map(c => cardFace(c)).join('')}</div>`;
      }
    } else if(s.phase === 'playing' && s.trickCount > 0){
      html += `<div class="deal-info" style="opacity:0.6;">等待首出…</div>`;
    }
    html += `</div>`;
    if(s.phase === 'ended'){
      const r = s.result;
      html += `<div class="result-box">
        <div class="result-msg">${r.msg}</div>
        <div class="result-detail">闲家抓 ${r.yjScore} 分 ｜ 底牌 ${s.bottomScore} 分</div>
        <div class="result-next">下一局打 <b>${r.nextLevel}</b>，${r.dealerKeepsNext ? '庄家继续坐庄' : `换 ${s.players[(s.dealer+1)%4]} 坐庄`}</div>
        <div style="display:flex;gap:10px;margin-top:12px;">
          <button class="btn btn-primary" onclick="GameUI.newGame(true)">再来一局</button>
          <button class="btn btn-outline" onclick="navigate('game')">返回大厅</button>
        </div>
      </div>`;
    }
    return html;
  }

  // ===== 状态条 =====
  function renderStatus(s){
    if(s.phase === 'dealing') return `<div class="status-wait">发牌中，摸到级牌可报主</div>`;
    if(s.phase === 'bottoming'){
      if(s.dealer === 0) return `<div class="status-turn">选 8 张牌埋底（点选下方手牌）</div>`;
      return `<div class="status-wait">AI 庄家埋底中…</div>`;
    }
    if(s.phase === 'playing'){
      if(s.turn === 0){
        const lead = s.trick.length > 0;
        return `<div class="status-turn">轮到你${lead ? '跟牌' : '出牌'}（可出单张/对子/拖拉机）
          <button class="btn btn-primary" style="max-width:110px;margin-left:8px;" onclick="GameUI.confirmPlay()">出牌</button></div>`;
      }
      return `<div class="status-wait">${s.players[s.turn]} 思考中…</div>`;
    }
    if(s.phase === 'ended') return `<div class="status-wait">本局结束</div>`;
    return '';
  }

  // ===== 手牌 =====
  function sortHand(hand){
    const suitOrder = c => {
      if(c === 'JB' || c === 'JS') return 900;
      const s = EZ.cardSuit(c);
      if(EZ.isTrump(c)) return 800;
      return ['S','H','D','C'].indexOf(s) * 100;
    };
    return hand.slice().sort((a,b) => (suitOrder(a) - suitOrder(b)) || (EZ.cardPower(a) - EZ.cardPower(b)));
  }

  function renderHand(hand){
    return hand.map(card => {
      return `<div class="hand-card" data-card="${card}" onclick="GameUI.selectCard('${card}', this)">
        ${cardFaceMini(card)}
      </div>`;
    }).join('');
  }

  function cardFace(card, small){
    const cs = EZ.cardSuit(card);
    const cr = EZ.cardRank(card);
    const isTr = EZ.isTrump(card);
    if(card === 'JB') return `<div class="card joker-big">🃏<span>大</span></div>`;
    if(card === 'JS') return `<div class="card joker-small">👑<span>小</span></div>`;
    return `<div class="card ${isTr ? 'card-trump' : (cs==='H'||cs==='D' ? 'red' : 'black')}">${EZ.SUIT_NAMES[cs]}<b>${cr}</b></div>`;
  }

  function cardFaceMini(card){
    const cs = EZ.cardSuit(card);
    const cr = EZ.cardRank(card);
    if(card === 'JB') return `<div class="mini joker">🃏大</div>`;
    if(card === 'JS') return `<div class="mini joker">👑小</div>`;
    const red = cs === 'H' || cs === 'D';
    const tr = EZ.isTrump(card);
    return `<div class="mini ${red ? 'r' : 'b'} ${tr ? 'mini-trump' : ''}">${EZ.SUIT_NAMES[cs]}${cr}</div>`;
  }

  // ===== 发牌动画 =====
  function startDealing(){
    stopDealTimer();
    dealTimer = setInterval(() => {
      const dealt = EZ.dealNext();
      if(!dealt){
        finishDealingFlow();
        return;
      }
      if(dealt.player !== 0) EZ.aiBidDecision(dealt.player);
      updateDealUI();
    }, DEAL_MS());
  }

  function finishDealingFlow(){
    stopDealTimer();
    // 幂等保护：发牌已自然完成（phase 已离开 dealing）时，跳过重复的收尾
    if(EZ.STATE.phase !== 'dealing') return;
    // 补齐 AI 未做的亮主决策（跳过时）
    for(let i=1;i<4;i++) EZ.aiBidDecision(i);
    EZ.finishDealing();
    enterBottoming();
    rerender();
  }

  function updateDealUI(){
    // 轻量定点更新：手牌 + 中央区 + 状态条 + 顶栏计数 + 三家牌数
    // 注意：顶栏只替换 #game-info 自身，三家牌数只改文本，
    // 绝不整块重建（否则 .opponents 会重复堆积，把牌桌撑坏）
    const s = EZ.STATE;
    const handEl = document.getElementById('my-hand');
    if(handEl) handEl.innerHTML = renderHand(sortHand(s.playerHands[0]));
    const center = document.getElementById('game-center');
    if(center) center.innerHTML = renderDealing(s);
    const status = document.getElementById('game-status');
    if(status) status.innerHTML = renderStatus(s);
    const top = document.getElementById('game-info');
    if(top) top.outerHTML = renderGameInfo(s); // 只替换顶栏自身（含发牌计数）
    for(let i=1;i<4;i++){
      const cnt = document.getElementById('hand-count-'+i);
      if(cnt) cnt.textContent = s.playerHands[i].length + '张';
    }
  }

  function stopDealTimer(){
    if(dealTimer){ clearInterval(dealTimer); dealTimer = null; }
  }

  function skipDealing(){
    while(EZ.dealNext()){}
    finishDealingFlow();
  }

  function enterBottoming(){
    const s = EZ.STATE;
    if(s.phase !== 'bottoming') return;
    if(s.dealer !== 0){
      // AI 庄家自动埋底
      EZ.aiBottomDecision(s.dealer);
      // 进入出牌
      startPlayLoop();
    } else {
      // 玩家庄家：收底牌进手（引擎 takeBottom）
      EZ.takeBottom();
      selectedBottom = [];
    }
  }

  // ===== 亮主/反主 =====
  function declareTrump(suit, mode){
    const ok = EZ.declareTrump(0, suit);
    if(!ok) toast('不符合亮主条件');
    updateDealUI();
  }

  // ===== 埋底交互 =====
  function updateBottomCount(){
    const s = EZ.STATE;
    const el = document.getElementById('bottom-count');
    if(el) el.innerHTML = `📥 你是庄家：已收 8 张底牌入手（现 ${s.playerHands[0].length} 张），请选 <b>8 张</b> 埋底（已选 ${selectedBottom.length}/8），埋完剩 25 张开始出牌`;
    // 确认按钮文案与样式同步
    const btn = document.querySelector('#game-center .btn');
    if(btn){
      btn.textContent = `✅ 确认埋底（${selectedBottom.length}/8）`;
      btn.className = selectedBottom.length === 8 ? 'btn btn-primary' : 'btn btn-outline';
    }
  }

  // ===== 出牌交互（基于 DOM 元素，支持同名的两张重复牌分别选中）=====
  function selectCard(card, el){
    const s = EZ.STATE;
    // 埋底阶段
    if(s.phase === 'bottoming' && s.dealer === 0){
      if(el && el.classList.contains('selected')){
        el.classList.remove('selected');
        const i = selectedBottom.indexOf(card);
        if(i > -1) selectedBottom.splice(i, 1);
      } else {
        if(selectedBottom.length >= 8){ toast('最多埋 8 张'); return; }
        if(el) el.classList.add('selected');
        selectedBottom.push(card);
      }
      updateBottomCount();
      return;
    }
    if(s.phase !== 'playing' || s.turn !== 0) return;
    if(el && el.classList.contains('selected')){
      el.classList.remove('selected');
      const i = mySelectedCards.indexOf(card);
      if(i > -1) mySelectedCards.splice(i, 1);
    } else {
      if(el) el.classList.add('selected');
      mySelectedCards.push(card);
    }
  }

  function confirmPlay(){
    const s = EZ.STATE;
    if(s.phase !== 'playing' || s.turn !== 0){ clearSelection(); return; }
    if(!mySelectedCards.length){ toast('请选择要出的牌'); return; }
    const check = EZ.validatePlay(0, mySelectedCards);
    if(!check.ok){
      toast(check.msg);
      clearSelection(); // 校验失败：清空选择，让玩家重选
      return;
    }
    EZ.playCards(0, mySelectedCards);
    mySelectedCards = [];
    afterOnePlay();
  }

  // 清空出牌选择（含 DOM 选中态）
  function clearSelection(){
    mySelectedCards = [];
    document.querySelectorAll('#my-hand .hand-card.selected').forEach(e => e.classList.remove('selected'));
  }

  function confirmBottom(){
    if(selectedBottom.length !== 8){ toast('需选满 8 张埋底'); return; }
    const ok = EZ.setBottom(0, selectedBottom);
    if(!ok){ toast('埋底失败'); return; }
    selectedBottom = [];
    startPlayLoop();
    rerender();
  }

  function afterOnePlay(){
    const s = EZ.STATE;
    if(s.trick.length === 4){
      setTimeout(() => {
        EZ.endTrick();
        if(s.phase === 'ended'){ saveResult(); rerender(); return; }
        rerender();
        startPlayLoop();
      }, TRICK_MS());
      rerender();
      return;
    }
    rerender();
    startPlayLoop();
  }

  // AI 出牌循环
  function startPlayLoop(){
    stopAiTimer();
    const s = EZ.STATE;
    if(s.phase !== 'playing') return;
    if(s.turn === 0){ mySelectedCards = []; rerender(); return; }
    const expected = s.turn; // 锁定预期出牌人
    aiTimer = setTimeout(() => {
      // 竞态保护：执行时回合已变化（收墩推进等），丢弃本次调用按最新状态重新调度
      if(EZ.STATE.phase !== 'playing' || EZ.STATE.turn !== expected){
        startPlayLoop();
        return;
      }
      const idx = expected;
      const cards = EZ.aiChoosePlay(idx);
      const check = EZ.validatePlay(idx, cards);
      if(!check.ok){
        // 兜底：合法牌集合
        const fallback = legalFallback(idx);
        const r = EZ.playCards(idx, fallback);
        if(!r.ok){
          // 兜底仍失败：说明状态又变了，重新调度
          startPlayLoop();
          return;
        }
      } else {
        EZ.playCards(idx, cards);
      }
      afterOnePlay();
    }, AI_MS());
  }

  // AI 出牌兜底（保证合法）
  function legalFallback(idx){
    const s = EZ.STATE;
    const hand = s.playerHands[idx];
    if(s.trick.length === 0) return [hand.sort((a,b)=>EZ.cardPower(a)-EZ.cardPower(b))[0]];
    const leadCards = s.trick[0].cards;
    const n = leadCards.length;
    const leadSuit = EZ.suitOfLead(leadCards);
    const inSuit = c => leadSuit === 'T' ? EZ.isTrump(c) : (!EZ.isTrump(c) && EZ.cardSuit(c) === leadSuit);
    const must = hand.filter(inSuit);
    const others = hand.filter(c => !inSuit(c)).sort((a,b)=>EZ.cardPower(a)-EZ.cardPower(b));
    if(must.length >= n) return must.sort((a,b)=>EZ.cardPower(a)-EZ.cardPower(b)).slice(0, n);
    return must.concat(others).slice(0, n);
  }

  function stopAiTimer(){
    if(aiTimer){ clearTimeout(aiTimer); aiTimer = null; }
  }

  // ===== 渲染 =====
  function rerender(){
    const content = document.getElementById('page-content');
    if(content) content.innerHTML = renderTable();
  }

  // ===== 新游戏 =====
  function newGame(continueGame){
    stopDealTimer();
    stopAiTimer();
    mySelectedCards = [];
    selectedBottom = [];
    const s = EZ.STATE;
    if(continueGame && s.phase === 'ended' && s.result){
      EZ.applyResult(); // 换庄 + 升级
      EZ.startNewGame(s.level, s.dealer);
    } else {
      EZ.startNewGame('2', 0);
    }
    dealingStarted = true;
    rerender();
    setTimeout(startDealing, 100);
  }

  // 供外部重启发牌（renderTable 自动启动）
  function restartDealing(){
    dealingStarted = false;
  }

  // ===== 战绩 =====
  async function saveResult(){
    try {
      const s = EZ.STATE;
      await API.post('/api/game/records', {
        start_level: s.startLevel,
        end_level: s.result.nextLevel || s.level,
        result: s.result.result,
        yj_score: s.result.yjScore,
        msg: s.result.msg
      });
    } catch(e){}
  }

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
