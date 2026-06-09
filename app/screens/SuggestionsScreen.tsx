import type { ReactNode } from "react";
import { Animated, ScrollView, StatusBar, View } from "react-native";
import { ArrowLeft, Sparkle } from "phosphor-react-native";

import type { Collection } from "../types";
import { IconButton } from "../ui/components";
import { CollectionSuggestionGridCard } from "../ui/rows";
import { appTheme, colors } from "../ui/theme";
import { styles } from "../ui/styles";
import { Text } from "../ui/typography";

type SuggestionsScreenProps = {
  data: {
    appSheets: ReactNode;
    suggestions: Collection[];
    suggestionsMotion: Animated.Value;
    toast: ReactNode;
  };
  state: {
    suggestionBusyId: string | null;
  };
  actions: {
    closeSuggestions: () => void;
    openSuggestion: (collectionId: string) => void;
    persistSuggestion: (collectionId: string) => void;
  };
};

// A dedicated home for AI collection suggestions, reached from the Collections
// "See suggestions" entry. Reuses the same suggestion grid card as the inline
// surface used to; tapping a card opens its detail (suggestion) screen.
export function SuggestionsScreen({ actions, data, state }: SuggestionsScreenProps) {
  const { appSheets, suggestions, suggestionsMotion, toast } = data;
  const { suggestionBusyId } = state;
  const { closeSuggestions, openSuggestion, persistSuggestion } = actions;

  return (
    <View style={styles.safe}>
      <StatusBar barStyle={appTheme.statusBarStyle} />
      <Animated.View
        style={[
          styles.searchScreen,
          {
            opacity: suggestionsMotion,
            transform: [
              {
                translateY: suggestionsMotion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [12, 0]
                })
              }
            ]
          }
        ]}
      >
        <ScrollView
          contentContainerStyle={styles.suggestionsScreenContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.detailHeader}>
            <IconButton Icon={ArrowLeft} label="Back" onPress={closeSuggestions} />
            <View style={styles.detailHeaderActions}>
              <View style={styles.detailSuggestedTag}>
                <Sparkle color={colors.accentTextStrong} size={13} weight="fill" />
                <Text style={styles.detailSuggestedTagText}>
                  {suggestions.length} {suggestions.length === 1 ? "suggestion" : "suggestions"}
                </Text>
              </View>
            </View>
          </View>
          <Text style={styles.title}>Suggested collections</Text>
          <Text style={styles.sourceText}>
            Groupings we noticed across your captures. Add the ones that fit; dismiss the rest.
          </Text>
          {suggestions.length ? (
            <View style={styles.suggestionSectionGrid}>
              {suggestions.map((suggestion) => (
                <CollectionSuggestionGridCard
                  busy={suggestionBusyId === suggestion.id}
                  item={suggestion}
                  key={suggestion.id}
                  onPersist={() => persistSuggestion(suggestion.id)}
                  onPress={() => openSuggestion(suggestion.id)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.searchEmpty}>
              <Text style={styles.emptyTitle}>No suggestions right now.</Text>
              <Text style={styles.emptyText}>
                Keep saving — collections get suggested as patterns emerge.
              </Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>
      {appSheets}
      {toast}
    </View>
  );
}
