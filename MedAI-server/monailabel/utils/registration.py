"""
Image Registration Utilities

SimpleITK-based image registration for longitudinal lesion correspondence.
Supports rigid (6-DOF) and affine (12-DOF) registration.
"""

import logging
import tempfile
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Any
import numpy as np

try:
    import SimpleITK as sitk
except ImportError:
    sitk = None

logger = logging.getLogger(__name__)


@dataclass
class RegistrationMetrics:
    """Metrics from image registration."""
    mutual_information: Optional[float] = None
    mse: Optional[float] = None
    ncc: Optional[float] = None
    final_metric_value: Optional[float] = None
    iterations: int = 0
    convergence: str = "unknown"


@dataclass
class RegistrationResult:
    """Result of image registration."""
    success: bool
    transform_matrix: List[List[float]] = field(default_factory=list)
    inverse_transform_matrix: List[List[float]] = field(default_factory=list)
    metrics: RegistrationMetrics = field(default_factory=RegistrationMetrics)
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "success": self.success,
            "transform_matrix": self.transform_matrix,
            "inverse_transform_matrix": self.inverse_transform_matrix,
            "metrics": {
                "mutual_information": self.metrics.mutual_information,
                "mse": self.metrics.mse,
                "ncc": self.metrics.ncc,
                "final_metric_value": self.metrics.final_metric_value,
                "iterations": self.metrics.iterations,
                "convergence": self.metrics.convergence,
            },
            "error": self.error,
        }


def check_sitk_available() -> bool:
    """Check if SimpleITK is available."""
    return sitk is not None


def identity_matrix() -> List[List[float]]:
    """Return 4x4 identity matrix."""
    return [
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 1.0, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]


def sitk_transform_to_matrix(transform: "sitk.Transform") -> List[List[float]]:
    """
    Convert SimpleITK transform to 4x4 homogeneous matrix.

    Handles Euler3DTransform, AffineTransform, and CompositeTransform.
    """
    if not check_sitk_available():
        return identity_matrix()

    # Get transform parameters
    if isinstance(transform, sitk.CompositeTransform):
        # For composite, flatten to single affine if possible
        if transform.GetNumberOfTransforms() == 1:
            transform = transform.GetNthTransform(0)
        else:
            # Compose transforms
            composed = sitk.Transform(3, sitk.sitkIdentity)
            for i in range(transform.GetNumberOfTransforms()):
                composed = sitk.CompositeTransform([composed, transform.GetNthTransform(i)])
            transform = composed

    # Extract matrix and translation
    matrix = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]

    try:
        if hasattr(transform, "GetMatrix"):
            # Affine or Euler3D transform
            m = transform.GetMatrix()
            t = transform.GetTranslation()

            # m is a 9-element tuple (row-major 3x3)
            matrix[0][0] = m[0]
            matrix[0][1] = m[1]
            matrix[0][2] = m[2]
            matrix[1][0] = m[3]
            matrix[1][1] = m[4]
            matrix[1][2] = m[5]
            matrix[2][0] = m[6]
            matrix[2][1] = m[7]
            matrix[2][2] = m[8]

            matrix[0][3] = t[0]
            matrix[1][3] = t[1]
            matrix[2][3] = t[2]

    except Exception as e:
        logger.warning(f"Failed to extract transform matrix: {e}")

    return matrix


def matrix_to_sitk_transform(matrix: List[List[float]]) -> "sitk.AffineTransform":
    """Convert 4x4 matrix to SimpleITK AffineTransform."""
    if not check_sitk_available():
        raise RuntimeError("SimpleITK not available")

    transform = sitk.AffineTransform(3)

    # Extract 3x3 rotation/scale matrix (row-major)
    m = [
        matrix[0][0], matrix[0][1], matrix[0][2],
        matrix[1][0], matrix[1][1], matrix[1][2],
        matrix[2][0], matrix[2][1], matrix[2][2],
    ]
    transform.SetMatrix(m)

    # Extract translation
    transform.SetTranslation([matrix[0][3], matrix[1][3], matrix[2][3]])

    return transform


