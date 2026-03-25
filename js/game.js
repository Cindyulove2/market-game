// ============================================================
// game.js — Core game logic: round data, matching, settlement
// ============================================================

const ROLES = {
  1: { id: 'pension',     name: 'Pension Fund',  icon: '🏛️' },
  2: { id: 'hedge',       name: 'Hedge Fund',    icon: '🐺' },
  3: { id: 'retail',      name: 'Retail Investors', icon: '😊' },
  4: { id: 'growth',      name: 'Growth Fund',   icon: '🚀' },
  5: { id: 'marketmaker', name: 'Market Maker',  icon: '🏦' },
};

const ROUNDS = [
  {
    roundNumber: 1, D: 5,
    event: "Markets are calm. No major macroeconomic news.",
    standardR: 0.05, pStar: 100,
    referenceRates: { optimistic: 0.03, neutral: 0.05, pessimistic: 0.08, panic: 0.15 },
    referenceTable: [
      { r: "3% (optimistic)",  D4: 133, D5: 167, D6: 200 },
      { r: "5% (neutral)",     D4: 80,  D5: 100, D6: 120 },
      { r: "8% (pessimistic)", D4: 50,  D5: 63,  D6: 75  },
      { r: "15% (panic)",      D4: 27,  D5: 33,  D6: 40  },
    ]
  },
  {
    roundNumber: 2, D: 4,
    event: "GDP unexpectedly contracts. Economists warn of recession risk. Consumer confidence falls sharply.",
    standardR: 0.08, pStar: 50,
    referenceRates: { optimistic: 0.03, neutral: 0.05, pessimistic: 0.08, panic: 0.15 },
    referenceTable: [
      { r: "3% (optimistic)",  D4: 133, D5: 167, D6: 200 },
      { r: "5% (neutral)",     D4: 80,  D5: 100, D6: 120 },
      { r: "8% (pessimistic)", D4: 50,  D5: 63,  D6: 75  },
      { r: "15% (panic)",      D4: 27,  D5: 33,  D6: 40  },
    ]
  },
  {
    roundNumber: 3, D: 6,
    event: "Central bank cuts rates by 50bp. Tech breakthrough announced. Analysts universally bullish. Euphoria.",
    standardR: 0.03, pStar: 200,
    referenceRates: { optimistic: 0.03, neutral: 0.05, pessimistic: 0.08, panic: 0.15 },
    referenceTable: [
      { r: "3% (optimistic)",  D4: 133, D5: 167, D6: 200 },
      { r: "5% (neutral)",     D4: 80,  D5: 100, D6: 120 },
      { r: "8% (pessimistic)", D4: 50,  D5: 63,  D6: 75  },
      { r: "15% (panic)",      D4: 27,  D5: 33,  D6: 40  },
    ]
  },
  {
    roundNumber: 4, D: 6,
    event: "Major geopolitical shock. Markets in panic. Liquidity drying up. Emergency meetings called.",
    standardR: 0.12, pStar: 50,
    referenceRates: { optimistic: 0.03, neutral: 0.05, pessimistic: 0.08, panic: 0.15 },
    referenceTable: [
      { r: "3% (optimistic)",  D4: 133, D5: 167, D6: 200 },
      { r: "5% (neutral)",     D4: 80,  D5: 100, D6: 120 },
      { r: "8% (pessimistic)", D4: 50,  D5: 63,  D6: 75  },
      { r: "15% (panic)",      D4: 27,  D5: 33,  D6: 40  },
    ]
  },
  {
    roundNumber: 5, D: 5,
    event: "Central bank cuts 50bp. Government announces major fiscal stimulus. Policy rescue underway.",
    standardR: 0.04, pStar: 125,
    referenceRates: { optimistic: 0.03, neutral: 0.05, pessimistic: 0.08, panic: 0.15 },
    referenceTable: [
      { r: "3% (optimistic)",  D4: 133, D5: 167, D6: 200 },
      { r: "5% (neutral)",     D4: 80,  D5: 100, D6: 120 },
      { r: "8% (pessimistic)", D4: 50,  D5: 63,  D6: 75  },
      { r: "15% (panic)",      D4: 27,  D5: 33,  D6: 40  },
    ]
  }
];

