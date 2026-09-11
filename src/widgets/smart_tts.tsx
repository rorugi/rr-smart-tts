import {
  QueueEvent,
  renderWidget,
  useAPIEventListener,
  usePlugin,
} from '@remnote/plugin-sdk';
import { useCallback, useEffect, useState } from 'react';
import '../style.css';
import { getEffectiveConfig, SmartTTSConfig } from '../lib/config';
import {
  cardShowsSemanticFrontFirst,
  getSemanticBackText,
  getSemanticFrontText,
} from '../lib/card_text';
import { speakText, stopSpeech } from '../lib/speech';
import { cacheAvailableVoices } from '../lib/voices';

type PhysicalSide = 'front' | 'back';

type QueueContext = {
  rem?: any;
  cardType?: any;
  config?: SmartTTSConfig;
};

function physicalSideForPhase(cardType: any, answerRevealed: boolean): PhysicalSide {
  const frontFirst = cardShowsSemanticFrontFirst(cardType);
  if (!answerRevealed) return frontFirst ? 'front' : 'back';
  return frontFirst ? 'back' : 'front';
}

function shouldAutoplayPhase(
  config: SmartTTSConfig,
  answerRevealed: boolean,
  side: PhysicalSide
): boolean {
  const phaseEnabled = answerRevealed ? config.autoPlayAnswer : config.autoPlayQuestion;
  const sideEnabled =
    side === 'front' ? config.autoPlayPhysicalFront : config.autoPlayPhysicalBack;
  return phaseEnabled || sideEnabled;
}

function SmartTTSWidget() {
  const plugin = usePlugin();
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [context, setContext] = useState<QueueContext>({});

  const refreshContext = useCallback(async () => {
    try {
      const card = await plugin.queue.getCurrentCard();
      const rem = await card?.getRem();
      const cardType = await card?.getType();
      const effective = await getEffectiveConfig(plugin, rem?._id);
      setContext({ rem, cardType, config: effective.config });
      await cacheAvailableVoices(plugin);
    } catch {
      setContext({});
    }
  }, [plugin]);

  const config = context.config;
  const contextRem = context.rem;
  const cardType = context.cardType;

  const speakPhysicalSide = useCallback(
    async (side: PhysicalSide) => {
      if (!config?.enabled || !contextRem) return;
      const text =
        side === 'front'
          ? await getSemanticFrontText(plugin, contextRem, cardType, config)
          : await getSemanticBackText(plugin, contextRem, cardType, config);
      if (!text) return;
      speakText(text, config);
    },
    [plugin, config, contextRem, cardType]
  );

  const maybeAutoplay = useCallback(
    async (revealed: boolean) => {
      if (!config?.enabled || !contextRem) return;
      const side = physicalSideForPhase(cardType, revealed);
      if (!shouldAutoplayPhase(config, revealed, side)) return;
      await speakPhysicalSide(side);
    },
    [config, contextRem, cardType, speakPhysicalSide]
  );

  useEffect(() => {
    void refreshContext();
    return () => stopSpeech();
  }, [refreshContext]);

  useEffect(() => {
    if (!config?.enabled || !contextRem || answerRevealed) return;
    void maybeAutoplay(false);
  }, [
    config?.enabled,
    config?.autoPlayQuestion,
    config?.autoPlayPhysicalFront,
    config?.autoPlayPhysicalBack,
    contextRem?._id,
    cardType,
    answerRevealed,
    maybeAutoplay,
  ]);

  useAPIEventListener(QueueEvent.RevealAnswer, undefined, () => {
    stopSpeech();
    setAnswerRevealed(true);
    if (config?.enabled) void maybeAutoplay(true);
  });

  useAPIEventListener(QueueEvent.QueueCompleteCard, undefined, () => {
    stopSpeech();
    setAnswerRevealed(false);
    // Let RemNote advance the queue before resolving the next current card.
    setTimeout(() => void refreshContext(), 80);
  });

  useAPIEventListener(QueueEvent.QueueEnter, undefined, () => {
    setAnswerRevealed(false);
    void refreshContext();
  });

  useAPIEventListener(QueueEvent.QueueExit, undefined, () => {
    stopSpeech();
    setContext({});
  });

  if (!config?.enabled || !contextRem) return <></>;

  return (
    <div className="rr-tts-bar rr-tts-bar-fixed">
      <button className="rr-tts-button rr-tts-play-button" onClick={() => void speakPhysicalSide('front')}>
        🔊 Front
      </button>
      <button className="rr-tts-button rr-tts-play-button" onClick={() => void speakPhysicalSide('back')}>
        🔊 Back
      </button>
      <button className="rr-tts-button" onClick={stopSpeech}>
        ■ Stop
      </button>
    </div>
  );
}

renderWidget(SmartTTSWidget);
