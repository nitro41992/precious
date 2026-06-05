import { useEffect, useState } from "react";
import { Linking, Platform } from "react-native";

import {
  mapSearchCandidatesForVisitTarget
} from "../captureLogic";
import type { MapSearchCandidate } from "../captureLogic";
import type { Capture } from "../types";

export function useCaptureReview({ selected }: { selected: Capture | null }) {
  const [visitTargetMapCandidates, setVisitTargetMapCandidates] = useState<MapSearchCandidate[]>([]);
  const selectedVisitTargetName = selected?.visitTarget?.name || "";
  const selectedVisitTargetQuery = selected?.visitTarget?.query || "";
  const selectedResolvedPlace = selected?.visitTarget?.resolvedPlace || null;
  const selectedResolvedPlaceKey = selectedResolvedPlace
    ? [
      selectedResolvedPlace.status,
      selectedResolvedPlace.placeId,
      selectedResolvedPlace.displayName,
      selectedResolvedPlace.formattedAddress,
      selectedResolvedPlace.location?.latitude,
      selectedResolvedPlace.location?.longitude,
      selectedResolvedPlace.googleMapsUri
    ].join(":")
    : "";

  useEffect(() => {
    const candidates = mapSearchCandidatesForVisitTarget(
      {
        name: selectedVisitTargetName,
        query: selectedVisitTargetQuery,
        resolvedPlace: selectedResolvedPlace
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
  }, [selectedResolvedPlace, selectedResolvedPlaceKey, selectedVisitTargetName, selectedVisitTargetQuery]);

  return {
    visitTargetMapCandidates
  };
}
