"""Private PaddleOCR-VL companion service for police-telegrams-platform.

The service accepts an image for one request, extracts reading-ordered text, and
returns the text only.  It deliberately writes uploads to a temporary file and
removes it immediately after inference; it has no database or object storage.
"""

from __future__ import annotations

import hmac
import io
import json
import os
import tempfile
import threading
import warnings
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from starlette.responses import JSONResponse
from paddleocr import PaddleOCRVL

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 32 * 1024
MAX_IMAGE_PIXELS = 40_000_000
SUPPORTED_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
SERVICE_TOKEN = os.environ.get("AI_INPUT_SERVICE_TOKEN", "").strip()

if not SERVICE_TOKEN:
    raise RuntimeError("AI_INPUT_SERVICE_TOKEN is required; refusing to start an open OCR service")


class RequestBodyTooLarge(Exception):
    """Internal ASGI signal for a body that exceeds the service contract."""


class LimitOcrRequestSize:
    """Reject oversized bodies while streaming, before multipart parsing spools them."""

    def __init__(self, app: Any):
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http" or scope.get("path") != "/ocr":
            await self.app(scope, receive, send)
            return

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        declared = headers.get(b"content-length")
        if declared and declared.isdigit() and int(declared) > MAX_REQUEST_BYTES:
            await JSONResponse({"detail": "Image is too large"}, status_code=413)(
                scope, receive, send
            )
            return

        received = 0

        async def limited_receive() -> dict[str, Any]:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > MAX_REQUEST_BYTES:
                    raise RequestBodyTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except RequestBodyTooLarge:
            await JSONResponse({"detail": "Image is too large"}, status_code=413)(
                scope, receive, send
            )

app = FastAPI(title="Police Telegrams PaddleOCR-VL", docs_url=None, redoc_url=None)
app.add_middleware(LimitOcrRequestSize)
_pipeline: PaddleOCRVL | None = None
_pipeline_lock = threading.Lock()


def get_pipeline() -> PaddleOCRVL:
    """Load the 0.9B model once, on the first request, to keep startup predictable."""
    global _pipeline
    with _pipeline_lock:
        if _pipeline is None:
            _pipeline = PaddleOCRVL(
                pipeline_version="v1",
                use_doc_orientation_classify=True,
                use_doc_unwarping=True,
            )
        return _pipeline


def ensure_authorized(token: str | None) -> None:
    if not token or not hmac.compare_digest(token, SERVICE_TOKEN):
        raise HTTPException(status_code=401, detail="Unauthorized")


def validate_image_bytes(data: bytes, content_type: str) -> None:
    is_jpeg = data.startswith(b"\xff\xd8\xff")
    is_png = data.startswith(b"\x89PNG\r\n\x1a\n")
    is_webp = len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    signature_matches = (
        (content_type == "image/jpeg" and is_jpeg)
        or (content_type == "image/png" and is_png)
        or (content_type == "image/webp" and is_webp)
    )
    if not signature_matches:
        raise HTTPException(status_code=415, detail="Image signature does not match its MIME type")

    try:
        Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                width, height = image.size
                if width * height > MAX_IMAGE_PIXELS:
                    raise HTTPException(status_code=413, detail="Image has too many pixels")
                image.verify()
    except HTTPException:
        raise
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=415, detail="Invalid image") from exc


def to_mapping(result: Any) -> dict[str, Any]:
    """Normalize PaddleOCR result objects without relying on private internals."""
    candidate = getattr(result, "json", result)
    candidate = candidate() if callable(candidate) else candidate
    if isinstance(candidate, str):
        candidate = json.loads(candidate)
    if not isinstance(candidate, dict):
        raise RuntimeError("PaddleOCR-VL returned an unsupported result")
    return candidate


def text_from_prediction(result: Any) -> str:
    payload = to_mapping(result)
    blocks = payload.get("parsing_res_list", [])
    if not isinstance(blocks, list):
        return ""

    # PaddleOCR-VL orders parsing_res_list in the document reading order.
    values = [
        block.get("block_content", "").strip()
        for block in blocks
        if isinstance(block, dict) and isinstance(block.get("block_content"), str)
    ]
    return "\n".join(value for value in values if value)


@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "true", "model": "PaddleOCR-VL"}


@app.post("/ocr")
async def ocr(
    file: UploadFile = File(...),
    x_ai_input_token: str | None = Header(default=None),
) -> dict[str, str]:
    ensure_authorized(x_ai_input_token)

    content_type = file.content_type or ""
    suffix = SUPPORTED_TYPES.get(content_type)
    if not suffix:
        raise HTTPException(status_code=415, detail="Unsupported image type")

    data = await file.read(MAX_IMAGE_BYTES + 1)
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image is empty or too large")
    validate_image_bytes(data, content_type)

    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
            temp_file.write(data)
            temp_path = Path(temp_file.name)

        predictions = get_pipeline().predict(str(temp_path))
        text = "\n".join(text_from_prediction(result) for result in predictions).strip()
        return {"text": text}
    except HTTPException:
        raise
    except Exception as exc:
        # The caller only needs a stable status; do not expose document/model details.
        raise HTTPException(status_code=502, detail="OCR inference failed") from exc
    finally:
        if temp_path:
            temp_path.unlink(missing_ok=True)
        await file.close()
