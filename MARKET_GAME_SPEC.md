# The Market Game — Technical Specification
## For Claude Code Implementation

---

## Overview

A real-time multiplayer web application simulating a stock market trading game for classroom use. 25 students split into 5 groups, each group uses one device. A tutor controls the game flow from a separate admin interface. Results are projected on a big screen via a display interface.

**Tech stack recommendation:** Next.js + Supabase (real-time database) + Tailwind CSS. Alternatively: plain HTML/CSS/JS with Firebase Realtime Database — simpler to deploy, no build step required.

**Recommended simple stack:** Single HTML file per interface, Firebase Realtime Database for state sync. No backend server required. Can be hosted on any static host or run locally.

---

## Interfaces

Three separate URLs/pages:

| Interface | URL | Used by | Description |
|---|---|---|---|
| Group interface | `/group?id=1` to `/group?id=5` | Each group's device | Submit orders each round |
| Admin interface | `/admin` | Tutor's laptop | Control game flow, run matching, publish results |
| Display interface | `/display` | Projector screen | Show order book, prices, leaderboard live |

---

## Game State (stored in database)

```javascript
gameState = {
  // Game control
  phase: "waiting" | "signal" | "ordering" | "reveal" | "results",
  currentRound: 1,        // 1-5
  timerSeconds: 60,       // countdown timer
  timerRunning: false,

  // Round data
  rounds: [
    {
      roundNumber: 1,
      D: 5,               // dividend this round
      event: "Markets are calm. No major news.",
      eventChinese: "市场平静，无重大事件。",
      standardR: 0.05,    // tutor's reference r
      pStar: 100,         // D / standardR
      referenceRates: {   // r reference table shown to students
        optimistic: 0.03,
        neutral: 0.05,
        pessimistic: 0.08,
        panic: 0.15
      }
    },
    // rounds 2-5...
  ],

  // Current round orders (reset each round)
  orders: {
    group1: null,   // see Order schema below
    group2: null,
    group3: null,
    group4: null,
    group5: null,
  },

  // Matching results (computed after all orders in)
  matchingResults: {
    trades: [],           // list of matched trades
    clearingPrice: null,  // final price this round
    referencePrice: null, // used if no trades matched
    noTrade: false,       // true if liquidity crisis
  },

  // Cumulative state
  currentPrice: 100,      // updates after each round
  priceHistory: [100],    // price after each round [initial, r1, r2, ...]
  pStarHistory: [100],    // P* after each round

  // Group portfolios
  portfolios: {
    group1: {
      cash: 1000,
      shares: 0,
      shortPosition: 0,       // negative = short
      shortCostBasis: null,   // price at which short was opened
      dividendAccumulated: 0, // pension fund running total
    },
    // groups 2-5...
  },

  // Asset history for chart
  assetHistory: {
    group1: [1000],   // total assets after each round
    // groups 2-5...
  },

  // Revealed implicit r values (computed after each round)
  impliedRHistory: {
    group1: [],   // implied r = D / order price, per round
    // groups 2-5...
  },
}
```

---

## Order Schema

```javascript
order = {
  groupId: 1,           // 1-5
  role: "pension",      // pension | hedge | retail | growth | marketmaker

  // For all groups except market maker
  direction: "buy" | "sell" | "hold",
  price: 95,
  quantity: 3,          // shares

  // Retail group extras
  retailMode: "emotion" | "followtrend" | null,
  emotionExtra: true,   // adds 1 extra share if direction filled to max
  followTrendActive: false,  // set to true after seeing other directions

  // Market maker only
  bidPrice: 88,
  bidQty: 3,
  askPrice: 105,
  askQty: 3,

  // Hedge fund short selling
  isShort: false,       // true = opening short position
  isCover: false,       // true = closing short position

  // Computed after submission
  impliedR: null,       // D / price (or D / bidPrice, D / askPrice for MM)
  submittedAt: timestamp,
}
```

---

## Five Groups — Roles and Rules

### Group 1 — Pension Fund 🏛️
- **Mechanic:** At end of each round, earn dividend: `shares × currentPrice × 0.02` added to cash
- **Constraint:** Normal buy/sell only, no shorting
- **Order form:** Standard (direction, price, quantity)

