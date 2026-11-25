import json
import os
import sys
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from figchat_kit import Door, draft, until, voice_on  # noqa: E402

FIXTURES = os.path.join(HERE, "fixtures")
BOX_DRAWING = "│├└─┌┐┘┬┴┼╰╭"


def fixture(name):
    with open(os.path.join(FIXTURES, name)) as fh:
        return json.load(fh)


class Report:
    def __init__(self, name):
        self.name = name
        self.failures = []
        self.notes = []

    def check(self, ok, what):
        if not ok:
            self.failures.append(what)
        return ok

    def note(self, what):
        self.notes.append(what)
        print("  " + what)

    def run(self, label, fn):
        print("- " + label)
        try:
            fn()
        except Exception as e:
            self.failures.append("%s: %s" % (label, "".join(traceback.format_exception_only(type(e), e)).strip()))

    def finish(self):
        for n in self.failures:
            print("FAIL " + n)
        print("%s: %s (%d failures)" % (self.name, "ok" if not self.failures else "FAILED", len(self.failures)))
        sys.exit(1 if self.failures else 0)


def bundle_arg():
    if len(sys.argv) < 2:
        sys.exit("usage: %s <figchat-shell bundle>" % sys.argv[0])
    return os.path.abspath(sys.argv[1])
