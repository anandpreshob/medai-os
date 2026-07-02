# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
LangGraph-based chat orchestration for MedAI.

This module implements a state machine workflow for handling chat messages,
coordinating tool calls, and generating responses with citations.
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Sequence, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from .context_injector import CaseContextInjector, format_context_for_llm
from .prompts.system_prompts import get_system_prompt
from .prompts.tool_selection import INTENT_CLASSIFICATION_PROMPT, get_tool_selection_prompt
from .session_manager import (
    CaseContext,
    ChatMessage,
    ChatSession,
    ChatSource,
    get_session_manager,
)

logger = logging.getLogger(__name__)

# Try to import langgraph
try:
    from langgraph.graph import END, StateGraph
    LANGGRAPH_AVAILABLE = True
except ImportError:
    logger.warning("langgraph not available, using fallback orchestration")
    LANGGRAPH_AVAILABLE = False
    StateGraph = None
    END = "end"


class ChatState(TypedDict):
    """State for the chat orchestration workflow."""

    # Core message state
    messages: Sequence[BaseMessage]
    session_id: str

    # Context and results
    case_context: Optional[Dict[str, Any]]
    rag_results: Optional[List[Dict[str, Any]]]
    pubmed_results: Optional[List[Dict[str, Any]]]
    semantic_scholar_results: Optional[List[Dict[str, Any]]]
    evidence_summary: Optional[Dict[str, Any]]
    report_draft: Optional[Dict[str, str]]

    # Annotation workflow state
    pending_preview_id: Optional[str]
    segmentation_result: Optional[Dict[str, Any]]
    batch_job_id: Optional[str]
    annotation_params: Optional[Dict[str, Any]]
    awaiting_confirmation: bool

    # Workflow control
    current_step: str
    intent: Optional[str]
    tools_to_call: List[str]
    errors: List[str]

    # Response
    final_response: Optional[str]
    sources: List[Dict[str, Any]]
    action_card: Optional[Dict[str, Any]]  # For UI action cards


