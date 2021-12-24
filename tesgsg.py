import logging
from datetime import datetime
from xtb import XTB  # Assurez-vous que la classe XTB est dans le fichier xtb.py
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models_order import TradeOrder, Base  # Assurez-vous que TradeOrder et Base sont correctement définis dans un fichier models.py

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

        # Initialiser la base de données SQLite
        engine = create_engine('sqlite:///trades.db')
        Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine)
        self.session = self.Session()

    def fill_defaults(self, post_data):
        logging.info("Remplissage des paramètres par défaut pour les données reçues.")
        print(post_data)
        instrument = post_data["instrument"]
        price = float(post_data["price"])

        units = float(post_data.get("units", 1))
        position_size = float(post_data.get("position_size", 1))
        order_comment = post_data.get("order_comment", "")
        trading_type = post_data.get("trading_type", "practice")

        logging.info(f"Paramètres par défaut définis : instrument={instrument}, price={price}, units={units}, "
                     f"position_size={position_size}, order_comment={order_comment}, "
                     f"trading_type={trading_type}")

        return {
            "instrument": instrument,
            "units": units,
            "price": price,
            "position_size": position_size,
            "order_comment": order_comment,
            "trading_type": trading_type,
        }

    def translate(self, post_data):
        logging.info("Traduction des données reçues.")
        ticker = post_data.pop("ticker")
        if len(ticker) == 6:
            post_data["instrument"] = "{}{}".format(ticker[:3], ticker[3:])
            logging.info(f"Traduction réussie : ticker {ticker} -> instrument {post_data['instrument']}")
        else:
            logging.error(f"Tentative de traduction échouée, ticker invalide: {ticker}")
            raise ValueError("Ce ticker ne correspond pas aux attentes")

        return post_data

    def insert_trade_to_db(self, trade_data):
        logging.info("Insertion de l'ordre dans la base de données.")
        try:
            # Créer une nouvelle entrée pour l'ordre de trading
            new_trade = TradeOrder(
                ticker=trade_data['ticker'],
                order_id=trade_data['order_id'],
                close_price=float(trade_data['close_price']),
                open_price=float(trade_data['open_price']),
                high_price=float(trade_data['high_price']),
                low_price=float(trade_data['low_price']),
                volume=int(trade_data['volume']),
                time=datetime.strptime(trade_data['time'], "%Y-%m-%dT%H:%M:%SZ"),
                position_size=float(trade_data['position_size']),
                order_comment=trade_data.get('order_comment'),
                action=trade_data['action'],
                price=float(trade_data['price']),
                units=int(trade_data['units']),
                entry_price=float(trade_data['entry_price'])
            )

            # Ajouter l'entrée à la session et commiter les changements
            self.session.add(new_trade)
            self.session.commit()
            logging.info("Ordre inséré avec succès dans la base de données.")
        except Exception as e:
            logging.error(f"Erreur lors de l'insertion de l'ordre dans la base de données : {e}")
            self.session.rollback()
            raise

    def process_order(self, post_data):
        logging.info("Traitement de la commande de trading.")
        try:
            translated_data = self.translate(post_data)
            filled_data = self.fill_defaults(translated_data)
            self.insert_trade_to_db(filled_data)  # Insertion dans la base de données
        except Exception as e:
            logging.exception("Impossible de traiter l'ordre.")
            raise

        symbol = filled_data['instrument']
        volume = filled_data['units']
        price = filled_data['price']
        position_size = filled_data['position_size']
        order_comment = filled_data['order_comment']

        logging.info(f"Paramètres de trading : symbol={symbol}, volume={volume}, price={price}, "
                     f"position_size={position_size}, order_comment={order_comment}")

        # Déterminer si c'est un ordre d'achat ou de vente
        action = post_data["action"]
        if action.lower() == "long":
            cmd = 0
            logging.info(f"Action détectée : achat de {volume} unités du symbole {symbol}")
        elif action.lower() == "short":
            cmd = 1
            logging.info(f"Action détectée : vente de {volume} unités du symbole {symbol}")
        else:
            logging.error(f"Action invalide reçue: {action}")
            raise ValueError("Action non valide: 'long' ou 'short' attendu")

        # Obtenir le prix du marché et calculer les SL/TP à partir de l'ordre commenté (optionnel)
        logging.info("Obtention des informations de prix de l'ordre commenté (SL/TP).")
        sl, tp = None, None
        if "SL:" in order_comment and "TP:" in order_comment:
            sl = float(order_comment.split("SL:")[1].split('-')[0])
            tp = float(order_comment.split("TP:")[1].split(')')[0])

        else:
            logging.warning("Pas d'informations de SL/TP extraites de l'ordre commenté.")

        # Placer l'ordre via l'API XTB
        logging.info(f"Stop Loss extrait: {sl}, Take Profit extrait: {tp}")
        logging.info(f"Envoi de la commande à l'API XTB : {symbol}, cmd={cmd}, volume={volume}")
        success, order_id = self.xtb_client.make_Trade(
            symbol=symbol,
            cmd=cmd,
            transaction_type=0,
            volume=volume,
            comment=order_comment,
            sl=sl,
            tp=tp
        )

        if not success:
            logging.error(f"Échec de l'exécution de l'ordre pour le symbole {symbol}")
            raise Exception("Échec de l'exécution de l'ordre")

        logging.info(f"Ordre exécuté avec succès, ID de l'ordre: {order_id}")

        return {'order_id': order_id}
