from campaigns.composer import Composer
from campaigns.gestures import Gestures
from campaigns.network import Network

ALL = {c.name: c for c in (Composer(), Gestures(), Network())}