class ChatOrchestrator:
    """
    Orchestrates chat interactions using LangGraph state machine.

    This class manages the workflow for processing user messages,
    coordinating tool calls, and generating responses with proper citations.
    """

    def __init__(
        self,
        llm_client: Optional[Any] = None,
        mcp_server: Optional[Any] = None,
        use_streaming: bool = False,
    ):
        """
        Initialize the chat orchestrator.

        Args:
            llm_client: LLM client for generating responses
            mcp_server: MCP server for tool execution
            use_streaming: Whether to use streaming responses
        """
        self._llm_client = llm_client
        self._mcp_server = mcp_server
        self._use_streaming = use_streaming
        self._context_injector = CaseContextInjector()
        self._workflow = self._create_workflow() if LANGGRAPH_AVAILABLE else None

        logger.info(
            f"ChatOrchestrator initialized: "
            f"langgraph={'enabled' if LANGGRAPH_AVAILABLE else 'fallback'}, "
            f"streaming={use_streaming}"
        )

    def _create_workflow(self) -> Any:
        """Create the LangGraph workflow."""
        if not LANGGRAPH_AVAILABLE:
            return None

        workflow = StateGraph(ChatState)

        # Add nodes
        workflow.add_node("parse_intent", self._parse_intent_node)
        workflow.add_node("load_case_context", self._load_case_context_node)
        workflow.add_node("plan_tools", self._plan_tools_node)
        workflow.add_node("execute_local_search", self._execute_local_search_node)
        workflow.add_node("execute_external_search", self._execute_external_search_node)
        workflow.add_node("synthesize_evidence", self._synthesize_evidence_node)
        workflow.add_node("draft_report", self._draft_report_node)
        workflow.add_node("generate_response", self._generate_response_node)

        # Annotation workflow nodes
        workflow.add_node("parse_annotation_intent", self._parse_annotation_intent_node)
        workflow.add_node("validate_annotation_params", self._validate_annotation_params_node)
        workflow.add_node("execute_segmentation", self._execute_segmentation_node)
        workflow.add_node("await_confirmation", self._await_confirmation_node)
        workflow.add_node("execute_save", self._execute_save_node)
        workflow.add_node("execute_edit", self._execute_edit_node)
        workflow.add_node("execute_batch", self._execute_batch_node)
        workflow.add_node("load_session", self._load_session_node)
        workflow.add_node("handle_confirmation", self._handle_confirmation_node)

        # Set entry point
        workflow.set_entry_point("parse_intent")

        # Add conditional edges
        workflow.add_conditional_edges(
            "parse_intent",
            self._route_after_intent,
            {
                "load_context": "load_case_context",
                "plan_tools": "plan_tools",
                "generate_response": "generate_response",
                # Annotation routes
                "annotation": "parse_annotation_intent",
                "confirmation": "handle_confirmation",
            },
        )

        workflow.add_edge("load_case_context", "plan_tools")

        workflow.add_conditional_edges(
            "plan_tools",
            self._route_after_planning,
            {
                "local_search": "execute_local_search",
                "external_search": "execute_external_search",
                "draft_report": "draft_report",
                "generate_response": "generate_response",
            },
        )

        workflow.add_conditional_edges(
            "execute_local_search",
            self._route_after_local_search,
            {
                "external_search": "execute_external_search",
                "synthesize": "synthesize_evidence",
                "generate_response": "generate_response",
            },
        )

        workflow.add_conditional_edges(
            "execute_external_search",
            self._route_after_external_search,
            {
                "synthesize": "synthesize_evidence",
                "generate_response": "generate_response",
            },
        )

        workflow.add_edge("synthesize_evidence", "generate_response")
        workflow.add_edge("draft_report", "generate_response")

        # Annotation workflow edges
        workflow.add_conditional_edges(
            "parse_annotation_intent",
            self._route_annotation_intent,
            {
                "segmentation": "validate_annotation_params",
                "save": "execute_save",
                "edit": "execute_edit",
                "batch": "execute_batch",
                "load": "load_session",
                "generate_response": "generate_response",
            },
        )

        workflow.add_edge("validate_annotation_params", "execute_segmentation")
        workflow.add_edge("execute_segmentation", "await_confirmation")
        workflow.add_edge("await_confirmation", "generate_response")
        workflow.add_edge("execute_save", "generate_response")
        workflow.add_edge("execute_edit", "await_confirmation")
        workflow.add_edge("execute_batch", "generate_response")
        workflow.add_edge("load_session", "generate_response")
        workflow.add_edge("handle_confirmation", "generate_response")

        workflow.add_edge("generate_response", END)

        return workflow.compile()

    async def process_message(
        self,
        session_id: str,
        user_message: str,
        include_sources: bool = True,
    ) -> Dict[str, Any]:
        """
        Process a user message and generate a response.

        Args:
            session_id: The chat session ID
            user_message: The user's message
            include_sources: Whether to include source citations

        Returns:
            Dict with response, sources, and metadata
        """
        session_manager = get_session_manager()
        session = session_manager.get_session(session_id)

        if session is None:
            return {
                "error": "Session not found",
                "session_id": session_id,
            }

        # Add user message to session
        session_manager.add_message(session_id, "user", user_message)

        # Build initial state
        initial_state = self._build_initial_state(session, user_message)

        # Run workflow or fallback
        if self._workflow:
            final_state = await self._run_workflow(initial_state)
        else:
            final_state = await self._fallback_process(initial_state)

        # Extract response
        response_content = final_state.get("final_response", "")
        sources = final_state.get("sources", [])

        # Add assistant message to session
        chat_sources = [
            ChatSource(
                type=s.get("type", "guideline"),
                title=s.get("title", "Unknown"),
                authors=s.get("authors"),
                url=s.get("url"),
                excerpt=s.get("excerpt"),
                relevance_score=s.get("relevance_score"),
            )
            for s in sources
        ] if include_sources else None

        session_manager.add_message(
            session_id, "assistant", response_content, sources=chat_sources
        )

        return {
            "session_id": session_id,
            "message": response_content,
            "sources": sources if include_sources else [],
            "case_context_used": final_state.get("case_context") is not None,
            "workflow_steps": final_state.get("current_step", ""),
            "errors": final_state.get("errors", []),
        }

    def _build_initial_state(
        self, session: ChatSession, user_message: str
    ) -> ChatState:
        """Build the initial workflow state from session and message."""
        # Convert session messages to LangChain format
        messages: List[BaseMessage] = []

        # Add system prompt
        system_prompt = get_system_prompt(
            task_type="qa",
            modality=session.cached_case_context.modality
            if session.cached_case_context
            else None,
            body_region=session.cached_case_context.body_region
            if session.cached_case_context
            else None,
        )
        messages.append(SystemMessage(content=system_prompt))

        # Add conversation history (last 10 messages)
        for msg in session.messages[-10:]:
            if msg.role == "user":
                messages.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                messages.append(AIMessage(content=msg.content))

        # Add current user message
        messages.append(HumanMessage(content=user_message))

        # Convert case context to dict if available
        case_context_dict = None
        if session.cached_case_context:
            case_context_dict = session.cached_case_context.to_dict()

        return ChatState(
            messages=messages,
            session_id=session.session_id,
            case_context=case_context_dict,
            rag_results=None,
            pubmed_results=None,
            semantic_scholar_results=None,
            evidence_summary=None,
            report_draft=None,
            # Annotation workflow state
            pending_preview_id=None,
            segmentation_result=None,
            batch_job_id=None,
            annotation_params=None,
            awaiting_confirmation=False,
            # Workflow control
            current_step="init",
            intent=None,
            tools_to_call=[],
            errors=[],
            final_response=None,
            sources=[],
            action_card=None,
        )

    async def _run_workflow(self, initial_state: ChatState) -> ChatState:
        """Run the LangGraph workflow."""
        try:
            # LangGraph workflow execution
            final_state = self._workflow.invoke(initial_state)
            return final_state
        except Exception as e:
            logger.error(f"Workflow execution error: {e}")
            return {
                **initial_state,
                "errors": initial_state.get("errors", []) + [str(e)],
                "final_response": "I apologize, but I encountered an error processing your request. Please try again.",
                "current_step": "error",
            }

    async def _fallback_process(self, state: ChatState) -> ChatState:
        """Fallback processing when LangGraph is not available."""
        try:
            # Simple intent classification
            user_message = state["messages"][-1].content

            # Determine intent based on keywords
            intent = self._simple_intent_classification(user_message)
            state["intent"] = intent
            state["current_step"] = "intent_classified"

            # Generate response based on intent
            if intent == "greeting":
                state["final_response"] = (
                    "Hello! I'm MedAI, your radiology assistant. "
                    "I can help you with questions about imaging findings, "
                    "radiology guidelines, and medical literature. How can I assist you today?"
                )
            else:
                # Generate a basic response
                state["final_response"] = await self._generate_basic_response(state)

            state["current_step"] = "complete"
            return state

        except Exception as e:
            logger.error(f"Fallback processing error: {e}")
            state["errors"].append(str(e))
            state["final_response"] = "I apologize, but I encountered an error. Please try again."
            return state

    def _simple_intent_classification(self, message: str) -> str:
        """Simple keyword-based intent classification."""
        message_lower = message.lower()

        # Check for greetings first
        if any(
            word in message_lower
            for word in ["hello", "hi ", "hey", "good morning", "good afternoon"]
        ):
            return "greeting"

        # Check for confirmation/rejection (usually short messages)
        if len(message.split()) <= 5:
            confirm_keywords = ["yes", "accept", "confirm", "ok", "okay", "approve", "looks good", "do it"]
            reject_keywords = ["no", "reject", "cancel", "redo", "try again", "wrong"]
            if any(kw in message_lower for kw in confirm_keywords):
                return "confirm_action"
            if any(kw in message_lower for kw in reject_keywords):
                return "reject_action"

        # Check for edit requests
        edit_keywords = [
            "grow", "shrink", "smooth", "delete", "edit", "modify",
            "bigger", "smaller", "expand", "contract", "merge", "fill hole",
        ]
        if any(keyword in message_lower for keyword in edit_keywords):
            return "edit_request"

        # Check for batch processing
        if "batch" in message_lower or (
            "all" in message_lower and any(
                kw in message_lower for kw in ["segment", "process", "studies", "images"]
            )
        ):
            return "batch_request"

        # Check for save requests
        save_keywords = [
            "save", "export", "download", "keep", "store",
            "nifti", "dicom-seg", "pacs",
        ]
        if any(keyword in message_lower for keyword in save_keywords):
            return "save_request"

        # Check for session load requests
        load_keywords = [
            "load", "open", "continue", "resume", "previous",
            "yesterday", "last week", "earlier",
        ]
        if any(keyword in message_lower for keyword in load_keywords):
            return "session_load"

        # Check for segmentation requests
        segment_keywords = [
            "segment", "outline", "identify", "find", "detect",
            "mark", "label", "contour", "delineate",
        ]
        if any(keyword in message_lower for keyword in segment_keywords):
            return "segmentation_request"

        # Check for report generation requests
        report_keywords = [
            "draft", "generate report", "write report", "create report",
            "write the findings", "write the impression", "write a report",
            "draft the", "generate the", "impression", "generate a report",
        ]
        # Also check for "generate" + "report" separately
        if any(keyword in message_lower for keyword in report_keywords):
            return "report_request"
        if "generate" in message_lower and "report" in message_lower:
            return "report_request"

        # Check for evidence/literature requests
        evidence_keywords = [
            "evidence", "literature", "studies", "research", "pubmed",
            "what does the literature", "find studies", "show me articles",
            "latest research", "clinical studies",
        ]
        if any(keyword in message_lower for keyword in evidence_keywords):
            return "evidence_request"

        # Check for case analysis requests
        case_keywords = [
            "this case", "current study", "this image", "these findings",
            "analyze the", "what are the findings", "summarize this",
            "in this study", "based on this",
        ]
        if any(keyword in message_lower for keyword in case_keywords):
            return "case_analysis"

        return "question"

    async def _generate_basic_response(self, state: ChatState) -> str:
        """Generate a basic response using the LLM client."""
        if self._llm_client is None:
            return (
                "I understand your question. To provide a detailed response, "
                "I would need access to the knowledge base and literature search tools. "
                "Please ensure the backend services are properly configured."
            )

        try:
            # Convert LangChain messages to OpenAI format
            messages = []
            for m in state["messages"]:
                if isinstance(m, SystemMessage):
                    messages.append({"role": "system", "content": m.content})
                elif isinstance(m, HumanMessage):
                    messages.append({"role": "user", "content": m.content})
                elif isinstance(m, AIMessage):
                    messages.append({"role": "assistant", "content": m.content})

            response = await self._llm_client.generate(messages=messages)
            return response
        except Exception as e:
            logger.error(f"LLM generation error: {e}")
            return "I apologize, but I couldn't generate a response at this time."

    # Workflow node implementations
    def _parse_intent_node(self, state: ChatState) -> dict:
        """Parse user intent from the message."""
        user_message = state["messages"][-1].content
        intent = self._simple_intent_classification(user_message)

        return {
            "intent": intent,
            "current_step": "intent_parsed",
        }

    def _load_case_context_node(self, state: ChatState) -> dict:
        """Load case context from viewer session."""
        session_manager = get_session_manager()
        session = session_manager.get_session(state["session_id"])

        case_context = None
        if session and session.cached_case_context:
            case_context = session.cached_case_context.to_dict()

        return {
            "case_context": case_context,
            "current_step": "context_loaded",
        }

    def _plan_tools_node(self, state: ChatState) -> dict:
        """Plan which tools to call based on intent."""
        intent = state.get("intent", "question")
        has_context = state.get("case_context") is not None

        tools = []

        if intent == "question":
            tools = ["local_rag_search"]
        elif intent == "evidence_request":
            tools = ["local_rag_search", "pubmed_search"]
        elif intent == "report_request":
            if has_context:
                tools = ["local_rag_search", "report_agent"]
            else:
                tools = ["local_rag_search"]
        elif intent == "case_analysis":
            if has_context:
                tools = ["case_context", "local_rag_search"]
            else:
                tools = ["local_rag_search"]

        return {
            "tools_to_call": tools,
            "current_step": "tools_planned",
        }

    def _execute_local_search_node(self, state: ChatState) -> dict:
        """Execute local RAG search."""
        return {
            "rag_results": [],
            "current_step": "local_search_complete",
        }

    def _execute_external_search_node(self, state: ChatState) -> dict:
        """Execute external search (PubMed, Semantic Scholar)."""
        return {
            "pubmed_results": [],
            "semantic_scholar_results": [],
            "current_step": "external_search_complete",
        }

    def _synthesize_evidence_node(self, state: ChatState) -> dict:
        """Synthesize evidence from multiple sources."""
        return {
            "evidence_summary": {},
            "current_step": "evidence_synthesized",
        }

    def _draft_report_node(self, state: ChatState) -> dict:
        """Draft report sections."""
        return {
            "report_draft": {},
            "current_step": "report_drafted",
        }

    def _generate_response_node(self, state: ChatState) -> dict:
        """Generate the final response."""
        import asyncio

        # Compile sources
        sources = []

        if state.get("rag_results"):
            for result in state["rag_results"]:
                sources.append({
                    "type": "guideline",
                    "title": result.get("title", "Unknown"),
                    "excerpt": result.get("content", "")[:200],
                    "relevance_score": result.get("score"),
                })

        if state.get("pubmed_results"):
            for article in state["pubmed_results"]:
                sources.append({
                    "type": "pubmed",
                    "title": article.get("title", "Unknown"),
                    "authors": article.get("authors", []),
                    "url": article.get("url"),
                    "excerpt": article.get("abstract", "")[:200],
                })

        intent = state.get("intent", "question")

        if intent == "greeting":
            response = (
                "Hello! I'm MedAI, your radiology assistant. "
                "I can help you with imaging questions, guidelines, and literature search. "
                "How can I assist you today?"
            )
        elif self._llm_client is not None:
            # Use the LLM to generate a response (sync call via httpx)
            try:
                response = self._sync_llm_generate(state)
            except Exception as e:
                logger.error(f"LLM response generation error: {e}")
                response = self._compile_response(state)
        else:
            response = self._compile_response(state)

        return {
            "final_response": response,
            "sources": sources,
            "current_step": "response_generated",
        }

    def _sync_llm_generate(self, state: ChatState) -> str:
        """Synchronously call the LLM client for use in LangGraph nodes."""
        import httpx

        # Build messages for vLLM, ensuring alternating user/assistant roles.
        # Merge system prompt into first user message since MedGemma doesn't support system role.
        # Also merge consecutive same-role messages.
        system_content = ""
        raw_messages = []
        for m in state["messages"]:
            if isinstance(m, SystemMessage):
                system_content += m.content + "\n\n"
            elif isinstance(m, HumanMessage):
                raw_messages.append({"role": "user", "content": m.content})
            elif isinstance(m, AIMessage):
                raw_messages.append({"role": "assistant", "content": m.content})

        # Prepend system content to first user message
        if system_content and raw_messages and raw_messages[0]["role"] == "user":
            raw_messages[0]["content"] = system_content + raw_messages[0]["content"]

        # Merge consecutive same-role messages
        messages = []
        for msg in raw_messages:
            if messages and messages[-1]["role"] == msg["role"]:
                messages[-1]["content"] += "\n\n" + msg["content"]
            else:
                messages.append(msg)

        payload = {
            "model": self._llm_client.model,
            "messages": messages,
            "max_tokens": 2048,
            "temperature": 0.3,
        }

        logger.info(f"LLM request: {len(messages)} messages, model={self._llm_client.model}, roles={[m['role'] for m in messages]}, content_lens={[len(m['content']) for m in messages]}")
        with httpx.Client(timeout=120.0) as client:
            response = client.post(
                f"{self._llm_client.base_url}/v1/chat/completions",
                json=payload,
            )
            if not response.is_success:
                logger.error(f"LLM response error body: {response.text}")
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    def _compile_response(self, state: ChatState) -> str:
        """Compile a response from the gathered information."""
        parts = []

        # Include case context summary if available
        if state.get("case_context"):
            context = state["case_context"]
            parts.append(
                f"Based on the current case ({context.get('modality', 'Unknown')} "
                f"- {context.get('body_region', 'Unknown region')}):\n"
            )

        # Include evidence summary if available
        if state.get("evidence_summary"):
            summary = state["evidence_summary"]
            if summary.get("summary"):
                parts.append(f"\n{summary['summary']}\n")

        # Include report draft if available
        if state.get("report_draft"):
            draft = state["report_draft"]
            if draft.get("content"):
                parts.append(f"\n{draft['content']}\n")

        if not parts:
            # Default response when no specific content
            parts.append(
                "I'd be happy to help with your question. "
                "For the most accurate response, please ensure the knowledge base "
                "and literature search services are available."
            )

        return "\n".join(parts)

    # Annotation workflow node implementations
    def _parse_annotation_intent_node(self, state: ChatState) -> dict:
        """Parse detailed annotation intent from message."""
        from .prompts.annotation_prompts import (
            extract_segmentation_targets,
            extract_edit_operation,
        )

        user_message = state["messages"][-1].content
        intent = state.get("intent", "question")

        annotation_params = {}

        if intent == "segmentation_request":
            targets = extract_segmentation_targets(user_message)
            # Extract model preference from message (e.g., "use biomedparse")
            from .prompts.annotation_prompts import extract_model_from_prompt
            model = extract_model_from_prompt(user_message) or "biomedparse"
            annotation_params = {
                "targets": targets,
                "action": "segment",
                "model": model,
            }
        elif intent == "edit_request":
            edit_info = extract_edit_operation(user_message)
            annotation_params = {
                "action": "edit",
                **edit_info,
            }
        elif intent == "save_request":
            annotation_params = {"action": "save"}
            if "nifti" in user_message.lower():
                annotation_params["format"] = "nifti"
            elif "dicom" in user_message.lower():
                annotation_params["format"] = "dicom-seg"
            elif "png" in user_message.lower():
                annotation_params["format"] = "png"
            if "pacs" in user_message.lower():
                annotation_params["destination"] = "pacs"
        elif intent == "batch_request":
            # Extract model preference for batch processing
            from .prompts.annotation_prompts import extract_model_from_prompt
            batch_model = extract_model_from_prompt(user_message) or "biomedparse"
            annotation_params = {
                "action": "batch",
                "targets": extract_segmentation_targets(user_message),
                "model": batch_model,
            }
        elif intent == "session_load":
            annotation_params = {
                "action": "load",
                "query": user_message,
            }

        return {
            "annotation_params": annotation_params,
            "current_step": "annotation_intent_parsed",
        }

    def _validate_annotation_params_node(self, state: ChatState) -> dict:
        """Validate annotation parameters before execution."""
        params = state.get("annotation_params", {})
        errors = list(state.get("errors", []))

        if params.get("action") == "segment":
            if not state.get("case_context"):
                errors.append("No image loaded. Please load an image first.")

        if state.get("pending_preview_id") and params.get("action") == "segment":
            errors.append("You have a pending segmentation preview. Please accept or reject it first.")

        return {
            "errors": errors,
            "current_step": "annotation_params_validated",
        }

    def _execute_segmentation_node(self, state: ChatState) -> dict:
        """Execute segmentation using MCP tool."""
        params = state.get("annotation_params", {})

        # Check for validation errors
        if state.get("errors"):
            return {}

        # Get model from params (extracted from user message)
        model = params.get("model", "biomedparse")

        # In a full implementation, this would call the MCP tool
        # For now, return mock result
        segmentation_result = {
            "preview_id": f"prev_{state['session_id'][:8]}",
            "labels": [
                {"label_id": 1, "label_name": target, "voxel_count": 50000}
                for target in params.get("targets", ["segmentation"])
            ],
            "model_used": model,  # Use extracted model preference
            "confidence": 0.87,
            "inference_time_ms": 2500,
        }

        return {
            "segmentation_result": segmentation_result,
            "pending_preview_id": segmentation_result["preview_id"],
            "awaiting_confirmation": True,
            "current_step": "segmentation_executed",
        }

    def _await_confirmation_node(self, state: ChatState) -> dict:
        """Prepare response that awaits user confirmation."""
        from .prompts.annotation_prompts import get_segmentation_confirmation_message

        result = state.get("segmentation_result", {})

        # Generate confirmation message
        message = get_segmentation_confirmation_message(
            labels=result.get("labels", []),
            model_used=result.get("model_used", "unknown"),
            confidence=result.get("confidence"),
            inference_time_ms=result.get("inference_time_ms", 0),
        )

        # Create action card for UI
        action_card = {
            "type": "annotation_preview",
            "preview_id": result.get("preview_id"),
            "labels": result.get("labels", []),
            "thumbnail_url": result.get("thumbnail_url"),
            "actions": ["accept", "edit", "reject"],
        }

        return {
            "final_response": message,
            "action_card": action_card,
            "current_step": "awaiting_confirmation",
        }

    def _execute_save_node(self, state: ChatState) -> dict:
        """Execute save annotation operation."""
        from .prompts.annotation_prompts import get_save_confirmation_message

        params = state.get("annotation_params", {})
        preview_id = state.get("pending_preview_id")

        if not preview_id:
            return {
                "final_response": "No segmentation to save. Please create a segmentation first.",
                "current_step": "save_no_preview",
            }

        format = params.get("format", "nifti")
        destination = params.get("destination", "local")

        message = f"Saved segmentation as {format.upper()}"
        if destination == "pacs":
            message += " and uploaded to PACS"

        return {
            "final_response": message,
            "pending_preview_id": None,
            "awaiting_confirmation": False,
            "current_step": "save_executed",
        }

    def _execute_edit_node(self, state: ChatState) -> dict:
        """Execute edit annotation operation."""
        from .prompts.annotation_prompts import get_edit_confirmation_message

        params = state.get("annotation_params", {})
        operation = params.get("operation", "unknown")

        # In full implementation, call edit_annotation tool
        message = get_edit_confirmation_message(
            operation=operation,
            label_name=params.get("target_label", "segmentation"),
            changes_summary=f"Applied {operation} operation",
        )

        action_card = {
            "type": "edit_preview",
            "operation": operation,
            "actions": ["accept", "reject"],
        }

        return {
            "final_response": message,
            "action_card": action_card,
            "awaiting_confirmation": True,
            "current_step": "edit_executed",
        }

    def _execute_batch_node(self, state: ChatState) -> dict:
        """Execute batch processing operation."""
        from .prompts.annotation_prompts import get_batch_confirmation_message

        params = state.get("annotation_params", {})
        targets = params.get("targets", ["segmentation"])

        # In full implementation, call batch_process tool
        message = get_batch_confirmation_message(
            total_images=5,  # Mock
            model="biomedparse",
            prompt=", ".join(targets),
            estimated_time_s=25.0,
        )

        action_card = {
            "type": "batch_confirmation",
            "total_images": 5,
            "actions": ["start", "cancel"],
        }

        return {
            "final_response": message,
            "action_card": action_card,
            "current_step": "batch_started",
        }

    def _load_session_node(self, state: ChatState) -> dict:
        """Load previous annotation session."""
        from .prompts.annotation_prompts import get_session_load_message

        params = state.get("annotation_params", {})
        query = params.get("query", "")

        # In full implementation, call load_session tool
        message = get_session_load_message(
            session_id="sess_mock_12345",
            study_description="CT Abdomen",
            modality="CT",
            segmentations=[
                {"labels": ["liver"], "is_verified": True},
                {"labels": ["spleen"], "is_verified": False},
            ],
        )

        return {
            "final_response": message,
            "current_step": "session_loaded",
        }

    def _handle_confirmation_node(self, state: ChatState) -> dict:
        """Handle user confirmation or rejection of pending action."""
        intent = state.get("intent")
        preview_id = state.get("pending_preview_id")

        if intent == "confirm_action":
            if preview_id:
                return {
                    "final_response": "Great! I've accepted the segmentation. Would you like to save it?",
                    "awaiting_confirmation": False,
                    "current_step": "confirmation_accepted",
                }
            else:
                return {
                    "final_response": "Nothing to confirm at the moment.",
                    "current_step": "no_pending_action",
                }

        elif intent == "reject_action":
            if preview_id:
                return {
                    "final_response": "I've discarded the preview. Would you like to try again with different parameters?",
                    "pending_preview_id": None,
                    "awaiting_confirmation": False,
                    "current_step": "confirmation_rejected",
                }
            else:
                return {
                    "final_response": "Nothing to reject at the moment.",
                    "current_step": "no_pending_action",
                }

        return {}

    # Annotation routing function
    def _route_annotation_intent(self, state: ChatState) -> str:
        """Route based on annotation intent."""
        params = state.get("annotation_params", {})
        action = params.get("action", "")

        if action == "segment":
            return "segmentation"
        elif action == "save":
            return "save"
        elif action == "edit":
            return "edit"
        elif action == "batch":
            return "batch"
        elif action == "load":
            return "load"

        return "generate_response"

    # Routing functions
    def _route_after_intent(self, state: ChatState) -> str:
        """Route after intent parsing."""
        intent = state.get("intent", "question")

        if intent == "greeting":
            return "generate_response"

        # Check for confirmation/rejection intents
        if intent in ("confirm_action", "reject_action"):
            return "confirmation"

        # Check for annotation-related intents
        annotation_intents = [
            "segmentation_request", "save_request", "batch_request",
            "session_load", "edit_request",
        ]
        if intent in annotation_intents:
            return "annotation"

        # Check if we have a viewer session and need context
        session_manager = get_session_manager()
        session = session_manager.get_session(state["session_id"])

        if session and session.has_viewer_link and not state.get("case_context"):
            return "load_context"

        return "plan_tools"

    def _route_after_planning(self, state: ChatState) -> str:
        """Route after tool planning."""
        tools = state.get("tools_to_call", [])

        if not tools:
            return "generate_response"

        if "report_agent" in tools:
            return "draft_report"

        if "local_rag_search" in tools:
            return "local_search"

        if any(t in tools for t in ["pubmed_search", "semantic_scholar_search"]):
            return "external_search"

        return "generate_response"

    def _route_after_local_search(self, state: ChatState) -> str:
        """Route after local search."""
        tools = state.get("tools_to_call", [])

        if any(t in tools for t in ["pubmed_search", "semantic_scholar_search"]):
            return "external_search"

        if state.get("rag_results") and len(state["rag_results"]) > 1:
            return "synthesize"

        return "generate_response"

    def _route_after_external_search(self, state: ChatState) -> str:
        """Route after external search."""
        has_multiple_sources = (
            bool(state.get("rag_results"))
            or bool(state.get("pubmed_results"))
            or bool(state.get("semantic_scholar_results"))
        )

        if has_multiple_sources:
            return "synthesize"

        return "generate_response"


# Global orchestrator instance
_orchestrator: Optional[ChatOrchestrator] = None


def get_orchestrator(
    llm_client: Optional[Any] = None,
    mcp_server: Optional[Any] = None,
) -> ChatOrchestrator:
    """Get or create the global orchestrator instance."""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = ChatOrchestrator(
            llm_client=llm_client,
            mcp_server=mcp_server,
        )
    return _orchestrator


def reset_orchestrator() -> None:
    """Reset the global orchestrator (for testing)."""
    global _orchestrator
    _orchestrator = None