function createInitialState() {
  const portfolios = {};
  const assetHistory = {};
  const impliedRHistory = {};
  for (let i = 1; i <= 5; i++) {
    const cash = i === 5 ? 1500 : 1000; // Market maker gets 500 credit line on top of 1000
    const startingAssets = i === 5 ? 1000 : 1000; // Credit line not counted in total assets
    portfolios['group' + i] = {
      cash, shares: 0, shortPosition: 0, shortCostBasis: null,
      dividendAccumulated: 0, totalAssets: startingAssets, frozen: false,
    };
    assetHistory['group' + i] = [startingAssets];
    impliedRHistory['group' + i] = [];
  }
  return {
    phase: 'waiting',
    totalRounds: 5, // admin can set to 3, 4, or 5
    currentRound: 1,
    timerSeconds: 60,
    timerRunning: false,
    orders: { group1: null, group2: null, group3: null, group4: null, group5: null },
    matchingResults: { trades: [], clearingPrice: null, referencePrice: null, noTrade: false },
    currentPrice: 100,
    priceHistory: [100],
    pStarHistory: [100],
    portfolios,
    assetHistory,
    impliedRHistory,
    followTrendActive: false,
    followTrendEnd: null,
    followTrendDuration: 30, // seconds — admin can adjust
    followTrendPaused: false,
    revealSubPhase: null, // 'followTrend' | 'orderBook' | 'matching' | 'results'
  };
}

const MARKET_ORDER_BUY_PRICE = 999999;  // sentinel for sorting
const MARKET_ORDER_SELL_PRICE = 0.01;   // sentinel for sorting

function runMatching(orders, currentPrice, D) {
  let buys = [];
  let sells = [];

  Object.values(orders).forEach(order => {
    if (!order || order.direction === 'hold') return;
    const isMarket = order.orderType === 'market';
    const ts = order.submittedAt || 0;

    if (order.role === 'marketmaker') {
      buys.push({ groupId: order.groupId, price: order.bidPrice, qty: order.bidQty, role: 'marketmaker', isMarket: false, ts });
      sells.push({ groupId: order.groupId, price: order.askPrice, qty: order.askQty, role: 'marketmaker', isMarket: false, ts });
    } else {
      if (order.direction === 'buy') {
        const sortPrice = isMarket ? MARKET_ORDER_BUY_PRICE : order.price;
        buys.push({ groupId: order.groupId, price: sortPrice, qty: order.quantity, role: order.role, isMarket, ts });
      } else if (order.direction === 'sell') {
        const sortPrice = isMarket ? MARKET_ORDER_SELL_PRICE : order.price;
        sells.push({ groupId: order.groupId, price: sortPrice, qty: order.quantity, role: order.role, isMarket, ts });
      }
    }
  });

  // Sort: buys descending by price, then by submission time (earlier first) for same price
  buys.sort((a, b) => b.price - a.price || a.ts - b.ts);
  // Sort: sells ascending by price, then by submission time (earlier first) for same price
  sells.sort((a, b) => a.price - b.price || a.ts - b.ts);

  // Match orders: pairs execute if buy price >= sell price
  // Price per trade: market+market=currentPrice, market+limit=limit price, limit+limit=midpoint
  let trades = [];
  let bi = 0, si = 0;

  while (bi < buys.length && si < sells.length) {
    const buy = buys[bi];
    const sell = sells[si];

    if (buy.price >= sell.price) {
      let execPrice;
      if (buy.isMarket && sell.isMarket) {
        execPrice = currentPrice;
      } else if (buy.isMarket) {
        execPrice = sell.price;
      } else if (sell.isMarket) {
        execPrice = buy.price;
      } else {
        execPrice = (buy.price + sell.price) / 2;
      }
      execPrice = Math.round(execPrice * 10) / 10;

      const qty = Math.min(buy.qty, sell.qty);
      trades.push({
        buyer: buy.groupId, seller: sell.groupId,
        price: execPrice, qty,
        buyerIsMarket: buy.isMarket, sellerIsMarket: sell.isMarket
      });
      buys[bi] = { ...buy, qty: buy.qty - qty };
      sells[si] = { ...sell, qty: sell.qty - qty };
      if (buys[bi].qty === 0) bi++;
      if (sells[si].qty === 0) si++;
    } else {
      break;
    }
  }

  let clearingPrice = null;
  let referencePrice = null;
  let noTrade = false;

  if (trades.length > 0) {
    clearingPrice = trades[trades.length - 1].price;
  } else {
    noTrade = true;
    const realBuys = buys.filter(b => !b.isMarket && b.qty > 0);
    const realSells = sells.filter(s => !s.isMarket && s.qty > 0);
    const hBid = realBuys.length > 0 ? realBuys[0].price : currentPrice * 0.7;
    const lAsk = realSells.length > 0 ? realSells[0].price : currentPrice * 1.3;
    referencePrice = Math.round((hBid + lAsk) / 2 * 10) / 10;
  }

  return { trades, clearingPrice, referencePrice, noTrade, buys, sells, midPrice };
}

