import logging
import os
import json
import time
import re
from datetime import datetime
from typing import Optional, Tuple, Any, Dict

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from tradingview_ta import TA_Handler, Interval

from xtb import XTB
from models_order import TradeOrder, Base

# Mappings for various configurations
STATUS_MAPPING = {
    0: 'error',
    1: 'pending',
    3: 'The transaction has been executed successfully',
    4: 'The transaction has been rejected'
}

INSTRUMENT_MAPPING = {
    "EURUSD": "EURUSD",
    "BTCUSD": "BITCOIN",
    "BTCUSDT27Z2024": "BITCOIN",
    "EURAUD": "EURAUD",
    "EURCAD": "EURCAD",
    "EURGBP": "EURGBP"
}

INSTRUMENT_ROUND_MAPPING = {
    "EURUSD": 10000,
    "EURAUD": 10000,
    "EURGBP": 10000,
    "EURCAD": 10000,
    "BTCUSD": 10,
    "BTCUSDT27Z2024": 10,
    "BITCOIN": 10
}

INSTRUMENT_UNITS_MAPPING = {
    "EURUSD": 1,
    "EURAUD": 1,
    "EURCAD": 1,
    "EURGBP": 1,
    "BITCOIN": 0.01
}

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)


class TradingService:
    def __init__(self) -> None:
        """
        Initialize the trading service.
        """
        logging.info("Initialisation du service de trading.")

        # Initialize the XTB client with credentials from environment variables
        self.xtb_id = os.getenv('API_USER')
        self.xtb_password = os.getenv('API_PASSWORD')
        if not self.xtb_id or not self.xtb_password:
            logging.error("Les variables d'environnement API_USER et API_PASSWORD doivent être définies.")
            raise SystemExit("Variables d'environnement manquantes.")

        logging.info("Initialisation du client XTB avec l'ID utilisateur.")
        self.xtb_client = XTB(ID=self.xtb_id, PSW=self.xtb_password)

        # Configure the database
        engine = create_engine('postgresql+psycopg2://trades:trades@localhost:5432/trades', echo=False,
                               connect_args={'options': '-csearch_path={}'.format("trades_schema")})
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        self.session = Session()

    def parse_order_comment(self, instrument: str, order_comment: str) -> Tuple[
        Optional[float], Optional[float], Optional[int]]:
        """
        Parse the order comment to extract SL, TP, and order_id.

        Args:
            instrument (str): The instrument symbol.
            order_comment (str): The comment string from the order.

        Returns:
            Tuple[Optional[float], Optional[float], Optional[int]]: A tuple containing sl, tp, and order_id.
        """
        logging.info("Analyse du commentaire de l'ordre pour extraire SL/TP et l'ID de l'ordre.")
        sl, tp, order_id = None, None, None

        # Get the rounding factor from the mapping
        round_factor = INSTRUMENT_ROUND_MAPPING.get(instrument, 1)

        # Use regular expressions to extract SL, TP, and ID
        try:
            order_id_match = re.search(r'ID:(\d+)', order_comment)
            if order_id_match:
                order_id = int(order_id_match.group(1))

            sl_match = re.search(r'SL:([\d\.]+)', order_comment)
            if sl_match:
                sl = float(sl_match.group(1))
                sl = int(sl * round_factor) / round_factor

            tp_match = re.search(r'TP:([\d\.]+)', order_comment)
            if tp_match:
                tp = float(tp_match.group(1))
                tp = int(tp * round_factor) / round_factor
        except Exception:
            logging.exception("Erreur lors de l'analyse de SL, TP et order_id à partir du commentaire de l'ordre.")

        return sl, tp, order_id

    def fill_defaults(self, post_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Fill default parameters for the received data.

        Args:
            post_data (Dict[str, Any]): The received data.

        Returns:
            Dict[str, Any]: The data with defaults filled in.
        """
        logging.info("Remplissage des paramètres par défaut pour les données reçues.")
        logging.debug(f"Données reçues : {post_data}")

        instrument = INSTRUMENT_MAPPING.get(post_data.get("ticker"))
        if not instrument:
            logging.error("L'instrument est manquant dans les données reçues.")
            raise ValueError("L'instrument est requis.")

        price = float(post_data.get("price", 0))
        units = INSTRUMENT_UNITS_MAPPING.get(instrument)
        position_size = float(post_data.get("position_size", 1))
        order_comment = post_data.get("order_comment", "")
        trading_type = post_data.get("trading_type", "practice")
        time_str = post_data.get("time")
        interval = post_data.get("interval")
        if not time_str:
            logging.error("Le temps est manquant dans les données reçues.")
            raise ValueError("Le temps est requis.")

        # Parse the order comment to extract SL, TP, and order_id
        sl, tp, order_id = self.parse_order_comment(instrument, order_comment)

        logging.info(f"Paramètres par défaut définis : instrument={instrument}, price={price}, units={units}, "
                     f"position_size={position_size}, order_comment={order_comment}, "
                     f"trading_type={trading_type}, tp={tp}, sl={sl}, order_id={order_id}")

        return {
            "instrument": instrument,
            "units": units,
            "price": price,
            "position_size": position_size,
            "order_comment": order_comment,
            "trading_type": trading_type,
            "tp": tp,
            "sl": sl,
            "order_id": order_id,
            "time": time_str,
            "interval": interval
        }

    def determine_action(self, action_str: str) -> Tuple[Optional[int], str, str]:
        """
        Determine the action from the action string.

        Args:
            action_str (str): The action string.

        Returns:
            Tuple[Optional[int], str]: A tuple containing cmd and action_type.
        """
        action_str = action_str.lower()
        if action_str == "long":
            cmd = 0  # Buy
            logging.info("Action détectée : Achat.")
            return cmd, 'open', "long"
        elif action_str == "short":
            cmd = 1  # Sell
            logging.info("Action détectée : Vente.")
            return cmd, 'open', "short"
        elif action_str in ["long_exit", "short_exit"]:
            logging.info("Action détectée : Sortie de position.")
            return None, 'close', "exit"
        else:
            logging.error(f"Action invalide reçue : {action_str}")
            raise ValueError("Action non valide : 'long', 'short', 'long_exit' ou 'short_exit' attendu.")

    def process_order(self, post_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process the trading order.

        Args:
            post_data (Dict[str, Any]): The data received for the order.

        Returns:
            Dict[str, Any]: The result of the order processing.
        """
        logging.info("Traitement de la commande de trading.")
        try:
            filled_data = self.fill_defaults(post_data)
        except Exception:
            logging.exception("Impossible de remplir les paramètres par défaut.")
            raise

        symbol = filled_data['instrument']
        volume = filled_data['units']
        price = filled_data['price']
        position_size = filled_data['position_size']
        tp = filled_data['tp']
        sl = filled_data['sl']
        order_comment = filled_data['order_comment']
        logging.info(f"Paramètres de trading : symbol={symbol}, volume={volume}, price={price},tp={tp},sl={sl}, "
                     f"position_size={position_size}, order_comment={order_comment}")

        cmd, action_type, action = self.determine_action(post_data.get("action", "").lower())
        order_id = filled_data.get('order_id')
        order = self.get_order(order_id)
        if action_type == 'close':
            # Close position action
            if not order:
                logging.error("L'ID de l'ordre est requis pour sortir d'une position.")
                return {'status': 'ID de ordre est requis pour sortir une position.'}

            logging.info(
                f"Close position order_id:{order_id} order_id_xtb {order.order_id_xtb} position {order.position_id_xtb}")

            self.close_position(
                order.position_id_xtb,
                order.instrument,
                order.cmd,
                order.units,
                order.open_price,
                order.custom_comment
            )
            position = self.get_position(order.position_id_xtb, order_id)
            self.update_trade_in_db(order_id, status='closed', close_time_string=position['close_timeString']
                                    , close_time=position['close_time']
                                    , closed=position['closed']
                                    , tp=position['tp']
                                    , sl=position['sl']
                                    , profit=position['profit']
                                    , open_price=position['open_price']
                                    , close_price=position['close_price']
                                    )
            return {
                'order_id': order_id,
                'order_id_xtb': order.order_id_xtb,
                'position_id': order.position_id_xtb,
                'status': 'closed'
            }
        elif action_type == 'open':
            # Proceed to open a trade
            # Check the TradingView signal before placing the order
            if order:
                logging.error("L'ID de l'ordre excite deja ")
                return {'status': 'IL ID de ordre excite deja.'}
            interval = filled_data.get('interval')
            if interval:
                interval_param = interval + "m"
                tradingview_signal = self.check_tradingview_signal(symbol, action_type, position_type=action,
                                                                   interval=interval_param)
                if not tradingview_signal:
                    logging.error(f"Signal de TradingView défavorable pour {symbol}. Opération annulée.")
                    return {'status': 'Signal défavorable'}
            logging.info(
                f"Signal favorable : Envoi de la commande à l'API XTB : cmd={cmd}, symbol={symbol}, volume={volume}")
            success, order_id_xtb = self.xtb_client.make_Trade(
                symbol=symbol,
                cmd=cmd,
                volume=volume,
                comment=order_comment,
                sl=sl,
                tp=tp

            )

            if not success:
                logging.error(f"Échec de l'exécution de l'ordre pour le symbole {symbol}")
                raise Exception("Échec de l'exécution de l'ordre")

            logging.info(f"Ordre XTB exécuté avec succès, ID de l'ordre : {order_id_xtb}")
            filled_data['order_id_xtb'] = order_id_xtb

            # Call check_trade to get the real status of the order
            status = self.check_trade(order_id_xtb)
            filled_data['request_status'] = status

            # Set filled_data['status'] based on the obtained status
            if status == 'The transaction has been executed successfully':
                filled_data['status'] = 'open'
            elif status in ['error', 'The transaction has been rejected']:
                filled_data['status'] = 'error'
            else:
                filled_data['status'] = status  # For other statuses, e.g., 'pending'

            # If status is 'open', retrieve position information
            if filled_data['status'] == 'open':
                position = self.get_position_by_order_id(order_id_xtb)
                logging.info(f"Informations de la position : {position}")
                filled_data['position_id_xtb'] = position['position']
                filled_data['position'] = position
            else:
                # If the order was not successfully executed
                filled_data['position_id_xtb'] = None
                filled_data['position'] = {}

            filled_data['action'] = action
            # Insert the order data into the database
            self.insert_trade_to_db(filled_data)

            # Return the appropriate status
            return {'order_id': order_id_xtb, 'status': filled_data['status']}

    def insert_trade_to_db(self, trade_data: Dict[str, Any]) -> None:
        """
        Insert the order into the database.

        Args:
            trade_data (Dict[str, Any]): The data of the trade to insert.

        Raises:
            Exception: If insertion fails.
        """
        logging.info("Insertion de l'ordre dans la base de données.")
        try:
            # Create a new TradeOrder instance
            position = trade_data.get('position', {})
            new_trade = TradeOrder(
                instrument=trade_data['instrument'],
                units=float(trade_data['units']),
                price=float(trade_data['price']),
                position_size=float(trade_data.get('position_size', 0)),
                order_comment=trade_data.get('order_comment', ""),
                trading_type=trade_data.get('trading_type', "practice"),
                tp=trade_data.get('tp'),
                sl=trade_data.get('sl'),
                order_id=trade_data.get('order_id'),
                order_id_xtb=trade_data.get('order_id_xtb'),
                position_id_xtb=trade_data.get('position_id_xtb'),
                time=datetime.now(),
                status=trade_data.get('status', 'close'),
                request_status=trade_data.get('request_status', 'open'),
                interval=str(trade_data.get('interval')),
                action=str(trade_data.get('action')),
                cmd=position.get('cmd'),
                order2=position.get('order2'),
                custom_comment=position.get('customComment', ""),
                commission=float(position.get('commission', 0.0)),
                storage=float(position.get('storage', 0.0)),
                margin_rate=float(position.get('margin_rate', 0.0)),
                close_price=float(position.get('close_price', 0.0)),
                open_price=float(position.get('open_price', 0.0)),
                nominal_value=float(position.get('nominalValue', 0.0)),
                profit=float(position.get('profit', 0.0)),
                closed=position.get('closed', False),
                timestamp=int(position.get('timestamp', 0)),
                open_time=int(position.get('open_time', 0)),
                open_time_string=position.get('open_timeString', ""),
                spread=float(position.get('spread', 0.0)),
                taxes=float(position.get('taxes', 0.0)),
                close_time=int(position.get('close_time', 0)),
                close_time_string=position.get('close_timeString', "")
            )

            # Add the entry to the session and commit
            self.session.add(new_trade)
            self.session.commit()
            logging.info("Ordre inséré avec succès dans la base de données.")
        except Exception as e:
            logging.error(f"Erreur lors de l'insertion de l'ordre dans la base de données : {e}")
            self.session.rollback()
            raise

    def update_trade_in_db(self, order_id: int, **kwargs) -> None:
        """
        Update the order in the database with the given order_id and new values.

        Args:
            order_id (int): The local order ID.
            **kwargs: The fields to update.

        Raises:
            Exception: If update fails.
        """
        logging.info(f"Mise à jour de l'ordre dans la base de données pour l'ID : {order_id}")
        try:
            trade = self.session.query(TradeOrder).filter_by(order_id=order_id).one()
            for key, value in kwargs.items():
                setattr(trade, key, value)
            self.session.commit()
            logging.info(f"Ordre {order_id} mis à jour avec succès dans la base de données.")
        except Exception:
            logging.exception(f"Erreur lors de la mise à jour de l'ordre {order_id} dans la base de données.")
            self.session.rollback()
            raise

    def get_order(self, order_id: int) -> Optional[TradeOrder]:
        """
        Retrieve the order from the database using the given order_id, only if the status is 'open'.

        Args:
            order_id (int): The local order ID.

        Returns:
            Optional[TradeOrder]: The TradeOrder instance or None if not found or not 'open'.

        Raises:
            Exception: If query fails.
        """
        logging.info(f"Récupération de l'order_id_xtb pour l'order_id : {order_id} avec statut 'open'")
        try:
            trade = self.session.query(TradeOrder).filter_by(order_id=order_id, status='open').one_or_none()
            if trade:
                logging.info(f"Ordre trouvé avec statut 'open' : {trade}")
                return trade
            else:
                logging.info(f"Aucun ordre avec statut 'open' trouvé pour l'order_id : {order_id}")
                return None
        except Exception:
            logging.exception(f"Erreur lors de la récupération de l'ordre avec l'order_id {order_id}.")
            raise

    def close_position(self, position_id: int, symbol: str, cmd: int, volume: float, price: float,
                       order_comment: str) -> bool:
        """
        Close the position with the given position_id.

        Args:
            position_id (int): The position ID.
            symbol (str): The instrument symbol.
            cmd (int): Command (buy/sell).
            volume (float): Volume of the trade.
            price (float): Price of the trade.
            order_comment (str): Comment for the order.

        Returns:
            bool: True if successful, False otherwise.

        Raises:
            Exception: If closing fails.
        """
        logging.info(f"Fermeture de la position avec l'ID de l'ordre : {position_id}")
        try:
            success, _ = self.xtb_client.close_Trade(
                position_id,
                symbol,
                cmd,
                volume,
                price,
                order_comment
            )
            if success:
                logging.info(f"Position {position_id} fermée avec succès.")
            else:
                logging.error(f"Échec de la fermeture de la position {position_id}.")
                return False
            return success
        except Exception:
            logging.exception(f"Erreur lors de la fermeture de la position {position_id}.")
            raise

    def check_trade(self, order_id: int, timeout: int = 60, check_interval: int = 5) -> str:
        """
        Check the status of the order with the given ID.

        Args:
            order_id (int): The order ID to check.
            timeout (int): Maximum time (in seconds) to wait for status change.
            check_interval (int): Time (in seconds) between each check.

        Returns:
            str: The final status of the order.

        Raises:
            Exception: If checking fails.
        """
        logging.info(f"Vérification de l'état de l'ordre avec ID : {order_id}")
        start_time = time.time()
        try:
            while True:
                status_code = self.xtb_client.check_Trade(order_id)
                status = STATUS_MAPPING.get(status_code, 'Unknown status')
                logging.info(f"Statut de l'ordre {order_id} : {status}")

                if status != 'pending':
                    return status
                elif time.time() - start_time > timeout:
                    logging.warning(f"Timeout atteint lors de la vérification de l'ordre {order_id}.")
                    return status
                else:
                    logging.info(
                        f"L'ordre {order_id} est toujours en attente. Nouvelle vérification dans {check_interval} secondes.")
                    time.sleep(check_interval)
        except Exception:
            logging.exception(f"Erreur lors de la vérification de l'ordre {order_id}.")
            raise

    def get_position_by_order_id(self, order_id: int, timeout: int = 30, check_interval: int = 5) -> Optional[
        Dict[str, Any]]:
        """
        Retrieve the position associated with the given order_id.

        Args:
            order_id (int): The order ID to check.
            timeout (int): Maximum time (in seconds) to wait for the position.
            check_interval (int): Time (in seconds) between each check.

        Returns:
            Optional[Dict[str, Any]]: The position data or None if not found.

        Raises:
            Exception: If checking fails.
        """
        logging.info(f"Vérification de la position pour l'ordre avec ID : {order_id}")
        start_time = time.time()
        try:
            while True:
                trade = self.xtb_client.get_position_by_order_id(order_id)
                if trade:
                    filtered_data = {k: v for k, v in trade.items() if v is not None}
                    logging.info(f"Position trouvée pour l'ordre {order_id} : position {trade['position']}")
                    return filtered_data
                elif time.time() - start_time > timeout:
                    logging.warning(f"Timeout atteint lors de la vérification de la position pour l'ordre {order_id}.")
                    return None
                else:
                    logging.info(
                        f"Aucune position trouvée pour l'ordre {order_id}. Nouvelle vérification dans {check_interval} secondes.")
                    time.sleep(check_interval)
        except Exception:
            logging.exception(f"Erreur lors de la vérification de la position pour l'ordre {order_id}.")
            raise

    def get_position(self, position_id: int, order_id: int, timeout: int = 30, check_interval: int = 5):
        """
        Retrieve the position associated with the given order_id.

        Args:
            position_id (int): The order ID to check.
            timeout (int): Maximum time (in seconds) to wait for the position.
            check_interval (int): Time (in seconds) between each check.

        Returns:
            Optional[Dict[str, Any]]: The position data or None if not found.

        Raises:
            Exception: If checking fails.
        """
        logging.info(f"Vérification de la position pour la position avec ID : {position_id}")
        start_time = time.time()
        try:
            while True:
                trades = self.xtb_client.get_today_history()
                if trades:
                    position = [pos for pos in trades if (
                                str(pos['position']) == str(position_id) or str(order_id) in str(pos['customComment']))]
                    if position:
                        return position[0]
                    elif time.time() - start_time > timeout:
                        logging.warning(f"Timeout atteint lors de la vérification de la position  {position_id}.")
                        return None
                    else:
                        logging.info(
                            f"Aucune position trouvée pour la position  {position_id}. Nouvelle vérification dans {check_interval} secondes.")
                        time.sleep(check_interval)
        except Exception:
            logging.exception(f"Erreur lors de la vérification de la position pour la position  {position_id}.")
            raise

    def check_tradingview_signal(
            self,
            symbol: str,
            action_type: str,
            position_type: Optional[str] = None,
            interval: str = Interval.INTERVAL_5_MINUTES
    ) -> bool:
        """
        Obtenir le signal TradingView pour le symbole donné.

        Args:
            symbol (str): Le symbole de l'instrument.
            action_type (str): Le type d'action ('open' ou 'close').
            position_type (Optional[str]): Le type de position ('long' ou 'short').
            interval (str): L'intervalle à utiliser.

        Returns:
            bool: True si le signal est favorable, False sinon.
        """
        # Déterminer 'screener' et 'exchange' en fonction du symbole
        if symbol in ['EURUSD', 'EURAUD', 'EURGBP']:
            screener = 'forex'
            exchange = 'FX_IDC'
        elif symbol in ['BTCUSD', 'BTCUSDT27Z2024', 'BITCOIN']:
            screener = 'crypto'
            exchange = 'BINANCE'
            # Ajuster le symbole pour correspondre à TradingView
            if symbol == 'BTCUSDT27Z2024' or symbol == 'BITCOIN':
                symbol = 'BTCUSDT'
        else:
            # Valeurs par défaut si le symbole n'est pas reconnu
            screener = 'forex'
            exchange = 'FX_IDC'

        logging.info(
            f"Obtention du signal TradingView pour le symbole : {symbol}, action_type: {action_type}, interval: {interval}, position_type: {position_type}")
        try:
            handler = TA_Handler(
                symbol=symbol,
                screener=screener,
                exchange=exchange,
                interval=interval
            )
            analysis = handler.get_analysis()
            logging.info(f"Analyse TradingView : {analysis.summary}")
            recommendation = analysis.summary['RECOMMENDATION']
            logging.info(f"Recommandation de TradingView pour {symbol}: {recommendation}")

            if action_type == 'open':
                if (recommendation in ['BUY', 'STRONG_BUY'] and position_type == 'long') or \
                        (recommendation in ['SELL', 'STRONG_SELL'] and position_type == 'short'):
                    return True
                else:
                    return False
            elif action_type == 'close':
                # Toujours autoriser la fermeture de position
                return True
            else:
                return False

        except Exception:
            logging.exception(f"Erreur lors de l'obtention du signal TradingView pour le symbole {symbol}.")
            return False
