//@version=5
strategy("Stratégie Forex", overlay=true)


// Paramètres de l'indicateur RSI
rsi_length = input.int(14, minval=1, title="Période RSI")
rsi_overbought = input.int(70, minval=50, maxval=100, title="RSI Suracheté")
rsi_oversold = input.int(30, minval=0, maxval=50, title="RSI Survendu")

// Paramètres des Bandes de Bollinger
bb_length = input.int(20, minval=1, title="Période Bandes de Bollinger")
bb_std = input.float(2.0, minval=0.1, title="Déviation Standard")

// Paramètres du Stop Loss et Take Profit en pips
stopLossPips = input.float(title="Stop Loss (pips)", defval=20)
takeProfitPips = input.float(title="Take Profit (pips)", defval=40)

// Filtre de tendance avec Moyenne Mobile
useMAFilter = input.bool(true, title="Utiliser le filtre de tendance MA")
ma_length = input.int(50, minval=1, title="Période de la Moyenne Mobile")

// Paramètres du filtre horaire
tradeSession = input.session("0900-1700", title="Heures de Trading", tooltip="Définissez les heures pendant lesquelles la stratégie est autorisée à trader.")

// Calculs des indicateurs
rsi = ta.rsi(close, rsi_length)

basis = ta.sma(close, bb_length)
dev = bb_std * ta.stdev(close, bb_length)
upper = basis + dev
lower = basis - dev

ma = ta.sma(close, ma_length)

// Tracer les indicateurs pour visualisation
plot(basis, color=color.blue, title="BB Middle")
p1 = plot(upper, color=color.orange, title="BB Upper")
p2 = plot(lower, color=color.orange, title="BB Lower")
fill(p1, p2, color=color.orange, transp=90)
plot(ma, color=color.red, title="Moyenne Mobile")

// Détermination de la session de trading
isInTradeSession = time(timeframe.period, tradeSession)

// Conditions d'achat et de vente
longCondition = (close < lower) and (rsi < rsi_oversold)
shortCondition = (close > upper) and (rsi > rsi_overbought)

if useMAFilter
    longCondition := longCondition and (close > ma)
    shortCondition := shortCondition and (close < ma)

// Ajouter le filtre horaire aux conditions
longCondition := longCondition and isInTradeSession
shortCondition := shortCondition and isInTradeSession

// Ajout de marqueurs pour visualiser les conditions
plotshape(longCondition, title="Signal Long", location=location.belowbar, color=color.green, style=shape.arrowup, size=size.small)
plotshape(shortCondition, title="Signal Short", location=location.abovebar, color=color.red, style=shape.arrowdown, size=size.small)

// Conversion des pips en prix
pipValue = syminfo.mintick  // For Forex pairs, this is typically 0.0001 or 0.01
stopLossPrice = stopLossPips * pipValue
takeProfitPrice = takeProfitPips * pipValue

// Exécution des ordres avec Stop Loss et Take Profit
if (longCondition)
    strategy.entry("Long", strategy.long)
    strategy.exit("Partial Exit Long", from_entry="Long", qty_percent=50, limit=strategy.position_avg_price + takeProfitPrice / 2)
    strategy.exit("Full Exit Long", from_entry="Long", stop=strategy.position_avg_price - stopLossPrice, limit=strategy.position_avg_price + takeProfitPrice)

if (shortCondition)
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", stop=strategy.position_avg_price + stopLossPrice, limit=strategy.position_avg_price - takeProfitPrice)
