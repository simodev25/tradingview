import json
import logging
import web
import itertools
from json.decoder import JSONDecodeError
from datetime import datetime
from trading_service import TradingService  # Importer le service de trading

class log:
    def __init__(self):
        self.content = ""

    def __str__(self):
        return str(self.content)

    def add(self, message):
        if len(self.content) > 0:
            self.content += "\n"

        self.content = "{}{}: {}".format(
            self.content, datetime.now().strftime('%Y-%m-%d %H:%M:%S'), message)

class webhook:
    def POST(self):
        loc = "server.py:webhook:POST"
        local_log = log()

        web_data = web.data()

        # Charger le JSON reçu
        try:
            post_data = json.loads(web_data)
        except JSONDecodeError as e:
            error_message = ("{}: Requête reçue avec un JSON invalide: {}".format(loc, e))
            logging.exception(error_message)
            local_log.add("ERROR:root:{}:\n{}".format(error_message, web_data))
            raise web.internalerror(local_log)

        info_message = "{}: Requête reçue avec un JSON valide".format(loc)
        logging.info(info_message)
        local_log.add("INFO:ROOT:{}:\n{}".format(info_message, json.dumps(post_data, indent=2, sort_keys=True)))

        # Appel au service de trading
        trading_service = TradingService()  # Créer une instance du service de trading
        try:
            order_id = trading_service.process_order(post_data)

        except Exception as e:
            error_message = ("{}: Erreur lors du traitement de la commande: {}".format(loc, e))
            logging.exception(error_message)
            local_log.add("ERROR:root:{}".format(error_message))
            raise web.internalerror(local_log)

        # Répondre à la requête POST avec le log
        web.header("Content-Type", "text/plain")
        return local_log
# Charger la liste des tokens d'accès et définir les URLs des webhooks pour chacun
try:
    with open("access_tokens.json") as access_tokens_json:
        access_tokens = json.load(access_tokens_json)
except JSONDecodeError as e:
    logging.exception("{}: Impossible de lire les tokens depuis access_tokens.json: {}".format(loc, e))
    raise
# Configurer les paramètres de logging
logging.basicConfig(level=logging.INFO)
loc = "server.py"

urls = tuple(itertools.chain.from_iterable(
    ["/webhook/{}".format(token)] + ["webhook"] for token in access_tokens))

# Configurer le serveur
app = web.application(urls, globals())

if __name__ == "__main__":
    # Démarrer le serveur
    logging.info("{}: Démarrage du serveur".format(loc))
    app.run()
