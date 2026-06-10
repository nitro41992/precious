import { registerRootComponent } from "expo";
import { KeyboardProvider } from "react-native-keyboard-controller";

import App from "./app/App";

// KeyboardProvider must sit above every screen so the keyboard-aware sheets can
// read the live OS keyboard animation. App early-returns many trees (boot, auth,
// main stack), so we wrap it once at the true root rather than inside App.
//
// KeyboardProvider runs the window edge-to-edge. The app's system bars are
// translucent in that mode (content draws behind them), so we must tell the
// provider — otherwise the reported keyboard height is off by the navigation-bar
// height and the sheet floats a gap above the keyboard.
function Root() {
  return (
    <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
      <App />
    </KeyboardProvider>
  );
}

registerRootComponent(Root);
