# AI Stuff

## Using Open Models - [Ollama](https://ollama.com/)

[Getting Started](https://docs.ollama.com/)

[Ollama CLI Reference](https://docs.ollama.com/cli)

## `.env` setup

```
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
OPENAI_MODEL=qwen3.5:4b
EMBEDDINGS_MODEL=qwen3-embedding:0.6b
```

## Run

```
npx tsx ./src/index.ts
```

## Alternative backend: OpenVINO Model Server (OVMS)

This project is compatible with any OpenAI-style endpoint, so it can also work with an OVMS deployment instead of Ollama.

If you want to run the model server on Windows with OpenVINO/Gemma, see [README-ovms.md](README-ovms.md) for the full setup and verification flow.

Typical OVMS-compatible environment values look like:

```
OPENAI_BASE_URL=http://localhost:8000/v3
OPENAI_API_KEY=unused
OPENAI_MODEL=OpenVINO/gemma-3-4b-it-int4-cw-ov
```
