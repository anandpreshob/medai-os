# MedAI Server Dockerfile
# Supports: nnUNet (auto-segmentation), nnInteractive, SAM2, SAM3 (interactive)
#
# IMPORTANT: This Dockerfile pins all critical dependencies to avoid version mismatches.
# If you need to update a dependency, test thoroughly before deploying.
#
# To deploy code changes without rebuilding the entire image:
#   docker cp ./apps/radiology/lib/infers/biomedparse.py medai-monai-label:/code/apps/radiology/lib/infers/
#   docker restart medai-monai-label

FROM nvidia/cuda:12.1.1-devel-ubuntu22.04

# Install system dependencies
RUN apt update -y && apt install -y \
    openslide-tools \
    build-essential \
    python3-pip \
    python3-dev \
    python-is-python3 \
    ffmpeg \
    libsm6 \
    libxext6 \
    libxcb-xinerama0 \
    libxcb1 \
    wget \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /code

# Create directories
RUN mkdir -p /install /install-3 /code/assets /code/checkpoints /code/studies

# Copy requirements first for better caching
COPY ./requirements.txt ./

# Copy SAM3 package (local)
COPY ./sam3/. /install-3/
COPY ./sam3/assets/bpe_simple_vocab_16e6.txt.gz /code/assets/

# Set library path
ENV LD_LIBRARY_PATH=$LD_LIBRARY_PATH:"/usr/local/nvidia/lib64"

# Install Python packages with pinned versions
RUN pip install --upgrade pip==24.0 setuptools==69.5.1 wheel==0.43.0

# Clone and install SAM2 from GitHub at specific commit (from working server)
RUN git clone https://github.com/facebookresearch/sam2.git /install && \
    cd /install && git checkout 2b90b9f5ceec907a1c18123530e92e794ad901a4 && pip install -e .

# Install SAM3
RUN pip install -e /install-3/.

# Patch SAM3 with medical imaging support (load_medical_slices)
COPY ./sam3/sam3/model/utils/sam2_utils.py /install-3/sam3/model/utils/sam2_utils.py
COPY ./sam3/sam3/model/sam3_tracking_predictor.py /install-3/sam3/model/sam3_tracking_predictor.py

# Install numpy, SimpleITK, and pyradiomics with pinned versions (from working server)
RUN pip install numpy==1.26.4 SimpleITK==2.5.3 versioneer==0.29
RUN pip install --no-build-isolation pyradiomics==3.0.1

RUN pip install --no-cache-dir -r requirements.txt

# Install nnUNetv2 for breast tumor segmentation (pinned to working server version)
RUN pip install nnunetv2==2.6.2

# Install LLM dependencies for report generation (pinned to working server versions)
RUN pip install google-generativeai==0.8.6 openai==2.15.0 anthropic==0.76.0

# Install BiomedParse dependencies (pinned to working server versions)
RUN pip install hydra-core==1.3.2 omegaconf==2.3.0 open-clip-torch==3.2.0 safetensors==0.7.0 timm==1.0.24 kornia==0.8.2 transformers

# Install TotalSegmentator for comprehensive organ segmentation (pinned to working server version)
RUN pip install TotalSegmentator==2.12.0

# Ensure pydicom stays at 2.4.4 (dicom2nifti requires pydicom 2.x, not 3.x)
RUN pip install pydicom==2.4.4

# Install detectron2 for BiomedParse (from working server - specific commit)
RUN pip install --no-build-isolation 'git+https://github.com/facebookresearch/detectron2.git@fd27788985af0f4ca800bca563acdb700bb890e2'

# Copy BiomedParse source
COPY ./biomedparse/. /code/biomedparse/

# Copy MONAI Label core (as a proper package)
COPY ./monailabel/. ./monailabel/

# Download SAM2.1 weights
ENV WEIGHTS_DIR="/code/checkpoints/"
ENV WEIGHTS_URL="https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt"
RUN wget --directory-prefix ${WEIGHTS_DIR} ${WEIGHTS_URL}

# Download MedSAM2 weights
ENV MEDSAM2_WEIGHTS_URL="https://huggingface.co/wanglab/MedSAM2/resolve/main/MedSAM2_latest.pt"
RUN wget --directory-prefix ${WEIGHTS_DIR} ${MEDSAM2_WEIGHTS_URL}

# Fix dicomweb_client issue (patched web.py restores multipart handling)
RUN rm -rf /usr/local/lib/python3.10/dist-packages/dicomweb_client/web.py
COPY ./patches/dicomweb_client/web.py /usr/local/lib/python3.10/dist-packages/dicomweb_client/

# Set environment variables (PYTHONPATH must be set before running monailabel)
ENV CUDA_VISIBLE_DEVICES=0
ENV PATH=$PATH":/code/monailabel/scripts"
ENV PYTHONPATH=/code:/code/biomedparse:$PYTHONPATH

# nnUNet environment variables
ENV nnUNet_results="/code/checkpoints/nnunet"
ENV nnUNet_raw="/code/data/nnunet_raw"
ENV nnUNet_preprocessed="/code/data/nnunet_preprocessed"

# Copy custom radiology app (we already have it, no need to download)
RUN mkdir -p /code/apps
COPY ./apps/radiology/. /code/apps/radiology/

EXPOSE 8002

# Default command - starts server with BiomedParse, TotalSegmentator, segmentation, and breast_tumor models
CMD ["python", "-m", "monailabel.main", "start_server", \
     "--app", "/code/apps/radiology", \
     "--studies", "/code/studies", \
     "--conf", "models", "biomedparse,totalsegmentator,segmentation,breast_tumor", \
     "--conf", "use_pretrained_model", "false", \
     "-p", "8002"]
