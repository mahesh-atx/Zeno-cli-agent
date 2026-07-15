import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { Colors } from "../themes/colors";
import type { CustomProviderProfile } from "../core/config";

interface ProviderFormProps {
  initialProfile?: CustomProviderProfile;
  onSave: (profile: CustomProviderProfile) => void;
  onCancel: () => void;
}

type Step = "id" | "name" | "baseUrl" | "defaultModel" | "apiKey";

const STEPS: Step[] = ["id", "name", "baseUrl", "defaultModel", "apiKey"];

export function ProviderForm({ initialProfile, onSave, onCancel }: ProviderFormProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [profile, setProfile] = useState<Partial<CustomProviderProfile>>(
    initialProfile || { id: "", name: "", baseUrl: "", defaultModel: "", apiKey: "" }
  );

  const [error, setError] = useState<string | null>(null);

  const currentStep = STEPS[stepIndex];

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return) {
      // Validate current step before proceeding
      const val = (profile[currentStep] || "").trim();
      
      if (currentStep === "id" && !val) {
        setError("ID is required (e.g. my-local-llm)");
        return;
      }
      if (currentStep === "name" && !val) {
        setError("Name is required (e.g. LM Studio)");
        return;
      }
      if (currentStep === "baseUrl" && !val) {
        setError("Base URL is required (e.g. http://localhost:1234/v1)");
        return;
      }
      if (currentStep === "defaultModel" && !val) {
        setError("Default Model is required (e.g. llama-3)");
        return;
      }

      setError(null);

      if (stepIndex < STEPS.length - 1) {
        setStepIndex(stepIndex + 1);
      } else {
        // Save
        onSave(profile as CustomProviderProfile);
      }
    }
  });

  const getStepLabel = (step: Step) => {
    switch (step) {
      case "id": return "Provider ID (e.g. lm-studio):";
      case "name": return "Display Name (e.g. LM Studio):";
      case "baseUrl": return "Base URL (e.g. http://localhost:1234/v1):";
      case "defaultModel": return "Default Model (e.g. llama-3):";
      case "apiKey": return "API Key (optional):";
    }
  };

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1} borderStyle="round" borderColor={Colors.Gray}>
      <Box marginBottom={1}>
        <Text color={Colors.AccentCyan} bold>
          {initialProfile ? "✎ Edit Custom Provider" : "+ Add Custom Provider"}
        </Text>
      </Box>

      {STEPS.map((step, idx) => {
        const isActive = idx === stepIndex;
        const isPast = idx < stepIndex;
        
        if (!isActive && !isPast) return null;

        return (
          <Box key={step} flexDirection="column" marginBottom={isActive ? 1 : 0}>
            <Box>
              <Text color={isActive ? Colors.Foreground : Colors.Gray}>
                {isActive ? "❯ " : "✓ "}
                {getStepLabel(step)}
              </Text>
            </Box>
            
            <Box paddingLeft={2}>
              {isActive ? (
                <TextInput
                  value={profile[step] || ""}
                  onChange={(val) => setProfile({ ...profile, [step]: val })}
                  placeholder="Type here..."
                />
              ) : (
                <Text color={Colors.AccentYellow}>
                  {step === "apiKey" && profile[step] ? "********" : (profile[step] || "(empty)")}
                </Text>
              )}
            </Box>
          </Box>
        );
      })}

      {error && (
        <Box marginTop={1}>
          <Text color={Colors.AccentRed}>✗ {error}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Enter to continue/save · Esc to cancel</Text>
      </Box>
    </Box>
  );
}
