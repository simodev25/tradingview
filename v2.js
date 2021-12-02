//@version=5
strategy('Kosmosv2', overlay=true, initial_capital=100000, default_qty_value=100, default_qty_type=strategy.percent_of_equity)
// AutoView Settings
var g_av = 'AutoView Settings [OANDA]'
av_use = input.bool(title='Use AutoView?', defval=true, group=g_av, tooltip='If turned on then the alerts this script generates will use AutoView syntax for auto-trading (WARNING: USE AT OWN RISK! RESEARCH THE DANGERS)')
av_oandaDemo = input.bool(title='Use Oanda Demo?', defval=true, group=g_av, tooltip='If turned on then oandapractice broker prefix will be used for AutoView alerts (demo account). If turned off then live account will be used')
av_limitOrder = input.bool(title='Use Limit Order?', defval=true, group=g_av, tooltip='If turned on then AutoView will use limit orders. If turned off then market orders will be used')
av_gtdOrder = input.int(title='Days To Leave Limit Order', minval=0, defval=2, group=g_av, tooltip='This is your GTD setting (good til day)')
av_accountBalance = input.float(title='Account Balance', defval=1000.0, step=100, group=g_av, tooltip='Your account balance (used for calculating position size)')
av_accountCurrency = input.string(title='Account Currency', defval='USD', options=['AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'JPY', 'NZD', 'USD'], group=g_av, tooltip='Your account balance currency (used for calculating position size)')
av_riskPerTrade = input.float(title='Risk Per Trade %', defval=2.0, step=0.5, group=g_av, tooltip='Your risk per trade as a % of your account balance')

    
show_Baseline = input(title='Show Baseline', defval=true)
show_SSL1 = input(title='Show SSL1', defval=false)
show_atr = input(title='Show ATR bands', defval=true)
//ATR
atrlen = input(14, 'ATR Period')
mult = input.float(1, 'ATR Multi', step=0.1)
smoothing = input.string(title='ATR Smoothing', defval='WMA', options=['RMA', 'SMA', 'EMA', 'WMA'])
var g_strategy = 'Strategy Settings'
fibLevel = input.float(title='Fib Level', defval=0.333, group=g_strategy, tooltip='Used to calculate upper/lower third of candle. (For example, setting it to 0.5 will mean hammers must close >= 50% mark of the total candle size)')
i_startHour         = input.int(title="Start Date Filter", defval=0, group=g_strategy, tooltip="hour begin trading from")
i_endHour         = input.int(title="End Date Filter", defval=24, group=g_strategy, tooltip="hour stop trading")
stopMultiplier = input.float(title='Stop Loss ATR', defval=1.0, group=g_strategy, tooltip='Stop loss multiplier (x ATR)')
rr = input.float(title='R:R', defval=1.0, group=g_strategy, tooltip='Risk:Reward profile')
atrMinFilterSize = input.float(title='>= ATR Filter', defval=0.0, minval=0.0, group=g_strategy, tooltip='Minimum size of entry candle compared to ATR')
atrMaxFilterSize = input.float(title='<= ATR Filter', defval=3.0, minval=0.0, group=g_strategy, tooltip='Maximum size of entry candle compared to ATR')
// Custom function to convert pips into whole numbers
toWhole(number) =>
    return_1 = atrlen < 1.0 ? number / syminfo.mintick / (10 / syminfo.pointvalue) : number
    return_1 := atrlen >= 1.0 and atrlen < 100.0 and syminfo.currency == 'JPY' ? return_1 * 100 : return_1
    return_1

// Custom function to convert whole numbers back into pips
toPips(number) =>
    return_2 = atrlen >= 1.0 ? number : number * syminfo.mintick * (10 / syminfo.pointvalue)
    return_2 := atrlen >= 1.0 and atrlen < 100.0 and syminfo.currency == 'JPY' ? return_2 / 100 : return_2
    return_2
// Custom function to truncate (cut) excess decimal places
truncate(_number, _decimalPlaces) =>
    _factor = math.pow(10, _decimalPlaces)
    int(_number * _factor) / _factor
    
ma_function(source, atrlen) =>
    if smoothing == 'RMA'
        ta.rma(source, atrlen)
    else
        if smoothing == 'SMA'
            ta.sma(source, atrlen)
        else
            if smoothing == 'EMA'
                ta.ema(source, atrlen)
            else
                ta.wma(source, atrlen)
atr_slen = ma_function(ta.tr(true), atrlen)
////ATR Up/Low Bands
upper_band = atr_slen * mult + close
lower_band = close - atr_slen * mult

////BASELINE / SSL1 / SSL2 / EXIT MOVING AVERAGE VALUES
maType = input.string(title='SSL1 / Baseline Type', defval='HMA', options=['SMA', 'EMA', 'DEMA', 'TEMA', 'LSMA', 'WMA', 'MF', 'VAMA', 'TMA', 'HMA', 'JMA', 'Kijun v2', 'EDSMA', 'McGinley'])
len = input(title='SSL1 / Baseline Length', defval=60)

SSL2Type = input.string(title='SSL2 / Continuation Type', defval='JMA', options=['SMA', 'EMA', 'DEMA', 'TEMA', 'WMA', 'MF', 'VAMA', 'TMA', 'HMA', 'JMA', 'McGinley'])
len2 = input(title='SSL 2 Length', defval=5)
//
SSL3Type = input.string(title='EXIT Type', defval='HMA', options=['DEMA', 'TEMA', 'LSMA', 'VAMA', 'TMA', 'HMA', 'JMA', 'Kijun v2', 'McGinley', 'MF'])
len3 = input(title='EXIT Length', defval=15)
src = input(title='Source', defval=low)

//
tema(src, len) =>
    ema1 = ta.ema(src, len)
    ema2 = ta.ema(ema1, len)
    ema3 = ta.ema(ema2, len)
    3 * ema1 - 3 * ema2 + ema3
kidiv = input.int(defval=1, maxval=4, title='Kijun MOD Divider')

jurik_phase = input(title='* Jurik (JMA) Only - Phase', defval=3)
jurik_power = input(title='* Jurik (JMA) Only - Power', defval=1)
volatility_lookback = input(10, title='* Volatility Adjusted (VAMA) Only - Volatility lookback length')
//MF
beta = input.float(0.8, minval=0, maxval=1, step=0.1, title='Modular Filter, General Filter Only - Beta')
feedback = input(false, title='Modular Filter Only - Feedback')
z = input.float(0.5, title='Modular Filter Only - Feedback Weighting', step=0.1, minval=0, maxval=1)
//EDSMA
ssfLength = input.int(title='EDSMA - Super Smoother Filter Length', minval=1, defval=20)
ssfPoles = input.int(title='EDSMA - Super Smoother Filter Poles', defval=2, options=[2, 3])
dateFilter = hour(time,'GMT+1') >= i_startHour and hour(time,'GMT+1') <= i_endHour

Periods = input(title='ATR Period', defval=10)
changeATR = input(title='Change ATR Calculation Method ?', defval=true)
Multiplier = input.float(title='ATR Multiplier', step=0.1, defval=3.0)
// Filter Settings
var g_filter = 'Filter Settings'
emaFilter = input.int(title='EMA Filter', defval=0, group=g_filter, tooltip='EMA length to filter trades - set to zero to disable')
var broker = av_oandaDemo ? 'oandapractice' : 'oanda'
//----

//EDSMA
get2PoleSSF(src, length) =>
    PI = 2 * math.asin(1)
    arg = math.sqrt(2) * PI / length
    a1 = math.exp(-arg)
    b1 = 2 * a1 * math.cos(arg)
    c2 = b1
    c3 = -math.pow(a1, 2)
    c1 = 1 - c2 - c3

    ssf = 0.0
    ssf := c1 * src + c2 * nz(ssf[1]) + c3 * nz(ssf[2])
    ssf

get3PoleSSF(src, length) =>
    PI = 2 * math.asin(1)

    arg = PI / length
    a1 = math.exp(-arg)
    b1 = 2 * a1 * math.cos(1.738 * arg)
    c1 = math.pow(a1, 2)

    coef2 = b1 + c1
    coef3 = -(c1 + b1 * c1)
    coef4 = math.pow(c1, 2)
    coef1 = 1 - coef2 - coef3 - coef4

    ssf = 0.0
    ssf := coef1 * src + coef2 * nz(ssf[1]) + coef3 * nz(ssf[2]) + coef4 * nz(ssf[3])
    ssf

ma(type, src, len) =>
    float result = 0
    if type == 'TMA'
        result := ta.sma(ta.sma(src, math.ceil(len / 2)), math.floor(len / 2) + 1)
        result
    if type == 'MF'
        ts = 0.
        b = 0.
        c = 0.
        os = 0.
        //----
        alpha = 2 / (len + 1)
        a = feedback ? z * src + (1 - z) * nz(ts[1], src) : src
        //----
        b := a > alpha * a + (1 - alpha) * nz(b[1], a) ? a : alpha * a + (1 - alpha) * nz(b[1], a)
        c := a < alpha * a + (1 - alpha) * nz(c[1], a) ? a : alpha * a + (1 - alpha) * nz(c[1], a)
        os := a == b ? 1 : a == c ? 0 : os[1]
        //----
        upper = beta * b + (1 - beta) * c
        lower = beta * c + (1 - beta) * b
        ts := os * upper + (1 - os) * lower
        result := ts
        result
    if type == 'LSMA'
        result := ta.linreg(src, len, 0)
        result
    if type == 'SMA'  // Simple
        result := ta.sma(src, len)
        result
    if type == 'EMA'  // Exponential
        result := ta.ema(src, len)
        result
    if type == 'DEMA'  // Double Exponential
        e = ta.ema(src, len)
        result := 2 * e - ta.ema(e, len)
        result
    if type == 'TEMA'  // Triple Exponential
        e = ta.ema(src, len)
        result := 3 * (e - ta.ema(e, len)) + ta.ema(ta.ema(e, len), len)
        result
    if type == 'WMA'  // Weighted
        result := ta.wma(src, len)
        result
    if type == 'VAMA'  // Volatility Adjusted
        /// Copyright © 2019 to present, Joris Duyck (JD)
        mid = ta.ema(src, len)
        dev = src - mid
        vol_up = ta.highest(dev, volatility_lookback)
        vol_down = ta.lowest(dev, volatility_lookback)
        result := mid + math.avg(vol_up, vol_down)
        result
    if type == 'HMA'  // Hull
        result := ta.wma(2 * ta.wma(src, len / 2) - ta.wma(src, len), math.round(math.sqrt(len)))
        result
    if type == 'JMA'  // Jurik
        /// Copyright © 2018 Alex Orekhov (everget)
        /// Copyright © 2017 Jurik Research and Consulting.
        phaseRatio = jurik_phase < -100 ? 0.5 : jurik_phase > 100 ? 2.5 : jurik_phase / 100 + 1.5
        beta = 0.45 * (len - 1) / (0.45 * (len - 1) + 2)
        alpha = math.pow(beta, jurik_power)
        jma = 0.0
        e0 = 0.0
        e0 := (1 - alpha) * src + alpha * nz(e0[1])
        e1 = 0.0
        e1 := (src - e0) * (1 - beta) + beta * nz(e1[1])
        e2 = 0.0
        e2 := (e0 + phaseRatio * e1 - nz(jma[1])) * math.pow(1 - alpha, 2) + math.pow(alpha, 2) * nz(e2[1])
        jma := e2 + nz(jma[1])
        result := jma
        result
    if type == 'Kijun v2'
        kijun = math.avg(ta.lowest(len), ta.highest(len))  //, (open + close)/2)
        conversionLine = math.avg(ta.lowest(len / kidiv), ta.highest(len / kidiv))
        delta = (kijun + conversionLine) / 2
        result := delta
        result
    if type == 'McGinley'
        mg = 0.0
        mg := na(mg[1]) ? ta.ema(src, len) : mg[1] + (src - mg[1]) / (len * math.pow(src / mg[1], 4))
        result := mg
        result
    if type == 'EDSMA'

        zeros = src - nz(src[2])
        avgZeros = (zeros + zeros[1]) / 2

        // Ehlers Super Smoother Filter 
        ssf = ssfPoles == 2 ? get2PoleSSF(avgZeros, ssfLength) : get3PoleSSF(avgZeros, ssfLength)

        // Rescale filter in terms of Standard Deviations
        stdev = ta.stdev(ssf, len)
        scaledFilter = stdev != 0 ? ssf / stdev : 0

        alpha = 5 * math.abs(scaledFilter) / len

        edsma = 0.0
        edsma := alpha * src + (1 - alpha) * nz(edsma[1])
        result := edsma
        result
    result

///SSL 1 and SSL2
emaHigh = ma(maType, high, len)
emaLow = ma(maType, low, len)

maHigh = ma(SSL2Type, high, len2)
maLow = ma(SSL2Type, low, len2)

///EXIT
ExitHigh = ma(SSL3Type, high, len3)
ExitLow = ma(SSL3Type, low, len3)

///Keltner Baseline Channel
BBMC = ma(maType, close, len)
useTrueRange = input(true)
multy = input.float(0.2, step=0.05, title='Base Channel Multiplier')
Keltma = ma(maType, src, len)
range_1 = useTrueRange ? ta.tr : high - low
rangema = ta.ema(range_1, len)
upperk = Keltma + rangema * multy
lowerk = Keltma - rangema * multy

//Baseline Violation Candle
open_pos = open * 1
close_pos = close * 1
difference = math.abs(close_pos - open_pos)
atr_violation = difference > atr_slen
InRange = upper_band > BBMC and lower_band < BBMC
candlesize_violation = atr_violation and InRange
plotshape(candlesize_violation, color=color.new(color.white, 0), size=size.tiny, style=shape.diamond, location=location.top, title='Candle Size > 1xATR')


//SSL1 VALUES
Hlv = int(na)
Hlv := close > emaHigh ? 1 : close < emaLow ? -1 : Hlv[1]
sslDown = Hlv < 0 ? emaHigh : emaLow

//SSL2 VALUES
Hlv2 = int(na)
Hlv2 := close > maHigh ? 1 : close < maLow ? -1 : Hlv2[1]
sslDown2 = Hlv2 < 0 ? maHigh : maLow

//EXIT VALUES
Hlv3 = int(na)
Hlv3 := close > ExitHigh ? 1 : close < ExitLow ? -1 : Hlv3[1]
sslExit = Hlv3 < 0 ? ExitHigh : ExitLow
base_cross_Long = ta.crossover(close, sslExit)
base_cross_Short = ta.crossover(sslExit, close)
codiff = base_cross_Long ? 1 : base_cross_Short ? -1 : na

//COLORS
show_color_bar = input(title='Color Bars', defval=true)
color_bar = src > upperk ? #00c3ff : src < lowerk ? #ff0062 : color.gray
color_ssl1 = src > sslDown ? #00c3ff : src < sslDown ? #ff0062 : na
ssl_direction = src > upperk ? 1 : src < lowerk ? -1 : 0
bar_direction = src > upperk ? 1 : src < lowerk ? -1 : 0
//PLOTS
plotarrow(codiff, colorup=color.new(#00c3ff, 20), colordown=color.new(#ff0062, 20), title='Exit Arrows', maxheight=20, offset=0)//up
p1 = plot(show_Baseline ? BBMC : na, color=color_bar, linewidth=4, title='MA Baseline', transp=0)
DownPlot = plot(show_SSL1 ? sslDown : na, title='SSL1', linewidth=3, color=color_ssl1, transp=10)
barcolor(show_color_bar ? color_bar : na)
up_channel = plot(show_Baseline ? upperk : na, color=color_bar, title='Baseline Upper Channel')
low_channel = plot(show_Baseline ? lowerk : na, color=color_bar, title='Basiline Lower Channel')
fill(up_channel, low_channel, color=color_bar, transp=90)

////SSL2 Continiuation from ATR
atr_crit = input.float(0.9, step=0.1, title='Continuation ATR Criteria')
upper_half = atr_slen * atr_crit + close
lower_half = src - atr_slen * atr_crit
buy_inatr = lower_half < sslDown2
sell_inatr = upper_half > sslDown2
sell_cont = src < BBMC and src < sslDown2
buy_cont = src > BBMC and src > sslDown2
sell_atr = sell_inatr and sell_cont
buy_atr = buy_inatr and buy_cont
atr_fill = buy_atr ? color.green : sell_atr ? color.purple : color.white
LongPlot = plot(sslDown2, title='SSL2', linewidth=2, color=atr_fill, style=plot.style_circles, transp=0)
u = plot(show_atr ? upper_band : na, '+ATR', color=color.new(color.white, 80))
l = plot(show_atr ? lower_band : na, '-ATR', color=color.new(color.white, 80))


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
// up dn zone 
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
upPlot = plot(up, title='Up Trend', style=plot.style_linebr, linewidth=2, color=color.new(color.green, 0))
dnPlot = plot( dn, title='Down Trend', style=plot.style_linebr, linewidth=2, color=color.new(color.red, 0))
isLong = trend == 1
isShort = trend != 1

// end up dn zone

//ALERTS
//alertcondition(crossover(close, sslDown), title='SSL Cross Alert', message='SSL1 has crossed.')
//alertcondition(crossover(close, sslDown2), title='SSL2 Cross Alert', message='SSL2 has crossed.')
//alertcondition(sell_atr, title='Sell Continuation', message='Sell Continuation.')
//alertcondition(buy_atr, title='Buy Continuation', message='Buy Continuation.')
//alertcondition(crossover(close, sslExit), title='Exit Sell', message='Exit Sell Alert.')
//alertcondition(crossover(sslExit, close), title='Exit Buy', message='Exit Buy Alert.')
//alertcondition(crossover(close, upperk ), title='Baseline Buy Entry', message='Base Buy Alert.')
//alertcondition(crossover(lowerk, close ), title='Baseline Sell Entry', message='Base Sell Alert.')
// Save trade stop & target & position size if a valid setup is detected
// Determine if we have a valid setup
ema = ta.ema(close, emaFilter == 0 ? 1 : emaFilter)
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

validHammer = lowestBody >= bullFib and atrFilter and close != open and not na(atr) and emaFilterLong
validStar = highestBody <= bearFib and atrFilter and close != open and not na(atr) and emaFilterShort

// Check if we have confirmation for our setup
//validLong = validHammer and strategy.position_size == 0 and dateFilter and barstate.isconfirmed
//validShort = validStar and strategy.position_size == 0 and dateFilter and barstate.isconfirmed

var t_entry = 0.0
var t_stop = 0.0
var t_target = 0.0
var t_direction = 0
var t_exit = 0.0
// Calculate our stop distance & size for the current bar
stopSize = atrlen * stopMultiplier
longStopPrice = low < low[1] ? low - stopSize : low[1] - stopSize
longStopDistance = src - longStopPrice
longTargetPrice = src + longStopDistance * rr
shortStopPrice = high > high[1] ? high + stopSize : high[1] + stopSize
shortStopDistance = shortStopPrice - close
shortTargetPrice = src - shortStopDistance * rr
buySignal = trend == 1 and trend[1] == -1 
sellSignal = trend == -1 and trend[1] == 1
sslCrossAlert=ta.crossover(src, sslDown)
ssl2CrossAlert=ta.crossover(src, sslDown2)
closeLower = (src < src[1])
twoLowerCloses =  (src[2] < src[3]) and  (src[1] < src[2]) and (src < src[1])
twoUpCloses =  (src[2] < src[3]) and  (src[1] > src[2]) and (src > src[1])
exitBuy = ta.crossover(sslExit, src) // and ssl_direction == -1
exitSell=ta.crossover(src, sslExit)// and ssl_direction == 1///and not sell_atr  and barstate.isconfirmed 
entryBuy=ta.crossover(src, upperk)  //and twoUpCloses // and dateFilter  and isLong) or(buySignal and ssl_direction == 1 )  )//and ssl_direction == 1 and dateFilter  and isLong//and  buy_atr 
entrySell=ta.crossover(lowerk, src)  //   and twoLowerCloses  // and dateFilter and isShort and twoLowerCloses ) or(sellSignal and ssl_direction == -1) )// and ssl_direction == -1 and dateFilter and isShort //and sell_atr

validLong =(entryBuy  and twoUpCloses   and barstate.isconfirmed ) //or buy_atr
validShort = (entrySell and twoLowerCloses  and barstate.isconfirmed) //or sell_atr
// Detect valid long setups & trigger alert
if validLong
  //  label.new(bar_index, high,'entryBuy:'+str.tostring(close), color=color.new(color.green, 0))
    t_entry := close
    t_exit:=0
    t_stop := dn
    t_target := longTargetPrice
    t_direction := 1
    tradePositionSize := getPositionSize(toWhole(longStopDistance) * 10)
    strategy.entry(id='Long', direction=strategy.long, when=entryBuy)
    // Trigger AutoView short alert
    close_alert = 'e=' + broker + ' s=' + pair + ' c=position'
    // Generate AutoView alert syntax
    av_alert = close_alert + '\n' +  'e=' + broker + ' b=long' + ' q=' + str.tostring(tradePositionSize) + ' s=' + pair + ' t=market' + ' fsl=' + str.tostring(t_stop)
    // Send alert to webhook
    alert(message=av_alert, freq=alert.freq_once_per_bar_close)
// Detect valid short setups & trigger alert
if validShort
    t_entry := close
    t_exit:=0
    t_stop := up
    t_target := shortTargetPrice
    t_direction := -1
    tradePositionSize := getPositionSize(toWhole(shortStopDistance) * 10)
    strategy.entry(id='Short', direction=strategy.short, when=entrySell, comment='(SL=' + str.tostring(truncate(toWhole(shortStopDistance), 2)) + ' pips)')
    // Trigger AutoView short alert
    close_alert = 'e=' + broker + ' s=' + pair + ' c=position'
    // Generate AutoView alert syntax
    av_alert = close_alert + '\n' +  'e=' + broker + ' b=short' + ' q=' + str.tostring(tradePositionSize) + ' s=' + pair + ' t=market' + ' fsl=' + str.tostring(t_stop)
    // Send alert to webhook
    alert(message=av_alert, freq=alert.freq_once_per_bar_close)
   // label.new(bar_index, high,av_alert, color=color.new(color.red, 0))

// Exit trades whenever our stop or target is hit
if(t_direction !=0)
    label.new(bar_index, high,'d:'+str.tostring(t_direction)+'|xS:'+str.tostring(exitSell)+'|xB:'+str.tostring(exitBuy)+'|EB:'+str.tostring(entryBuy)+'|ES:'+str.tostring(entrySell)+'|SC:'+str.tostring(sell_atr)+'|BC:'+str.tostring(buy_atr), color=t_direction == -1 ? color.new(color.red, 0):color.new(color.green, 0))
if true
    if t_direction == 1 // long
        t_stop := up
      //  label.new(bar_index, high,str.tostring(exitBuy), color=color.new(color.green, 0))
    if t_direction == -1 // shor
        t_stop := dn
      //  label.new(bar_index, high,str.tostring(exitBuy), color=color.new(color.red, 0))
    var delet_alert = 'e=' + broker + ' s=' + pair + ' c=order'
    var av_alert = delet_alert + '\n' + 'e=' + broker + ' s=' + pair + ' c=position' + ' t=market' + ' fsl='
    // Send alert to webhook
    alert(message=av_alert + str.tostring(t_stop), freq=alert.freq_once_per_bar_close)
    
if (exitSell and t_direction == -1) or (exitBuy and t_direction == 1)
    t_exit:=close
    t_direction:=0
    t_entry:=0
    var delet_alert = 'e=' + broker + ' s=' + pair + ' c=order'
    // Send alert to webhook
    alert(message=delet_alert, freq=alert.freq_once_per_bar_close)

strategy.exit(id='Long Exit', from_entry='Long', stop=t_stop, when=exitBuy and t_direction == 1 )
strategy.exit(id='Short Exit', from_entry='Short', stop=t_stop, when=exitSell and t_direction == -1)   
//plot(t_stop, title='Up Trend', style=plot.style_linebr, linewidth=2, color=color.new(color.aqua , 0))

