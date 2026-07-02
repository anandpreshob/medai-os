---
description: "Enhance AI radiology reports with evidence from PubMed, Semantic Scholar, and local guidelines"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Enhance a generated radiology report with evidence-based citations from literature and clinical guidelines. Searches PubMed, Semantic Scholar, and local RAG sources in parallel, then synthesizes findings into an evidence summary with inline citations and quality ratings.

## Parameters
Parse from user request: $ARGUMENTS
- **clinical_query**: Infer from the current report findings, case context, or user-specified question
- **modality**: From case context or user input (CT, MR, CR, etc.)
- **body_region**: From case context or user input
- **max_results**: Number of articles per source (default 10, max 50)
- **date_range_years**: How far back to search PubMed (default 5, max 20)
- **guideline_filter**: Filter type for local RAG ("guideline", "template", "ontology", or "all"; default "guideline")

## Workflow

1. **Identify key clinical findings** from the current report or case context. Formulate a focused clinical query (e.g., "3cm hypodense liver lesion segment 7 differential diagnosis CT").

2. **Search 3 sources in parallel**:

   Use the following MCP tools simultaneously:

   - **`pubmed_search`**:
     ```json
     {"query": "<clinical_query>", "max_results": 10, "date_range_years": 5}
     ```

   - **`semantic_scholar_search`**:
     ```json
     {"query": "<clinical_query>", "max_results": 10}
     ```

   - **`local_rag_search`**:
     ```json
     {"query": "<clinical_query>", "top_k": 5, "filter_type": "guideline", "modality": "<modality>", "body_region": "<body_region>"}
     ```

3. **Synthesize evidence** using the `evidence_summarizer` MCP tool:
   ```json
   {
     "question": "<clinical_query>",
     "pubmed_articles": "<results from step 2>",
     "semantic_scholar_papers": "<results from step 2>",
     "local_guidelines": "<results from step 2>",
     "max_length_words": 500
   }
   ```

4. **Enhance the report** using the `report_agent` MCP tool with the evidence summary, or present the evidence as a supplementary section alongside the existing report.

5. **Display results**:
   - Enhanced report sections with inline citations
   - Evidence quality rating (high / moderate / low)
   - Key points from the evidence
   - Recommendation strength (if available)
   - Numbered reference list
   - Limitations of the evidence (if any)

## Confirmation Required
No confirmation needed.

## Output Format
Present the enhanced report with the following structure:

### Evidence-Enhanced Report
- Each report section with relevant inline citations (e.g., [1], [2])

### Evidence Summary
- **Quality**: high | moderate | low
- **Key Points**: Bulleted list
- **Recommendation Strength**: If available
- **Limitations**: If any

### References
- Numbered list of citations with authors, title, journal, year

### Example Requests
- "Add evidence citations to the report"
- "Find evidence supporting these findings"
- "Search literature for 3cm liver lesion management guidelines"
- "Enhance this report with PubMed references"
