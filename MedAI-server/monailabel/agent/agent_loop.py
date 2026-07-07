# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
Claude tool-use loop for the MedAI agent.

``AgentLoop.run`` is an async generator that yields UI events while driving one
user turn to completion: it streams assistant text, executes tool calls against
the live MONAI Label API (via ``MedAIToolExecutor``), and — when a batch job is
started — polls its progress and streams it back so the chat window shows a live
progress card. Conversation state (including tool_use / tool_result blocks) is
persisted on the chat session so multi-turn context survives.

Event shapes (all dicts, streamed to the frontend as SSE):
  {"type": "text", "text": "..."}                      assistant text delta
  {"type": "tool_call", "name": ..., "input": {...}}    a tool is about to run
  {"type": "tool_result", "name": ..., "result": {...}} tool output
  {"type": "batch_job", "job_id": ..., "total": ...}    batch job started
  {"type": "batch_progress", "job_id": ..., ...}        live batch progress
  {"type": "done"}                                       turn finished
  {"type": "error", "error": "..."}                     fatal error
"""

import asyncio
import logging
import os
from typing import Any, AsyncGenerator, Dict, List, Optional

from monailabel.agent.tools import (
    MedAIToolExecutor,
    TOOL_DEFINITIONS,
)

logger = logging.getLogger(__name__)

# Configurable so deployments can pick the model their API key can access.
AGENT_MODEL = os.environ.get("AGENT_MODEL", "claude-sonnet-5")
AGENT_MAX_TOKENS = int(os.environ.get("AGENT_MAX_TOKENS", "2048"))
# Max tool-use round-trips per user turn (guards against loops).
MAX_TOOL_ITERATIONS = int(os.environ.get("AGENT_MAX_TOOL_ITERATIONS", "12"))

# Batch progress polling
BATCH_POLL_INTERVAL_S = float(os.environ.get("AGENT_BATCH_POLL_INTERVAL", "3"))
BATCH_POLL_MAX_S = float(os.environ.get("AGENT_BATCH_POLL_MAX", "1200"))
_TERMINAL = {"completed", "failed", "cancelled"}

SYSTEM_PROMPT = """You are the MedAI Agent, an orchestration assistant embedded \
in a medical imaging platform. You help clinicians run batch segmentation over \
many patients so they don't have to load and segment studies one by one.

Your capabilities (via tools):
- list_patients: show what patients/studies are in the datastore.
- resolve_images: preview how a patient selection maps to images.
- run_batch_segmentation: run a model (default 'biomedparse', which is \
text-prompted — the prompt names the anatomy, e.g. 'liver') over the selected \
patients. This starts a batch job.
- get_batch_status: check a running job.
- save_results_to_pacs: push completed results to PACS as DICOM-SEG so the user \
can open each study in the viewer and refine the segmentation.

