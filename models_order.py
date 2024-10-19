from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, BigInteger
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime


# Base de modèle pour SQLAlchemy
Base = declarative_base()

# Modèle pour la table TradeOrder
class TradeOrder(Base):
    __tablename__ = 'trade_orders'

    order_id = Column(Integer, primary_key=True)
    instrument = Column(String(10), nullable=False)
    action = Column(String(10), nullable=False)
    units = Column(Float, nullable=False)
    price = Column(Float, nullable=False)
    position_size = Column(Float, nullable=False)
    order_comment = Column(String(100), nullable=True)
    trading_type = Column(String(20), nullable=True)  # "practice" ou "real"
    tp = Column(Float, nullable=True)  # Take Profit
    sl = Column(Float, nullable=True)  # Stop Loss
    order_id_xtb = Column(String(40), nullable=True)
    position_id_xtb = Column(String(40), nullable=True)
    time = Column(DateTime, nullable=False, default=datetime.utcnow)
    status = Column(String(20), nullable=False)
    request_status = Column(String(200), nullable=False)
    interval = Column(String(20), nullable=False)
    cmd = Column(Integer, nullable=False)  # Command type
    order2 = Column(Integer, nullable=True)  # Deuxième identifiant de l'ordre
    custom_comment = Column(String(200), nullable=True)  # Commentaire personnalisé
    commission = Column(Float, nullable=True)  # Commission
    storage = Column(Float, nullable=True)  # Storage
    margin_rate = Column(Float, nullable=True)  # Taux de marge
    close_price = Column(Float, nullable=True)  # Prix de clôture
    open_price = Column(Float, nullable=False)  # Prix d'ouverture
    nominal_value = Column(Float, nullable=True)  # Valeur nominale
    profit = Column(Float, nullable=True)  # Profit
    closed = Column(Boolean, nullable=False, default=False)  # Indicateur de clôture
    timestamp = Column(BigInteger, nullable=False)  # Timestamp Unix
    open_time = Column(BigInteger, nullable=False)  # Open time en Unix
    open_time_string=Column(String(100), nullable=True)
    spread = Column(Float, nullable=True)  # Spread
    taxes = Column(Float, nullable=True)  # Taxes
    close_time = Column(BigInteger, nullable=True)  # close_time en Unix
    close_time_string = Column(String(100), nullable=True)  # close_time en format lisible
    def __repr__(self):
        return f"<TradeOrder(instrument='{self.instrument}', order_id='{self.order_id}', price={self.price}, action={self.trading_type})>"