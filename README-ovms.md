# OpenVINO Model Server (OVMS) + Gemma 3 4B on Windows 11

## Environment

- Windows 11 x64
- Intel Core Ultra 7 155H
- Intel Arc integrated GPU
- Intel AI Boost NPU
- [OpenVINO Model Server](https://github.com/openvinotoolkit/model_server/releases) 2026.2.1 (`win_mp_on_py_off`)

## Install OVMS

Download the Windows archive for OVMS and extract it.

Example:

    C:\Users\satyendras\AppData\Local\ovms\
        ovms.exe

Verify:

```powershell
.\ovms.exe --version
```

## Prepare model repository

Create a local repository:

    C:\Users\satyendras\.ovms\models

## Hugging Face

1.  Create a Hugging Face account.
2.  Accept the license for: `OpenVINO/gemma-3-4b-it-int4-cw-ov`
3.  Create a **Read** access token.
4.  Set the token as env variable:

```powershell
setx HF_TOKEN "hf_xxxxxxxxxxxxxxxxx"
```

Restart PowerShell afterwards.

## Pull the model

```powershell
ovms.exe --pull --source_model OpenVINO/gemma-3-4b-it-int4-cw-ov --model_repository_path "C:\Users\satyendras\.ovms\models" --model_name gemma-3-4b-it-int4-cw-ov --task text_generation --target_device NPU
```

The first download is about 3.4 GB.

OVMS creates:

    C:\Users\satyendras\.ovms\models\
    └── OpenVINO\
        └── gemma-3-4b-it-int4-cw-ov\
            ├── graph.pbtxt
            ├── openvino_language_model.bin
            ├── ...

## Start OVMS

```powershell
ovms.exe --rest_port 8000 --model_repository_path "C:\Users\satyendras\.ovms\models" --task text_generation --source_model OpenVINO/gemma-3-4b-it-int4-cw-ov --target_device NPU
```

## Verify model status

```powershell
Invoke-RestMethod http://localhost:8000/v1/config
```

Expected:

```json
{
  "OpenVINO/gemma-3-4b-it-int4-cw-ov": {
    "model_version_status": [
      {
        "state": "AVAILABLE"
      }
    ]
  }
}
```

## List models

```powershell
Invoke-RestMethod http://localhost:8000/v3/models
```

## Test chat completion

Create `request.json`:

```json
{
  "model": "OpenVINO/gemma-3-4b-it-int4-cw-ov",
  "messages": [
    {
      "role": "user",
      "content": "Explain OpenVINO in one paragraph."
    }
  ],
  "max_tokens": 128,
  "temperature": 0.2
}
```

Run:

```powershell
curl.exe -X POST http://localhost:8000/v3/chat/completions ^
  -H "Content-Type: application/json" ^
  --data-binary "@request.json"
```

## Troubleshooting

### 403 while pulling

- Ensure `HF_TOKEN` is set.
- Accept the Gemma model license.
- Use a Hugging Face **Read** token.

### Invalid JSON with curl

On Windows, prefer:

- `request.json` + `--data-binary`
- or PowerShell `Invoke-RestMethod`

### Slow responses

Specify generation parameters such as:

- `max_tokens`
- `temperature`

Otherwise the model may generate unnecessarily long outputs.

## Next steps

- Benchmark CPU vs GPU vs NPU.
- Enable streaming responses.
- Integrate with the OpenAI SDK:

```ts
const client = new OpenAI({
  apiKey: "unused",
  baseURL: "http://localhost:8000/v3"
});
```
