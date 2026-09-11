import { QueueEvent, WidgetLocation, StorageEvents, renderWidget, useAPIEventListener, usePlugin } from '@remnote/plugin-sdk';
import { useEffect, useMemo, useState } from 'react';
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
  const reportError = (message: string) => { void plugin.app.toast(message); };
  const reportSpeech = (message: string) => {
    if (/^(Could not|Speech |The .* voice|Nothing remains)/.test(message)) reportError(message);
  };
  const controller = useMemo(() => new ReviewController({
    load: async () => {
      // Card-scoped IDs are available when this widget mounts, before global queue state settles.
      const placement = await getControlsPosition(plugin);
      const widget = await plugin.widget.getWidgetContext<WidgetLocation.FlashcardUnder>();
      const queueCard = placement === 'toolbar' ? await plugin.queue.getCurrentCard() : undefined;
      const cardId = queueCard?._id || widget?.cardId;
      const remId = queueCard?.remId || widget?.remId;
      if (!cardId || (!remId && !queueCard)) return;
      const [rem, card] = await Promise.all([
        queueCard ? queueCard.getRem() : plugin.rem.findOne(remId), queueCard || plugin.card.findOne(cardId),
      ]);
      if (!rem || !card) return;
      const cardType = await card.getType();
      const revealed = placement === 'toolbar' ? await plugin.queue.hasRevealedAnswer() : !!widget.revealed;
      const { config, scopeIds } = await getEffectiveConfig(plugin, rem._id);
      return { cardId: card._id, rem, cardType, revealed, config, scopeIds };
    },
    config: async (remId) => (await getEffectiveConfig(plugin, remId)).config,
    changed: setContext,
    speak: (ctx, side) => {
      void speakPreparedText(() => (side === 'front' ? getSemanticFrontText : getSemanticBackText)(
        plugin, ctx.rem, ctx.cardType, ctx.config
      ), ctx.config, side, reportSpeech);
    },
    stop: stopSpeech,
    error: reportError,
  }), [plugin]);

  useEffect(() => { void controller.load(); return () => controller.clear(); }, [controller]);
  useAPIEventListener(QueueEvent.QueueLoadCard, undefined, () => { if (position === 'toolbar') void controller.load(); });
  useAPIEventListener(QueueEvent.RevealAnswer, undefined, () => controller.reveal());
  useAPIEventListener(QueueEvent.QueueCompleteCard, undefined, () => controller.clear());
  useAPIEventListener(QueueEvent.QueueExit, undefined, () => controller.clear());
  const scopeKeys = JSON.stringify(context?.scopeIds || []);
  useEffect(() => {
    const keys = (JSON.parse(scopeKeys) as string[]).map(configStorageKey);
    const refresh = () => void controller.refreshConfig();
    keys.forEach((key) => plugin.event.addListener(StorageEvents.StorageSyncedChange, key, refresh));
    // Recheck after subscribing to close the initial load/subscription gap.
    if (keys.length) refresh();
    return () => keys.forEach((key) => plugin.event.removeListener(StorageEvents.StorageSyncedChange, key, refresh));
  }, [plugin, controller, scopeKeys]);

  if (!context?.config.enabled) return <></>;
  return (
    <div className={"rr-tts-review-host rr-tts-position-" + position}>
      <div className="rr-tts-bar" role="group" aria-label="Card speech controls">
        <button className="rr-tts-button rr-tts-play-button" aria-label="Front" onClick={() => controller.play('front')}><SpeakerIcon />Front</button>
        <button className="rr-tts-button rr-tts-play-button" aria-label="Back" onClick={() => controller.play('back')}><SpeakerIcon />Back</button>
        <button className="rr-tts-button" aria-label="Stop" onClick={() => controller.stop()}>Stop</button>
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
