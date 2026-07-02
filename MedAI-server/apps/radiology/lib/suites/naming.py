"""
MedAI TG-263 Naming Convention

Standard naming for radiation therapy structures per AAPM TG-263.
"""

import re
from typing import Dict, List, Optional, Tuple

# TG-263 Standard Structure Names
# Ref: AAPM Task Group 263 Report on Standardizing Nomenclature
TG263_STRUCTURES: Dict[str, List[str]] = {
    # === Target Volumes ===
    "GTV": ["GTV", "GTV_p", "GTV_n", "GTV_Primary", "GTV_Node", "GTV_Boost"],
    "CTV": ["CTV", "CTV_p", "CTV_n", "CTV_Primary", "CTV_Node", "CTV_Low", "CTV_High"],
    "PTV": ["PTV", "PTV_p", "PTV_n", "PTV_Primary", "PTV_Node", "PTV_Low", "PTV_High"],
    "ITV": ["ITV", "ITV_Primary"],

    # === Brain & CNS ===
    "Brain": ["Brain", "Brain_PRV"],
    "Brainstem": ["Brainstem", "BrainStem", "Brainstem_PRV"],
    "SpinalCord": ["SpinalCord", "Spinal_Cord", "SpinalCord_PRV", "SpinalCanal"],
    "OpticNerve_L": ["OpticNerve_L", "OpticNrv_L", "Optic_Nerve_L"],
    "OpticNerve_R": ["OpticNerve_R", "OpticNrv_R", "Optic_Nerve_R"],
    "OpticChiasm": ["OpticChiasm", "Chiasm"],
    "Pituitary": ["Pituitary", "PituitaryGland"],
    "Cochlea_L": ["Cochlea_L"],
    "Cochlea_R": ["Cochlea_R"],
    "Hippocampus_L": ["Hippocampus_L"],
    "Hippocampus_R": ["Hippocampus_R"],

    # === Head & Neck ===
    "Parotid_L": ["Parotid_L", "ParotidGland_L", "Parotid_Left"],
    "Parotid_R": ["Parotid_R", "ParotidGland_R", "Parotid_Right"],
    "Submandibular_L": ["Submandibular_L", "SubmandibularGland_L"],
    "Submandibular_R": ["Submandibular_R", "SubmandibularGland_R"],
    "Larynx": ["Larynx"],
    "Mandible": ["Mandible"],
    "Oral_Cavity": ["Oral_Cavity", "OralCavity"],
    "Pharynx": ["Pharynx", "Pharynx_Constrict"],
    "Thyroid": ["Thyroid", "ThyroidGland"],

    # === Thorax ===
    "Lung_L": ["Lung_L", "Lung_Left"],
    "Lung_R": ["Lung_R", "Lung_Right"],
    "Lungs": ["Lungs", "Lung_Total", "Lungs_Total"],
    "Heart": ["Heart"],
    "Esophagus": ["Esophagus"],
    "Trachea": ["Trachea"],
    "BronchialTree": ["BronchialTree", "Bronchus"],
    "Aorta": ["Aorta", "A_Aorta"],
    "Carina": ["Carina"],

    # === Abdomen ===
    "Liver": ["Liver"],
    "Spleen": ["Spleen"],
    "Kidney_L": ["Kidney_L", "Kidney_Left"],
    "Kidney_R": ["Kidney_R", "Kidney_Right"],
    "Kidneys": ["Kidneys", "Kidneys_Total"],
    "Stomach": ["Stomach"],
    "Pancreas": ["Pancreas"],
    "Duodenum": ["Duodenum"],
    "SmallBowel": ["SmallBowel", "Small_Bowel", "Bowel_Small"],
    "LargeBowel": ["LargeBowel", "Large_Bowel", "Bowel_Large", "Colon"],
    "Gallbladder": ["Gallbladder"],
    "Adrenal_L": ["Adrenal_L", "AdrenalGland_L"],
    "Adrenal_R": ["Adrenal_R", "AdrenalGland_R"],

    # === Pelvis ===
    "Bladder": ["Bladder", "Urinary_Bladder"],
    "Rectum": ["Rectum"],
    "Prostate": ["Prostate"],
    "SeminalVes": ["SeminalVes", "SeminalVesicle", "SeminalVesicles"],
    "PenileBulb": ["PenileBulb", "Penile_Bulb"],
    "Urethra": ["Urethra"],
    "Uterus": ["Uterus"],
    "Ovary_L": ["Ovary_L"],
    "Ovary_R": ["Ovary_R"],
    "Vagina": ["Vagina"],

    # === Bones ===
    "Femur_L": ["Femur_L", "Femur_Left", "FemoralHead_L"],
    "Femur_R": ["Femur_R", "Femur_Right", "FemoralHead_R"],
    "Hip_L": ["Hip_L", "Pelvis_L"],
    "Hip_R": ["Hip_R", "Pelvis_R"],
    "Sacrum": ["Sacrum"],
    "Coccyx": ["Coccyx"],
}

