from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

# Base de modèle pour SQLAlchemy
Base = declarative_base()

# Modèle pour la table TradeOrder
class TradeOrder(Base):
    __tablename__ = 'trade_orders'

    order_id = Column(Integer, primary_key=True)
    instrument = Column(String(10), nullable=False)
    units = Column(Integer, nullable=False)
    price = Column(Float, nullable=False)
    position_size = Column(Float, nullable=False)
    order_comment = Column(String(100), nullable=True)
    trading_type = Column(String(20), nullable=True)  # "practice" ou "real"
    tp = Column(Float, nullable=True)  # Take Profit
    sl = Column(Float, nullable=True)  # Stop Loss
    order_id_xtb = Column(String(20), nullable=False)
    position_id_xtb = Column(String(20), nullable=True)
    time = Column(DateTime, nullable=False, default=datetime.utcnow)
    status = Column(String(20), nullable=False)
    request_status = Column(String(100), nullable=False)
    position = Column(String(200), nullable=True)

    def __repr__(self):
        return f"<TradeOrder(instrument='{self.instrument}', order_id='{self.order_id}', price={self.price}, action={self.trading_type})>"