import {
  COLLECTION_AUTO_LINK_CONFIDENCE,
  COLLECTION_AUTO_LINK_LIMIT,
} from "../config.ts";
import {
  compactText,
  finiteNumber,
  jsonObject,
  stringValue,
} from "../common.ts";
import type { AnalysisOutput, RetrievedCollection } from "../types.ts";
import { normalizeCollectionDecision } from "./links.ts";

type CollectionFacet =
  | "guide"
  | "software"
  | "travel"
  | "dining"
  | "event"
  | "class"
  | "work"
  | "music"
  | "design"
  | "project"
  | "shopping"
  | "recipe"
  | "finance"
  | "local_activity";

type RecoveryCandidate = {
  collection_id: string;
  title: string;
  rerank_rank: number | null;
  rerank_fit: RetrievedCollection["rerank_fit"];
  rerank_confidence: number | null;
  facets: CollectionFacet[];
  decision: "recover" | "block";
  reason: string;
};

const SECONDARY_RECOVERY_RERANK_LIMIT = 12;
const SECONDARY_RECOVERY_CONFIDENCE = Math.max(
  COLLECTION_AUTO_LINK_CONFIDENCE,
  0.86,
);
const SELECTED_SECONDARY_BOOST_CONFIDENCE = 0.75;

const facetPatterns: Array<[CollectionFacet, RegExp]> = [
  [
    "guide",
    /\b(article|articles|guide|guides|how[\s-]?to|tutorial|reference|docs?|documentation|manual|checklist|explainer|playbook|walkthrough|long reads?)\b/i,
  ],
  [
    "software",
    /\b(app|apps|software|saas|tool|tools|api|developer|github|repository|repo|library|code|workflow|platform)\b/i,
  ],
  [
    "travel",
    /\b(travel|trip|trips|destination|itinerary|route|booking|hotel|flight|vacation|tour|city guide|attraction|passport|packing)\b/i,
  ],
  [
    "dining",
    /\b(restaurant|restaurants|cafe|cafes|coffee|bar|bakery|menu|dining|food spots?|places? to eat|drink)\b/i,
  ],
  [
    "event",
    /\b(event|events|ticket|tickets|festival|concert|performance|show|opening|schedule|attend|venue|calendar|time-bound)\b/i,
  ],
  [
    "class",
    /\b(class|classes|course|courses|lesson|lessons|workshop|training|enroll|enrollment|curriculum|bootcamp|skill-building)\b/i,
  ],
  [
    "work",
    /\b(work|career|business|professional|job|marketing|creator|management|operations|startup|client|revenue|monetization)\b/i,
  ],
  [
    "music",
    /\b(music|podcast|podcasts|song|songs|album|artist|playlist|audio|dj|concerts as media)\b/i,
  ],
  [
    "design",
    /\b(design|inspiration|visual|aesthetic|style|interior|fashion|template|brand|creative|moodboard|portfolio)\b/i,
  ],
  [
    "project",
    /\b(home|diy|project|projects|repair|decor|cleaning|gardening|craft|build|materials|before\/after|before and after)\b/i,
  ],
  [
    "shopping",
    /\b(product|products|shopping|buy|deal|sale|gear|gift|item|comparison|store|wishlist|purchase)\b/i,
  ],
  [
    "recipe",
    /\b(recipe|recipes|cook|cooking|meal|dish|ingredient|kitchen|grocery)\b/i,
  ],
  [
    "finance",
    /\b(finance|financial|budget|money|tax|invest|insurance|banking|saving|cost|subscription)\b/i,
  ],
  [
    "local_activity",
    /\b(local activit|nearby|museum|park|parks|pop-up|seasonal outing|neighborhood idea|things to do)\b/i,
  ],
];

function collectionText(collection: RetrievedCollection) {
  return compactText([collection.title, collection.description], 1200);
}

export function collectionFacets(collection: RetrievedCollection) {
  const text = collectionText(collection);
  const facets = new Set<CollectionFacet>();
  for (const [facet, pattern] of facetPatterns) {
    if (pattern.test(text)) facets.add(facet);
  }
  return Array.from(facets);
}

