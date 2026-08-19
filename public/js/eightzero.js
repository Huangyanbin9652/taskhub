// ===== 八十分（升级）游戏引擎 =====
// 单人 + 3 AI，2 副牌 108 张（含大小王），手机优先
// 游戏逻辑全在浏览器端运行

(function(){
  // 花色：S=黑桃 H=红桃 D=方块 C=梅花，J=大王 K=小王
  const SUITS = ['S','H','D','C'];
  const SUIT_NAMES = {S:'♠', H:'♥', D:'♦', C:'♣'};
  const SUIT_CH = {S:'黑桃', H:'红桃', D:'方块', C:'梅花'};
  const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const RANK_VALUES = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};
  const LEVEL_ORDER = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const SCORE_CARDS = {'5':5,'10':10,'K':10};

  const STATE = {
    players: [],          // 4人，index 0 = 自己，1/3 = 队友，2 = 对面
    playerHands: [],      // 每人25张
    bottom: [],           // 底牌8张
    level: '2',           // 当前级别
    trumpSuit: null,      // 主花色 null=无主
    trumps: [],           // 所有主牌集合
    dealer: 0,            // 庄家 index
    turn: 0,              // 当前出牌人
    trick: [],            // 当前轮已出的牌
    trickLeader: 0,       // 当前轮首出人
    trickCount: 0,        // 已出轮数
    scores: [0,0],        // [庄家方, 闲家方] 抓分
    currentTrickSuit: null, // 本轮首出花色
    winner: null,         // 最后赢家（判抠底）
    log: [],              // 操作日志
    phase: 'idle',        // idle/bidding/playing/ended
    startLevel: '2',      // 本局起始级别
    // 勾底相关
    levelIsJ: false,
    levelIsA: false,
    lastTrickWinner: -1,  // 第13轮赢家
  };

  // ===== 工具 =====
  function cardSuit(card){ return card[0]; }
  function cardRank(card){ return card.slice(1); }
  function cardScore(card){ return SCORE_CARDS[cardRank(card)] || 0; }

  // 构建一整副牌
  function buildDeck(){
    const deck = [];
    for(let i=0;i<2;i++){
      for(const s of SUITS){
        for(const r of RANKS){
          deck.push(s+r);
        }
      }
    }
    deck.push('J','K','J','K'); // 4张王
    return deck;
  }

  // 洗牌
  function shuffle(arr){
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]] = [arr[j],arr[i]];
    }
    return arr;
  }

  // 判断某张牌是否为主牌
  function isTrump(card){
    const s = cardSuit(card);
    const r = cardRank(card);
    if(s==='J'||s==='K') return true;       // 王
    if(r===STATE.level) return true;          // 级别牌都是主
    if(STATE.trumpSuit && s===STATE.trumpSuit) return true; // 主花色
    return false;
  }

  // 牌力值（越大越大）
  function cardPower(card){
    const s = cardSuit(card);
    const r = cardRank(card);
    // 王
    if(s==='K') return 100; // 小王
    if(s==='J') return 101; // 大王
    // 主牌
    if(STATE.trumpSuit && s===STATE.trumpSuit && r===STATE.level) return 90; // 主花色级别牌
    if(r===STATE.level) return 80; // 其他花色级别牌（主）
    if(STATE.trumpSuit && s===STATE.trumpSuit) return 50 + RANK_VALUES[r]; // 主花色其他牌
    // 副牌
    return RANK_VALUES[r]; // 副牌 A-K-Q-J-...-2
  }

  // 比较同一轮中牌的大小（判断谁赢）
  // 返回 true 如果 a 能击败 b
  function cardBeats(a, b){
    const pa = cardPower(a), pb = cardPower(b);
    // 谁出了主牌
    const aTrump = isTrump(a), bTrump = isTrump(b);
    if(aTrump && !bTrump) return true;
    if(!aTrump && bTrump) return false;
    if(aTrump && bTrump){
      if(pa===pb) return false; // 同点数
      return pa > pb;
    }
    // 都是副牌，必须同花色才能比较
    if(cardSuit(a) !== cardSuit(b)) return false; // 不同花色，比不了（首出花色决定）
    return pa > pb;
  }

  // ===== 游戏流程 =====
  function startNewGame(level){
    const deck = shuffle(buildDeck());
    STATE.players = ['你','下家','对家','上家'];
    STATE.level = level || '2';
    STATE.startLevel = STATE.level;
    STATE.levelIsJ = STATE.level === 'J';
    STATE.levelIsA = STATE.level === 'A';
    STATE.bottom = deck.slice(100); // 8张底牌
    STATE.playerHands = [
      deck.slice(0,25),
      deck.slice(25,50),
      deck.slice(50,75),
      deck.slice(75,100)
    ];
    STATE.dealer = 0; // 先自己坐庄
    STATE.turn = STATE.dealer;
    STATE.trumpSuit = null;
    STATE.trumps = [];
    STATE.scores = [0,0];
    STATE.trickCount = 0;
    STATE.trick = [];
    STATE.phase = 'bidding';
    STATE.log = [];
    STATE.lastTrickWinner = -1;
    log('新牌局开始，打 ' + STATE.level);
    return STATE;
  }

  function log(msg){
    STATE.log.unshift(msg);
    if(STATE.log.length>50) STATE.log.pop();
  }

  // 亮主
  function declareTrump(suit){
    STATE.trumpSuit = suit;
    STATE.phase = 'playing';
    // 庄家先出牌
    STATE.turn = STATE.dealer;
    STATE.trick = [];
    STATE.trickCount = 0;
    log('叫主：' + SUIT_CH[suit] + ' 为主，先亮者定主');
    // 自动出底牌（简化：庄家随机换8张非分牌到底，AI 复杂策略后续）
    autoBottom();
    // 若庄家是自己，等玩家出牌；否则 AI 出
    return STATE;
  }

  // 庄家自动扣底（简化策略）
  function autoBottom(){
    if(STATE.dealer !== 0){
      // AI 庄家随机扣
      return;
    }
    // 玩家是庄家：玩家手动选择底牌，先提示；这里简化先跳过，由UI处理
  }

  // 出牌
  function playCard(playerIdx, card){
    const hand = STATE.playerHands[playerIdx];
    const idx = hand.indexOf(card);
    if(idx === -1) return false;
    // 校验跟牌规则（若是轮中首出，任意出）
    if(STATE.trick.length === 0){
      STATE.currentTrickSuit = isTrump(card) ? 'TRUMP' : cardSuit(card);
    } else {
      // 必须跟首出花色，若没有才能垫牌
      const leadSuit = STATE.currentTrickSuit;
      const canFollow = hand.some(c => (leadSuit==='TRUMP' ? isTrump(c) : cardSuit(c)===leadSuit));
      const myCardIsTrump = isTrump(card);
      const leadIsTrump = leadSuit==='TRUMP';
      const myCardFollow = leadIsTrump ? myCardIsTrump : cardSuit(card)===leadSuit;
      if(canFollow && !myCardFollow) return false; // 有却不跟，违规
    }
    hand.splice(idx,1);
    STATE.trick.push({player:playerIdx, card:card});
    // 推进回合：同一轮内轮流出牌，第4人出完后由 endTrick 处理
    if(STATE.trick.length < 4){
      STATE.turn = (playerIdx + 1) % 4;
    }
    log(`${STATE.players[playerIdx]} 出了 ${cardDisplay(card)}`);
    return true;
  }

  function cardDisplay(card){
    const s = cardSuit(card);
    if(s==='J') return '🃏大王';
    if(s==='K') return '👑小王';
    return SUIT_NAMES[s] + cardRank(card);
  }

  // 判定当前轮赢家
  function judgeTrick(){
    let winner = STATE.trick[0].player;
    let best = STATE.trick[0].card;
    for(let i=1;i<STATE.trick.length;i++){
      if(cardBeats(STATE.trick[i].card, best)){
        best = STATE.trick[i].card;
        winner = STATE.trick[i].player;
      }
    }
    return {winner, best};
  }

  // 一局（一轮）结束
  function endTrick(){
    const {winner, best} = judgeTrick();
    // 计分：本轮所有分牌归赢家一方
    const winSide = (winner % 2 === 0) ? 0 : 1; // 0庄家 1闲家
    let trickScore = 0;
    for(const p of STATE.trick){
      trickScore += cardScore(p.card);
    }
    STATE.scores[winSide] += trickScore;
    STATE.trickCount++;
    log(`第 ${STATE.trickCount} 轮：${STATE.players[winner]} 赢，${trickScore?('抓 '+trickScore+' 分'):'无分'}`);
    STATE.trick = [];
    STATE.currentTrickSuit = null;
    STATE.turn = winner;
    STATE.lastTrickWinner = winner;
    STATE.lastTrickCard = best; // 记录赢家出的牌（用于勾底判定）
    if(STATE.trickCount >= 13){
      endGame();
      return;
    }
    // 下一轮首出
    STATE.turn = winner;
  }

  // 游戏结束，结算
  function endGame(){
    STATE.phase = 'ended';
    // 抠底：最后赢家是闲家且底牌有分 → 翻倍
    let bottomScore = 0;
    for(const c of STATE.bottom) bottomScore += cardScore(c);
    if(STATE.lastTrickWinner !== -1 && STATE.lastTrickWinner % 2 === 1){
      // 闲家抠底，翻倍
      STATE.scores[1] += bottomScore * 2;
      log(`闲家抠底！底牌 ${bottomScore} 分 ×2 = ${bottomScore*2}`);
    } else {
      STATE.scores[0] += bottomScore;
      log(`庄家收底 ${bottomScore} 分`);
    }
    // 计算升降级（用闲家抓分）
    const yjScore = STATE.scores[1];
    let result = settle(yjScore);
    STATE.result = result;
    // 计算下一局级别（供显示）
    result.nextLevel = computeNextLevel(result);
    log(`结算：闲家抓 ${yjScore} 分 → ${result.msg}`);
  }

  // 计算结算后应打的下一局级别
  function computeNextLevel(result){
    let idx = LEVEL_ORDER.indexOf(STATE.level);
    let delta = result.delta;
    if(delta === -100) return '2'; // 勾到底回2
    let newIdx = idx + delta;
    // 处理必打级阻挡：升级若跳过 J/A/2，只能到必打级
    const mustPlay = {2:true, J:true, A:true};
    let blocked = false;
    let blockedTo = null;
    if(delta > 0){
      for(let i=idx+1; i<=newIdx; i++){
        const lv = LEVEL_ORDER[((i%13)+13)%13];
        if(mustPlay[lv]){ blocked = true; blockedTo = lv; break; }
      }
      if(blocked){
        result.blocked = blockedTo; // 记录阻挡
        return blockedTo;
      }
    } else if(delta < 0){
      // 降级也可能跨到必打级，这里简单处理
      let low = Math.floor(idx + delta);
      // 保证最低是2
      if(low < 0) low = 0;
      return LEVEL_ORDER[low];
    }
    return LEVEL_ORDER[((newIdx%13)+13)%13];
  }

  // 结算升降级
  function settle(yjScore){
    // 判断当前是不是庄家赢
    // 庄家方 index 0, 闲家方 index 1
    const dealerSideWins = yjScore < 80;
    let delta = 0; // 庄家净升级数（正=升，负=降）
    let result;
    let dealerKeeps = true;
    let msg = '';

    if(yjScore === 0){
      delta = 5; result = '大光'; msg = '大光！庄家升 5 级';
    } else if(yjScore <= 39){
      delta = 3; result = '小光'; msg = '小光！庄家升 3 级';
    } else if(yjScore <= 79){
      delta = 1; result = '庄家胜'; msg = '庄家升 1 级';
    } else if(yjScore <= 119){
      delta = 0; dealerKeeps = false; result = '闲家上台'; msg = '闲家上台，不升级';
    } else if(yjScore <= 159){
      delta = 1; dealerKeeps = false; result = '闲家升1'; msg = '闲家上台升 1 级';
      if(STATE.startLevel === '2'){ delta = 0; msg = '闲家上台（原打2必打，不升级）'; }
    } else if(yjScore <= 199){
      delta = 3; dealerKeeps = false; result = '闲家升3'; msg = '闲家上台升 3 级';
      if(STATE.startLevel === '2'){ delta = 0; msg = '闲家上台（原打2必打，不升级）'; }
    } else {
      delta = 5; dealerKeeps = false; result = '闲家升5'; msg = '闲家上台升 5 级';
      if(STATE.startLevel === '2'){ delta = 0; msg = '闲家上台（原打2必打，不升级）'; }
    }

    // 勾底规则（只打 J 或 A，且闲家最后一轮出的牌是当前级别的 J/A）
    if(STATE.lastTrickWinner !== -1 && STATE.lastTrickWinner % 2 === 1 && (STATE.levelIsJ || STATE.levelIsA)){
      // 闲家赢最后一轮，且出的牌正好是当前级别牌（J 或 A）
      const winnerCard = STATE.lastTrickCard;
      if(winnerCard){
        const s = cardSuit(winnerCard);
        const r = cardRank(winnerCard);
        // 必须该牌点数 = 当前级别，才是级别牌（打J时是J，打A时是A）
        if(r === STATE.level){
          const isZheng = (s === STATE.trumpSuit);
          if(r === 'J'){
            if(isZheng){
              // 正J勾到底
              delta = -100; dealerKeeps = true; result = '勾到底';
              msg = '闲家正J勾到底！庄家从 2 重新打';
            } else {
              delta = -3; dealerKeeps = true; result = '勾三级';
              msg = '闲家负J勾三级！庄家降 3 级';
            }
          } else if(r === 'A'){
            if(isZheng){
              delta = -3; dealerKeeps = true; result = '尖三级';
              msg = '闲家正A尖三级！庄家降 3 级';
            } else {
              // 负A无效
            }
          }
        }
      }
    }

    return {delta, dealerKeeps, result, msg, yjScore};
  }

  // 计算新的庄家和级别
  function applyResult(){
    let levelIdx = LEVEL_ORDER.indexOf(STATE.level);
    let delta = STATE.result.delta;
    if(delta === -100){
      // 勾到底，从2开始，庄家继续
      STATE.dealer = STATE.dealer;
      STATE.level = '2';
      return;
    }
    // 庄家赢（升/降级）
    if(STATE.result.dealerKeeps){
      // 庄家继续，级别变化
      let newLevel = levelIdx + delta;
      // 处理必打级阻挡：J、A、2
      const blockerHit = applyBlockers(levelIdx, delta);
      // blockerHit 返回实际调整后的级别index
      STATE.level = LEVEL_ORDER[((newLevel % 13)+13)%13];
      // 若闲家退级，需要应用到闲家（简化：这里处理庄家级别）
      STATE.dealer = STATE.dealer;
    } else {
      // 换闲家坐庄（index 1 和 3 是闲家，取其中一个，简化用 index 1）
      STATE.dealer = STATE.dealer; // 保持简单，这里由UI提示换庄
      // 闲家升级
      let newLevel = levelIdx + delta;
      // 闲家原级别从2开始，升级
      STATE.level = LEVEL_ORDER[((newLevel % 13)+13)%13];
    }
  }

  // 必打级阻挡处理
  function applyBlockers(startIdx, delta){
    // 遍历从 startIdx 往后的级别，遇到 2/J/A 必打级
    let newIdx = startIdx + delta;
    // 简单版：如果跨越了必打级，需要"只能打到必打级"
    // 从 start 到 newIdx，检查是否有 J/A/2
    const mustPlay = {2:true, J:true, A:true};
    let blocker = null;
    for(let i=startIdx+1; i<=newIdx; i++){
      const lv = LEVEL_ORDER[((i%13)+13)%13];
      if(mustPlay[lv]) blocker = {idx:i, lv};
    }
    if(blocker){
      // 只升到必打级
      STATE.result.blockedTo = blocker.lv;
      return blocker.idx;
    }
    return newIdx;
  }

  // 对外暴露
  window.EightZero = {
    STATE,
    startNewGame,
    declareTrump,
    playCard,
    endTrick,
    cardDisplay,
    isTrump,
    cardPower,
    SUIT_NAMES,
    SUIT_CH,
    RANKS,
  };
})();
