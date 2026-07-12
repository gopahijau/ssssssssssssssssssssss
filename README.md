# H4 Zone Retest EA (MQL5)

An automated trading Expert Advisor (EA) for MetaTrader 5, developed in MQL5.  
The EA trades gold (XAUUSD) using a multi-timeframe breakout and retest strategy: it defines the first H4 candle of each day as a trading zone, detects breakouts on the M5 chart, waits for a retest, and executes trades with risk management, trailing stops, and optional news filtering.

---

## Features

- H4 → M5 breakout and retest trading logic  
- Configurable fixed lot or risk-based position sizing  
- Trailing stop management  
- **Smart news filter** that avoids trading around high-impact events  
- Spread and terminal safety checks  
- Dynamic lot calculation based on risk percentage  

## Strategy Overview

1. **Zone identification (H4)**  
   The EA marks the first H4 candle of the current day and stores its high and low as the trading zone boundaries.

2. **Breakout detection (M5)**  
   On each new M5 candle:  
   - A bullish breakout occurs when the candle closes above `zoneHigh`.  
   - A bearish breakout occurs when the candle closes below `zoneLow`.  
   When a breakout occurs, the EA starts waiting for a retest.

3. **Retest entry**  
   - If price returns to the broken zone within a specified window (`MaxWaitSeconds`):  
     - **Buy** on bullish retest → SL = breakout candle low, TP = 1.5 × risk distance.  
     - **Sell** on bearish retest → SL = breakout candle high, TP = 1.5 × risk distance.  
   - Uses either a fixed lot (`Lots`) or a risk-based lot (`UseRiskPercent`, `RiskPercent`).

4. **Trade management and protection**  
   - Trailing stop control (`UseTrailingStop`, `TrailingStart`, `TrailingStep`).  
   - Spread and trade-permission checks (`MaxSpreadPoints`, `TERMINAL_TRADE_ALLOWED`).  
   - **Built-in news filter**: the EA checks the MetaTrader 5 economic calendar (`CalendarValueHistory`) and automatically avoids opening new trades within the defined window around **high-impact news events** for a selected currency (`NewsFilterCurrency`, `NewsFilterMinutes`).  
   - This filter helps prevent entries during volatile periods and improves stability during major market announcements.


## Input Parameters

| Parameter | Description | Default |
|------------|-------------|----------|
| `Lots` | Fixed lot size per trade | 0.01 |
| `UseRiskPercent` | Enable dynamic lot sizing by risk | false |
| `RiskPercent` | Percent of balance risked per trade | 1.0 |
| `MaxWaitSeconds` | Maximum time allowed for retest | 86400 |
| `UseTrailingStop` | Enable trailing stop | true |
| `TrailingStart` | Profit (points) before trailing begins | 200 |
| `TrailingStep` | Distance (points) of trailing stop | 100 |
| `UseNewsFilter` | Enable high-impact news filter | true |
| `NewsFilterMinutes` | Minutes before/after news to avoid trading | 30 |
| `MagicNumber` | Unique identifier for EA positions | 202503 |

---

## Requirements

- MetaTrader 5 platform  
- Broker supporting XAUUSD (gold) trading  
- MQL5 environment (MetaEditor)  
- Historical data for backtesting  

---

## Installation

1. Open **MetaEditor** → *File → Open Data Folder*  
2. Copy the `.mq5` file into `MQL5/Experts/`  
3. Compile the EA  
4. In MetaTrader 5, open *Navigator → Expert Advisors*  
5. Attach the EA to a **XAUUSD** chart  
6. Adjust input parameters as needed  

---
## Backtest
**Symbol:** XAUUSD  
**Timeframe:** M5  
**Period:** Jan 2022 – Oct 2025  
**Model:** Every tick (MetaTrader 5 Strategy Tester)

<img width="987" height="384" alt="image" src="https://github.com/user-attachments/assets/f3ed384a-65d7-4a4b-b851-921dcd3191f6" />
<img width="967" height="372" alt="image" src="https://github.com/user-attachments/assets/d69a254e-9c1a-4636-b7c1-6c1996cba90e" />
<img width="1023" height="547" alt="image" src="https://github.com/user-attachments/assets/eb485143-f264-4e0f-8300-f045a4ad12e3" />



This backtest covers almost three years of market data, including different volatility phases in gold.  
The EA demonstrates consistent trade execution, controlled drawdown, and stable risk-adjusted returns under the default settings.



### Notes
- Default parameters were used unless otherwise stated.  
- The test includes realistic spreads and commissions.  
- Results are for research and educational purposes only and do not guarantee future performance.