function entityText(entities: unknown) {
  if (!Array.isArray(entities)) return "";
  return entities
    .map((item) => {
      const record = jsonObject(item);
      return compactText([
        stringValue(record.type),
        stringValue(record.name),
        stringValue(record.evidence),
      ], 240);
    })
    .filter(Boolean)
    .join(" ");
}

function captureRoleText(analysis: Record<string, unknown>) {
  return compactText([
    stringValue(analysis.capture_role),
    stringValue(analysis.rerank_capture_role),
    stringValue(analysis.rerank_capture_role_rationale),
  ], 500);
}

function evidenceText(analysis: Record<string, unknown>) {
  const defaultIntent = jsonObject(analysis.default_intent);
  const reviewRationale = jsonObject(analysis.review_rationale);
  return compactText([
    stringValue(analysis.display_title),
    stringValue(analysis.summary),
    Array.isArray(analysis.search_phrases)
      ? analysis.search_phrases.join(" ")
      : "",
    entityText(analysis.entities),
    stringValue(defaultIntent.category),
    stringValue(defaultIntent.rationale),
    stringValue(reviewRationale.summary),
    stringValue(reviewRationale.intent),
    stringValue(reviewRationale.collections),
    captureRoleText(analysis),
  ], 4500);
}

function hasSignal(text: string, facet: CollectionFacet) {
  const pattern = facetPatterns.find(([name]) => name === facet)?.[1];
  return pattern ? pattern.test(text) : false;
}

function standaloneGuideSignal(text: string) {
  return /\b(how[\s-]?to|tutorial|reference|docs?|documentation|manual|checklist|explainer|playbook|walkthrough|steps?|setup|configure|learn)\b/i
    .test(text);
}

function standaloneNonShoppingGuideSignal(text: string) {
  const stripped = text
    .replace(/\bbuying guide\b/ig, "")
    .replace(/\bproduct comparisons?\b/ig, "")
    .replace(/\bcomparison details?\b/ig, "");
  return /\b(how[\s-]?to|tutorial|docs?|documentation|manual|checklist|playbook|walkthrough|steps?|setup|configure|instructions?|learn(?:ing)?)\b/i
    .test(stripped);
}

function shoppingRoundupSignal(text: string) {
  return /\b(best|top|ranked|ranking|roundup|comparison|vs\.?|buying guide|deal|sale|price|buy|purchase)\b/i
    .test(text);
}

function hasFacetEvidence(
  facets: CollectionFacet[],
  analysis: Record<string, unknown>,
) {
  const text = evidenceText(analysis);
  return facets.some((facet) => {
    if (facet === "guide") {
      return standaloneGuideSignal(text);
    }
    if (facet === "project") {
      return hasSignal(text, "project") ||
        /\b(before|after|materials?|steps?|build|repair|renovat|install|diy)\b/i
          .test(text);
    }
    if (facet === "class") {
      return hasSignal(text, "class");
    }
    return hasSignal(text, facet);
  });
}

function hasIndependentFacet(
  candidateFacets: CollectionFacet[],
  selectedCollections: RetrievedCollection[],
) {
  if (!selectedCollections.length) return true;
  const candidateSet = new Set(candidateFacets);
  return !selectedCollections.some((collection) => {
    const selectedFacets = collectionFacets(collection);
    if (selectedFacets.length !== candidateSet.size) return false;
    return selectedFacets.every((facet) => candidateSet.has(facet));
  });
}

function shoppingOnlyGuideRisk(
  facets: CollectionFacet[],
  analysis: Record<string, unknown>,
  selectedCollections: RetrievedCollection[],
) {
  if (!facets.includes("guide")) return false;
  const selectedFacets = new Set(
    selectedCollections.flatMap((item) => collectionFacets(item)),
  );
  if (!selectedFacets.has("shopping")) return false;
  const text = evidenceText(analysis);
  return shoppingRoundupSignal(text) &&
    !standaloneNonShoppingGuideSignal(text);
}