Rules:
- ALWAYS confirm before starting a batch job. Restate the model, the prompt/\
target structure, and the patient selection (with the image count), then wait \
for the user's explicit "yes" before calling run_batch_segmentation.
- ALWAYS confirm before calling save_results_to_pacs.
- If the user is vague about which patients, call list_patients and ask them to \
choose. Accept names, IDs, or ranges like "1-25".
- After a batch job finishes, briefly summarize how many succeeded/failed and \
offer to push the results to PACS.
- Be concise and clinical. Never invent patient data — rely on the tools.
"""


class AgentLoop:
    """Runs the Anthropic tool-use loop for a single chat session at a time."""

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self.model = model or AGENT_MODEL
        self.executor = MedAIToolExecutor()
        self._client = None

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def _get_client(self):
        if self._client is None:
            from anthropic import AsyncAnthropic

            self._client = AsyncAnthropic(api_key=self.api_key)
        return self._client

    async def run(
        self, messages: List[Dict[str, Any]], user_message: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Drive one user turn to completion.

        Args:
            messages: prior conversation in Anthropic message format (mutated
                in place so the caller can persist the updated history).
            user_message: the new user message text.
        """
        if not self.available:
            yield {
                "type": "error",
                "error": "Agent is not configured: ANTHROPIC_API_KEY is missing.",
            }
            return

        messages.append({"role": "user", "content": user_message})
        client = self._get_client()

        for _ in range(MAX_TOOL_ITERATIONS):
            assistant_blocks: List[Dict[str, Any]] = []
            try:
                async with client.messages.stream(
                    model=self.model,
                    max_tokens=AGENT_MAX_TOKENS,
                    system=SYSTEM_PROMPT,
                    tools=TOOL_DEFINITIONS,
                    messages=messages,
                ) as stream:
                    async for event in stream:
                        if (
                            event.type == "content_block_delta"
                            and getattr(event.delta, "type", None) == "text_delta"
                        ):
                            yield {"type": "text", "text": event.delta.text}
                    final = await stream.get_final_message()
            except Exception as e:  # noqa: BLE001
                logger.exception("Anthropic stream failed")
                yield {"type": "error", "error": f"LLM error: {e}"}
                return

            # Persist assistant message (as serializable blocks)
            for block in final.content:
                if block.type == "text":
                    assistant_blocks.append({"type": "text", "text": block.text})
                elif block.type == "tool_use":
                    assistant_blocks.append(
                        {
                            "type": "tool_use",
                            "id": block.id,
                            "name": block.name,
                            "input": block.input,
                        }
                    )
            messages.append({"role": "assistant", "content": assistant_blocks})

            tool_uses = [b for b in final.content if b.type == "tool_use"]
            if not tool_uses:
                yield {"type": "done"}
                return

            # Execute each requested tool and gather results for the next turn
            tool_results: List[Dict[str, Any]] = []
            for tu in tool_uses:
                yield {"type": "tool_call", "name": tu.name, "input": tu.input}
                result = await self.executor.execute(tu.name, tu.input)
                yield {"type": "tool_result", "name": tu.name, "result": result}

                # When a batch job starts, announce it and stream live progress,
                # then hand the final status back to the model as the tool result.
                if tu.name == "run_batch_segmentation" and result.get("job_id"):
                    job_id = result["job_id"]
                    yield {
                        "type": "batch_job",
                        "job_id": job_id,
                        "total": result.get("total"),
                        "model": result.get("model"),
                        "prompt": result.get("prompt"),
                    }
                    final_status = None
                    async for prog in self._poll_batch(job_id):
                        if prog.get("_final"):
                            final_status = prog.get("status_obj")
                        else:
                            yield prog
                    if final_status is not None:
                        result = {**result, "final_status": final_status}

                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tu.id,
                        "content": _json_text(result),
                    }
                )

            messages.append({"role": "user", "content": tool_results})

        yield {
            "type": "text",
            "text": "\n\n(Stopped after too many tool steps. Please refine the request.)",
        }
        yield {"type": "done"}

    async def _poll_batch(self, job_id: str) -> AsyncGenerator[Dict[str, Any], None]:
        """Yield batch_progress events until the job reaches a terminal state."""
        elapsed = 0.0
        last_pct = -1.0
        while elapsed < BATCH_POLL_MAX_S:
            status = await self.executor.execute("get_batch_status", {"job_id": job_id})
            if "error" in status:
                yield {"type": "batch_progress", "job_id": job_id, "error": status["error"]}
                yield {"_final": True, "status_obj": status}
                return

            pct = status.get("progress_percentage", 0.0)
            if pct != last_pct or status.get("status") in _TERMINAL:
                last_pct = pct
                yield {
                    "type": "batch_progress",
                    "job_id": job_id,
                    "status": status.get("status"),
                    "progress_percentage": pct,
                    "success": status.get("success"),
                    "failed": status.get("failed"),
                    "total": status.get("total"),
                }

            if status.get("status") in _TERMINAL:
                yield {"_final": True, "status_obj": status}
                return

            await asyncio.sleep(BATCH_POLL_INTERVAL_S)
            elapsed += BATCH_POLL_INTERVAL_S

        # Timed out waiting; report the latest status without failing the turn.
        status = await self.executor.execute("get_batch_status", {"job_id": job_id})
        yield {"_final": True, "status_obj": status}


def _json_text(obj: Any) -> str:
    import json

    try:
        return json.dumps(obj, default=str)
    except Exception:  # noqa: BLE001
        return str(obj)


# Global singleton
_agent_loop: Optional[AgentLoop] = None


def get_agent_loop() -> AgentLoop:
    global _agent_loop
    if _agent_loop is None:
        _agent_loop = AgentLoop()
    return _agent_loop
