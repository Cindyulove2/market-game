// ============================================================
// lottery-store.js — Firebase state management for lottery
// ============================================================

const LOTTERY_FIREBASE_PATH = '/lottery/state';
const LOTTERY_LS_KEY = 'lottery_state';

function createInitialLotteryState() {
  return {
    // Two prize pools
    pools: {
      A: { name: 'Group A', prizes: [] },
      B: { name: 'Group B', prizes: [] },
    },
    // Draw history: { id, pool, studentName, prize, timestamp }
    draws: [],
    // Control
    isOpen: false,       // whether students can draw
    showResult: null,    // current result to animate on display { studentName, prize, pool }
  };
}

class LotteryStore {
  constructor() {
    this.listeners = [];
    this._cache = null;
    this._useFirebase = false;
    this._dbRef = null;

    if (typeof firebase !== 'undefined' && firebase.database) {
      try {
        this._dbRef = firebase.database().ref(LOTTERY_FIREBASE_PATH);
        this._useFirebase = true;
        this._dbRef.on('value', (snapshot) => {
          const val = snapshot.val();
          if (val) {
            this._cache = val;
            localStorage.setItem(LOTTERY_LS_KEY, JSON.stringify(val));
          } else {
            const initial = createInitialLotteryState();
            this._dbRef.set(initial);
            this._cache = initial;
          }
          this._notify();
        });
      } catch (e) {
        this._useFirebase = false;
      }
    }

    if (!this._useFirebase) {
      this._channel = new BroadcastChannel('lottery_sync');
      this._channel.onmessage = () => { this._cache = null; this._notify(); };
    }
  }

  getState() {
    if (this._cache) return this._cache;
    const raw = localStorage.getItem(LOTTERY_LS_KEY);
    if (raw) { this._cache = JSON.parse(raw); return this._cache; }
    const initial = createInitialLotteryState();
    localStorage.setItem(LOTTERY_LS_KEY, JSON.stringify(initial));
    this._cache = initial;
    return initial;
  }

  setState(updates, immediate) {
    const next = { ...this.getState(), ...updates };
    this._cache = next;
    localStorage.setItem(LOTTERY_LS_KEY, JSON.stringify(next));
    if (this._useFirebase && this._dbRef) {
      this._dbRef.set(next);
    } else {
      if (this._channel) this._channel.postMessage({ type: 'u' });
      this._notify();
    }
  }

  subscribe(fn) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  _notify() {
    const s = this.getState();
    this.listeners.forEach(fn => { try { fn(s); } catch(e) {} });
  }

  reset() {
    const initial = createInitialLotteryState();
    this._cache = initial;
    if (this._useFirebase && this._dbRef) { this._dbRef.set(initial); }
    else {
      localStorage.setItem(LOTTERY_LS_KEY, JSON.stringify(initial));
      if (this._channel) this._channel.postMessage({ type: 'u' });
      this._notify();
    }
  }
}

const lotteryStore = new LotteryStore();
