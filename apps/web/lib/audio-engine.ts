export interface MixPlanSegment {
  trackId: string;
  type: "outgoing" | "incoming" | "middle";
  playFromSec: number;
  playToSec: number;
  splitPointSec: number;
  outroStretchRatio: number;
  entryPointSec: number;
  masterStartSec: number;
  fadeInStartSec?: number;
  fadeInEndSec?: number;
  fadeOutStartSec?: number;
  fadeOutEndSec?: number;
}

export interface MixPlan {
  transitionBeats: number;
  transitionSeconds: number;
  totalDurationSec: number;
  segments: MixPlanSegment[];
}

interface TrackBuffer {
  trackId: string;
  buffer: AudioBuffer;
  url: string;
}

export class MixAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeSources: AudioBufferSourceNode[] = [];
  private trackBuffers: Map<string, TrackBuffer> = new Map();
  private startTime: number = 0;
  private pauseOffset: number = 0;
  private _isPlaying: boolean = false;
  private _currentTime: number = 0;
  private animationFrame: number | null = null;
  private onTimeUpdate: ((time: number) => void) | null = null;
  private onFinish: (() => void) | null = null;

  get isPlaying() {
    return this._isPlaying;
  }
  get currentTime() {
    return this._currentTime;
  }
  get duration() {
    return this.plan?.totalDurationSec ?? 0;
  }

  private plan: MixPlan | null = null;

  async init() {
    if (this.ctx) return;

    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
  }

  setCallbacks(onTimeUpdate: (t: number) => void, onFinish: () => void) {
    this.onTimeUpdate = onTimeUpdate;
    this.onFinish = onFinish;
  }

  // Load tracks
  async loadTracks(tracks: Array<{ trackId: string; url: string }>) {
    await this.init();
    if (!this.ctx) throw new Error("AudioContext not initialized");

    for (const track of tracks) {
      if (this.trackBuffers.has(track.trackId)) continue;

      console.log(`Loading track: ${track.trackId}`);
      const response = await fetch(track.url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

      this.trackBuffers.set(track.trackId, {
        trackId: track.trackId,
        buffer: audioBuffer,
        url: track.url,
      });

      console.log(`  Loaded: ${audioBuffer.duration.toFixed(1)}s`);
    }
  }

  // Set the mix plan
  setPlan(plan: MixPlan) {
    this.plan = plan;
  }

  // Play
  async play(fromTime: number = 0) {
    await this.init();
    if (!this.ctx || !this.masterGain || !this.plan) return;

    // Resume context if suspended (browser policy)
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    // Stop any existing sources
    this.stopAllSources();

    this.pauseOffset = fromTime;
    this.startTime = this.ctx.currentTime - fromTime;
    this._isPlaying = true;

    // Schedule each segment
    for (const seg of this.plan.segments) {
      this.scheduleSegment(seg);
    }

    // Start time tracking
    this.startTimeTracking();
  }

  // Pause
  pause() {
    if (!this.ctx || !this._isPlaying) return;

    this.pauseOffset = this.ctx.currentTime - this.startTime;
    this._isPlaying = false;
    this.stopAllSources();
    this.stopTimeTracking();
  }

  // Stop
  stop() {
    this.pause();
    this.pauseOffset = 0;
    this._currentTime = 0;
  }

  // Seek
  async seek(time: number) {
    const wasPlaying = this._isPlaying;
    this.stop();
    this.pauseOffset = time;
    this._currentTime = time;

    if (wasPlaying) {
      await this.play(time);
    }
  }

  // Volume
  setVolume(vol: number) {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, vol));
    }
  }

  // Schedule a single segment
  private scheduleSegment(seg: MixPlanSegment) {
    if (!this.ctx || !this.masterGain) return;

    const trackData = this.trackBuffers.get(seg.trackId);
    if (!trackData) {
      console.warn(`Track buffer not found: ${seg.trackId}`);
      return;
    }

    const { buffer } = trackData;

    // Calculate timing relative to NOW
    const now = this.ctx.currentTime;
    const mixStart = this.startTime;

    // When this segment starts on the master timeline
    const segMasterStart = seg.masterStartSec;
    const segAbsoluteStart = mixStart + segMasterStart;

    // Skip segments that are entirely in the past
    const segEnd =
      segMasterStart +
      (seg.playToSec - seg.playFromSec) / seg.outroStretchRatio;
    if (segEnd < this.pauseOffset) return;

    // Normal section (original speed)
    const normalDuration = seg.splitPointSec - seg.playFromSec;

    if (normalDuration > 0.01) {
      const normalSource = this.ctx.createBufferSource();
      normalSource.buffer = buffer;
      normalSource.playbackRate.value = 1.0;

      const normalGain = this.ctx.createGain();
      normalGain.connect(this.masterGain);
      normalSource.connect(normalGain);

      // When to start playing this source
      const sourceStartTime = Math.max(segAbsoluteStart, now);
      const delay = Math.max(0, sourceStartTime - now);

      // Where in the buffer to start
      const bufferOffset =
        seg.playFromSec + Math.max(0, this.pauseOffset - segMasterStart);

      // Duration to play
      let duration =
        normalDuration - Math.max(0, this.pauseOffset - segMasterStart);
      if (duration <= 0) return;

      normalSource.start(sourceStartTime, bufferOffset, duration);

      // Apply fades
      this.applyFades(normalGain, seg, segMasterStart, mixStart);

      this.activeSources.push(normalSource);
    }

    // Stretched outro section
    if (
      Math.abs(seg.outroStretchRatio - 1.0) > 0.001 &&
      seg.splitPointSec < seg.playToSec
    ) {
      const outroSource = this.ctx.createBufferSource();
      outroSource.buffer = buffer;
      outroSource.playbackRate.value = seg.outroStretchRatio;

      const outroGain = this.ctx.createGain();
      outroGain.connect(this.masterGain);
      outroSource.connect(outroGain);

      // The outro starts after the normal section on the master timeline
      const outroMasterStart = segMasterStart + normalDuration;
      const outroAbsoluteStart = mixStart + outroMasterStart;

      const sourceStartTime = Math.max(outroAbsoluteStart, now);
      const delay = Math.max(0, sourceStartTime - now);

      // Buffer offset for the outro
      const bufferOffset = seg.splitPointSec;

      // Duration in original time
      const outroOriginalDuration = seg.playToSec - seg.splitPointSec;

      // Adjust for how much has already elapsed
      const elapsedInNormal = Math.max(0, this.pauseOffset - segMasterStart);
      if (
        elapsedInNormal >=
        normalDuration + outroOriginalDuration / seg.outroStretchRatio
      ) {
        return; // Entirely in the past
      }

      let adjustedBufferOffset = bufferOffset;
      let adjustedDuration = outroOriginalDuration;

      if (this.pauseOffset > outroMasterStart) {
        // We're partway through the outro
        const elapsedInOutro = this.pauseOffset - outroMasterStart;
        adjustedBufferOffset =
          bufferOffset + elapsedInOutro * seg.outroStretchRatio;
        adjustedDuration =
          outroOriginalDuration - elapsedInOutro * seg.outroStretchRatio;
      }

      if (adjustedDuration <= 0) return;

      outroSource.start(
        sourceStartTime,
        adjustedBufferOffset,
        adjustedDuration,
      );

      // Apply fades
      this.applyFades(outroGain, seg, segMasterStart, mixStart);

      this.activeSources.push(outroSource);
    }
  }

  // Apply fade automation
  private applyFades(
    gainNode: GainNode,
    seg: MixPlanSegment,
    segMasterStart: number,
    mixStart: number,
  ) {
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // Fade in
    if (seg.fadeInStartSec !== undefined && seg.fadeInEndSec !== undefined) {
      const fadeInAbsStart = mixStart + seg.fadeInStartSec;
      const fadeInDuration = seg.fadeInEndSec - seg.fadeInStartSec;

      if (fadeInAbsStart + fadeInDuration > now) {
        gainNode.gain.setValueAtTime(0, Math.max(fadeInAbsStart, now));
        gainNode.gain.linearRampToValueAtTime(
          1,
          Math.max(fadeInAbsStart + fadeInDuration, now + 0.01),
        );
      }
    }

    // Fade out
    if (seg.fadeOutStartSec !== undefined && seg.fadeOutEndSec !== undefined) {
      const fadeOutAbsStart = mixStart + seg.fadeOutStartSec;
      const fadeOutDuration = seg.fadeOutEndSec - seg.fadeOutStartSec;

      if (fadeOutAbsStart + fadeOutDuration > now) {
        gainNode.gain.setValueAtTime(1, Math.max(fadeOutAbsStart, now));
        gainNode.gain.linearRampToValueAtTime(
          0,
          Math.max(fadeOutAbsStart + fadeOutDuration, now + 0.01),
        );
      }
    }
  }

  // Time tracking
  private startTimeTracking() {
    const tick = () => {
      if (!this.ctx || !this._isPlaying) return;

      this._currentTime = this.ctx.currentTime - this.startTime;

      this.onTimeUpdate?.(this._currentTime);

      if (this.plan && this._currentTime >= this.plan.totalDurationSec) {
        this._isPlaying = false;
        this.stopAllSources();
        this.onFinish?.();
        return;
      }

      this.animationFrame = requestAnimationFrame(tick);
    };

    tick();
  }

  private stopTimeTracking() {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  // Cleanup
  private stopAllSources() {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {}
    }
    this.activeSources = [];
  }

  destroy() {
    this.stop();
    this.trackBuffers.clear();
    this.ctx?.close();
    this.ctx = null;
  }
}
