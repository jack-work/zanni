import json
import os
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
TEST = os.path.dirname(HERE)
MAIN = "c0ffee01" * 4
ADMIN = "gluck"


class Stack:
    """The mock door, and optionally a real figaro-gateway behind a signing edge proxy.

    `url` is what the page loads. With a gateway the page talks /chat/door
    to the edge, which signs the request and hands it to the gateway, which
    dials the mock door; fault ops go to the gateway's --fault-socket.
    """

    def __init__(self, bundle, step=15, gateway=None, fixture=None, speech=False, door_flags=(), door_url=None, token_file=None):
        self.door_url = door_url
        self.token_file = token_file
        self.tmp = tempfile.mkdtemp(prefix="figfuzz-")
        env = dict(os.environ, FIGCHAT_BARE_ORIGIN="1")
        if fixture:
            env["FIGCHAT_FIXTURE"] = fixture
        if door_url:
            self.door = None
            self.door_port = 0
            self.base = ""
        else:
            self.door = subprocess.Popen(["node", os.path.join(TEST, "figchat-server.js"), bundle, str(step), *map(str, door_flags)], stdout=subprocess.PIPE, text=True, env=env)
            self.door_port = int(self.door.stdout.readline())
            self.base = "http://127.0.0.1:%d" % self.door_port
        self.gateway = None
        self.edge = None
        self.faults = None
        self.speech = None
        self.speech_socket = os.path.join(self.tmp, "no-speech.sock")
        if speech:
            self._speech()
        self.url = self.base + "/chat/"
        if gateway:
            self._gateway(bundle, gateway)

    def _speech(self):
        kit = os.environ.get("FIGFUZZ_SPEECH_KIT")
        if not kit:
            raise RuntimeError("FIGFUZZ_SPEECH_KIT must name a directory holding figaro-forms packages/bridge/test/fake-speech.ts and a node_modules with ws")
        self.speech = subprocess.Popen(["node", os.path.join(HERE, "speech.mjs"), kit, ""], stdout=subprocess.PIPE, text=True)
        self.speech_socket, port = self.speech.stdout.readline().split()
        self.speech_port = int(port)

    def speech_call(self, path="/state", body=None):
        req = urllib.request.Request("http://127.0.0.1:%d%s" % (self.speech_port, path), data=json.dumps(body).encode() if body is not None else None, method="POST" if body is not None else "GET")
        return json.load(urllib.request.urlopen(req, timeout=5))

    def _gateway(self, bundle, binary):
        secret_file = os.path.join(self.tmp, "edge")
        with open(secret_file, "w") as fh:
            fh.write(secrets.token_hex(32))
        os.chmod(secret_file, 0o600)
        secret = open(secret_file).read()
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]
        self.faults = None if self.door_url else os.path.join(self.tmp, "faults.sock")
        self.gateway_log = open(os.path.join(self.tmp, "gateway.log"), "w")
        argv = [binary, "--door-url", self.door_url or "ws://127.0.0.1:%d/door" % self.door_port, "--speech-socket", self.speech_socket,
                "--admin", ADMIN, "--store", "gluck", "--port", str(port), "--peer", "127.0.0.1", "--edge-secret-file", secret_file, "--no-attach"]
        argv += ["--door-token-file", self.token_file] if self.door_url else ["--fault-socket", self.faults]
        self.gateway = subprocess.Popen(argv, stdout=self.gateway_log, stderr=subprocess.STDOUT, env=dict(os.environ, CREDENTIALS_DIRECTORY=self.tmp))
        end = time.time() + 15
        while time.time() < end:
            if self.door_url or os.path.exists(self.faults):
                try:
                    with socket.socket() as s:
                        s.connect(("127.0.0.1", port))
                    break
                except OSError:
                    pass
            if self.gateway.poll() is not None:
                raise RuntimeError("gateway exited: " + open(self.gateway_log.name).read())
            time.sleep(0.05)
        self.edge = subprocess.Popen(["node", os.path.join(HERE, "edge.js"), os.path.abspath(bundle), str(port), secret, ADMIN], stdout=subprocess.PIPE, text=True)
        self.edge_port = int(self.edge.stdout.readline())
        self.url = "http://127.0.0.1:%d/chat/" % self.edge_port

    def fault(self, op):
        if not self.faults:
            raise RuntimeError("no gateway in this stack")
        with socket.socket(socket.AF_UNIX) as s:
            s.settimeout(5)
            s.connect(self.faults)
            s.sendall((json.dumps(op) + "\n").encode())
            buf = b""
            while not buf.endswith(b"\n"):
                chunk = s.recv(4096)
                if not chunk:
                    break
                buf += chunk
        return json.loads(buf or b"{}")

    def state(self):
        return json.load(urllib.request.urlopen(self.base + "/__state"))

    def turns(self, aria=MAIN):
        return json.load(urllib.request.urlopen(self.base + "/__turns/" + aria))

    def gateway_log_text(self):
        if not self.gateway:
            return ""
        self.gateway_log.flush()
        return open(self.gateway_log.name).read()

    def stop(self):
        for p in (self.edge, self.gateway, self.speech, self.door):
            if p:
                p.terminate()
        for p in (self.edge, self.gateway, self.speech, self.door):
            if p:
                try:
                    p.wait(5)
                except subprocess.TimeoutExpired:
                    p.kill()
