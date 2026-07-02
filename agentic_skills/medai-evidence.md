---
description: "Synthesize evidence from PubMed, Semantic Scholar, and local guidelines into a structured summary"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Run parallel searches across PubMed, Semantic Scholar, and local guidelines, then synthesize all results into a structured evidence summary with quality assessment.

## Parameters
Parse from user request: $ARGUMENTS
- **question** (required): clinical or research question — infer from user's natural language request
- **max_results** (optional): per source, default 10
- **max_length_words** (optional): summary length 100-2000, default 500

## Workflow

1. Formulate a precise clinical question from the user request.
2. Run all 3 searches **in parallel**:

```bash
# PubMed
curl -X POST "$MEDAI_SERVER/mcp/execute" \
  -H "Content-Type: application/json" \
  -d '{"tool_name": "pubmed_search", "input": {"query": "<QUERY>", "max_results": 10}}'

# Semantic Scholar
curl -X POST "$MEDAI_SERVER/mcp/execute" \
  -H "Content-Type: application/json" \
  -d '{"tool_name": "semantic_scholar_search", "input": {"query": "<QUERY>", "max_results": 10}}'

# Local Guidelines
curl -X POST "$MEDAI_SERVER/mcp/execute" \
  -H "Content-Type: application/json" \
  -d '{"tool_name": "local_rag_search", "input": {"query": "<QUERY>", "filter_type": "all", "top_k": 5}}'
```

3. Feed all results to the evidence summarizer:

```bash
curl -X POST "$MEDAI_SERVER/mcp/execute" \
  -H "Content-Type: application/json" \
  -d '{"tool_name": "evidence_summarizer", "input": {"question": "<QUESTION>", "pubmed_articles": <ARTICLES>, "semantic_scholar_papers": <PAPERS>, "local_guidelines": <GUIDELINES>, "max_length_words": 500}}'
```

`$MEDAI_SERVER` defaults to `http://localhost:8000`.

4. Display the structured evidence synthesis.

## Confirmation Required
None.

## Output Format

Present the synthesis in this structure:

### Evidence Summary
<summary text>

### Key Points
- Point 1
- Point 2
- (up to 5 bullet points)

### Evidence Quality: **[HIGH / MODERATE / LOW]**

### Recommendation Strength
<if available>

### Citations
1. Author et al. (Year). Title. Journal.
2. ...

### Limitations
<if available>

## Examples
- "Summarize the evidence for using AI in liver lesion detection"
- "What's the evidence for SUVmax cutoff of 2.5?"
- "Evidence for MRI vs CT in hepatocellular carcinoma staging"
