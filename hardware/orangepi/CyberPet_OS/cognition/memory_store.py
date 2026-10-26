"""
Long-term memory store -- ChromaDB vector database for conversation memories.
Simulation mode: in-memory list when chromadb is unavailable or embedding model
has not been downloaded yet.

ChromaDB's default embedding (all-MiniLM-L6-v2) requires a 79MB model download
on first use. To avoid blocking the main loop, we check if the model is cached
at init time. If not, we fall back to sim mode and log instructions.
"""

import asyncio
import logging
import time
from pathlib import Path
from typing import Optional

try:
    import chromadb
    HAS_CHROMADB = True
except Exception:
    HAS_CHROMADB = False

logger = logging.getLogger(__name__)

_ONNX_MODEL_CACHE = Path.home() / ".cache" / "chroma" / "onnx_models" / "all-MiniLM-L6-v2" / "onnx"


def _is_embedding_model_ready() -> bool:
    """Check if ChromaDB's default ONNX embedding model is already cached."""
    marker = _ONNX_MODEL_CACHE / "model.onnx"
    return marker.exists()


class MemoryStore:
    def __init__(self, config: dict):
        self._cfg = config.get("memory", {})
        self._max_recall = self._cfg.get("max_recall_items", 5)
        self._importance_threshold = self._cfg.get("importance_threshold", 0.3)
        self._sim_mode = not HAS_CHROMADB
        self._collection = None
        self._sim_memories: list[dict] = []

    async def initialize(self) -> None:
        if self._sim_mode:
            logger.warning("[SIM] Memory simulation mode (chromadb unavailable)")
            return

        if not _is_embedding_model_ready():
            logger.warning(
                "[SIM] ChromaDB embedding model not cached yet. "
                "Using in-memory mode. To download the model, run:\n"
                "  wget -O /tmp/onnx.tar.gz "
                "https://chroma-onnx-models.s3.amazonaws.com/all-MiniLM-L6-v2/onnx.tar.gz\n"
                "  mkdir -p ~/.cache/chroma/onnx_models/all-MiniLM-L6-v2\n"
                "  tar xzf /tmp/onnx.tar.gz -C ~/.cache/chroma/onnx_models/all-MiniLM-L6-v2/\n"
                "Then restart CyberPet OS.")
            self._sim_mode = True
            return

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self._init_chromadb)

    def _init_chromadb(self) -> None:
        try:
            from chromadb.config import Settings
            db_dir = Path(self._cfg.get("db_path", "data/memory.db")).parent
            db_dir.mkdir(parents=True, exist_ok=True)
            client = chromadb.PersistentClient(
                path=str(db_dir),
                settings=Settings(anonymized_telemetry=False))
            self._collection = client.get_or_create_collection(
                name="pet_memory", metadata={"hnsw:space": "cosine"})
            logger.info("Memory DB initialized (%d entries)", self._collection.count())
        except Exception as e:
            logger.error("ChromaDB init failed, falling back to simulation: %s", e)
            self._sim_mode = True

    async def store(self, user_input, assistant_reply,
                    person_name="unknown", emotion="neutral") -> None:
        importance = self._calculate_importance(user_input, emotion)
        if importance < self._importance_threshold:
            return
        doc = f"[{person_name}] said: {user_input}\nPet reply: {assistant_reply}"

        if self._sim_mode:
            self._sim_memories.append({
                "doc": doc, "person": person_name, "emotion": emotion,
                "importance": importance, "timestamp": time.time(),
            })
            if len(self._sim_memories) > 100:
                self._sim_memories = self._sim_memories[-50:]
            logger.info("[SIM] Memory stored (total: %d, importance=%.2f)",
                        len(self._sim_memories), importance)
            return

        if self._collection:
            doc_id = f"mem_{int(time.time() * 1000)}"
            metadata = {"person": person_name, "emotion": emotion,
                        "importance": importance}
            asyncio.get_running_loop().run_in_executor(
                None, self._store_sync, doc, doc_id, metadata)

    def _store_sync(self, doc: str, doc_id: str, metadata: dict) -> None:
        """Runs in thread pool -- errors won't block the caller."""
        try:
            self._collection.add(
                documents=[doc], ids=[doc_id], metadatas=[metadata])
        except Exception as e:
            logger.error("Memory store failed: %s", e)

    async def recall(self, query, person_name="unknown",
                     n_results=None) -> list[str]:
        n = n_results or self._max_recall

        if self._sim_mode:
            relevant = [
                m["doc"] for m in self._sim_memories
                if person_name == "unknown" or m["person"] == person_name
            ]
            return relevant[-n:] if relevant else []

        if not self._collection or self._collection.count() == 0:
            return []

        try:
            loop = asyncio.get_running_loop()
            results = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    lambda: self._collection.query(
                        query_texts=[query],
                        n_results=min(n, self._collection.count()))),
                timeout=5.0,
            )
            return results.get("documents", [[]])[0]
        except asyncio.TimeoutError:
            logger.warning("Memory recall timed out")
            return []
        except Exception as e:
            logger.error("Memory recall failed: %s", e)
            return []

    def _calculate_importance(self, text: str, emotion: str) -> float:
        score = 0.3
        emotion_weights = {
            "happy": 0.2, "sad": 0.4, "angry": 0.3,
            "surprise": 0.3, "fear": 0.4, "neutral": 0.0,
        }
        score += emotion_weights.get(emotion, 0.0)
        important_keywords = ["like", "hate", "birthday", "name",
                              "remember", "important",
                              "喜欢", "讨厌", "生日", "名字", "记住", "重要"]
        for kw in important_keywords:
            if kw in text.lower():
                score += 0.2
                break
        return min(score, 1.0)
