// Ce code source est soumis aux termes de la licence publique Mozilla 2.0 : https://mozilla.org/MPL/2.0/
// © VotreNom
// Dernière mise à jour : 20 Oct 2024
//@version=5
strategy("Stratégie Améliorée Hammers & Stars [v2.1]", shorttitle="SAHS[v2.1]", overlay=true)

// Fonction pour générer un ID unique
generateUniqueId() =>
    var int x = 1
    x := 16708 * nz(x[1], 1) % 2147483647
    str.tostring(x)

// Paramètres de la stratégie
var string g_strategy = "Paramètres de la stratégie"

atrMinFilterSize = input.float(title=">= Filtre ATR", defval=1.0, minval=0.0)
atrMaxFilterSize = input.float(title="<= Filtre ATR", defval=2.0, minval=0.0)
stopMultiplier = input.float(title="Stop Loss ATR", defval=0.8, group=g_strategy, tooltip="Multiplicateur de stop loss (x ATR)")
rr = input.float(title="R:R", defval=1.5, group=g_strategy)
fibLevel = input.float(title="Niveau Fib", step=0.001, defval=0.333, group=g_strategy, tooltip="Utilisé pour calculer le tiers supérieur/inférieur de la bougie.")

// Paramètres de filtre
var string g_filter = "Paramètres de filtre"
emaFilter = input.int(title="Filtre EMA", defval=0, group=g_filter, tooltip="Longueur de l'EMA pour filtrer les trades - mettre zéro pour désactiver")

i_startTime = input.time(title="Filtre Date de début", defval=timestamp("01 Jan 2000 00:00 +0000"), group=g_filter, tooltip="Date & heure de début des trades")
i_endTime = input.time(title="Filtre Date de fin", defval=timestamp("1 Jan 2099 00:00 +0000"), group=g_filter, tooltip="Date & heure de fin des trades")
tradeStartHour = input.int(title="Heure de début de trading", defval=0, minval=0, maxval=23, group=g_filter, tooltip="Heure de début pour le trading (0-23)")
tradeEndHour = input.int(title="Heure de fin de trading", defval=23, minval=0, maxval=23, group=g_filter, tooltip="Heure de fin pour le trading (0-23)")

// Paramètres du backtester
var string g_tester = "Paramètres du backtester"
startBalance = input.float(title="Solde initial", defval=10000.0, group=g_tester, tooltip="Votre solde initial pour le système de test intégré")
riskPerTrade = input.float(title="Risque par trade (%)", defval=1.0, group=g_tester, tooltip="Votre pourcentage de risque par trade")
drawTester = input.bool(title="Afficher le backtester", defval=true, group=g_tester, tooltip="Activer/désactiver l'affichage du backtester intégré")

// Indicateurs
atr = ta.atr(14)
ema = ta.ema(close, emaFilter == 0 ? 1 : emaFilter)
rsi = ta.rsi(close, 14)

// Calcul de l'ADX avec ta.dmi()
lenAdx = input.int(14, minval=1, title="Longueur ADX", group=g_filter)
lenAdxSmoothing = input.int(14, title="Lissage ADX", minval=1, maxval=50, group=g_filter)
[diplus, diminus, adx] = ta.dmi(lenAdx, lenAdxSmoothing)

[macdLine, signalLine, _] = ta.macd(close, 12, 26, 9)

// Filtre de date et d'heure
dateFilter = time >= i_startTime and time <= i_endTime
tradeDuringVolatileHours = (hour >= tradeStartHour and hour <= tradeEndHour)

// Fonctions personnalisées
toWhole(number) =>
    result = atr < 1.0 ? (number / syminfo.mintick) / (10 / syminfo.pointvalue) : number
    result := atr >= 1.0 and atr < 100.0 and syminfo.currency == "JPY" ? result * 100 : result
    result

truncate(_number, _decimalPlaces) =>
    _factor = math.pow(10, _decimalPlaces)
    math.floor(_number * _factor) / _factor

// Filtres EMA et ATR
emaFilterLong = emaFilter == 0 or close > ema
emaFilterShort = emaFilter == 0 or close < ema

