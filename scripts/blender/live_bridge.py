"""The Blender Live Bridge: lets a tool outside Blender run Python in this Blender session.

Run it inside Blender (Scripting tab > Open > this file > Run Script), or start Blender with it:

    blender -P scripts/blender/live_bridge.py

It listens on http://127.0.0.1:8192 (this machine only):

    POST /   a JSON body {"code": "..."}: the code is queued and run on Blender's main thread
             (bpy is only safe there); the answer is "Command queued for execution" and nothing
             else. The code runs with separate globals and locals, so run a builder inside one
             namespace of its own: exec(compile(src, name, "exec"), ns), and read its results from
             the report file it writes (REPORT_PATH, absolute).
    GET  /   the bridge's state as JSON: how many commands ran, how many wait, the last error.

Run the script again to restart it (the old server is shut down first). To stop it:
    import bpy; bpy.app.driver_namespace["live_bridge"].stop()
"""

import json
import queue
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import bpy

HOST = "127.0.0.1"
PORT = 8192
KEY = "live_bridge"


class Bridge:
    def __init__(self):
        self.jobs = queue.Queue()
        self.ran = 0
        self.last_error = ""
        self.server = ThreadingHTTPServer((HOST, PORT), self.handler())
        self.server.daemon_threads = True
        self.thread = threading.Thread(target=self.server.serve_forever, name="live-bridge", daemon=True)

    def handler(self):
        bridge = self

        class Handler(BaseHTTPRequestHandler):
            def answer(self, status, body, kind="text/plain; charset=utf-8"):
                data = body.encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", kind)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                state = {"ok": True, "blender": bpy.app.version_string, "file": bpy.data.filepath, "ran": bridge.ran, "waiting": bridge.jobs.qsize(), "lastError": bridge.last_error}
                self.answer(200, json.dumps(state), "application/json")

            def do_POST(self):
                try:
                    length = int(self.headers.get("Content-Length") or 0)
                    code = json.loads(self.rfile.read(length).decode("utf-8")).get("code")
                except (ValueError, AttributeError):
                    code = None
                if not isinstance(code, str) or not code.strip():
                    self.answer(400, 'Send a JSON body {"code": "..."}')
                    return
                bridge.jobs.put(code)
                self.answer(200, "Command queued for execution")

            def log_message(self, *args):  # (quiet: Blender's console is not a web log)
                pass

        return Handler

    def pump(self):
        """On Blender's main thread, a few times a second: run what has been queued."""
        while True:
            try:
                code = self.jobs.get_nowait()
            except queue.Empty:
                break
            try:
                exec(compile(code, "<live_bridge>", "exec"), {"__name__": "__live_bridge__", "bpy": bpy}, {})
                self.last_error = ""
            except Exception:  # (a failed command must never stop the bridge)
                self.last_error = traceback.format_exc()
                print("[live_bridge] command failed:\n" + self.last_error)
            self.ran += 1
        return 0.1

    def start(self):
        self.thread.start()
        bpy.app.timers.register(self.pump, first_interval=0.1, persistent=True)
        print(f"[live_bridge] listening on http://{HOST}:{PORT}")

    def stop(self):
        if bpy.app.timers.is_registered(self.pump):
            bpy.app.timers.unregister(self.pump)
        self.server.shutdown()
        self.server.server_close()
        print("[live_bridge] stopped")


def main():
    old = bpy.app.driver_namespace.get(KEY)
    if old is not None:
        try:
            old.stop()
        except Exception:
            pass
    bridge = Bridge()
    bpy.app.driver_namespace[KEY] = bridge
    bridge.start()


main()