# Reverse mapping: alias -> canonical name
_ALIAS_TO_CANONICAL: Dict[str, str] = {}
for canonical, aliases in TG263_STRUCTURES.items():
    for alias in aliases:
        _ALIAS_TO_CANONICAL[alias.lower()] = canonical


class TG263Naming:
    """
    Helper class for TG-263 compliant structure naming.
    """

    @staticmethod
    def get_canonical_name(name: str) -> str:
        """
        Convert a structure name to its TG-263 canonical form.

        Args:
            name: The input structure name (any casing/variant)

        Returns:
            The TG-263 canonical name, or the original if no match
        """
        # Try direct lookup (case-insensitive)
        canonical = _ALIAS_TO_CANONICAL.get(name.lower())
        if canonical:
            return canonical

        # Try without underscores/spaces
        normalized = name.lower().replace("_", "").replace(" ", "")
        for alias, can in _ALIAS_TO_CANONICAL.items():
            if alias.replace("_", "") == normalized:
                return can

        # Return original if no match
        return name

    @staticmethod
    def is_target_volume(name: str) -> bool:
        """
        Check if a structure name is a target volume (GTV, CTV, PTV, ITV).

        Args:
            name: The structure name

        Returns:
            True if it's a target volume
        """
        upper = name.upper()
        return any(
            upper.startswith(prefix)
            for prefix in ["GTV", "CTV", "PTV", "ITV"]
        )

    @staticmethod
    def is_oar(name: str) -> bool:
        """
        Check if a structure name is an organ at risk (not a target volume).

        Args:
            name: The structure name

        Returns:
            True if it's an OAR
        """
        return not TG263Naming.is_target_volume(name)

    @staticmethod
    def get_structure_type(name: str) -> str:
        """
        Get the type of structure (GTV, CTV, PTV, ORGAN, etc.).

        Args:
            name: The structure name

        Returns:
            The structure type string
        """
        upper = name.upper()
        if upper.startswith("GTV"):
            return "GTV"
        elif upper.startswith("CTV"):
            return "CTV"
        elif upper.startswith("PTV"):
            return "PTV"
        elif upper.startswith("ITV"):
            return "ITV"
        else:
            return "ORGAN"

    @staticmethod
    def validate_name(name: str) -> Tuple[bool, str]:
        """
        Validate a structure name against TG-263 conventions.

        Args:
            name: The structure name to validate

        Returns:
            Tuple of (is_valid, message)
        """
        # Check for valid characters (alphanumeric, underscore, dash)
        if not re.match(r"^[a-zA-Z][a-zA-Z0-9_-]*$", name):
            return False, "Name must start with a letter and contain only alphanumeric characters, underscores, or dashes"

        # Check length
        if len(name) > 64:
            return False, "Name exceeds maximum length of 64 characters"

        # Check if it's a known TG-263 name or variant
        canonical = TG263Naming.get_canonical_name(name)
        if canonical != name and canonical in TG263_STRUCTURES:
            return True, f"Valid (canonical form: {canonical})"

        if name in TG263_STRUCTURES:
            return True, "Valid TG-263 standard name"

        # Check for target volume pattern
        if TG263Naming.is_target_volume(name):
            return True, "Valid target volume naming pattern"

        # Unknown but valid format
        return True, "Valid format but not a standard TG-263 name"

    @staticmethod
    def suggest_name(input_name: str) -> str:
        """
        Suggest a TG-263 compliant name for a given input.

        Args:
            input_name: The input structure name

        Returns:
            A suggested TG-263 compliant name
        """
        # First try canonical lookup
        canonical = TG263Naming.get_canonical_name(input_name)
        if canonical in TG263_STRUCTURES:
            return canonical

        # Clean up the name
        # Remove common prefixes/suffixes
        cleaned = input_name
        for prefix in ["ROI_", "Seg_", "Label_", "Structure_"]:
            if cleaned.lower().startswith(prefix.lower()):
                cleaned = cleaned[len(prefix):]

        # Capitalize first letter of each word
        parts = re.split(r"[_\s-]+", cleaned)
        suggested = "_".join(p.capitalize() for p in parts if p)

        # Ensure laterality is at the end
        if suggested.lower().startswith("left"):
            suggested = suggested[4:].strip("_") + "_L"
        elif suggested.lower().startswith("right"):
            suggested = suggested[5:].strip("_") + "_R"

        return suggested


# Module-level convenience functions
def get_tg263_name(name: str) -> str:
    """Get the TG-263 canonical name for a structure."""
    return TG263Naming.get_canonical_name(name)


def validate_tg263_name(name: str) -> Tuple[bool, str]:
    """Validate a structure name against TG-263 conventions."""
    return TG263Naming.validate_name(name)


def is_target_volume(name: str) -> bool:
    """Check if a structure is a target volume."""
    return TG263Naming.is_target_volume(name)


def is_oar(name: str) -> bool:
    """Check if a structure is an organ at risk."""
    return TG263Naming.is_oar(name)
