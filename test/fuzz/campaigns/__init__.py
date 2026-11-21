from campaigns.audio import Audio
from campaigns.composer import Composer
from campaigns.gestures import Gestures
from campaigns.network import Network
from campaigns.paced import Paced
from campaigns.scale import Scale

ALL = {c.name: c for c in (Composer(), Gestures(), Network(), Audio(), Paced(), Scale())}
