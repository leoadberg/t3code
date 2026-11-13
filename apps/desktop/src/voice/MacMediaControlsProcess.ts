// @effect-diagnostics nodeBuiltinImport:off -- This macOS platform boundary spawns the native Now Playing helper with Node.

import * as NodeChildProcess from "node:child_process";

export type MediaControlCommand = "toggle" | "next";

// Headset buttons reach only the "Now Playing" app; with none, macOS launches Music instead.
// The helper claims that slot while it runs and exits with its parent.
const HELPER_SCRIPT = `
ObjC.import("AppKit");
ObjC.import("MediaPlayer");
ObjC.import("unistd");
$.NSApplication.sharedApplication.setActivationPolicy($.NSApplicationActivationPolicyProhibited);
function run() {
  const center = $.MPRemoteCommandCenter.sharedCommandCenter;
  const bind = (command, name) => {
    command.enabled = true;
    command.addTargetWithHandler(() => { console.log(name); return 0; });
  };
  bind(center.togglePlayPauseCommand, "toggle");
  bind(center.playCommand, "toggle");
  bind(center.pauseCommand, "toggle");
  bind(center.nextTrackCommand, "next");
  const info = $.MPNowPlayingInfoCenter.defaultCenter;
  info.nowPlayingInfo = $({ title: "T3 Code dictation" });
  info.playbackState = 1;
  console.log("ready");
  while ($.getppid() !== 1) {
    $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.5));
  }
  return "orphaned";
}`;

export function startMacMediaControlsProcess(
  onCommand: (command: MediaControlCommand) => void,
  onFailure: (error: Error) => void,
): () => void {
  const helper = NodeChildProcess.spawn(
    "/usr/bin/osascript",
    ["-l", "JavaScript", "-e", HELPER_SCRIPT],
    {
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  let stopped = false;
  let buffered = "";
  const stop = () => {
    if (stopped) return;
    stopped = true;
    helper.kill();
  };
  helper.stderr.on("data", (chunk: Buffer) => {
    buffered += chunk.toString();
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      const message = line.trim();
      if (stopped || (message !== "toggle" && message !== "next")) continue;
      try {
        onCommand(message);
      } catch {}
    }
  });
  const fail = (error: Error) => {
    if (stopped) return;
    stopped = true;
    onFailure(error);
  };
  helper.once("error", fail);
  helper.once("exit", (code) => fail(new Error(`Media controls helper exited with code ${code}`)));
  return stop;
}
