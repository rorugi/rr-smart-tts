import { QueueEvent, WidgetLocation, StorageEvents, renderWidget, useAPIEventListener, usePlugin } from '@remnote/plugin-sdk';
import { useEffect, useMemo, useRef, useState } from 'react';
import '../style.css';
import { CONTROLS_POSITION_KEY, ControlsPosition, getControlsPosition } from '../lib/controls_position';
import { configStorageKey, getEffectiveConfig } from '../lib/config';
import { getSemanticBackText, getSemanticFrontText } from '../lib/card_text';
import { speakPreparedText, stopSpeech } from '../lib/speech';
import { ReviewContext, ReviewController } from '../lib/review';

function SmartTTSWidget() {
  const plugin = usePlugin();
  const [position, setPosition] = useState<ControlsPosition>('right');
  useEffect(() => { void getControlsPosition(plugin).then(setPosition); }, [plugin]);
  useAPIEventListener(StorageEvents.StorageSyncedChange, CONTROLS_POSITION_KEY, () => { void getControlsPosition(plugin).then(setPosition); });
  const [context, setContext] = useState<ReviewContext>();
  const contextRef = useRef<ReviewContext>();
  const loadGeneration = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();
  const reportError = (message: string) => { void plugin.app.toast(message); };
  const reportSpeech = (message: string) => {
    if (/^(Could not|Speech |The .* voice|Nothing remains)/.test(message)) reportError(message);
  };
  const controller = useMemo(() => new ReviewController({
    load: async () => {
      // Card-scoped IDs are available when this widget mounts, before global queue state settles.
      const placement = await getControlsPosition(plugin);
      const widget = await plugin.widget.getWidgetContext<WidgetLocation.FlashcardUnder>();
      const active = placement === 'top' ? await plugin.queue.getCurrentCard().catch(() => undefined) : undefined;
      const cardId = active?._id || widget?.cardId;
      const remId = widget?.remId;
      if (!cardId || (!remId && !active)) return;
      const [rem, card] = await Promise.all([
        active ? active.getRem() : plugin.rem.findOne(remId), active || plugin.card.findOne(cardId),
      ]);
      if (!rem || !card) return;
      const cardType = await card.getType();
      const revealed = placement === 'top' ? await plugin.queue.hasRevealedAnswer().catch(() => false) : !!widget.revealed;
      const { config, scopeIds } = await getEffectiveConfig(plugin, rem._id);
      return { cardId: card._id, rem, cardType, revealed, config, scopeIds };
    },
    config: async (remId) => (await getEffectiveConfig(plugin, remId)).config,
    changed: (next) => { contextRef.current = next; setContext(next); },
    speak: (ctx, side) => {
      void speakPreparedText(() => (side === 'front' ? getSemanticFrontText : getSemanticBackText)(
        plugin, ctx.rem, ctx.cardType, ctx.config
      ), ctx.config, side, reportSpeech);
    },
    stop: stopSpeech,
    error: reportError,
  }), [plugin]);

  const cancelLoading = () => {
    loadGeneration.current += 1;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = undefined;
  };
  const loadCard = () => {
    cancelLoading();
    const request = loadGeneration.current;
    let attempts = 0;
    const run = async () => {
      await controller.load();
      if (request !== loadGeneration.current || contextRef.current) return;
      // Top mounts before the queue has a card. Retry serially, not concurrently.
      if (++attempts < 12) retryTimer.current = setTimeout(() => void run(), 250);
    };
    void run();
  };
  useEffect(() => { loadCard(); return () => { cancelLoading(); controller.clear(); }; }, [controller]);
  useAPIEventListener(QueueEvent.QueueLoadCard, undefined, () => {
    if (position === 'top') loadCard();
  });
  useAPIEventListener(QueueEvent.RevealAnswer, undefined, () => controller.reveal());
  useAPIEventListener(QueueEvent.QueueCompleteCard, undefined, () => { cancelLoading(); controller.clear(); });
  useAPIEventListener(QueueEvent.QueueExit, undefined, () => { cancelLoading(); controller.clear(); });
  const scopeKeys = JSON.stringify(context?.scopeIds || []);
  useEffect(() => {
    const keys = (JSON.parse(scopeKeys) as string[]).map(configStorageKey);
    const refresh = () => void controller.refreshConfig();
    keys.forEach((key) => plugin.event.addListener(StorageEvents.StorageSyncedChange, key, refresh));
    // Recheck after subscribing to close the initial load/subscription gap.
    if (keys.length) refresh();
    return () => keys.forEach((key) => plugin.event.removeListener(StorageEvents.StorageSyncedChange, key, refresh));
  }, [plugin, controller, scopeKeys]);

  if ((context && !context.config.enabled) || (!context && position !== 'top')) return <></>;
  const ready = !!context;
  return (
    <div className={"rr-tts-review-host rr-tts-position-" + position}>
      <div className="rr-tts-bar" role={position === 'top' ? 'toolbar' : 'group'} aria-label="Card speech controls">
        <button className="rr-tts-button rr-tts-play-button" aria-label="Front" disabled={!ready} onClick={() => controller.play('front')}><SpeakerIcon />Front</button>
        <button className="rr-tts-button rr-tts-play-button" aria-label="Back" disabled={!ready} onClick={() => controller.play('back')}><SpeakerIcon />Back</button>
        <button className="rr-tts-button" aria-label="Stop" onClick={() => controller.stop()}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false"><rect x="5" y="5" width="14" height="14" rx="1" /></svg>Stop</button>
      </div>
    </div>
  );
}

// Monochrome outlined speaker and sound waves, matching RemNote's review controls.
function SpeakerIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M11 5 6 9H3v6h3l5 4V5Z" />
    <path d="M14 9a5 5 0 0 1 0 6M17 6a9 9 0 0 1 0 12M20 3a13 13 0 0 1 0 18" />
  </svg>;
}

renderWidget(SmartTTSWidget);
