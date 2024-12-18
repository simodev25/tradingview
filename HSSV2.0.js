// Ce code source est soumis aux termes de la licence publique Mozilla 2.0 : https://mozilla.org/MPL/2.0/
// © ZenAndTheArtOfTrading / PineScriptMastery
// Dernière mise à jour : [votre date actuelle]
//@version=5
strategy("Hammers & Stars Strategy [v2.0]", shorttitle="HSS[v2.0]", overlay=true)

// Fonction pour générer un ID unique
generateUniqueId() =>
    var int x = 1
    x := 16708 * nz(x[1], 1) % 2147483647
    str.tostring(x)

// Paramètres de la stratégie
var string g_strategy = "Paramètres de la stratégie"
atrMinFilterSize = input.float(title=">= Filtre ATR", defval=0.0, minval=0.0, group=g_strategy, tooltip="Taille minimale de la bougie d'entrée comparée à l'ATR")
atrMaxFilterSize = input.float(title="<= Filtre ATR", defval=3.0, minval=0.0, group=g_strategy, tooltip="Taille maximale de la bougie d'entrée comparée à l'ATR")
stopMultiplier = input.float(title="Stop Loss ATR", defval=1.0, group=g_strategy, tooltip="Multiplicateur de stop loss (x ATR)")
rr = input.float(title="R:R", defval=1.0, group=g_strategy, tooltip="Profil Risque:Récompense")
fibLevel = input.float(title="Niveau Fib", step=0.001, defval=0.333, group=g_strategy, tooltip="Utilisé pour calculer le tiers supérieur/inférieur de la bougie.")

// Paramètres de filtre
var string g_filter = "Paramètres de filtre"
emaFilter = input.int(title="Filtre EMA", defval=0, group=g_filter, tooltip="Longueur de l'EMA pour filtrer les trades - mettre zéro pour désactiver")
i_startTime = input.time(title="Filtre Date de début", defval=timestamp("01 Jan 2000 13:30 +0000"), group=g_filter, tooltip="Date & heure de début des trades")
i_endTime = input.time(title="Filtre Date de fin", defval=timestamp("1 Jan 2099 19:30 +0000"), group=g_filter, tooltip="Date & heure de fin des trades")

// Paramètres du backtester
var string g_tester = "Paramètres du backtester"
startBalance = input.float(title="Solde initial", defval=10000.0, group=g_tester, tooltip="Votre solde initial pour le système de test intégré")
riskPerTrade = input.float(title="Risque par trade", defval=1.0, group=g_tester, tooltip="Votre pourcentage de risque par trade")
drawTester = input.bool(title="Afficher le backtester", defval=true, group=g_tester, tooltip="Activer/désactiver l'affichage du backtester intégré")

// Paramètres AutoView
var string g_av = "Paramètres AutoView "
av_use = input.bool(title="Utiliser AutoView ?", defval=false, group=g_av, tooltip="Si activé, les alertes générées utiliseront la syntaxe AutoView pour le trading automatique")
av_oandaDemo = input.bool(title="Utiliser Oanda Demo ?", defval=false, group=g_av, tooltip="Si activé, le préfixe du broker oandapractice sera utilisé pour les alertes AutoView (compte démo)")
av_limitOrder = input.bool(title="Utiliser Ordre Limite ?", defval=true, group=g_av, tooltip="Si activé, AutoView utilisera des ordres limités")
av_gtdOrder = input.int(title="Jours pour laisser l'ordre limité", minval=0, defval=2, group=g_av, tooltip="Paramètre GTD (valable jusqu'au jour)")
av_accountBalance = input.float(title="Solde du compte", defval=1000.0, step=100, group=g_av, tooltip="Votre solde de compte (utilisé pour calculer la taille de position)")
av_accountCurrency = input.string(title="Devise du compte", defval="USD", options=["AUD", "CAD", "CHF", "EUR", "GBP", "JPY", "NZD", "USD"], group=g_av, tooltip="Devise de votre compte (utilisée pour le calcul de la taille de position)")
av_riskPerTrade = input.float(title="Risque par trade %", defval=2.0, step=0.5, group=g_av, tooltip="Votre risque par trade en % du solde du compte")

// Paramètres PineConnector
var string g_pc = "Paramètres PineConnector"
pc_use = input.bool(title="Utiliser PineConnector ?", defval=false, group=g_pc, tooltip="Utiliser les alertes PineConnector ?")
pc_id = input.string(title="ID Licence", defval="ID", group=g_pc, tooltip="Votre ID de licence PineConnector")
pc_spread = input.float(title="Spread", defval=0.5, group=g_pc, tooltip="Entrez votre spread moyen pour cette paire")
pc_risk = input.float(title="Risque par trade", defval=1, step=0.5, group=g_pc, tooltip="Montant à risquer par trade (% du solde ou lots)")
pc_prefix = input.string(title="Préfixe MetaTrader", defval="", group=g_pc, tooltip="Préfixe du symbole MetaTrader de votre broker (laisser vide si aucun)")
pc_suffix = input.string(title="Suffixe MetaTrader", defval="", group=g_pc, tooltip="Suffixe du symbole MetaTrader de votre broker (laisser vide si aucun)")
pc_limit = input.bool(title="Utiliser Ordre Limite ?", defval=true, group=g_pc, tooltip="Si vrai, un ordre limite sera utilisé, sinon un ordre au marché")

