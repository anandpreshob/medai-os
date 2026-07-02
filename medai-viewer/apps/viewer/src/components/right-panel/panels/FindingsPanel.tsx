import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Trash2 } from 'lucide-react';
import { Panel, Button } from '@medai/ui';
import { useFindingsStore, useViewerStore } from '@medai/core';

// Extend Window interface for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function FindingsPanel() {
  const { activeImageId } = useViewerStore();
  const { findings, isRecording, setFindings, clearFindings, setRecording, getFindings } = useFindingsStore();

  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Use refs to track current values without causing re-renders
  const activeImageIdRef = useRef(activeImageId);
  const findingsRef = useRef(findings);
  const isRecordingRef = useRef(isRecording);

  // Keep refs in sync with state
  useEffect(() => {
    activeImageIdRef.current = activeImageId;
  }, [activeImageId]);

  useEffect(() => {
    findingsRef.current = findings;
  }, [findings]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Get current findings for the active image (use getFindings to get the string value)
  const currentFindings = activeImageId ? getFindings(activeImageId) : '';

  // Check for Speech Recognition support on mount
  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSpeechSupported(!!SpeechRecognitionAPI);
  }, []);

  // Initialize Speech Recognition ONCE on mount
  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const imageId = activeImageIdRef.current;
      if (!imageId) return;

      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        }
      }

      if (finalTranscript) {
        const existingText = findingsRef.current.get(imageId) || '';
        const newText = existingText + (existingText ? ' ' : '') + finalTranscript;
        setFindings(imageId, newText);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[FindingsPanel] Speech recognition error:', event.error);
      setRecording(false);
    };

    recognition.onend = () => {
      // When recognition ends, update state
      // Use ref to check if we were supposed to be recording
      if (isRecordingRef.current) {
        setRecording(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, [setFindings, setRecording]); // Only depend on stable setters

  // Handle text change
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (activeImageId) {
      setFindings(activeImageId, e.target.value);
    }
  }, [activeImageId, setFindings]);

  // Toggle recording
  const toggleRecording = useCallback(() => {
    if (!recognitionRef.current) {
      console.error('[FindingsPanel] Recognition not initialized');
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setRecording(false);
    } else {
      try {
        recognitionRef.current.start();
        setRecording(true);
      } catch (err) {
        console.error('[FindingsPanel] Failed to start recording:', err);
        // If already started, try stopping first
        if (err instanceof DOMException && err.name === 'InvalidStateError') {
          recognitionRef.current.stop();
          setTimeout(() => {
            try {
              recognitionRef.current?.start();
              setRecording(true);
            } catch (retryErr) {
              console.error('[FindingsPanel] Retry failed:', retryErr);
            }
          }, 100);
        }
      }
    }
  }, [isRecording, setRecording]);

  // Clear findings
  const handleClear = useCallback(() => {
    if (activeImageId) {
      clearFindings(activeImageId);
    }
  }, [activeImageId, clearFindings]);

  // Stop recording when switching images
  useEffect(() => {
    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setRecording(false);
    }
  }, [activeImageId]); // Intentionally only depend on activeImageId

  if (!activeImageId) {
    return null;
  }

  return (
    <div className="mt-4">
      <Panel title="Findings">
        <div className="space-y-3">
          <p className="text-text-muted text-xs">
            Document your findings for this image. Use voice dictation or type directly.
          </p>

          {/* Textarea for findings */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={currentFindings}
              onChange={handleTextChange}
              placeholder="Enter your findings here..."
              className="w-full h-32 p-3 text-sm bg-background-tertiary border border-border-default rounded-md resize-y focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary text-text-primary placeholder:text-text-muted"
              data-testid="findings-textarea"
            />

            {/* Recording indicator */}
            {isRecording && (
              <div className="absolute top-2 right-2 flex items-center gap-1.5 text-xs text-accent-error">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-error opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-error"></span>
                </span>
                Recording...
              </div>
            )}
          </div>

          {/* Character count */}
          <div className="text-text-muted text-xs text-right">
            {currentFindings.length} characters
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            {speechSupported && (
              <Button
                variant={isRecording ? 'destructive' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={toggleRecording}
                data-testid="dictation-button"
              >
                {isRecording ? (
                  <>
                    <MicOff className="h-4 w-4 mr-1" />
                    Stop
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 mr-1" />
                    Dictate
                  </>
                )}
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className={speechSupported ? '' : 'flex-1'}
              onClick={handleClear}
              disabled={!currentFindings}
              data-testid="clear-findings-button"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>

          {/* Browser support warning */}
          {!speechSupported && (
            <p className="text-text-muted text-xs italic">
              Voice dictation is not supported in this browser. Please use Chrome, Edge, or Safari.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}