### Group 2 — Hedge Fund 🐺
- **Mechanic:** Can go short. When shorting, record `shortCostBasis = currentPrice`. When covering, profit = `(shortCostBasis - coverPrice) × quantity`
- **Forced liquidation:** If unrealized short loss > 50% of short value, force cover at current reference price
- **Order form:** Standard + short/cover toggle

### Group 3 — Retail Investors 😰
- **Mechanic 1 (Emotion mode):** If quantity = max affordable (all cash used), can add 1 extra emotion share at same price/direction
- **Mechanic 2 (Follow trend mode):** After all groups reveal direction (not price/quantity), retail has 10 seconds to change their direction and price. Round profit × 0.9 if follow trend used.
- **Two modes are mutually exclusive per round**
- **Order form:** Standard + mode selector + emotion toggle

### Group 4 — Growth Fund 🚀
- **Mechanic:** If this round's clearing price > last round's price AND group bought → profit × 1.3. If clearing price < last round AND group sold → profit × 1.3. No bonus if direction was wrong.
- **Order form:** Standard

### Group 5 — Market Maker 🏦
- **Mechanic:** Must submit BOTH bid and ask every round. Cannot submit single-sided.
- **Constraint:** Ask > Bid always enforced
- **Credit line:** Extra 500 on top of 1000 cash = 1500 usable
- **End of game:** Remaining inventory valued at `finalPrice × 0.80`
- **Profit:** Spread income from matched trades
- **Order form:** Bid price + bid qty + ask price + ask qty

---

## Five Rounds — Pre-configured Data

```javascript
const ROUNDS = [
  {
    roundNumber: 1,
    D: 5,
    event: "Markets are calm. No major macroeconomic news.",
    standardR: 0.05,
    pStar: 100,
    referenceRates: { optimistic: 0.03, neutral: 0.05, pessimistic: 0.08, panic: 0.15 },
    referenceTable: [
      // Pre-computed P* = D/r for each combination
      { r: "3% (optimistic)",  D4: 133, D5: 167, D6: 200 },
      { r: "5% (neutral)",     D4: 80,  D5: 100, D6: 120 },
      { r: "8% (pessimistic)", D4: 50,  D5: 63,  D6: 75  },
      { r: "15% (panic)",      D4: 27,  D5: 33,  D6: 40  },
    ]
  },
  {
    roundNumber: 2,
    D: 4,
    event: "GDP unexpectedly contracts. Economists warn of recession risk. Consumer confidence falls sharply.",
    standardR: 0.08,
    pStar: 50,
    referenceRates: { optimistic: 0.03, neutral: 0.05, pessimistic: 0.08, panic: 0.15 },
    referenceTable: [ /* same structure */ ]
  },
  {
    roundNumber: 3,
    D: 6,
    event: "Central bank cuts rates by 50bp. Tech breakthrough announced. Analysts universally bullish. Euphoria.",
    standardR: 0.03,
    pStar: 200,
    referenceRates: { optimistic: 0.03, neutral: 0.05, pessimistic: 0.08, panic: 0.15 },
    referenceTable: [ /* same structure */ ]
  },
  {
    roundNumber: 4,
    D: 6,
    event: "Major geopolitical shock. Markets in panic. Liquidity drying up. Emergency meetings called.",
    standardR: 0.12,
    pStar: 50,
    referenceRates: { optimistic: 0.03, neutral: 0.05, pessimistic: 0.08, panic: 0.15 },
    referenceTable: [ /* same structure */ ]
  },
  {
    roundNumber: 5,
    D: 5,
    event: "Central bank cuts 50bp. Government announces major fiscal stimulus. Policy rescue underway.",
    standardR: 0.04,
    pStar: 125,
    referenceRates: { optimistic: 0.03, neutral: 0.05, pessimistic: 0.08, panic: 0.15 },
    referenceTable: [ /* same structure */ ]
  }
]
```

---

## Order Matching Algorithm

Run this after all 5 groups submit (or tutor triggers manually):

