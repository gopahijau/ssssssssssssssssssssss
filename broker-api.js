// ============================================
// ScalperBot Pro - Broker Integration API
// Deriv WebSocket + Exness Configuration
// ============================================

// ---- DERIV SYMBOL MAPPING ----
const derivSymbolMap = {
    USTEC: '1HZ100V',      // Deriv Volatility 100 Index (US Tech synthetic)
    XAUUSD: 'frxXAUUSD',   // Deriv forex Gold/USD
    BTCUSD: 'cryBTCUSD',   // Deriv crypto Bitcoin/USD
};

// Deriv symbol display names
const derivSymbolNames = {
    '1HZ100V': 'Volatility 100 Index',
    'frxXAUUSD': 'Gold/USD',
    'cryBTCUSD': 'Bitcoin/USD',
};

// ---- EXNESS-SPECIFIC SYMBOL CONFIG ----
// Exness uses MT4/MT5 — cannot connect via browser.
// These settings simulate Exness-specific spreads and execution.
const exnessConfig = {
    USTEC: {
        basePrice: 21845.50,
        pipSize: 0.5,
        spread: 1.8,         // Exness raw spread account typical spread
        pipValue: 1.0,
        volatility: 4.0,
        digits: 1,
        name: 'US100 (USTEC)',
        tickSize: 0.1,
        commission: 0.35,     // $0.35 per lot per side (raw spread)
        stopLevel: 10,
    },
    XAUUSD: {
        basePrice: 2341.80,
        pipSize: 0.01,       // Exness 2-decimal Gold pricing
        spread: 0.12,        // Exness raw spread account typical Gold spread
        pipValue: 1.0,
        volatility: 2.2,
        digits: 2,
        name: 'XAUUSD (Gold)',
        tickSize: 0.01,
        commission: 0.15,    // $0.15 per lot per side (raw spread)
        stopLevel: 5,
    },
    BTCUSD: {
        basePrice: 67245.00,
        pipSize: 1.0,
        spread: 20,          // Exness typical BTCUSD spread (cents)
        pipValue: 1.0,
        volatility: 90,
        digits: 2,
        name: 'BTCUSD (Bitcoin)',
        tickSize: 0.01,
        commission: 0.05,   // 0.05% commission
        stopLevel: 50,
    },
};

// Default simulator configs (what we already have, plus stop levels)
const simulatorConfig = {
    USTEC: {
        basePrice: 21845.50, pipSize: 0.5, spread: 1.5, pipValue: 1.0,
        volatility: 3.5, digits: 1, name: 'USTEC (Nas100)', tickSize: 0.1, stopLevel: 8,
    },
    XAUUSD: {
        basePrice: 2341.80, pipSize: 0.10, spread: 0.3, pipValue: 1.0,
        volatility: 1.8, digits: 2, name: 'XAUUSD (Gold)', tickSize: 0.01, stopLevel: 5,
    },
    BTCUSD: {
        basePrice: 67245.00, pipSize: 1.0, spread: 15, pipValue: 1.0,
        volatility: 80, digits: 2, name: 'BTCUSD (Bitcoin)', tickSize: 0.01, stopLevel: 30,
    },
};

