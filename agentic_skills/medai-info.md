---
description: "Query MedAI server status, loaded models, GPU utilization, and LLM health"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Retrieve and display MedAI server status including server info, loaded models, datastore statistics, GPU utilization, and LLM service health.

## Parameters
Parse from user request: $ARGUMENTS
- No required parameters
- Optional: specific info category (`models`, `gpu`, `health`, `all`)
- If no category specified, default to `all`

## Server Configuration
Use environment variable `MEDAI_SERVER` or default to `http://localhost:8000`.

## API Endpoints

### Server Info
```
GET /info/
```
Returns: server version, loaded models (name, type, labels), datastore image count, configuration details.

```bash
curl -s ${MEDAI_SERVER:-http://localhost:8000}/info/ | jq .
```

### LLM Health
```
GET /report/health
```
Returns: LLM service status, provider name, model name, API key configuration status.

```bash
curl -s ${MEDAI_SERVER:-http://localhost:8000}/report/health | jq .
```

### GPU Utilization
```
GET /logs/gpu
```
Returns: nvidia-smi output with GPU memory usage, utilization percentages, temperature, running processes.

```bash
curl -s ${MEDAI_SERVER:-http://localhost:8000}/logs/gpu
```

## Workflow

1. Determine which info categories the user wants (default: all)
2. Call the relevant API endpoints
3. Parse and format the responses
4. Display the results in a structured format

## Confirmation Required
None. This is a read-only informational query.

## Output Format

```
MedAI Server Status
====================

Server
  Version:    <version>
  Datastore:  <N> images

Loaded Models
  <model_name>    type: <type>    labels: <label_count>
  <model_name>    type: <type>    labels: <label_count>
  ...

GPU Utilization
  GPU 0: <name>
    Memory: <used> / <total> MiB (<percent>%)
    Utilization: <percent>%
    Temperature: <temp>C

LLM Service
  Status:   <healthy/unhealthy>
  Provider: <provider>
  Model:    <model>
  API Key:  <configured/not configured>
```

## Examples

**"what models are available?"** — Call `/info/`, extract and list model names with their types.

**"check GPU usage"** — Call `/logs/gpu`, display nvidia-smi summary.

**"is the report service working?"** — Call `/report/health`, display LLM status.

**"server status"** — Call all three endpoints, display full status.