```javascript
function runMatching(orders, currentPrice, D) {
  // 1. Build buy side and sell side
  let buys = []
  let sells = []

  orders.forEach(order => {
    if (order.role === 'marketmaker') {
      buys.push({ groupId: order.groupId, price: order.bidPrice, qty: order.bidQty, role: 'marketmaker' })
      sells.push({ groupId: order.groupId, price: order.askPrice, qty: order.askQty, role: 'marketmaker' })
    } else {
      if (order.direction === 'buy') {
        let qty = order.quantity
        if (order.retailMode === 'emotion' && order.emotionExtra) qty += 1
        buys.push({ groupId: order.groupId, price: order.price, qty, role: order.role })
      } else if (order.direction === 'sell') {
        sells.push({ groupId: order.groupId, price: order.price, qty: order.quantity, role: order.role })
      }
    }
  })

  // 2. Sort: buys descending by price, sells ascending by price
  buys.sort((a, b) => b.price - a.price)
  sells.sort((a, b) => a.price - b.price)

  // 3. Match pairs
  let trades = []
  let bi = 0, si = 0

  while (bi < buys.length && si < sells.length) {
    const buy = buys[bi]
    const sell = sells[si]

    if (buy.price >= sell.price) {
      const clearPrice = (buy.price + sell.price) / 2
      const qty = Math.min(buy.qty, sell.qty)
      trades.push({
        buyer: buy.groupId,
        seller: sell.groupId,
        price: Math.round(clearPrice * 10) / 10,
        qty
      })
      buy.qty -= qty
      sell.qty -= qty
      if (buy.qty === 0) bi++
      if (sell.qty === 0) si++
    } else {
      break // no more matches possible
    }
  }

  // 4. Determine clearing price and reference price
  let clearingPrice = null
  let referencePrice = null
  let noTrade = false

  if (trades.length > 0) {
    // Use last matched trade price as clearing price
    clearingPrice = trades[trades.length - 1].price
  } else {
    // No trades — liquidity crisis
    noTrade = true
    const highestBid = buys.length > 0 ? buys[0].price : currentPrice * 0.7
    const lowestAsk = sells.length > 0 ? sells[0].price : currentPrice * 1.3
    referencePrice = Math.round((highestBid + lowestAsk) / 2 * 10) / 10
  }

  return { trades, clearingPrice, referencePrice, noTrade, buys, sells }
}
```

---

## Portfolio Settlement Algorithm

Run after matching, for each group:

```javascript
function settlePortfolio(portfolio, order, matchResult, role, D, previousPrice) {
  const { trades, clearingPrice, referencePrice, noTrade } = matchResult
  const price = clearingPrice || referencePrice

  // Find trades involving this group
  const myTrades = trades.filter(t => t.buyer === order.groupId || t.seller === order.groupId)

  let cashChange = 0
  let sharesChange = 0

  myTrades.forEach(trade => {
    if (trade.buyer === order.groupId) {
      cashChange -= trade.price * trade.qty
      sharesChange += trade.qty
    } else {
      cashChange += trade.price * trade.qty
      sharesChange -= trade.qty
    }
  })

  // Apply growth fund bonus
  if (role === 'growth' && myTrades.length > 0) {
    const bought = myTrades.filter(t => t.buyer === order.groupId).length > 0
    const sold = myTrades.filter(t => t.seller === order.groupId).length > 0
    if (bought && price > previousPrice) cashChange = cashChange * 1.3  // simplified
    if (sold && price < previousPrice) cashChange = cashChange * 1.3
  }

  // Apply retail follow-trend discount
  if (role === 'retail' && order.followTrendActive) {
    // Reduce profit by 10% — apply to positive cashChange only
    if (cashChange > 0) cashChange *= 0.9
  }

  // Handle hedge fund short
  if (role === 'hedge') {
    if (order.isShort) {
      portfolio.shortPosition += order.quantity
      portfolio.shortCostBasis = price
    }
    if (order.isCover && portfolio.shortPosition > 0) {
      const shortProfit = (portfolio.shortCostBasis - price) * portfolio.shortPosition
      cashChange += shortProfit
      portfolio.shortPosition = 0
      portfolio.shortCostBasis = null
    }
    // Check forced liquidation
    if (portfolio.shortPosition > 0 && portfolio.shortCostBasis) {
      const unrealizedLoss = (price - portfolio.shortCostBasis) * portfolio.shortPosition
      const shortValue = portfolio.shortCostBasis * portfolio.shortPosition
      if (unrealizedLoss > shortValue * 0.5) {
        // Force cover
        const forcedProfit = (portfolio.shortCostBasis - price) * portfolio.shortPosition
        cashChange += forcedProfit
        portfolio.shortPosition = 0
        portfolio.shortCostBasis = null
      }
    }
  }

  // Apply pension fund dividend
  if (role === 'pension') {
    const dividend = portfolio.shares * price * 0.02
    cashChange += dividend
    portfolio.dividendAccumulated += dividend
  }

  // Update portfolio
  portfolio.cash += cashChange
  portfolio.shares += sharesChange

  // Compute total assets
  portfolio.totalAssets = portfolio.cash + portfolio.shares * price
  if (portfolio.shortPosition > 0 && portfolio.shortCostBasis) {
    portfolio.totalAssets += (portfolio.shortCostBasis - price) * portfolio.shortPosition
  }

  // Enforce minimum asset floor
  if (portfolio.totalAssets < 200) {
    portfolio.frozen = true  // flag — group cannot trade next round
  }

  return portfolio
}
```

