import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@components/button/Button';
import { Popover } from '@components/popover/Popover';
import { Search } from '@components/search/Search';
import { AppIcon, SystemIcon } from '@shared/icon';

import { emojis } from './emoji';
import './EmojiTray.css';

const SKIN_TONE_STORAGE_KEY = 'clutter-emoji-skin-tone';

const skinTones = [
  { tone: null, emoji: '👍', label: 'Default' },
  { tone: 1, emoji: '👍🏻', label: 'Light skin tone' },
  { tone: 2, emoji: '👍🏼', label: 'Medium-light skin tone' },
  { tone: 3, emoji: '👍🏽', label: 'Medium skin tone' },
  { tone: 4, emoji: '👍🏾', label: 'Medium-dark skin tone' },
  { tone: 5, emoji: '👍🏿', label: 'Dark skin tone' },
] as const;

type SkinTone = (typeof skinTones)[number]['tone'];

type EmojiCategory = {
  id: string;
  label: string;
  icon: SystemIcon;
  groups: number[];
};

const emojiCategories: EmojiCategory[] = [
  {
    id: 'people-emotion',
    label: 'People & Emotion',
    icon: 'smile',
    groups: [0, 1],
  },
  {
    id: 'animals-nature',
    label: 'Animals & Nature',
    icon: 'butterfly',
    groups: [3],
  },
  {
    id: 'food-drink',
    label: 'Food & Drink',
    icon: 'cherry',
    groups: [4],
  },
  {
    id: 'travel-places',
    label: 'Travel & Places',
    icon: 'car',
    groups: [5],
  },
  {
    id: 'activities',
    label: 'Activities',
    icon: 'giftBox',
    groups: [6],
  },
  {
    id: 'symbols',
    label: 'Symbols',
    icon: 'heart',
    groups: [7, 8],
  },
  {
    id: 'flags',
    label: 'Flags',
    icon: 'flag',
    groups: [9],
  },
];

function getStoredSkinTone(): SkinTone {
  const storedTone = localStorage.getItem(SKIN_TONE_STORAGE_KEY);

  if (!storedTone) {
    return null;
  }

  const tone = Number(storedTone);

  return tone >= 1 && tone <= 5 ? (tone as SkinTone) : null;
}

function getEmojiForTone(emoji: (typeof emojis)[number], tone: SkinTone) {
  if (tone === null || !emoji.skins) {
    return emoji.emoji;
  }

  return emoji.skins.find((skin) => skin.tone === tone)?.emoji ?? emoji.emoji;
}

interface EmojiTrayProps {
  onSelect: (emoji: string) => void;
  hasIcon?: boolean;
  onRemove?: () => void;
}