function settlePortfolio(portfolio, order, matchResult, role, D, previousPrice) {
  const { trades, clearingPrice, referencePrice, noTrade } = matchResult;
  const price = clearingPrice || referencePrice;
  const p = { ...portfolio };

  if (!order) {
    // No order submitted (hold)
    const creditLine0 = (role === 'marketmaker') ? 500 : 0;
    p.totalAssets = p.cash + p.shares * price - p.shortPosition * price - creditLine0;
    p.totalAssets = Math.round(p.totalAssets * 10) / 10;
    return p;
  }

  const myTrades = trades.filter(t => t.buyer === order.groupId || t.seller === order.groupId);

  let cashChange = 0;
  let sharesChange = 0;

  // Hedge fund short/cover: trades affect cash but NOT shares count.
  // The short position is tracked separately.
  const isHedgeShort = (role === 'hedge' && order.isShort);
  const isHedgeCover = (role === 'hedge' && order.isCover);

  myTrades.forEach(trade => {
    if (trade.buyer === order.groupId) {
      cashChange -= trade.price * trade.qty;
      if (!isHedgeCover) sharesChange += trade.qty;
    } else {
      cashChange += trade.price * trade.qty;
      if (!isHedgeShort) sharesChange -= trade.qty;
    }
  });

  // Growth fund bonus
  if (role === 'growth' && myTrades.length > 0) {
    const bought = myTrades.some(t => t.buyer === order.groupId);
    const sold = myTrades.some(t => t.seller === order.groupId);
    if (bought && price > previousPrice) {
      const buyTrades = myTrades.filter(t => t.buyer === order.groupId);
      const buyProfit = buyTrades.reduce((s, t) => s + (price - t.price) * t.qty, 0);
      if (buyProfit > 0) cashChange += buyProfit * 0.3;
    }
    if (sold && price < previousPrice) {
      const sellTrades = myTrades.filter(t => t.seller === order.groupId);
      const sellProfit = sellTrades.reduce((s, t) => s + (t.price - price) * t.qty, 0);
      if (sellProfit > 0) cashChange += sellProfit * 0.3;
    }
  }

  // Retail follow-trend discount
  if (role === 'retail' && order.followTrendActive) {
    if (cashChange > 0) cashChange *= 0.9;
  }

  // Hedge fund short handling
  if (role === 'hedge') {
    if (order.isShort) {
      // Track how many shares were actually sold short (matched trades)
      const shortFilled = myTrades.filter(t => t.seller === order.groupId)
                                   .reduce((s, t) => s + t.qty, 0);
      p.shortPosition += shortFilled;
      p.shortCostBasis = price;
    }
    if (order.isCover && p.shortPosition > 0) {
      // Cover buys matched — close the short position
      // Net P&L is already captured in cash: original short sale proceeds - cover buy cost
      p.shortPosition = 0;
      p.shortCostBasis = null;
    }
    // Forced liquidation check: unrealized loss > 50% of short value
    if (p.shortPosition > 0 && p.shortCostBasis) {
      const unrealizedLoss = (price - p.shortCostBasis) * p.shortPosition;
      if (unrealizedLoss > 0) {
        const shortValue = p.shortCostBasis * p.shortPosition;
        if (unrealizedLoss > shortValue * 0.5) {
          // Force cover at current price: cash decreases by buying back
          cashChange -= price * p.shortPosition;
          p.shortPosition = 0;
          p.shortCostBasis = null;
        }
      }
    }
  }

  // Pension fund dividend
  if (role === 'pension') {
    const newShares = p.shares + sharesChange;
    const dividend = newShares * price * 0.02;
    if (dividend > 0) {
      cashChange += dividend;
      p.dividendAccumulated += dividend;
    }
  }

  p.cash = Math.round((p.cash + cashChange) * 10) / 10;
  p.shares += sharesChange;

  // Total assets = cash + share value - short liability - credit line
  // Market maker has 500 credit line that doesn't count as own assets
  const creditLine = (role === 'marketmaker') ? 500 : 0;
  p.totalAssets = p.cash + p.shares * price - p.shortPosition * price - creditLine;
  p.totalAssets = Math.round(p.totalAssets * 10) / 10;

  // Asset floor
  if (p.totalAssets < 200) {
    p.frozen = true;
  }

  return p;
}