---

## Game Flow — Phase by Phase

### Phase: `waiting`
- Display: "Waiting for game to start"
- Admin: Shows "Start Round 1" button

### Phase: `signal`
- Triggered by: Admin clicks "Start Round N"
- Display: Show round number, D value, event description, r reference table, current price
- Group interfaces: Show signal info, "Ready to order" button
- Duration: No timer, tutor controls when to advance
- Admin: "Open Ordering" button

### Phase: `ordering`
- Triggered by: Admin clicks "Open Ordering"
- Timer: 60 seconds countdown (visible on all screens)
- Group interfaces: Order form is now active and submittable
- Display: Show order status per group (submitted ✓ / waiting ...)
- Admin: Can see all submitted orders in real time, "Run Matching" button (enabled when all 5 submitted, or after timer ends)

### Phase: `reveal` (sub-phases)

**Sub-phase A: follow-trend window (retail only)**
- Duration: 10 seconds
- Only retail group sees other groups' directions (not prices/quantities)
- Retail can update their order during this window
- All other groups see "Waiting for retail..."

**Sub-phase B: order book display**
- Show full order book on display screen
- All buys and sells listed
- Admin clicks "Run Matching"

**Sub-phase C: matching animation**
- Show each matched pair with price
- Highlight liquidity crisis if no trades

**Sub-phase D: results**
- Show clearing price vs P*
- Show implied r for each group (computed from their submitted prices)
- Show updated portfolios
- Show asset leaderboard

### Phase: `results` (final, after round 5)
- Full game summary
- Five-round price chart: actual price vs P*
- Five-round implied r chart per group
- Final leaderboard
- Special awards

---

## Display Screen Layout

### During `ordering` phase:
```
┌─────────────────────────────────────────────────────┐
│  ROUND 3 / 5          D = 6          Timer: 0:45    │
├─────────────────────────────────────────────────────┤
│  EVENT: Central bank cuts rates. Analysts bullish.  │
├────────────────────┬────────────────────────────────┤
│  r Reference Table │  Order Status                  │
│  3%  → P* = 200    │  🏛️ Pension     ✓ Submitted    │
│  5%  → P* = 120    │  🐺 Hedge       ✓ Submitted    │
│  8%  → P* =  75    │  😰 Retail      ⏳ Waiting     │
│  15% → P* =  40    │  🚀 Growth      ✓ Submitted    │
│                    │  🏦 Market Maker ✓ Submitted   │
├────────────────────┴────────────────────────────────┤
│  Last Price: 85     P* this round: 200              │
└─────────────────────────────────────────────────────┘
```

### During `reveal` phase — order book:
```
┌──────────────────────────────────────────────────────┐
│              ORDER BOOK — ROUND 3                    │
├───────────────────────┬──────────────────────────────┤
│  SELL (low → high)    │  BUY (high → low)            │
│  🐺 85  × 3 shares    │  😰 110 × 3+1 shares         │
│  🏦 105 × 3 shares    │  🚀 100 × 3 shares           │
│                       │  🏛️  95  × 3 shares          │
│                       │  🏦  88  × 3 shares          │
├───────────────────────┴──────────────────────────────┤
│  ✓ MATCH: 🐺 sells to 😰 at price 97.5              │
│  ✓ MATCH: 🐺 sells to 🚀 at price 92.5              │
│  ✗ No more matches (next buy 95 < next sell 105)     │
├──────────────────────────────────────────────────────┤
│  Clearing Price: 92.5       P*: 200                  │
│  Market price BELOW P* by 54%                        │
└──────────────────────────────────────────────────────┘
```

