import type { RNPlugin, RichTextInterface } from '@remnote/plugin-sdk';

// @remnote/plugin-sdk 0.0.46 does not export CardType or Rem as public types.
// Keep these as local compatibility aliases so the plugin remains buildable across SDK versions.
type CardTypeLike = any;
type RemLike = any;
import type { SmartTTSConfig } from './config';
import { richTextToSpeechText } from './filter';

const isClozeCard = (cardType?: CardTypeLike): cardType is { clozeId: string } =>
  typeof cardType === 'object' && cardType !== null && 'clozeId' in cardType;

function withClozeBlank(richText: RichTextInterface | undefined, clozeId?: string): RichTextInterface {
  if (!richText) return [];
  if (!clozeId) return richText;

  return richText.map((node: any) => {
    if (typeof node === 'object' && node && 'cId' in node && node.cId === clozeId) {
      return 'blank';
    }
    return node;
  }) as RichTextInterface;
}

export async function getSemanticFrontText(
  plugin: RNPlugin,
  contextRem: RemLike | undefined,
  cardType: CardTypeLike | undefined,
  config: SmartTTSConfig
): Promise<string> {
  if (!contextRem) return '';
  if (isClozeCard(cardType)) {
    const combined = ((contextRem.text || []) as any[])
      .concat([' '])
      .concat((contextRem.backText || []) as any[]);
    return richTextToSpeechText(plugin, withClozeBlank(combined as RichTextInterface, cardType.clozeId), config);
  }
  return richTextToSpeechText(plugin, contextRem.text, config);
}

export async function getSemanticBackText(
  plugin: RNPlugin,
  contextRem: RemLike | undefined,
  cardType: CardTypeLike | undefined,
  config: SmartTTSConfig
): Promise<string> {
  if (!contextRem) return '';

  if (isClozeCard(cardType)) {
    const combined = ((contextRem.text || []) as any[])
      .concat([' '])
      .concat((contextRem.backText || []) as any[]);
    return richTextToSpeechText(plugin, combined as RichTextInterface, config);
  }

  // Always prepare the direct answer independently of optional multiline RPCs.
  // Some clients expose a serialized Rem or reject child/card-item lookups.
  const hasBackText = Array.isArray(contextRem.backText) && contextRem.backText.length > 0;
  const directBack = await richTextToSpeechText(plugin, contextRem.backText, config);
  if (Array.isArray(contextRem.children) && contextRem.children.length === 0) return directBack;

  // Prefer confirmed multiline items when present, even if the Rem also has
  // back text. Never interpret ordinary child notes as answer items.
  try {
    const rem = typeof contextRem.getChildrenRem === 'function'
      ? contextRem : await plugin.rem.findOne(contextRem._id);
    if (!rem || typeof rem.getChildrenRem !== 'function') {
      throw new Error('RemNote could not load the multiline answer.');
    }
    const children = await rem.getChildrenRem();
    const items = await Promise.all((children || []).map(async (child: RemLike) => {
      const item = typeof child?.isCardItem === 'function' ? child : await plugin.rem.findOne(child?._id);
      if (!item || typeof item.isCardItem !== 'function') {
        throw new Error('RemNote could not identify a multiline answer item.');
      }
      return await item.isCardItem() ? item : undefined;
    }));
    const multilineChildren = items.filter(Boolean);

    if (multilineChildren.length > 0) {
      const parts = await Promise.all(
        multilineChildren.map((child: RemLike) => richTextToSpeechText(plugin, child.text, config))
      );
      return parts.filter(Boolean).join(', ');
    }

    return directBack;
  } catch (error) {
    if (hasBackText) return directBack;
    throw error;
  }
}

export function cardShowsSemanticFrontFirst(cardType: CardTypeLike | undefined): boolean {
  return cardType === 'forward' || isClozeCard(cardType);
}

export async function getVisibleSideText(
  plugin: RNPlugin,
  contextRem: RemLike | undefined,
  cardType: CardTypeLike | undefined,
  config: SmartTTSConfig,
  answerRevealed: boolean
): Promise<string> {
  const front = await getSemanticFrontText(plugin, contextRem, cardType, config);
  const back = await getSemanticBackText(plugin, contextRem, cardType, config);
  const frontFirst = cardShowsSemanticFrontFirst(cardType);
  if (!answerRevealed) return frontFirst ? front : back;
  return frontFirst ? back : front;
}
