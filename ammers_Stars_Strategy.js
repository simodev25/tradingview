//@version=5
// This source code is subject to the terms of the Mozilla Public License 2.0 at https://mozilla.org/MPL/2.0/
// © ZenAndTheArtOfTrading / PineScriptMastery
// Last Updated: 5th October, 2021
strategy('Hammers & Stars Strategy [v1.1]', shorttitle='HSS[v1.1]', overlay=true)

// Strategy Settings
var g_strategy = 'Strategy Settings'
atrMinFilterSize = input.float(title='>= ATR Filter', defval=0.0, minval=0.0, group=g_strategy, tooltip='Minimum size of entry candle compared to ATR')
atrMaxFilterSize = input.float(title='<= ATR Filter', defval=3.0, minval=0.0, group=g_strategy, tooltip='Maximum size of entry candle compared to ATR')
stopMultiplier = input.float(title='Stop Loss ATR', defval=1.0, group=g_strategy, tooltip='Stop loss multiplier (x ATR)')
rr = input.float(title='R:R', defval=1.0, group=g_strategy, tooltip='Risk:Reward profile')
fibLevel = input.float(title='Fib Level', defval=0.333, group=g_strategy, tooltip='Used to calculate upper/lower third of candle. (For example, setting it to 0.5 will mean hammers must close >= 50% mark of the total candle size)')
// Filter Settings
var g_filter = 'Filter Settings'
emaFilter = input.int(title='EMA Filter', defval=0, group=g_filter, tooltip='EMA length to filter trades - set to zero to disable')
i_startTime = input.time(title='Start Date Filter', defval=timestamp('01 Jan 2000 13:30 +0000'), group=g_filter, tooltip='Date & time to begin trading from')
i_endTime = input.time(title='End Date Filter', defval=timestamp('1 Jan 2099 19:30 +0000'), group=g_filter, tooltip='Date & time to stop trading')
// Backtester Settings
var g_tester = 'Backtester Settings'
startBalance = input.float(title='Starting Balance', defval=10000.0, group=g_tester, tooltip='Your starting balance for the custom inbuilt tester system')
riskPerTrade = input.float(title='Risk Per Trade', defval=1.0, group=g_tester, tooltip='Your desired % risk per trade (as a whole number)')
drawTester = input.bool(title='Draw Backtester', defval=true, group=g_tester, tooltip='Turn on/off inbuilt backtester display')
// AutoView Settings
var g_av = 'AutoView Settings [OANDA]'
av_use = input.bool(title='Use AutoView?', defval=false, group=g_av, tooltip='If turned on then the alerts this script generates will use AutoView syntax for auto-trading (WARNING: USE AT OWN RISK! RESEARCH THE DANGERS)')
av_oandaDemo = input.bool(title='Use Oanda Demo?', defval=false, group=g_av, tooltip='If turned on then oandapractice broker prefix will be used for AutoView alerts (demo account). If turned off then live account will be used')
av_limitOrder = input.bool(title='Use Limit Order?', defval=true, group=g_av, tooltip='If turned on then AutoView will use limit orders. If turned off then market orders will be used')
av_gtdOrder = input.int(title='Days To Leave Limit Order', minval=0, defval=2, group=g_av, tooltip='This is your GTD setting (good til day)')
av_accountBalance = input.float(title='Account Balance', defval=1000.0, step=100, group=g_av, tooltip='Your account balance (used for calculating position size)')
av_accountCurrency = input.string(title='Account Currency', defval='USD', options=['AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'JPY', 'NZD', 'USD'], group=g_av, tooltip='Your account balance currency (used for calculating position size)')
av_riskPerTrade = input.float(title='Risk Per Trade %', defval=2.0, step=0.5, group=g_av, tooltip='Your risk per trade as a % of your account balance')
// PineConnector Settings
var g_pc = 'PineConnector Settings'
pc_use = input.bool(title='Use PineConnector?', defval=false, group=g_pc, tooltip='Use PineConnector Alerts? (WARNING: USE AT OWN RISK! RESEARCH THE DANGERS)')
pc_id = input.string(title='License ID', defval='ID', group=g_pc, tooltip='This is your PineConnector license ID')
pc_spread = input.float(title='Spread', defval=0.5, group=g_pc, tooltip='Enter your average spread for this pair (used for offsetting entry limit order from closing price)')
pc_risk = input.float(title='Risk Per Trade', defval=1, step=0.5, group=g_pc, tooltip='This is how much to risk per trade (% of balance or lots - based on PC settings)')
pc_prefix = input.string(title='MetaTrader Prefix', defval='', group=g_pc, tooltip='This is your broker\'s MetaTrader symbol prefix (leave blank if there is none)')
pc_suffix = input.string(title='MetaTrader Suffix', defval='', group=g_pc, tooltip='This is your broker\'s MetaTrader symbol suffix (leave blank if there is none)')
pc_limit = input.bool(title='Use Limit Order?', defval=true, group=g_pc, tooltip='If true a limit order will be used, if false a market order will be used')

// Generate PineConnector alert string & prepare OANDA broker string
var broker = av_oandaDemo ? 'oandapractice' : 'oanda'
var symbol = pc_prefix + syminfo.ticker + pc_suffix
var limit = pc_limit ? 'limit' : ''
var spread = syminfo.mintick * 10 * pc_spread
pc_entry_alert(direction, sl, tp) =>
    limit_price = direction == 'buy' ? close - spread : close + spread
    price = pc_limit ? 'price=' + str.tostring(limit_price) + ',' : ''
    pc_id + ',' + direction + limit + ',' + symbol + ',' + price + 'sl=' + str.tostring(sl) + ',tp=' + str.tostring(tp) + ',risk=' + str.tostring(pc_risk)

// See if this bar's time happened within date filter
dateFilter = time >= i_startTime and time <= i_endTime

// Get indicator values
atr = ta.atr(14)
ema = ta.ema(close, emaFilter == 0 ? 1 : emaFilter)

// Custom function to convert pips into whole numbers
toWhole(number) =>
    return_1 = atr < 1.0 ? number / syminfo.mintick / (10 / syminfo.pointvalue) : number
    return_1 := atr >= 1.0 and atr < 100.0 and syminfo.currency == 'JPY' ? return_1 * 100 : return_1
    return_1

// Custom function to convert whole numbers back into pips
toPips(number) =>
    return_2 = atr >= 1.0 ? number : number * syminfo.mintick * (10 / syminfo.pointvalue)
    return_2 := atr >= 1.0 and atr < 100.0 and syminfo.currency == 'JPY' ? return_2 / 100 : return_2
    return_2

// Custom function to truncate (cut) excess decimal places
truncate(_number, _decimalPlaces) =>
    _factor = math.pow(10, _decimalPlaces)
    int(_number * _factor) / _factor

// Check EMA Filter
emaFilterLong = emaFilter == 0 or close > ema
emaFilterShort = emaFilter == 0 or close < ema

// Check ATR filter
atrMinFilter = math.abs(high - low) >= atrMinFilterSize * atr or atrMinFilterSize == 0.0
atrMaxFilter = math.abs(high - low) <= atrMaxFilterSize * atr or atrMaxFilterSize == 0.0
atrFilter = atrMinFilter and atrMaxFilter

// Calculate 33.3% fibonacci level for current candle
bullFib = (low - high) * fibLevel + high
bearFib = (high - low) * fibLevel + low

// Determine which price source closes or opens highest/lowest
lowestBody = close < open ? close : open
highestBody = close > open ? close : open

// Determine if we have a valid setup
validHammer = lowestBody >= bullFib and atrFilter and close != open and not na(atr) and emaFilterLong
validStar = highestBody <= bearFib and atrFilter and close != open and not na(atr) and emaFilterShort

// Check if we have confirmation for our setup
validLong = validHammer and strategy.position_size == 0 and dateFilter and barstate.isconfirmed
validShort = validStar and strategy.position_size == 0 and dateFilter and barstate.isconfirmed

//------------- DETERMINE POSITION SIZE -------------//
// Get account inputs
var tradePositionSize = 0.0
var pair = syminfo.basecurrency + '/' + syminfo.currency

// Check if our account currency is the same as the base or quote currency (for risk $ conversion purposes)
accountSameAsCounterCurrency = av_accountCurrency == syminfo.currency
accountSameAsBaseCurrency = av_accountCurrency == syminfo.basecurrency

// Check if our account currency is neither the base or quote currency (for risk $ conversion purposes)
accountNeitherCurrency = not accountSameAsCounterCurrency and not accountSameAsBaseCurrency

// Get currency conversion rates if applicable
conversionCurrencyPair = accountSameAsCounterCurrency ? syminfo.tickerid : accountNeitherCurrency ? av_accountCurrency + syminfo.currency : av_accountCurrency + syminfo.currency
conversionCurrencyRate = request.security(symbol=syminfo.type == 'forex' ? conversionCurrencyPair : 'AUDUSD', timeframe='D', expression=close)

// Calculate position size
getPositionSize(stopLossSizePoints) =>
    riskAmount = av_accountBalance * (av_riskPerTrade / 100) * (accountSameAsBaseCurrency or accountNeitherCurrency ? conversionCurrencyRate : 1.0)
    riskPerPoint = stopLossSizePoints * syminfo.pointvalue
    positionSize = riskAmount / riskPerPoint / syminfo.mintick
    math.round(positionSize)

// Set up our GTD (good-til-day) order info
gtdTime = time + av_gtdOrder * 1440 * 60 * 1000  // 86,400,000ms per day
gtdYear = year(gtdTime)
gtdMonth = month(gtdTime)
gtdDay = dayofmonth(gtdTime)
gtdString = ' dt=' + str.tostring(gtdYear) + '-' + str.tostring(gtdMonth) + '-' + str.tostring(gtdDay)
//------------- END POSITION SIZE CODE -------------//

// Calculate our stop distance & size for the current bar
stopSize = atr * stopMultiplier
longStopPrice = low < low[1] ? low - stopSize : low[1] - stopSize
longStopDistance = close - longStopPrice
longTargetPrice = close + longStopDistance * rr
shortStopPrice = high > high[1] ? high + stopSize : high[1] + stopSize
shortStopDistance = shortStopPrice - close
shortTargetPrice = close - shortStopDistance * rr

// Save trade stop & target & position size if a valid setup is detected
var t_entry = 0.0
var t_stop = 0.0
var t_target = 0.0
var t_direction = 0

// Detect valid long setups & trigger alert
if validLong
    t_entry := close
    t_stop := longStopPrice
    t_target := longTargetPrice
    t_direction := 1
    tradePositionSize := getPositionSize(toWhole(longStopDistance) * 10)
    strategy.entry(id='Long', direction=strategy.long, when=validLong, comment='(SL=' + str.tostring(truncate(toWhole(longStopDistance), 2)) + ' pips)')
    // Fire alerts
    if not av_use and not pc_use
        alert(message='Bullish Hammer Detected!', freq=alert.freq_once_per_bar_close)
    // Trigger PineConnector long alert
    if pc_use
        alertString = pc_use ? pc_entry_alert('buy', t_stop, t_target) : 'Bullish hammer trade detected!'
        alert(alertString, alert.freq_once_per_bar_close)
    // Trigger AutoView long alert
    if av_use
        alert(message='e=' + broker + ' b=long q=' + str.tostring(tradePositionSize) + ' s=' + pair + ' t=' + (av_limitOrder ? 'limit fp=' + str.tostring(close) : 'market') + ' fsl=' + str.tostring(t_stop) + ' ftp=' + str.tostring(t_target) + (av_gtdOrder != 0 and av_limitOrder ? gtdString : ''), freq=alert.freq_once_per_bar_close)

// Detect valid short setups & trigger alert
if validShort
    t_entry := close
    t_stop := shortStopPrice
    t_target := shortTargetPrice
    t_direction := -1
    tradePositionSize := getPositionSize(toWhole(shortStopDistance) * 10)
    strategy.entry(id='Short', direction=strategy.short, when=validShort, comment='(SL=' + str.tostring(truncate(toWhole(shortStopDistance), 2)) + ' pips)')
    // Fire alerts
    if not av_use and not pc_use
        alert(message='Bearish Hammer Detected!', freq=alert.freq_once_per_bar_close)
    // Trigger PineConnector short alert
    if pc_use
        alertString = pc_use ? pc_entry_alert('sell', t_stop, t_target) : 'Bearish IBMS trade detected!'
        alert(alertString, alert.freq_once_per_bar_close)
    // Trigger AutoView short alert
    if av_use
        alert(message='e=' + broker + ' b=short q=' + str.tostring(tradePositionSize) + ' s=' + pair + ' t=' + (av_limitOrder ? 'limit fp=' + str.tostring(close) : 'market') + ' fsl=' + str.tostring(t_stop) + ' ftp=' + str.tostring(t_target) + (av_gtdOrder != 0 and av_limitOrder ? gtdString : ''), freq=alert.freq_once_per_bar_close)

// Check if price has hit long stop loss or target
if t_direction == 1 and (low <= t_stop or high >= t_target)
    t_direction := 0
    // Cancel limit order if it hasn't been filled yet
    if pc_limit and pc_use
        alert(pc_id + ',cancellong,' + symbol)

// Check if price has hit short stop loss or target
if t_direction == -1 and (high >= t_stop or low <= t_target)
    t_direction := 0
    // Cancel limit order if it hasn't been filled yet
    if pc_limit and pc_use
        alert(pc_id + ',cancelshort,' + symbol)

// Exit trades whenever our stop or target is hit
strategy.exit(id='Long Exit', from_entry='Long', limit=t_target, stop=t_stop, when=strategy.position_size > 0)
strategy.exit(id='Short Exit', from_entry='Short', limit=t_target, stop=t_stop, when=strategy.position_size < 0)

// Draw trade data
plot(strategy.position_size != 0 or validLong or validShort ? t_stop : na, title='Trade Stop Price', color=color.new(color.red, 0), style=plot.style_linebr)
plot(strategy.position_size != 0 or validLong or validShort ? t_target : na, title='Trade Target Price', color=color.new(color.green, 0), style=plot.style_linebr)
plot(strategy.position_size != 0 or validLong or validShort ? tradePositionSize : na, color=color.new(color.purple, 0), display=display.none, title='AutoView Position Size')

// Draw EMA if it's enabled
plot(emaFilter == 0 ? na : ema, color=emaFilterLong ? color.green : color.red, linewidth=2, title='EMA')

// Draw price action setup arrows
plotshape(validLong ? 1 : na, style=shape.triangleup, location=location.belowbar, color=color.new(color.green, 0), title='Bullish Setup')
plotshape(validShort ? 1 : na, style=shape.triangledown, location=location.abovebar, color=color.new(color.red, 0), title='Bearish Setup')

// --- BEGIN TESTER CODE --- //
// Declare performance tracking variables
var balance = startBalance
var drawdown = 0.0
var maxDrawdown = 0.0
var maxBalance = 0.0
var totalPips = 0.0
var totalWins = 0
var totalLoss = 0

// Detect winning trades
if strategy.wintrades != strategy.wintrades[1]
    balance += riskPerTrade / 100 * balance * rr
    totalPips += math.abs(t_entry - t_target)
    totalWins += 1
    if balance > maxBalance
        maxBalance := balance
        maxBalance

// Detect losing trades
if strategy.losstrades != strategy.losstrades[1]
    balance -= riskPerTrade / 100 * balance
    totalPips -= math.abs(t_entry - t_stop)
    totalLoss += 1
    // Update drawdown
    drawdown := balance / maxBalance - 1
    if drawdown < maxDrawdown
        maxDrawdown := drawdown
        maxDrawdown

// Prepare stats table
var table testTable = table.new(position.top_right, 5, 2, border_width=1)
f_fillCell(_table, _column, _row, _title, _value, _bgcolor, _txtcolor) =>
    _cellText = _title + '\n' + _value
    table.cell(_table, _column, _row, _cellText, bgcolor=_bgcolor, text_color=_txtcolor)

// Draw stats table
var bgcolor = color.new(color.black, 0)
if drawTester
    if barstate.islastconfirmedhistory
        // Update table
        dollarReturn = balance - startBalance
        f_fillCell(testTable, 0, 0, 'Total Trades:', str.tostring(strategy.closedtrades), bgcolor, color.white)
        f_fillCell(testTable, 0, 1, 'Win Rate:', str.tostring(truncate(strategy.wintrades / strategy.closedtrades * 100, 2)) + '%', bgcolor, color.white)
        f_fillCell(testTable, 1, 0, 'Starting:', '$' + str.tostring(startBalance), bgcolor, color.white)
        f_fillCell(testTable, 1, 1, 'Ending:', '$' + str.tostring(truncate(balance, 2)), bgcolor, color.white)
        f_fillCell(testTable, 2, 0, 'Return:', '$' + str.tostring(truncate(dollarReturn, 2)), dollarReturn > 0 ? color.green : color.red, color.white)
        f_fillCell(testTable, 2, 1, 'Pips:', (totalPips > 0 ? '+' : '') + str.tostring(truncate(toWhole(totalPips), 2)), bgcolor, color.white)
        f_fillCell(testTable, 3, 0, 'Return:', (dollarReturn > 0 ? '+' : '') + str.tostring(truncate(dollarReturn / startBalance * 100, 2)) + '%', dollarReturn > 0 ? color.green : color.red, color.white)
        f_fillCell(testTable, 3, 1, 'Max DD:', str.tostring(truncate(maxDrawdown * 100, 2)) + '%', color.red, color.white)
// --- END TESTER CODE --- //