### Leaderboard (shown after each round):
```
┌──────────────────────────────────────────────────────┐
│                   LEADERBOARD                        │
├────────────────┬──────────┬──────────┬───────────────┤
│  Group         │  Cash    │  Shares  │  Total Assets │
├────────────────┼──────────┼──────────┼───────────────┤
│ 1. 🚀 Growth   │  850     │  6       │  1405  ▲      │
│ 2. 😰 Retail   │  700     │  4       │  1070  ▲      │
│ 3. 🏛️ Pension  │  950     │  1       │  1043  ▲      │
│ 4. 🐺 Hedge    │  1150    │  -3(S)   │  982   ▼      │
│ 5. 🏦 MktMkr   │  1080    │  2       │  265   ▼      │
└────────────────┴──────────┴──────────┴───────────────┘
```

---

## Group Interface — Order Form

### Standard groups (pension, hedge, growth):
```
Round 3 | D = 6 | Last Price: 85

r Reference:  3% → 200 | 5% → 120 | 8% → 75 | 15% → 40

Your cash: 850    Your shares: 2

Direction:  [BUY]  [SELL]  [HOLD]

Price:  [___]
Qty:    [___]

[SUBMIT ORDER]
```

### Hedge fund extras:
```
Order type: [ Normal Buy/Sell ]  [ Open Short ]  [ Cover Short ]
(Cover Short only shown if shortPosition > 0)
```

### Retail group:
```
Mode this round:
  [ EMOTION MODE ]   — Submit first, max out for bonus share
  [ FOLLOW TREND ]   — See other groups' directions first (−10% profit)

[standard form below]

Emotion extra share: [YES] [NO]   (only shown if qty = max)
```

### Market maker:
```
You MUST submit both sides.

BID (buy):  Price [___]  Qty [___]
ASK (sell): Price [___]  Qty [___]

Note: Ask must be greater than Bid.

[SUBMIT ORDER]
```

---

## Final Results Screen

After round 5, show:

### 1. Price Chart
Line chart with two series:
- Actual clearing price per round (blue line)
- P* per round (dashed orange line)
- X-axis: Round 1–5
- Y-axis: Price 0–250

### 2. Implied r Chart
Line chart with one series per group:
- Each group's implied r per round (computed as D / submitted price)
- Shows how risk perception varied across groups and rounds
- X-axis: Round 1–5
- Y-axis: r% 0–20%

### 3. Final Leaderboard
Ranked by total assets. Show cash + shares + any unrealized P&L.

### 4. Special Awards
Computed automatically:

| Award | Condition |
|---|---|
| 🎯 Most Rational | Lowest average deviation from P* across all rounds |
| 🐻 Best Short | Hedge fund's highest single-trade short profit |
| 🏦 Best Market Maker | Market maker's total spread income |
| 😤 Contrarian Hero | Group that bought most in round 4 (crash) |
| 🌊 Shiller Award | Group whose orders deviated most from P* in round 3 |

### 5. Key Insight Line
Always shown at the bottom:

> "Round 3 and Round 4 had identical dividends (D = 6). But the clearing price moved from ___ to ___. The dividend didn't change — your risk perception did. This is Cochrane's finding: price volatility comes from discount rate changes, not dividend changes."

---

## Admin Interface

Single page with:

**Left panel — Game controls:**
- Current phase indicator
- Round progress (1/5, 2/5...)
- Timer control (start/pause/reset)
- Phase advance buttons:
  - "Open Ordering" (signals → ordering)
  - "Run Matching" (ordering → reveal) — enabled when all submitted or timer ends
  - "Next Round" (reveal → signal, next round)
  - "End Game" (after round 5)

**Right panel — Live order view:**
- Table showing all submitted orders in real time
- Highlights when all 5 groups have submitted
- Shows implied r for each submitted price

**Bottom panel — Portfolio overview:**
- Current assets per group
- Shares held, cash, short positions
- Updates after each round

---

## Database Structure (Firebase Realtime Database)