atrMinFilter = math.abs(high - low) >= (atrMinFilterSize * atr) or atrMinFilterSize == 0.0
atrMaxFilter = math.abs(high - low) <= (atrMaxFilterSize * atr) or atrMaxFilterSize == 0.0
atrFilter = atrMinFilter and atrMaxFilter

// Calcul du niveau Fibonacci
bullFib = (low - high) * fibLevel + high
bearFib = (high - low) * fibLevel + low

// Détermination des configurations valides
lowestBody = math.min(close, open)
highestBody = math.max(close, open)

validHammer = lowestBody >= bullFib and atrFilter and close != open and not na(atr) and emaFilterLong
validStar = highestBody <= bearFib and atrFilter and close != open and not na(atr) and emaFilterShort


validLong = validHammer and strategy.position_size == 0 and barstate.isconfirmed and rsi < 80 and macdLine > signalLine and adx > 20 and tradeDuringVolatileHours
validShort = validStar and strategy.position_size == 0 and barstate.isconfirmed and rsi > 20 and macdLine < signalLine and adx > 20 and tradeDuringVolatileHours
// Calcul des stops et cibles
stopSize = atr * stopMultiplier
longStopPrice = low - stopSize
longStopDistance = close - longStopPrice
shortStopPrice = high + stopSize
shortStopDistance = shortStopPrice - close

// Take Profit dynamique
rrMultiplierLong = rsi < 30 ? rr * 1.5 : rr
rrMultiplierShort = rsi > 70 ? rr * 1.5 : rr

longTargetPrice = close + (longStopDistance * rrMultiplierLong)
shortTargetPrice = close - (shortStopDistance * rrMultiplierShort)

// Trailing Stop Loss
trailStopLong = strategy.position_size > 0 ? math.max(close - atr * stopMultiplier, strategy.position_avg_price) : na
trailStopShort = strategy.position_size < 0 ? math.min(close + atr * stopMultiplier, strategy.position_avg_price) : na
// Calculate the risk per trade in currency
riskPerTradeCurrency = (riskPerTrade / 100) * startBalance

// Calculate position size
longPositionSize = riskPerTradeCurrency / (close - longStopPrice)
shortPositionSize = riskPerTradeCurrency / (shortStopPrice - close)

// Entrées et sorties
if validLong
    strategy.entry(id="Long", direction=strategy.long)
    strategy.exit(id="Exit Long", from_entry="Long", stop=longStopPrice, limit=longTargetPrice, qty=longPositionSize, trail_points=stopMultiplier * atr / syminfo.mintick)

if validShort
    strategy.entry(id="Short", direction=strategy.short)
    strategy.exit(id="Exit Short", from_entry="Short", stop=shortStopPrice, limit=shortTargetPrice, qty=shortPositionSize, trail_points=stopMultiplier * atr / syminfo.mintick)

// Affichage des données de trade
plot(strategy.position_size != 0 or validLong ? longStopPrice : na, title="Prix Stop Long", color=color.red, style=plot.style_linebr)
plot(strategy.position_size != 0 or validLong ? longTargetPrice : na, title="Prix Cible Long", color=color.green, style=plot.style_linebr)
plot(strategy.position_size != 0 or validShort ? shortStopPrice : na, title="Prix Stop Short", color=color.red, style=plot.style_linebr)
plot(strategy.position_size != 0 or validShort ? shortTargetPrice : na, title="Prix Cible Short", color=color.green, style=plot.style_linebr)

// Affichage de l'EMA si activé
plot(emaFilter == 0 ? na : ema, color=emaFilterLong ? color.green : color.red, linewidth=2, title="EMA")
plot(longStopPrice, color=color.rgb(41, 4, 85))
plot(longTargetPrice, color=#b80b0b)
// Affichage des setups
plotshape(validLong ? 1 : na, style=shape.triangleup, location=location.belowbar, color=color.green, title="Setup Haussier")
plotshape(validShort ? 1 : na, style=shape.triangledown, location=location.abovebar, color=color.red, title="Setup Baissier")