// End-of-game forced liquidation for hedge fund and market maker
function forceLiquidateEndGame(portfolios, finalPrice) {
  const result = {};
  for (let g = 1; g <= 5; g++) {
    const key = 'group' + g;
    const p = { ...portfolios[key] };
    const role = ROLES[g].id;

    if (role === 'hedge') {
      // Cover all short positions at market price (buy back the borrowed shares)
      if (p.shortPosition > 0) {
        p.cash = Math.round((p.cash - finalPrice * p.shortPosition) * 10) / 10;
        p.shortPosition = 0;
        p.shortCostBasis = null;
      }
      // Sell all shares at market price
      if (p.shares !== 0) {
        p.cash = Math.round((p.cash + p.shares * finalPrice) * 10) / 10;
        p.shares = 0;
      }
    }

    if (role === 'marketmaker') {
      // Sell all shares at market price
      if (p.shares !== 0) {
        p.cash = Math.round((p.cash + p.shares * finalPrice) * 10) / 10;
        p.shares = 0;
      }
    }

    // Recalculate total assets = cash + shares*price - short liability - credit line
    const creditLine = (role === 'marketmaker') ? 500 : 0;
    p.totalAssets = p.cash + p.shares * finalPrice - p.shortPosition * finalPrice - creditLine;
    p.totalAssets = Math.round(p.totalAssets * 10) / 10;

    result[key] = p;
  }
  return result;
}

function computeImpliedR(order, D) {
  if (!order) return null;
  if (order.role === 'marketmaker') {
    const bidR = order.bidPrice > 0 ? Math.round(D / order.bidPrice * 1000) / 1000 : null;
    const askR = order.askPrice > 0 ? Math.round(D / order.askPrice * 1000) / 1000 : null;
    return { bidR, askR, avgR: bidR && askR ? Math.round((bidR + askR) / 2 * 1000) / 1000 : null };
  }
  if (order.direction === 'hold' || !order.price || order.orderType === 'market') return null;
  return Math.round(D / order.price * 1000) / 1000;
}

