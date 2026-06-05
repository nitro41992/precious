import { useEffect, useMemo, useRef, useState } from "react";

import {
  capturesForListMode,
  capturesForSearchScope,
  mergeSearchResults,
  searchCacheKey
} from "../captureLogic";
import {
  friendlyError,
  searchableCaptureText,
  uniqueCaptures
} from "../capturePresentation";
import { requestJson } from "../nativeBridge";
import {
  captureFromRemote,
  edgeResourceUrl,
  isEdgeCaptureApi
} from "../remoteData";
import type {
  AppConfig,
  AuthSession,
  Capture,
  SearchRemoteMode
} from "../types";

const SEARCH_KEYWORD_DEBOUNCE_MS = 120;
const SEARCH_HYBRID_DELAY_MS = 520;

export function useCaptureSearch({
  captures,
  config,
  session,
  withFreshAccessToken
}: {
  captures: Capture[];
  config: AppConfig | null;
  session: AuthSession | null;
  withFreshAccessToken: <T>(send: (accessToken: string) => Promise<T>) => Promise<T>;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [remoteSearchResults, setRemoteSearchResults] = useState<Capture[]>([]);
  const [remoteSearchLoading, setRemoteSearchLoading] = useState(false);
  const [remoteSearchEnhancing, setRemoteSearchEnhancing] = useState(false);
  const [remoteSearchKey, setRemoteSearchKey] = useState("");
  const [remoteSearchError, setRemoteSearchError] = useState("");
  const searchRequestSeqRef = useRef(0);
  const searchResultsCacheRef = useRef<Record<string, Capture[]>>({});
  const searchResultsModeRef = useRef<Record<string, SearchRemoteMode>>({});

  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setRemoteSearchResults([]);
    setRemoteSearchError("");
    setRemoteSearchLoading(false);
    setRemoteSearchEnhancing(false);
    setRemoteSearchKey("");
    searchResultsCacheRef.current = {};
    searchResultsModeRef.current = {};
  }, [session?.userId]);

  const searchPool = useMemo(() => {
    return uniqueCaptures(capturesForListMode(captures, "active"));
  }, [captures]);
  const searchTerm = searchQuery.trim();
  const currentSearchKey = searchCacheKey("active", searchTerm);
  const remoteSearchActive = Boolean(
    searchOpen &&
      searchTerm &&
      config?.apiUrl &&
      session &&
      isEdgeCaptureApi(config.apiUrl)
  );
  const localSearchResults = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return [];
    return searchPool.filter((capture) => searchableCaptureText(capture).includes(term));
  }, [searchPool, searchQuery]);
  const remoteSearchReadyForQuery = Boolean(
    remoteSearchActive &&
      currentSearchKey &&
      remoteSearchKey === currentSearchKey &&
      !remoteSearchError
  );
  const scopedRemoteSearchResults = useMemo(
    () => capturesForSearchScope(remoteSearchResults, "active"),
    [remoteSearchResults]
  );
  const searchResults = remoteSearchReadyForQuery
    ? mergeSearchResults(localSearchResults, scopedRemoteSearchResults)
    : localSearchResults;

  useEffect(() => {
    if (!remoteSearchActive || !config?.apiUrl || !session) {
      searchRequestSeqRef.current += 1;
      setRemoteSearchLoading(false);
      setRemoteSearchEnhancing(false);
      setRemoteSearchError("");
      if (!searchTerm) {
        setRemoteSearchResults([]);
        setRemoteSearchKey("");
      }
      return;
    }
    if (!currentSearchKey) return;
    const requestId = searchRequestSeqRef.current + 1;
    searchRequestSeqRef.current = requestId;
    const cached = searchResultsCacheRef.current[currentSearchKey];
    if (cached) {
      setRemoteSearchResults(cached);
      setRemoteSearchKey(currentSearchKey);
      setRemoteSearchLoading(false);
      setRemoteSearchEnhancing(true);
    } else {
      setRemoteSearchLoading(true);
      setRemoteSearchEnhancing(false);
    }
    setRemoteSearchError("");
    const runSearch = async (mode: SearchRemoteMode) => {
      try {
        const json = await withFreshAccessToken((accessToken) =>
          requestJson<{ captures?: Array<Record<string, any>> }>(
            edgeResourceUrl(config.apiUrl, "search", {
              q: searchTerm,
              scope: "active",
              mode,
              limit: "50"
            }),
            {
              headers: {
                accept: "application/json",
                apikey: config.supabaseAnonKey,
                authorization: `Bearer ${accessToken}`
              }
            }
          )
        );
        if (searchRequestSeqRef.current !== requestId) return;
        if (mode === "keyword" && searchResultsModeRef.current[currentSearchKey] === "hybrid") return;
        const rows = (json.captures ?? []).map(captureFromRemote);
        const existing = searchResultsCacheRef.current[currentSearchKey] || [];
        const nextRows = mode === "hybrid" ? mergeSearchResults(existing, rows) : rows;
        searchResultsCacheRef.current[currentSearchKey] = nextRows;
        searchResultsModeRef.current[currentSearchKey] = mode;
        setRemoteSearchResults(nextRows);
        setRemoteSearchKey(currentSearchKey);
        setRemoteSearchLoading(false);
        setRemoteSearchEnhancing(mode === "keyword");
      } catch (error) {
        if (searchRequestSeqRef.current !== requestId) return;
        if (mode === "keyword") {
          setRemoteSearchLoading(false);
          setRemoteSearchEnhancing(true);
          return;
        }
        if (!searchResultsCacheRef.current[currentSearchKey]?.length) {
          setRemoteSearchError(friendlyError(error, "Search is using local matches."));
        }
        setRemoteSearchEnhancing(false);
        setRemoteSearchLoading(false);
      } finally {
        if (searchRequestSeqRef.current === requestId && mode === "hybrid") {
          setRemoteSearchEnhancing(false);
        }
      }
    };
    const keywordTimer = setTimeout(() => void runSearch("keyword"), SEARCH_KEYWORD_DEBOUNCE_MS);
    const hybridTimer = setTimeout(() => void runSearch("hybrid"), SEARCH_HYBRID_DELAY_MS);
    return () => {
      clearTimeout(keywordTimer);
      clearTimeout(hybridTimer);
    };
  }, [
    config?.apiUrl,
    config?.supabaseAnonKey,
    currentSearchKey,
    remoteSearchActive,
    searchTerm,
    session?.userId,
    withFreshAccessToken
  ]);

  return {
    currentSearchKey,
    remoteSearchActive,
    remoteSearchEnhancing,
    remoteSearchError,
    remoteSearchKey,
    remoteSearchLoading,
    remoteSearchResults,
    searchOpen,
    searchQuery,
    searchResults,
    searchScope: "active" as const,
    searchScopeOpen: false,
    searchTerm,
    setRemoteSearchEnhancing,
    setRemoteSearchError,
    setRemoteSearchKey,
    setRemoteSearchLoading,
    setRemoteSearchResults,
    setSearchOpen,
    setSearchQuery,
    setSearchScope: (_scope: "active") => {},
    setSearchScopeOpen: (_value: boolean | ((current: boolean) => boolean)) => {}
  };
}
