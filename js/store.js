// ============================================================
// store.js — State management with cross-tab sync
// Uses localStorage + BroadcastChannel for real-time sync
// ============================================================

const STORE_KEY = 'marketgame_state';
const CHANNEL_NAME = 'marketgame_sync';

class GameStore {
  constructor() {
    this.listeners = [];
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (e) => {
      if (e.data.type === 'stateUpdate') {
        this._notify();
      }
    };
  }

  getState() {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) {
      const initial = createInitialState();
      localStorage.setItem(STORE_KEY, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw);
  }

  setState(updates) {
    const current = this.getState();
    const next = { ...current, ...updates };
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
    this.channel.postMessage({ type: 'stateUpdate' });
    this._notify();
  }

  // Deep merge for nested objects like portfolios, orders
  mergeState(path, value) {
    const state = this.getState();
    const keys = path.split('.');
    let obj = state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    this.channel.postMessage({ type: 'stateUpdate' });
    this._notify();
  }

  subscribe(fn) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  _notify() {
    const state = this.getState();
    this.listeners.forEach(fn => fn(state));
  }

  resetGame() {
    const initial = createInitialState();
    localStorage.setItem(STORE_KEY, JSON.stringify(initial));
    this.channel.postMessage({ type: 'stateUpdate' });
    this._notify();
  }
}

const store = new GameStore();
