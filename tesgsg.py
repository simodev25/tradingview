import json
txt={
"cmd":0,
"order":667105984,
"digits":5,
"offset":0,
"order2":667106057,
"position":667105984,
"symbol":"EURUSD",
"comment":"",
"customComment":"(ID:445120275-SL:1.0941-TP:1.0955)",
"commission":0.0,
"storage":0.0,
"margin_rate":0.0,
"close_price":0.0,
"open_price":1.09491,
"nominalValue":0.0,
"profit":"None",
"volume":1.0,
"sl":1.0941,
"tp":0.0,
"closed":false,
"timestamp":1728650041120,
"spread":0,
"taxes":0.0,
"open_time":1728650041059,
"open_timeString":"Fri Oct 11 14:34:01 CEST 2024",
"close_time":"None",
"close_timeString":"None",
"expiration":"None",
"expirationString":"None"
}
position = json.loads(txt)