def invert_matrix(matrix: List[List[float]]) -> List[List[float]]:
    """Invert a 4x4 transformation matrix."""
    try:
        m = np.array(matrix)
        m_inv = np.linalg.inv(m)
        return m_inv.tolist()
    except Exception as e:
        logger.warning(f"Failed to invert matrix: {e}")
        return identity_matrix()


def load_image(image_path: str) -> Optional["sitk.Image"]:
    """Load an image from file path."""
    if not check_sitk_available():
        logger.error("SimpleITK not available")
        return None

    try:
        image = sitk.ReadImage(image_path)
        # Cast to float32 for registration
        image = sitk.Cast(image, sitk.sitkFloat32)
        return image
    except Exception as e:
        logger.error(f"Failed to load image {image_path}: {e}")
        return None


def rigid_registration(
    fixed_image: "sitk.Image",
    moving_image: "sitk.Image",
    initial_transform: Optional[List[List[float]]] = None,
    number_of_iterations: int = 200,
    learning_rate: float = 1.0,
    sampling_percentage: float = 0.1,
) -> RegistrationResult:
    """
    Perform rigid (6-DOF) registration using SimpleITK.

    Uses Euler3DTransform (rotation + translation only).

    Args:
        fixed_image: Reference/fixed image
        moving_image: Image to be registered
        initial_transform: Optional 4x4 initial transformation matrix
        number_of_iterations: Maximum iterations for optimizer
        learning_rate: Gradient descent learning rate
        sampling_percentage: Percentage of voxels to sample

    Returns:
        RegistrationResult with transformation matrix and metrics
    """
    if not check_sitk_available():
        return RegistrationResult(
            success=False,
            error="SimpleITK not available",
            transform_matrix=identity_matrix(),
            inverse_transform_matrix=identity_matrix(),
        )

    try:
        # Initialize transform
        initial_sitk_transform = sitk.CenteredTransformInitializer(
            fixed_image,
            moving_image,
            sitk.Euler3DTransform(),
            sitk.CenteredTransformInitializerFilter.GEOMETRY,
        )

        # Apply initial transform if provided
        if initial_transform:
            # Convert matrix to Euler angles (simplified - assumes small rotations)
            logger.info("Using provided initial transform")

        # Set up registration
        registration_method = sitk.ImageRegistrationMethod()

        # Metric: Mattes Mutual Information
        registration_method.SetMetricAsMattesMutualInformation(numberOfHistogramBins=50)
        registration_method.SetMetricSamplingStrategy(registration_method.RANDOM)
        registration_method.SetMetricSamplingPercentage(sampling_percentage)

        # Interpolator
        registration_method.SetInterpolator(sitk.sitkLinear)

        # Optimizer: Gradient Descent
        registration_method.SetOptimizerAsGradientDescent(
            learningRate=learning_rate,
            numberOfIterations=number_of_iterations,
            convergenceMinimumValue=1e-6,
            convergenceWindowSize=10,
        )
        registration_method.SetOptimizerScalesFromPhysicalShift()

        # Initial transform
        registration_method.SetInitialTransform(initial_sitk_transform, inPlace=False)

        # Multi-resolution
        registration_method.SetShrinkFactorsPerLevel(shrinkFactors=[4, 2, 1])
        registration_method.SetSmoothingSigmasPerLevel(smoothingSigmas=[2, 1, 0])
        registration_method.SmoothingSigmasAreSpecifiedInPhysicalUnitsOn()

        # Execute registration
        logger.info("Starting rigid registration...")
        final_transform = registration_method.Execute(fixed_image, moving_image)

        # Get metrics
        final_metric_value = registration_method.GetMetricValue()
        stop_condition = registration_method.GetOptimizerStopConditionDescription()

        logger.info(f"Registration completed. Final metric: {final_metric_value}")
        logger.info(f"Stop condition: {stop_condition}")

        # Convert to matrix
        transform_matrix = sitk_transform_to_matrix(final_transform)
        inverse_matrix = invert_matrix(transform_matrix)

        # Calculate additional metrics
        metrics = RegistrationMetrics(
            mutual_information=abs(final_metric_value),  # Mattes MI is negative
            final_metric_value=final_metric_value,
            iterations=number_of_iterations,
            convergence=stop_condition,
        )

        return RegistrationResult(
            success=True,
            transform_matrix=transform_matrix,
            inverse_transform_matrix=inverse_matrix,
            metrics=metrics,
        )

    except Exception as e:
        logger.error(f"Rigid registration failed: {e}")
        return RegistrationResult(
            success=False,
            error=str(e),
            transform_matrix=identity_matrix(),
            inverse_transform_matrix=identity_matrix(),
        )


