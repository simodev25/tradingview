//@version=5
strategy('kosmos', overlay=true, initial_capital=100000, default_qty_value=100, default_qty_type=strategy.percent_of_equity)
f_print(_text) =>
    // Create label on the first bar.
    var _label = label.new(bar_index, na, _text, xloc.bar_index, yloc.price, color(na), label.style_none, color.gray, size.large, text.align_left)
    // On next bars, update the label's x and y position, and the text it displays.
    label.set_xy(_label, bar_index, ta.highest(10)[1])
    label.set_text(_label, _text)



var g_av = 'AutoView Oanda Settings'
var g_risk = 'Risk Settings'
oandaDemo = input.bool(title='Use Oanda Demo?', defval=false, tooltip='If turned on then oandapractice broker prefix will be used for AutoView alerts (demo account). If turned off then live account will be used', group='AutoView Oanda Settings')
accountBalance = input.float(title='Account Balance', defval=1000.0, step=100, tooltip='Your account balance (used for calculating position size)', group=g_av)
rr = input.float(title='Risk:Reward', defval=1.0, group=g_risk, tooltip='This determines the risk:reward profile of the setup')
pips = input.float(title='Stop Pips', defval=2.0, group=g_risk, tooltip='How many pips above high to put stop loss')
riskPerTrade = input.float(title='Risk Per Trade %', defval=2.0, step=0.5, tooltip='Your risk per trade as a % of your account balance', group=g_av)
accountCurrency = input.string(title='Account Currency', defval='USD', options=['AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'JPY', 'NZD', 'USD'], tooltip='Your account balance currency (used for calculating position size)', group='AutoView Oanda Settings')
limitOrder = input.bool(title='Use Limit Order?', defval=true, tooltip='If turned on then AutoView will use limit orders. If turned off then market orders will be used', group='AutoView Oanda Settings')
gtdOrder = input.int(title='Days To Leave Limit Order', minval=0, defval=2, tooltip='This is your GTD setting (good til day)', group='AutoView Oanda Settings')

// Get Strategy Settings
var g_strategy = 'Strategy Settings'
stopMultiplier = input.float(title='Stop Loss ATR', defval=1.0, tooltip='Stop loss multiplier (x ATR)', group=g_strategy)
stopStopLossErr = input.float(title='Stop Loss marge Errr', defval=0.0001, tooltip='Stop Loss marge Errr',step=0.0001, group=g_strategy)
minProfitLoss=input.float(title='Min ProfitLoss', defval=10, tooltip='Min ProfitLoss', group=g_strategy)
i_startHour         = input.int(title="Start Date Filter", defval=0, group=g_strategy, tooltip="hour begin trading from")
i_endHour         = input.int(title="End Date Filter", defval=24, group=g_strategy, tooltip="hour stop trading")

Periods = input(title='ATR Period', defval=10)
src = input(hl2, title='Source')
Multiplier = input.float(title='ATR Multiplier', step=0.1, defval=4.0)
changeATR = input(title='Change ATR Calculation Method ?', defval=true)
showsignals = input(title='Show Buy/Sell Signals ?', defval=true)
highlighting = input(title='Highlighter On/Off ?', defval=true)
barIndex = input(title='Bar index', defval=0)
var broker = oandaDemo ? 'oandapractice' : 'oandapractice'
// See if this bar's time happened within date filter

var tradePositionSize = 0.0
var pair = syminfo.basecurrency + '/' + syminfo.currency
// Check if our account currency is the same as the base or quote currency (for risk $ conversion purposes)
accountSameAsCounterCurrency = accountCurrency == syminfo.currency
accountSameAsBaseCurrency = accountCurrency == syminfo.basecurrency

// Check if our account currency is neither the base or quote currency (for risk $ conversion purposes)
accountNeitherCurrency = not accountSameAsCounterCurrency and not accountSameAsBaseCurrency

// Get currency conversion rates if applicable
conversionCurrencyPair = accountSameAsCounterCurrency ? syminfo.tickerid : accountNeitherCurrency ? accountCurrency + syminfo.currency : accountCurrency + syminfo.currency
conversionCurrencyRate = request.security(symbol=syminfo.type == 'forex' ? conversionCurrencyPair : 'AUDUSD', timeframe='D', expression=close)
////////
entryPrice = 0.0
entryPrice := na(entryPrice[1]) ? na : entryPrice[1]

// Calculate position size
getPositionSize(stopLossSizePoints) =>
    riskAmount = accountBalance * (riskPerTrade / 100) * (accountSameAsBaseCurrency or accountNeitherCurrency ? conversionCurrencyRate : 1.0)
    riskPerPoint = stopLossSizePoints * syminfo.pointvalue
    positionSize = syminfo.type == 'forex' ? riskAmount / riskPerPoint / syminfo.mintick : 0
    math.round(positionSize)

// Custom function to convert pips into whole numbers
toWhole(number) =>
    return_1 = ta.atr(14) < 1.0 ? number / syminfo.mintick / (10 / syminfo.pointvalue) : number
    return_1 := ta.atr(14) >= 1.0 and ta.atr(14) < 100.0 and syminfo.currency == 'JPY' ? return_1 * 100 : return_1
    return_1
// Custom function to convert pips into whole numbers
getProfitLoss(tradeDirection) =>
    return_1=tradeDirection == "Long" ? (close - entryPrice) * tradePositionSize : tradePositionSize * (entryPrice - close)
    return_1
closePosition() =>
    clodeAll=true
    av_alert = 'e=' + broker + ' s=' + pair + ' c=position'
    // Send alert to webhook
    alert(message=av_alert, freq=alert.freq_once_per_bar_close)

//------------- END POSITION SIZE CODE -------------//
// Set up our GTD (good-til-date) order info
gtdTime = time + gtdOrder * 1440 * 60 * 1000  // 86,400,000ms per day
gtdYear = year(gtdTime)
gtdMonth = month(gtdTime)
gtdDay = dayofmonth(gtdTime)
gtdString = ' dt=' + str.tostring(gtdYear) + '-' + str.tostring(gtdMonth) + '-' + str.tostring(gtdDay)

atr2 = ta.sma(ta.tr, Periods)
atr = changeATR ? ta.atr(Periods) : atr2
up = src - Multiplier * atr
up1 = nz(up[1], up)
up := close[1] > up1 ? math.max(up, up1) : up
dn = src + Multiplier * atr
dn1 = nz(dn[1], dn)
dn := close[1] < dn1 ? math.min(dn, dn1) : dn
trend = 1
trend := nz(trend[1], trend)
trend := trend == -1 and close > dn1 ? 1 : trend == 1 and close < up1 ? -1 : trend
upPlot = plot(trend == 1 ? up : na, title='Up Trend', style=plot.style_linebr, linewidth=2, color=color.new(color.green, 0))
dnPlot = plot(trend == 1 ? na : dn, title='Down Trend', style=plot.style_linebr, linewidth=2, color=color.new(color.red, 0))
isLong = trend == 1
isShort = trend != 1
buySignal = trend == 1 and trend[1] == -1 //or ( isLong and (close[2] > close[3]) and (close[1] > close[2])
     and (close > close[1]))
sellSignal = trend == -1 and trend[1] == 1 //or ( isShort and (close[1] < close[2]) and (close < close[1]))
var trailPrice = 0.0



//plot(up ,dn,color=color.fuchsia)
// Calculate stops & targets
stopSize = atr * stopMultiplier
longStopPrice = low < low[1] ? low - stopSize : low[1] - stopSize
longStopDistance = close - longStopPrice
longTargetPrice = close + longStopDistance * rr

shortStopPrice = high + syminfo.mintick * pips * 10
shortStopDistance = shortStopPrice - close
shortTargetPrice = close - shortStopDistance * rr
mPlot = plot(ohlc4, title='', style=plot.style_circles, linewidth=0)
longFillColor = highlighting ? trend == 1 ? color.green : color.white : color.white
shortFillColor = highlighting ? trend == -1 ? color.red : color.white : color.white
// Save stops & targets for the current trade
var tradeStopPrice = 0.0
var tradeTargetPrice = 0.0

temp_positionSize = getPositionSize(toWhole(longStopDistance) * 10)
// Detect valid short setups & trigger alerts
var orderInProgress = false
////////////////
var tradeClose=true


tradeDirection="Long"
var tradeStopPricePositve = 0.00
var pricePossition= 0.00

if true
    if isLong
        tradeDirection:="Long" 
        tradeStopPrice := up - stopStopLossErr
       // label.new(bar_index, high,str.tostring(entryPrice) +'/'+ str.tostring(pricePossition)+'/'+ str.tostring(tradeStopPricePositve) , color=color.new(color.green, 0))
    if isShort
        tradeDirection:="Short"
      //  pricePossition = getProfitLoss(tradeDirection)
        tradeStopPrice := dn + stopStopLossErr 
      //  label.new(bar_index, high,str.tostring(  price < pricePossition and price != 0.00)+'/'+ str.tostring(tradeStopPrice) +'/'+ str.tostring(tradeStopPricePositve)+'/'+ str.tostring(pricePossition) , color=color.new(color.red, 0))
    var delet_alert = 'e=' + broker + ' s=' + pair + ' c=order'
    var av_alert = delet_alert + '\n' + 'e=' + broker + ' s=' + pair + ' c=position' + ' t=market' + ' fsl='
    // Send alert to webhook
    alert(message=av_alert + str.tostring(tradeStopPrice), freq=alert.freq_once_per_bar_close)
    alert(message=str.tostring(getProfitLoss(tradeDirection)) + '/'+str.tostring(entryPrice)+"*" +str.tostring(tradePositionSize), freq=alert.freq_once_per_bar_close)

pricePossition:= getProfitLoss(tradeDirection)
//plot(tradeStopPrice, title='Up Trend', style=plot.style_linebr, linewidth=2, color=color.new(color.aqua , 0))

dateFilter = hour(time,'GMT+1') >= i_startHour and hour(time,'GMT+1') <= i_endHour
long = (buySignal and barstate.isconfirmed  and dateFilter )  //or (up > up[1] )
if long
    tradeStopPricePositve :=0.00
    tradeStopPrice := up
    tradeTargetPrice := longTargetPrice
    tradePositionSize := temp_positionSize
    close_alert = 'e=' + broker + ' s=' + pair + ' c=position'
    // Generate AutoView alert syntax
    av_alert = close_alert + '\n' +  'e=' + broker + ' b=long' + ' q=' + str.tostring(tradePositionSize) + ' s=' + pair + ' t=market' + ' fsl=' + str.tostring(tradeStopPrice)
    // Send alert to webhook
    alert(message=av_alert, freq=alert.freq_once_per_bar_close)
// Make a label and get its price coordinate
short = sellSignal  and barstate.isconfirmed  and dateFilter  // or (dn < dn[1]  )
if short
    entryPrice := close
    tradeStopPricePositve :=0.00
    tradeStopPrice := dn
    tradeTargetPrice := shortTargetPrice
    tradePositionSize := temp_positionSize
  //  closePosition()
    close_alert = 'e=' + broker + ' s=' + pair + ' c=position'
    // Generate AutoView alert syntax
    av_alert = close_alert + '\n' + 'e=' + broker + ' b=short' + ' q=' + str.tostring(tradePositionSize) + ' s=' + pair + ' t=market' + ' fsl=' + str.tostring(tradeStopPrice)
    // Send alert to webhook
    alert(message=av_alert, freq=alert.freq_once_per_bar_close)


plotshape(short ? dn : na, title='DownTrend Begins', location=location.absolute, style=shape.circle, size=size.tiny, color=color.new(color.red, 0))
plotshape(short and showsignals ? dn : na, title='Sell', text='Sell', location=location.absolute, style=shape.labeldown, size=size.tiny, color=color.new(color.red, 0), textcolor=color.new(color.white, 0))

plotshape(long ? up : na, title='UpTrend Begins', location=location.absolute, style=shape.circle, size=size.tiny, color=color.new(color.green, 0))
plotshape(long and showsignals and highlighting and trend == 1 ? up : na, title='Buy', text='Buy', location=location.absolute, style=shape.labelup, size=size.tiny, color=color.new(color.green, 0), textcolor=color.new(color.white, 0))

strategy.entry(id='Long', direction=strategy.long, when=long)
strategy.exit(id='Long Exit', from_entry='Long', stop=tradeStopPrice )

// Enter trades whenever a valid setup is detected
strategy.entry(id='short', direction=strategy.short, when=short)
strategy.exit(id='short Exit', from_entry='short', stop=tradeStopPrice )


fill(mPlot, upPlot, title='UpTrend Highligter', color=longFillColor, transp=90)
fill(mPlot, dnPlot, title='DownTrend Highligter', color=shortFillColor, transp=90)

