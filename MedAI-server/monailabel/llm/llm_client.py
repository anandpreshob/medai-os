# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Configurable LLM client for radiology report generation.
Supports OpenAI GPT-4V, Google Gemini, and other vision-capable models.
"""

import base64
import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class LLMConfig:
    """Configuration for LLM client."""

    provider: str = "gemini"  # openai, gemini
    model: str = "gemini-2.0-flash"  # Model with vision capabilities
    api_key: Optional[str] = None
    max_tokens: int = 4096
    temperature: float = 0.3  # Lower for more deterministic medical outputs
    base_url: Optional[str] = None  # For custom endpoints

    @classmethod
    def from_env(cls) -> "LLMConfig":
        """Create config from environment variables."""
        # Determine provider and API key
        provider = os.getenv("LLM_PROVIDER", "").lower()

        # Auto-detect provider based on available API keys if not specified
        if not provider:
            if os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
                provider = "gemini"
            elif os.getenv("OPENAI_API_KEY"):
                provider = "openai"
            else:
                provider = "gemini"  # Default to gemini (free tier available)

        # Get appropriate API key based on provider
        if provider == "gemini":
            api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or os.getenv("LLM_API_KEY")
            default_model = "models/gemini-2.5-flash"  # Free tier model with vision
        else:
            api_key = os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY")
            default_model = "gpt-4o"

        return cls(
            provider=provider,
            model=os.getenv("LLM_MODEL", default_model),
            api_key=api_key,
            max_tokens=int(os.getenv("LLM_MAX_TOKENS", "4096")),
            temperature=float(os.getenv("LLM_TEMPERATURE", "0.3")),
            base_url=os.getenv("LLM_BASE_URL"),
        )


class LLMClient:
    """
    Client for interacting with LLM APIs for report generation.
    Supports vision models for analyzing medical images.
    """

    def __init__(self, config: Optional[LLMConfig] = None):
        """
        Initialize LLM client.

        Args:
            config: LLM configuration. If None, loads from environment.
        """
        self.config = config or LLMConfig.from_env()
        self._openai_client = None
        self._gemini_model = None

        if not self.config.api_key:
            logger.warning(
                "No API key configured. Set GEMINI_API_KEY, GOOGLE_API_KEY, or OPENAI_API_KEY environment variable."
            )

    def _get_openai_client(self):
        """Get or create OpenAI client."""
        if self._openai_client is None:
            try:
                from openai import OpenAI

                client_kwargs = {"api_key": self.config.api_key}
                if self.config.base_url:
                    client_kwargs["base_url"] = self.config.base_url

                self._openai_client = OpenAI(**client_kwargs)
            except ImportError:
                raise ImportError(
                    "OpenAI package not installed. Run: pip install openai"
                )
        return self._openai_client

    def _get_gemini_model(self):
        """Get or create Gemini model client."""
        if self._gemini_model is None:
            try:
                import google.generativeai as genai

                genai.configure(api_key=self.config.api_key)
                self._gemini_model = genai.GenerativeModel(self.config.model)
            except ImportError:
                raise ImportError(
                    "Google Generative AI package not installed. Run: pip install google-generativeai"
                )
        return self._gemini_model

    def generate_report(
        self,
        system_prompt: str,
        user_message: str,
        image_base64: Optional[str] = None,
        additional_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Generate a radiology report using the LLM.

        Args:
            system_prompt: System instructions for the model
            user_message: User's request/prompt
            image_base64: Optional base64-encoded image (mosaic)
            additional_context: Optional additional context data

        Returns:
            Dictionary with generated report sections
        """
        if not self.config.api_key:
            raise ValueError(
                "API key not configured. Set GEMINI_API_KEY or OPENAI_API_KEY environment variable."
            )

        if self.config.provider == "gemini":
            return self._generate_gemini(
                system_prompt, user_message, image_base64, additional_context
            )
        elif self.config.provider == "openai":
            return self._generate_openai(
                system_prompt, user_message, image_base64, additional_context
            )
        else:
            raise ValueError(f"Unsupported LLM provider: {self.config.provider}")

    def _generate_gemini(
        self,
        system_prompt: str,
        user_message: str,
        image_base64: Optional[str] = None,
        additional_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Generate report using Google Gemini API."""
        import google.generativeai as genai
        from PIL import Image
        import io

        model = self._get_gemini_model()

        # Build the prompt
        full_message = f"{system_prompt}\n\n{user_message}"
        if additional_context:
            full_message += f"\n\nAdditional Context:\n{json.dumps(additional_context, indent=2)}"

        logger.info(f"Calling Gemini {self.config.model} with vision...")

        try:
            # Prepare content parts
            content_parts = []

            # Add image if provided
            if image_base64:
                # Handle data URL format
                if image_base64.startswith("data:"):
                    image_data = image_base64.split(",", 1)[1] if "," in image_base64 else image_base64
                else:
                    image_data = image_base64

                # Decode base64 to image
                image_bytes = base64.b64decode(image_data)
                image = Image.open(io.BytesIO(image_bytes))
                content_parts.append(image)

            # Add text prompt
            content_parts.append(full_message)

            # Generate with Gemini
            generation_config = genai.types.GenerationConfig(
                max_output_tokens=self.config.max_tokens,
                temperature=self.config.temperature,
            )

            response = model.generate_content(
                content_parts,
                generation_config=generation_config,
            )

            response_text = response.text
            logger.debug(f"Raw Gemini response:\n{response_text}")

            # Parse the structured response
            return self._parse_report_response(response_text)

        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            raise

    def _generate_openai(
        self,
        system_prompt: str,
        user_message: str,
        image_base64: Optional[str] = None,
        additional_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Generate report using OpenAI API."""
        client = self._get_openai_client()

        messages = [{"role": "system", "content": system_prompt}]

        # Build user message content
        user_content: List[Dict[str, Any]] = []

        # Add text content
        full_message = user_message
        if additional_context:
            full_message += f"\n\nAdditional Context:\n{json.dumps(additional_context, indent=2)}"

        user_content.append({"type": "text", "text": full_message})

        # Add image if provided
        if image_base64:
            # Handle data URL format
            if image_base64.startswith("data:"):
                # Extract base64 part from data URL
                image_data = image_base64.split(",", 1)[1] if "," in image_base64 else image_base64
            else:
                image_data = image_base64

            user_content.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{image_data}",
                        "detail": "high",  # High detail for medical images
                    },
                }
            )

        messages.append({"role": "user", "content": user_content})

        logger.info(f"Calling OpenAI {self.config.model} with vision...")

        try:
            response = client.chat.completions.create(
                model=self.config.model,
                messages=messages,
                max_tokens=self.config.max_tokens,
                temperature=self.config.temperature,
            )

            response_text = response.choices[0].message.content
            logger.debug(f"Raw LLM response:\n{response_text}")

            # Parse the structured response
            return self._parse_report_response(response_text)

        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            raise

    def _parse_report_response(self, response_text: str) -> Dict[str, Any]:
        """
        Parse the LLM response into structured report sections.

        Expected format from LLM:
        ## CLINICAL HISTORY
        ...
        ## TECHNIQUE
        ...
        ## COMPARISON
        ...
        ## FINDINGS
        ...
        ## IMPRESSION
        ...
        ## RECOMMENDATIONS
        ...
        """
        sections = {
            "clinicalHistory": "",
            "technique": "",
            "comparison": "",
            "findings": "",
            "aiFindings": "",
            "impression": "",
            "recommendations": "",
        }

        # Section header mappings
        header_map = {
            "CLINICAL HISTORY": "clinicalHistory",
            "CLINICAL_HISTORY": "clinicalHistory",
            "HISTORY": "clinicalHistory",
            "TECHNIQUE": "technique",
            "COMPARISON": "comparison",
            "PRIOR COMPARISON": "comparison",
            "FINDINGS": "findings",
            "RADIOLOGIST FINDINGS": "findings",
            "RADIOLOGIST'S FINDINGS": "findings",
            "AI FINDINGS": "aiFindings",
            "AI-GENERATED FINDINGS": "aiFindings",
            "AI ANALYSIS": "aiFindings",
            "MEDGEMMA FINDINGS": "aiFindings",
            "IMPRESSION": "impression",
            "CONCLUSION": "impression",
            "RECOMMENDATIONS": "recommendations",
            "RECOMMENDATION": "recommendations",
        }

        current_section = None
        current_content = []

        for line in response_text.split("\n"):
            line_stripped = line.strip()

            # Check if this is a section header
            header_found = False
            for header, section_key in header_map.items():
                if (
                    line_stripped.upper().startswith(f"## {header}")
                    or line_stripped.upper().startswith(f"**{header}")
                    or line_stripped.upper() == header
                    or line_stripped.upper() == f"{header}:"
                ):
                    # Save previous section
                    if current_section and current_content:
                        sections[current_section] = "\n".join(current_content).strip()

                    current_section = section_key
                    current_content = []
                    header_found = True
                    break

            if not header_found and current_section:
                # Remove leading markdown formatting
                clean_line = line_stripped.lstrip("#").lstrip("*").strip()
                if clean_line:
                    current_content.append(clean_line)

        # Save the last section
        if current_section and current_content:
            sections[current_section] = "\n".join(current_content).strip()

        # If parsing failed, put everything in findings
        if not any(sections.values()):
            sections["findings"] = response_text

        return {
            "sections": sections,
            "rawResponse": response_text,
        }

    def validate_connection(self) -> bool:
        """
        Validate that the LLM API connection is working.

        Returns:
            True if connection is valid
        """
        if not self.config.api_key:
            return False

        try:
            if self.config.provider == "gemini":
                # For Gemini, try to get the model
                model = self._get_gemini_model()
                # Make a minimal API call
                response = model.generate_content("Hello")
                return True
            else:
                client = self._get_openai_client()
                # Make a minimal API call
                response = client.models.list()
                return True
        except Exception as e:
            logger.error(f"LLM connection validation failed: {e}")
            return False