```
/game
  /state          → gameState object (see above)
  /orders
    /round1
      /group1     → order object
      /group2     → order object
      ...
    /round2
      ...
  /portfolios
    /group1       → portfolio object
    /group2       → portfolio object
    ...
  /results
    /round1
      /trades     → array of trade objects
      /clearingPrice
      /referencePrice
      /noTrade
      /pStar
    ...
```

---

## Key UI/UX Requirements

**Timer:** Large countdown timer visible on all screens during ordering phase. Turn red in last 10 seconds. Play sound at 0 (optional).

**Order submission:** Once submitted, group sees confirmation and cannot resubmit (unless admin resets round). Show "Waiting for other groups..." after submission.

**Follow-trend window:** Only retail group sees this screen. Show each group as BUY / SELL / HOLD with icon, no numbers. 10-second countdown. After window closes, retail's updated order is locked in.

**Liquidity crisis:** When no trades matched, show dramatic red banner: "LIQUIDITY CRISIS — No trades matched this round." Show reference price in grey with note "(indicative only — no actual trades)".

**Implied r display:** After each round, show each group's submitted price and computed implied r. Formula shown: r = D / Price. This is the key teaching moment — make it visually prominent.

**P* vs Price comparison:** After each round, show a simple bar or gauge comparing clearing price to P*. Red if price > P* by >20%, green if within 10%, orange otherwise.

**Mobile responsive:** Group interfaces must work on tablets and phones. Large touch targets for direction buttons (BUY / SELL / HOLD).

---

## Error Handling

- Group tries to buy more than cash allows → show error, reject submission
- Group tries to sell more shares than held (non-hedge) → show error
- Market maker submits ask ≤ bid → show error, reject
- Group frozen (assets < 200) → show message, submit HOLD automatically
- Timer runs out before all groups submit → admin can force-proceed, missing groups get HOLD

---

## Development Notes

- No authentication required. Groups access by URL parameter (`/group?id=1`)
- Admin page should have a simple password (e.g. "tutor2024") to prevent accidental access
- All monetary values stored as numbers, displayed rounded to 1 decimal place
- Prices in order book sorted and re-rendered on each new submission
- Use optimistic UI updates for order submission (show confirmation immediately, sync in background)
- The follow-trend window for retail is time-sensitive — use server timestamp for the 10-second window, not client clock

---

## Suggested File Structure

```
/
├── index.html          (redirect to /group?id=1 or show role selector)
├── group.html          (group trading interface)
├── admin.html          (tutor control panel)
├── display.html        (projector view)
├── js/
│   ├── firebase.js     (firebase config and helpers)
│   ├── game.js         (game state, matching algorithm, settlement)
│   ├── group.js        (group interface logic)
│   ├── admin.js        (admin controls)
│   └── display.js      (display/projector logic)
├── css/
│   └── styles.css
└── README.md
```

---

## Quick Start for Claude Code

1. Set up Firebase project, get config keys
2. Initialize Realtime Database with the game state structure above
3. Build `admin.html` first — this drives all game state changes
4. Build `display.html` — purely reactive to game state, no writes
5. Build `group.html` — reads game state, writes orders only
6. Implement matching algorithm in `game.js`
7. Implement settlement algorithm in `game.js`
8. Wire up the follow-trend window timing logic
9. Build final results screen with charts (use Chart.js from cdnjs)
10. Test full 5-round game end-to-end

---

## Testing Checklist

- [ ] All 5 groups can submit orders simultaneously
- [ ] Market maker blocked from single-side submission
- [ ] Market maker Ask > Bid enforced
- [ ] Matching algorithm produces correct trades
- [ ] No-trade liquidity crisis handled correctly
- [ ] Pension fund dividend calculated each round
- [ ] Growth fund 1.3x bonus applied correctly
- [ ] Hedge fund short/cover settlement correct
- [ ] Forced short liquidation triggers at 50% loss
- [ ] Retail follow-trend 10-second window works
- [ ] Retail emotion extra share added correctly
- [ ] Retail follow-trend profit discount applied
- [ ] Asset floor (200) freezes group correctly
- [ ] Market maker end-of-game inventory at 80% value
- [ ] Implied r computed correctly from submitted prices
- [ ] Final charts render with correct data
- [ ] Special awards computed correctly
- [ ] Admin can reset a round if needed
- [ ] Display screen updates in real time