function recoveredDecision(collection: RetrievedCollection) {
  const confidence = Math.min(
    0.95,
    Math.max(
      SECONDARY_RECOVERY_CONFIDENCE,
      finiteNumber(collection.rerank_confidence, SECONDARY_RECOVERY_CONFIDENCE),
    ),
  );
  const rationale = compactText([
    "Matched as an independent saved value from the retrieved Collection description.",
    collection.rerank_rationale || "",
  ], 240);
  return {
    type: "existing",
    collection_id: collection.id,
    title: collection.title,
    description: collection.description,
    rationale,
    confidence,
  };
}

function recoveryConfidence(collection: RetrievedCollection) {
  return Math.min(
    0.95,
    Math.max(
      SECONDARY_RECOVERY_CONFIDENCE,
      finiteNumber(collection.rerank_confidence, SECONDARY_RECOVERY_CONFIDENCE),
    ),
  );
}

function shouldTrustCollectionForRecovery(
  collection: RetrievedCollection,
  analysis: Record<string, unknown>,
  selectedCollections: RetrievedCollection[],
) {
  const facets = collectionFacets(collection);
  const confidence = finiteNumber(collection.rerank_confidence, 0);
  if (collection.rerank_fit !== "strong") return false;
  if (confidence < SECONDARY_RECOVERY_CONFIDENCE) return false;
  if (!facets.length) return false;
  if (shoppingOnlyGuideRisk(facets, analysis, selectedCollections)) {
    return false;
  }
  return hasFacetEvidence(facets, analysis);
}

function shouldBoostSelectedCollection(
  collection: RetrievedCollection,
  analysis: Record<string, unknown>,
  selectedCollections: RetrievedCollection[],
  decisionConfidence: number,
) {
  if (decisionConfidence < SELECTED_SECONDARY_BOOST_CONFIDENCE) return false;
  if (
    collection.rerank_fit === "none" &&
    finiteNumber(collection.rerank_confidence, 1) < 0.5
  ) {
    return false;
  }

  const facets = collectionFacets(collection);
  if (!facets.length) return false;
  if (!hasIndependentFacet(facets, selectedCollections)) return false;
  if (shoppingOnlyGuideRisk(facets, analysis, selectedCollections)) {
    return false;
  }
  return hasFacetEvidence(facets, analysis);
}

function candidateRecord(
  collection: RetrievedCollection,
  facets: CollectionFacet[],
  decision: RecoveryCandidate["decision"],
  reason: string,
): RecoveryCandidate {
  return {
    collection_id: collection.id,
    title: collection.title,
    rerank_rank: collection.rerank_rank ?? null,
    rerank_fit: collection.rerank_fit ?? null,
    rerank_confidence: typeof collection.rerank_confidence === "number"
      ? collection.rerank_confidence
      : null,
    facets,
    decision,
    reason,
  };
}

function diagnosticCollection(collection: RetrievedCollection) {
  return {
    collection_id: collection.id,
    title: collection.title,
    rerank_rank: collection.rerank_rank ?? null,
    rerank_fit: collection.rerank_fit ?? null,
    rerank_confidence: typeof collection.rerank_confidence === "number"
      ? collection.rerank_confidence
      : null,
  };
}

