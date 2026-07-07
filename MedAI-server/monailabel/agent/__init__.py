# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
MedAI Agent - a Claude tool-use harness for batch medical-imaging workflows.

Unlike ``monailabel.chat`` (a LangGraph Q&A orchestrator whose execution nodes
return mock data), this module runs a real Anthropic tool-use loop whose tools
call the live MONAI Label REST API: list patients from the datastore, launch
BiomedParse batch segmentation, poll job progress, and push results to PACS as
DICOM-SEG so they show up in the viewer for touch-ups.

The agent runs inside the ``chat`` service container and reaches the MONAI Label
server (``inference`` service in the ``ai`` compose profile) over HTTP.
"""

from monailabel.agent.agent_loop import AgentLoop, get_agent_loop
from monailabel.agent.tools import MedAIToolExecutor, TOOL_DEFINITIONS

__all__ = [
    "AgentLoop",
    "get_agent_loop",
    "MedAIToolExecutor",
    "TOOL_DEFINITIONS",
]