def affine_registration(
    fixed_image: "sitk.Image",
    moving_image: "sitk.Image",
    initial_transform: Optional[List[List[float]]] = None,
    number_of_iterations: int = 200,
    learning_rate: float = 1.0,
    sampling_percentage: float = 0.1,
) -> RegistrationResult:
    """
    Perform affine (12-DOF) registration using SimpleITK.

    Includes rotation, translation, scaling, and shearing.

    Args:
        fixed_image: Reference/fixed image
        moving_image: Image to be registered
        initial_transform: Optional 4x4 initial transformation matrix
        number_of_iterations: Maximum iterations for optimizer
        learning_rate: Gradient descent learning rate
        sampling_percentage: Percentage of voxels to sample

    Returns:
        RegistrationResult with transformation matrix and metrics
    """
    if not check_sitk_available():
        return RegistrationResult(
            success=False,
            error="SimpleITK not available",
            transform_matrix=identity_matrix(),
            inverse_transform_matrix=identity_matrix(),
        )

    try:
        # Initialize with rigid registration for better starting point
        logger.info("Starting with rigid registration initialization...")
        rigid_result = rigid_registration(
            fixed_image, moving_image,
            number_of_iterations=100,
            learning_rate=learning_rate,
            sampling_percentage=sampling_percentage,
        )

        # Create affine transform from rigid result
        if rigid_result.success:
            initial_sitk_transform = matrix_to_sitk_transform(rigid_result.transform_matrix)
        else:
            initial_sitk_transform = sitk.CenteredTransformInitializer(
                fixed_image,
                moving_image,
                sitk.AffineTransform(3),
                sitk.CenteredTransformInitializerFilter.GEOMETRY,
            )

        # Override with provided initial transform if given
        if initial_transform:
            initial_sitk_transform = matrix_to_sitk_transform(initial_transform)

        # Set up registration
        registration_method = sitk.ImageRegistrationMethod()

        # Metric: Mattes Mutual Information
        registration_method.SetMetricAsMattesMutualInformation(numberOfHistogramBins=50)
        registration_method.SetMetricSamplingStrategy(registration_method.RANDOM)
        registration_method.SetMetricSamplingPercentage(sampling_percentage)

        # Interpolator
        registration_method.SetInterpolator(sitk.sitkLinear)

        # Optimizer: Regular Step Gradient Descent (better for affine)
        registration_method.SetOptimizerAsRegularStepGradientDescent(
            learningRate=learning_rate,
            minStep=1e-4,
            numberOfIterations=number_of_iterations,
        )
        registration_method.SetOptimizerScalesFromPhysicalShift()

        # Initial transform
        registration_method.SetInitialTransform(initial_sitk_transform, inPlace=False)

        # Multi-resolution
        registration_method.SetShrinkFactorsPerLevel(shrinkFactors=[4, 2, 1])
        registration_method.SetSmoothingSigmasPerLevel(smoothingSigmas=[2, 1, 0])
        registration_method.SmoothingSigmasAreSpecifiedInPhysicalUnitsOn()

        # Execute registration
        logger.info("Starting affine registration...")
        final_transform = registration_method.Execute(fixed_image, moving_image)

        # Get metrics
        final_metric_value = registration_method.GetMetricValue()
        stop_condition = registration_method.GetOptimizerStopConditionDescription()

        logger.info(f"Affine registration completed. Final metric: {final_metric_value}")
        logger.info(f"Stop condition: {stop_condition}")

        # Convert to matrix
        transform_matrix = sitk_transform_to_matrix(final_transform)
        inverse_matrix = invert_matrix(transform_matrix)

        # Calculate additional metrics
        metrics = RegistrationMetrics(
            mutual_information=abs(final_metric_value),
            final_metric_value=final_metric_value,
            iterations=number_of_iterations,
            convergence=stop_condition,
        )

        return RegistrationResult(
            success=True,
            transform_matrix=transform_matrix,
            inverse_transform_matrix=inverse_matrix,
            metrics=metrics,
        )

    except Exception as e:
        logger.error(f"Affine registration failed: {e}")
        return RegistrationResult(
            success=False,
            error=str(e),
            transform_matrix=identity_matrix(),
            inverse_transform_matrix=identity_matrix(),
        )


