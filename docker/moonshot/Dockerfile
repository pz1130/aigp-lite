# syntax=docker/dockerfile:1
# (Required for the `RUN --mount=type=cache` build-cache mounts below. Must stay
#  the very first line — a comment above it would demote it to a plain comment.)
#
# AI Verify Moonshot sidecar.
#
# There is NO official Moonshot image on Docker Hub — Moonshot ships as a pip
# package (`aiverify-moonshot`) that runs a Python/FastAPI async Web API. This
# Dockerfile builds that sidecar from source the documented way:
#   pip install "aiverify-moonshot[all]"
#   python -m moonshot -i moonshot-data      # git-clones recipes/datasets/metrics
#   python -m moonshot web-api               # serves the API (HOST_ADDRESS:HOST_PORT)
FROM python:3.11-slim

# git: `moonshot -i moonshot-data` clones the moonshot-data repo.
# curl: container healthcheck.
# g++: required by pylcs (C++ extension in moonshot-data dependencies).
#
# The downloaded .deb packages and apt lists are kept in BuildKit cache mounts so
# repeat builds skip re-downloading them. The base image installs a docker-clean
# hook that wipes /var/cache/apt after every install (which would defeat the
# cache), so remove it. With the lists cached we also drop the old `rm -rf` —
# `sharing=locked` keeps concurrent builds from corrupting the shared cache.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
 && apt-get update \
 && apt-get install -y --no-install-recommends git curl g++

WORKDIR /moonshot

# pip's wheel cache is kept in a BuildKit cache mount (instead of --no-cache-dir)
# so repeat builds reuse downloaded wheels rather than re-fetching them. The
# cache lives in the build cache, not the final image, so image size is unchanged.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install "aiverify-moonshot[all]"

# Fetch test assets (recipes, datasets, metrics, connectors) into the workdir.
# web-api only needs the data, not the UI bundle.
#
# CRITICAL: this step ALSO writes /moonshot/.env (cwd) with the DATA-path vars
# (CONNECTORS, RECIPES, DATASETS, ...). `python -m moonshot web-api` reads that
# file via the CLI dispatcher's `dotenv_values(args.env)` (args.env defaults to
# the relative "./.env", resolved against cwd=/moonshot) and feeds it to
# EnvironmentVars.load_env — that is what points the engine at ./moonshot-data/*.
# Do NOT clobber /moonshot/.env: without those path vars, EnvironmentVars falls
# back to the package's (empty) data/ dir, so `GET /api/v1/connectors` returns []
# and endpoint registration 500s with "Unable to get defined object module
# instance - None". (Verified live, Task 10.)
#
# This is the heaviest layer (~5.8 GB): `-i moonshot-data` pip-installs the data
# repo's requirements (torch / transformers / sentence-transformers / CUDA
# wheels). The same pip cache mount is reused here so those multi-GB wheels are
# not re-downloaded on rebuilds. (The git clone itself is not cached.)
RUN --mount=type=cache,target=/root/.cache/pip \
    python -m moonshot -i moonshot-data

# Bind host/port. This is a SEPARATE concern from the data paths above, read by a
# DIFFERENT dotenv call: web_api/__main__.start_app() does `load_dotenv()` +
# `dotenv_values()` with NO path, so OS env vars (an `ENV` / compose
# `environment:`) are ignored, AND /moonshot/.env is ignored here too —
# find_dotenv() walks up from the *caller frame* (the web_api package dir in
# site-packages), never reaching /moonshot. Verified live: the process bound
# 127.0.0.1:5000 (loopback, unreachable from sibling containers) until a `.env`
# was placed in the web_api package dir, after which it bound 0.0.0.0:5000.
# So host/port MUST live in the web_api package dir; data paths MUST live in
# /moonshot/.env — two files, two readers, both required.
# (Path resolved dynamically so it survives a python-version bump.)
RUN printf 'HOST_ADDRESS=0.0.0.0\nHOST_PORT=5000\n' \
      > "$(python -c 'import os,moonshot.integrations.web_api as m; print(os.path.dirname(m.__file__))')/.env"

EXPOSE 5000

# Starts the FastAPI Web API (not the UI). Run from /moonshot so it finds the
# cloned moonshot-data/ alongside it.
CMD ["python", "-m", "moonshot", "web-api"]
