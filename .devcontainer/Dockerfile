FROM node:22.1.0-bookworm-slim as base

RUN set -ex; \
	apt-get update; \
	apt-get install -y --no-install-recommends \
        build-essential \
        python3 \
    ;