function computeSpecialAwards(state) {
  const awards = [];
  const rounds = ROUNDS;

  // Most Rational: lowest avg deviation from P*
  let deviations = {};
  for (let g = 1; g <= 5; g++) deviations['group' + g] = [];

  for (let r = 0; r < state.priceHistory.length - 1; r++) {
    const roundData = rounds[r];
    if (!roundData) continue;
    for (let g = 1; g <= 5; g++) {
      const order = state.allOrders && state.allOrders['round' + (r + 1)] && state.allOrders['round' + (r + 1)]['group' + g];
      if (!order) continue;
      let price = order.role === 'marketmaker' ? (order.bidPrice + order.askPrice) / 2 : order.price;
      if (price) {
        deviations['group' + g].push(Math.abs(price - roundData.pStar));
      }
    }
  }

  let minDeviation = Infinity, rationalGroup = null;
  for (let g = 1; g <= 5; g++) {
    const devs = deviations['group' + g];
    if (devs.length > 0) {
      const avg = devs.reduce((a, b) => a + b, 0) / devs.length;
      if (avg < minDeviation) { minDeviation = avg; rationalGroup = g; }
    }
  }
  if (rationalGroup) awards.push({ icon: '🎯', title: 'Most Rational', group: rationalGroup, detail: `Avg deviation from P*: ${minDeviation.toFixed(1)}` });

  // Contrarian Hero: bought most in round 4
  let maxBuyR4 = 0, contrarianGroup = null;
  const r4Orders = state.allOrders && state.allOrders.round4;
  if (r4Orders) {
    for (let g = 1; g <= 5; g++) {
      const o = r4Orders['group' + g];
      if (o && o.direction === 'buy') {
        const qty = o.quantity;
        if (qty > maxBuyR4) { maxBuyR4 = qty; contrarianGroup = g; }
      }
      if (o && o.role === 'marketmaker' && o.bidQty > maxBuyR4) {
        maxBuyR4 = o.bidQty; contrarianGroup = g;
      }
    }
  }
  if (contrarianGroup) awards.push({ icon: '😤', title: 'Contrarian Hero', group: contrarianGroup, detail: `Bought ${maxBuyR4} shares in Round 4 crash` });

  // Shiller Award: most deviation from P* in round 3
  let maxDevR3 = 0, shillerGroup = null;
  const r3Orders = state.allOrders && state.allOrders.round3;
  if (r3Orders) {
    const pStar3 = rounds[2].pStar;
    for (let g = 1; g <= 5; g++) {
      const o = r3Orders['group' + g];
      if (!o) continue;
      let price = o.role === 'marketmaker' ? (o.bidPrice + o.askPrice) / 2 : o.price;
      if (price) {
        const dev = Math.abs(price - pStar3);
        if (dev > maxDevR3) { maxDevR3 = dev; shillerGroup = g; }
      }
    }
  }
  if (shillerGroup) awards.push({ icon: '🌊', title: 'Shiller Award', group: shillerGroup, detail: `Deviated ${maxDevR3.toFixed(1)} from P* in Round 3` });

  // Best Liquidity Provider (Market Maker): total spread income
  const mmPortfolio = state.portfolios.group5;
  if (mmPortfolio) {
    const spreadIncome = mmPortfolio.cash - 1500 + (mmPortfolio.shares * state.currentPrice);
    awards.push({ icon: '🏦', title: 'Best Liquidity Provider', group: 5, detail: `Spread income: ${spreadIncome.toFixed(1)}` });
  }

  // Best Opportunity Spotter (Hedge Fund): total P&L from all trades
  const hedgePortfolio = state.portfolios.group2;
  if (hedgePortfolio) {
    const hedgePnL = hedgePortfolio.totalAssets - 1000;
    awards.push({ icon: '🔍', title: 'Best Opportunity Spotter', group: 2, detail: `Net P&L: ${hedgePnL.toFixed(1)}` });
  }

  // Strongest Momentum (Growth Fund): total P&L from momentum bonus
  const growthPortfolio = state.portfolios.group4;
  if (growthPortfolio) {
    const growthPnL = growthPortfolio.totalAssets - 1000;
    awards.push({ icon: '🚀', title: 'Strongest Momentum', group: 4, detail: `Net P&L: ${growthPnL.toFixed(1)}` });
  }

  // Loudest Voice in Market (Retail): total volume traded across all rounds
  let retailVolume = 0;
  if (state.allOrders) {
    for (let r = 1; r <= (state.totalRounds || 5); r++) {
      const ro = state.allOrders['round' + r];
      if (ro && ro.group3) {
        const o = ro.group3;
        retailVolume += o.quantity || 0;
      }
    }
  }
  awards.push({ icon: '📢', title: 'Loudest Voice in Market', group: 3, detail: `Total volume: ${retailVolume} shares traded` });

  return awards;
}

function r(val) { return Math.round(val * 10) / 10; }
