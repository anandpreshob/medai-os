# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import logging
from typing import Any, Dict, Optional, Union

import lib.infers
from monailabel.interfaces.config import TaskConfig
from monailabel.interfaces.tasks.infer_v2 import InferTask
from monailabel.interfaces.tasks.train import TrainTask

logger = logging.getLogger(__name__)


class TotalSegmentator(TaskConfig):
    """
    Configuration for TotalSegmentator comprehensive organ segmentation.

    TotalSegmentator is a foundation model for medical image segmentation that
    supports both CT (117 structures) and MR (56 structures) modalities.

    It can segment a wide range of anatomical structures including:
    - CT: All major organs, bones, muscles, and vascular structures
    - MR: Brain and major abdominal/thoracic structures

    Usage:
        - Specify modality: "ct" or "mr"
        - Optional roi_subset: List of specific organs to segment
        - Returns multi-label NIfTI mask
    """

    def init(self, name: str, model_dir: str, conf: Dict[str, str], planner: Any, **kwargs):
        super().init(name, model_dir, conf, planner, **kwargs)

        # Labels are dynamic - populated based on modality and roi_subset at runtime
        self.labels = {}

        # Default modality
        self.default_modality = conf.get("totalsegmentator_modality", "ct")

        logger.info(f"TotalSegmentator initialized with default modality: {self.default_modality}")

        # Check if TotalSegmentator is installed
        try:
            from totalsegmentator.python_api import totalsegmentator
            logger.info("TotalSegmentator is available")
        except ImportError:
            logger.warning(
                "TotalSegmentator not found. Please install with: pip install TotalSegmentator"
            )

    def infer(self) -> Union[InferTask, Dict[str, InferTask]]:
        task: InferTask = lib.infers.TotalSegmentator(
            description="TotalSegmentator for comprehensive CT/MR organ segmentation",
            default_modality=self.default_modality,
        )
        return task

    def trainer(self) -> Optional[TrainTask]:
        # Training not supported for TotalSegmentator in this configuration
        # Use the original TotalSegmentator training pipeline instead
        return None
