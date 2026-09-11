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

  const children = await contextRem.getChildrenRem();
  const cardItemFlags = await Promise.all((children || []).map((child: RemLike) => child.isCardItem()));
  const multilineChildren = (children || []).filter((_: RemLike, index: number) => cardItemFlags[index]);

  if (multilineChildren.length > 0) {
    const parts = await Promise.all(
      multilineChildren.map((child: RemLike) => richTextToSpeechText(plugin, child.text, config))
    );
    return parts.filter(Boolean).join(', ');
  }

  return richTextToSpeechText(plugin, contextRem.backText, config);
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
