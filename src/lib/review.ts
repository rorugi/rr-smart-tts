import type { PhysicalSide, SmartTTSConfig } from './config';
import { cardShowsSemanticFrontFirst, isClozeCard } from './card_text';

export type ReviewContext = { cardId: string; rem: any; cardType: any; config: SmartTTSConfig; revealed: boolean; scopeIds?: string[] };
export const skipsClozeQuestion = (context: ReviewContext) =>
  context.config.skipClozeQuestions && !context.revealed && isClozeCard(context.cardType);

export function physicalSideForPhase(cardType: any, revealed: boolean): PhysicalSide {
  return cardShowsSemanticFrontFirst(cardType) !== revealed ? 'front' : 'back';
}

export function shouldAutoplay(config: SmartTTSConfig, revealed: boolean, side: PhysicalSide) {
  return config.enabled && ((revealed ? config.autoPlayAnswer : config.autoPlayQuestion) ||
    (side === 'front' ? config.autoPlayPhysicalFront : config.autoPlayPhysicalBack));
}

/** Applies queue state supplied by card widgets, events, or Top reconciliation. */
export class ReviewController {
  private version = 0;
  private configVersion = 0;
  private phaseVersion = 0;
  private context?: ReviewContext;
  private stopped = false;
  private played = new Set<string>();
  private pendingConfig = false;
  constructor(private readonly io: {
    load: () => Promise<ReviewContext | undefined>;
    config: (remId: string) => Promise<SmartTTSConfig>;
    changed: (context?: ReviewContext) => void;
    speak: (context: ReviewContext, side: PhysicalSide) => void;
    stop: () => void;
    error: (message: string) => void;
  }) {}

  clear() {
    this.version += 1;
    this.configVersion += 1;
    this.phaseVersion += 1;
    this.context = undefined;
    this.played.clear();
    this.stop();
    this.io.changed();
  }
  stop() { this.stopped = true; this.io.stop(); }
  async load() {
    const previous = this.context;
    const played = new Set(this.played);
    const wasStopped = this.stopped;
    this.clear();
    this.stopped = false;
    const request = this.version;
    const phase = this.phaseVersion;
    try {
      const context = await this.io.load();
      if (request !== this.version || !context) return;
      while (this.pendingConfig) {
        this.pendingConfig = false;
        context.config = await this.io.config(context.rem._id);
        if (request !== this.version) return;
      }
      // Reveal can arrive while the card/configuration is still loading.
      if (phase !== this.phaseVersion) context.revealed = true;
      this.context = context;
      if (previous?.cardId === context.cardId) {
        this.played = played;
        if (previous.revealed === context.revealed && wasStopped) this.stopped = true;
      }
      this.io.changed(context);
      this.autoplay();
    } catch { if (request === this.version) this.io.error('Could not load the current card.'); }
  }
  reveal() {
    this.phaseVersion += 1;
    if (this.context?.revealed) return;
    this.io.stop();
    this.stopped = false;
    if (this.context) {
      this.context = { ...this.context, revealed: true };
      this.io.changed(this.context);
      this.autoplay();
    }
  }
  play(side: PhysicalSide) {
    if (this.context?.config.enabled && !skipsClozeQuestion(this.context)) this.io.speak(this.context, side);
  }
  private autoplay() {
    const context = this.context;
    if (!context || skipsClozeQuestion(context) || this.stopped || this.played.has(String(context.revealed))) return;
    const side = physicalSideForPhase(context.cardType, context.revealed);
    if (!shouldAutoplay(context.config, context.revealed, side)) return;
    this.played.add(String(context.revealed));
    this.io.speak(context, side);
  }
  async refreshConfig() {
    const context = this.context;
    if (!context) { this.pendingConfig = true; return; }
    const version = this.version;
    const request = ++this.configVersion;
    try {
      const config = await this.io.config(context.rem._id);
      if (version !== this.version || request !== this.configVersion || !this.context) return;
      if (JSON.stringify(config) === JSON.stringify(this.context.config)) return;
      this.io.stop();
      this.context = { ...this.context, config };
      this.io.changed(this.context);
      this.autoplay();
    } catch { if (version === this.version) this.io.error('Could not refresh TTS settings.'); }
  }
}
