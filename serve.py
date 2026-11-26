"""Serve FuelTrack with the upstream project's YOLO crop and EasyOCR approach."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import json
from pathlib import Path
import re
from threading import Lock


def load_recognizer(weights, labels, gpu):
    import easyocr
    from PIL import Image, ImageOps
    from ultralytics import YOLO

    detector = YOLO(str(weights))
    reader = easyocr.Reader(["en"], gpu=gpu)
    inference = Lock()

    def recognize(data):
        with Image.open(BytesIO(data)) as original:
            if original.width * original.height > 8_000_000:
                raise ValueError("Photo is too large")
            image = ImageOps.exif_transpose(original).convert("RGB")
        with inference:
            result = detector.predict(image, verbose=False, device=0 if gpu else "cpu")[0]
            for index in result.boxes.conf.argsort(descending=True).tolist():
                box = result.boxes[index]
                if labels and detector.names[int(box.cls.item())].casefold() not in labels:
                    continue
                region = image.crop(tuple(box.xyxy[0].tolist()))
                if min(region.size) < 4:
                    continue
                stream = BytesIO()
                region.save(stream, format="PNG")
                readings = reader.readtext(stream.getvalue(), allowlist="0123456789.",
                                           detail=1, paragraph=False)
                candidates = [(confidence, value) for _, value, confidence in readings
                              if confidence >= 0.4 and re.fullmatch(r"\d+(?:\.\d+)?", value)]
                if candidates:
                    return float(max(candidates)[1])
        return None

    return recognize


class Handler(SimpleHTTPRequestHandler):
    recognize = None

    def do_HEAD(self):
        if self.path != "/api/odometer":
            super().do_HEAD()
            return
        if self.recognize is None:
            self.send_error(404)
            return
        self.send_response(204)
        self.send_header("X-FuelTrack-OCR", "available")
        self.end_headers()

    def do_POST(self):
        if self.path != "/api/odometer" or self.recognize is None:
            self.send_error(404)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 4_000_000:
                self.send_error(413)
                return
            reading = self.recognize(self.rfile.read(size))
        except (ValueError, OSError):
            self.send_error(400, "Invalid image")
            return
        payload = json.dumps({"odometer": reading}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--weights", type=Path, help="Trained odometer YOLOv8 detection checkpoint")
    parser.add_argument("--label", action="append", default=[], help="Only scan this detection label (repeatable)")
    parser.add_argument("--gpu", action="store_true")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    if args.weights:
        if not args.weights.is_file():
            parser.error("The trained detection checkpoint does not exist")
        Handler.recognize = staticmethod(load_recognizer(args.weights, {x.casefold() for x in args.label}, args.gpu))
    root = Path(__file__).resolve().parent / "dist"
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(root)))
    print(f"FuelTrack is available at http://127.0.0.1:{args.port}", flush=True)
    server.serve_forever()
