"""
Read an ESP32-CAM MJPEG stream manually with requests and display frames with OpenCV.

Stream URL format: http://<ip>:81/stream
"""

import sys

import cv2
import numpy as np
import requests

# ESP32-CAM MJPEG endpoint (replace <ip> with your board's IP address)
stream_url = "http://10.2.10.176:81/stream"

JPEG_SOI = b"\xff\xd8"  # JPEG start of image
JPEG_EOI = b"\xff\xd9"  # JPEG end of image

CHUNK_SIZE = 4096
MAX_BUFFER = 2 * 1024 * 1024  # cap buffer if stream desyncs


def main() -> None:
    """Stream MJPEG bytes, decode JPEG frames, and show them until the user quits."""
    # OpenCV / numpy use native bindings; static analyzers may not list all members.
    # pylint: disable=no-member
    window_name = "ESP32-CAM MJPEG (requests)"
    buffer = b""

    try:
        with requests.get(stream_url, stream=True, timeout=10) as response:
            try:
                response.raise_for_status()
            except requests.exceptions.HTTPError as exc:
                print(f"Error: bad HTTP response from {stream_url}", file=sys.stderr)
                print(exc, file=sys.stderr)
                sys.exit(1)

            for chunk in response.iter_content(chunk_size=CHUNK_SIZE):
                if not chunk:
                    continue
                buffer += chunk
                if len(buffer) > MAX_BUFFER:
                    buffer = buffer[-MAX_BUFFER // 2 :]

                while True:
                    start = buffer.find(JPEG_SOI)
                    if start == -1:
                        break
                    end = buffer.find(JPEG_EOI, start + len(JPEG_SOI))
                    if end == -1:
                        buffer = buffer[start:]
                        break

                    frame_bytes = buffer[start : end + len(JPEG_EOI)]
                    buffer = buffer[end + len(JPEG_EOI) :]

                    arr = np.frombuffer(frame_bytes, dtype=np.uint8)
                    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                    if frame is None:
                        continue

                    cv2.imshow(window_name, frame)
                    key = cv2.waitKey(1) & 0xFF
                    if key == ord("q"):
                        return
    except requests.exceptions.RequestException as exc:
        print(f"Error: could not read stream at {stream_url}", file=sys.stderr)
        print(exc, file=sys.stderr)
    except KeyboardInterrupt:
        pass
    finally:
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
