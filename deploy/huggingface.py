"""Publish Vinylize to a Hugging Face Space (Docker SDK).

    python deploy/huggingface.py                 # -> <your-username>/vinylize
    python deploy/huggingface.py --space me/vinylize --no-examples

Needs `huggingface_hub` and a logged-in account with a *write* token
(`hf auth login`). The Space is built from the committed tree (`git archive
HEAD`, so uncommitted changes are not shipped) plus a Space README carrying the
Docker configuration, plus — unless --no-examples — the example record audio in
backend/examples/, which is deliberately never committed to git.
"""

from __future__ import annotations

import argparse
import io
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

from huggingface_hub import HfApi

ROOT = Path(__file__).resolve().parents[1]
DEMO_FILES = (
    "stand-by-me.mp3",
    "nothing-can-change-this-love.mp3",
    "come-a-little-bit-closer.mp3",
)

SPACE_HEADER = """---
title: Vinylize
emoji: 💿
colorFrom: yellow
colorTo: red
sdk: docker
app_port: 7860
pinned: false
short_description: Cut any song to a virtual vinyl record and hear the needle.
---

"""


def stage(dest: Path, with_examples: bool) -> None:
    archive = subprocess.run(
        ["git", "archive", "--format=tar", "HEAD"], cwd=ROOT, check=True, capture_output=True
    ).stdout
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(dest, filter="data")
    # Screenshots and design docs are not needed to run the app.
    shutil.rmtree(dest / "docs", ignore_errors=True)
    shutil.rmtree(dest / ".claude", ignore_errors=True)
    readme = dest / "README.md"
    readme.write_text(SPACE_HEADER + readme.read_text(encoding="utf-8"), encoding="utf-8")
    examples = ROOT / "backend" / "examples"
    if with_examples:
        target = dest / "backend" / "examples"
        target.mkdir(parents=True, exist_ok=True)
        for name in DEMO_FILES:
            source = examples / name
            if not source.is_file():
                raise FileNotFoundError(f"Required demo recording is missing: {source}")
            shutil.copy2(source, target / name)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--space", help="Space id, e.g. username/vinylize")
    parser.add_argument("--no-examples", action="store_true", help="ship without example record audio")
    parser.add_argument("--private", action="store_true", help="create the Space as private")
    parser.add_argument("--update", action="store_true", help="update an existing Vinylize Docker Space")
    args = parser.parse_args()

    api = HfApi()
    user = api.whoami()["name"]
    space = args.space or f"{user}/vinylize"
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp) / "space"
        folder.mkdir()
        stage(folder, with_examples=not args.no_examples)
        # Do not overwrite an existing Space without an explicit update workflow.
        if args.update:
            info = api.space_info(space)
            if info.sdk != "docker":
                raise ValueError(f"Refusing to replace a non-Docker Space: {space}")
        else:
            api.create_repo(space, repo_type="space", space_sdk="docker", space_hardware="cpu-basic",
                            private=args.private, exist_ok=False)
        api.upload_folder(
            folder_path=folder,
            repo_id=space,
            repo_type="space",
            commit_message="Deploy Vinylize",
        )

    owner, name = space.split("/")
    print(f"Space:   https://huggingface.co/spaces/{space}")
    print(f"App:     https://{owner.lower()}-{name.lower().replace('_', '-')}.hf.space")
    print("The first build takes a few minutes; watch it on the Space page.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
