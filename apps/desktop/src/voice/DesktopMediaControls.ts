import { DEFAULT_CLIENT_SETTINGS, type ClientSettings } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopClientSettings from "../settings/DesktopClientSettings.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";
import { startMacMediaControlsProcess } from "./MacMediaControlsProcess.ts";

const MEDIA_CONTROL_MENU_ACTIONS = {
  toggle: "dictation.toggle",
  next: "dictation.send",
} as const;

export class DesktopMediaControls extends Context.Service<
  DesktopMediaControls,
  {
    readonly initialize: Effect.Effect<void>;
    readonly configure: (settings: ClientSettings) => Effect.Effect<void>;
  }
>()("@t3tools/desktop/voice/DesktopMediaControls") {}

const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const clientSettings = yield* DesktopClientSettings.DesktopClientSettings;
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  const runFork = Effect.runForkWith(yield* Effect.context<never>());
  let stop: (() => void) | undefined;

  const release = () => {
    stop?.();
    stop = undefined;
  };

  const configure = (settings: ClientSettings) =>
    Effect.sync(() => {
      const wanted = environment.platform === "darwin" && settings.voiceMediaControls;
      if (!wanted) return release();
      if (stop) return;
      stop = startMacMediaControlsProcess(
        (command) => {
          runFork(
            desktopWindow
              .dispatchMenuAction(MEDIA_CONTROL_MENU_ACTIONS[command])
              .pipe(Effect.ignoreCause),
          );
        },
        (error) => {
          stop = undefined;
          runFork(Effect.logWarning("media controls helper stopped", { error: error.message }));
        },
      );
    });

  yield* Effect.addFinalizer(() => Effect.sync(release));

  return DesktopMediaControls.of({
    initialize: clientSettings.get.pipe(
      Effect.flatMap((stored) =>
        configure(Option.getOrElse(stored, () => DEFAULT_CLIENT_SETTINGS)),
      ),
      Effect.ignoreCause,
    ),
    configure,
  });
});

export const layer = Layer.effect(DesktopMediaControls, make);
