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
from sqlalchemy import func

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s [%(levelname)s] %(message)s',
                    datefmt='%Y-%m-%d %H:%M:%S')


class Dashboard:
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
        engine = create_engine('postgresql+psycopg2://trades:trades@localhost:5432/trades', echo=False,
                               connect_args={'options': '-csearch_path={}'.format("trades_schema")})
        Base.metadata.create_all(engine)  # Crée les tables si elles n'existent pas encore
        Session = sessionmaker(bind=engine)
        self.session = Session()  # Initialise la session ici

    def get_positions(self, start=0, end=0, days=0, hours=0, minutes=0, timeout=30, check_interval=5):

        start_time = time.time()
        try:
            while True:
                trades = self.xtb_client.get_today_history()
                if trades:
                    return trades
                elif time.time() - start_time > timeout:
                    logging.warning(
                        f"Timeout atteint lors de la vérification de la position pour .")
                    return False  # Retourne False si aucune position n'a été trouvée
                else:
                    logging.info(
                        f"Aucune position trouvée . Nouvelle vérification dans {check_interval} secondes.")
                    time.sleep(check_interval)
        except Exception as e:
            logging.exception(f"Erreur lors de la vérification de la positions.")
            raise

    def get_closed_orders(self, date):

        logging.info(f"Récupération de tous les Ordres avec statut 'closed'")
        # Obtenir la date du jour au format 'YYYY-MM-DD'
        today_date = date.strftime('%Y-%m-%d')

        try:
            trade = (self.session.query(TradeOrder).filter_by(status='closed')
                     .filter(func.date(TradeOrder.time) == today_date).all())
            if trade:
                logging.info(f"Ordre trouvé avec statut 'closed' : {trade}")
                return trade
            else:
                logging.info(f"Aucun ordres avec statut 'closed' trouvé ")
                return None
        except Exception as e:
            logging.exception(f"Erreur lors de la récupération de l'ordres.")
            raise


if __name__ == "__main__":

    dashboard = Dashboard()
    orders = dashboard.get_closed_orders(datetime.now())
    positions = dashboard.get_positions()

    for order in orders:
        position_id = '670183313'
        logging.info(f"position_id: {position_id}")
        position = [pos for pos in positions if str(pos['position']) == str(position_id)]

        print(position)

