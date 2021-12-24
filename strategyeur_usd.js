//@version=5
strategy("Stratégie EMA avec Gestion du Risque", overlay=true, initial_capital=100000, default_qty_type=strategy.percent_of_equity, default_qty_value=100)

// Inputs de l'utilisateur
fastLength = input.int(title="Longueur EMA courte", defval=9, minval=1)
slowLength = input.int(title="Longueur EMA longue", defval=21, minval=1)
stopLossPerc = input.float(title="Stop Loss (%)", defval=1.0, minval=0.1, step=0.1)
riskRewardRatio = input.float(title="Ratio Risque/Rendement", defval=2.0, minval=0.1, step=0.1)
capitalRiskPerc = input.float(title="Pourcentage de capital risqué par trade (%)", defval=1.0, minval=0.1, step=0.1)

// Calcul des EMA
fastEMA = ta.ema(close, fastLength)
slowEMA = ta.ema(close, slowLength)

// Affichage des EMA sur le graphique
plot(fastEMA, color=color.blue, title="EMA courte")
plot(slowEMA, color=color.red, title="EMA longue")

// Conditions d'achat et de vente
bullishCross = ta.crossover(fastEMA, slowEMA)
bearishCross = ta.crossunder(fastEMA, slowEMA)

// Gestion de la position
var float entryPrice = na
var float stopLossPrice = na
var float takeProfitPrice = na

if bullishCross
    // Calculs pour la position longue
    entryPrice := close
    stopLossPrice := entryPrice * (1 - stopLossPerc / 100)
    takeProfitPrice := entryPrice + (entryPrice - stopLossPrice) * riskRewardRatio
    stopLossAmt = entryPrice - stopLossPrice
    capitalRisked = (capitalRiskPerc / 100) * strategy.equity
    positionSize = capitalRisked / stopLossAmt
    // Entrée en position longue
    strategy.entry("Long", strategy.long, qty=positionSize)
    // Sortie de la position avec stop-loss et take-profit
    strategy.exit("Exit Long", "Long", stop=stopLossPrice, limit=takeProfitPrice)

if bearishCross
    // Calculs pour la position courte
    entryPrice := close
    stopLossPrice := entryPrice * (1 + stopLossPerc / 100)
    takeProfitPrice := entryPrice - (stopLossPrice - entryPrice) * riskRewardRatio
    stopLossAmt = stopLossPrice - entryPrice
    capitalRisked = (capitalRiskPerc / 100) * strategy.equity
    positionSize = capitalRisked / stopLossAmt
    // Entrée en position courte
    strategy.entry("Short", strategy.short, qty=positionSize)
    // Sortie de la position avec stop-loss et take-profit
    strategy.exit("Exit Short", "Short", stop=stopLossPrice, limit=takeProfitPrice)

// Calcul du profit net en pourcentage
netProfitPerc = (strategy.netprofit / strategy.initial_capital) * 100

// Vérification que le profit net dépasse +20%
if barstate.islast
    if netProfitPerc < 20
        label.new(bar_index, high, "Profit net inférieur à +20% : " + str.tostring(netProfitPerc, format.percent), color=color.red)