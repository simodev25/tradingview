from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# Créer une base de données SQLite
engine = create_engine('sqlite:///trades.db', echo=True)

# Définir une base pour nos modèles
Base = declarative_base()

# Modèle pour les ordres de trading
class TradeOrder(Base):
    __tablename__ = 'trade_orders'
    id = Column(Integer, primary_key=True)
    ticker = Column(String(10), nullable=False)
    order_id = Column(String(20), nullable=False)
    close_price = Column(Float, nullable=False)
    open_price = Column(Float, nullable=False)
    high_price = Column(Float, nullable=False)
    low_price = Column(Float, nullable=False)
    volume = Column(Integer, nullable=False)
    time = Column(DateTime, nullable=False)
    position_size = Column(Float, nullable=False)
    order_comment = Column(String(100), nullable=True)
    action = Column(String(10), nullable=False)
    price = Column(Float, nullable=False)
    units = Column(Integer, nullable=False)
    entry_price = Column(Float, nullable=False)

# Créer toutes les tables (si elles n'existent pas déjà)
Base.metadata.create_all(engine)

# Créer une session pour interagir avec la base de données
Session = sessionmaker(bind=engine)
session = Session()

# Insertion d'une nouvelle ligne dans la base de données
new_trade = TradeOrder(
    ticker='EURUSD',
    order_id='11111',
    close_price=1.09692,
    open_price=1.09692,
    high_price=1.09692,
    low_price=1.09692,
    volume=1,
    time=datetime.utcnow(),
    position_size=-1,
    order_comment='(SL:1.0971-TP:1.0967)',
    action='Short',
    price=1.0969200000000001,
    units=1,
    entry_price=1.0969200000000001
)

# Ajouter la ligne dans la base et valider la transaction
session.add(new_trade)
session.commit()

print("Trade inserted successfully!")
