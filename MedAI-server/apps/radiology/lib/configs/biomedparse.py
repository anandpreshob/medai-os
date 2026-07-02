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
import os
from typing import Any, Dict, Optional, Union

import lib.infers
from monailabel.interfaces.config import TaskConfig
from monailabel.interfaces.tasks.infer_v2 import InferTask
from monailabel.interfaces.tasks.train import TrainTask

logger = logging.getLogger(__name__)


class BiomedParse(TaskConfig):
    """
    Configuration for BiomedParse text-prompted 3D segmentation.

    BiomedParse is a foundation model for medical image segmentation that
    accepts text prompts like "liver" or "liver[SEP]kidney[SEP]spleen" for
    multi-class segmentation.
    """

    def init(self, name: str, model_dir: str, conf: Dict[str, str], planner: Any, **kwargs):
        super().init(name, model_dir, conf, planner, **kwargs)

        # Labels are dynamic - populated from text prompt at runtime
        # We set an empty dict here as a placeholder
        self.labels = {}

        # Path to BiomedParse checkpoint
        self.biomedparse_checkpoint = os.path.join(
            "/code/checkpoints/biomedparse",
            "biomedparse_v2.ckpt"
        )

        # Check if checkpoint exists
        if not os.path.exists(self.biomedparse_checkpoint):
            logger.warning(
                f"BiomedParse checkpoint not found at {self.biomedparse_checkpoint}. "
                "Please download the checkpoint from HuggingFace: microsoft/BiomedParse"
            )

    def infer(self) -> Union[InferTask, Dict[str, InferTask]]:
        task: InferTask = lib.infers.BiomedParse(
            checkpoint_path=self.biomedparse_checkpoint,
            description="BiomedParse text-prompted 3D segmentation",
        )
        return task

    def trainer(self) -> Optional[TrainTask]:
        # Training not supported for BiomedParse in this configuration
        # Use the original BiomedParse training pipeline instead
        return None
