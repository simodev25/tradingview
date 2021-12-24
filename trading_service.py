import logging
import os
import json
import time
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from xtb import XTB  # Assurez-vous que la classe XTB est dans le fichier xtb.py
from models_order import TradeOrder, \
    Base  # Assurez-vous que TradeOrder et Base sont correctement définis dans models_order.py

status_mapping = {
    0: 'error',
    1: 'pending',
    3: 'The transaction has been executed successfully',
    4: 'The transaction has been rejected'
}
instrument_mapping = {
    "EURUSD": "EURUSD",
    "BTCUSD": "BITCOIN",
    "BTCUSDT27Z2024": "BITCOIN"
}
instrument_round_mapping = {
    "EURUSD": 10000,
    "BTCUSD": 10,
    "BTCUSDT27Z2024": 10,
    "BITCOIN": 10
}
instrument_ajoustement_mapping = {
    "EURUSD": 10000,
    "BTCUSD": 10,
    "BITCOIN": 10
}
# Configuration du logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s [%(levelname)s] %(message)s',
                    datefmt='%Y-%m-%d %H:%M:%S')


class TradingService:
    def __init__(self):
        logging.info("Initialisation du service de trading.")

        # Initialiser le client XTB avec les identifiants
        self.xtb_id = os.getenv('API_USER')
        self.xtb_password = os.getenv('API_PASSWORD')
        if not self.xtb_id or not self.xtb_password:
            logging.error("Les variables d'environnement API_USER et API_PASSWORD doivent être définies.")
            raise SystemExit("Variables d'environnement manquantes.")

        logging.info("Initialisation du client XTB avec l'ID utilisateur.")
        self.xtb_client = XTB(ID=self.xtb_id, PSW=self.xtb_password)

        # Configuration de la base de données
        engine = create_engine('sqlite:///trades.db', echo=False)
        Base.metadata.create_all(engine)  # Crée les tables si elles n'existent pas encore
        Session = sessionmaker(bind=engine)
        self.session = Session()  # Initialise la session ici

    def parse_order_comment(self,instrument, order_comment):
        """
        Analyse le champ order_comment pour extraire SL, TP et order_id.
        """
        logging.info("Analyse du commentaire de l'ordre pour extraire SL/TP et l'ID de l'ordre.")
        sl, tp, order_id = None, None, None
        # Récupérer le facteur d'arrondi depuis le mapping
        round_factor = instrument_round_mapping.get(instrument, 1)  # Valeur par défaut = 1

        if "SL:" in order_comment and "TP:" in order_comment and "ID:" in order_comment:
            try:
                order_id = int(order_comment.split("ID:")[1].split('-')[0])
                sl = float(order_comment.split("SL:")[1].split('-')[0])
                tp = float(order_comment.split("TP:")[1].split(')')[0])
                tp = int(tp * round_factor) / round_factor
                sl = int(sl * round_factor) / round_factor
            except Exception as e:
                logging.exception("Erreur lors de l'analyse de SL, TP et order_id à partir du commentaire de l'ordre.")
        elif "ID:" in order_comment:
            try:
                order_id = int(order_comment.split("ID:")[1].split('-')[0])
            except Exception as e:
                logging.exception("Erreur lors de l'analyse de order_id à partir du commentaire de l'ordre.")
        else:
            logging.warning("Pas d'informations de SL/TP ou d'ID de l'ordre extraites du commentaire.")

        return sl, tp, order_id

    def fill_defaults(self, post_data):
        logging.info("Remplissage des paramètres par défaut pour les données reçues.")
        logging.debug(f"Données reçues : {post_data}")

        instrument = instrument_mapping.get(post_data.get("ticker"))
        if not instrument:
            logging.error("L'instrument est manquant dans les données reçues.")
            raise ValueError("L'instrument est requis.")

        price = float(post_data.get("price", 0))
        units = float(post_data.get("units", 1))
        position_size = float(post_data.get("position_size", 1))
        order_comment = post_data.get("order_comment", "")
        trading_type = post_data.get("trading_type", "practice")
        time_str = post_data.get("time")
        if not time_str:
            logging.error("Le temps est manquant dans les données reçues.")
            raise ValueError("Le temps est requis.")

        # Analyse du commentaire pour extraire SL, TP et order_id
        sl, tp, order_id = self.parse_order_comment(instrument,order_comment)

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
        }

    def translate(self, post_data):
        logging.info("Traduction des données reçues.")
        instrument = post_data.get("instrument")
        ticker = post_data.get("ticker")
        if instrument:
            logging.info(f"Instrument fourni : {instrument}")
        elif ticker:
            logging.info(f"Ticker fourni : {ticker}")
            if len(ticker) == 6:
                instrument = "{}{}".format(ticker[:3], ticker[3:])
                post_data["instrument"] = instrument
                logging.info(f"Ticker traduit en instrument : {ticker} -> {instrument}")
            else:
                logging.error(f"Longueur du ticker invalide : {ticker}")
                raise ValueError("Longueur du ticker invalide.")
        else:
            logging.error("Ni instrument ni ticker fourni dans les données.")
            raise ValueError("Instrument ou ticker requis.")

        return post_data

    def determine_action(self, action_str):
        """
        Détermine l'action à partir de la chaîne action.
        Retourne (cmd, action_type)
        """
        action_str = action_str.lower()
        if action_str == "long":
            cmd = 0  # Achat
            logging.info("Action détectée : Achat.")
            return cmd, 'open'
        elif action_str == "short":
            cmd = 1  # Vente
            logging.info("Action détectée : Vente.")
            return cmd, 'open'
        elif action_str == "long_exit" or action_str == "short_exit":
            logging.info("Action détectée : Sortie de position.")
            return None, 'close'
        else:
            logging.error(f"Action invalide reçue : {action_str}")
            raise ValueError("Action non valide : 'long', 'short', 'long_exit' ou 'short_exit' attendu.")

    def process_order(self, post_data):
        logging.info("Traitement de la commande de trading.")
        try:
            # translated_data = self.translate(post_data)
            filled_data = self.fill_defaults(post_data)
        except Exception as e:
            logging.exception("Impossible de traduire ou de remplir les paramètres par défaut.")
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

        action = post_data.get("action", "").lower()
        cmd, action_type = self.determine_action(action)

        if action_type == 'close':
            # Action de fermeture de position
            order_id = filled_data.get('order_id')
            order = self.get_order(order_id)

            if not order:
                logging.error("L'ID de l'ordre est requis pour sortir d'une position.")
                raise ValueError("L'ID de l'ordre est requis pour sortir d'une position.")

            logging.info(
                f"Close position order_id:{order_id} order_id_xtb {order.order_id_xtb} position {order.position_id_xtb} ")

            position = self.get_position_by_order_id(order.order_id_xtb)
            if position:
                success = self.close_position(order.position_id_xtb, position['symbol'],
                                              position['cmd'],
                                              position['volume'],
                                              position['open_price'],
                                              position['customComment'])

            self.update_trade_in_db(order_id, status='closed')
            return {'order_id': order_id, 'order_id_xtb': order.order_id_xtb, 'position_id': order.position_id_xtb,
                    'status': 'closed'}
        elif action_type == 'open':
            # Procéder à l'ouverture d'un trade
            logging.info(f"Envoi de la commande à l'API XTB : cmd={cmd}, symbol={symbol}, volume={volume}")
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

            # Appeler check_trade pour obtenir le statut réel de l'ordre
            status = self.check_trade(order_id_xtb)
            filled_data['request_status'] = status

            # Définir filled_data['status'] en fonction du statut obtenu
            if status == 'The transaction has been executed successfully':
                filled_data['status'] = 'open'
            elif status in ['error', 'The transaction has been rejected']:
                filled_data['status'] = 'error'
            else:
                filled_data['status'] = status  # Pour les autres statuts, par exemple 'pending'

            # Si le statut est 'open', récupérer les informations de position
            if filled_data['status'] == 'open':
                position = self.get_position_by_order_id(order_id_xtb)
                logging.info(f"Informations de la position : {position}")
                filled_data['position_id_xtb'] = position['position']
                filled_data['position'] = json.dumps(position)
            else:
                # Si l'ordre n'a pas été exécuté avec succès, on peut définir position_id_xtb et position à None
                filled_data['position_id_xtb'] = None
                filled_data['position'] = None

            # Insérer les données de l'ordre dans la base de données
            self.insert_trade_to_db(filled_data)

            # Retourner le statut approprié
            return {'order_id': order_id_xtb, 'status': filled_data['status']}

    def insert_trade_to_db(self, trade_data):
        logging.info("Insertion de l'ordre dans la base de données.")
        try:
            # Créer une nouvelle entrée pour l'ordre de trading
            new_trade = TradeOrder(
                instrument=trade_data['instrument'],
                units=int(trade_data['units']),
                price=float(trade_data['price']),
                position_size=float(trade_data.get('position_size', 0)),
                order_comment=trade_data.get('order_comment', ""),
                trading_type=trade_data.get('trading_type', "practice"),
                tp=float(trade_data.get('tp')) if trade_data.get('tp') is not None else None,
                sl=float(trade_data.get('sl')) if trade_data.get('sl') is not None else None,
                order_id=trade_data.get('order_id'),
                order_id_xtb=trade_data.get('order_id_xtb'),
                position_id_xtb=trade_data.get('position_id_xtb'),
                time=datetime.strptime(trade_data['time'], "%Y-%m-%dT%H:%M:%SZ"),
                status=trade_data.get('status', 'close'),
                request_status=trade_data.get('request_status', 'open'),
                position=str(trade_data.get('position'))
            )

            # Ajouter l'entrée à la session et valider la transaction
            self.session.add(new_trade)
            self.session.commit()
            logging.info("Ordre inséré avec succès dans la base de données.")
        except Exception as e:
            logging.error(f"Erreur lors de l'insertion de l'ordre dans la base de données : {e}")
            self.session.rollback()
            raise

    def update_trade_in_db(self, order_id, **kwargs):
        """
        Met à jour l'ordre dans la base de données avec l'order_id donné et les nouvelles valeurs.
        """
        logging.info(f"Mise à jour de l'ordre dans la base de données pour l'ID : {order_id}")
        try:
            trade = self.session.query(TradeOrder).filter_by(order_id=order_id).one()
            for key, value in kwargs.items():
                setattr(trade, key, value)
            self.session.commit()
            logging.info(f"Ordre {order_id} mis à jour avec succès dans la base de données.")
        except Exception as e:
            logging.exception(f"Erreur lors de la mise à jour de l'ordre {order_id} dans la base de données.")
            self.session.rollback()
            raise

    def get_order(self, order_id):
        """
        Récupère l'order_id_xtb depuis la base de données en utilisant order_id,
        seulement si le statut de l'ordre est 'open'.

        :param order_id: L'ID de l'ordre local à rechercher.
        :return: L'order_id_xtb correspondant ou None si aucun n'est trouvé ou si le statut n'est pas 'open' .
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
        except Exception as e:
            logging.exception(f"Erreur lors de la récupération de l'ordre avec l'order_id {order_id}.")
            raise

    def close_position(self, order_id, symbol,
                       cmd,
                       volume,
                       price,
                       order_comment):
        """
        Ferme la position avec l'order_id donné.
        """
        logging.info(f"Fermeture de la position avec l'ID de l'ordre : {order_id}")
        try:
            success, id = self.xtb_client.close_Trade(order_id,
                                                      symbol,
                                                      cmd,
                                                      volume,
                                                      price,
                                                      order_comment)
            print(success)
            if success:
                logging.info(f"Position {order_id} fermée avec succès.")
            else:
                logging.error(f"Échec de la fermeture de la position {order_id}.")
                raise Exception(f"Échec de la fermeture de la position {order_id}.")
        except Exception as e:
            logging.exception(f"Erreur lors de la fermeture de la position {order_id}.")
            raise
        return success

    def check_trade(self, order_id, timeout=30, check_interval=5):
        """
        Vérifie l'état de l'ordre avec ID donné. Si le statut est 'pending',
        la méthode re-vérifie périodiquement jusqu'à ce que le statut change ou que le délai soit dépassé.

        :param order_id: ID de l'ordre à vérifier.
        :param timeout: Temps maximum (en secondes) pour attendre un changement de statut.
        :param check_interval: Intervalle de temps (en secondes) entre chaque vérification.
        :return: Le statut final de l'ordre.
        """
        logging.info(f"Vérification de l'état de l'ordre avec ID : {order_id}")
        start_time = time.time()
        try:
            while True:
                status_code = self.xtb_client.check_Trade(int(order_id))
                status = status_mapping.get(status_code, 'Unknown status')
                logging.info(f"Statut de l'ordre {order_id} : {status}")

                if status != 'pending':
                    return status
                elif time.time() - start_time > timeout:
                    logging.warning(f"Timeout atteint lors de la vérification de l'ordre {order_id}.")
                    return status  # Retourne le statut actuel même si c'est 'pending'
                else:
                    logging.info(
                        f"L'ordre {order_id} est toujours en attente. Nouvelle vérification dans {check_interval} secondes.")
                    time.sleep(check_interval)
        except Exception as e:
            logging.exception(f"Erreur lors de la vérification de l'ordre {order_id}.")
            raise

    def get_position_by_order_id(self, order_id, timeout=30, check_interval=5):
        """
        Vérifie l'existence d'une position pour l'ordre avec ID donné. Si la position n'existe pas,
        la méthode re-vérifie périodiquement jusqu'à ce que la position soit trouvée ou que le délai soit dépassé.

        :param order_id: ID de l'ordre à vérifier.
        :param timeout: Temps maximum (en secondes) pour attendre l'apparition d'une position.
        :param check_interval: Intervalle de temps (en secondes) entre chaque vérification.
        :return: La position associée à l'ordre ou False si aucune position n'a été trouvée après le timeout.
        """
        logging.info(f"Vérification de la position pour l'ordre avec ID : {order_id}")
        start_time = time.time()
        try:
            while True:
                trade = self.xtb_client.get_position_by_order_id(int(order_id))
                if trade:
                    filtered_data = {k: v for k, v in trade.items() if v is not None}
                    trade = filtered_data
                    logging.info(f"Position trouvée pour l'ordre {order_id} : position {trade['position']}")
                    return trade
                elif time.time() - start_time > timeout:
                    logging.warning(f"Timeout atteint lors de la vérification de la position pour l'ordre {order_id}.")
                    return False  # Retourne False si aucune position n'a été trouvée
                else:
                    logging.info(
                        f"Aucune position trouvée pour l'ordre {order_id}. Nouvelle vérification dans {check_interval} secondes.")
                    time.sleep(check_interval)
        except Exception as e:
            logging.exception(f"Erreur lors de la vérification de la position pour l'ordre {order_id}.")
            raise

