---
description: "Look up clinical guidelines including BI-RADS, Lung-RADS, LI-RADS, TG-263, ACR, and RECIST 1.1"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Search the local guideline RAG database for clinical guidelines, templates, and ontology references. Covers BI-RADS, Lung-RADS, LI-RADS, TG-263, ACR Appropriateness Criteria, and RECIST 1.1.

## Parameters
Parse from user request: $ARGUMENTS
- **query** (required): clinical question — infer from user's natural language request
- **filter_type** (optional): "guideline" | "template" | "ontology" | "all" — infer from context, default "guideline"
- **modality** (optional): e.g. "CT", "MR", "US", "PET" — infer from context if mentioned
- **body_region** (optional): e.g. "breast", "lung", "liver", "brain" — infer from context if mentioned
- **top_k** (optional): 1-20, default 5

## Workflow

1. Parse the clinical query from the user request.
2. Infer `filter_type`, `modality`, and `body_region` from the context of the question.
3. Search guidelines:

```bash
curl -X POST "$MEDAI_SERVER/mcp/execute" \
  -H "Content-Type: application/json" \
  -d '{"tool_name": "local_rag_search", "input": {"query": "<QUERY>", "filter_type": "<TYPE>", "modality": "<MODALITY>", "body_region": "<REGION>", "top_k": <K>}}'
```

`$MEDAI_SERVER` defaults to `http://localhost:8000`.

4. Display results with relevance scores and source types.
5. Highlight key recommendations from matched guidelines.

## Confirmation Required
None.

## Output Format

For each matched guideline, display:
- **Source**: guideline name and section
- **Relevance Score**: numeric score from RAG search
- **Content**: the matched guideline text with key recommendations highlighted
- **Source Type**: guideline / template / ontology

Summarize the most relevant recommendation at the top of the response.

## Examples
- "What does BI-RADS 4 mean?"
- "Lung-RADS for 8mm nodule"
- "TG-263 naming for heart"
- "ACR appropriateness criteria for chest pain"
- "RECIST 1.1 measurable disease definition"
