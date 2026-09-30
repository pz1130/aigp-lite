# docker/nemo/Dockerfile
# NeMo Guardrails HTTP server sidecar. Internal-only (reached as nemo:9000 by
# web/worker over the compose network); not published to the host.
FROM python:3.12-slim
# build-essential: nemoguardrails pulls in `annoy`, a C++ extension with no
# prebuilt wheel for slim/linux — it must be compiled from source at install.
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir "nemoguardrails[server]"
# Guardrail configs are mounted at runtime from nemo-configs/ (see compose).
WORKDIR /config
EXPOSE 9000
CMD ["nemoguardrails", "server", "--config", "/config", "--port", "9000", "--default-config-id", "aigp_judge"]