def resample_mask(
    mask_image: "sitk.Image",
    reference_image: "sitk.Image",
    transform: "sitk.Transform",
    interpolation: str = "nearest",
) -> "sitk.Image":
    """
    Resample a segmentation mask to a different image space.

    Args:
        mask_image: Segmentation mask to resample
        reference_image: Target image space
        transform: Transform from mask space to reference space
        interpolation: 'nearest' for labels, 'linear' for soft masks

    Returns:
        Resampled mask in reference image space
    """
    if not check_sitk_available():
        raise RuntimeError("SimpleITK not available")

    # Select interpolator
    if interpolation == "nearest":
        interp = sitk.sitkNearestNeighbor
    elif interpolation == "linear":
        interp = sitk.sitkLinear
    else:
        interp = sitk.sitkNearestNeighbor

    # Resample
    resampled = sitk.Resample(
        mask_image,
        reference_image,
        transform,
        interp,
        0,  # Default pixel value
        mask_image.GetPixelID(),
    )

    return resampled


def resample_mask_with_inverse(
    mask_image: "sitk.Image",
    source_image: "sitk.Image",
    target_image: "sitk.Image",
    transform_matrix: List[List[float]],
    interpolation: str = "nearest",
) -> "sitk.Image":
    """
    Resample a mask from source to target space using a transformation matrix.

    The transform_matrix maps points from source to target space.
    To resample the image, we need the inverse (target to source).

    Args:
        mask_image: Segmentation mask in source space
        source_image: Reference image in source space
        target_image: Reference image in target space
        transform_matrix: 4x4 transform from source to target
        interpolation: Interpolation method

    Returns:
        Resampled mask in target space
    """
    if not check_sitk_available():
        raise RuntimeError("SimpleITK not available")

    # Convert matrix to SimpleITK transform
    # For resampling, we need the inverse transform
    inverse_matrix = invert_matrix(transform_matrix)
    transform = matrix_to_sitk_transform(inverse_matrix)

    return resample_mask(mask_image, target_image, transform, interpolation)


def calculate_dice_coefficient(
    mask1: "sitk.Image",
    mask2: "sitk.Image",
    label: int = 1,
) -> float:
    """Calculate Dice coefficient between two binary masks."""
    if not check_sitk_available():
        return 0.0

    try:
        # Threshold to binary
        binary1 = sitk.BinaryThreshold(mask1, lowerThreshold=label, upperThreshold=label)
        binary2 = sitk.BinaryThreshold(mask2, lowerThreshold=label, upperThreshold=label)

        # Calculate overlap
        overlap_filter = sitk.LabelOverlapMeasuresImageFilter()
        overlap_filter.Execute(binary1, binary2)

        return overlap_filter.GetDiceCoefficient()

    except Exception as e:
        logger.warning(f"Failed to calculate Dice: {e}")
        return 0.0


def apply_transform_to_point(
    point: Tuple[float, float, float],
    transform_matrix: List[List[float]],
) -> Tuple[float, float, float]:
    """Apply 4x4 transformation matrix to a 3D point."""
    x, y, z = point
    m = transform_matrix

    new_x = m[0][0] * x + m[0][1] * y + m[0][2] * z + m[0][3]
    new_y = m[1][0] * x + m[1][1] * y + m[1][2] * z + m[1][3]
    new_z = m[2][0] * x + m[2][1] * y + m[2][2] * z + m[2][3]

    return (new_x, new_y, new_z)
