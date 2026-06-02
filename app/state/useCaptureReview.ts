import { useEffect, useState } from "react";
import { Linking, Platform } from "react-native";

import {
  mapSearchCandidatesForVisitTarget
} from "../captureLogic";
import {
  reviewChecklistTasksForCapture,
  reviewInsightForCapture
} from "../capturePresentation";
import type { MapSearchCandidate } from "../captureLogic";
import type {
  Capture,
  RationaleSheet,
  ReviewInsight,
  ReviewTarget
} from "../types";

export function useCaptureReview({ selected }: { selected: Capture | null }) {
  const [visitTargetMapCandidates, setVisitTargetMapCandidates] = useState<MapSearchCandidate[]>([]);
  const [rationaleSheet, setRationaleSheet] = useState<RationaleSheet | null>(null);
  const [rationaleEditTarget, setRationaleEditTarget] = useState<ReviewTarget | null>(null);
  const selectedVisitTargetName = selected?.visitTarget?.name || "";
  const selectedVisitTargetQuery = selected?.visitTarget?.query || "";

  useEffect(() => {
    const candidates = mapSearchCandidatesForVisitTarget(
      {
        name: selectedVisitTargetName,
        query: selectedVisitTargetQuery
      },
      Platform.OS
    );
    if (!candidates.length) {
      setVisitTargetMapCandidates([]);
      return;
    }
    let cancelled = false;
    setVisitTargetMapCandidates([]);
    Promise.all(
      candidates.map(async (candidate) => {
        try {
          return await Linking.canOpenURL(candidate.url) ? candidate : null;
        } catch {
          return null;
        }
      })
    ).then((availableCandidates) => {
      if (cancelled) return;
      setVisitTargetMapCandidates(
        availableCandidates.filter((candidate): candidate is MapSearchCandidate => Boolean(candidate))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [selectedVisitTargetName, selectedVisitTargetQuery]);

  function rationaleSheetForCapture(capture: Capture): RationaleSheet | null {
    const insight = reviewInsightForCapture(capture);
    const text = insight.summary || insight.focus;
    if (!text) return null;
    const tasks = reviewChecklistTasksForCapture(capture);
    return {
      title: tasks.length ? "Needs a quick look" : "Review insight",
      text,
      sections: insight.sections,
      tasks
    };
  }

  function openReviewInsight(_insight: ReviewInsight) {
    if (!selected) return;
    const sheet = rationaleSheetForCapture(selected);
    if (sheet) {
      setRationaleEditTarget(null);
      setRationaleSheet(sheet);
    }
  }

  function refreshRationaleSheet(updatedCapture: Capture) {
    const sheet = rationaleSheetForCapture(updatedCapture);
    if (sheet?.tasks?.length) {
      setRationaleSheet(sheet);
      return;
    }
    setRationaleSheet(null);
    setRationaleEditTarget(null);
  }

  return {
    openReviewInsight,
    rationaleEditTarget,
    rationaleSheet,
    refreshRationaleSheet,
    setRationaleEditTarget,
    setRationaleSheet,
    visitTargetMapCandidates
  };
}