var string broker = av_oandaDemo ? "xbtpractice" : "xbt"
var string symbol = pc_prefix + syminfo.ticker + pc_suffix
var string limit = pc_limit ? "limit" : ""
var float spread = syminfo.mintick * 10 * pc_spread

pc_entry_alert(direction, sl, tp) =>
    limit_price = direction == "buy" ? close - spread : close + spread
    price = pc_limit ? "price=" + str.tostring(limit_price) + "," : ""
    pc_id + "," + direction + limit + "," + symbol + "," + price + "sl=" + str.tostring(sl) + ",tp=" + str.tostring(tp) + ",risk=" + str.tostring(pc_risk)

// Filtre de date
dateFilter = time >= i_startTime and time <= i_endTime

// Indicateurs
atr = ta.atr(14)
ema = ta.ema(close, emaFilter == 0 ? 1 : emaFilter)

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

validLong = validHammer and strategy.position_size == 0 and dateFilter and barstate.isconfirmed
validShort = validStar and strategy.position_size == 0 and dateFilter and barstate.isconfirmed

// Calcul de la taille de position
var float tradePositionSize = 0.0
var string pair = syminfo.basecurrency + "/" + syminfo.currency

accountSameAsCounterCurrency = av_accountCurrency == syminfo.currency
accountSameAsBaseCurrency = av_accountCurrency == syminfo.basecurrency
accountNeitherCurrency = not accountSameAsCounterCurrency and not accountSameAsBaseCurrency

conversionCurrencyPair = accountSameAsCounterCurrency ? syminfo.tickerid : av_accountCurrency + syminfo.currency
conversionCurrencyRate = request.security(symbol=syminfo.type == "forex" ? conversionCurrencyPair : "AUDUSD", timeframe="D", expression=close)

getPositionSize(stopLossSizePoints) =>
    riskAmount = (av_accountBalance * (av_riskPerTrade / 100)) * (accountSameAsBaseCurrency or accountNeitherCurrency ? conversionCurrencyRate : 1.0)
    riskPerPoint = (stopLossSizePoints * syminfo.pointvalue)
    positionSize = (riskAmount / riskPerPoint) / syminfo.mintick
    math.round(positionSize)

// Configuration de l'ordre GTD
gtdTime = time + (av_gtdOrder * 1440 * 60 * 1000)
gtdYear = year(gtdTime)
gtdMonth = month(gtdTime)
gtdDay = dayofmonth(gtdTime)
gtdString = " dt=" + str.tostring(gtdYear) + "-" + str.tostring(gtdMonth) + "-" + str.tostring(gtdDay)

// Calcul des stops et cibles
stopSize = atr * stopMultiplier
longStopPrice = low < low[1] ? low - stopSize : low[1] - stopSize
longStopDistance = close - longStopPrice
longTargetPrice = close + (longStopDistance * rr)
shortStopPrice = high > high[1] ? high + stopSize : high[1] + stopSize
shortStopDistance = shortStopPrice - close
shortTargetPrice = close - (shortStopDistance * rr)

// Variables pour le trade
var float t_entry = 0.0
var float t_stop = 0.0
var float t_target = 0.0
var int t_direction = 0

// Détection des setups longs
var string longId = ""
if validLong
    t_entry := close
    t_stop := longStopPrice
    t_target := longTargetPrice
    t_direction := 1
    tradePositionSize := getPositionSize(toWhole(longStopDistance) * 10)
    longId := generateUniqueId()
    strategy.entry(id="Long", direction=strategy.long, when=validLong, comment="(ID:"+longId+"-SL:" + str.tostring(truncate(t_stop,4)) + "-TP:"+str.tostring(truncate(t_target,4)) + ")")
    if pc_use
        alertString = pc_entry_alert("buy", t_stop, t_target)
        alert(alertString, freq=alert.freq_once_per_bar_close)
    if av_use
        alert(message="e=" + broker + " b=long q=" + str.tostring(tradePositionSize) + " s=" + pair + " t=" + (av_limitOrder ? "limit fp=" + str.tostring(close) : "market") + " fsl=" + str.tostring(t_stop) + " ftp=" + str.tostring(t_target) + (av_gtdOrder != 0 and av_limitOrder ? gtdString : ""), freq=alert.freq_once_per_bar_close)

