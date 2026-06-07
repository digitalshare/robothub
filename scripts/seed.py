#!/usr/bin/env python3
"""Seed the Robotic Data Platform with real robotics news (fetched via Bright Data MCP).

Embeds each chunk through the InsForge AI proxy and ingests via the secret-gated
`ingest_articles` RPC. Idempotent: articles dedupe by URL.
"""
import json
import os
import urllib.request

# Secrets are read from the environment — never hard-code them (this file is public).
#   export INSFORGE_BASE_URL=... INSFORGE_API_KEY=... INSFORGE_SERVICE_SECRET=...
BASE = os.environ.get("INSFORGE_BASE_URL", "https://89zya6ii.us-west.insforge.app")
API_KEY = os.environ["INSFORGE_API_KEY"]
SERVICE_SECRET = os.environ["INSFORGE_SERVICE_SECRET"]
EMBED_MODEL = "openai/text-embedding-3-small"
CHUNK_SIZE = 1200
CHUNK_OVERLAP = 150


def post(path, body, auth=API_KEY):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {auth}", "apikey": auth, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())


def get(path, auth=API_KEY):
    req = urllib.request.Request(
        BASE + path, headers={"Authorization": f"Bearer {auth}", "apikey": auth}
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def embed(text):
    res = post("/api/ai/embeddings", {"model": EMBED_MODEL, "input": text})
    return res["data"][0]["embedding"]


def chunk(text):
    text = " ".join(text.split())
    out, i = [], 0
    while i < len(text):
        out.append(text[i : i + CHUNK_SIZE])
        i += CHUNK_SIZE - CHUNK_OVERLAP
        if len(out) >= 12:
            break
    return out


def main():
    topics = {t["name"]: t["id"] for t in get("/api/database/records/topics?select=id,name")}
    print("Topics:", topics)

    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "seed_articles.json")) as f:
        dataset = json.load(f)

    total = 0
    for topic_name, articles in dataset.items():
        topic_id = topics.get(topic_name)
        if not topic_id:
            print(f"!! topic not found: {topic_name}")
            continue
        payload = []
        for a in articles:
            pieces = chunk(a["content"])
            chunks = []
            for idx, piece in enumerate(pieces):
                chunks.append({"chunk_index": idx, "content": piece, "embedding": embed(piece)})
            payload.append({**a, "chunks": chunks})
            print(f"  embedded '{a['title'][:50]}' ({len(chunks)} chunks)")
        inserted = post(
            "/api/database/rpc/ingest_articles",
            {"p_secret": SERVICE_SECRET, "p_topic_id": topic_id, "p_articles": payload},
        )
        print(f"[{topic_name}] inserted {inserted} new articles")
        total += inserted if isinstance(inserted, int) else 0
    print(f"DONE. {total} new articles ingested.")


if __name__ == "__main__":
    main()
