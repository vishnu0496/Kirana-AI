"""Local voice transcription for KiranaAI — no API, no key, no quota.

Usage: python transcribe.py <audio_file> [task]
  task: "transcribe" (default, keep spoken language) or "translate" (→ English).

Model via WHISPER_MODEL env (default "large-v3"). Uses the GPU when available
and falls back to CPU automatically. First run downloads the model, then offline.
"""
import os
import sys

# Windows consoles default to cp1252, which can't encode Telugu/Hindi/emoji.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

_gpu_model = None
_cpu_model = None


def _register_cuda_dlls():
    """Put the pip-installed NVIDIA cuBLAS/cuDNN DLLs on the search path (Windows).

    `nvidia` is a namespace package (no __file__), so we locate each sub-package
    by its own __file__.
    """
    import importlib
    for sub in ("nvidia.cublas", "nvidia.cudnn"):
        try:
            mod = importlib.import_module(sub)
            for root in list(mod.__path__):  # namespace package dir(s)
                binp = os.path.join(root, "bin")
                if os.path.isdir(binp):
                    os.add_dll_directory(binp)
                    # ctranslate2 loads cublas/cudnn by name via PATH, not add_dll_directory.
                    if binp not in os.environ.get("PATH", ""):
                        os.environ["PATH"] = binp + os.pathsep + os.environ.get("PATH", "")
        except Exception:
            pass


def _model(device: str, compute_type: str):
    from faster_whisper import WhisperModel
    name = os.environ.get("WHISPER_MODEL", "large-v3")
    return WhisperModel(name, device=device, compute_type=compute_type)


def _run(model, audio_path: str, task: str) -> str:
    lang = os.environ.get("WHISPER_LANGUAGE") or None  # "te"/"hi" to force, else auto
    segments, info = model.transcribe(audio_path, task=task, language=lang, vad_filter=True, beam_size=5)
    text = " ".join(seg.text.strip() for seg in segments).strip()  # generator errors surface here
    sys.stderr.write(f"[lang {info.language} p={info.language_probability:.2f}]\n")
    return text


def transcribe(audio_path: str, task: str = "transcribe") -> str:
    global _gpu_model, _cpu_model
    # Try GPU first.
    try:
        _register_cuda_dlls()
        if _gpu_model is None:
            _gpu_model = _model("cuda", "float16")
        return _run(_gpu_model, audio_path, task)
    except Exception as e:  # noqa: BLE001 — any GPU/CUDA problem → CPU
        sys.stderr.write(f"[GPU failed → CPU: {str(e)[:120]}]\n")
        _gpu_model = None
        if _cpu_model is None:
            _cpu_model = _model("cpu", "int8")
        return _run(_cpu_model, audio_path, task)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("", end="")
        sys.exit(0)
    audio = sys.argv[1]
    task = sys.argv[2] if len(sys.argv) > 2 else "transcribe"
    try:
        print(transcribe(audio, task))
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(str(e))
        sys.exit(1)
