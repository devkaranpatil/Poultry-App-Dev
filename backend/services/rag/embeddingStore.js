// Disk cache for passage embeddings, so the embedding model only runs on passages it has not seen.
// Key: sha1 of the passage text. Value: the vector as base64 Float32. The file records which embedding
// model produced it and is ignored when the model changes.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_FILE = path.resolve(__dirname, "../../.data/rag-embeddings.json");

const hashText = (text) => crypto.createHash("sha1").update(text).digest("hex");

const encode = (vector) => Buffer.from(new Float32Array(vector).buffer).toString("base64");

function decode(base64) {
  const buffer = Buffer.from(base64, "base64");
  const copy = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Float32Array(copy);
}

function createEmbeddingStore({ file = DEFAULT_FILE, model }) {
  let items = new Map();

  function load() {
    try {
      const saved = JSON.parse(fs.readFileSync(file, "utf8"));
      if (saved.model === model && saved.items && typeof saved.items === "object") {
        items = new Map(Object.entries(saved.items));
      }
    } catch {
      items = new Map();
    }
    return items.size;
  }

  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ model, items: Object.fromEntries(items) }));
    fs.renameSync(tmp, file);
  }

  return {
    load,
    save,
    has: (hash) => items.has(hash),
    get: (hash) => (items.has(hash) ? decode(items.get(hash)) : null),
    set: (hash, vector) => items.set(hash, encode(vector)),
    size: () => items.size,
  };
}

module.exports = { createEmbeddingStore, hashText };
