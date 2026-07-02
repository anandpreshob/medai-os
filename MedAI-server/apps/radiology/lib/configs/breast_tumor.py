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


class BreastTumor(TaskConfig):
    """
    Configuration for nnUNet-based breast tumor segmentation.

    Uses pretrained nnUNet model for DCE-MRI breast tumor segmentation.
    Model trained on ~7000 cases from the MAMA dataset.
    """

    def init(self, name: str, model_dir: str, conf: Dict[str, str], planner: Any, **kwargs):
        super().init(name, model_dir, conf, planner, **kwargs)

        # Labels matching the nnUNet model
        self.labels = {
            "tumor": 1,
        }

        # Path to nnUNet model
        # Expected structure: checkpoints/nnunet/full_image_dce_mri_tumor_segmentation/
        self.nnunet_model_folder = os.path.join(
            "/code/checkpoints/nnunet",
            "full_image_dce_mri_tumor_segmentation"
        )

        # Check if model exists
        if not os.path.exists(self.nnunet_model_folder):
            logger.warning(
                f"nnUNet model folder not found at {self.nnunet_model_folder}. "
                "Please mount the model weights."
            )

        # All folds for best accuracy
        self.folds = (0, 1, 2, 3, 4)

        # Use checkpoint_final.pth for each fold
        self.checkpoint_name = "checkpoint_final.pth"

    def infer(self) -> Union[InferTask, Dict[str, InferTask]]:
        task: InferTask = lib.infers.BreastTumor(
            model_folder=self.nnunet_model_folder,
            folds=self.folds,
            checkpoint_name=self.checkpoint_name,
            labels=self.labels,
            description="nnUNet-based breast tumor segmentation from DCE-MRI",
        )
        return task

    def trainer(self) -> Optional[TrainTask]:
        # Training not supported for nnUNet models in this configuration
        # Use nnUNet's native training pipeline instead
        return None