export function EmojiTray({
  onSelect,
  hasIcon = false,
  onRemove,
}: EmojiTrayProps) {
  const [query, setQuery] = useState('');
  const [preferredTone, setPreferredTone] =
    useState<SkinTone>(getStoredSkinTone);
  const [skinToneOpen, setSkinToneOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(
    emojiCategories[0]?.id ?? ''
  );

  const skinToneButtonRef = useRef<HTMLButtonElement>(null);
  const emojiGridRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const filteredEmojis = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return emojis.filter((emoji) => {
      if (emoji.label.startsWith('regional indicator')) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const label = emoji.label.toLowerCase();
      const tags = emoji.tags?.join(' ').toLowerCase() ?? '';

      return label.includes(normalizedQuery) || tags.includes(normalizedQuery);
    });
  }, [query]);

  const emojisByCategory = useMemo(() => {
    return emojiCategories.map((category) => ({
      ...category,
      emojis: filteredEmojis.filter((emoji) =>
        category.groups.includes(emoji.group ?? -1)
      ),
    }));
  }, [filteredEmojis]);

  useEffect(() => {
    const grid = emojiGridRef.current;

    if (!grid) {
      return;
    }

    const updateActiveCategory = () => {
      const gridTop = grid.getBoundingClientRect().top;
      let visibleCategory = emojiCategories[0]?.id ?? '';

      for (const category of emojiCategories) {
        const element = document.getElementById(
          `emoji-category-${category.id}`
        );

        if (!element) {
          continue;
        }

        const elementTop = element.getBoundingClientRect().top;

        if (elementTop <= gridTop + 8) {
          visibleCategory = category.id;
        } else {
          break;
        }
      }

      setActiveCategory(visibleCategory);
    };

    updateActiveCategory();

    grid.addEventListener('scroll', updateActiveCategory, { passive: true });

    return () => {
      grid.removeEventListener('scroll', updateActiveCategory);
    };
  }, [emojisByCategory]);

  const handleCategorySelect = (categoryId: string) => {
    setActiveCategory(categoryId);

    document.getElementById(`emoji-category-${categoryId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleToneChange = (tone: SkinTone) => {
    setPreferredTone(tone);
    setSkinToneOpen(false);

    if (tone === null) {
      localStorage.removeItem(SKIN_TONE_STORAGE_KEY);
    } else {
      localStorage.setItem(SKIN_TONE_STORAGE_KEY, String(tone));
    }
  };

  const handleEmojiSelect = (emoji: (typeof emojis)[number]) => {
    onSelect(getEmojiForTone(emoji, preferredTone));
  };

  const selectedSkinTone = skinTones.find(
    (skinTone) => skinTone.tone === preferredTone
  ) ?? {
    tone: null,
    emoji: '👍',
    label: 'Default',
  };

  return (
    <div className="emoji-tray">
      <div className="emoji-tray__header">
        <Search
          ref={searchRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search emoji"
        />

        <Button
          isIconOnly
          variant="outline-fill"
          aria-label="Remove icon"
          disabled={!hasIcon}
          onClick={onRemove}
        >
          <AppIcon icon="trash" />
        </Button>
      </div>

      <div ref={emojiGridRef} className="emoji-tray__grid">
        {emojisByCategory.flatMap((category) =>
          category.emojis.map((emoji, index) => (
            <button
              key={emoji.hexcode}
              id={index === 0 ? `emoji-category-${category.id}` : undefined}
              type="button"
              className="emoji-tray__item"
              aria-label={emoji.label}
              title={emoji.label}
              onClick={() => handleEmojiSelect(emoji)}
            >
              {getEmojiForTone(emoji, preferredTone)}
            </button>
          ))
        )}
      </div>

      <div className="emoji-tray__categories" aria-label="Emoji categories">
        {emojiCategories.map((category) => (
          <Button
            key={category.id}
            type="button"
            isIconOnly
            variant="ghost"
            isActive={activeCategory === category.id}
            aria-label={category.label}
            aria-pressed={activeCategory === category.id}
            onClick={() => handleCategorySelect(category.id)}
          >
            <AppIcon icon={category.icon} size={18} />
          </Button>
        ))}

        <Button
          ref={skinToneButtonRef}
          type="button"
          isIconOnly
          variant="ghost"
          aria-label="Skin tone"
          aria-expanded={skinToneOpen}
          onClick={() => setSkinToneOpen((open) => !open)}
        >
          {selectedSkinTone.emoji}
        </Button>

        <Popover
          anchorRef={skinToneButtonRef}
          open={skinToneOpen}
          onClose={() => setSkinToneOpen(false)}
          side="top"
          alignment="end"
          size="fit-content"
        >
          <div
            className="emoji-tray__skin-tones"
            aria-label="Preferred skin tone"
          >
            {skinTones.map((skinTone) => (
              <Button
                key={skinTone.tone ?? 'default'}
                type="button"
                isIconOnly
                variant="ghost"
                aria-label={skinTone.label}
                aria-pressed={preferredTone === skinTone.tone}
                onClick={() => handleToneChange(skinTone.tone)}
              >
                {skinTone.emoji}
              </Button>
            ))}
          </div>
        </Popover>
      </div>
    </div>
  );
}