// ---- DERIV WEBSOCKET API ----
class DerivAPI {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.authorized = false;
        this.appId = '1089';
        this.token = '';
        this.accountType = 'demo';
        this.subscriptions = [];
        this.pendingRequests = new Map();
        this.tickCallbacks = [];
        this.connectionCallbacks = [];
        this.accountInfo = null;
        this.balance = 0;
        this.currency = 'USD';
        this.reconnectAttempts = 0;
        this.maxReconnects = 5;
        this.reconnectDelay = 3000;
        this.pingInterval = null;
        this.lastPingTime = 0;
        this.latency = 0;
        this.currentSymbol = null;
        this.reqCounter = 0;
    }

    connect(token, appId, accountType) {
        return new Promise((resolve, reject) => {
            this.token = token;
            this.appId = appId || '1089';
            this.accountType = accountType || 'demo';

            try {
                this.ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${this.appId}`);
            } catch (err) {
                reject(new Error('Failed to create WebSocket connection'));
                return;
            }

            this.ws.onopen = () => {
                this.connected = true;
                this.reconnectAttempts = 0;
                this._notifyConnection('connected');

                // Start ping interval
                this.pingInterval = setInterval(() => {
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.lastPingTime = Date.now();
                        this.ws.send(JSON.stringify({ ping: 1 }));
                    }
                }, 25000);

                // Authorize
                this._send({ authorize: this.token })
                    .then(data => {
                        if (data.error) {
                            reject(new Error(data.error.message || 'Authorization failed'));
                            return;
                        }
                        this.authorized = true;
                        this.accountInfo = data;
                        // Extract balance info
                        if (data.authorize) {
                            this.balance = parseFloat(data.authorize.balance) || 0;
                            this.currency = data.authorize.currency || 'USD';
                            this.loginid = data.authorize.loginid || '';
                        }
                        this._notifyConnection('authorized', data);
                        
                        // Fetch current balance
                        this.getBalance().then(balData => {
                            if (balData && balData.balance) {
                                this.balance = parseFloat(balData.balance.balance) || this.balance;
                                this.currency = balData.balance.currency || this.currency;
                                this._notifyConnection('balance', { balance: this.balance, currency: this.currency });
                            }
                        }).catch(() => {});
                        
                        resolve(data);
                    })
                    .catch(reject);
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this._handleMessage(data);
                } catch (e) {
                    console.error('DerivAPI: Parse error', e);
                }
            };

            this.ws.onerror = (err) => {
                console.error('DerivAPI: WebSocket error', err);
                this._notifyConnection('error');
                reject(err);
            };

            this.ws.onclose = () => {
                this.connected = false;
                this.authorized = false;
                clearInterval(this.pingInterval);
                this._notifyConnection('disconnected');

                // Auto-reconnect
                if (this.reconnectAttempts < this.maxReconnects) {
                    this.reconnectAttempts++;
                    setTimeout(() => {
                        this._notifyConnection('reconnecting');
                        this.connect(this.token, this.appId, this.accountType)
                            .catch(() => {});
                    }, this.reconnectDelay * this.reconnectAttempts);
                }
            };
        });
    }

    disconnect() {
        this.reconnectAttempts = this.maxReconnects; // Prevent auto-reconnect
        if (this.pingInterval) clearInterval(this.pingInterval);
        // Forget all subscriptions
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this._send({ forget_all: 'ticks' }).catch(() => {});
            this.ws.close();
        }
        this.connected = false;
        this.authorized = false;
        this.currentSymbol = null;
        this._notifyConnection('disconnected');
    }

    subscribeTicks(derivSymbol, callback) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error('Not connected'));
        }

        // Register callback first so we don't miss ticks
        if (callback) {
            this.tickCallbacks.push({ symbol: derivSymbol, callback });
        }

        // Forget previous tick subscriptions first
        return this._send({ forget_all: 'ticks' })
            .then(() => {
                this.currentSymbol = derivSymbol;
                return this._send({ ticks: derivSymbol, subscribe: 1 });
            })
            .then((response) => {
                if (response.error) {
                    throw new Error(response.error.message || 'Tick subscription failed');
                }
                return response;
            })
            .catch(err => {
                // If forget_all fails (no subscriptions), try subscribing anyway
                if (err.message && err.message.includes('No subscription')) {
                    this.currentSymbol = derivSymbol;
                    return this._send({ ticks: derivSymbol, subscribe: 1 });
                }
                throw err;
            });
    }

    unsubscribeTicks() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return this._send({ forget_all: 'ticks' });
        }
        return Promise.resolve();
    }

    placeTrade(params) {
        /*
         * params: {
         *   symbol: 'frxXAUUSD',
         *   contract_type: 'CALL' | 'PUT',
         *   amount: 10,
         *   basis: 'stake',
         *   duration: 5,
         *   duration_unit: 'm',
         *   stop_loss: 15,
         *   take_profit: 10,
         *   currency: 'USD',
         * }
         */
        if (!this.authorized) {
            return Promise.reject(new Error('Not authorized'));
        }

        // First get a proposal
        const proposalParams = {
            proposal: 1,
            amount: params.amount || 10,
            basis: params.basis || 'stake',
            contract_type: params.contract_type,
            currency: params.currency || 'USD',
            symbol: params.symbol,
            duration: params.duration || 1,
            duration_unit: params.duration_unit || 'm',
        };

        if (params.stop_loss) proposalParams.stop_loss = params.stop_loss;
        if (params.take_profit) proposalParams.take_profit = params.take_profit;

        return this._send(proposalParams)
            .then(response => {
                if (response.error) {
                    throw new Error(response.error.message || 'Proposal failed');
                }
                if (response.proposal) {
                    // Buy the proposal
                    return this._send({
                        buy: response.proposal.id,
                        price: params.amount || 10,
                    });
                }
                throw new Error('No proposal returned');
            });
    }

    closePosition(contractId) {
        if (!this.authorized) {
            return Promise.reject(new Error('Not authorized'));
        }
        return this._send({ sell: contractId, price: 0 });
    }

    getBalance() {
        if (!this.authorized) {
            return Promise.reject(new Error('Not authorized'));
        }
        return this._send({ balance: 1 });
    }

    onConnectionChange(callback) {
        this.connectionCallbacks.push(callback);
    }

    _send(data) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket not connected'));
                return;
            }
            const reqId = Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            data.req_id = reqId;
            this.pendingRequests.set(reqId, { resolve, reject });

            // Set timeout for response
            setTimeout(() => {
                if (this.pendingRequests.has(reqId)) {
                    this.pendingRequests.delete(reqId);
                    reject(new Error('Request timeout'));
                }
            }, 15000);

            this.ws.send(JSON.stringify(data));
        });
    }

    _handleMessage(data) {
        // Handle ping/pong for latency
        if (data.msg_type === 'ping') {
            this.latency = Date.now() - this.lastPingTime;
            return;
        }

        // Handle request responses
        if (data.req_id && this.pendingRequests.has(data.req_id)) {
            const req = this.pendingRequests.get(data.req_id);
            this.pendingRequests.delete(data.req_id);
            if (data.error) {
                req.reject(new Error(data.error.message));
            } else {
                req.resolve(data);
            }
        }

        // Handle tick stream
        if (data.msg_type === 'tick' && data.tick) {
            const tick = data.tick;
            this.latency = Date.now() - this.lastPingTime;
            this.tickCallbacks.forEach(entry => {
                if (entry.symbol === tick.symbol || !entry.symbol) {
                    entry.callback({
                        symbol: tick.symbol,
                        bid: parseFloat(tick.bid),
                        ask: parseFloat(tick.ask),
                        price: parseFloat(tick.ask),
                        epoch: tick.epoch,
                        quote: parseFloat(tick.quote),
                    });
                }
            });
        }

        // Handle balance updates
        if (data.msg_type === 'balance' && data.balance) {
            this.balance = parseFloat(data.balance.balance);
            this.currency = data.balance.currency || this.currency;
            this._notifyConnection('balance', { balance: this.balance, currency: this.currency });
        }

        // Handle proposal response
        if (data.msg_type === 'proposal' && data.proposal) {
            // Auto-buy can be handled here
        }

        // Handle buy responses
        if (data.msg_type === 'buy') {
            if (data.buy) {
                this._notifyConnection('trade_opened', data.buy);
            }
        }

        // Handle sell responses (trade closed)
        if (data.msg_type === 'sell') {
            if (data.sell) {
                this._notifyConnection('trade_closed', data.sell);
                // Refresh balance
                this.getBalance().catch(() => {});
            }
        }

        // Handle transaction stream (profit/loss updates)
        if (data.msg_type === 'transaction' && data.transaction) {
            this._notifyConnection('transaction', data.transaction);
        }

        // Handle errors
        if (data.error) {
            console.warn('DerivAPI Error:', data.error.message);
        }
    }

    _notifyConnection(status, data) {
        this.connectionCallbacks.forEach(cb => {
            try { cb(status, data); } catch (e) {}
        });
    }
}

// ---- BROKER MANAGER ----
class BrokerManager {
    constructor() {
        this.derivApi = new DerivAPI();
        this.broker = 'simulator'; // simulator | deriv | exness
        this.connected = false;
        this.derivConnected = false;
        this.derivAuthorized = false;
        this.realtimePrices = {};
        this.onPriceUpdate = null;    // Callback for price updates
        this.onTradeUpdate = null;    // Callback for trade updates
        this.onStatusChange = null;   // Callback for status changes
    }

    // Get active symbol config based on current broker
    getSymbolConfig(symbol) {
        if (this.broker === 'exness') {
            return exnessConfig[symbol] || simulatorConfig[symbol];
        }
        if (this.broker === 'deriv' && this.derivConnected) {
            // Deriv uses same config as simulator but with real spreads
            return simulatorConfig[symbol];
        }
        return simulatorConfig[symbol];
    }

    // Connect to Deriv
    async connectDeriv(token, appId, accountType) {
        try {
            this._updateStatus('connecting', 'Connecting to Deriv...');
            const result = await this.derivApi.connect(token, appId, accountType);
            this.derivConnected = true;
            this.derivAuthorized = true;
            this.broker = 'deriv';
            this.connected = true;
            
            // Subscribe to balance updates
            try {
                await this.derivApi.getBalance();
                await this.derivApi.subscribeTransactions();
            } catch (e) {
                console.warn('Could not subscribe to balance/transactions:', e.message);
            }
            
            this._updateStatus('connected', 'Connected to Deriv');
            return result;
        } catch (error) {
            this.derivConnected = false;
            this.derivAuthorized = false;
            this._updateStatus('error', `Deriv error: ${error.message}`);
            throw error;
        }
    }

    // Disconnect from Deriv
    disconnectDeriv() {
        this.derivApi.unsubscribeTicks();
        this.derivApi.disconnect();
        this.derivConnected = false;
        this.derivAuthorized = false;
        if (this.broker === 'deriv') {
            this.broker = 'simulator';
            this.connected = false;
        }
        this._updateStatus('disconnected', 'Disconnected');
    }

    // Subscribe to real-time prices from Deriv
    async subscribeDerivTicks(symbol) {
        const derivSymbol = derivSymbolMap[symbol];
        if (!derivSymbol) {
            throw new Error(`Symbol ${symbol} not available on Deriv. Available: ${Object.keys(derivSymbolMap).join(', ')}`);
        }

        await this.derivApi.subscribeTicks(derivSymbol, (tick) => {
            // Map Deriv symbol back to our internal symbol
            let internalSymbol = symbol;
            for (const [key, val] of Object.entries(derivSymbolMap)) {
                if (val === tick.symbol) {
                    internalSymbol = key;
                    break;
                }
            }
            
            this.realtimePrices[internalSymbol] = {
                bid: tick.bid,
                ask: tick.ask,
                mid: (tick.bid + tick.ask) / 2,
                quote: tick.quote,
                timestamp: tick.epoch * 1000,
            };
            if (this.onPriceUpdate) {
                this.onPriceUpdate(internalSymbol, this.realtimePrices[internalSymbol]);
            }
        });
    }
    
    // Get account balance / info
    getBalance() {
        if (this.broker === 'deriv' && this.derivAuthorized) {
            return this.derivApi.getAccountInfo();
        }
        return { balance: 0, currency: 'USD', loginid: '' };
    }
    
    // Check if connected to real broker
    isConnected() {
        return this.broker === 'deriv' && this.derivConnected && this.derivAuthorized;
    }

    // Switch broker
    async switchBroker(broker, options = {}) {
        // Disconnect from current broker if Deriv
        if (this.derivConnected) {
            this.disconnectDeriv();
        }

        this.broker = broker;

        if (broker === 'deriv') {
            if (options.token) {
                try {
                    await this.connectDeriv(options.token, options.appId, options.accountType);
                } catch (e) {
                    // Will fall back to simulator
                }
            }
        } else if (broker === 'exness') {
            this.connected = false;
            this._updateStatus('simulated', 'Exness (Simulated)');
        } else {
            this.connected = false;
            this._updateStatus('simulated', 'Internal Simulator');
        }

        return this.broker;
    }

    // Place trade via broker
    async placeTrade(symbol, direction, amount, slPips, tpPips) {
        if (this.broker === 'deriv' && this.derivAuthorized) {
            const derivSymbol = derivSymbolMap[symbol];
            if (!derivSymbol) {
                throw new Error(`Symbol ${symbol} not available on Deriv`);
            }

            const config = simulatorConfig[symbol];
            const slAmount = slPips * config.pipValue * 10;
            const tpAmount = tpPips * config.pipValue * 10;

            return this.derivApi.placeTrade({
                symbol: derivSymbol,
                contract_type: direction === 'BUY' ? 'CALL' : 'PUT',
                amount: amount,
                basis: 'stake',
                duration: 1,
                duration_unit: 'm',
                stop_loss: slAmount.toFixed(2),
                take_profit: tpAmount.toFixed(2),
                currency: 'USD',
            });
        }

        // For simulator & exness, trades are handled by the engine
        return null;
    }

    // Close position via broker
    async closePosition(contractId) {
        if (this.broker === 'deriv' && this.derivAuthorized) {
            return this.derivApi.closePosition(contractId);
        }
        return null;
    }

    // Get latency
    getLatency() {
        if (this.broker === 'deriv' && this.derivConnected) {
            return this.derivApi.latency;
        }
        return null;
    }

    // Check if real-time data is available
    isRealtimeData() {
        return this.broker === 'deriv' && this.derivConnected;
    }

    // Get real-time price for symbol
    getRealtimePrice(symbol) {
        return this.realtimePrices[symbol] || null;
    }

    // Get account info (balance, currency, login ID)
    getAccountInfo() {
        return {
            balance: this.balance,
            currency: this.currency,
            loginid: this.loginid || '',
        };
    }

    // Subscribe to transaction stream for real-time balance updates
    subscribeTransactions() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error('Not connected'));
        }
        return this._send({ transaction: 1, subscribe: 1 })
            .catch(err => {
                console.warn('Transaction subscription failed (non-critical):', err.message);
            });
    }

    _updateStatus(status, message) {
        if (this.onStatusChange) {
            this.onStatusChange(status, message);
        }
    }
}

// Global broker manager instance
window.brokerManager = new BrokerManager();
