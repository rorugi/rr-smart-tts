import { QueueEvent, StorageEvents, renderWidget, useAPIEventListener, usePlugin } from '@remnote/plugin-sdk';
import { useEffect, useMemo, useState } from 'react';
import '../style.css';
import { configStorageKey, getEffectiveConfig } from '../lib/config';
import { getSemanticBackText, getSemanticFrontText } from '../lib/card_text';
import { speakPreparedText, stopSpeech } from '../lib/speech';
import { ReviewContext, ReviewController } from '../lib/review';

function SmartTTSWidget() {
  const plugin = usePlugin();
  const [context, setContext] = useState<ReviewContext>();
  const [status, setStatus] = useState('');
  const controller = useMemo(() => new ReviewController({
    load: async () => {
      const card = await plugin.queue.getCurrentCard();
      if (!card) return;
      const [rem, cardType, revealed] = await Promise.all([
        card.getRem(), card.getType(), plugin.queue.hasRevealedAnswer(),
      ]);
      if (!rem) return;
      const { config, scopeIds } = await getEffectiveConfig(plugin, rem._id);
      return { cardId: card._id, rem, cardType, revealed, config, scopeIds };
    },
    config: async (remId) => (await getEffectiveConfig(plugin, remId)).config,
    changed: setContext,
    speak: (ctx, side) => {
      void speakPreparedText(() => (side === 'front' ? getSemanticFrontText : getSemanticBackText)(
        plugin, ctx.rem, ctx.cardType, ctx.config
      ), ctx.config, side, setStatus);
    },
    stop: stopSpeech,
    error: setStatus,
  }), [plugin]);

  useEffect(() => { void controller.load(); return () => controller.clear(); }, [controller]);
  useAPIEventListener(QueueEvent.QueueLoadCard, undefined, () => void controller.load());
  useAPIEventListener(QueueEvent.RevealAnswer, undefined, () => controller.reveal());
  useAPIEventListener(QueueEvent.QueueCompleteCard, undefined, () => controller.clear());
  useAPIEventListener(QueueEvent.QueueEnter, undefined, () => void controller.load());
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

  if (context && !context.config.enabled) return <></>;
  const ready = !!context;
  return (
    <div className="rr-tts-review-host">
    <div className="rr-tts-bar" style={plugin.isNative ? { position: 'fixed', top: 96, right: 16, zIndex: 100 } : undefined}>
      <button className="rr-tts-button rr-tts-play-button" disabled={!ready} onClick={() => controller.play('front')}>🔊 Front</button>
      <button className="rr-tts-button rr-tts-play-button" disabled={!ready} onClick={() => controller.play('back')}>🔊 Back</button>
      <button className="rr-tts-button" onClick={() => { controller.stop(); setStatus('Stopped.'); }}>■ Stop</button>
      <span className="rr-tts-status" role="status" title={status}>{status || (!ready ? 'Waiting for a review card…' : '')}</span>
      {!ready && status && <button className="rr-tts-button" onClick={() => void controller.load()}>Retry</button>}
    </div>
    </div>
  );
}

renderWidget(SmartTTSWidget);
