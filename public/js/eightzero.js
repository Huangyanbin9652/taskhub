// ===== 八十分（升级/拖拉机）游戏引擎 v2 =====
// 单人 + 3 AI，2 副牌 108 张（含大小王），手机优先
// 完整规则：逐张发牌 → 发牌中亮主（报牌）/反主 → 庄家埋底 → 出牌（单张/对子/拖拉机连对）→ 只有闲家计分 → 结算
// 自定义规则：逢J必打、逢A必打、2必打、正J勾到底、负J勾三级、正A尖三级、负A无效、抠底×2

(function(){
  const SUITS = ['S','H','D','C'];
  const SUIT_NAMES = {S:'♠', H:'♥', D:'♦', C:'♣'};
  const SUIT_CH = {S:'黑桃', H:'红桃', D:'方块', C:'梅花'};
  const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const RANK_VALUES = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};
  const LEVEL_ORDER = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const SCORE_CARDS = {'5':5,'10':10,'K':10};
  // 轮数不固定：每轮出牌张数由首出牌型决定（单1/对2/拖拉机2k），
  // 游戏进行到所有人手牌出完为止

  const STATE = {
    players: ['你','下家','对家','上家'],
    playerHands: [[],[],[],[]],   // 每人 25 张（埋底前庄家 33）
    deck: [],
    bottom: [],                   // 底牌 8 张
    bottomScore: 0,
    level: '2',                   // 当前级别（打几）
    startLevel: '2',
    trumpSuit: null,              // 主花色
    trumpDeclaredBy: -1,          // 亮主者
    trumpDeclaredCount: 0,        // 0=未亮 1=单张亮主 2=对级牌反主
    dealer: 0,                    // 庄家
    turn: 0,                      // 当前出牌人
    trickLeader: -1,              // 本轮首出人
    phase: 'idle',                // idle|dealing|bottoming|playing|ended
    dealCount: 0,                 // 已发牌数（共100）
    trick: [],                    // [{player, cards:[...]}]
    trickCount: 0,
    yjScore: 0,                   // 闲家抓分（只有闲家计分）
    lastTrickWinner: -1,
    lastTrickWinCards: [],
    lastTrickLeadSuit: null,
    log: [],
    result: null,
  };

  // ===== 基础工具 =====
  function isJoker(c){ return c === 'JB' || c === 'JS'; } // JB=大王 JS=小王
  function cardSuit(c){ return isJoker(c) ? 'W' : c[0]; }
  function cardRank(c){ return isJoker(c) ? c : c.slice(1); }
  function cardScore(c){ return SCORE_CARDS[cardRank(c)] || 0; }

  function buildDeck(){
    const deck = [];
    for(let i=0;i<2;i++){
      for(const s of SUITS) for(const r of RANKS) deck.push(s+r);
      deck.push('JB','JS');
    }
    return deck; // 108
  }

  function shuffle(arr){
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]] = [arr[j],arr[i]];
    }
    return arr;
  }

  function isTrump(c){
    if(isJoker(c)) return true;
    return cardRank(c) === STATE.level || cardSuit(c) === STATE.trumpSuit;
  }

  // 牌力（比较用，越大越大）
  function cardPower(c){
    if(c === 'JB') return 1200;
    if(c === 'JS') return 1190;
    const s = cardSuit(c), r = cardRank(c);
    if(r === STATE.level) return s === STATE.trumpSuit ? 1180 : 1170;
    if(s === STATE.trumpSuit) return 1000 + RANK_VALUES[r];
    return RANK_VALUES[r];
  }

  // ===== 档值（拖拉机相邻判定用）=====
  // 副牌档值：rank 值（3..14，级牌被抽走形成空档 → 不相邻，符合标准规则）
  function suitLadder(c){ return RANK_VALUES[cardRank(c)]; }

  // 主牌档值：主花色 3..A 连续（跳过级牌），然后副级牌、主级牌、小王、大王依次相邻
  function trumpLadder(c){
    const ranks = RANKS.filter(x => x !== STATE.level).sort((a,b)=>RANK_VALUES[a]-RANK_VALUES[b]);
    const maxMain = ranks.length;
    if(c === 'JS') return maxMain + 3;
    if(c === 'JB') return maxMain + 4;
    const s = cardSuit(c), r = cardRank(c);
    if(r === STATE.level) return s === STATE.trumpSuit ? maxMain + 2 : maxMain + 1;
    return ranks.indexOf(r) + 1;
  }

  function ladderOf(c, suit){
    return suit === 'T' ? trumpLadder(c) : suitLadder(c);
  }

  // 把一组牌按档分组（只取属于该 suit 的牌）
  function groupByLadder(cards, suit){
    const groups = {};
    for(const c of cards){
      const ok = suit === 'T' ? isTrump(c) : (!isTrump(c) && cardSuit(c) === suit);
      if(!ok) continue;
      const lv = ladderOf(c, suit);
      (groups[lv] = groups[lv] || []).push(c);
    }
    return groups;
  }

  // 组内的对子列表（按档从小到大）
  function pairsInGroups(groups){
    const pairs = [];
    for(const lv of Object.keys(groups).map(Number).sort((a,b)=>a-b)){
      if(groups[lv].length >= 2) pairs.push([groups[lv][0], groups[lv][1]]);
    }
    return pairs;
  }

  // 组内的拖拉机列表（相邻档对子连，每档取2张），按长度降序
  function tractorsInGroups(groups){
    const lvs = Object.keys(groups).map(Number).filter(lv => groups[lv].length >= 2).sort((a,b)=>a-b);
    const runs = [];
    let run = [];
    for(let i=0;i<lvs.length;i++){
      if(run.length && lvs[i] === lvs[i-1] + 1){ run.push(lvs[i]); }
      else { if(run.length >= 2) runs.push(run); run = [lvs[i]]; }
    }
    if(run.length >= 2) runs.push(run);
    return runs
      .map(run => ({ size: run.length, cards: run.flatMap(lv => groups[lv].slice(0,2)) }))
      .sort((a,b) => b.size - a.size);
  }

  // ===== 牌型分析 =====
  // 返回 null（无效）或 {type:'single'|'pair'|'tractor', suit:'T'|花色, size:连对数, cards}
  function analyzeCombo(cards){
    const n = cards.length;
    if(!n) return null;
    const trumps = cards.filter(isTrump);
    if(trumps.length && trumps.length < n) return null;      // 主副混合
    if(trumps.length === n){
      if(n === 1) return {type:'single', suit:'T', size:1, cards};
      const groups = groupByLadder(cards, 'T');
      if(Object.values(groups).some(g => g.length !== 2)) return null;
      const lvs = Object.keys(groups).map(Number).sort((a,b)=>a-b);
      if(n === 2) return {type:'pair', suit:'T', size:1, cards};
      for(let i=1;i<lvs.length;i++) if(lvs[i]-lvs[i-1] !== 1) return null;
      return {type:'tractor', suit:'T', size:lvs.length, cards};
    }
    // 全副牌
    const s = cardSuit(cards[0]);
    if(cards.some(c => cardSuit(c) !== s)) return null;      // 混花色
    if(n === 1) return {type:'single', suit:s, size:1, cards};
    const groups = groupByLadder(cards, s);
    if(Object.values(groups).some(g => g.length !== 2)) return null;
    const lvs = Object.keys(groups).map(Number).sort((a,b)=>a-b);
    if(n === 2) return {type:'pair', suit:s, size:1, cards};
    for(let i=1;i<lvs.length;i++) if(lvs[i]-lvs[i-1] !== 1) return null;
    return {type:'tractor', suit:s, size:lvs.length, cards};
  }

  // 首出花色（'T'=主 或 副花色）
  function suitOfLead(leadCards){
    return isTrump(leadCards[0]) ? 'T' : cardSuit(leadCards[0]);
  }

  // ===== 出牌校验 =====
  // 返回 {ok:true} 或 {ok:false, msg}
  function validatePlay(idx, cards){
    if(STATE.phase !== 'playing') return {ok:false, msg:'当前不能出牌'};
    if(STATE.turn !== idx) return {ok:false, msg:'还没轮到你'};
    if(STATE.trick.length >= 4) return {ok:false, msg:'本轮已结束，等待收墩'};
    const hand = STATE.playerHands[idx];
    const tmp = [...hand];
    for(const c of cards){
      const i = tmp.indexOf(c);
      if(i < 0) return {ok:false, msg:'所选牌不在手中'};
      tmp.splice(i,1);
    }
    if(cards.length === 0) return {ok:false, msg:'请选择要出的牌'};

    if(STATE.trick.length === 0){
      const combo = analyzeCombo(cards);
      if(!combo) return {ok:false, msg:'首出必须是同花色的单张、对子或拖拉机（相邻连对）'};
      return {ok:true};
    }

    // 跟牌
    const leadCards = STATE.trick[0].cards;
    const leadSuit = suitOfLead(leadCards);
    const leadCombo = analyzeCombo(leadCards);
    const n = leadCards.length;
    if(cards.length !== n) return {ok:false, msg:`首出 ${n} 张，需跟 ${n} 张（当前选了 ${cards.length} 张）`};

    const inSuit = c => leadSuit === 'T' ? isTrump(c) : (!isTrump(c) && cardSuit(c) === leadSuit);
    const must = hand.filter(inSuit);
    const myFollow = cards.filter(inSuit);

    if(must.length === 0){
      // 无该花色：可垫牌或主毙（任意 n 张）
      return {ok:true};
    }
    if(myFollow.length < Math.min(must.length, n)){
      return {ok:false, msg:`手里有${leadSuit==='T'?'主牌':SUIT_CH[leadSuit]}，必须优先跟出`};
    }

    if(leadCombo.type === 'pair'){
      const mustPairs = pairsInGroups(groupByLadder(must, leadSuit));
      if(mustPairs.length){
        const myPairs = pairsInGroups(groupByLadder(myFollow, leadSuit));
        if(!myPairs.length) return {ok:false, msg:'有对子必须跟对子'};
      }
    } else if(leadCombo.type === 'tractor'){
      const mustGroups = groupByLadder(must, leadSuit);
      const mustTractors = tractorsInGroups(mustGroups);
      const myTractors = tractorsInGroups(groupByLadder(myFollow, leadSuit));
      if(mustTractors.length){
        if(!myTractors.length) return {ok:false, msg:'有拖拉机必须跟拖拉机'};
      } else {
        const mustPairs = pairsInGroups(mustGroups);
        const myPairs = pairsInGroups(groupByLadder(myFollow, leadSuit));
        if(mustPairs.length && myPairs.length < Math.min(mustPairs.length, n/2)){
          return {ok:false, msg:'需尽量多跟对子'};
        }
      }
    }
    return {ok:true};
  }

  // ===== 墩判定 =====
  // 返回某玩家牌组的强度（null = 不能赢：垫牌或结构不符）
  function comboStrength(cards, leadSuit, leadCombo){
    const follow = cards.filter(c => leadSuit === 'T' ? isTrump(c) : (!isTrump(c) && cardSuit(c) === leadSuit));
    let valid, base, suit;
    if(follow.length > 0){
      valid = follow; base = 0; suit = leadSuit;
    } else if(leadSuit !== 'T' && cards.length && cards.every(isTrump)){
      valid = cards; base = 1000; suit = 'T';   // 整齐主牌毙副牌
    } else {
      return null;
    }
    const groups = groupByLadder(valid, suit);
    if(leadCombo.type === 'pair'){
      if(!pairsInGroups(groups).length) return null;
    } else if(leadCombo.type === 'tractor'){
      if(!tractorsInGroups(groups).length) return null;
    }
    return base + Math.max(...valid.map(c => ladderOf(c, suit)));
  }

  function judgeTrick(){
    const lead = STATE.trick[0];
    const leadSuit = suitOfLead(lead.cards);
    const leadCombo = analyzeCombo(lead.cards);
    let winner = lead.player;
    let bestStrength = comboStrength(lead.cards, leadSuit, leadCombo);
    let bestCards = lead.cards;
    for(let i=1;i<STATE.trick.length;i++){
      const t = STATE.trick[i];
      const st = comboStrength(t.cards, leadSuit, leadCombo);
      if(st !== null && st > bestStrength){
        bestStrength = st; winner = t.player; bestCards = t.cards;
      }
    }
    return {winner, bestCards, leadSuit};
  }

  // ===== 游戏流程 =====
  function startNewGame(level, dealer){
    STATE.deck = shuffle(buildDeck());
    STATE.playerHands = [[],[],[],[]];
    STATE.bottom = STATE.deck.slice(100);
    STATE.bottomScore = 0;
    STATE.level = level || '2';
    STATE.startLevel = STATE.level;
    STATE.trumpSuit = null;
    STATE.trumpDeclaredBy = -1;
    STATE.trumpDeclaredCount = 0;
    STATE.dealer = (typeof dealer === 'number') ? dealer : 0;
    STATE.turn = STATE.dealer;
    STATE.trickLeader = -1;
    STATE.phase = 'dealing';
    STATE.dealCount = 0;
    STATE.trick = [];
    STATE.trickCount = 0;
    STATE.yjScore = 0;
    STATE.lastTrickWinner = -1;
    STATE.lastTrickWinCards = [];
    STATE.lastTrickLeadSuit = null;
    STATE.log = [];
    STATE.result = null;
    log(`新牌局开始，打 ${STATE.level}，${STATE.players[STATE.dealer]}坐庄`);
    return STATE;
  }

  function log(msg){
    STATE.log.unshift(msg);
    if(STATE.log.length > 60) STATE.log.pop();
  }

  // 发一张牌（从庄家开始逆时针轮流），返回 false 表示发完
  function dealNext(){
    if(STATE.phase !== 'dealing' || STATE.dealCount >= 100) return false;
    const p = (STATE.dealer + STATE.dealCount) % 4;
    STATE.playerHands[p].push(STATE.deck[STATE.dealCount]);
    STATE.dealCount++;
    return {player: p, card: STATE.deck[STATE.dealCount-1]};
  }

  // ===== 亮主 / 反主 =====
  // 手里各花色级牌数量
  function levelCardsInHand(idx){
    const res = {};
    for(const c of STATE.playerHands[idx]){
      if(isJoker(c)) continue;
      if(cardRank(c) === STATE.level){
        const s = cardSuit(c);
        res[s] = (res[s] || 0) + 1;
      }
    }
    return res;
  }

  // 可亮主的花色（单张级牌）
  function canDeclare(idx){
    if(STATE.phase !== 'dealing' || STATE.trumpSuit !== null) return [];
    const lv = levelCardsInHand(idx);
    return SUITS.filter(s => (lv[s] || 0) >= 1);
  }

  // 可反主的花色（两张同花色级牌，且当前仅被单张亮主）
  function canOverride(idx){
    if(STATE.phase !== 'dealing') return [];
    if(STATE.trumpSuit === null || STATE.trumpDeclaredCount !== 1) return [];
    if(STATE.trumpDeclaredBy === idx) return [];
    const lv = levelCardsInHand(idx);
    return SUITS.filter(s => (lv[s] || 0) >= 2 && s !== STATE.trumpSuit);
  }

  function declareTrump(idx, suit){
    if(STATE.phase !== 'dealing') return false;
    suit = SUITS.includes(suit) ? suit : null;
    if(!suit) return false;
    if(STATE.trumpSuit === null){
      // 亮主：须持有该花色级牌
      const lv = levelCardsInHand(idx);
      if((lv[suit] || 0) < 1) return false;
      STATE.trumpSuit = suit;
      STATE.trumpDeclaredBy = idx;
      STATE.trumpDeclaredCount = 1;
      log(`${STATE.players[idx]} 亮 ${SUIT_CH[suit]}级牌报主`);
      return true;
    }
    if(STATE.trumpDeclaredCount === 1 && STATE.trumpDeclaredBy !== idx){
      // 反主：须两张同花色级牌
      const lv = levelCardsInHand(idx);
      if((lv[suit] || 0) < 2 || suit === STATE.trumpSuit) return false;
      STATE.trumpSuit = suit;
      STATE.trumpDeclaredBy = idx;
      STATE.trumpDeclaredCount = 2;
      log(`${STATE.players[idx]} 双 ${SUIT_CH[suit]}级牌反主！`);
      return true;
    }
    return false;
  }

  // 发牌结束：定主 + 进入埋底
  function finishDealing(){
    if(STATE.phase !== 'dealing' || STATE.dealCount < 100) return false;
    if(STATE.trumpSuit === null){
      // 无人亮主 → 翻底牌第一张非王牌定主
      const c = STATE.bottom.find(c => !isJoker(c));
      if(c){
        STATE.trumpSuit = cardSuit(c);
        STATE.trumpDeclaredBy = -1;
        STATE.trumpDeclaredCount = 0;
        log(`无人亮主，翻底牌定主：${SUIT_CH[STATE.trumpSuit]}`);
      }
    }
    STATE.phase = 'bottoming';
    log(`主：${SUIT_CH[STATE.trumpSuit]}，庄家${STATE.players[STATE.dealer]}埋底`);
    return true;
  }

  // 庄家收底牌（手牌变 33 张）
  function takeBottom(){
    if(STATE.phase !== 'bottoming') return false;
    if(STATE.playerHands[STATE.dealer].length !== 25) return false; // 幂等：只在埋底前收一次
    STATE.playerHands[STATE.dealer] = STATE.playerHands[STATE.dealer].concat(STATE.bottom);
    return true;
  }

  // 埋底：庄家选 8 张扣底
  function setBottom(idx, cards){
    if(STATE.phase !== 'bottoming' || idx !== STATE.dealer) return false;
    if(!Array.isArray(cards) || cards.length !== 8) return false;
    const hand = STATE.playerHands[idx];
    const tmp = [...hand];
    for(const c of cards){
      const i = tmp.indexOf(c);
      if(i < 0) return false;
      tmp.splice(i,1);
    }
    STATE.playerHands[idx] = tmp;
    STATE.bottom = [...cards];
    STATE.bottomScore = cards.reduce((a,c)=>a+cardScore(c),0);
    STATE.phase = 'playing';
    STATE.turn = STATE.dealer;
    STATE.trickLeader = STATE.dealer;
    log(`庄家埋底 ${STATE.bottomScore} 分，开始出牌`);
    return true;
  }

  // ===== 出牌 =====
  function playCards(idx, cards){
    const check = validatePlay(idx, cards);
    if(!check.ok) return check;
    const hand = STATE.playerHands[idx];
    for(const c of cards) hand.splice(hand.indexOf(c), 1);
    STATE.trick.push({player: idx, cards: [...cards]});
    if(STATE.trick.length === 1) STATE.trickLeader = idx;
    const combo = analyzeCombo(cards) || {type:''};
    const typeCh = combo.type === 'single' ? '' : combo.type === 'pair' ? ' 对' : combo.type === 'tractor' ? ` ${combo.size}连拖拉机` : '';
    log(`${STATE.players[idx]} 出 ${cards.map(cardDisplay).join(' ')}${typeCh}`);
    if(STATE.trick.length < 4){
      STATE.turn = (idx + 1) % 4;
    } else {
      STATE.turn = -1; // 等待收墩
    }
    return {ok:true};
  }

  // ===== 收墩（一轮结束）=====
  function endTrick(){
    if(STATE.trick.length !== 4) return false;
    const {winner, bestCards, leadSuit} = judgeTrick();
    let trickScore = 0;
    for(const t of STATE.trick) for(const c of t.cards) trickScore += cardScore(c);
    const dealerSide = (winner % 2 === STATE.dealer % 2);
    STATE.trickCount++;
    if(dealerSide){
      log(`第 ${STATE.trickCount} 轮：庄家方赢${trickScore ? `，收走 ${trickScore} 分（不计分）` : ''}`);
    } else {
      STATE.yjScore += trickScore;
      log(`第 ${STATE.trickCount} 轮：闲家赢，抓 ${trickScore} 分，累计 ${STATE.yjScore}`);
    }
    STATE.lastTrickWinner = winner;
    STATE.lastTrickWinCards = bestCards;
    STATE.lastTrickLeadSuit = leadSuit;
    STATE.trick = [];
    STATE.turn = winner;
    STATE.trickLeader = winner;
    // 所有人手牌出完 → 游戏结束
    if(STATE.playerHands.every(h => h.length === 0)){
      endGame();
    }
    return true;
  }

  // ===== 结算 =====
  function endGame(){
    STATE.phase = 'ended';
    // 抠底：闲家赢最后一墩 → 底牌分 ×2
    const lastWinnerIsYj = STATE.lastTrickWinner >= 0 && (STATE.lastTrickWinner % 2 !== STATE.dealer % 2);
    if(lastWinnerIsYj && STATE.bottomScore > 0){
      STATE.yjScore += STATE.bottomScore * 2;
      log(`闲家抠底！底牌 ${STATE.bottomScore} 分 ×2`);
    } else if(!lastWinnerIsYj && STATE.bottomScore > 0){
      log(`庄家守住底牌（${STATE.bottomScore} 分）`);
    }
    const result = settle(STATE.yjScore);
    result.nextLevel = computeNextLevel(result);
    result.dealerKeepsNext = result.dealerKeeps;
    STATE.result = result;
    log(`结算：闲家抓 ${STATE.yjScore} 分 → ${result.msg}`);
  }

  function settle(yjScore){
    let delta = 0;
    let dealerKeeps = true;
    let result = '', msg = '';
    if(yjScore === 0){ delta = 5; result = '大光'; msg = '大光！庄家升 5 级'; }
    else if(yjScore <= 39){ delta = 3; result = '小光'; msg = '小光！庄家升 3 级'; }
    else if(yjScore <= 79){ delta = 1; result = '庄家胜'; msg = '庄家胜，升 1 级'; }
    else if(yjScore <= 119){ delta = 0; dealerKeeps = false; result = '闲家上台'; msg = '闲家上台，不升级'; }
    else if(yjScore <= 159){
      delta = 1; dealerKeeps = false; result = '闲家升1'; msg = '闲家上台升 1 级';
      if(STATE.startLevel === '2'){ delta = 0; msg = '闲家上台（打2必打，不升级）'; }
    } else if(yjScore <= 199){
      delta = 3; dealerKeeps = false; result = '闲家升3'; msg = '闲家上台升 3 级';
      if(STATE.startLevel === '2'){ delta = 0; msg = '闲家上台（打2必打，不升级）'; }
    } else {
      delta = 5; dealerKeeps = false; result = '闲家升5'; msg = '闲家上台升 5 级';
      if(STATE.startLevel === '2'){ delta = 0; msg = '闲家上台（打2必打，不升级）'; }
    }

    // 勾底规则：只有打 J 或 A 时，闲家赢最后一墩且赢墩的最大牌是级别牌
    if(STATE.lastTrickWinner >= 0 && (STATE.lastTrickWinner % 2 !== STATE.dealer % 2) && (STATE.level === 'J' || STATE.level === 'A')){
      const suit = STATE.lastTrickLeadSuit || 'T';
      const top = STATE.lastTrickWinCards.slice().sort((a,b) => ladderOf(b, isTrump(b) ? 'T' : suit) - ladderOf(a, isTrump(a) ? 'T' : suit))[0];
      if(top && !isJoker(top) && cardRank(top) === STATE.level){
        const isZheng = cardSuit(top) === STATE.trumpSuit;
        if(STATE.level === 'J'){
          if(isZheng){ delta = -100; dealerKeeps = true; result = '勾到底'; msg = `闲家正J勾到底！庄家从 2 重新打`; }
          else { delta = -3; dealerKeeps = true; result = '勾三级'; msg = '闲家负J勾三级！庄家降 3 级继续坐庄'; }
        } else {
          if(isZheng){ delta = -3; dealerKeeps = true; result = '尖三级'; msg = '闲家正A尖三级！庄家降 3 级继续坐庄'; }
          // 负A无效
        }
      }
    }
    return {delta, dealerKeeps, result, msg, yjScore};
  }

  function computeNextLevel(result){
    const idx = LEVEL_ORDER.indexOf(STATE.level);
    if(result.delta === -100) return '2';
    const newIdx = idx + result.delta;
    if(result.delta > 0){
      // 必打级 2、J、A 不能跳过
      const mustPlay = {2:true, J:true, A:true};
      for(let i = idx+1; i <= newIdx; i++){
        const lv = LEVEL_ORDER[((i % 13) + 13) % 13];
        if(mustPlay[lv]) return lv;
      }
    }
    if(newIdx < 0) return '2';
    return LEVEL_ORDER[((newIdx % 13) + 13) % 13];
  }

  // 准备下一局（换庄 + 升级）
  function applyResult(){
    if(!STATE.result) return;
    if(!STATE.result.dealerKeepsNext){
      STATE.dealer = (STATE.dealer + 1) % 4; // 闲家上台，下家坐庄
    }
    STATE.level = STATE.result.nextLevel;
  }

  function cardDisplay(c){
    if(c === 'JB') return '大王';
    if(c === 'JS') return '小王';
    return SUIT_NAMES[cardSuit(c)] + cardRank(c);
  }

  // ===== AI =====
  function aiBidDecision(idx){
    // 发牌中 AI 摸到级牌的亮主/反主决策
    const lv = levelCardsInHand(idx);
    if(STATE.trumpSuit === null){
      const suits = SUITS.filter(s => (lv[s] || 0) >= 1);
      if(suits.length && Math.random() < 0.85){
        declareTrump(idx, suits[Math.floor(Math.random() * suits.length)]);
      }
    } else if(STATE.trumpDeclaredCount === 1 && STATE.trumpDeclaredBy !== idx){
      const suits = SUITS.filter(s => (lv[s] || 0) >= 2 && s !== STATE.trumpSuit);
      if(suits.length && Math.random() < 0.75){
        declareTrump(idx, suits[0]);
      }
    }
  }

  function aiBottomDecision(idx){
    // AI 庄家埋底：优先埋非主小牌，分牌尽量不埋
    if(STATE.playerHands[idx].length === 25) takeBottom();
    const hand = STATE.playerHands[idx];
    const nonTrump = hand.filter(c => !isTrump(c));
    const scoreCards = nonTrump.filter(c => cardScore(c) > 0);
    const plain = nonTrump.filter(c => cardScore(c) === 0);
    const trumps = hand.filter(isTrump).sort((a,b) => cardPower(a) - cardPower(b));
    plain.sort((a,b) => cardPower(a) - cardPower(b));
    scoreCards.sort((a,b) => cardPower(a) - cardPower(b));
    const bury = [];
    for(const c of plain) if(bury.length < 8) bury.push(c);
    for(const c of scoreCards) if(bury.length < 8) bury.push(c);
    for(const c of trumps) if(bury.length < 8) bury.push(c);
    setBottom(idx, bury);
  }

  function sideOf(idx){ return idx % 2 === STATE.dealer % 2 ? 0 : 1; } // 0庄家方 1闲家方

  function aiChoosePlay(idx){
    if(STATE.trick.length === 0) return aiLead(idx);
    return aiFollow(idx);
  }

  function aiLead(idx){
    const hand = STATE.playerHands[idx];
    const options = [];
    for(const s of SUITS){
      if(s === STATE.trumpSuit) continue;
      const cards = hand.filter(c => !isTrump(c) && cardSuit(c) === s);
      if(!cards.length) continue;
      const groups = groupByLadder(cards, s);
      const tractors = tractorsInGroups(groups);
      const pairs = pairsInGroups(groups);
      const sorted = cards.slice().sort((a,b) => suitLadder(a) - suitLadder(b));
      if(tractors.length){
        const t = tractors[0];
        options.push({cards: t.cards, pri: 3 + t.size * 0.1, score: t.cards.reduce((a,c)=>a+cardScore(c),0)});
      } else if(pairs.length){
        const p = pairs[pairs.length-1];
        options.push({cards: p, pri: 2, score: cardScore(p[0])*2});
      } else {
        const c = sorted[0];
        options.push({cards: [c], pri: cardScore(c) ? 0.4 : 1, score: cardScore(c)});
      }
    }
    const trumps = hand.filter(isTrump);
    if(trumps.length){
      const groups = groupByLadder(trumps, 'T');
      const tractors = tractorsInGroups(groups);
      const pairs = pairsInGroups(groups);
      if(tractors.length) options.push({cards: tractors[0].cards, pri: 3.5, score: 0});
      else if(pairs.length) options.push({cards: pairs[pairs.length-1], pri: 1.2, score: 0});
      else options.push({cards: [trumps.sort((a,b)=>cardPower(a)-cardPower(b))[0]], pri: 0.5, score: 0});
    }
    if(!options.length) return [hand[0]];
    // 同优先级避免送分
    options.sort((a,b) => (b.pri - a.pri) || (a.score - b.score));
    return options[0].cards;
  }

  function aiFollow(idx){
    const hand = STATE.playerHands[idx];
    const leadCards = STATE.trick[0].cards;
    const leadSuit = suitOfLead(leadCards);
    const leadCombo = analyzeCombo(leadCards);
    const n = leadCards.length;
    const inSuit = c => leadSuit === 'T' ? isTrump(c) : (!isTrump(c) && cardSuit(c) === leadSuit);
    const must = hand.filter(inSuit);
    const others = hand.filter(c => !inSuit(c));

    // 当前墩面信息
    let trickScore = 0;
    for(const t of STATE.trick) for(const c of t.cards) trickScore += cardScore(c);
    const curWinner = judgeTrick().winner;
    const curWinnerIsFriend = sideOf(curWinner) === sideOf(idx);

    if(must.length === 0){
      // 无该花色：毙 or 垫
      const trumps = hand.filter(isTrump);
      const canKill = leadSuit !== 'T' && trumps.length >= n &&
        (leadCombo.type === 'single' ? trumps.length >= 1 :
         leadCombo.type === 'pair' ? pairsInGroups(groupByLadder(trumps,'T')).length >= 1 :
         tractorsInGroups(groupByLadder(trumps,'T')).some(t => t.size >= leadCombo.size));
      const isLastTrick = STATE.playerHands.every(h => h.length <= n); // 本墩后手牌出完
      const worthKill = !curWinnerIsFriend && (trickScore >= 10 || isLastTrick || STATE.bottomScore > 0);
      if(canKill && worthKill){
        if(leadCombo.type === 'single'){
          return [trumps.sort((a,b)=>cardPower(b)-cardPower(a))[0]];
        }
        if(leadCombo.type === 'pair'){
          const p = pairsInGroups(groupByLadder(trumps,'T'));
          return p[p.length-1];
        }
        const t = tractorsInGroups(groupByLadder(trumps,'T')).find(t => t.size >= leadCombo.size);
        return t.cards.slice(0, n);
      }
      // 垫牌：队友赢则垫大分牌送队友，否则垫最小非分牌
      if(curWinnerIsFriend){
        const scored = others.slice().sort((a,b) => cardScore(b) - cardScore(a) || cardPower(b) - cardPower(a));
        return scored.slice(0, n);
      }
      const safe = others.slice().sort((a,b) => (cardScore(a) - cardScore(b)) || (cardPower(a) - cardPower(b)));
      return safe.slice(0, n);
    }

    // 有该花色必须跟
    const groups = groupByLadder(must, leadSuit);
    const fill = count => {
      // 从 others 里补垫牌（优先最小非分）
      const safe = others.slice().sort((a,b) => (cardScore(a) - cardScore(b)) || (cardPower(a) - cardPower(b)));
      return must.concat(safe).slice(0, count);
    };
    if(leadCombo.type === 'single'){
      // 若敌方在赢且分多，且必须跟的牌里有能反超的？must 全是本花色，无法反超 → 出最小
      return [must.slice().sort((a,b)=>ladderOf(a,leadSuit)-ladderOf(b,leadSuit))[0]];
    }
    if(leadCombo.type === 'pair'){
      const pairs = pairsInGroups(groups);
      if(pairs.length){
        // 敌方在赢且分多 → 出最大对搏一把，否则最小对
        if(!curWinnerIsFriend && trickScore >= 15){
          return pairs[pairs.length-1];
        }
        return pairs[0];
      }
      return fill(n);
    }
    // 拖拉机
    const tractors = tractorsInGroups(groups);
    if(tractors.length){
      const t = tractors.find(t => t.size >= leadCombo.size) || tractors[0];
      if(t.cards.length >= n) return t.cards.slice(0, n);
      // 拖拉机不足 n 张：优先补对，再补单张，最后垫牌
      const extra = [];
      const remaining = must.filter(c => !t.cards.includes(c));
      const remPairs = pairsInGroups(groupByLadder(remaining, leadSuit));
      for(const p of remPairs){
        if(t.cards.length + extra.length + 2 > n) break;
        extra.push(...p);
      }
      for(const c of remaining.slice().sort((a,b)=>ladderOf(a,leadSuit)-ladderOf(b,leadSuit))){
        if(t.cards.length + extra.length >= n) break;
        if(!extra.includes(c)) extra.push(c);
      }
      if(t.cards.length + extra.length < n){
        const safe = others.slice().sort((a,b)=>(cardScore(a)-cardScore(b))||(cardPower(a)-cardPower(b)));
        extra.push(...safe.slice(0, n - t.cards.length - extra.length));
      }
      return t.cards.concat(extra);
    }
    const pairs = pairsInGroups(groups);
    if(pairs.length){
      const use = Math.min(pairs.length, n/2);
      const cards = [];
      for(let i=0;i<use;i++) cards.push(...pairs[i]);
      if(cards.length < n){
        const rest = must.filter(c => !cards.includes(c)).sort((a,b)=>ladderOf(a,leadSuit)-ladderOf(b,leadSuit));
        cards.push(...rest.slice(0, n - cards.length));
      }
      if(cards.length < n){
        const safe = others.slice().sort((a,b)=>(cardScore(a)-cardScore(b))||(cardPower(a)-cardPower(b)));
        cards.push(...safe.slice(0, n - cards.length));
      }
      return cards;
    }
    return fill(n);
  }

  // 对外暴露
  window.EightZero = {
    STATE,
    SUITS, SUIT_NAMES, SUIT_CH, RANKS, LEVEL_ORDER,
    startNewGame,
    dealNext, finishDealing, takeBottom, setBottom,
    canDeclare, canOverride, declareTrump,
    validatePlay, playCards, endTrick, applyResult, judgeTrick,
    analyzeCombo, isTrump, cardPower, cardSuit, cardRank, cardScore, cardDisplay,
    ladderOf, groupByLadder, pairsInGroups, tractorsInGroups, suitOfLead,
    aiBidDecision, aiBottomDecision, aiChoosePlay,
  };
})();
