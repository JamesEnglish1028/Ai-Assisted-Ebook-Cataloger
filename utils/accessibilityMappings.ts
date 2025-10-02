// A selection of mappings based on the W3C Display Guide Vocabulary.
// Full guide: https://github.com/w3c/publ-a11y/blob/main/a11y-meta-display-guide/2.0/draft/localizations/en-US/display_guide_vocabulary_w3c_en-US.json

type ValueMapping = { [key: string]: string };

interface AccessibilityMappings {
  properties: {
    [key: string]: string;
  };
  values: {
    [key: string]: ValueMapping;
  };
}

export const accessibilityMappings: AccessibilityMappings = {
  properties: {
    accessibilityFeatures: "Features",
    accessModes: "Access Modes",
    accessModesSufficient: "Sufficient Access Modes",
    hazards: "Hazards",
    certification: "Certified Conforms To",
  },
  values: {
    accessibilityFeatures: {
      alternativeText: "Alternative Text",
      annotations: "Annotations",
      audioDescription: "Audio Descriptions",
      bookmarks: "Bookmarks",
      braille: "Braille",
      captions: "Captions",
      chemML: "ChemML",
      describedMath: "Described Math",
      displayTransformability: "Display Transformability",
      highContrast: "High Contrast",
      index: "Index",
      longDescription: "Long Description",
      mathML: "MathML",
      printPageNumbers: "Print Page Numbers",
      readingOrder: "Reading Order",
      signLanguage: "Sign Language",
      structuralNavigation: "Structural Navigation",
      synchronizedAudioText: "Synchronized Audio/Text",
      tableOfContents: "Table of Contents",
      taggedPDF: "Tagged PDF",
      tactileImage: "Tactile Image",
      tactileObject: "Tactile Object",
      timingControl: "Timing Control",
      transcripts: "Transcripts",
      ttsMarkup: "TTS Markup",
      unlocked: "No digital rights management",
    },
    accessModes: {
      auditory: "Auditory",
      tactile: "Tactile",
      textual: "Textual",
      visual: "Visual",
    },
    // accessModeSufficient re-uses the accessModes values
    accessModesSufficient: {
        auditory: "Auditory",
        tactile: "Tactile",
        textual: "Textual",
        visual: "Visual",
    },
    hazards: {
      flashing: "Flashing Hazard",
      noFlashingHazard: "No Flashing Hazard",
      motionSimulation: "Motion Simulation Hazard",
      noMotionSimulationHazard: "No Motion Simulation Hazard",
      sound: "Sound Hazard",
      noSoundHazard: "No Sound Hazard",
      unknown: "Unknown Hazard",
      none: "No Known Hazards",
    },
  },
};
