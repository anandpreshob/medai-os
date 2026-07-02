---
description: "Search PubMed and Semantic Scholar for medical imaging literature"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Search medical literature across PubMed and Semantic Scholar, merge and deduplicate results, and present a unified table.

## Parameters
Parse from user request: $ARGUMENTS
- **query** (required): search terms — infer from the user's natural language request
- **max_results** (optional): 1-50 per source, default 10
- **date_range_years** (optional): 1-20, default 5 (PubMed only)

## Workflow

1. Parse the search query from the user request.
2. Run both searches **in parallel**:

```bash
# PubMed
curl -X POST "$MEDAI_SERVER/mcp/execute" \
  -H "Content-Type: application/json" \
  -d '{"tool_name": "pubmed_search", "input": {"query": "<QUERY>", "max_results": <MAX>, "date_range_years": <YEARS>}}'

# Semantic Scholar
curl -X POST "$MEDAI_SERVER/mcp/execute" \
  -H "Content-Type: application/json" \
  -d '{"tool_name": "semantic_scholar_search", "input": {"query": "<QUERY>", "max_results": <MAX>}}'
```

`$MEDAI_SERVER` defaults to `http://localhost:8000`.

3. Merge and deduplicate results by title similarity.
4. Display a combined results table.

## Confirmation Required
None.

## Output Format

Present results as a markdown table:

| # | Title | Authors | Year | Journal/Venue | Citations | Open Access |
|---|-------|---------|------|---------------|-----------|-------------|
| 1 | ...   | ...     | ...  | ...           | ...       | Yes/No      |

- Sort by citation count descending.
- Show total results found from each source.
- If a paper appears in both sources, merge the entry and note both sources.

## Examples
- "Find papers about liver segmentation with deep learning"
- "Search for RECIST 1.1 validation studies"
- "Literature on BI-RADS AI classification"