// Détection des setups shorts
var string shortId = ""
if validShort
    t_entry := close
    t_stop := shortStopPrice
    t_target := shortTargetPrice
    t_direction := -1
    tradePositionSize := getPositionSize(toWhole(shortStopDistance) * 10)
    shortId := generateUniqueId()
    strategy.entry(id="Short", direction=strategy.short, when=validShort, comment="(ID:"+shortId+"-SL:" + str.tostring(truncate(t_stop,4)) + "-TP:"+str.tostring(truncate(t_target,4)) + ")")
    if pc_use
        alertString = pc_entry_alert("sell", t_stop, t_target)
        alert(alertString, freq=alert.freq_once_per_bar_close)
    if av_use
        alert(message="e=" + broker + " b=short q=" + str.tostring(tradePositionSize) + " s=" + pair + " t=" + (av_limitOrder ? "limit fp=" + str.tostring(close) : "market") + " fsl=" + str.tostring(t_stop) + " ftp=" + str.tostring(t_target) + (av_gtdOrder != 0 and av_limitOrder ? gtdString : ""), freq=alert.freq_once_per_bar_close)

// Gestion des sorties
if t_direction == 1 and (low <= t_stop or high >= t_target)
    t_direction := 0
    if pc_limit and pc_use
        alert(pc_id + ",cancellong," + symbol)

if t_direction == -1 and (high >= t_stop or low <= t_target)
    t_direction := 0
    if pc_limit and pc_use
        alert(pc_id + ",cancelshort," + symbol)

strategy.exit(id="long_exit", from_entry="Long", limit=t_target, stop=t_stop, when=strategy.position_size > 0, comment="ID:"+ str.tostring(longId))
strategy.exit(id="short_exit", from_entry="Short", limit=t_target, stop=t_stop, when=strategy.position_size < 0, comment="ID:"+ str.tostring(shortId))

// Affichage des données de trade
plot(strategy.position_size != 0 or validLong or validShort ? t_stop : na, title="Prix Stop du Trade", color=color.red, style=plot.style_linebr)
plot(strategy.position_size != 0 or validLong or validShort ? t_target : na, title="Prix Cible du Trade", color=color.green, style=plot.style_linebr)

// Affichage de l'EMA si activé
plot(emaFilter == 0 ? na : ema, color=emaFilterLong ? color.green : color.red, linewidth=2, title="EMA")

// Affichage des setups
plotshape(validLong ? 1 : na, style=shape.triangleup, location=location.belowbar, color=color.green, title="Setup Haussier")
plotshape(validShort ? 1 : na, style=shape.triangledown, location=location.abovebar, color=color.red, title="Setup Baissier")

// --- CODE DU BACKTESTER --- //
var float balance = startBalance
var float drawdown = 0.0
var float maxDrawdown = 0.0
var float maxBalance = startBalance
var float totalPips = 0.0
var int totalWins = 0
var int totalLoss = 0

if strategy.wintrades != strategy.wintrades[1]
    balance += ((riskPerTrade / 100) * balance) * rr
    totalPips += math.abs(t_entry - t_target)
    totalWins += 1
    if balance > maxBalance
        maxBalance := balance

if strategy.losstrades != strategy.losstrades[1]
    balance -= ((riskPerTrade / 100) * balance)
    totalPips -= math.abs(t_entry - t_stop)
    totalLoss += 1
    drawdown := (balance / maxBalance) - 1
    if drawdown < maxDrawdown
        maxDrawdown := drawdown

var table testTable = table.new(position.top_right, 5, 2, border_width=1)
f_fillCell(_table, _column, _row, _title, _value, _bgcolor, _txtcolor) =>
    _cellText = _title + "\n" + _value
    table.cell(_table, _column, _row, _cellText, bgcolor=_bgcolor, text_color=_txtcolor)

var color bgcolor = color.new(color.black, 0)
if drawTester
    if barstate.islastconfirmedhistory
        dollarReturn = balance - startBalance
        f_fillCell(testTable, 0, 0, "Trades Totaux:", str.tostring(strategy.closedtrades), bgcolor, color.white)
        winRate = strategy.closedtrades > 0 ? truncate((strategy.wintrades / strategy.closedtrades) * 100, 2) : 0.0
        f_fillCell(testTable, 0, 1, "Taux de Gain:", str.tostring(winRate) + "%", bgcolor, color.white)
        f_fillCell(testTable, 1, 0, "Départ:", "$" + str.tostring(startBalance), bgcolor, color.white)
        f_fillCell(testTable, 1, 1, "Fin:", "$" + str.tostring(truncate(balance, 2)), bgcolor, color.white)
        f_fillCell(testTable, 2, 0, "Retour:", "$" + str.tostring(truncate(dollarReturn, 2)), dollarReturn > 0 ? color.green : color.red, color.white)
        f_fillCell(testTable, 2, 1, "Pips:", (totalPips > 0 ? "+" : "") + str.tostring(truncate(toWhole(totalPips), 2)), bgcolor, color.white)
        percentReturn = truncate((dollarReturn / startBalance) * 100, 2)
        f_fillCell(testTable, 3, 0, "Retour:", (dollarReturn > 0 ? "+" : "") + str.tostring(percentReturn) + "%", dollarReturn > 0 ? color.green : color.red, color.white)
        f_fillCell(testTable, 3, 1, "Max DD:", str.tostring(truncate(maxDrawdown * 100, 2)) + "%", color.red, color.white)
// --- FIN DU CODE DU BACKTESTER --- //