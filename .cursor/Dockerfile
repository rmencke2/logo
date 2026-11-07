# Base image for the Influzer Logo Generator Cloud Agent environment.
# Node 22 matches the toolchain the project is developed/tested against.
FROM node:22-bookworm-slim

# System libraries required to build/run the native npm addons used by the app:
#   - canvas  -> cairo, pango, jpeg, gif, rsvg (+ pkg-config, build-essential, python3 for node-gyp)
#   - sqlite3 / bcrypt / sharp -> build toolchain fallback when prebuilt binaries are unavailable
#   - fluent-ffmpeg -> ffmpeg binary at runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        pkg-config \
        python3 \
        git \
        ca-certificates \
        ffmpeg \
        libcairo2-dev \
        libpango1.0-dev \
        libjpeg-dev \
        libgif-dev \
        librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

USER node