export function applySecondaryCollectionRecovery(
  analysis: AnalysisOutput,
  rerankedCollections: RetrievedCollection[],
  promptCollections: RetrievedCollection[],
): AnalysisOutput {
  const rawSelected = Array.isArray(analysis.collection_decisions)
    ? analysis.collection_decisions.map((item) =>
      normalizeCollectionDecision(item as Record<string, unknown>)
    )
    : [];
  const collectionsById = new Map(
    rerankedCollections.map((collection) => [collection.id, collection]),
  );
  const boostedSelected: Array<Record<string, unknown>> = [];
  const selected = rawSelected.map((decision) => {
    if (
      decision.collection_id &&
      decision.confidence < COLLECTION_AUTO_LINK_CONFIDENCE
    ) {
      const collection = collectionsById.get(decision.collection_id);
      const otherSelectedCollections = rawSelected
        .filter((item) => item.collection_id !== decision.collection_id)
        .map((item) =>
          item.collection_id ? collectionsById.get(item.collection_id) : null
        )
        .filter((item): item is RetrievedCollection => Boolean(item));
      if (
        collection &&
        (shouldTrustCollectionForRecovery(
          collection,
          analysis,
          otherSelectedCollections,
        ) ||
          shouldBoostSelectedCollection(
            collection,
            analysis,
            otherSelectedCollections,
            decision.confidence,
          ))
      ) {
        const confidence = recoveryConfidence(collection);
        const boosted = {
          ...decision,
          confidence,
          rationale: compactText([
            decision.rationale,
            "Boosted because reranking and source evidence strongly support this selected Collection.",
          ], 240),
        };
        boostedSelected.push(boosted);
        return boosted;
      }
    }
    return decision;
  });
  const selectedIds = new Set(
    selected.map((decision) => decision.collection_id).filter(Boolean),
  );
  const selectedCollections = Array.from(selectedIds)
    .map((id) => collectionsById.get(String(id)))
    .filter((item): item is RetrievedCollection => Boolean(item));
  const promptIds = new Set(
    promptCollections.map((collection) => collection.id),
  );
  const candidates: RecoveryCandidate[] = [];
  const recovered: Array<Record<string, unknown>> = [];
  const capBlocked: Array<Record<string, unknown>> = [];
  let availableSlots = Math.max(
    0,
    COLLECTION_AUTO_LINK_LIMIT - selected.length,
  );

  for (const collection of rerankedCollections) {
    if (selectedIds.has(collection.id)) continue;
    const rank = finiteNumber(collection.rerank_rank, Number.MAX_SAFE_INTEGER);
    if (rank > SECONDARY_RECOVERY_RERANK_LIMIT) continue;

    const facets = collectionFacets(collection);
    const confidence = finiteNumber(collection.rerank_confidence, 0);
    let blockReason = "";
    if (collection.rerank_fit !== "strong") {
      blockReason = "rerank_fit_not_strong";
    } else if (confidence < SECONDARY_RECOVERY_CONFIDENCE) {
      blockReason = "rerank_confidence_below_recovery_threshold";
    } else if (!facets.length) {
      blockReason =
        "collection_description_has_no_recoverable_saved_value_facet";
    } else if (!hasIndependentFacet(facets, selectedCollections)) {
      blockReason = "not_independent_from_selected_collections";
    } else if (
      shoppingOnlyGuideRisk(facets, analysis, selectedCollections)
    ) {
      blockReason =
        "shopping_roundup_does_not_need_independent_guide_collection";
    } else if (!hasFacetEvidence(facets, analysis)) {
      blockReason = "capture_evidence_does_not_support_collection_facet";
    }

    if (blockReason) {
      candidates.push(
        candidateRecord(collection, facets, "block", blockReason),
      );
      continue;
    }

    const decision = recoveredDecision(collection);
    if (availableSlots > 0) {
      recovered.push(decision);
      availableSlots -= 1;
      selectedIds.add(collection.id);
      selectedCollections.push(collection);
      candidates.push(candidateRecord(collection, facets, "recover", "added"));
    } else {
      capBlocked.push(decision);
      candidates.push(
        candidateRecord(collection, facets, "block", "auto_link_cap"),
      );
    }
  }

  const diagnostics = {
    retrieved_count: rerankedCollections.length,
    retrieved_collections: rerankedCollections.map(diagnosticCollection),
    prompt_candidate_count: promptCollections.length,
    selected_collection_ids: selected.map((decision) => decision.collection_id)
      .filter(Boolean),
    selected_collections: selected.map((decision) => ({
      collection_id: decision.collection_id,
      title: decision.title,
      confidence: decision.confidence,
    })).filter((decision) => decision.collection_id || decision.title),
    prompt_collection_ids: promptCollections.map((collection) => collection.id),
    prompt_collections: promptCollections.map(diagnosticCollection),
    not_passed_collection_ids: rerankedCollections
      .filter((collection) => !promptIds.has(collection.id))
      .map((collection) => collection.id),
    not_passed_collections: rerankedCollections
      .filter((collection) => !promptIds.has(collection.id))
      .map(diagnosticCollection),
    recovery_candidates: candidates,
    boosted_selected_decisions: boostedSelected,
    recovered_decisions: recovered,
    cap_blocked_decisions: capBlocked,
  };

  return {
    ...analysis,
    collection_decisions: [
      ...selected,
      ...recovered,
    ],
    collection_recall_diagnostics: diagnostics,
  };
}
