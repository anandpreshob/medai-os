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

"""
MedAI Cloud Orchestrator app.

A deliberately minimal MONAI Label app for the **CPU-only** orchestrator used in
cloud (Vertex AI) deployments. It registers **no GPU inference models** — all
inference runs remotely on the cloud backend — so this app avoids importing the
heavy model stacks (SAM2, detectron2, nnU-Net, TotalSegmentator, BiomedParse).

It still serves the full MONAI Label REST surface the Agent/orchestrator needs:
  - /datastore   (DICOMweb -> Orthanc: patient/image inventory + NIfTI conversion)
  - /batch       (batch job contract; cloud dispatch lives in batch_process.py)
  - /dicomseg    (DICOM-SEG conversion for save-pacs write-back)

Start it with a DICOMweb studies URL so the datastore points at Orthanc and the
dcmqi tools + STOW client that save-pacs needs are provisioned automatically::

    python -m monailabel.main start_server \\
        --app /code/apps/orchestrator \\
        --studies http://orthanc:8042/dicom-web -p 8001
"""

import logging
from typing import Dict

import monailabel
from monailabel.interfaces.app import MONAILabelApp
from monailabel.interfaces.tasks.infer_v2 import InferTask
from monailabel.interfaces.tasks.scoring import ScoringMethod
from monailabel.interfaces.tasks.strategy import Strategy
from monailabel.interfaces.tasks.train import TrainTask

logger = logging.getLogger(__name__)


class OrchestratorApp(MONAILabelApp):
    def __init__(self, app_dir, studies, conf):
        super().__init__(
            app_dir=app_dir,
            studies=studies,
            conf=conf,
            name=f"MedAI Cloud Orchestrator ({monailabel.__version__})",
            description="CPU orchestrator that dispatches batch segmentation to a managed cloud backend",
            version=monailabel.__version__,
        )

    def init_infers(self) -> Dict[str, InferTask]:
        # No local inference models — segmentation runs on the cloud backend.
        return {}

    def init_trainers(self) -> Dict[str, TrainTask]:
        return {}

    def init_strategies(self) -> Dict[str, Strategy]:
        return {}

    def init_scoring_methods(self) -> Dict[str, ScoringMethod]:
        return {}
