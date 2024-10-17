from tradingview_ta import TA_Handler, Interval
import logging
import requests
from datetime import datetime
# Configuration du logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s [%(levelname)s] %(message)s',
                    datefmt='%Y-%m-%d %H:%M:%S')


def check_tradingview_signal(symbol, action_type, position_type=None, screener="forex", exchange="FX_IDC",
                             interval=Interval.INTERVAL_5_MINUTES):
    logging.info(f"Obtention du signal TradingView pour le symbole : {symbol}")
    try:
        handler = TA_Handler(
            symbol=symbol,
            screener=screener,
            exchange=exchange,  # Correct exchange name for Forex
            interval=interval
        )
        analysis = handler.get_analysis()
        recommendation = analysis.summary['RECOMMENDATION']
        logging.info(f"Recommandation de TradingView pour {symbol}: {recommendation}")

        if action_type == 'open':
            if (recommendation in ['BUY', 'STRONG_BUY'] and position_type == 'long') or \
                    (recommendation in ['SELL', 'STRONG_SELL'] and position_type == 'short'):
                return True
            else:
                return False
        elif action_type == 'close':
            # Autoriser toujours la fermeture de position
            return True
        else:
            return False

    except Exception:
        logging.exception(f"Erreur lors de l'obtention du signal TradingView pour le symbole {symbol}.")
        return False


def get_xtb_calendar_data(access_token, currency, from_timestamp, to_timestamp, page=0, size=1000):
    # Construire l'URL avec les paramètres
    url = f"https://xstation5api.xtb.com/v1/api/calendar/FR?access_token={access_token}&from={from_timestamp}&page={page}&size={size}&to={to_timestamp}"

    try:
        # Faire une requête GET à l'API
        today = datetime.now().strftime('%Y-%m-%d')
        response = requests.get(url)
        response.raise_for_status()  # Vérifie si la requête a échoué
        calendars = response.json()['page']['content']  # Récupérer la réponse au format JSON

        # Parcourir chaque événement et vérifier l'impact
        high_impact_events = [event for event in calendars if event['impact'] == 3 and event['currency'] == currency  and event['date'] == today]
        return high_impact_events  # Retourner les données sous forme de dictionnaire
    except requests.exceptions.HTTPError as http_err:
        print(f"HTTP error occurred: {http_err}")
    except Exception as err:
        print(f"Other error occurred: {err}")


if __name__ == "__main__":
    # Check signal for EURUSD to open a long position
    #  signal = check_tradingview_signal(
    #       symbol="EURUSD",
    #     action_type='open',
    #      position_type='short'
    #  )
    # Exemple d'utilisation
    access_token = "NDI3NzMzNTo2NzBmOWYwYzI2MGQxOThkNDc1ZDA0ZTQ="
    from_timestamp = 1726485005033
    to_timestamp = 1731669005033
    currency = "USD"
    calendar_data = get_xtb_calendar_data(access_token, currency, from_timestamp, to_timestamp)

    # logging.info(f"Signal trouvé: {signal}")
    logging.info(f"calendar_data: {calendar_data}")
