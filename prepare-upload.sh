#!/usr/bin/env bash
# Builds the site and writes base64 copies + a manifest (path sha1 size b64file) for Vercel upload_file/create_deployment.
set -e
cd "$(dirname "$0")"
node build.mjs >/dev/null
mkdir -p /workspace/up && rm -f /workspace/up/*
cd public
for f in $(find . -type f | sed 's|^\./||' | sort); do
  n=$(echo "$f" | tr '/' '_'); base64 -w0 "$f" > "/workspace/up/$n.b64"
  echo "$f $(sha1sum "$f" | cut -c1-40) $(stat -c%s "$f") /workspace/up/$n.b64"
done | tee /workspace/up/manifest.txt
